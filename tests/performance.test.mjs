import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { Script } from 'node:vm';
import ts from 'typescript';

// Exercise the pure TypeScript modules without starting Vite or a browser.
const require = createRequire(import.meta.url);
const cache = new Map();
const virtualModules = new Map();
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
  const localRequire = (id) => {
    if (virtualModules.has(id))
      return { __esModule: true, default: virtualModules.get(id) };
    return id.startsWith('.')
      ? load(resolve(dirname(filename), id + '.ts'))
      : require(id);
  };
  new Script(`(function(require, module, exports) {${code}\n})`, {
    filename,
  }).runInThisContext()(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const plugin = load('tools/cocktail-catalog-plugin.ts').cocktailCatalogPlugin();
plugin.configResolved({ root: process.cwd(), command: 'serve' });
const context = { addWatchFile() {} };
function virtual(id) {
  const source = plugin.load.call(context, '\0' + id);
  return new Script(
    `(${source.replace('export default', '').replace(/;$/, '')})`,
    {
      filename: id,
    },
  ).runInThisContext();
}
const summaries = virtual('virtual:cocktail-catalog');
const details = virtual('virtual:cocktail-details');
virtualModules.set('virtual:cocktail-catalog', summaries);
const data = load('lib/data.ts');
const registry = load('lib/ingredient-registry.ts');
const ingredients = load('lib/ingredients.ts');
const recipes = load('lib/cocktail-index.ts');
const names = data.baseCocktails.flatMap((recipe) => recipe.ingredients);
const records = registry.buildIngredientRegistry(names);
const normalize = (value) =>
  value.trim().normalize('NFC').replace(/\s+/g, ' ').toLocaleLowerCase();
function scan(name, items) {
  const raw = normalize(name);
  const canonical = normalize(ingredients.canonicalIngredientName(name));
  const matches = items.filter(
    (record) =>
      normalize(record.nameEn) === raw ||
      normalize(record.nameZh) === raw ||
      normalize(record.nameEn) === canonical ||
      record.aliases.some(
        (alias) => normalize(alias) === raw || normalize(alias) === canonical,
      ),
  );
  return [...new Map(matches.map((record) => [record.id, record])).values()];
}

test('indexed queries preserve original name, alias, ambiguity and duplicate-ID semantics', () => {
  const queries = [
    ...names,
    ...records.flatMap((record) => [record.nameZh, ...record.aliases]),
    'missing ingredient',
    ' GIN ',
    ' gin\t',
  ];
  for (const query of queries)
    assert.deepEqual(
      registry.findManagedIngredients(query, records),
      scan(query, records),
    );
  const overlapping = [
    { ...records[0], id: 'a', nameEn: 'Shared', aliases: ['Collision'] },
    {
      ...records[0],
      id: 'b',
      nameEn: 'Other',
      nameZh: 'Shared',
      aliases: ['Collision'],
    },
    {
      ...records[0],
      id: 'a',
      nameEn: 'Shared',
      aliases: ['Collision'],
      deleted: true,
    },
  ];
  for (const query of ['Shared', 'Collision']) {
    assert.deepEqual(
      registry.findManagedIngredients(query, overlapping),
      scan(query, overlapping),
    );
  }
  const renamed = records.map((record, index) =>
    index ? record : { ...record, nameEn: 'Renamed', aliases: [record.nameEn] },
  );
  assert.equal(
    registry.findManagedIngredient('Renamed', renamed).id,
    records[0].id,
  );
  assert.equal(registry.findManagedIngredient('Renamed', records), undefined);
  assert.equal(
    registry.findManagedIngredient(records[0].nameEn, renamed).id,
    records[0].id,
  );
});

test('cached availability preserves all recipes, optional ingredients, aliases and deleted references', () => {
  const deletedId = registry.builtInIngredientId('Gin');
  const snapshots = [
    records,
    records.map((record) =>
      record.id === deletedId ? { ...record, deleted: true } : record,
    ),
    records.map((record) =>
      record.id === deletedId ? { ...record, archived: true } : record,
    ),
  ];
  for (const snapshot of snapshots) {
    const index = recipes.buildCocktailIndex(data.baseCocktails, snapshot);
    const stockIds = data.initialStock
      .map(registry.builtInIngredientId)
      .filter((id) => !snapshot.find((r) => r.id === id)?.archived);
    const status = recipes.calculateAvailability(index, stockIds);
    let makeable = 0;
    let near = 0;
    for (const recipe of data.baseCocktails) {
      const missing = new Map();
      for (const name of recipe.ingredients) {
        const record = scan(name, snapshot)[0];
        const id = record?.id ?? registry.builtInIngredientId(name);
        const optional =
          !record?.deleted &&
          ['mixer', 'garnish'].includes(
            record?.category ?? ingredients.ingredientCategory(name),
          );
        if (record?.deleted || (!optional && !stockIds.includes(id)))
          missing.set(id, record?.nameEn ?? name);
      }
      const actual = status.byId.get(recipe.id);
      assert.deepEqual(actual.missing, [...missing.values()]);
      assert.equal(
        actual.broken,
        recipe.ingredients.some((name) => scan(name, snapshot)[0]?.deleted),
      );
      if (!missing.size) makeable++;
      else if (missing.size <= 2) near++;
      assert.deepEqual(
        index.variants.get(recipe.parentId ?? recipe.id) ?? [],
        data.baseCocktails.filter(
          (item) => item.parentId === (recipe.parentId ?? recipe.id),
        ),
      );
    }
    assert.deepEqual(status.counts, {
      all: data.baseCocktails.length,
      makeable,
      near,
    });
  }
});

test('catalog keeps searchable metadata while loading measures and instructions separately', () => {
  assert.equal(summaries.length, names.length ? data.baseCocktails.length : 0);
  for (const recipe of summaries) {
    assert.ok(recipe.name && recipe.ingredients.length && details[recipe.id]);
    if (recipe.id !== 'negroni') {
      assert.equal(recipe.measures, undefined);
      assert.equal(recipe.instructions, undefined);
    }
    assert.equal(details[recipe.id].measures.length, recipe.ingredients.length);
    if (recipe.image)
      assert.ok(recipe.image.startsWith('/resource/data/cocktails/'));
  }
  const negroni = summaries.find((recipe) => recipe.id === 'negroni');
  assert.deepEqual(negroni.measures, ['30ml', '30ml', '30ml']);
});

test('production catalog uses identical public asset URLs in browser and Worker SSR', () => {
  const buildPlugin = load(
    'tools/cocktail-catalog-plugin.ts',
  ).cocktailCatalogPlugin();
  buildPlugin.configResolved({ root: process.cwd(), command: 'build' });
  const emitted = new Map();
  const buildContext = {
    addWatchFile() {},
    emitFile(asset) {
      emitted.set(asset.fileName, asset.source);
      return asset.fileName;
    },
  };
  const source = buildPlugin.load.call(
    buildContext,
    '\0virtual:cocktail-catalog',
  );
  assert.ok(!source.includes('import.meta'));
  const catalog = new Script(
    `(${source.replace('export default', '').replace(/;$/, '')})`,
  ).runInThisContext();
  assert.equal(catalog.length, summaries.length);
  for (const recipe of catalog) {
    if (!recipe.image) continue;
    assert.match(recipe.image, /^\/assets\/cocktails\/[a-f0-9]{16}-/);
    assert.ok(emitted.get(decodeURIComponent(recipe.image.slice(1)))?.length);
  }
});

test('legacy storage migration retains unmatched names, favorites and custom recipes', () => {
  const storage = load('lib/ingredient-storage.ts');
  const values = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  try {
    const custom = {
      ...data.baseCocktails[0],
      id: 'test-custom',
      isCustom: true,
    };
    values.set(
      data.storageKey,
      JSON.stringify({
        stock: ['GIN', 'Unmatched'],
        liked: ['negroni'],
        customRecipes: [custom],
      }),
    );
    const loaded = storage.loadAppStorage();
    assert.equal(loaded.ok, true);
    assert.ok(
      loaded.state.stockIds.includes(registry.builtInIngredientId('Gin')),
    );
    assert.deepEqual(loaded.state.liked, ['negroni']);
    assert.deepEqual(loaded.state.customRecipes, [custom]);
    assert.ok(
      loaded.state.migrationIssues.some((issue) => issue.value === 'Unmatched'),
    );
    const gin = records.find(
      (record) => record.id === registry.builtInIngredientId('Gin'),
    );
    loaded.state.ingredients = [{ ...gin, deleted: true }];
    storage.saveAppStorage(loaded.state);
    const reloaded = storage.loadAppStorage();
    assert.equal(reloaded.ok, true);
    assert.ok(!reloaded.state.stockIds.includes(gin.id));
    assert.ok(reloaded.state.ingredients[0].deleted);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test('report equivalent full-dataset query timings', () => {
  let started = performance.now();
  const before = names.map((name) => scan(name, records)[0]?.id);
  const scanMs = performance.now() - started;
  started = performance.now();
  const after = names.map(
    (name) => registry.findManagedIngredient(name, records)?.id,
  );
  const indexMs = performance.now() - started;
  assert.deepEqual(after, before);
  console.log(
    JSON.stringify({
      queries: names.length,
      scanMs: Math.round(scanMs),
      indexMs: Number(indexMs.toFixed(2)),
    }),
  );
});
