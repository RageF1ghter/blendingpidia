// Server-side policy for the AI gateway: provider endpoints and models,
// the system prompt (only the server may define one), and strict request
// protocol validation. Imported only by the API route.

import {
  aiLimits,
  isAiProvider,
  type AiProvider,
  type ChatRequest,
  type ProviderMessage,
  type ProviderToolCall,
} from './contracts';

export type ProviderEndpoint = {
  baseUrl: string;
  model: string;
  extraBody?: Record<string, unknown>;
};

// Model choices are deployment configuration, not client input. Verify the
// account's available models before production use (PRD Q-005 stays open).
export const providerEndpoints: Record<AiProvider, ProviderEndpoint> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-flash',
  },
  glm: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4.6',
  },
};

export function buildSystemMessage(request: ChatRequest): string {
  const { snapshot } = request;
  const stockLines = snapshot.stock.length
    ? snapshot.stock.map((item) => `- ${item.nameEn} / ${item.nameZh} [${item.category}]`).join('\n')
    : '- (empty stock)';
  const language = request.lang === 'zh' ? 'Chinese (Simplified)' : 'English';
  return [
    'You are the AI bartending assistant inside the BlendingPidia cocktail encyclopedia web app.',
    `Reply in ${language}.`,
    '',
    `CURRENT LOCAL DATA for this turn (authoritative; snapshot ${snapshot.version}):`,
    `Stock (presence only, no amounts), ${snapshot.coverage.stockCount} items:`,
    stockLines,
    `Custom recipes: ${snapshot.coverage.customRecipeCount}; built-in recipes: ${snapshot.coverage.builtInRecipeCount}; unresolved legacy stock entries: ${snapshot.coverage.migrationIssueCount}.`,
    snapshot.coverage.stockComplete ? '' : 'Stock is INCOMPLETE due to unresolved legacy entries; say so when recommending.',
    '',
    'Rules:',
    '1. Use the read-only tools for facts. Before quoting a built-in recipe\'s exact measures or steps, call read_recipe; if details are unavailable, say so instead of inventing them.',
    '2. Current stock exists only in CURRENT DATA above or via list_stock. Never treat ingredients mentioned earlier in the conversation as in stock now.',
    '3. Any change to recipes, stock or ingredients MUST go through a propose_* tool call, which produces a preview. You never write data directly, and nothing is saved until the user confirms each preview separately. Deletion is not supported.',
    '4. Never claim a change is saved or done; say it awaits the user\'s confirmation, and report the confirmation result only when the app tells you in a later message.',
    '5. Distinguish app catalog recipes from AI-created content. After reading a recipe, cite it as recipe:<recipeId>.',
    '6. Ingredient substitutes must be marked as suggestions, not as catalog data.',
    '7. One tool call proposes one change. For several changes, make several proposals; the user confirms them one by one.',
    '8. If asked to delete data or analyze images, explain that this is not supported.',
  ].join('\n');
}

export type RequestValidation =
  | { ok: true; value: ChatRequest }
  | { ok: false; code: 'INVALID_PROTOCOL' | 'CONTEXT_LIMIT'; detail: string };

function asString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  return value.length <= max ? value : null;
}

function isValidToolCall(value: unknown): value is ProviderToolCall {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const fn = record.function as Record<string, unknown> | undefined;
  return (
    typeof record.id === 'string' &&
    record.id.length <= 128 &&
    record.type === 'function' &&
    Boolean(fn) &&
    typeof fn?.name === 'string' &&
    fn.name.length <= 64 &&
    typeof fn?.arguments === 'string' &&
    fn.arguments.length <= 32_000
  );
}

export function validateChatRequest(body: unknown): RequestValidation {
  if (!body || typeof body !== 'object') {
    return { ok: false, code: 'INVALID_PROTOCOL', detail: 'body-not-object' };
  }
  const record = body as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    return { ok: false, code: 'INVALID_PROTOCOL', detail: 'schema-version' };
  }
  if (!isAiProvider(record.provider)) {
    return { ok: false, code: 'INVALID_PROTOCOL', detail: 'provider' };
  }
  if (record.lang !== 'zh' && record.lang !== 'en') {
    return { ok: false, code: 'INVALID_PROTOCOL', detail: 'lang' };
  }
  const requestId = asString(record.requestId, 64);
  const turnId = asString(record.turnId, 64);
  if (!requestId || !turnId) {
    return { ok: false, code: 'INVALID_PROTOCOL', detail: 'request-or-turn-id' };
  }

  const snapshot = record.snapshot as Record<string, unknown> | undefined;
  if (!snapshot || typeof snapshot !== 'object') {
    return { ok: false, code: 'INVALID_PROTOCOL', detail: 'snapshot' };
  }
  if (!asString(snapshot.version, 128) || typeof snapshot.capturedAt !== 'string') {
    return { ok: false, code: 'INVALID_PROTOCOL', detail: 'snapshot-meta' };
  }
  if (!Array.isArray(snapshot.stock) || snapshot.stock.length > aiLimits.maxStockFacts) {
    return { ok: false, code: 'CONTEXT_LIMIT', detail: 'stock-size' };
  }
  for (const item of snapshot.stock) {
    const fact = item as Record<string, unknown>;
    if (
      typeof fact?.id !== 'string' ||
      typeof fact.nameEn !== 'string' ||
      typeof fact.nameZh !== 'string' ||
      typeof fact.category !== 'string'
    ) {
      return { ok: false, code: 'INVALID_PROTOCOL', detail: 'stock-item' };
    }
  }
  const coverage = snapshot.coverage as Record<string, unknown> | undefined;
  if (!coverage || ['stockComplete', 'stockCount', 'customRecipeCount', 'builtInRecipeCount', 'migrationIssueCount'].some(
    (key) => typeof coverage[key] !== 'number' && typeof coverage[key] !== 'boolean',
  )) {
    return { ok: false, code: 'INVALID_PROTOCOL', detail: 'coverage' };
  }

  if (!Array.isArray(record.messages) || record.messages.length === 0 || record.messages.length > 400) {
    return { ok: false, code: 'INVALID_PROTOCOL', detail: 'messages' };
  }
  const messages: ProviderMessage[] = [];
  const pendingToolCalls = new Set<string>();
  for (const entry of record.messages) {
    const message = entry as Record<string, unknown>;
    if (message.role === 'user') {
      const content = asString(message.content, aiLimits.maxMessageChars);
      if (content === null) return { ok: false, code: 'INVALID_PROTOCOL', detail: 'user-content' };
      if (pendingToolCalls.size > 0) return { ok: false, code: 'INVALID_PROTOCOL', detail: 'unanswered-tool-calls' };
      messages.push({ role: 'user', content });
      continue;
    }
    if (message.role === 'assistant') {
      const content =
        message.content === null ? null : asString(message.content, aiLimits.maxMessageChars);
      if (content === null && message.content !== null) {
        return { ok: false, code: 'INVALID_PROTOCOL', detail: 'assistant-content' };
      }
      if (message.tool_calls === undefined) {
        messages.push({ role: 'assistant', content });
        continue;
      }
      if (!Array.isArray(message.tool_calls) || message.tool_calls.length === 0 || message.tool_calls.length > 8) {
        return { ok: false, code: 'INVALID_PROTOCOL', detail: 'assistant-tool-calls' };
      }
      if (!message.tool_calls.every(isValidToolCall)) {
        return { ok: false, code: 'INVALID_PROTOCOL', detail: 'assistant-tool-call-shape' };
      }
      const toolCalls = message.tool_calls as ProviderToolCall[];
      for (const call of toolCalls) {
        if (pendingToolCalls.has(call.id)) return { ok: false, code: 'INVALID_PROTOCOL', detail: 'duplicate-tool-call-id' };
        pendingToolCalls.add(call.id);
      }
      messages.push({ role: 'assistant', content, tool_calls: toolCalls });
      continue;
    }
    if (message.role === 'tool') {
      const toolCallId = asString(message.tool_call_id, 128);
      const content = asString(message.content, 32_000);
      if (!toolCallId || content === null) {
        return { ok: false, code: 'INVALID_PROTOCOL', detail: 'tool-message' };
      }
      if (!pendingToolCalls.has(toolCallId)) {
        return { ok: false, code: 'INVALID_PROTOCOL', detail: 'orphan-tool-result' };
      }
      pendingToolCalls.delete(toolCallId);
      messages.push({ role: 'tool', tool_call_id: toolCallId, content });
      continue;
    }
    return { ok: false, code: 'INVALID_PROTOCOL', detail: 'role' };
  }
  if (pendingToolCalls.size > 0) {
    return { ok: false, code: 'INVALID_PROTOCOL', detail: 'unanswered-tool-calls' };
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      requestId,
      turnId,
      lang: record.lang,
      provider: record.provider,
      snapshot: {
        version: snapshot.version as string,
        capturedAt: snapshot.capturedAt as string,
        stock: snapshot.stock as ChatRequest['snapshot']['stock'],
        coverage: coverage as ChatRequest['snapshot']['coverage'],
      },
      messages,
    },
  };
}
