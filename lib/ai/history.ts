// Pure builder for the model-visible conversation history: bounded recent
// complete rounds, confirmed-proposal outcomes substituted into their
// original tool results, and dangling tool calls repaired so the request
// always satisfies the tool_calls/tool pairing protocol.

import type { ProviderMessage } from './contracts';
import type { StoredChatMessage } from './chat-storage';
import type { ProposalOutcome } from './operations';

export type HistoryOutcomeLookup = (proposalId: string) => ProposalOutcome | undefined;

function outcomeSubstituted(content: string, lookup: HistoryOutcomeLookup): string {
  try {
    const parsed = JSON.parse(content) as { proposalId?: string; status?: string };
    if (parsed?.proposalId) {
      const outcome = lookup(parsed.proposalId);
      if (outcome) return JSON.stringify({ ...parsed, ...outcome });
    }
  } catch {
    // not a JSON tool result
  }
  return content;
}

export function buildModelHistory(
  messages: StoredChatMessage[],
  outcomeFor: HistoryOutcomeLookup,
  maxMessages: number,
): ProviderMessage[] {
  const eligible = messages.filter(
    (message) =>
      message.kind !== 'notice' &&
      (message.role === 'user' || message.role === 'assistant' || message.role === 'tool'),
  );
  const windowed = eligible.slice(-maxMessages);
  const firstUser = windowed.findIndex((message) => message.role === 'user');
  const bounded = firstUser === -1 ? windowed : windowed.slice(firstUser);

  const built: ProviderMessage[] = [];
  // tool_call ids emitted by assistant messages that still need a result
  // before the next user/assistant message may appear.
  const pending = new Set<string>();
  for (const message of bounded) {
    if (message.role === 'user') {
      if (pending.size > 0) {
        // A stored history can end a chain mid-round (page closed during
        // tool execution). Synthesize honest interrupted results instead of
        // sending a protocol-violating request.
        for (const id of pending) {
          built.push({ role: 'tool', tool_call_id: id, content: JSON.stringify({ error: 'interrupted' }) });
        }
        pending.clear();
      }
      built.push({ role: 'user', content: message.content });
      continue;
    }
    if (message.role === 'assistant') {
      if (pending.size > 0) {
        for (const id of pending) {
          built.push({ role: 'tool', tool_call_id: id, content: JSON.stringify({ error: 'interrupted' }) });
        }
        pending.clear();
      }
      built.push({
        role: 'assistant',
        content: message.content || null,
        ...(message.toolCalls ? { tool_calls: message.toolCalls } : {}),
      });
      if (message.toolCalls) {
        for (const call of message.toolCalls) pending.add(call.id);
      }
      continue;
    }
    // tool result: only meaningful while its call is pending; duplicates or
    // orphaned results are dropped.
    if (message.toolCallId && pending.has(message.toolCallId)) {
      pending.delete(message.toolCallId);
      built.push({
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: outcomeSubstituted(message.content, outcomeFor),
      });
    }
  }
  if (pending.size > 0) {
    for (const id of pending) {
      built.push({ role: 'tool', tool_call_id: id, content: JSON.stringify({ error: 'interrupted' }) });
    }
  }
  return built;
}
