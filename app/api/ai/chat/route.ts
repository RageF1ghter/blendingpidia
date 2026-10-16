// Single-turn AI chat gateway. Same-origin only; the user's provider key
// rides in the Authorization header and is used once for the upstream call.
// The browser drives the tool loop, so each request performs exactly one
// upstream completion. No keys, messages or upstream bodies are logged.

import {
  aiLimits,
  isAiProvider,
  type AiErrorCode,
  type AppStreamEvent,
} from '@/lib/ai/contracts';
import {
  buildSystemMessage,
  validateChatRequest,
} from '@/lib/ai/server-policy';
import {
  buildUpstreamRequestBody,
  fetchUpstream,
  translateUpstreamStream,
  type UpstreamFailure,
} from '@/lib/ai/provider-client';
import { aiToolDefinitions } from '@/lib/ai/tools';

export const runtime = 'edge';

function jsonError(
  code: AiErrorCode,
  retryable: boolean,
  requestId: string,
  status: number,
  detail?: string,
) {
  return Response.json(
    { error: { code, retryable, ...(detail ? { detail } : {}) }, requestId },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) {
    return jsonError('INVALID_PROTOCOL', false, 'origin', 403);
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return jsonError('INVALID_PROTOCOL', false, 'origin', 403);
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return jsonError('INVALID_PROTOCOL', false, 'content-type', 415);
  }

  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  const apiKey = match ? match[1].trim() : '';
  if (!apiKey || apiKey.length > 256) {
    return jsonError('KEY_REQUIRED', false, 'auth', 401);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return jsonError('INVALID_PROTOCOL', false, 'body', 400);
  }
  if (raw.length > aiLimits.maxRequestBodyChars) {
    return jsonError('CONTEXT_LIMIT', false, 'body-size', 413);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return jsonError('INVALID_PROTOCOL', false, 'json', 400);
  }

  const validation = validateChatRequest(parsed);
  if (!validation.ok) {
    return jsonError(validation.code, false, validation.detail, 400);
  }
  const chatRequest = validation.value;
  if (!isAiProvider(chatRequest.provider)) {
    return jsonError('INVALID_PROTOCOL', false, 'provider', 400);
  }

  const systemMessage = buildSystemMessage(chatRequest);
  const upstreamBody = buildUpstreamRequestBody(
    chatRequest.provider,
    systemMessage,
    chatRequest.messages,
    aiToolDefinitions,
  );

  const upstream = await fetchUpstream(chatRequest.provider, upstreamBody, apiKey, request.signal);
  if (!upstream.ok) {
    const failure: UpstreamFailure = upstream.failure;
    return jsonError(
      failure.code,
      failure.retryable,
      chatRequest.requestId,
      failure.status ?? 502,
      failure.detail,
    );
  }
  if (!upstream.response.body) {
    return jsonError('UPSTREAM_UNAVAILABLE', true, chatRequest.requestId, 502);
  }

  const start: AppStreamEvent = {
    type: 'start',
    requestId: chatRequest.requestId,
    turnId: chatRequest.turnId,
    snapshotVersion: chatRequest.snapshot.version,
  };
  const stream = translateUpstreamStream(upstream.response.body, {
    start,
    requestId: chatRequest.requestId,
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function GET() {
  return jsonError('INVALID_PROTOCOL', false, 'method', 405);
}
