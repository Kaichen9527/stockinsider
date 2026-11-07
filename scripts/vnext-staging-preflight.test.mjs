import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePlan, capacity, publicKeyFingerprint, prepareOfflineRequest, verifyOfflineFixture, HOST_PUBLIC_KEY, HOST_FINGERPRINT, DEVELOPMENT_EXECUTOR_ID } from '../deployment/staging/vnext/verify.mjs';
const incomplete = JSON.parse(fs.readFileSync(new URL('../deployment/staging/vnext/plan.json', import.meta.url)));
// Public wire-format fixtures only. No key generation, private material or agent.
function fixtureKey(byte) {
  return 'ssh-ed25519 ' + Buffer.concat([Buffer.from([0, 0, 0, 11]), Buffer.from('ssh-ed25519'), Buffer.from([0, 0, 0, 32]), Buffer.alloc(32, byte)]).toString('base64');
}
const clientPublicKey = fixtureKey(1);
const now = '2026-11-07T12:00:00Z';
const complete = { ...structuredClone(incomplete), writerRelease: 'b'.repeat(40), connection: {
  ...structuredClone(incomplete.connection), destinationTailnetIPv4: '100.101.102.103', intendedExecutorId: 'synthetic_staging_executor',
  clientPublicKey, clientFingerprint: publicKeyFingerprint(clientPublicKey), clientExpiresUtc: '2026-11-07T12:30:00Z',
} };
const observation = { namespace: complete.namespace, uid: 1234, storageOwner: 0, diskAvailable: 25 * 1073741824, memoryAvailable: 3 * 1073741824, scope: 'read-only staging preflight only', stdinIsTty: false, applicationIsolation: 'NOT_PROVISIONED', databaseIsolation: 'NOT_PROVISIONED' };
function fixture(patch = {}) {
  return { now, agentPublicKeys: [clientPublicKey], knownHostsLine: 'vmi3152467 ' + HOST_PUBLIC_KEY + '\n', childRunner: () => ({ status: 0, stdout: JSON.stringify(observation) }), ...patch };
}
function connection(patch) { return { ...complete, connection: { ...complete.connection, ...patch } }; }

test('incomplete source plan retains exact gaps and an offline connector hold', () => {
  assert.deepEqual(validatePlan(incomplete), ['isolated_candidate_writer_identity_required', 'single_tailnet_ipv4_tcp22_required', 'exact_client_public_fingerprint_required', 'explicit_client_utc_expiry_required', 'dedicated_executor_binding_required']);
  assert.deepEqual(validatePlan(complete), []);
  assert.equal(prepareOfflineRequest(complete, now).mode, 'OFFLINE_NOT_ADMITTED');
});
test('staging executor intent must differ from this development executor, without proving readiness', () => {
  assert.ok(validatePlan(connection({ intendedExecutorId: DEVELOPMENT_EXECUTOR_ID })).includes('dedicated_executor_binding_required'));
  const request = prepareOfflineRequest(complete, now);
  assert.equal(request.platformReadiness, 'NOT_OBSERVED');
  assert.equal(request.executable, false);
});
test('retained owner public host key recomputes to the existing receipt pin', () => {
  assert.equal(publicKeyFingerprint(HOST_PUBLIC_KEY), HOST_FINGERPRINT);
  const receipt = JSON.parse(fs.readFileSync(new URL('../docs/operations/2026-11-07/vnext/SSH-READINESS-RECEIPT.json', import.meta.url)));
  assert.equal(receipt.environmentId, DEVELOPMENT_EXECUTOR_ID);
  assert.equal(receipt.operatorAttested.publicHostFingerprint, HOST_FINGERPRINT);
  assert.equal(receipt.operatorAttested.publicHostKey.split(' ').slice(0, 2).join(' '), HOST_PUBLIC_KEY);
});
test('staging cannot reuse formal names, schedules, ports or reduced resource guards', () => {
  for (const patch of [{ storage: '/opt/stockinsider' }, { service: 'stockinsider-web-standalone.service' }, { database: 'postgres' }, { fixtureOnly: 1 }, { scheduledJobsEnabled: true }, { listenAddress: '0.0.0.0' }, { ports: { web: 80, rest: 3301, database: 5432 } }, { resourceBudgetBytes: { ...complete.resourceBudgetBytes, diskFloor: 1 } }, { applicationNetworkNamespace: { ...complete.applicationNetworkNamespace, productionNetworkNamespaceReuse: true } }]) assert.ok(validatePlan({ ...complete, ...patch }).length);
});
test('only one canonical tailnet IPv4 destination and remote TCP22 are accepted', () => {
  for (const destinationTailnetIPv4 of ['5.104.83.211', '127.0.0.1', '100.63.255.255', '100.128.0.1', '100.64.256.1', '100.064.1.2', '100.64.1.2/32', '100.64.1.2,100.64.1.3', 'stage.example', '100.64.1.2;id', '-oProxyCommand=anything', '::1', null]) assert.ok(validatePlan(connection({ destinationTailnetIPv4 })).includes('single_tailnet_ipv4_tcp22_required'));
  for (const destinationPort of [443, '22', 0, 65535]) assert.ok(validatePlan(connection({ destinationPort })).includes('single_tailnet_ipv4_tcp22_required'));
  for (const destinationTailnetIPv4 of ['100.64.0.0', '100.127.255.255']) assert.deepEqual(validatePlan(connection({ destinationTailnetIPv4 })), []);
});
test('unknown transport/alias/connector executable/ready fields never create admission', () => {
  for (const patch of [{ transport: 'direct-ssh' }, { sourceTag: 'tag:production' }, { destinationTag: 'tag:any' }, { sshUser: 'root' }, { forcedCommand: 'vnext-preflight-v1;id' }, { proxyCommand: 'anything' }, { officialConnector: { ...complete.connection.officialConnector, ready: true } }, { officialConnector: { ...complete.connection.officialConnector, executable: '/usr/bin/socat' } }, { officialConnector: { ...complete.connection.officialConnector, status: 'READY' } }]) assert.ok(validatePlan(connection(patch)).length);
  assert.ok(validatePlan({ ...complete, sshAlias: 'any' }).includes('unsupported_plan_fields'));
  assert.ok(validatePlan(connection({ publicPaths: { ...complete.connection.publicPaths, agentSocket: '/tmp/arbitrary.sock' } })).length);
});
test('changed host pin, malformed public key and wrong client fingerprint fail closed', () => {
  for (const patch of [{ hostPublicKey: fixtureKey(2) }, { hostFingerprint: publicKeyFingerprint(fixtureKey(2)) }, { clientFingerprint: HOST_FINGERPRINT }, { clientPublicKey: 'ssh-ed25519 AAAA' }, { clientPublicKey: clientPublicKey + '\n' + fixtureKey(2) }, { clientPublicKey: '-----BEGIN OPENSSH PRIVATE KEY-----' }]) assert.ok(validatePlan(connection(patch)).length);
  assert.throws(() => publicKeyFingerprint('ssh-rsa AAAA'), /single_ed25519_public_key_required/u);
});
test('static SSH arguments lock trust, public-only agent selection and the forced command', () => {
  const request = prepareOfflineRequest(complete, now);
  const args = request.sshArgumentTemplate;
  assert.deepEqual(args.slice(0, 8), ['-F', '/dev/null', '-T', '-n', '-p', '22', '-l', 'si-vnext-oct22']);
  assert.deepEqual(args.slice(-2), ['100.101.102.103', 'vnext-preflight-v1']);
  const options = args.flatMap((arg, i) => arg === '-o' ? [args[i + 1]] : []);
  for (const option of ['StrictHostKeyChecking=yes', 'HostKeyAlgorithms=ssh-ed25519', 'HostKeyAlias=vmi3152467', 'GlobalKnownHostsFile=/dev/null', 'IdentitiesOnly=yes', 'PreferredAuthentications=publickey', 'PasswordAuthentication=no', 'KbdInteractiveAuthentication=no', 'ForwardAgent=no', 'ForwardX11=no', 'ClearAllForwardings=yes', 'Tunnel=no', 'RequestTTY=no', 'PermitLocalCommand=no', 'ProxyCommand=none', 'ProxyJump=none', 'ControlMaster=no', 'ControlPath=none', 'ControlPersist=no', 'RemoteCommand=none']) assert.ok(options.includes(option), option);
  assert.ok(options.includes('IdentityFile=/run/stockinsider-vnext-staging/client.pub'));
  assert.ok(options.includes('IdentityAgent=/run/stockinsider-vnext-staging/agent.sock'));
  assert.equal(args.some(arg => ['-A', '-L', '-R', '-D', '-J', '-tt'].includes(arg)), false);
  assert.equal(request.executable, false);
  assert.equal(request.platformReadiness, 'NOT_OBSERVED');
  assert.equal(request.connector, 'NOT_IMPLEMENTED_NOT_ADMITTED');
});
test('ephemeral client expiry must be valid UTC, future and within one hour', () => {
  for (const clientExpiresUtc of ['2026-11-07T12:00:00Z', '2026-11-07T11:59:59Z', '2026-11-07T13:00:01Z']) assert.throws(() => prepareOfflineRequest(connection({ clientExpiresUtc }), now), /client_expiry_must_be_future_within_one_hour/u);
  for (const clientExpiresUtc of ['2026-02-30T12:30:00Z', '2026-11-07T12:30:00+00:00', null]) assert.ok(validatePlan(connection({ clientExpiresUtc })).includes('explicit_client_utc_expiry_required'));
  assert.equal(prepareOfflineRequest(connection({ clientExpiresUtc: '2026-11-07T13:00:00Z' }), now).executable, false);
});
test('agent/key mismatch, missing or multiple identities reject before mock child invocation', () => {
  let calls = 0;
  for (const agentPublicKeys of [[], [fixtureKey(2)], [clientPublicKey, fixtureKey(2)], [clientPublicKey, clientPublicKey]]) {
    assert.throws(() => verifyOfflineFixture(complete, fixture({ agentPublicKeys, childRunner: () => { calls++; } })), /exact_single_ephemeral_agent_identity_required/u);
  }
  assert.equal(calls, 0);
});
test('known_hosts must contain only the retained exact host/key binding', () => {
  let calls = 0;
  for (const knownHostsLine of ['100.101.102.103 ' + HOST_PUBLIC_KEY + '\n', 'vmi3152467 ' + fixtureKey(2) + '\n', 'vmi3152467 ' + HOST_PUBLIC_KEY + '\nother ' + HOST_PUBLIC_KEY + '\n', '@cert-authority * ' + HOST_PUBLIC_KEY + '\n']) {
    assert.throws(() => verifyOfflineFixture(complete, fixture({ knownHostsLine, childRunner: () => { calls++; } })), /dedicated_known_hosts_pin_mismatch/u);
  }
  assert.equal(calls, 0);
});
test('mock-only successful gateway observation never establishes live transport or app isolation', () => {
  const calls = [];
  const result = verifyOfflineFixture(complete, fixture({ childRunner: request => { calls.push(request); return { status: 0, stdout: JSON.stringify(observation) }; } }));
  assert.equal(calls.length, 1); assert.equal(calls[0].fixtureOnly, true);
  assert.equal(calls[0].binary, '/usr/bin/ssh');
  assert.equal(calls[0].stdin, ''); assert.equal(calls[0].timeout, 15000);
  assert.equal(result.evidence, 'SYNTHETIC_FIXTURE_ONLY'); assert.equal(result.mode, 'OFFLINE_NOT_ADMITTED');
  assert.equal(result.projected.ready, true); assert.equal(result.stagingAcceptance, 'NOT_RUN');
  assert.match(result.isolationProof, /^PENDING/u);
});
test('gateway root/wrong scope/PTY/false provisioning/malformed capacity never pass', () => {
  for (const patch of [{ uid: 0 }, { uid: 1.5 }, { namespace: 'production' }, { storageOwner: 1234 }, { stdinIsTty: true }, { scope: 'shell' }, { applicationIsolation: 'PROVISIONED' }, { databaseIsolation: 'PROVISIONED' }, { diskAvailable: '999999999999' }, { memoryAvailable: -1 }]) assert.throws(() => verifyOfflineFixture(complete, fixture({ childRunner: () => ({ status: 0, stdout: JSON.stringify({ ...observation, ...patch }) }) })));
  for (const result of [{ status: 255, stdout: '' }, { status: 0, stdout: 'not-json' }, { status: 0, stdout: ' '.repeat(262145) }]) assert.throws(() => verifyOfflineFixture(complete, fixture({ childRunner: () => result })));
});
test('capacity deducts the full workload and retains15GiB disk/1.5GiB memory', () => {
  assert.equal(capacity(complete, { diskAvailable: 20 * 1073741824, memoryAvailable: 3 * 1073741824 }).ready, true);
  assert.equal(capacity(complete, { diskAvailable: 16 * 1073741824, memoryAvailable: 3 * 1073741824 }).ready, false);
  assert.equal(capacity(complete, { diskAvailable: 25 * 1073741824, memoryAvailable: 2 * 1073741824 }).ready, false);
  for (const diskAvailable of [null, NaN, Infinity, -1, 1.1]) assert.throws(() => capacity(complete, { diskAvailable, memoryAvailable: 3 * 1073741824 }), /invalid_capacity_observation/u);
});
test('CLI source has no process runner, networking imports or environment/key-file reads', () => {
  const source = fs.readFileSync(new URL('../deployment/staging/vnext/verify.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:child_process|net|http|https|tls)|process\.env|spawnSync|execFile|ssh-add|ssh-keygen/u);
  assert.equal((source.match(/fs\.readFileSync\(/gu) || []).length, 1);
  assert.match(source, /fs\.readFileSync\(defaultPlan\)/u);
  assert.doesNotMatch(source.slice(source.indexOf('function main()')), /childRunner|error\.message/u);
  assert.match(source, /console\.error\('staging_offline_preparation_failed'\)/u);
});
