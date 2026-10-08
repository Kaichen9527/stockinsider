import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { createIsolatedPgClock, verifyIsolatedPgClock, boundedPgCommand, cleanIsolatedPgCluster } from './isolated-pg-clock.mjs';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'si-clock-unit-'));
const library = path.join(temporary, 'libfaketime.so.1');
fs.writeFileSync(library, 'unit-fixture-not-an-executable-library');
process.on('exit', () => fs.rmSync(temporary, { recursive: true, force: true }));
const environment = { STOCKINSIDER_TEST_PG_CLOCK_LIBRARY: library };
const make = (extra = {}) => createIsolatedPgClock({ platform: 'linux', env: environment,
  now: () => Date.parse('2026-10-08T23:58:00Z'), ...extra });

test('Taipei date uses host instant, and one advancing offset is reused', () => {
  const before = { ...environment }; const clock = make();
  assert.equal(clock.targetAt, '2026-10-09T04:00:00.000Z');
  assert.equal(clock.offsetSeconds, 14520);
  assert.equal(clock.childEnv.FAKETIME, '+14520s');
  assert.equal(clock.childEnv.FAKETIME_DONT_FAKE_MONOTONIC, '1');
  assert.equal(clock.childEnv.NO_FAKE_STAT, '1');
  assert.equal(clock.childEnv.LD_PRELOAD, library);
  assert.deepEqual(environment, before);
  assert.equal(clock.childEnv, clock.childEnv);
  assert.match(clock.libraryHash, /^[a-f0-9]{64}$/u);
});
test('Linux CI cannot fall back to real time; explicit local mode is labelled', () => {
  assert.throws(() => make({ env: { CI: 'true' } }), /clock_library_required/u);
  assert.equal(make({ platform: 'darwin', env: {} }).mode, 'real_clock');
  assert.throws(() => make({ platform: 'darwin' }), /clock_platform/u);
});
test('invalid paths, inherited injection and invalid time fail closed', () => {
  for (const value of ['relative.so', temporary, `${library}.missing`])
    assert.throws(() => make({ env: { STOCKINSIDER_TEST_PG_CLOCK_LIBRARY: value } }), /clock_library/u);
  for (const name of ['LD_PRELOAD', 'FAKETIME', 'FAKETIME_TIMESTAMP_FILE', 'FAKETIME_DONT_RESET', 'DYLD_INSERT_LIBRARIES'])
    assert.throws(() => make({ env: { ...environment, [name]: 'injected' } }), /clock_environment/u);
  assert.throws(() => make({ now: () => NaN }), /clock_instant/u);
});
test('controlled canary checks time, advancement and original SQL timeout', () => {
  const clock = make(); let call = 0;
  const sql = query => {
    call++;
    if (query.includes('statement_timeout')) throw new Error('canceling statement due to statement timeout');
    if (query.includes('pg_sleep')) return '';
    return String((Date.parse('2026-10-09T04:00:00Z') + (call > 1 ? 100 : 0)) / 1000);
  };
  const result = verifyIsolatedPgClock(sql, clock, { now: () => Date.parse('2026-10-08T23:58:00Z') });
  assert.equal(result.mode, 'controlled_clock'); assert.equal(call, 4);
});
test('frozen, wrong-offset and absent timeout canaries fail without fallback', () => {
  const clock = make();
  for (const wrong of [false, true]) assert.throws(() => verifyIsolatedPgClock(query => {
    if (query.includes('statement_timeout')) throw new Error('canceling statement due to statement timeout');
    if (query.includes('pg_sleep')) return '';
    return String((Date.parse(wrong ? '2026-10-08T04:00:00Z' : '2026-10-09T04:00:00Z')) / 1000);
  }, clock, { now: () => Date.parse('2026-10-08T23:58:00Z') }), /clock_(offset|not_advancing)/u);
  let count = 0;
  assert.throws(() => verifyIsolatedPgClock(query => query.includes('pg_sleep') ? '' :
    String((Date.parse('2026-10-09T04:00:00Z') + count++ * 100) / 1000), clock,
  { now: () => Date.parse('2026-10-08T23:58:00Z') }), /clock_statement_timeout/u);
});
test('canary uses one parent monotonic deadline', () => {
  let tick = 0;
  assert.throws(() => verifyIsolatedPgClock(() => '1', make(), {
    now: () => 0, monotonic: () => tick++ * 16000,
  }), /clock_deadline/u);
});
test('unpreloaded parent bounds hung commands and output', () => {
  const start = performance.now();
  assert.throws(() => boundedPgCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'],
    { timeout: 80 }), /ETIMEDOUT/u);
  assert.ok(performance.now() - start < 3000);
  assert.throws(() => boundedPgCommand(process.execPath, ['-e', "process.stdout.write('x'.repeat(2000000))"]), /ENOBUFS/u);
});
test('unconfirmed stop preserves this test cluster; confirmed stop permits cleanup', () => {
  const directory = fs.mkdtempSync(path.join(temporary, 'cleanup-'));
  const cluster = path.join(directory, 'cluster'); fs.mkdirSync(cluster);
  const pid = path.join(cluster, 'postmaster.pid'); fs.writeFileSync(pid, 'unit fixture');
  assert.throws(() => cleanIsolatedPgCluster({ cluster, temporary: directory,
    stop: () => { throw new Error('simulated stop timeout'); } }), /stop timeout/u);
  assert.ok(fs.existsSync(pid));
  assert.throws(() => cleanIsolatedPgCluster({ cluster, temporary: directory, stop: () => {} }), /cleanup_unconfirmed/u);
  assert.ok(fs.existsSync(pid));
  cleanIsolatedPgCluster({ cluster, temporary: directory, stop: () => fs.unlinkSync(pid) });
  assert.equal(fs.existsSync(directory), false);
});
