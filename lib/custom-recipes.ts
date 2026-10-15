import { canonicalIngredientName } from './ingredients';
import {
  findManagedIngredient,
  type ManagedIngredient,
} from './ingredient-registry';
import type { Cocktail } from './data';

export type RecipeRow = { name: string; measure: string };

// Typed ingredient rows become parallel arrays: names go through the registry
// or canonical fallback, duplicates merge and keep the first non-empty measure.
export function normalizeRecipeRows(
  rows: RecipeRow[],
  registry: ManagedIngredient[],
): { ingredients: string[]; measures?: string[] } {
  const ingredients: string[] = [];
  const measures: string[] = [];
  for (const row of rows) {
    const name = (
      findManagedIngredient(row.name, registry)?.nameEn ??
      canonicalIngredientName(row.name)
    ).trim();
    if (!name) continue;
    const measure = row.measure.trim();
    const index = ingredients.indexOf(name);
    if (index === -1) {
      ingredients.push(name);
      measures.push(measure);
    } else if (!measures[index] && measure) {
      measures[index] = measure;
    }
  }
  if (!ingredients.length) return { ingredients: [] };
  return measures.some(Boolean)
    ? { ingredients, measures }
    : { ingredients };
}

export function findDuplicateCustomName(
  name: string,
  recipes: Cocktail[],
  excludeId?: string,
): Cocktail | undefined {
  const key = name.trim().toLocaleLowerCase();
  if (!key) return undefined;
  return recipes.find(
    (recipe) =>
      recipe.isCustom &&
      recipe.id !== excludeId &&
      recipe.name.trim().toLocaleLowerCase() === key,
  );
}

// Editing keeps id and likes stable so likes and parent references survive.
export function updateCustomRecipe(
  recipes: Cocktail[],
  id: string,
  patch: Omit<Partial<Cocktail>, 'id' | 'likes'>,
): Cocktail[] {
  return recipes.map((recipe) =>
    recipe.id === id ? { ...recipe, ...patch, id: recipe.id, likes: recipe.likes } : recipe,
  );
}

export function deleteCustomRecipe(
  recipes: Cocktail[],
  id: string,
): { recipes: Cocktail[]; detached: number } {
  let detached = 0;
  const next = recipes
    .filter((recipe) => recipe.id !== id)
    .map((recipe) =>
      recipe.parentId === id
        ? ((detached += 1), { ...recipe, parentId: null })
        : recipe,
    );
  return { recipes: next, detached };
}

export function countRecipeChildren(recipes: Cocktail[], id: string): number {
  return recipes.filter((recipe) => recipe.parentId === id).length;
}

// Older saves may lack measures or carry malformed fields; keep what is valid
// so legacy custom recipes still load and render.
export function sanitizeCustomRecipes(value: unknown): Cocktail[] {
  if (!Array.isArray(value)) return [];
  const result: Cocktail[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const recipe = entry as Partial<Cocktail>;
    if (typeof recipe.id !== 'string' || !recipe.id.trim()) continue;
    if (typeof recipe.name !== 'string' || !recipe.name.trim()) continue;
    const ingredients = Array.isArray(recipe.ingredients)
      ? recipe.ingredients.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim() !== '',
        )
      : [];
    if (!ingredients.length) continue;
    const measures = Array.isArray(recipe.measures)
      ? recipe.measures.filter((item): item is string => typeof item === 'string')
      : [];
    result.push({
      id: recipe.id,
      name: recipe.name,
      image: typeof recipe.image === 'string' ? recipe.image : undefined,
      method: recipe.method ?? 'Shake',
      glass: recipe.glass ?? 'Cocktail',
      ingredients,
      ...(measures.length ? { measures: measures.slice(0, ingredients.length) } : {}),
      tags:
        Array.isArray(recipe.tags)
          ? recipe.tags.filter((item): item is string => typeof item === 'string')
          : ['My recipe'],
      likes: typeof recipe.likes === 'number' ? recipe.likes : 0,
      instructions:
        typeof recipe.instructions === 'string' ? recipe.instructions : undefined,
      parentId: typeof recipe.parentId === 'string' ? recipe.parentId : null,
      isCustom: true,
    });
  }
  return result;
}

export function suggestIngredientNames(
  query: string,
  registry: ManagedIngredient[],
  limit = 6,
): string[] {
  const key = query.trim().toLocaleLowerCase();
  if (!key) return [];
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const record of registry) {
    if (record.deleted) continue;
    const haystacks = [record.nameEn, record.nameZh, ...record.aliases];
    if (!haystacks.some((value) => value.toLocaleLowerCase().includes(key)))
      continue;
    if (seen.has(record.nameEn)) continue;
    seen.add(record.nameEn);
    suggestions.push(record.nameEn);
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}
