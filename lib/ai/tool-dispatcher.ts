// Browser-side tool dispatcher. Read-only tools answer from the turn's local
// snapshot; proposal tools normalize model arguments into previewable
// operations and never touch business storage. Anything outside the
// whitelist is rejected with a controlled tool error.

import { baseCocktails, fuzzyMatch, type Cocktail } from '../data';
import {
  buildCocktailIndex,
  calculateAvailability,
} from '../cocktail-index';
import {
  buildIngredientRegistry,
  findManagedIngredientById,
} from '../ingredient-registry';
import { loadCocktailDetails } from '../cocktail-details';
import { aiLimits, type ProviderToolCall } from './contracts';
import type { LocalSnapshot } from './context';
import {
  normalizeArchiveIngredient,
  normalizeCreateIngredient,
  normalizeCreateRecipe,
  normalizeSetStock,
  normalizeUpdateRecipe,
  ProposalValidationError,
  type OperationProposal,
} from './operations';

export type ToolDispatchOutcome =
  | { status: 'ok'; result: unknown }
  | { status: 'error'; error: string; candidates?: string[] };

export type DispatchContext = {
  snapshot: LocalSnapshot;
  turnId: string;
  proposals: Map<string, OperationProposal>;
};

export async function dispatchToolCalls(
  calls: ProviderToolCall[],
  ctx: DispatchContext,
): Promise<Map<string, ToolDispatchOutcome>> {
  const results = new Map<string, ToolDispatchOutcome>();
  for (const call of calls) {
    results.set(call.id, await dispatchOneTool(call, ctx));
  }
  return results;
}

async function dispatchOneTool(
  call: ProviderToolCall,
  ctx: DispatchContext,
): Promise<ToolDispatchOutcome> {
  let args: unknown;
  try {
    args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    return { status: 'error', error: 'invalid-arguments-json' };
  }
  try {
    switch (call.function.name) {
      case 'list_stock':
        return { status: 'ok', result: listStock(ctx) };
      case 'search_recipes':
        return { status: 'ok', result: searchRecipes(args, ctx) };
      case 'read_recipe':
        return { status: 'ok', result: await readRecipe(args, ctx) };
      case 'propose_create_recipe':
        return proposeOutcome(normalizeCreateRecipe(args, ctx.snapshot.state, ctx.turnId), ctx);
      case 'propose_update_recipe':
        return proposeOutcome(normalizeUpdateRecipe(args, ctx.snapshot.state, ctx.turnId), ctx);
      case 'propose_set_stock':
        return proposeOutcome(normalizeSetStock(args, ctx.snapshot.state, ctx.turnId), ctx);
      case 'propose_create_ingredient':
        return proposeOutcome(normalizeCreateIngredient(args, ctx.snapshot.state, ctx.turnId), ctx);
      case 'propose_archive_ingredient':
        return proposeOutcome(normalizeArchiveIngredient(args, ctx.snapshot.state, ctx.turnId), ctx);
      default:
        return { status: 'error', error: `unknown-tool:${call.function.name}` };
    }
  } catch (error) {
    if (error instanceof ProposalValidationError) {
      return { status: 'error', error: error.message, candidates: error.candidates };
    }
    return {
      status: 'error',
      error: error instanceof Error ? `tool-failed:${error.message}` : 'tool-failed',
    };
  }
}

function proposeOutcome(proposal: OperationProposal, ctx: DispatchContext) {
  ctx.proposals.set(proposal.proposalId, proposal);
  return {
    status: 'ok' as const,
    result: {
      status: 'pending_confirmation',
      proposalId: proposal.proposalId,
      summary: previewSummary(proposal),
      note: 'Show this change to the user for confirmation. Nothing is written until the user confirms.',
    },
  };
}

function previewSummary(proposal: OperationProposal) {
  const { after } = proposal;
  if (after.type === 'recipe') {
    return {
      kind: after.recipe.id ? 'recipe' : 'recipe',
      name: after.recipe.name,
      rows: after.recipe.rows,
      method: after.recipe.method,
      glass: after.recipe.glass,
    };
  }
  if (after.type === 'ingredient') {
    return { nameEn: after.ingredient.nameEn, nameZh: after.ingredient.nameZh, archived: after.ingredient.archived };
  }
  return { ingredient: after.nameEn, present: after.present };
}

function listStock(ctx: DispatchContext) {
  const { state } = ctx.snapshot;
  const registry = buildIngredientRegistry(
    [...baseCocktails, ...state.customRecipes].flatMap((recipe) => recipe.ingredients),
    state.ingredients,
  );
  const items = state.stockIds.flatMap((id) => {
    const record = findManagedIngredientById(id, registry);
    if (!record || record.archived || record.deleted) return [];
    return [{ id: record.id, nameEn: record.nameEn, nameZh: record.nameZh, category: record.category }];
  });
  return {
    snapshotVersion: ctx.snapshot.snapshotVersion,
    stock: items,
    migrationIssueCount: state.migrationIssues.length,
    note: state.migrationIssues.length
      ? 'Some legacy stock entries are unresolved and not counted; treat stock as incomplete.'
      : undefined,
  };
}

function decodeCursor(value: unknown, version: string): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value !== 'string') throw new ProposalValidationError('cursor-invalid');
  const separator = value.lastIndexOf(':');
  if (separator === -1) throw new ProposalValidationError('cursor-invalid');
  const cursorVersion = value.slice(0, separator);
  const offset = Number(value.slice(separator + 1));
  if (cursorVersion !== version) throw new ProposalValidationError('cursor-expired-refetch');
  if (!Number.isInteger(offset) || offset < 0) throw new ProposalValidationError('cursor-invalid');
  return offset;
}

function searchRecipes(args: unknown, ctx: DispatchContext) {
  const record = (args ?? {}) as Record<string, unknown>;
  const query = typeof record.query === 'string' ? record.query.trim() : '';
  const scope = record.scope === 'custom' || record.scope === 'builtIn' ? record.scope : 'all';
  const availability =
    record.availability === 'makeable' || record.availability === 'near' ? record.availability : 'any';
  const offset = decodeCursor(record.cursor, ctx.snapshot.snapshotVersion);

  const { state } = ctx.snapshot;
  const registry = buildIngredientRegistry(
    [...baseCocktails, ...state.customRecipes].flatMap((recipe) => recipe.ingredients),
    state.ingredients,
  );
  let pool: Cocktail[] = [...baseCocktails, ...state.customRecipes];
  if (scope === 'custom') pool = pool.filter((recipe) => recipe.isCustom);
  if (scope === 'builtIn') pool = pool.filter((recipe) => !recipe.isCustom);

  const index = buildCocktailIndex(pool, registry);
  const availabilityMap = calculateAvailability(index, state.stockIds);

  const matched = pool.filter((recipe) => {
    if (!query) return true;
    return fuzzyMatch(query, index.byId.get(recipe.id)?.searchText ?? recipe.name);
  });
  const filtered = matched.filter((recipe) => {
    if (availability === 'any') return true;
    const missing = availabilityMap.byId.get(recipe.id)?.missing.length ?? 0;
    return availability === 'makeable' ? missing === 0 : missing > 0 && missing <= 2;
  });

  const pageSize = aiLimits.maxSearchPageSize;
  const page = filtered.slice(offset, offset + pageSize);
  return {
    snapshotVersion: ctx.snapshot.snapshotVersion,
    total: filtered.length,
    returnedCount: page.length,
    coverageNote: 'Summaries only; call read_recipe for exact measures and steps.',
    items: page.map((recipe) => {
      const status = availabilityMap.byId.get(recipe.id);
      return {
        recipeId: recipe.id,
        name: recipe.name,
        source: recipe.isCustom ? 'custom' : 'builtIn',
        method: recipe.method,
        tags: recipe.tags,
        missingCount: status?.missing.length ?? 0,
        broken: Boolean(status?.broken),
        ingredients: recipe.ingredients,
      };
    }),
    nextCursor:
      offset + pageSize < filtered.length
        ? `${ctx.snapshot.snapshotVersion}:${offset + pageSize}`
        : undefined,
  };
}

async function readRecipe(args: unknown, ctx: DispatchContext) {
  const record = (args ?? {}) as Record<string, unknown>;
  if (typeof record.recipeId !== 'string' || !record.recipeId) {
    throw new ProposalValidationError('recipeId-required');
  }
  const { state } = ctx.snapshot;
  const recipe = [...baseCocktails, ...state.customRecipes].find(
    (item) => item.id === record.recipeId,
  );
  if (!recipe) throw new ProposalValidationError('recipe-not-found');

  const registry = buildIngredientRegistry(
    [...baseCocktails, ...state.customRecipes].flatMap((item) => item.ingredients),
    state.ingredients,
  );
  const index = buildCocktailIndex([recipe], registry);
  const status = calculateAvailability(index, state.stockIds).byId.get(recipe.id);

  const base = {
    snapshotVersion: ctx.snapshot.snapshotVersion,
    recipeId: recipe.id,
    name: recipe.name,
    source: recipe.isCustom ? 'custom' : 'builtIn',
    method: recipe.method,
    glass: recipe.glass,
    tags: recipe.tags,
    ingredients: recipe.ingredients,
    parentId: recipe.parentId ?? null,
    likes: undefined as number | undefined,
    measures: recipe.measures,
    instructions: recipe.instructions,
    detailsStatus: 'unavailable' as 'available' | 'unavailable' | 'not-needed',
    availability: {
      missing: status?.missing ?? [],
      broken: Boolean(status?.broken),
      makeable: (status?.missing.length ?? 0) === 0 && !status?.broken,
    },
  };
  if (recipe.isCustom) {
    return { ...base, detailsStatus: 'not-needed' as const, likes: recipe.likes };
  }
  if (recipe.measures && recipe.instructions !== undefined) {
    return { ...base, detailsStatus: 'available' as const };
  }
  try {
    const details = await loadCocktailDetails(recipe.id);
    return {
      ...base,
      measures: details.measures ?? recipe.measures,
      instructions: details.instructions ?? recipe.instructions,
      detailsStatus: 'available' as const,
    };
  } catch {
    return {
      ...base,
      detailsStatus: 'unavailable' as const,
      note: 'Details could not be loaded; summary only. Do not invent measures or steps.',
    };
  }
}
