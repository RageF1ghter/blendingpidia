// Pure proposal normalization and command application for AI write intents.
// Everything here is deterministic and side-effect free: the model's raw tool
// arguments are validated and normalized into a preview + command payload;
// commit-time application re-validates against the then-current state.

import { baseCocktails, methods, type Cocktail, type Method } from '../data';
import { buildIngredientRegistry, createCustomIngredientId, findManagedIngredients, findManagedIngredientById, isIngredientCategory, isTrackedIngredient, type ManagedIngredient } from '../ingredient-registry';
import { normalizeRecipeRows, updateCustomRecipe, type RecipeRow } from '../custom-recipes';
import type { AppStorageState } from '../ingredient-storage';

// ---------- fingerprints ----------

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

// FNV-1a over the stable serialization; used for change detection only.
export function fingerprintOf(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16)}:${text.length}`;
}

// ---------- preview shapes (UI-facing) ----------

export type RecipePreview = {
  id: string;
  name: string;
  method: Method;
  glass: string;
  rows: RecipeRow[];
  instructions: string;
  tags: string[];
  parentId: string | null;
};

export type IngredientPreview = {
  id: string;
  nameEn: string;
  nameZh: string;
  category: string;
  archived: boolean;
};

export type PreviewValue =
  | { type: 'recipe'; recipe: RecipePreview }
  | { type: 'ingredient'; ingredient: IngredientPreview }
  | { type: 'stock'; ingredientId: string; nameEn: string; nameZh: string; present: boolean };

export type OperationImpact =
  | { kind: 'duplicateRecipeName'; name: string }
  | { kind: 'missingInStockRows'; names: string[] }
  | { kind: 'leavesStock'; name: string }
  | { kind: 'removedFromStock'; name: string }
  | { kind: 'entersStock'; name: string }
  | { kind: 'recipesAffected'; count: number }
  | { kind: 'parentLink'; parentName: string }
  | { kind: 'adaptedFromBuiltIn'; parentName: string }
  | { kind: 'createdAsCustom'; name: string };

// ---------- normalized payloads ----------

export type NormalizedPayload =
  | { kind: 'createRecipe'; recipe: Cocktail }
  | { kind: 'updateRecipe'; recipeId: string; patch: Omit<Partial<Cocktail>, 'id' | 'likes'> }
  | { kind: 'setStock'; ingredientId: string; present: boolean }
  | { kind: 'createIngredient'; ingredient: ManagedIngredient }
  | { kind: 'archiveIngredient'; ingredientId: string };

export type NormalizedOperation = {
  operationId: string;
  targetId: string;
  payload: NormalizedPayload;
  preconditions: {
    targetFingerprint?: string;
    dependencies: Record<string, string>;
    resultingFingerprint: string;
  };
};

export type ProposalStatus =
  | 'awaiting_confirmation'
  | 'committing'
  | 'committed'
  | 'cancelled'
  | 'stale'
  | 'failed';

export type OperationProposal = {
  proposalId: string;
  turnId: string;
  createdAt: string;
  operation: NormalizedOperation;
  before: PreviewValue | null;
  after: PreviewValue;
  impacts: OperationImpact[];
  status: ProposalStatus;
  errorCode?: string;
  errorDetail?: string;
  committedAt?: string;
};

/** What actually happened to a proposal, substituted into model history. */
export type ProposalOutcome =
  | { status: 'committed'; committedAt: string; replayed: boolean }
  | { status: 'cancelled' }
  | { status: 'failed'; code: string };

export class ProposalValidationError extends Error {
  candidates: string[];

  constructor(message: string, candidates: string[] = []) {
    super(message);
    this.candidates = candidates;
  }
}

function newId(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function registryFor(state: AppStorageState) {
  const recipeNames = [...baseCocktails, ...state.customRecipes].flatMap(
    (recipe) => recipe.ingredients,
  );
  return buildIngredientRegistry(recipeNames, state.ingredients);
}

function allRecipes(state: AppStorageState): Cocktail[] {
  return [...baseCocktails, ...state.customRecipes];
}

function recipePreview(recipe: Cocktail): PreviewValue {
  return {
    type: 'recipe',
    recipe: {
      id: recipe.id,
      name: recipe.name,
      method: recipe.method,
      glass: recipe.glass,
      tags: recipe.tags,
      parentId: recipe.parentId ?? null,
      instructions: recipe.instructions ?? '',
      rows: recipe.ingredients.map((name, index) => ({
        name,
        measure: recipe.measures?.[index] ?? '',
      })),
    },
  };
}

function ingredientPreview(ingredient: ManagedIngredient): PreviewValue {
  return {
    type: 'ingredient',
    ingredient: {
      id: ingredient.id,
      nameEn: ingredient.nameEn,
      nameZh: ingredient.nameZh,
      category: ingredient.category,
      archived: ingredient.archived,
    },
  };
}

function stockPreview(ingredient: ManagedIngredient, present: boolean): PreviewValue {
  return {
    type: 'stock',
    ingredientId: ingredient.id,
    nameEn: ingredient.nameEn,
    nameZh: ingredient.nameZh,
    present,
  };
}

function parseRows(value: unknown): RecipeRow[] {
  if (!Array.isArray(value)) throw new ProposalValidationError('ingredientRows-must-be-array');
  const rows: RecipeRow[] = [];
  for (const entry of value.slice(0, 30)) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim().slice(0, 60) : '';
    const measure = typeof record.measure === 'string' ? record.measure.trim().slice(0, 40) : '';
    if (name) rows.push({ name, measure });
  }
  if (!rows.length) throw new ProposalValidationError('ingredientRows-empty');
  return rows;
}

function parseMethod(value: unknown): Method {
  if (typeof value !== 'string') throw new ProposalValidationError('method-required');
  const match = methods.find((method) => method.toLowerCase() === value.trim().toLowerCase());
  if (!match) throw new ProposalValidationError(`method-invalid:${methods.join('|')}`);
  return match;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new ProposalValidationError('name-required');
  return value.trim().slice(0, 80);
}

function parseOptionalText(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ProposalValidationError('text-field-invalid');
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function resolveParentId(value: unknown, state: AppStorageState, excludeId?: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new ProposalValidationError('parentId-invalid');
  const parent = allRecipes(state).find((recipe) => recipe.id === value);
  if (!parent || parent.id === excludeId) throw new ProposalValidationError('parentId-not-found');
  return parent.id;
}

function resolveIngredientTarget(value: unknown, state: AppStorageState): ManagedIngredient {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) throw new ProposalValidationError('ingredient-target-required');
  const registry = registryFor(state);
  const byId = findManagedIngredientById(raw, registry);
  const matches = byId ? [byId] : findManagedIngredients(raw, registry);
  if (matches.length === 0) throw new ProposalValidationError('ingredient-not-found');
  if (matches.length > 1) {
    throw new ProposalValidationError(
      'ingredient-ambiguous',
      matches.map((item) => `${item.nameEn} / ${item.nameZh} (${item.id})`),
    );
  }
  return matches[0];
}

function missingFromStock(names: string[], state: AppStorageState, registry: ReturnType<typeof registryFor>): string[] {
  const stock = new Set(state.stockIds);
  return names.filter((name) => {
    const match = findManagedIngredients(name, registry)[0];
    return !match || !stock.has(match.id);
  });
}

// ---------- normalization per proposal kind ----------

export function normalizeCreateRecipe(args: unknown, state: AppStorageState, turnId: string): OperationProposal {
  const record = (args ?? {}) as Record<string, unknown>;
  const name = parseName(record.name);
  const rows = parseRows(record.ingredientRows ?? record.ingredients);
  const method = record.method === undefined ? 'Shake' : parseMethod(record.method);
  const glass = parseOptionalText(record.glass, 40) ?? 'Cocktail';
  const instructions = parseOptionalText(record.instructions, 4000) ?? '';
  const parentId = resolveParentId(record.parentId, state) ?? null;
  const registry = registryFor(state);
  const { ingredients, measures } = normalizeRecipeRows(rows, registry);
  if (!ingredients.length) throw new ProposalValidationError('ingredientRows-empty');

  const duplicate = state.customRecipes.find(
    (recipe) => recipe.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  const parent = parentId ? allRecipes(state).find((recipe) => recipe.id === parentId) : undefined;
  const impacts: OperationImpact[] = [];
  if (duplicate) impacts.push({ kind: 'duplicateRecipeName', name: duplicate.name });
  if (parent) {
    impacts.push(
      parent.isCustom
        ? { kind: 'parentLink', parentName: parent.name }
        : { kind: 'adaptedFromBuiltIn', parentName: parent.name },
    );
  }
  const missing = missingFromStock(ingredients, state, registry);
  if (missing.length) impacts.push({ kind: 'missingInStockRows', names: missing });
  impacts.push({ kind: 'createdAsCustom', name });

  const recipe: Cocktail = {
    id: newId('recipe'),
    name,
    method,
    glass,
    ingredients,
    ...(measures ? { measures } : {}),
    tags: ['My recipe'],
    likes: 0,
    instructions,
    parentId,
    isCustom: true,
  };
  const payload: NormalizedPayload = { kind: 'createRecipe', recipe };
  const operation: NormalizedOperation = {
    operationId: newId('op'),
    targetId: recipe.id,
    payload,
    preconditions: {
      dependencies: parentId ? { [`recipe:${parentId}`]: fingerprintOf(parent) } : {},
      resultingFingerprint: fingerprintOf(recipe),
    },
  };
  return {
    proposalId: newId('prop'),
    turnId,
    createdAt: new Date().toISOString(),
    operation,
    before: null,
    after: recipePreview(recipe),
    impacts,
    status: 'awaiting_confirmation',
  };
}

export function normalizeUpdateRecipe(args: unknown, state: AppStorageState, turnId: string): OperationProposal {
  const record = (args ?? {}) as Record<string, unknown>;
  if (typeof record.recipeId !== 'string' || !record.recipeId) throw new ProposalValidationError('recipeId-required');
  const target = state.customRecipes.find((recipe) => recipe.id === record.recipeId);
  if (!target) {
    if (allRecipes(state).some((recipe) => recipe.id === record.recipeId)) {
      throw new ProposalValidationError('recipe-not-custom');
    }
    throw new ProposalValidationError('recipe-not-found');
  }
  if (!target.isCustom) throw new ProposalValidationError('recipe-not-custom');

  const patch: Omit<Partial<Cocktail>, 'id' | 'likes'> = {};
  if (record.name !== undefined) patch.name = parseName(record.name);
  if (record.method !== undefined) patch.method = parseMethod(record.method);
  if (record.glass !== undefined) patch.glass = parseOptionalText(record.glass, 40) ?? 'Cocktail';
  if (record.instructions !== undefined) patch.instructions = parseOptionalText(record.instructions, 4000) ?? '';
  const parentId = resolveParentId(record.parentId, state, target.id);
  if (parentId !== undefined) patch.parentId = parentId;
  if (record.ingredientRows !== undefined || record.ingredients !== undefined) {
    const rows = parseRows(record.ingredientRows ?? record.ingredients);
    const { ingredients, measures } = normalizeRecipeRows(rows, registryFor(state));
    if (!ingredients.length) throw new ProposalValidationError('ingredientRows-empty');
    patch.ingredients = ingredients;
    patch.measures = measures;
  }
  if (!Object.keys(patch).length) throw new ProposalValidationError('nothing-to-update');

  const merged: Cocktail = { ...target, ...patch, id: target.id, likes: target.likes };
  const registry = registryFor(state);
  const impacts: OperationImpact[] = [];
  const newName = patch.name ?? target.name;
  const duplicate = state.customRecipes.find(
    (recipe) => recipe.id !== target.id && recipe.name.trim().toLocaleLowerCase() === newName.trim().toLocaleLowerCase(),
  );
  if (duplicate) impacts.push({ kind: 'duplicateRecipeName', name: duplicate.name });
  const finalIngredients = patch.ingredients ?? target.ingredients;
  const missing = missingFromStock(finalIngredients, state, registry);
  if (missing.length) impacts.push({ kind: 'missingInStockRows', names: missing });

  const payload: NormalizedPayload = { kind: 'updateRecipe', recipeId: target.id, patch };
  const operation: NormalizedOperation = {
    operationId: newId('op'),
    targetId: target.id,
    payload,
    preconditions: {
      targetFingerprint: fingerprintOf(target),
      dependencies: merged.parentId
        ? { [`recipe:${merged.parentId}`]: fingerprintOf(allRecipes(state).find((r) => r.id === merged.parentId) ?? null) }
        : {},
      resultingFingerprint: fingerprintOf(merged),
    },
  };
  return {
    proposalId: newId('prop'),
    turnId,
    createdAt: new Date().toISOString(),
    operation,
    before: recipePreview(target),
    after: recipePreview(merged),
    impacts,
    status: 'awaiting_confirmation',
  };
}

export function normalizeSetStock(args: unknown, state: AppStorageState, turnId: string): OperationProposal {
  const record = (args ?? {}) as Record<string, unknown>;
  const ingredient = resolveIngredientTarget(record.ingredient ?? record.ingredientId ?? record.id, state);
  if (ingredient.archived) throw new ProposalValidationError('ingredient-archived');
  if (ingredient.deleted) throw new ProposalValidationError('ingredient-deleted');
  if (typeof record.present !== 'boolean') throw new ProposalValidationError('present-required-boolean');
  const registry = registryFor(state);
  if (!isTrackedIngredient(ingredient.nameEn, registry)) throw new ProposalValidationError('ingredient-untracked');

  const current = state.stockIds.includes(ingredient.id);
  const payload: NormalizedPayload = { kind: 'setStock', ingredientId: ingredient.id, present: record.present };
  const operation: NormalizedOperation = {
    operationId: newId('op'),
    targetId: ingredient.id,
    payload,
    preconditions: {
      targetFingerprint: fingerprintOf({ present: current }),
      dependencies: { [`ingredient:${ingredient.id}`]: fingerprintOf(ingredient) },
      resultingFingerprint: fingerprintOf({ present: record.present }),
    },
  };
  return {
    proposalId: newId('prop'),
    turnId,
    createdAt: new Date().toISOString(),
    operation,
    before: stockPreview(ingredient, current),
    after: stockPreview(ingredient, record.present),
    impacts: record.present
      ? [{ kind: 'entersStock', name: ingredient.nameEn }]
      : [{ kind: 'removedFromStock', name: ingredient.nameEn }],
    status: 'awaiting_confirmation',
  };
}

export function normalizeCreateIngredient(args: unknown, state: AppStorageState, turnId: string): OperationProposal {
  const record = (args ?? {}) as Record<string, unknown>;
  const nameEn = parseOptionalText(record.nameEn, 60);
  const nameZh = parseOptionalText(record.nameZh, 60);
  if (!nameEn || !nameZh) throw new ProposalValidationError('ingredient-names-required');
  if (!isIngredientCategory(record.category)) throw new ProposalValidationError('category-invalid');

  const registry = registryFor(state);
  const collision = [
    ...findManagedIngredients(nameEn, registry),
    ...findManagedIngredients(nameZh, registry),
  ].find((item) => !item.custom || item.deleted);
  if (collision) {
    throw new ProposalValidationError(
      collision.deleted ? 'ingredient-name-reserved' : 'ingredient-name-conflict',
      [`${collision.nameEn} / ${collision.nameZh} (${collision.id})`],
    );
  }

  const ingredient: ManagedIngredient = {
    id: createCustomIngredientId(),
    nameEn,
    nameZh,
    category: record.category,
    aliases: [],
    archived: false,
    deleted: false,
    custom: true,
  };
  const payload: NormalizedPayload = { kind: 'createIngredient', ingredient };
  const operation: NormalizedOperation = {
    operationId: newId('op'),
    targetId: ingredient.id,
    payload,
    preconditions: {
      dependencies: {},
      resultingFingerprint: fingerprintOf(ingredient),
    },
  };
  return {
    proposalId: newId('prop'),
    turnId,
    createdAt: new Date().toISOString(),
    operation,
    before: null,
    after: ingredientPreview(ingredient),
    impacts: [],
    status: 'awaiting_confirmation',
  };
}

export function normalizeArchiveIngredient(args: unknown, state: AppStorageState, turnId: string): OperationProposal {
  const record = (args ?? {}) as Record<string, unknown>;
  const ingredient = resolveIngredientTarget(record.ingredient ?? record.ingredientId ?? record.id, state);
  if (ingredient.deleted) throw new ProposalValidationError('ingredient-deleted');
  if (ingredient.archived) throw new ProposalValidationError('ingredient-already-archived');

  const registry = registryFor(state);
  const affected = allRecipes(state).filter((recipe) =>
    recipe.ingredients.some((name) => findManagedIngredients(name, registry)[0]?.id === ingredient.id),
  ).length;
  const inStock = state.stockIds.includes(ingredient.id);

  const payload: NormalizedPayload = { kind: 'archiveIngredient', ingredientId: ingredient.id };
  const operation: NormalizedOperation = {
    operationId: newId('op'),
    targetId: ingredient.id,
    payload,
    preconditions: {
      targetFingerprint: fingerprintOf({ archived: false, inStock }),
      dependencies: {},
      // The user-visible promise: archived and out of stock. Record-shape
      // details (e.g. alias merging) are not part of the previewed result.
      resultingFingerprint: fingerprintOf({ archived: true, inStock: false }),
    },
  };
  const impacts: OperationImpact[] = [];
  if (inStock) impacts.push({ kind: 'leavesStock', name: ingredient.nameEn });
  if (affected > 0) impacts.push({ kind: 'recipesAffected', count: affected });
  return {
    proposalId: newId('prop'),
    turnId,
    createdAt: new Date().toISOString(),
    operation,
    before: ingredientPreview(ingredient),
    after: ingredientPreview({ ...ingredient, archived: true }),
    impacts,
    status: 'awaiting_confirmation',
  };
}

// ---------- target fingerprint of a payload against a state ----------

export function operationTargetFingerprint(payload: NormalizedPayload, state: AppStorageState): string {
  switch (payload.kind) {
    case 'createRecipe':
      return fingerprintOf(
        state.customRecipes.find((recipe) => recipe.id === payload.recipe.id) ?? null,
      );
    case 'updateRecipe':
      return fingerprintOf(
        state.customRecipes.find((recipe) => recipe.id === payload.recipeId) ?? null,
      );
    case 'setStock':
      return fingerprintOf({ present: state.stockIds.includes(payload.ingredientId) });
    case 'createIngredient':
      return fingerprintOf(
        state.ingredients.find((ingredient) => ingredient.id === payload.ingredient.id) ?? null,
      );
    case 'archiveIngredient': {
      // Built-in ingredient records are derived by the registry, not stored
      // in state.ingredients, so resolve through it.
      const record =
        state.ingredients.find((ingredient) => ingredient.id === payload.ingredientId) ??
        findManagedIngredientById(payload.ingredientId, registryFor(state));
      return fingerprintOf({
        archived: Boolean(record?.archived),
        inStock: state.stockIds.includes(payload.ingredientId),
      });
    }
  }
}

export function payloadFingerprint(operation: NormalizedOperation): string {
  return fingerprintOf({
    kind: operation.payload.kind,
    targetId: operation.targetId,
    payload: operation.payload,
  });
}

// Dependency keys are namespaced selectors resolved against a state.
// "recipe:" covers built-in and custom recipes; "ingredient:" resolves
// through the registry because built-in records are derived, not stored.
export function dependencyRecordFor(key: string, state: AppStorageState): unknown {
  const separator = key.indexOf(':');
  if (separator === -1) return undefined;
  const scope = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (!id) return undefined;
  if (scope === 'recipe') {
    return allRecipes(state).find((recipe) => recipe.id === id) ?? null;
  }
  if (scope === 'ingredient') {
    return (
      state.ingredients.find((ingredient) => ingredient.id === id) ??
      findManagedIngredientById(id, registryFor(state)) ??
      null
    );
  }
  return undefined;
}

// ---------- pure command application (re-validates, then mutates a copy) ----------

export function applyOperation(payload: NormalizedPayload, state: AppStorageState): AppStorageState {
  switch (payload.kind) {
    case 'createRecipe': {
      if (state.customRecipes.some((recipe) => recipe.id === payload.recipe.id)) {
        throw new Error('recipe-id-exists');
      }
      return { ...state, customRecipes: [payload.recipe, ...state.customRecipes] };
    }
    case 'updateRecipe': {
      const target = state.customRecipes.find((recipe) => recipe.id === payload.recipeId);
      if (!target || !target.isCustom) throw new Error('recipe-target-invalid');
      return {
        ...state,
        customRecipes: updateCustomRecipe(state.customRecipes, payload.recipeId, payload.patch),
      };
    }
    case 'setStock': {
      const registry = registryFor(state);
      const ingredient = findManagedIngredientById(payload.ingredientId, registry);
      if (!ingredient || ingredient.archived || ingredient.deleted || !isTrackedIngredient(ingredient.nameEn, registry)) {
        throw new Error('ingredient-target-invalid');
      }
      const has = state.stockIds.includes(payload.ingredientId);
      if (has === payload.present) return state;
      return {
        ...state,
        stockIds: payload.present
          ? [...state.stockIds, payload.ingredientId]
          : state.stockIds.filter((id) => id !== payload.ingredientId),
      };
    }
    case 'createIngredient': {
      const registry = registryFor(state);
      const collision = [
        ...findManagedIngredients(payload.ingredient.nameEn, registry),
        ...findManagedIngredients(payload.ingredient.nameZh, registry),
      ].find((item) => !item.custom || item.deleted);
      if (collision) {
        throw new Error(collision.deleted ? 'ingredient-name-reserved' : 'ingredient-name-conflict');
      }
      return { ...state, ingredients: [...state.ingredients, payload.ingredient] };
    }
    case 'archiveIngredient': {
      const registry = registryFor(state);
      const target =
        state.ingredients.find((ingredient) => ingredient.id === payload.ingredientId) ??
        findManagedIngredientById(payload.ingredientId, registry);
      if (!target || target.deleted) throw new Error('ingredient-target-invalid');
      if (target.archived) return state;
      const archivedRecord: ManagedIngredient = { ...target, archived: true };
      // Built-in records live only in the derived registry; persisting the
      // archived copy into state.ingredients is what makes archiving stick.
      const ingredients = state.ingredients.some((ingredient) => ingredient.id === payload.ingredientId)
        ? state.ingredients.map((ingredient) =>
            ingredient.id === payload.ingredientId ? archivedRecord : ingredient,
          )
        : [...state.ingredients, archivedRecord];
      return {
        ...state,
        ingredients,
        stockIds: state.stockIds.filter((id) => id !== payload.ingredientId),
      };
    }
  }
}
