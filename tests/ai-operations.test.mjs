import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { Script } from 'node:vm';
import ts from 'typescript';

// Exercise the pure AI operation/repository modules without Vite or a
// browser, mirroring tests/performance.test.mjs. A localStorage + Web Locks
// shim stands in for the browser environment.

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
    { filename: id },
  ).runInThisContext();
}
virtualModules.set('virtual:cocktail-catalog', virtual('virtual:cocktail-catalog'));

// Browser shims: in-memory localStorage and a same-task Web Locks stand-in.
const storageMap = new Map();
globalThis.localStorage = {
  getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
  setItem: (key, value) => void storageMap.set(key, String(value)),
  removeItem: (key) => void storageMap.delete(key),
};
globalThis.window = { dispatchEvent() {} };
Object.defineProperty(globalThis, 'navigator', {
  value: { locks: { request: (_name, _options, task) => task() } },
  configurable: true,
});
globalThis.Event = class {};

const operations = load('lib/ai/operations.ts');
const repository = load('lib/app-storage-repository.ts');
const storageLib = load('lib/ingredient-storage.ts');
const registryLib = load('lib/ingredient-registry.ts');

function emptyState() {
  // Each test starts from the pristine default state; localStorage is the
  // in-memory shim declared above.
  storageMap.clear();
  const loaded = storageLib.loadAppStorage();
  assert.ok(loaded.ok);
  return loaded.state;
}

test('propose_create_recipe normalizes rows and previews without writing', () => {
  const state = emptyState();
  const proposal = operations.normalizeCreateRecipe(
    {
      name: "Bee's Knees",
      ingredientRows: [
        { name: 'Gin', measure: '50 ml' },
        { name: 'Honey Syrup', measure: '' },
        { name: 'Lemon juice', measure: '25 ml' },
        { name: ' gin ', measure: 'dup' },
      ],
      method: 'shake',
      glass: 'Coupe',
      instructions: 'Shake and strain.',
    },
    state,
    'turn-1',
  );
  assert.equal(proposal.status, 'awaiting_confirmation');
  assert.equal(proposal.after.type, 'recipe');
  assert.deepEqual(
    proposal.after.recipe.rows.map((row) => row.name),
    ['Gin', 'Honey Syrup', 'Lemon juice'],
  );
  assert.equal(proposal.after.recipe.method, 'Shake');
  // No business write happened during normalization.
  assert.equal(storageLib.loadAppStorage().state.customRecipes.length, 0);
});

test('propose_create_recipe rejects empty rows and bad method', () => {
  const state = emptyState();
  assert.throws(
    () => operations.normalizeCreateRecipe({ name: 'X', ingredientRows: [] }, state, 't'),
    /ingredientRows-empty/,
  );
  assert.throws(
    () =>
      operations.normalizeCreateRecipe(
        { name: 'X', ingredientRows: [{ name: 'Gin' }], method: 'Teleport' },
        state,
        't',
      ),
    /method-invalid/,
  );
});

test('propose_update_recipe refuses built-in recipes', () => {
  const state = emptyState();
  assert.throws(
    () => operations.normalizeUpdateRecipe({ recipeId: 'negroni', name: 'X' }, state, 't'),
    /recipe-not-custom/,
  );
});

test('setStock requires an unambiguous tracked target and absolute present', () => {
  const state = emptyState();
  assert.throws(
    () => operations.normalizeSetStock({ ingredient: 'No Such Thing', present: true }, state, 't'),
    /ingredient-not-found/,
  );
  assert.throws(
    () => operations.normalizeSetStock({ ingredient: 'Gin' }, state, 't'),
    /present-required-boolean/,
  );
  const proposal = operations.normalizeSetStock(
    { ingredient: 'gin', present: false },
    state,
    't',
  );
  assert.equal(proposal.after.type, 'stock');
  assert.equal(proposal.after.present, false);
});

test('commitAiOperation commits, replays idempotently and blocks unknown ids', async () => {
  const state = emptyState();
  const proposal = operations.normalizeSetStock(
    { ingredient: 'Gin', present: false },
    state,
    'turn-1',
  );
  const first = await repository.commitAiOperation(proposal.operation);
  assert.ok(first.ok, JSON.stringify(first));
  assert.equal(first.replayed, false);
  assert.equal(
    storageLib.loadAppStorage().state.stockIds.includes(
      proposal.operation.payload.ingredientId,
    ),
    false,
  );

  const replay = await repository.commitAiOperation(proposal.operation);
  assert.ok(replay.ok);
  assert.equal(replay.replayed, true);

  // Read the post-commit state without clearing storage, so the receipt from
  // the first commit is still present for the conflict check.
  const postCommit = storageLib.loadAppStorage().state;
  const mutated = operations.normalizeSetStock(
    { ingredient: 'Gin', present: true },
    postCommit,
    'turn-2',
  );
  mutated.operation.operationId = proposal.operation.operationId;
  const conflict = await repository.commitAiOperation(mutated.operation);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, 'INVALID_OPERATION');
});

test('commitAiOperation marks a proposal stale when the target changed', async () => {
  const state = emptyState();
  const proposal = operations.normalizeSetStock(
    { ingredient: 'Gin', present: false },
    state,
    'turn-1',
  );
  // Manual toggle between preview and confirmation.
  const manual = await repository.commitBusinessState((current) => ({
    ...current,
    stockIds: current.stockIds.filter(
      (id) => id !== proposal.operation.payload.ingredientId,
    ),
  }));
  assert.ok(manual.ok);
  const stale = await repository.commitAiOperation(proposal.operation);
  // The manual change already produced the desired state, so the fingerprint
  // precondition (present=true at preview time) fails.
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'STALE_PROPOSAL');
});

test('createIngredient rejects name collisions including deleted records', () => {
  const base = emptyState();
  const state = {
    ...base,
    ingredients: [
      {
        id: 'custom:gone',
        nameEn: 'Falernum',
        nameZh: '法勒南',
        category: 'liqueur',
        aliases: [],
        archived: false,
        deleted: true,
        custom: true,
      },
    ],
  };
  assert.throws(
    () =>
      operations.normalizeCreateIngredient(
        { nameEn: 'Falernum', nameZh: '法勒南', category: 'liqueur' },
        state,
        't',
      ),
    /ingredient-name-reserved/,
  );
});

test('archiveIngredient previews stock and recipe impacts', async () => {
  const state = emptyState();
  const ginId = registryLib.builtInIngredientId('Gin');
  const proposal = operations.normalizeArchiveIngredient(
    { ingredient: ginId },
    state,
    'turn-1',
  );
  assert.ok(proposal.impacts.some((impact) => impact.kind === 'leavesStock'));
  const committed = await repository.commitAiOperation(proposal.operation);
  assert.ok(committed.ok);
  const after = storageLib.loadAppStorage().state;
  assert.equal(after.stockIds.includes(ginId), false);
});
