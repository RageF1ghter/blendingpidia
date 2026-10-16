import { baseCocktails, initialStock, storageKey, type Cocktail } from './data';
import {
  buildIngredientRegistry,
  builtInIngredientId,
  findManagedIngredients,
  isTrackedIngredient,
  type ManagedIngredient,
} from './ingredient-registry';
import { maxOperationReceipts, type OperationReceipt } from './ai/contracts';

export type IngredientMigrationIssue = {
  id: string;
  kind: 'legacy-stock-name' | 'stock-id';
  value: string;
  reason: 'unknown' | 'ambiguous' | 'untracked' | 'archived' | 'deleted';
  candidates: string[];
};

export type AppStorageState = {
  stockIds: string[];
  ingredients: ManagedIngredient[];
  liked: string[];
  customRecipes: Cocktail[];
  migrationIssues: IngredientMigrationIssue[];
  legacyStockBackup: string[];
  /** Idempotency receipts for confirmed AI operations; absent in older data. */
  aiOperationReceipts?: OperationReceipt[];
};

export type AppStorageLoadResult =
  | { ok: true; state: AppStorageState; needsPersist: boolean }
  | { ok: false; reason: 'unavailable' | 'invalid' };

export const appStorageChangeEvent = 'blendingpidia:storage-changed';

type SavedObject = Record<string, unknown>;

function isSavedObject(value: unknown): value is SavedObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeIssueValue(value: string) {
  return value.trim().normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

function createIssue(
  kind: IngredientMigrationIssue['kind'],
  value: string,
  reason: IngredientMigrationIssue['reason'],
  candidates: string[] = [],
): IngredientMigrationIssue {
  return {
    id: `${kind}:${normalizeIssueValue(value)}`,
    kind,
    value,
    reason,
    candidates,
  };
}

function resolveLegacyStockName(value: string, registry: ManagedIngredient[]) {
  const matches = findManagedIngredients(value, registry);
  if (matches.length === 0) return { issue: createIssue('legacy-stock-name', value, 'unknown') };
  if (matches.length > 1) return { issue: createIssue('legacy-stock-name', value, 'ambiguous', matches.map((item) => item.id)) };

  const ingredient = matches[0];
  if (ingredient.deleted) return { issue: createIssue('legacy-stock-name', value, 'deleted', [ingredient.id]) };
  if (ingredient.archived) return { issue: createIssue('legacy-stock-name', value, 'archived', [ingredient.id]) };
  if (!isTrackedIngredient(ingredient.nameEn, registry)) return { issue: createIssue('legacy-stock-name', value, 'untracked', [ingredient.id]) };
  return { ingredient };
}

function isMigrationIssue(value: unknown): value is IngredientMigrationIssue {
  if (!isSavedObject(value)) return false;
  return typeof value.id === 'string'
    && (value.kind === 'legacy-stock-name' || value.kind === 'stock-id')
    && typeof value.value === 'string'
    && ['unknown', 'ambiguous', 'untracked', 'archived', 'deleted'].includes(String(value.reason))
    && Array.isArray(value.candidates)
    && value.candidates.every((candidate) => typeof candidate === 'string');
}

function parseOperationReceipts(value: unknown): OperationReceipt[] {
  if (!Array.isArray(value)) return [];
  const receipts: OperationReceipt[] = [];
  for (const entry of value) {
    if (!isSavedObject(entry)) continue;
    if (
      typeof entry.operationId !== 'string' ||
      typeof entry.payloadHash !== 'string' ||
      typeof entry.kind !== 'string' ||
      typeof entry.targetId !== 'string' ||
      typeof entry.committedAt !== 'string' ||
      typeof entry.resultingFingerprint !== 'string'
    ) continue;
    receipts.push({
      operationId: entry.operationId,
      payloadHash: entry.payloadHash,
      kind: entry.kind as OperationReceipt['kind'],
      targetId: entry.targetId,
      committedAt: entry.committedAt,
      resultingFingerprint: entry.resultingFingerprint,
    });
    if (receipts.length >= maxOperationReceipts) break;
  }
  return receipts;
}

function stateFromSavedObject(saved: SavedObject): { state: AppStorageState; changed: boolean } {
  const ingredients = Array.isArray(saved.ingredients) ? saved.ingredients as ManagedIngredient[] : [];
  const customRecipes = Array.isArray(saved.customRecipes) ? saved.customRecipes as Cocktail[] : [];
  const recipeNames = [...baseCocktails, ...customRecipes].flatMap((recipe) =>
    Array.isArray(recipe?.ingredients) ? recipe.ingredients.filter((name): name is string => typeof name === 'string') : [],
  );
  const registry = buildIngredientRegistry(recipeNames, ingredients);
  const stockIds = new Set<string>();
  const issues = new Map<string, IngredientMigrationIssue>();
  const legacyStockBackup = asStringArray(saved.legacyStockBackup);
  let changed = saved.inventorySchemaVersion !== 3;

  if (Array.isArray(saved.migrationIssues)) {
    for (const value of saved.migrationIssues) {
      if (isMigrationIssue(value)) issues.set(value.id, value);
      else changed = true;
    }
  }

  if (Array.isArray(saved.stockIds)) {
    for (const id of asStringArray(saved.stockIds)) {
      const ingredient = registry.find((item) => item.id === id);
      if (!ingredient) {
        issues.set(createIssue('stock-id', id, 'unknown').id, createIssue('stock-id', id, 'unknown'));
        continue;
      }
      if (!ingredient.archived && !ingredient.deleted && isTrackedIngredient(ingredient.nameEn, registry)) stockIds.add(id);
    }
  }

  if (Array.isArray(saved.stock)) {
    const legacyStock = asStringArray(saved.stock);
    for (const value of legacyStock) {
      const result = resolveLegacyStockName(value, registry);
      if (result.ingredient) stockIds.add(result.ingredient.id);
      else if (result.issue) issues.set(result.issue.id, result.issue);
    }
    if (issues.size > 0) legacyStockBackup.splice(0, legacyStockBackup.length, ...legacyStock);
    changed = true;
  } else if (!Array.isArray(saved.stockIds)) {
    for (const name of initialStock) stockIds.add(builtInIngredientId(name));
  }

  const state: AppStorageState = {
    stockIds: [...stockIds],
    ingredients,
    liked: asStringArray(saved.liked),
    customRecipes,
    migrationIssues: [...issues.values()],
    legacyStockBackup,
    ...(Array.isArray(saved.aiOperationReceipts)
      ? { aiOperationReceipts: parseOperationReceipts(saved.aiOperationReceipts) }
      : {}),
  };

  const reconciled = reconcileIngredientMigration(state, registry);
  if (JSON.stringify(reconciled) !== JSON.stringify(state)) changed = true;

  return { state: reconciled, changed };
}

export function reconcileIngredientMigration(state: AppStorageState, registry: ManagedIngredient[]): AppStorageState {
  const stockIds = new Set(state.stockIds.filter((id) => {
    const ingredient = registry.find((item) => item.id === id);
    return Boolean(ingredient && !ingredient.archived && !ingredient.deleted && isTrackedIngredient(ingredient.nameEn, registry));
  }));
  const remaining: IngredientMigrationIssue[] = [];

  for (const issue of state.migrationIssues) {
    if (issue.kind === 'legacy-stock-name') {
      const result = resolveLegacyStockName(issue.value, registry);
      if (result.ingredient) stockIds.add(result.ingredient.id);
      else if (result.issue) remaining.push(result.issue);
      continue;
    }

    const ingredient = registry.find((item) => item.id === issue.value);
    if (!ingredient) {
      remaining.push(issue);
    } else if (ingredient.deleted) {
      remaining.push({ ...issue, reason: 'deleted' });
    } else if (ingredient.archived) {
      remaining.push({ ...issue, reason: 'archived' });
    } else if (!isTrackedIngredient(ingredient.nameEn, registry)) {
      remaining.push({ ...issue, reason: 'untracked' });
    } else {
      stockIds.add(ingredient.id);
    }
  }

  return {
    ...state,
    stockIds: [...stockIds],
    migrationIssues: remaining,
    legacyStockBackup: remaining.length > 0 ? state.legacyStockBackup : [],
  };
}

function makeDefaultState(): AppStorageState {
  return {
    stockIds: initialStock.map(builtInIngredientId),
    ingredients: [],
    liked: [],
    customRecipes: [],
    migrationIssues: [],
    legacyStockBackup: [],
  };
}

function saveInvalidDataCopy(raw: string) {
  try {
    const recoveryKey = `${storageKey}-recovery`;
    if (localStorage.getItem(recoveryKey) === null) {
      localStorage.setItem(recoveryKey, JSON.stringify({ raw, savedAt: new Date().toISOString() }));
    }
  } catch {
    // Keep the original key untouched when a recovery copy cannot be written.
  }
}

export function loadAppStorage(): AppStorageLoadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(storageKey);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  if (raw === null) return { ok: true, state: makeDefaultState(), needsPersist: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    saveInvalidDataCopy(raw);
    return { ok: false, reason: 'invalid' };
  }

  if (!isSavedObject(parsed)) {
    saveInvalidDataCopy(raw);
    return { ok: false, reason: 'invalid' };
  }

  const result = stateFromSavedObject(parsed);
  return { ok: true, state: result.state, needsPersist: result.changed };
}

export function saveAppStorage(state: AppStorageState) {
  let saved: SavedObject = {};
  const current = localStorage.getItem(storageKey);
  if (current !== null) {
    const parsed: unknown = JSON.parse(current);
    if (!isSavedObject(parsed)) throw new Error('Stored app data is not an object.');
    saved = parsed;
  }

  const { stock: _legacyStock, ...rest } = saved;
  const next: SavedObject = {
    ...rest,
    inventorySchemaVersion: 3,
    stockIds: state.stockIds,
    ingredients: state.ingredients,
    liked: state.liked,
    customRecipes: state.customRecipes,
    migrationIssues: state.migrationIssues,
  };

  if (state.legacyStockBackup.length > 0) next.legacyStockBackup = state.legacyStockBackup;
  else delete next.legacyStockBackup;

  if (state.aiOperationReceipts && state.aiOperationReceipts.length > 0) {
    next.aiOperationReceipts = state.aiOperationReceipts.slice(-maxOperationReceipts);
  } else delete next.aiOperationReceipts;

  localStorage.setItem(storageKey, JSON.stringify(next));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(appStorageChangeEvent));
}
