// Local snapshot projection: turns the browser business state into the
// compact facts sent with each model request. Built fresh for every turn so
// stale conversation data never poses as current stock.

import type { AppStorageState } from '../ingredient-storage';
import { baseCocktails } from '../data';
import { buildIngredientRegistry, findManagedIngredientById, isTrackedIngredient } from '../ingredient-registry';
import { aiLimits, type ChatRequestSnapshot, type StockFact } from './contracts';
import { fingerprintOf } from './operations';

export type LocalSnapshot = {
  state: AppStorageState;
  snapshotVersion: string;
  capturedAt: string;
  toRequest(): ChatRequestSnapshot;
};

export class SnapshotTooLargeError extends Error {
  constructor() {
    super('stock-snapshot-too-large');
  }
}

export function buildLocalSnapshot(state: AppStorageState): LocalSnapshot {
  const registry = buildIngredientRegistry(
    [...baseCocktails, ...state.customRecipes].flatMap((recipe) => recipe.ingredients),
    state.ingredients,
  );
  const stock: StockFact[] = [];
  for (const id of state.stockIds) {
    const record = findManagedIngredientById(id, registry);
    if (!record || record.archived || record.deleted) continue;
    if (!isTrackedIngredient(record.nameEn, registry)) continue;
    stock.push({
      id: record.id,
      nameEn: record.nameEn,
      nameZh: record.nameZh,
      category: record.category,
    });
  }
  if (stock.length > aiLimits.maxStockFacts) throw new SnapshotTooLargeError();

  const snapshotVersion = fingerprintOf({
    stockIds: [...state.stockIds].sort(),
    customRecipes: state.customRecipes.map((recipe) => [recipe.id, recipe.name]),
    ingredients: state.ingredients.map((ingredient) => ingredient.id),
  });
  const capturedAt = new Date().toISOString();
  return {
    state,
    snapshotVersion,
    capturedAt,
    toRequest() {
      return {
        version: snapshotVersion,
        capturedAt,
        stock,
        coverage: {
          stockComplete: state.migrationIssues.length === 0,
          stockCount: stock.length,
          customRecipeCount: state.customRecipes.length,
          builtInRecipeCount: baseCocktails.length,
          migrationIssueCount: state.migrationIssues.length,
        },
      };
    },
  };
}
