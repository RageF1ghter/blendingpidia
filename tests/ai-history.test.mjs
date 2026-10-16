import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { Script } from 'node:vm';
import ts from 'typescript';

// Model-history construction for the AI controller, loaded like the other
// pure-module tests.

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

const { buildModelHistory } = load('lib/ai/history.ts');

const call = (id) => ({ id, type: 'function', function: { name: 'list_stock', arguments: '{}' } });

test('complete tool rounds pass through in order', () => {
  const built = buildModelHistory(
    [
      { id: '1', role: 'user', content: 'hi', createdAt: '1' },
      { id: '2', role: 'assistant', content: '', toolCalls: [call('a')], createdAt: '2' },
      { id: '3', role: 'tool', content: '{"ok":true}', toolCallId: 'a', createdAt: '3' },
      { id: '4', role: 'assistant', content: 'done', createdAt: '4' },
    ],
    () => undefined,
    40,
  );
  assert.deepEqual(
    built.map((message) => message.role),
    ['user', 'assistant', 'tool', 'assistant'],
  );
});

test('dangling tool calls get synthesized interrupted results (the 400 bug)', () => {
  // This is exactly what the stale-ref race produced: an assistant
  // tool_calls message whose tool results are missing.
  const built = buildModelHistory(
    [
      { id: '1', role: 'user', content: 'hi', createdAt: '1' },
      { id: '2', role: 'assistant', content: '', toolCalls: [call('a'), call('b')], createdAt: '2' },
    ],
    () => undefined,
    40,
  );
  assert.equal(built.length, 4);
  assert.deepEqual(
    built.map((message) => message.role),
    ['user', 'assistant', 'tool', 'tool'],
  );
  for (const message of built.slice(2)) {
    assert.equal(message.role, 'tool');
    assert.equal(JSON.parse(message.content).error, 'interrupted');
  }
});

test('dangling calls are also repaired mid-history before the next user message', () => {
  const built = buildModelHistory(
    [
      { id: '1', role: 'user', content: 'q1', createdAt: '1' },
      { id: '2', role: 'assistant', content: '', toolCalls: [call('a')], createdAt: '2' },
      { id: '3', role: 'user', content: 'q2', createdAt: '3' },
    ],
    () => undefined,
    40,
  );
  assert.deepEqual(
    built.map((message) => message.role),
    ['user', 'assistant', 'tool', 'user'],
  );
});

test('orphan and duplicate tool results are dropped', () => {
  const built = buildModelHistory(
    [
      { id: '1', role: 'user', content: 'hi', createdAt: '1' },
      { id: '2', role: 'tool', content: 'orphan', toolCallId: 'zzz', createdAt: '2' },
      { id: '3', role: 'assistant', content: '', toolCalls: [call('a')], createdAt: '3' },
      { id: '4', role: 'tool', content: '{"ok":true}', toolCallId: 'a', createdAt: '4' },
      { id: '5', role: 'tool', content: '{"dup":true}', toolCallId: 'a', createdAt: '5' },
    ],
    () => undefined,
    40,
  );
  assert.deepEqual(
    built.map((message) => message.role),
    ['user', 'assistant', 'tool'],
  );
  assert.equal(JSON.parse(built[2].content).ok, true);
});

test('confirmed proposal outcomes are substituted into tool results', () => {
  const built = buildModelHistory(
    [
      { id: '1', role: 'user', content: 'add gin', createdAt: '1' },
      { id: '2', role: 'assistant', content: '', toolCalls: [call('a')], createdAt: '2' },
      {
        id: '3',
        role: 'tool',
        content: JSON.stringify({ status: 'pending_confirmation', proposalId: 'p1' }),
        toolCallId: 'a',
        createdAt: '3',
      },
    ],
    (proposalId) =>
      proposalId === 'p1'
        ? { status: 'committed', committedAt: '2026-10-15T00:00:00Z', replayed: false }
        : undefined,
    40,
  );
  const substituted = JSON.parse(built[2].content);
  assert.equal(substituted.status, 'committed');
  assert.equal(substituted.replayed, false);
});

test('window is trimmed at a user-message boundary', () => {
  const messages = [];
  for (let round = 0; round < 5; round += 1) {
    messages.push({ id: `u${round}`, role: 'user', content: `q${round}`, createdAt: String(round) });
    messages.push({ id: `a${round}`, role: 'assistant', content: `r${round}`, createdAt: String(round) });
  }
  const built = buildModelHistory(messages, () => undefined, 3);
  // Window [a3, u4, a4] trims forward to the first user message: [u4, a4].
  assert.equal(built.length, 2);
  assert.equal(built[0].content, 'q4');
});
