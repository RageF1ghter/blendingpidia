import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { Script } from 'node:vm';
import ts from 'typescript';

// Load pure TypeScript modules without Vite or a browser, mirroring
// tests/performance.test.mjs. lib/custom-recipes.ts only pulls pure modules,
// so no virtual cocktail-catalog module is needed here.
const require = createRequire(import.meta.url);
const cache = new Map();
function load(path) {
  const filename = resolve(path);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = (id) =>
    id.startsWith('.')
      ? load(resolve(dirname(filename), id + '.ts'))
      : require(id);
  new Script(`(function(require, module, exports) {${code}\n})`, {
    filename,
  }).runInThisContext()(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const {
  buildIngredientRegistry,
} = load('lib/ingredient-registry.ts');
const {
  countRecipeChildren,
  deleteCustomRecipe,
  findDuplicateCustomName,
  normalizeRecipeRows,
  sanitizeCustomRecipes,
  suggestIngredientNames,
  updateCustomRecipe,
} = load('lib/custom-recipes.ts');

const registry = buildIngredientRegistry(
  ['Gin', 'Lime juice', 'Simple Syrup'],
  [],
);

test('normalizeRecipeRows canonicalizes, deduplicates and aligns measures', () => {
  const { ingredients, measures } = normalizeRecipeRows(
    [
      { name: 'gin ', measure: '45 ml' },
      { name: '青柠汁', measure: '20 ml' },
      { name: 'Mystery Bitters', measure: '2 dashes' },
    ],
    registry,
  );
  assert.deepEqual(ingredients, ['Gin', 'Lime juice', 'Mystery Bitters']);
  assert.deepEqual(measures, ['45 ml', '20 ml', '2 dashes']);
});

test('normalizeRecipeRows merges duplicates keeping first non-empty measure', () => {
  const merged = normalizeRecipeRows(
    [
      { name: 'Gin', measure: '' },
      { name: 'Gin', measure: '45 ml' },
    ],
    registry,
  );
  assert.deepEqual(merged.ingredients, ['Gin']);
  assert.deepEqual(merged.measures, ['45 ml']);

  const firstWins = normalizeRecipeRows(
    [
      { name: 'Gin', measure: '30 ml' },
      { name: 'gin', measure: '45 ml' },
    ],
    registry,
  );
  assert.deepEqual(firstWins.measures, ['30 ml']);
});

test('normalizeRecipeRows omits measures when every measure is empty', () => {
  const result = normalizeRecipeRows(
    [
      { name: 'Gin', measure: ' ' },
      { name: 'Lime juice', measure: '' },
    ],
    registry,
  );
  assert.deepEqual(result.ingredients, ['Gin', 'Lime juice']);
  assert.equal(result.measures, undefined);
});

test('findDuplicateCustomName is case-insensitive and can exclude the edited id', () => {
  const recipes = [
    { id: 'a1', name: 'Smoked Negroni', isCustom: true },
    { id: 'b2', name: 'Negroni', isCustom: false },
  ];
  assert.equal(
    findDuplicateCustomName('smoked negroni', recipes)?.id,
    'a1',
  );
  assert.equal(findDuplicateCustomName('Negroni', recipes), undefined);
  assert.equal(
    findDuplicateCustomName('Smoked Negroni', recipes, 'a1'),
    undefined,
  );
});

test('updateCustomRecipe keeps id and likes stable', () => {
  const updated = updateCustomRecipe(
    [{ id: 'a1', name: 'Old', likes: 7, tags: ['My recipe'] }],
    'a1',
    { name: 'New', likes: 99, id: 'evil' },
  );
  assert.equal(updated[0].id, 'a1');
  assert.equal(updated[0].likes, 7);
  assert.equal(updated[0].name, 'New');
  assert.equal(updated[0].tags[0], 'My recipe');
});

test('deleteCustomRecipe removes the target and detaches children only', () => {
  const recipes = [
    { id: 'parent', name: 'Parent', parentId: null },
    { id: 'child', name: 'Child', parentId: 'parent' },
    { id: 'other', name: 'Other', parentId: 'base-id' },
  ];
  const { recipes: next, detached } = deleteCustomRecipe(recipes, 'parent');
  assert.equal(next.length, 2);
  assert.equal(next.find((r) => r.id === 'child').parentId, null);
  assert.equal(next.find((r) => r.id === 'other').parentId, 'base-id');
  assert.equal(detached, 1);
  assert.equal(countRecipeChildren(next, 'parent'), 0);
});

test('sanitizeCustomRecipes keeps legacy saves without measures and drops junk', () => {
  const legacy = {
    id: 'old-1',
    name: 'Old Fashioned Twist',
    ingredients: ['Bourbon Whiskey', 'Angostura bitters'],
    isCustom: true,
  };
  const result = sanitizeCustomRecipes([
    legacy,
    { id: 'bad', name: '', ingredients: ['Gin'] },
    { id: 'worse' },
    'not-a-recipe',
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'old-1');
  assert.equal(result[0].measures, undefined);
  assert.equal(result[0].method, 'Shake');
  assert.equal(result[0].glass, 'Cocktail');
  assert.equal(result[0].parentId, null);
  assert.deepEqual(sanitizeCustomRecipes(undefined), []);
});

test('sanitizeCustomRecipes truncates measures longer than ingredients', () => {
  const result = sanitizeCustomRecipes([
    {
      id: 'm1',
      name: 'M',
      ingredients: ['Gin', 'Lime juice'],
      measures: ['45 ml', '20 ml', '99 ml'],
    },
  ]);
  assert.deepEqual(result[0].measures, ['45 ml', '20 ml']);
});

test('suggestIngredientNames matches en, zh and aliases but not deleted records', () => {
  const manualRegistry = [
    ...registry,
    {
      id: 'custom:gone',
      nameEn: 'Ghost Syrup',
      nameZh: '幽灵糖浆',
      category: 'syrup',
      aliases: [],
      archived: false,
      deleted: true,
      custom: true,
    },
  ];
  assert.ok(suggestIngredientNames('gin', manualRegistry).includes('Gin'));
  assert.ok(suggestIngredientNames('青柠', manualRegistry).includes('Lime juice'));
  assert.equal(
    suggestIngredientNames('ghost', manualRegistry).includes('Ghost Syrup'),
    false,
  );
  assert.deepEqual(suggestIngredientNames('  ', manualRegistry), []);
});
