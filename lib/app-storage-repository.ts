// Shared business-data commit entry. Every writer (home forms, stock page,
// AI confirmations, load-time migrations) goes through commit() so that
// changes are applied to the freshly loaded state under a same-origin lock
// and saved together with AI operation receipts in one localStorage write.

import {
  type AppStorageState,
  loadAppStorage,
  reconcileIngredientMigration,
  saveAppStorage,
} from './ingredient-storage';
import { baseCocktails } from './data';
import { buildIngredientRegistry } from './ingredient-registry';
import {
  applyOperation,
  dependencyRecordFor,
  fingerprintOf,
  operationTargetFingerprint,
  payloadFingerprint,
  type NormalizedOperation,
} from './ai/operations';
import { maxOperationReceipts, type OperationReceipt } from './ai/contracts';

const businessLockName = 'blendingpidia:app-storage';

export function webLocksAvailable() {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.locks?.request === 'function'
  );
}

async function withBusinessLock<T>(task: () => Promise<T> | T): Promise<T> {
  if (webLocksAvailable()) {
    return navigator.locks.request(businessLockName, { mode: 'exclusive' }, () => task());
  }
  // Manual writes keep working without Web Locks; AI writes are refused
  // upstream so they never race with other tabs.
  return task();
}

export function reconcileBusinessState(state: AppStorageState): AppStorageState {
  const recipeNames = [...baseCocktails, ...state.customRecipes].flatMap(
    (recipe) => recipe.ingredients,
  );
  const registry = buildIngredientRegistry(recipeNames, state.ingredients);
  return reconcileIngredientMigration(state, registry);
}

export type BusinessLoadResult =
  | { ok: true; state: AppStorageState; needsPersist: boolean }
  | { ok: false; reason: 'unavailable' | 'invalid' };

export function loadBusinessState(): BusinessLoadResult {
  return loadAppStorage();
}

export type BusinessCommitResult =
  | { ok: true; state: AppStorageState }
  | { ok: false; code: 'STORAGE_UNAVAILABLE' | 'STORAGE_INVALID' };

/**
 * Applies a mutator to the latest stored state inside the business lock,
 * reconciles ingredient migrations, and persists in a single write. The
 * mutator must be pure: it receives the fresh state and returns the next
 * state, or null to abort without writing.
 */
export async function commitBusinessState(
  mutate: (state: AppStorageState) => AppStorageState | null,
): Promise<BusinessCommitResult> {
  return withBusinessLock(() => {
    const loaded = loadAppStorage();
    if (!loaded.ok) return { ok: false, code: loaded.reason === 'invalid' ? 'STORAGE_INVALID' : 'STORAGE_UNAVAILABLE' } as const;
    const next = mutate(loaded.state);
    if (!next) return { ok: true, state: loaded.state } as const;
    const reconciled = reconcileBusinessState(next);
    try {
      saveAppStorage(reconciled);
    } catch {
      return { ok: false, code: 'STORAGE_UNAVAILABLE' } as const;
    }
    return { ok: true, state: reconciled } as const;
  });
}

export type AiCommitResult =
  | { ok: true; state: AppStorageState; receipt: OperationReceipt; replayed: boolean }
  | {
      ok: false;
      code:
        | 'LOCKS_UNAVAILABLE'
        | 'STORAGE_UNAVAILABLE'
        | 'STORAGE_INVALID'
        | 'STALE_PROPOSAL'
        | 'INVALID_OPERATION';
      detail?: string;
    };

/**
 * Commits one confirmed AI operation with full verification: receipt
 * idempotency, target fingerprint preconditions, business-rule application,
 * and a resulting-state check against the previewed fingerprint. Business
 * change and receipt land in the same localStorage write or neither does.
 */
export async function commitAiOperation(
  operation: NormalizedOperation,
): Promise<AiCommitResult> {
  if (!webLocksAvailable()) {
    return { ok: false, code: 'LOCKS_UNAVAILABLE' };
  }
  return withBusinessLock(() => {
    const loaded = loadAppStorage();
    if (!loaded.ok) {
      return { ok: false, code: loaded.reason === 'invalid' ? 'STORAGE_INVALID' : 'STORAGE_UNAVAILABLE' } as const;
    }
    const state = loaded.state;
    const hash = payloadFingerprint(operation);

    const receipts = state.aiOperationReceipts ?? [];
    const existing = receipts.find((receipt) => receipt.operationId === operation.operationId);
    if (existing) {
      if (existing.payloadHash === hash) {
        return { ok: true, state, receipt: existing, replayed: true } as const;
      }
      return { ok: false, code: 'INVALID_OPERATION', detail: 'operation-id-conflict' } as const;
    }
    if (receipts.length >= maxOperationReceipts) {
      return { ok: false, code: 'INVALID_OPERATION', detail: 'receipt-cap' } as const;
    }

    if (
      operation.preconditions.targetFingerprint !== undefined &&
      operation.preconditions.targetFingerprint !==
        operationTargetFingerprint(operation.payload, state)
    ) {
      return { ok: false, code: 'STALE_PROPOSAL' } as const;
    }
    for (const [key, expected] of Object.entries(operation.preconditions.dependencies)) {
      if (fingerprintOf(dependencyRecordFor(key, state)) !== expected) {
        return { ok: false, code: 'STALE_PROPOSAL' } as const;
      }
    }

    let applied: AppStorageState;
    try {
      applied = applyOperation(operation.payload, state);
    } catch (error) {
      return { ok: false, code: 'INVALID_OPERATION', detail: error instanceof Error ? error.message : 'apply-failed' } as const;
    }

    const reconciled = reconcileBusinessState(applied);
    const resultingFingerprint = operationTargetFingerprint(operation.payload, reconciled);
    if (resultingFingerprint !== operation.preconditions.resultingFingerprint) {
      return { ok: false, code: 'STALE_PROPOSAL', detail: 'result-mismatch' } as const;
    }

    const receipt: OperationReceipt = {
      operationId: operation.operationId,
      payloadHash: hash,
      kind: operation.payload.kind,
      targetId: operation.targetId,
      committedAt: new Date().toISOString(),
      resultingFingerprint,
    };
    const withReceipt: AppStorageState = {
      ...reconciled,
      aiOperationReceipts: [...receipts, receipt],
    };
    try {
      saveAppStorage(withReceipt);
    } catch {
      return { ok: false, code: 'STORAGE_UNAVAILABLE' } as const;
    }
    return { ok: true, state: withReceipt, receipt, replayed: false } as const;
  });
}
