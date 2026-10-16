import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { Script } from 'node:vm';
import ts from 'typescript';

// Upstream error classification for the AI gateway, loaded the same way as
// tests/performance.test.mjs (pure TS modules, no Vite).

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

const { readUpstreamFailure } = load('lib/ai/provider-client.ts');

function jsonResponse(status, body) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('GLM billing codes on 429 map to ACCOUNT_UNAVAILABLE, not rate limit', async () => {
  for (const code of ['1112', '1113']) {
    const failure = await readUpstreamFailure(
      jsonResponse(429, { error: { code, message: 'irrelevant text' } }),
    );
    assert.equal(failure.code, 'ACCOUNT_UNAVAILABLE');
    assert.equal(failure.retryable, false);
    assert.equal(failure.detail, code);
  }
});

test('plain 429 with a non-billing code stays a retryable rate limit', async () => {
  const failure = await readUpstreamFailure(
    jsonResponse(429, { error: { code: '1302', message: 'slow down' } }),
  );
  assert.equal(failure.code, 'UPSTREAM_RATE_LIMITED');
  assert.equal(failure.retryable, true);
  assert.equal(failure.detail, '1302');
});

test('non-JSON 429 body maps by status only', async () => {
  const failure = await readUpstreamFailure(new Response('gateway timeout', { status: 429 }));
  assert.equal(failure.code, 'UPSTREAM_RATE_LIMITED');
  assert.equal(failure.retryable, true);
  assert.equal(failure.detail, undefined);
});

test('auth and balance statuses map to their own codes', async () => {
  assert.equal((await readUpstreamFailure(jsonResponse(401, {}))).code, 'KEY_INVALID');
  const balance = await readUpstreamFailure(jsonResponse(402, { error: { code: 'x' } }));
  assert.equal(balance.code, 'ACCOUNT_UNAVAILABLE');
  assert.equal(balance.detail, 'x');
});
