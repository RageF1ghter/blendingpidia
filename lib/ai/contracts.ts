// Shared types for the AI assistant. Pure declarations only: imported by
// browser code, the API route and lib/ingredient-storage (receipt type).

export type AiProvider = 'deepseek' | 'glm';

export const aiProviders: AiProvider[] = ['deepseek', 'glm'];

export function isAiProvider(value: unknown): value is AiProvider {
  return value === 'deepseek' || value === 'glm';
}

/** Messages exchanged with the model upstream, OpenAI-compatible shape. */
export type ProviderMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ProviderToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type ProviderToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type StockFact = {
  id: string;
  nameEn: string;
  nameZh: string;
  category: string;
};

export type ContextCoverage = {
  stockComplete: boolean;
  stockCount: number;
  customRecipeCount: number;
  builtInRecipeCount: number;
  migrationIssueCount: number;
};

export type ChatRequestSnapshot = {
  version: string;
  capturedAt: string;
  stock: StockFact[];
  coverage: ContextCoverage;
};

export type ChatRequest = {
  schemaVersion: 1;
  requestId: string;
  turnId: string;
  lang: 'zh' | 'en';
  provider: AiProvider;
  snapshot: ChatRequestSnapshot;
  messages: ProviderMessage[];
};

/** Application SSE events emitted by POST /api/ai/chat. */
export type AppStreamEvent =
  | { type: 'start'; requestId: string; turnId: string; snapshotVersion: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_calls'; calls: ProviderToolCall[] }
  | { type: 'usage'; promptTokens?: number; completionTokens?: number }
  | { type: 'done'; finishReason: 'stop' | 'tool_calls' | 'length' | 'aborted' }
  | {
      type: 'error';
      code: AiErrorCode;
      retryable: boolean;
      requestId: string;
      message?: string;
    };

export type AiErrorCode =
  | 'KEY_REQUIRED'
  | 'KEY_INVALID'
  | 'ACCOUNT_UNAVAILABLE'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'CONTEXT_LIMIT'
  | 'INVALID_PROTOCOL'
  | 'REQUEST_ABORTED'
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_INVALID'
  | 'STALE_PROPOSAL'
  | 'INVALID_OPERATION'
  | 'LOCKS_UNAVAILABLE'
  | 'CHAT_STORAGE_UNAVAILABLE'
  | 'PROVIDER_MISCONFIGURED';

export const retryableErrorCodes = new Set<AiErrorCode>([
  'UPSTREAM_RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
]);

export function isRetryableError(code: AiErrorCode) {
  return retryableErrorCodes.has(code);
}

export type OperationKind =
  | 'createRecipe'
  | 'updateRecipe'
  | 'setStock'
  | 'createIngredient'
  | 'archiveIngredient';

export type OperationReceipt = {
  operationId: string;
  payloadHash: string;
  kind: OperationKind;
  targetId: string;
  committedAt: string;
  resultingFingerprint: string;
};

export const maxOperationReceipts = 500;

/** Read-only and proposal tool names shared by server policy and dispatcher. */
export const readOnlyToolNames = [
  'list_stock',
  'search_recipes',
  'read_recipe',
] as const;

export const proposalToolNames = [
  'propose_create_recipe',
  'propose_update_recipe',
  'propose_set_stock',
  'propose_create_ingredient',
  'propose_archive_ingredient',
] as const;

export type ReadOnlyToolName = (typeof readOnlyToolNames)[number];
export type ProposalToolName = (typeof proposalToolNames)[number];
export type ToolName = ReadOnlyToolName | ProposalToolName;

/** Central limits; values are first-pass defaults pending real measurement. */
export const aiLimits = {
  maxToolRounds: 8,
  maxHistoryMessages: 40,
  maxStockFacts: 400,
  maxSearchPageSize: 8,
  maxMessageChars: 16_000,
  maxRequestBodyChars: 400_000,
};
