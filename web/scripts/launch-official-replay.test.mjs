import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const repo = fileURLToPath(new URL('../../', import.meta.url)), script = fileURLToPath(new URL('./launch-official-replay.mjs', import.meta.url));
const work = path.join(repo, 'work');
const receipt = { schema: 'stockinsider-official-launch-window-observation-v1', marketIndex: { months: [] }, chipWindow: { rows: [] } };
function fixture() {
  const root = fs.mkdtempSync(path.join(work, 'official-replay-cli-fixture-'));
  fs.chmodSync(root, 0o700);
  const input = path.join(root, 'metadata.json'); fs.writeFileSync(input, JSON.stringify(receipt), { mode: 0o600 });
  return { root, input };
}
function run(root, mode, input) {
  return spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', script, '--root', root, mode, input],
    { cwd: repo, encoding: 'utf8', timeout: 10000, env: { PATH: '/usr/bin:/bin' } });
}
test('offline CLI reads only explicit private work inputs and emits metadata, never raw data or rights', () => {
  const { root, input } = fixture(), result = run(root, '--receipt', input);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.scope, 'externally_reported_metadata_only');
  assert.equal(output.rawBodiesAvailable, false); assert.equal(output.redistributionAuthority, false);
});
test('offline CLI imports an actual bounded synthetic byte member without emitting its rows or transient contents', () => {
  const { root } = fixture(), directory = path.join(root, 'bodies'); fs.mkdirSync(directory, { mode: 0o700 });
  const marker = 'transient_fixture_marker_do_not_emit', bytes = JSON.stringify({ stat: 'OK', fields: ['日期', '收盤指數'], data: [['115/11/13', '1000']], marker }, null, 2);
  fs.writeFileSync(path.join(directory, 'index.json'), bytes, { mode: 0o600 });
  const observedAt = '2026-11-14T17:00:00Z', input = path.join(root, 'manifest.json');
  fs.writeFileSync(input, JSON.stringify({ schema: 'launch-official-public-replay-v1', parserContract: 'twse-t86-taiex-and-tpex-dailytrade-inx-v1',
    targets: [{ market: 'TWSE', symbol: '2330' }, { market: 'TPEX', symbol: '6488' }], throughSessions: ['2026-11-12', '2026-11-13'], cutoff: '2026-11-15T00:00:00Z',
    capture: { repository: 'fixture/offline', sourceCommit: 'a'.repeat(40), workflowPath: '.github/workflows/fixture.yml', runId: '1', runAttempt: 1, startedAt: null, completedAt: observedAt },
    indexMonths: { TWSE: ['2026-11'], TPEX: [] }, flowSessions: [], schemaEvidence: [], responses: [{ market: 'TWSE', kind: 'index_month', requestKey: '2026-11',
      sourceUrl: 'https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20261101', observedAt, publisherPublishedAt: null,
      httpStatus: 200, redirectCount: 0, contentType: 'application/json', bytes: Buffer.byteLength(bytes), rawSha256: createHash('sha256').update(bytes).digest('hex'),
      body: { encoding: 'file', path: 'bodies/index.json' } }] }), { mode: 0o600 });
  const result = run(root, '--manifest', input); assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout); assert.equal(output.parsedPages, 1); assert.equal(output.responseReceipts[0].indexRows, 1);
  assert.equal(output.sourceAuthority, false); assert.ok(!result.stdout.includes(marker)); assert.ok(!result.stdout.includes('"close"'));
});
test('offline CLI rejects outside roots, symlinks, broad permissions and oversized input without path disclosure', () => {
  const { root, input } = fixture(), outside = fixture(), link = path.join(root, 'linked.json'); fs.symlinkSync(input, link);
  const huge = path.join(root, 'large.json'); fs.writeFileSync(huge, ''); fs.truncateSync(huge, 1048577);
  for (const candidate of [outside.input, link, huge]) {
    const result = run(root, '--receipt', candidate);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, ''); assert.match(result.stderr, /official_exchange_replay_refused\s*$/u);
    assert.ok(!result.stderr.includes(candidate));
  }
  fs.chmodSync(root, 0o755);
  assert.equal(run(root, '--receipt', input).status, 1);
});
test('offline CLI refuses traversal/member symlinks and never follows a manifest descriptor outside its allowed directory', () => {
  const { root } = fixture(), outside = fixture(); fs.mkdirSync(path.join(root, 'bodies'), { mode: 0o700 });
  const memberLink = path.join(root, 'bodies', 'linked.json'); fs.symlinkSync(outside.input, memberLink);
  const input = path.join(root, 'manifest.json');
  for (const member of ['bodies/../../outside.json', 'bodies/linked.json']) {
    fs.writeFileSync(input, JSON.stringify({ responses: [{ bytes: 2, body: { encoding: 'file', path: member } }], schemaEvidence: [] }), { mode: 0o600 });
    const result = run(root, '--manifest', input);
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.match(result.stderr, /official_exchange_replay_refused\s*$/u); assert.ok(!result.stderr.includes(outside.input));
  }
});
