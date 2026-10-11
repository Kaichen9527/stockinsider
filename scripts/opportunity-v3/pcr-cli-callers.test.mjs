import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const filename = path.join(root, 'scripts/runtime/auth-source-worker-cli.js');
const actualRequire = createRequire(filename);
const codec = actualRequire('./codec.js');
const credentials = actualRequire('./credential-resolver.js');
const { CONFIG_FILE_SHA256 } = actualRequire('./source-run-config.js');
const originalConfig = readFileSync(path.join(root, 'config/runtime/auth-source-dag.json'));

// Only OS credential lookup and the external adapter are isolated. CLI main,
// configuration validation, worker, bundle hashing and handlers are real code.
// No production environment, Keychain, provider or database is accessed.
function harness(configPath, acquireResult, acquireError = null) {
  const calls = []; let output = '';
  const forbidden = () => { throw new Error('unexpected fixture adapter operation'); };
  const adapter = {
    acquireLegacyProducerLease: async (input) => {
      calls.push(['acquire', input]);
      if (acquireError) throw acquireError;
      return acquireResult;
    },
    claimLegacyProducerJob: forbidden, heartbeatLegacyProducerJob: forbidden,
    completeLegacyProducerJob: forbidden, appendLegacyRuntimeFailureDiagnostic: forbidden,
    failLegacyProducerJob: forbidden, close: async () => { calls.push(['close']); },
  };
  const resolve = (reference) => {
    calls.push(['credential', reference]);
    const fixtures = {
      'keychain:stockinsider-runtime:supabase-url': 'https://test-only.supabase.co',
      'keychain:stockinsider-runtime:supabase-service-role-key': 'test-only-no-real-key'.repeat(2),
      'keychain:stockinsider-runtime:internal-api-key': 'test-only-internal-key',
      'keychain:stockinsider-runtime:database-url': 'postgresql://fixture:fixture@fixture.supabase.co/postgres?sslmode=require',
    };
    if (!(reference in fixtures)) throw new Error('optional fixture credential absent');
    return fixtures[reference];
  };
  const processFixture = { argv: [process.execPath, filename, '--config', configPath],
    env: { HOME: path.dirname(configPath), NODE_ENV: 'production', PATH: '/usr/bin:/bin', TZ: 'Asia/Taipei',
      INTERNAL_API_KEY_REF: 'keychain:stockinsider-runtime:internal-api-key',
      STOCKINSIDER_SUPABASE_URL_REF: 'keychain:stockinsider-runtime:supabase-url',
      STOCKINSIDER_SUPABASE_SERVICE_ROLE_KEY_REF: 'keychain:stockinsider-runtime:supabase-service-role-key',
      STOCKINSIDER_REVIEWED_COMMIT_SHA: 'a'.repeat(40) },
    stdout: { write: (bytes) => { output += bytes; } } };
  const fixtureRequire = (name) => {
    if (name === './credential-resolver') return { ...credentials,
      hydrateRuntimeCredentials: (environment, unused, options) => credentials.hydrateRuntimeCredentials(environment, resolve, options),
      resolveCredentialReference: resolve,
      resolvePostgresConnectionReference: (reference) => credentials.resolvePostgresConnectionReference(reference, resolve) };
    if (name === './postgres-legacy-producer-adapter') return {
      createPostgresLegacyProducerAdapter: (input) => { calls.push(['create', input]); return adapter; } };
    return actualRequire(name);
  };
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(filename, 'utf8'),
    { require: fixtureRequire, module, exports: module.exports, __filename: filename,
      __dirname: path.dirname(filename), process: processFixture,
      Buffer, console, setTimeout, clearTimeout, URL, structuredClone,
      fetch: () => { throw new Error('provider access forbidden'); } },
    { filename });
  return { main: module.exports.main, calls, processFixture, output: () => output };
}

test('PCR-005 actual CLI main passes validated canonical configuration to real worker acquisition', async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'stockinsider-pcr005-test-only-'));
  try {
    const configPath = path.join(temporary, 'config.json'); writeFileSync(configPath, originalConfig);
    const run = harness(configPath, { disposition: 'owner_already_leased', runId: 'fixture-run' });
    await run.main();
    const acquisition = run.calls.find(([name]) => name === 'acquire')[1];
    assert.deepEqual(acquisition.configBytes, originalConfig);
    assert.equal(acquisition.configSha256, CONFIG_FILE_SHA256);
    assert.equal(acquisition.ownerLabel, 'com.stockinsider.auth-source-worker');
    assert.equal(acquisition.sourceCommitSha, 'a'.repeat(40));
    assert.equal(acquisition.leaseSeconds, 120);
    assert.match(acquisition.workerSha256, /^[0-9a-f]{64}$/u);
    assert.match(acquisition.ownerToken, /^[0-9a-f-]{36}$/u);
    assert.equal(run.calls.at(-1)[0], 'close');
    writeFileSync(configPath, Buffer.from(originalConfig.toString().replace('120', '121')));
    const invalid = harness(configPath, null);
    await assert.rejects(invalid.main(), /scheduler config hash mismatch/u);
    assert.deepEqual(invalid.calls, [], 'invalid configuration must not resolve credentials or create/acquire adapter');
    assert.equal(invalid.output(), '');
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test('PCR-006 actual CLI serializes real durable worker returns and closes adapter on acquisition failure', async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'stockinsider-pcr006-test-only-'));
  try {
    const configPath = path.join(temporary, 'config.json'); writeFileSync(configPath, originalConfig);
    for (const terminal of [null, { disposition: 'owner_already_leased', runId: 'fixture-run' },
      { disposition: 'retained_success', status: 'succeeded', runId: 'fixture-run' },
      { disposition: 'fixture_non_trading', status: 'non_trading_occurrence', runId: 'fixture-run' },
      { disposition: 'acquired', status: 'running', runId: 'fixture-run', job: null }]) {
      const run = harness(configPath, terminal); await run.main();
      const expected = terminal?.status === 'running'
        ? { disposition: 'incomplete_job_graph', runId: 'fixture-run', completedJobs: 0 }
        : terminal ?? { disposition: 'lease_unavailable' };
      assert.equal(run.output(), `${codec.canonicalJson({ schema: 'tracked-auth-source-worker-v1', ...expected })}\n`);
      assert.equal(run.calls.at(-1)[0], 'close');
      assert.equal(run.calls.filter(([name]) => name === 'acquire').length, 1);
    }
    const failure = new Error('test-only acquisition failure');
    const rejected = harness(configPath, null, failure);
    await assert.rejects(rejected.main(), (error) => error === failure);
    assert.equal(rejected.output(), '', 'rejection cannot serialize a successful terminal envelope');
    assert.equal(rejected.calls.at(-1)[0], 'close');
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
