'use client';

// Conversation controller: builds each turn from the latest local snapshot,
// streams the model response, dispatches tools in the browser, collects
// proposals, and drives per-proposal confirmation through the shared
// repository. Nothing here writes business data outside commitAiOperation.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  aiLimits,
  type AiErrorCode,
  type AiProvider,
  type AppStreamEvent,
  type ChatRequest,
  type ProviderMessage,
  type ProviderToolCall,
} from '@/lib/ai/contracts';
import {
  activeProviderKey,
  aiKeyChangeEvent,
  loadAiKeyConfig,
  type AiKeyConfig,
} from '@/lib/ai/key-storage';
import {
  appendChatMessage,
  clearChatMessages,
  loadChatMessages,
  newMessageId,
  type StoredChatMessage,
} from '@/lib/ai/chat-storage';
import { buildLocalSnapshot, SnapshotTooLargeError } from '@/lib/ai/context';
import { dispatchToolCalls } from '@/lib/ai/tool-dispatcher';
import { buildModelHistory } from '@/lib/ai/history';
import type { OperationProposal, ProposalOutcome } from '@/lib/ai/operations';
import { commitAiOperation, loadBusinessState } from '@/lib/app-storage-repository';
import { appStorageChangeEvent } from '@/lib/ingredient-storage';
import { storageKey } from '@/lib/data';

export type AssistantTurnStatus = 'idle' | 'preparing' | 'streaming' | 'resolving_tools';
export type AssistantError = {
  code: AiErrorCode;
  retryable: boolean;
  provider?: AiProvider;
  /** Sanitized upstream code (e.g. GLM "1113") for account/rate diagnosis. */
  detail?: string;
};

type StreamResult =
  | { kind: 'complete' }
  | { kind: 'error'; code: AiErrorCode; retryable: boolean; detail?: string }
  | { kind: 'aborted' };

async function streamChat(
  request: ChatRequest,
  apiKey: string,
  signal: AbortSignal,
  onEvent: (event: AppStreamEvent) => void,
): Promise<StreamResult> {
  let response: Response;
  try {
    response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return { kind: 'aborted' };
    }
    return { kind: 'error', code: 'UPSTREAM_UNAVAILABLE', retryable: true };
  }
  if (!response.ok || !response.body) {
    let code: AiErrorCode = 'UPSTREAM_UNAVAILABLE';
    let retryable = false;
    let detail: string | undefined;
    try {
      const data = (await response.json()) as {
        error?: { code?: AiErrorCode; retryable?: boolean; detail?: string };
      };
      code = data.error?.code ?? code;
      retryable = Boolean(data.error?.retryable);
      detail = data.error?.detail;
    } catch {
      // non-JSON error body: keep the defaults
    }
    return { kind: 'error', code, retryable, detail };
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    return { kind: 'error', code: 'UPSTREAM_UNAVAILABLE', retryable: true };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        const chunk = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            onEvent(JSON.parse(payload) as AppStreamEvent);
          } catch {
            // skip malformed frame
          }
        }
        separator = buffer.indexOf('\n\n');
      }
    }
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return { kind: 'aborted' };
    }
    return { kind: 'error', code: 'UPSTREAM_UNAVAILABLE', retryable: true };
  }
  return { kind: 'complete' };
}

export function useAiAssistant(lang: 'zh' | 'en') {
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<AssistantTurnStatus>('idle');
  const [error, setError] = useState<AssistantError | null>(null);
  const [proposals, setProposals] = useState<OperationProposal[]>([]);
  const [keyConfig, setKeyConfig] = useState<AiKeyConfig | null>(null);
  const [keyStorageFailed, setKeyStorageFailed] = useState(false);
  const [chatStorageFailed, setChatStorageFailed] = useState(false);
  const [dataChangedNotice, setDataChangedNotice] = useState(false);
  const [confirmingProposalId, setConfirmingProposalId] = useState<string | null>(null);

  const messagesRef = useRef<StoredChatMessage[]>([]);
  const statusRef = useRef<AssistantTurnStatus>('idle');
  const epochRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const outcomesRef = useRef(new Map<string, ProposalOutcome>());
  const currentTurnRef = useRef<string | null>(null);

  // statusRef must change in the same synchronous step as status: the send
  // loop reads it before React commits a re-render.
  const applyStatus = useCallback((next: AssistantTurnStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const reloadKeyConfig = useCallback(() => {
    const loaded = loadAiKeyConfig();
    if (loaded.ok) {
      setKeyConfig(loaded.config);
      setKeyStorageFailed(false);
    } else {
      setKeyStorageFailed(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadChatMessages().then((loaded) => {
      if (!active) return;
      reloadKeyConfig();
      if (loaded === null) setChatStorageFailed(true);
      else {
        messagesRef.current = loaded;
        setMessages(loaded);
      }
    });
    const onKeyChange = () => reloadKeyConfig();
    window.addEventListener(aiKeyChangeEvent, onKeyChange);
    return () => {
      active = false;
      window.removeEventListener(aiKeyChangeEvent, onKeyChange);
      abortRef.current?.abort();
    };
  }, [reloadKeyConfig]);

  // Any business-data change during a generation cancels the turn and
  // invalidates proposals built on the stale snapshot.
  useEffect(() => {
    const handle = () => {
      if (statusRef.current !== 'idle') {
        abortRef.current?.abort();
        setDataChangedNotice(true);
        setProposals((current) =>
          current.map((proposal) =>
            proposal.turnId === currentTurnRef.current && proposal.status === 'awaiting_confirmation'
              ? { ...proposal, status: 'stale', errorCode: 'DATA_CHANGED' }
              : proposal,
          ),
        );
      }
    };
    const storageHandler = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) handle();
    };
    window.addEventListener(appStorageChangeEvent, handle);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(appStorageChangeEvent, handle);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  const persistMessage = useCallback((message: StoredChatMessage) => {
    const epoch = epochRef.current;
    // The ref is the turn's synchronous source of truth: buildModelHistory
    // runs between React commits, so state alone would lag one round behind.
    messagesRef.current = [...messagesRef.current, message];
    setMessages(messagesRef.current);
    void appendChatMessage(message).then((saved) => {
      if (epoch !== epochRef.current) return;
      if (!saved) setChatStorageFailed(true);
    });
  }, []);

  const patchProposal = useCallback((proposalId: string, patch: Partial<OperationProposal>) => {
    setProposals((current) =>
      current.map((proposal) => (proposal.proposalId === proposalId ? { ...proposal, ...patch } : proposal)),
    );
  }, []);

  /** Model-visible history: bounded recent complete rounds, with confirmed
   * proposal outcomes substituted into their original tool results and
   * dangling tool calls repaired. */
  const historyForRequest = useCallback(
    (): ProviderMessage[] =>
      buildModelHistory(
        messagesRef.current,
        (proposalId) => outcomesRef.current.get(proposalId),
        aiLimits.maxHistoryMessages,
      ),
    [],
  );

  async function send(text: string) {
    {
      const trimmed = text.trim().slice(0, aiLimits.maxMessageChars);
      if (!trimmed || statusRef.current !== 'idle') return;
      setError(null);
      setDataChangedNotice(false);

      const loadedKeys = loadAiKeyConfig();
      if (!loadedKeys.ok) {
        setKeyStorageFailed(true);
        setError({ code: 'STORAGE_UNAVAILABLE', retryable: false });
        return;
      }
      const config = loadedKeys.config;
      const apiKey = activeProviderKey(config);
      if (!apiKey) {
        setError({ code: 'KEY_REQUIRED', retryable: false, provider: config.provider });
        return;
      }

      const loadedState = loadBusinessState();
      if (!loadedState.ok) {
        setError({ code: loadedState.reason === 'invalid' ? 'STORAGE_INVALID' : 'STORAGE_UNAVAILABLE', retryable: false });
        return;
      }
      let snapshot;
      try {
        snapshot = buildLocalSnapshot(loadedState.state);
      } catch (snapshotError) {
        if (snapshotError instanceof SnapshotTooLargeError) {
          setError({ code: 'CONTEXT_LIMIT', retryable: false });
        } else {
          setError({ code: 'STORAGE_INVALID', retryable: false });
        }
        return;
      }

      const turnId = newMessageId();
      currentTurnRef.current = turnId;
      persistMessage({
        id: newMessageId(),
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      });
      applyStatus('preparing');

      const turnProposals = new Map<string, OperationProposal>();
      let rounds = 0;
      let aborted = false;
      let failure: AssistantError | null = null;
      let lastText = '';

      try {
        while (rounds < aiLimits.maxToolRounds) {
          const controller = new AbortController();
          abortRef.current = controller;
          applyStatus('streaming');
          let text = '';
          let toolCalls: ProviderToolCall[] | null = null;
          let truncated = false;

          const result = await streamChat(
            {
              schemaVersion: 1,
              requestId: newMessageId(),
              turnId,
              lang,
              provider: config.provider,
              snapshot: snapshot.toRequest(),
              messages: historyForRequest(),
            },
            apiKey,
            controller.signal,
            (event) => {
              if (event.type === 'text_delta') {
                text += event.text;
                setDraft(text);
              } else if (event.type === 'tool_calls') {
                toolCalls = event.calls;
              } else if (event.type === 'done' && event.finishReason === 'length') {
                truncated = true;
              } else if (event.type === 'error') {
                failure = { code: event.code, retryable: event.retryable, provider: config.provider };
              }
            },
          );
          abortRef.current = null;
          lastText = text;

          if (result.kind === 'aborted') {
            aborted = true;
            break;
          }
          if (result.kind === 'error') {
            failure = failure ?? {
              code: result.code,
              retryable: result.retryable,
              provider: config.provider,
              ...(result.detail ? { detail: result.detail } : {}),
            };
            break;
          }
          if (failure) break;

          if (toolCalls) {
            persistMessage({
              id: newMessageId(),
              role: 'assistant',
              content: text,
              createdAt: new Date().toISOString(),
              toolCalls: toolCalls,
            });
            setDraft('');
            applyStatus('resolving_tools');
            const outcomes = await dispatchToolCalls(toolCalls, {
              snapshot,
              turnId,
              proposals: turnProposals,
            });
            for (const [callId, outcome] of outcomes) {
              persistMessage({
                id: newMessageId(),
                role: 'tool',
                content: JSON.stringify(outcome.status === 'ok' ? outcome.result : { error: outcome.error, candidates: outcome.candidates }),
                createdAt: new Date().toISOString(),
                toolCallId: callId,
              });
            }
            if (turnProposals.size > 0) {
              setProposals((current) => [...current, ...turnProposals.values()]);
            }
            rounds += 1;
            lastText = '';
            continue;
          }

          persistMessage({
            id: newMessageId(),
            role: 'assistant',
            content: truncated ? `${text}\n\n[truncated]` : text,
            createdAt: new Date().toISOString(),
            provider: config.provider,
          });
          setDraft('');
          break;
        }
        if (rounds >= aiLimits.maxToolRounds) {
          persistMessage({
            id: newMessageId(),
            role: 'assistant',
            kind: 'notice',
            content: '[tool-round-limit]',
            createdAt: new Date().toISOString(),
          });
        }
      } finally {
        applyStatus('idle');
        setDraft('');
        abortRef.current = null;
      }

      if (aborted || failure) {
        // Keep whatever text arrived; never present partial tool calls as complete.
        if (lastText) {
          persistMessage({
            id: newMessageId(),
            role: 'assistant',
            content: aborted ? `${lastText}\n\n[stopped]` : lastText,
            createdAt: new Date().toISOString(),
          });
        }
        if (failure) setError(failure);
        if (aborted) {
          setProposals((current) =>
            current.map((proposal) =>
              proposal.turnId === turnId && proposal.status === 'awaiting_confirmation'
                ? { ...proposal, status: 'stale', errorCode: 'STOPPED' }
                : proposal,
            ),
          );
        }
      }
    }
  }

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearChat = useCallback(async () => {
    epochRef.current += 1;
    abortRef.current?.abort();
    setProposals((current) =>
      current.map((proposal) =>
        proposal.status === 'awaiting_confirmation' || proposal.status === 'committing'
          ? { ...proposal, status: 'cancelled' }
          : proposal,
      ),
    );
    messagesRef.current = [];
    setMessages([]);
    setDraft('');
    setError(null);
    setDataChangedNotice(false);
    const cleared = await clearChatMessages();
    if (!cleared) setChatStorageFailed(true);
  }, []);

  const confirmProposal = useCallback(
    async (proposalId: string) => {
      const proposal = proposals.find((item) => item.proposalId === proposalId);
      if (!proposal || proposal.status !== 'awaiting_confirmation') return;
      setConfirmingProposalId(proposalId);
      patchProposal(proposalId, { status: 'committing' });
      const result = await commitAiOperation(proposal.operation);
      setConfirmingProposalId(null);
      if (result.ok) {
        outcomesRef.current.set(proposalId, {
          status: 'committed',
          committedAt: result.receipt.committedAt,
          replayed: result.replayed,
        });
        patchProposal(proposalId, {
          status: 'committed',
          committedAt: result.receipt.committedAt,
          errorCode: result.replayed ? 'REPLAYED' : undefined,
        });
      } else {
        if (result.code === 'STALE_PROPOSAL') {
          outcomesRef.current.set(proposalId, { status: 'failed', code: result.code });
          patchProposal(proposalId, { status: 'stale', errorCode: result.code, errorDetail: result.detail });
        } else {
          outcomesRef.current.set(proposalId, { status: 'failed', code: result.code });
          patchProposal(proposalId, { status: 'failed', errorCode: result.code, errorDetail: result.detail });
        }
      }
    },
    [patchProposal, proposals],
  );

  const cancelProposal = useCallback(
    (proposalId: string) => {
      const proposal = proposals.find((item) => item.proposalId === proposalId);
      if (!proposal || proposal.status !== 'awaiting_confirmation') return;
      outcomesRef.current.set(proposalId, { status: 'cancelled' });
      patchProposal(proposalId, { status: 'cancelled' });
    },
    [patchProposal, proposals],
  );

  const activeProvider: AiProvider | null = keyConfig?.provider ?? null;

  return {
    messages,
    draft,
    status,
    error,
    proposals,
    keyConfig,
    keyStorageFailed,
    chatStorageFailed,
    dataChangedNotice,
    confirmingProposalId,
    activeProvider,
    reloadKeyConfig,
    send,
    stop,
    clearChat,
    confirmProposal,
    cancelProposal,
  };
}
