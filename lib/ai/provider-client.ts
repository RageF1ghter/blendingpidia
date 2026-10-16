// Upstream provider adapter (server only). Sends one streaming completion
// request with the fixed endpoint/model from server policy and translates
// the provider SSE into the application event stream. Never logs keys,
// message content or upstream bodies.

import {
  type AiErrorCode,
  type AiProvider,
  type AppStreamEvent,
  type ProviderMessage,
  type ProviderToolCall,
} from './contracts';
import { providerEndpoints } from './server-policy';

type UpstreamChoiceDelta = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: {
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }[];
};

type UpstreamChunk = {
  choices?: { delta?: UpstreamChoiceDelta; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
};

type AggregatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type UpstreamFailure = {
  code: AiErrorCode;
  retryable: boolean;
  status?: number;
  /** Sanitized upstream error code (a short token like "1113"), never body text. */
  detail?: string;
};

export function mapUpstreamStatus(status: number): UpstreamFailure {
  if (status === 401 || status === 403) return { code: 'KEY_INVALID', retryable: false, status };
  if (status === 402) return { code: 'ACCOUNT_UNAVAILABLE', retryable: false, status };
  if (status === 429) return { code: 'UPSTREAM_RATE_LIMITED', retryable: true, status };
  // The provider rejected our request shape — most commonly a model id that
  // the account cannot use. Not the browser's protocol, and not retryable.
  if (status === 400 || status === 404 || status === 422) {
    return { code: 'PROVIDER_MISCONFIGURED', retryable: false, status };
  }
  return { code: 'UPSTREAM_UNAVAILABLE', retryable: true, status };
}

/**
 * Classifies an upstream error response by status plus, when the body is
 * JSON, the provider's machine-readable error code. GLM reports billing
 * problems as 429 with codes 1112 (arrears) / 1113 (low balance), which
 * must not be treated as a retryable rate limit.
 */
export async function readUpstreamFailure(response: Response): Promise<UpstreamFailure> {
  const base = mapUpstreamStatus(response.status);
  let upstreamCode: string | undefined;
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    if (typeof body?.error?.code === 'string' || typeof body?.error?.code === 'number') {
      upstreamCode = String(body.error.code);
    }
  } catch {
    // Non-JSON body: status mapping only.
  }
  if (response.status === 429 && (upstreamCode === '1112' || upstreamCode === '1113')) {
    return { code: 'ACCOUNT_UNAVAILABLE', retryable: false, status: 429, detail: upstreamCode };
  }
  return upstreamCode ? { ...base, detail: upstreamCode } : base;
}

export function buildUpstreamRequestBody(
  provider: AiProvider,
  systemMessage: string,
  messages: ProviderMessage[],
  tools: unknown,
) {
  return {
    model: providerEndpoints[provider].model,
    messages: [{ role: 'system', content: systemMessage }, ...messages],
    stream: true,
    tools,
  };
}

export async function fetchUpstream(
  provider: AiProvider,
  body: unknown,
  apiKey: string,
  signal: AbortSignal,
): Promise<{ ok: true; response: Response } | { ok: false; failure: UpstreamFailure }> {
  let response: Response;
  try {
    response = await fetch(providerEndpoints[provider].baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return { ok: false, failure: { code: 'REQUEST_ABORTED', retryable: false } };
    }
    return { ok: false, failure: { code: 'UPSTREAM_UNAVAILABLE', retryable: true } };
  }
  if (!response.ok) {
    return { ok: false, failure: await readUpstreamFailure(response) };
  }
  if (!response.body) {
    return { ok: false, failure: { code: 'UPSTREAM_UNAVAILABLE', retryable: true } };
  }
  return { ok: true, response };
}

export function failureEvent(failure: UpstreamFailure, requestId: string): AppStreamEvent {
  return {
    type: 'error',
    code: failure.code,
    retryable: failure.retryable,
    requestId,
  };
}

/**
 * Translates an upstream SSE body into the application SSE stream.
 * Tool-call arguments are aggregated by index across deltas and only
 * emitted when the upstream finished normally with JSON that parses.
 */
export function translateUpstreamStream(
  upstream: ReadableStream<Uint8Array>,
  events: { start: AppStreamEvent; requestId: string },
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let pendingText = '';
  let finishReason: 'stop' | 'tool_calls' | 'length' | 'aborted' | null = null;
  let sawDone = false;
  let usage: { promptTokens?: number; completionTokens?: number } | undefined;
  const toolCalls = new Map<number, AggregatedToolCall>();

  const emit = (controller: ReadableStreamDefaultController<Uint8Array>, event: AppStreamEvent) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      emit(controller, events.start);
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
            buffer = buffer.slice(newlineIndex + 1);
            consumeLine(line);
            newlineIndex = buffer.indexOf('\n');
          }
          if (sawDone) break;
        }
        finalize(controller);
      } catch {
        finishReason = finishReason ?? 'aborted';
        finalize(controller, true);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // stream already closed
        }
        controller.close();
      }
    },
  });

  function consumeLine(line: string) {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    if (payload === '[DONE]') {
      sawDone = true;
      return;
    }
    let chunk: UpstreamChunk;
    try {
      chunk = JSON.parse(payload) as UpstreamChunk;
    } catch {
      return;
    }
    if (chunk.usage) {
      usage = {
        promptTokens: chunk.usage.prompt_tokens,
        completionTokens: chunk.usage.completion_tokens,
      };
    }
    const choice = chunk.choices?.[0];
    if (!choice) return;
    const delta = choice.delta;
    if (delta?.content) pendingText += delta.content;
    if (delta?.tool_calls) {
      for (const fragment of delta.tool_calls) {
        const index = fragment.index ?? 0;
        const current = toolCalls.get(index) ?? { id: '', name: '', arguments: '' };
        if (fragment.id) current.id = fragment.id;
        if (fragment.function?.name) current.name = fragment.function.name;
        if (fragment.function?.arguments) current.arguments += fragment.function.arguments;
        toolCalls.set(index, current);
      }
    }
    if (choice.finish_reason === 'tool_calls') finishReason = 'tool_calls';
    else if (choice.finish_reason === 'length') finishReason = 'length';
    else if (choice.finish_reason === 'stop') finishReason = finishReason ?? 'stop';
  }

  function finalize(controller: ReadableStreamDefaultController<Uint8Array>, failed?: boolean) {
    if (pendingText) {
      emit(controller, { type: 'text_delta', text: pendingText });
      pendingText = '';
    }
    if (failed) {
      emit(controller, {
        type: 'error',
        code: 'UPSTREAM_UNAVAILABLE',
        retryable: true,
        requestId: events.requestId,
      });
      return;
    }
    if (finishReason === 'tool_calls') {
      const calls: ProviderToolCall[] = [...toolCalls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, call]) => ({
          id: call.id,
          type: 'function' as const,
          function: { name: call.name, arguments: call.arguments || '{}' },
        }))
        .filter((call) => call.id && call.function.name);
      const complete =
        calls.length > 0 &&
        calls.every((call) => {
          try {
            JSON.parse(call.function.arguments || '{}');
            return true;
          } catch {
            return false;
          }
        });
      // Truncated or malformed tool arguments never become proposals.
      if (complete) emit(controller, { type: 'tool_calls', calls });
    }
    if (usage) emit(controller, { type: 'usage', ...usage });
    emit(controller, { type: 'done', finishReason: finishReason ?? (sawDone ? 'stop' : 'aborted') });
  }
}
