import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// Test-only: preload is passed to pg_ctl and its isolated database, never Node or psql.
export function createIsolatedPgClock({ env = process.env, platform = process.platform,
  now = Date.now, taipeiTime = '12:00:00' } = {}) {
  const library = env.STOCKINSIDER_TEST_PG_CLOCK_LIBRARY;
  if (!library) {
    if (platform === 'linux' && env.CI === 'true') throw new Error('pg_clock_library_required');
    return Object.freeze({ mode: 'real_clock', childEnv: Object.freeze({ ...env }) });
  }
  if (platform !== 'linux') throw new Error('pg_clock_platform');
  for (const key of Object.keys(env)) {
    if (key === 'LD_PRELOAD' || key === 'LD_AUDIT' || key.startsWith('FAKETIME') ||
      key === 'NO_FAKE_STAT' || key.startsWith('DYLD_')) throw new Error('pg_clock_environment');
  }
  if (!path.isAbsolute(library) || library.includes(':') || /\s/u.test(library))
    throw new Error('pg_clock_library_path');
  let bytes;
  try {
    const stat = fs.lstatSync(library);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 16 * 1024 * 1024)
      throw new Error('pg_clock_library_file');
    bytes = fs.readFileSync(library);
  } catch (error) { throw new Error('pg_clock_library_unavailable', { cause: error }); }
  const instant = now();
  if (!Number.isFinite(instant) || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/u.test(taipeiTime))
    throw new Error('pg_clock_instant');
  const day = new Date(instant + 8 * 3600_000).toISOString().slice(0, 10);
  const target = Date.parse(`${day}T${taipeiTime}+08:00`);
  const offsetSeconds = Math.round((target - instant) / 1000);
  const childEnv = Object.freeze({ ...env, LD_PRELOAD: library,
    FAKETIME: `${offsetSeconds < 0 ? '' : '+'}${offsetSeconds}`,
    FAKETIME_DONT_FAKE_MONOTONIC: '1', NO_FAKE_STAT: '1', LC_ALL: 'C' });
  return Object.freeze({ mode: 'controlled_clock', childEnv, offsetSeconds,
    targetAt: new Date(target).toISOString(), libraryHash: createHash('sha256').update(bytes).digest('hex') });
}

export function boundedPgCommand(binary, args, { env = process.env, timeout = 5000 } = {}) {
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 30_000)
    throw new Error('pg_clock_command_timeout');
  return execFileSync(binary, args, { env, timeout, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function verifyIsolatedPgClock(sql, clock, { now = Date.now,
  monotonic = () => performance.now() } = {}) {
  if (clock.mode !== 'controlled_clock') return { mode: 'real_clock' };
  const deadline = monotonic() + 15_000;
  let calls = 0;
  const query = text => {
    const remaining = deadline - monotonic();
    if (++calls > 6 || !Number.isFinite(remaining) || remaining < 1) throw new Error('pg_clock_deadline');
    try { return sql(text, { timeout: Math.min(5000, Math.floor(remaining)) }); }
    finally { if (monotonic() >= deadline) throw new Error('pg_clock_deadline'); }
  };
  const read = () => {
    const value = Number(query('SELECT extract(epoch FROM clock_timestamp())')) * 1000;
    assert.ok(Number.isFinite(value) && Math.abs(value - (now() + clock.offsetSeconds * 1000)) <= 5000,
      'pg_clock_offset');
    return value;
  };
  const first = read();
  query('SELECT pg_sleep(0.1)');
  const second = read();
  assert.ok(second - first >= 50, 'pg_clock_not_advancing');
  let timedOut = false;
  try { query("SET statement_timeout='100ms'; SELECT pg_sleep(5)"); }
  catch (error) {
    if (!/canceling statement due to statement timeout/u.test(String(error.stderr ?? error.message))) throw error;
    timedOut = true;
  }
  assert.ok(timedOut, 'pg_clock_statement_timeout');
  return { mode: clock.mode, libraryHash: clock.libraryHash, offsetSeconds: clock.offsetSeconds,
    observedAt: new Date(second).toISOString() };
}

export function cleanIsolatedPgCluster({ cluster, temporary, stop }) {
  // Never remove a directory underneath a daemon whose shutdown is unconfirmed.
  if (fs.existsSync(path.join(cluster, 'postmaster.pid'))) stop();
  if (fs.existsSync(path.join(cluster, 'postmaster.pid'))) throw new Error(`pg_clock_cleanup_unconfirmed:${temporary}`);
  fs.rmSync(temporary, { recursive: true, force: true });
}
