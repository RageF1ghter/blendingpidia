import type { Cocktail } from './data';
import {
  findManagedIngredient,
  ingredientIdForName,
  isOptionalIngredient,
  type ManagedIngredient,
} from './ingredient-registry';
import { methodNames, tagNames, term } from './i18n';

export type IndexedCocktail = {
  recipe: Cocktail;
  ingredients: {
    id: string;
    nameEn: string;
    nameZh: string;
    deleted: boolean;
    optional: boolean;
  }[];
  ingredientIds: Set<string>;
  searchText: string;
};

export function buildCocktailIndex(
  cocktails: Cocktail[],
  registry: ManagedIngredient[],
) {
  const byId = new Map<string, IndexedCocktail>();
  const variants = new Map<string, Cocktail[]>();
  for (const recipe of cocktails) {
    const ingredients = recipe.ingredients.map((name) => {
      const record = findManagedIngredient(name, registry);
      return {
        id: record?.id ?? ingredientIdForName(name, registry),
        nameEn: record?.nameEn ?? name,
        nameZh: record?.nameZh ?? name,
        deleted: Boolean(record?.deleted),
        optional: isOptionalIngredient(name, registry),
      };
    });
    byId.set(recipe.id, {
      recipe,
      ingredients,
      ingredientIds: new Set(ingredients.map(({ id }) => id)),
      searchText: [
        recipe.name,
        ...recipe.ingredients,
        ...ingredients.flatMap(({ nameEn, nameZh }) => [nameEn, nameZh]),
        ...recipe.tags,
        ...recipe.tags.map((tag) => term(tagNames, tag, 'zh')),
        recipe.method,
        term(methodNames, recipe.method, 'zh'),
      ].join(' '),
    });
    if (recipe.parentId) {
      const family = variants.get(recipe.parentId) ?? [];
      family.push(recipe);
      variants.set(recipe.parentId, family);
    }
  }
  return { byId, variants };
}

export type CocktailAvailability = { missing: string[]; broken: boolean };

export function calculateAvailability(
  index: ReturnType<typeof buildCocktailIndex>,
  stockIds: string[],
) {
  const stock = new Set(stockIds);
  const byId = new Map<string, CocktailAvailability>();
  let makeable = 0;
  let near = 0;
  for (const [id, entry] of index.byId) {
    const missing = new Map<string, string>();
    for (const ingredient of entry.ingredients) {
      if (
        ingredient.deleted ||
        (!ingredient.optional && !stock.has(ingredient.id))
      ) {
        missing.set(ingredient.id, ingredient.nameEn);
      }
    }
    const status = {
      missing: [...missing.values()],
      broken: entry.ingredients.some((item) => item.deleted),
    };
    byId.set(id, status);
    if (status.missing.length === 0) makeable++;
    else if (status.missing.length <= 2) near++;
  }
  return { byId, counts: { all: index.byId.size, makeable, near } };
}
