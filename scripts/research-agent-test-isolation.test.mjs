import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const scripts = read('package.json').scripts;

test('research release artifact fixtures run only after the other research files finish', () => {
  const invocations = scripts['test:research-agents'].split(' && ');
  const prefix = 'node scripts/run-node22.js --experimental-strip-types --test ';
  assert.equal(invocations.length, 2);
  assert.ok(invocations[0].startsWith(prefix));
  assert.ok(!invocations[0].includes('scripts/research-release-artifacts.test.mjs'));
  assert.ok(invocations[0].includes('scripts/research-atomic-publication-postgres.test.mjs'));
  assert.ok(invocations[0].includes('scripts/research-input-preparation-postgres.test.mjs'));
  assert.equal(invocations[1], prefix + 'scripts/research-release-artifacts.test.mjs');
});

test('research test isolation leaves every approved script catalog value unchanged', () => {
  const inventory = read('.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json');
  const webScripts = read('web/package.json').scripts;
  assert.equal(inventory.scriptValueRows.length, 14);
  assert.ok(!inventory.scriptValueRows.some(([key]) => key === 'test:research-agents'));
  for (const [key, expected] of inventory.scriptValueRows) {
    const actual = key.startsWith('web:') ? webScripts[key.slice(4)] : scripts[key];
    assert.equal(actual, expected, key);
  }
});
