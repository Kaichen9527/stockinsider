import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../web/src/lib/opportunity-v3/canonical.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const changeRelative = '.loop-engineering/state/changes/source-led-opportunity-engine-v3';
const change = path.join(root, changeRelative);
const recordRelative = `${changeRelative}/pcr-fulfillment-record-v1.json`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(args) {
  return execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function exactKeys(value, keys, label) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} keys`);
}

function assertSha(value, label, length = 64) {
  assert.match(value, new RegExp(`^[0-9a-f]{${length}}$`, 'u'), label);
}

function fixtureSha256(item) {
  return sha256(canonicalJson([
    'source-led-opportunity-product-correctness-fixture-v1',
    item.id,
    item.requirement,
    item.layer,
    item.setup,
    item.expected,
  ]));
}

function activeGraphSha256(treeSha) {
  const catalogRelative = `${changeRelative}/active-artifact-catalog-v3.json`;
  const catalogBytes = execFileSync('/usr/bin/git', ['cat-file', 'blob', `${treeSha}:${catalogRelative}`], { cwd: root });
  const catalog = JSON.parse(catalogBytes);
  const rows = catalog.activeFiles.map((file) => {
    const repositoryPath = `${changeRelative}/${file}`;
    const oid = git(['rev-parse', `${treeSha}:${repositoryPath}`]);
    const bytes = execFileSync('/usr/bin/git', ['cat-file', 'blob', oid], { cwd: root });
    return [file, oid, bytes.length, sha256(bytes)];
  });
  return sha256(canonicalJson(['opportunity-active-graph-v1', sha256(catalogBytes), rows]));
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert.ok(['--input', '--output'].includes(key) && typeof value === 'string', 'closed writer arguments');
    assert.equal(values[key], undefined, `one ${key}`);
    values[key] = value;
  }
  assert.equal(typeof values['--input'], 'string', 'writer input required');
  assert.equal(typeof values['--output'], 'string', 'writer output required');
  assert.ok(values['--output'].endsWith(recordRelative), 'writer output must use the exact fulfillment path');
  return values;
}

function validateInput(input, expected) {
  exactKeys(input, ['entries', 'implementationCommitSha', 'implementationTreeSha', 'reviewedRange', 'schema'], 'fulfillment writer input');
  assert.equal(input.schema, 'source-led-opportunity-pcr-fulfillment-input-v1', 'writer input schema');
  assert.equal(input.implementationCommitSha, expected.commitSha, 'writer implementation commit');
  assert.equal(input.implementationTreeSha, expected.treeSha, 'writer implementation tree');
  assert.match(input.reviewedRange, new RegExp(`^[0-9a-f]{40}\\.\\.${expected.commitSha}$`, 'u'), 'writer exact reviewed range');
  const inventory = JSON.parse(readFileSync(path.join(change, 'acceptance-tests.json'), 'utf8'));
  const boundaries = JSON.parse(readFileSync(path.join(change, 'pcr-implementation-boundaries-v3.json'), 'utf8'));
  const expectedRows = inventory.cases.filter(({ id }) => id.startsWith('PCR-')).map((item) => {
    const boundary = boundaries.boundaries.find(({ id }) => id === item.id);
    assert.ok(boundary, `${item.id} boundary`);
    return [item.id, fixtureSha256(item), boundary];
  });
  assert.deepEqual(input.entries.map(({ id }) => id), expectedRows.map(([id]) => id), 'writer PCR rows closed and ordered');
  for (const [index, [id, fixtureSha, boundary]] of expectedRows.entries()) {
    const entry = input.entries[index];
    exactKeys(entry, ['caller', 'execution', 'fixtureSha256', 'id', 'owner', 'resultDependency'], `writer ${id}`);
    assert.equal(entry.id, id, `writer ${id} identity`);
    assert.equal(entry.fixtureSha256, fixtureSha, `writer ${id} fixture`);
    assert.deepEqual(entry.owner, boundary.owner, `writer ${id} owner`);
    assert.deepEqual(entry.caller, boundary.caller, `writer ${id} caller`);
    assert.notEqual(entry.owner.path, entry.caller.path, `writer ${id} distinct boundary`);
    exactKeys(entry.resultDependency, ['consumerFunction', 'consumerPath', 'kind'], `writer ${id} dependency`);
    assert.equal(entry.resultDependency.consumerPath, entry.caller.path, `writer ${id} consumer path`);
    assert.equal(entry.resultDependency.consumerFunction, entry.caller.function, `writer ${id} consumer function`);
    assert.ok(['persisted_row', 'returned_value', 'serialized_response'].includes(entry.resultDependency.kind), `writer ${id} dependency kind`);
    exactKeys(entry.execution, ['commandName', 'commandSha256', 'exitCode', 'failed', 'passed', 'skipped', 'stdoutSha256', 'testName', 'todo'], `writer ${id} execution`);
    for (const key of ['commandSha256', 'stdoutSha256']) assertSha(entry.execution[key], `writer ${id} ${key}`);
    assert.match(entry.execution.commandName, /\S/u, `writer ${id} command`);
    assert.match(entry.execution.testName, /\S/u, `writer ${id} test`);
    assert.equal(entry.execution.exitCode, 0, `writer ${id} exit`);
    assert.ok(entry.execution.passed > 0, `writer ${id} pass`);
    for (const key of ['failed', 'skipped', 'todo']) assert.equal(entry.execution[key], 0, `writer ${id} ${key}`);
  }
  return input;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const expected = {
    commitSha: git(['rev-parse', 'HEAD']),
    treeSha: git(['rev-parse', 'HEAD^{tree}']),
  };
  const input = validateInput(JSON.parse(readFileSync(args['--input'], 'utf8')), expected);
  const record = {
    activeGraphSha256: activeGraphSha256(expected.treeSha),
    entries: input.entries,
    implementationCommitSha: expected.commitSha,
    implementationTreeSha: expected.treeSha,
    reviewedRange: input.reviewedRange,
    schema: 'source-led-opportunity-pcr-fulfillment-record-v1',
  };
  record.recordSha256 = sha256(canonicalJson(record));
  writeFileSync(args['--output'], `${canonicalJson(record)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${canonicalJson({ entries: record.entries.length, recordSha256: record.recordSha256, status: 'written' })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`PCR fulfillment writer failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
