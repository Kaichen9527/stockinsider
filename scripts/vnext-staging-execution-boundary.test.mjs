import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publicKeyFingerprint, HOST_PUBLIC_KEY, DEVELOPMENT_EXECUTOR_ID } from '../deployment/staging/vnext/verify.mjs';
import { EXECUTION_READINESS_REQUIREMENTS, inspectExecutionBoundary, executeReadOnlyPreflight, verifyExecutionBoundaryFixture } from '../deployment/staging/vnext/execution-boundary.mjs';

// Public wire-format fixture only; no cryptographic identity is generated.
const publicKey = 'ssh-ed25519 ' + Buffer.concat([Buffer.from([0, 0, 0, 11]), Buffer.from('ssh-ed25519'), Buffer.from([0, 0, 0, 32]), Buffer.alloc(32, 7)]).toString('base64');
const sourcePlan = JSON.parse(fs.readFileSync(new URL('../deployment/staging/vnext/plan.json', import.meta.url)));
const plan = { ...structuredClone(sourcePlan), writerRelease: 'b'.repeat(40), connection: { ...sourcePlan.connection, destinationTailnetIPv4: '100.101.102.103', intendedExecutorId: 'fixture_staging_executor', clientPublicKey: publicKey, clientFingerprint: publicKeyFingerprint(publicKey), clientExpiresUtc: '2026-11-07T12:30:00Z' } };
const now = '2026-11-07T12:00:00Z';
const observation = { namespace: plan.namespace, uid: 1234, storageOwner: 0, diskAvailable: 25 * 1073741824, memoryAvailable: 3 * 1073741824, scope: 'read-only staging preflight only', stdinIsTty: false, applicationIsolation: 'NOT_PROVISIONED', databaseIsolation: 'NOT_PROVISIONED' };
const response = { status: 0, stdout: JSON.stringify(observation), stderr: '', timedOut: false };
function fixture(changes = {}) {
  const calls = [];
  const adapter = { kind: 'FixtureAdapterOnly', open: request => { calls.push(['open', request]); return { fixtureSessionId: 'fixture_one' }; }, execute: (request, session) => { calls.push(['execute', request, session]); return structuredClone(response); }, close: cleanup => { calls.push(['close', cleanup]); return { closed: true, remainingResources: 0 }; }, ...changes };
  return { calls, options: { now, agentPublicKeys: [publicKey], knownHostsLine: 'vmi3152467 ' + HOST_PUBLIC_KEY + '\n', adapter } };
}
function connection(patch) { return { ...plan, connection: { ...plan.connection, ...patch } }; }

test('closed production facade remains Disabled with every complete public fixture', async () => {
  const status = inspectExecutionBoundary(plan, { now });
  assert.equal(status.state, 'Disabled');
  assert.equal(status.executable, false);
  assert.equal(status.platformReadiness, 'NOT_OBSERVED');
  assert.equal(status.platformAdapter, 'NOT_IMPLEMENTED_NOT_ADMITTED');
  assert.equal(status.stagingAcceptance, 'NOT_RUN');
  assert.deepEqual(EXECUTION_READINESS_REQUIREMENTS.map(item => item.id), ['independent_platform_executor', 'official_sidecar_broker', 'platform_approval', 'ephemeral_agent_provenance']);
  assert.ok(EXECUTION_READINESS_REQUIREMENTS.every(item => item.state === 'NOT_OBSERVED'));
  assert.throws(() => { status.requirements[0].state = 'ready'; }, TypeError);
  await assert.rejects(executeReadOnlyPreflight(plan, { now }), /verified_platform_execution_integration_unavailable/u);
  const { options, calls } = fixture();
  for (const patch of [{ adapter: options.adapter }, { ready: true }, { approval: true }, { provenance: { verified: true } }, { platformAdapter: options.adapter }]) {
    await assert.rejects(executeReadOnlyPreflight(plan, { now, ...patch }), /caller_execution_overrides_forbidden/u);
  }
  assert.deepEqual(calls, []);
});

test('default plan and development executor intent reject before fixture invocation', async () => {
  const { options, calls } = fixture();
  await assert.rejects(verifyExecutionBoundaryFixture(sourcePlan, options), /invalid_staging_plan/u);
  for (const p of [connection({ intendedExecutorId: DEVELOPMENT_EXECUTOR_ID }), connection({ destinationTailnetIPv4: '5.104.83.211' }), connection({ destinationPort: 443 }), connection({ hostFingerprint: publicKeyFingerprint(publicKey) }), connection({ forcedCommand: 'id' }), connection({ officialConnector: { ...plan.connection.officialConnector, ready: true } })]) await assert.rejects(verifyExecutionBoundaryFixture(p, options), /invalid_staging_plan/u);
  assert.deepEqual(calls, []);
});

test('expiry, public fingerprint and exact single agent fixture fail before invocation', async () => {
  const { options, calls } = fixture();
  for (const clientExpiresUtc of ['2026-11-07T12:00:00Z', '2026-11-07T13:00:01Z']) await assert.rejects(verifyExecutionBoundaryFixture(connection({ clientExpiresUtc }), options), /client_expiry/u);
  for (const agentPublicKeys of [[], [publicKey, publicKey], [HOST_PUBLIC_KEY]]) await assert.rejects(verifyExecutionBoundaryFixture(plan, { ...options, agentPublicKeys }), /exact_single_fixture_agent_identity_required/u);
  await assert.rejects(verifyExecutionBoundaryFixture(plan, { ...options, knownHostsLine: 'other ' + HOST_PUBLIC_KEY + '\n' }), /fixture_host_pin_mismatch/u);
  for (const invalidNow of ['2026-02-30T12:00:00Z', '2026-11-07', null]) await assert.rejects(verifyExecutionBoundaryFixture(plan, { ...options, now: invalidNow }), /explicit_valid_utc_now_required/u);
  assert.deepEqual(calls, []);
});

test('single immutable request retains official route, exact SSH boundary and no executable', async () => {
  const { options, calls } = fixture();
  const result = await verifyExecutionBoundaryFixture(plan, options);
  assert.deepEqual(calls.map(call => call[0]), ['open', 'execute', 'close']);
  const request = calls[0][1];
  assert.equal(calls[1][1], request);
  assert.equal(request.executable, false);
  assert.equal(request.executorIntent, plan.connection.intendedExecutorId);
  assert.deepEqual({ ...request.connectorIntent, reference: undefined }, { reference: undefined, path: 'official-outer-executor-sidecar-CONNECT', proxy: 'proxy:8088', destination: '100.101.102.103', port: 22 });
  assert.equal(request.sshIntent.hostFingerprint, plan.connection.hostFingerprint);
  assert.equal(request.sshIntent.clientFingerprint, plan.connection.clientFingerprint);
  assert.equal(request.sshIntent.clientExpiresUtc, plan.connection.clientExpiresUtc);
  assert.equal(request.sshIntent.user, 'si-vnext-oct22');
  assert.equal(request.sshIntent.forcedCommand, 'vnext-preflight-v1');
  assert.equal(request.timeoutMs, 15000);
  assert.equal(request.maxOutputBytes, 262144);
  assert.equal(request.stdin, '');
  assert.equal(request.commands, 1);
  assert.equal(request.pty, false);
  assert.equal(request.forwarding, false);
  for (const option of ['StrictHostKeyChecking=yes', 'IdentitiesOnly=yes', 'ForwardAgent=no', 'ClearAllForwardings=yes', 'ProxyCommand=none', 'ProxyJump=none', 'ControlMaster=no']) assert.ok(request.sshIntent.argumentTemplate.includes(option));
  assert.throws(() => { request.connectorIntent.destination = '100.64.1.1'; }, TypeError);
  assert.equal(result.state, 'FixtureOnly');
  assert.equal(result.executable, false);
  assert.equal(result.platformReadiness, 'NOT_OBSERVED');
  assert.equal(result.stagingAcceptance, 'NOT_RUN');
  assert.equal(result.cleanup, 'FIXTURE_CONFIRMED');
  assert.equal(result.projected.capacityReady, true);
  assert.equal(result.isolation.application, 'NOT_PROVISIONED');
  assert.equal(result.isolation.database, 'NOT_PROVISIONED');
  assert.equal(result.isolation.writer, 'NOT_OBSERVED');
  assert.equal(inspectExecutionBoundary(plan, { now }).state, 'Disabled');
});

test('capacity shortfall remains explicit and never becomes application isolation', async () => {
  const { options } = fixture({ execute: () => ({ ...response, stdout: JSON.stringify({ ...observation, diskAvailable: 16 * 1073741824 }) }) });
  const result = await verifyExecutionBoundaryFixture(plan, options);
  assert.equal(result.state, 'FixtureOnly');
  assert.equal(result.projected.capacityReady, false);
  assert.equal(result.isolation.application, 'NOT_PROVISIONED');
});

test('malformed, oversized, duplicate, trailing, nested and unknown gateway JSON close and reject', async () => {
  for (const stdout of ['not-json', ' '.repeat(262145), response.stdout + '{}', '\u00a0' + response.stdout, response.stdout + '\ufeff', response.stdout.replace('{', '{"uid":0,'), response.stdout.replace('"uid":1234', '"uid":{"value":1234}'), JSON.stringify({ ...observation, ready: true }), response.stdout.replace('}', ',}'), response.stdout.replace('"uid":1234', '"uid":01')]) {
    const { options, calls } = fixture({ execute: () => ({ ...response, stdout }) });
    await assert.rejects(verifyExecutionBoundaryFixture(plan, options), /fixture_execution_rejected/u);
    assert.equal(calls.at(-1)[0], 'close');
    assert.equal(calls.at(-1)[1].outcome, 'rejected');
  }
});

test('response failure, timeout, unexpected stderr and forged provisioning always close', async () => {
  const badResponses = [{ ...response, status: 255 }, { ...response, timedOut: true }, { ...response, stderr: 'untrusted provider text' }, { ...response, signal: 'SIGTERM' }, { ...response, stdout: JSON.stringify({ ...observation, applicationIsolation: 'PROVISIONED' }) }, { ...response, stdout: JSON.stringify({ ...observation, databaseIsolation: 'PROVISIONED' }) }, { ...response, stdout: JSON.stringify({ ...observation, diskAvailable: '999999999999' }) }, { ...response, stdout: JSON.stringify({ ...observation, memoryAvailable: -1 }) }, { ...response, stdout: JSON.stringify({ ...observation, uid: 0 }) }];
  for (const bad of badResponses) {
    const { options, calls } = fixture({ execute: () => bad });
    await assert.rejects(verifyExecutionBoundaryFixture(plan, options), /^Error: fixture_execution_rejected$/u);
    assert.equal(calls.at(-1)[0], 'close');
  }
});

test('partial open failure and rejected execution both close exactly once without reflecting errors', async () => {
  for (const stage of ['open', 'execute']) {
    let closed = 0;
    const { options } = fixture({ [stage]: () => { throw Error('sensitive untrusted adapter text'); }, close: cleanup => { closed++; assert.equal(cleanup.outcome, 'rejected'); return { closed: true, remainingResources: 0 }; } });
    await assert.rejects(verifyExecutionBoundaryFixture(plan, options), /^Error: fixture_execution_rejected$/u);
    assert.equal(closed, 1);
  }
});

test('cleanup failures or retained fixture resources cannot return FixtureOnly', async () => {
  for (const close of [() => { throw Error('untrusted'); }, () => ({ closed: false, remainingResources: 0 }), () => ({ closed: true, remainingResources: 1 }), () => ({ closed: true, remainingResources: 0, ready: true })]) {
    await assert.rejects(verifyExecutionBoundaryFixture(plan, fixture({ close }).options), /fixture_cleanup_not_confirmed/u);
  }
});

test('actual bounded deadline aborts execution and confirms cooperative fixture cleanup', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let entered;
  const executing = new Promise(resolve => { entered = resolve; });
  let closed = 0;
  let aborted = false;
  const { options } = fixture({ execute: (_request, _session, signal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(Error('deadline cancellation')); }, { once: true });
    entered();
  }), close: () => { closed++; return { closed: true, remainingResources: 0 }; } });
  const pending = verifyExecutionBoundaryFixture(plan, options);
  await executing;
  t.mock.timers.tick(15000);
  await assert.rejects(pending, /fixture_execution_rejected/u);
  assert.equal(aborted, true);
  assert.equal(closed, 1);
});

test('bounded cleanup deadline rejects without claiming confirmed cleanup', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let entered;
  const closing = new Promise(resolve => { entered = resolve; });
  let cleanupAborted = false;
  const { options } = fixture({ close: (_cleanup, signal) => new Promise(() => {
    signal.addEventListener('abort', () => { cleanupAborted = true; }, { once: true });
    entered();
  }) });
  const pending = verifyExecutionBoundaryFixture(plan, options);
  await closing;
  t.mock.timers.tick(15000);
  await assert.rejects(pending, /fixture_cleanup_not_confirmed/u);
  assert.equal(cleanupAborted, true);
});

test('unsettled adapter work taints cleanup despite claimed zero; late allocation closes again', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let enterExecute;
  let finishExecute;
  let enterLateClose;
  let closeCount = 0;
  let allocated = 0;
  const executing = new Promise(resolve => { enterExecute = resolve; });
  const lateClosed = new Promise(resolve => { enterLateClose = resolve; });
  const { options } = fixture({ execute: () => new Promise(resolve => { finishExecute = () => { allocated++; resolve(response); }; enterExecute(); }), close: () => {
    allocated = 0; closeCount++;
    if (closeCount === 2) enterLateClose();
    return { closed: true, remainingResources: 0 };
  } });
  const pending = verifyExecutionBoundaryFixture(plan, options);
  await executing;
  t.mock.timers.tick(15000);
  // Allow cancellation rejection to install the independent settlement timer.
  for (let turn = 0; turn < 12; turn++) await Promise.resolve();
  t.mock.timers.tick(15000);
  await assert.rejects(pending, /fixture_cleanup_not_confirmed/u);
  assert.equal(closeCount, 1);
  finishExecute();
  await lateClosed;
  assert.equal(allocated, 0);
  assert.equal(closeCount, 2);
});

test('pre-cancel rejects before open; cancellation during execute signals and closes once', async () => {
  const already = new AbortController(); already.abort();
  const before = fixture();
  await assert.rejects(verifyExecutionBoundaryFixture(plan, { ...before.options, signal: already.signal }), /fixture_cancelled/u);
  assert.deepEqual(before.calls, []);
  const cancel = new AbortController();
  let closed = 0;
  let adapterAborted = false;
  const { options } = fixture({ execute: (_request, _session, signal) => new Promise((_, reject) => { signal.addEventListener('abort', () => { adapterAborted = true; reject(Error('cancelled')); }, { once: true }); cancel.abort(); }), close: cleanup => { closed++; assert.equal(cleanup.outcome, 'rejected'); return { closed: true, remainingResources: 0 }; } });
  await assert.rejects(verifyExecutionBoundaryFixture(plan, { ...options, signal: cancel.signal }), /fixture_execution_rejected/u);
  assert.equal(adapterAborted, true);
  assert.equal(closed, 1);
});

test('cancelled late open/execute settles before cleanup, reclaiming late fixture allocations', async () => {
  for (const stage of ['open', 'execute']) {
    const cancel = new AbortController();
    let allocated = 0;
    let closed = 0;
    let executed = 0;
    const late = () => new Promise(resolve => {
      cancel.abort();
      setTimeout(() => { allocated++; resolve(stage === 'open' ? { fixtureSessionId: 'fixture_late' } : response); }, 5);
    });
    const { options } = fixture({
      open: stage === 'open' ? late : () => ({ fixtureSessionId: 'fixture_one' }),
      execute: stage === 'execute' ? late : () => { executed++; return response; },
      close: (cleanup, signal) => {
        assert.ok(signal instanceof AbortSignal);
        assert.equal(signal.aborted, false);
        assert.ok(cleanup.session.fixtureSessionId.startsWith('fixture_'));
        assert.equal(allocated, 1);
        assert.equal(cleanup.outcome, 'rejected');
        allocated = 0; closed++;
        return { closed: true, remainingResources: allocated };
      },
    });
    await assert.rejects(verifyExecutionBoundaryFixture(plan, { ...options, signal: cancel.signal }), /fixture_execution_rejected/u);
    assert.equal(allocated, 0);
    assert.equal(closed, 1);
    if (stage === 'open') assert.equal(executed, 0);
  }
});

test('fixture adapter shape/session and arbitrary execution metadata cannot enter boundary', async () => {
  const f = fixture();
  await assert.rejects(verifyExecutionBoundaryFixture(plan, { ...f.options, approval: true }), /unsupported_fixture_options/u);
  await assert.rejects(verifyExecutionBoundaryFixture(plan, { ...f.options, adapter: { ...f.options.adapter, kind: 'PlatformAdapter' } }), /explicit_fixture_adapter_required/u);
  await assert.rejects(verifyExecutionBoundaryFixture(plan, { ...f.options, adapter: { ...f.options.adapter, proxyCommand: 'anything' } }), /explicit_fixture_adapter_required/u);
  for (const session of [{ fixtureSessionId: 'actual' }, { fixtureSessionId: 'fixture_one', handle: 'socket' }, null]) await assert.rejects(verifyExecutionBoundaryFixture(plan, fixture({ open: () => session }).options), /fixture_execution_rejected/u);
});

test('execution source imports no process/network/filesystem access and exposes no registration', () => {
  const source = fs.readFileSync(new URL('../deployment/staging/vnext/execution-boundary.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:child_process|net|http|https|tls|fs)|process\.(?:env|argv)|spawnSync|execFile|ssh-add|ssh-keygen|export (?:async )?function register/u);
  const facade = source.slice(source.indexOf('export async function executeReadOnlyPreflight'), source.indexOf('function fixtureRequest'));
  assert.doesNotMatch(facade, /adapter\.|verifyExecutionBoundaryFixture|open\(|execute\(/u);
});
