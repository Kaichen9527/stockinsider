#!/usr/bin/env node
/** Offline preparation only. No subprocess, agent, key-file, environment or network
 * access. The official sidecar connector is not implemented or admitted here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const defaultPlan = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plan.json');
export const HOST_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICb2EOs2bC/szIaSZyXr/slT5iLFqXLFS1VLWepWMj4X';
// Public identifier retained from the existing readiness receipt; never reuse
// this development executor as the intended dedicated staging executor.
export const DEVELOPMENT_EXECUTOR_ID = 'ccarenv_b64_Y2NhcmVudl82ODU0YWE3YmQ3MjA4MTkxYjJiNTQxYTc1M2NkOTM3Zg';
export const HOST_FINGERPRINT = 'SHA256:yQ4VCXl76rLr6Zep0ybQcHZeK4CfuFmMiZcWJrp2DYg';
export const VPN_REFERENCE = 'skill://plugin_connector_1p_c5b7d5df5d7081918f2c4be5a633ed5d/cloud-environment-runtime/references/vpn.md';
const PUBLIC_PATHS = Object.freeze({ agentSocket: '/run/stockinsider-vnext-staging/agent.sock', clientPublicKey: '/run/stockinsider-vnext-staging/client.pub', knownHosts: '/run/stockinsider-vnext-staging/known_hosts' });
const fingerprintPattern = /^SHA256:[A-Za-z0-9+/]{43}$/u;
function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
export function publicKeyFingerprint(line) {
  if (typeof line !== 'string' || !/^ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: [A-Za-z0-9_.@-]+)?$/u.test(line)) throw Error('single_ed25519_public_key_required');
  const encoded = line.split(' ')[1]; const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded || bytes.length !== 51 || bytes.readUInt32BE(0) !== 11 || bytes.subarray(4, 15).toString() !== 'ssh-ed25519' || bytes.readUInt32BE(15) !== 32) throw Error('ed25519_wire_format_required');
  return 'SHA256:' + createHash('sha256').update(bytes).digest('base64').replace(/=+$/u, '');
}
function tailnetIPv4(value) {
  if (typeof value !== 'string' || !/^100\.(?:0|[1-9][0-9]{0,2})\.(?:0|[1-9][0-9]{0,2})\.(?:0|[1-9][0-9]{0,2})$/u.test(value)) return false;
  const parts = value.split('.').map(Number);
  return parts[1] >= 64 && parts[1] <= 127 && parts[2] <= 255 && parts[3] <= 255;
}
export function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') return ['plan_object_required'];
  const keys = ['schemaVersion', 'namespace', 'identityMode', 'service', 'database', 'schema', 'queueNamespace', 'storage', 'writerRelease', 'runtimeIdentity', 'ports', 'listenAddress', 'fixtureOnly', 'scheduledJobsEnabled', 'resourceBudgetBytes', 'applicationNetworkNamespace', 'connection'];
  if (!exactKeys(plan, keys)) errors.push('unsupported_plan_fields');
  if (plan.schemaVersion !== 'stockinsider-vnext-isolated-staging-v2') errors.push('schema_version');
  if (!/^stockinsider-vnext-[a-z0-9-]+-staging$/u.test(plan.namespace || '')) errors.push('unique_staging_namespace');
  if (plan.service !== plan.namespace + '.service' || plan.queueNamespace !== plan.namespace || plan.storage !== '/srv/' + plan.namespace || plan.runtimeIdentity !== plan.namespace) errors.push('isolation_names');
  if (plan.database !== (typeof plan.namespace === 'string' ? plan.namespace.replaceAll('-', '_') : null) || plan.schema !== 'public') errors.push('independent_database_required');
  if (plan.listenAddress !== '127.0.0.1' || plan.fixtureOnly !== true || plan.scheduledJobsEnabled !== false) errors.push('fixture_loopback_no_schedules');
  const ports = Object.values(plan.ports || {});
  if (!exactKeys(plan.ports, ['web', 'rest', 'database']) || new Set(ports).size !== 3 || ports.some(p => !Number.isInteger(p) || p < 34000 || p > 34999)) errors.push('isolated_ports');
  const minimum = { diskFloor: 16106127360, diskWarning: 21474836480, memoryReserve: 1610612736, memoryPeak: 1073741824, wal: 1073741824, temporary: 536870912, deployment: 134217728, growth: 2147483648 };
  if (!exactKeys(plan.resourceBudgetBytes, Object.keys(minimum))) errors.push('resource_budget_fields');
  for (const [key, value] of Object.entries(minimum)) if (plan.resourceBudgetBytes?.[key] !== value) errors.push('resource_budget:' + key);
  const net = plan.applicationNetworkNamespace;
  if (!exactKeys(net, ['required', 'applicationLoopbackRestPort', 'hostExposedRestPort', 'productionNetworkNamespaceReuse']) || net.required !== true || net.applicationLoopbackRestPort !== 3302 || net.hostExposedRestPort !== plan.ports?.rest || net.productionNetworkNamespaceReuse !== false) errors.push('independent_application_network_namespace_required');
  if (plan.identityMode !== 'ssh-agent') errors.push('ssh_agent_identity_mode_required');
  if (!/^[a-f0-9]{40}$/u.test(plan.writerRelease || '')) errors.push('isolated_candidate_writer_identity_required');
  const c = plan.connection;
  if (!exactKeys(c, ['schemaVersion', 'transport', 'destinationTailnetIPv4', 'destinationPort', 'sourceTag', 'destinationTag', 'sshUser', 'forcedCommand', 'hostPublicKey', 'hostFingerprint', 'clientPublicKey', 'clientFingerprint', 'clientExpiresUtc', 'publicPaths', 'intendedExecutorId', 'officialConnector'])) errors.push('connection_contract_fields');
  if (c?.schemaVersion !== 'stockinsider-staging-readonly-connection-v2') errors.push('connection_schema_version');
  if (c?.transport !== 'official-tailscale-sidecar-only' || !tailnetIPv4(c?.destinationTailnetIPv4) || c?.destinationPort !== 22) errors.push('single_tailnet_ipv4_tcp22_required');
  if (c?.sourceTag !== 'tag:stockinsider-staging-vm' || c?.destinationTag !== 'tag:stockinsider-contabo') errors.push('dedicated_staging_tag_scope_required');
  if (c?.sshUser !== 'si-vnext-oct22' || c?.forcedCommand !== 'vnext-preflight-v1') errors.push('restricted_user_forced_command_required');
  if (c?.hostPublicKey !== HOST_PUBLIC_KEY || c?.hostFingerprint !== HOST_FINGERPRINT || publicKeyFingerprint(HOST_PUBLIC_KEY) !== HOST_FINGERPRINT) errors.push('retained_trusted_ed25519_pin_required');
  try { if (!fingerprintPattern.test(c?.clientFingerprint || '') || publicKeyFingerprint(c?.clientPublicKey) !== c.clientFingerprint) errors.push('exact_client_public_fingerprint_required'); }
  catch { errors.push('exact_client_public_fingerprint_required'); }
  if (typeof c?.clientExpiresUtc !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(c.clientExpiresUtc) || !Number.isFinite(Date.parse(c.clientExpiresUtc)) || new Date(c.clientExpiresUtc).toISOString() !== c.clientExpiresUtc.replace('Z', '.000Z')) errors.push('explicit_client_utc_expiry_required');
  if (!exactKeys(c?.publicPaths, Object.keys(PUBLIC_PATHS)) || Object.entries(PUBLIC_PATHS).some(([key, value]) => c.publicPaths[key] !== value)) errors.push('dedicated_public_selectors_required');
  if (typeof c?.intendedExecutorId !== 'string' || (!/^[a-zA-Z0-9_-]{8,200}$/u.test(c.intendedExecutorId) || c.intendedExecutorId === DEVELOPMENT_EXECUTOR_ID)) errors.push('dedicated_executor_binding_required');
  // Descriptive evidence requirements only: never caller-supplied executable,
  // ProxyCommand, ready boolean, signature or platform admission assertion.
  const connector = c?.officialConnector;
  if (!exactKeys(connector, ['reference', 'status']) || connector.reference !== VPN_REFERENCE || connector.status !== 'NOT_IMPLEMENTED_NOT_ADMITTED') errors.push('official_connector_review_still_required');
  return errors;
}
export function capacity(plan, observation) {
  if (!Number.isSafeInteger(observation.diskAvailable) || observation.diskAvailable < 0 || !Number.isSafeInteger(observation.memoryAvailable) || observation.memoryAvailable < 0) throw Error('invalid_capacity_observation');
  const b = plan.resourceBudgetBytes;
  const projectedDisk = observation.diskAvailable - b.wal - b.temporary - b.deployment - b.growth;
  const projectedMemory = observation.memoryAvailable - b.memoryPeak;
  return { projectedDisk, projectedMemory, ready: projectedDisk >= b.diskFloor && projectedMemory >= b.memoryReserve, warning: observation.diskAvailable < b.diskWarning };
}
export function prepareOfflineRequest(plan, now) {
  const errors = validatePlan(plan);
  if (errors.length) throw Error('invalid_staging_plan:' + errors.join(','));
  const remaining = Date.parse(plan.connection.clientExpiresUtc) - Date.parse(now);
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 3600000) throw Error('client_expiry_must_be_future_within_one_hour');
  const c = plan.connection;
  const options = [
    'BatchMode=yes', 'ConnectTimeout=10', 'ConnectionAttempts=1', 'StrictHostKeyChecking=yes', 'HostKeyAlgorithms=ssh-ed25519',
    'HostKeyAlias=vmi3152467', 'UserKnownHostsFile=' + c.publicPaths.knownHosts, 'GlobalKnownHostsFile=/dev/null',
    'UpdateHostKeys=no', 'VerifyHostKeyDNS=no', 'IdentityAgent=' + c.publicPaths.agentSocket, 'IdentityFile=' + c.publicPaths.clientPublicKey,
    'IdentitiesOnly=yes', 'PreferredAuthentications=publickey', 'PubkeyAcceptedAlgorithms=ssh-ed25519', 'PasswordAuthentication=no',
    'KbdInteractiveAuthentication=no', 'GSSAPIAuthentication=no', 'HostbasedAuthentication=no',
    'ForwardAgent=no', 'ForwardX11=no', 'ForwardX11Trusted=no', 'ClearAllForwardings=yes', 'Tunnel=no', 'RequestTTY=no',
    'PermitLocalCommand=no', 'ProxyCommand=none', 'ProxyJump=none', 'ControlMaster=no', 'ControlPath=none', 'ControlPersist=no',
    'CanonicalizeHostname=no', 'EnableEscapeCommandline=no', 'EscapeChar=none', 'RemoteCommand=none',
  ];
  return {
    mode: 'OFFLINE_NOT_ADMITTED', platformReadiness: 'NOT_OBSERVED', connector: 'NOT_IMPLEMENTED_NOT_ADMITTED',
    // This is the endpoint intent. It cannot work as a direct executor route;
    // future official transport integration needs its own independent review.
    endpointIntent: { transport: c.transport, address: c.destinationTailnetIPv4, port: 22 },
    sshArgumentTemplate: ['-F', '/dev/null', '-T', '-n', '-p', '22', '-l', c.sshUser, ...options.flatMap(option => ['-o', option]), c.destinationTailnetIPv4, c.forcedCommand],
    executable: false, provisioned: false, stagingAcceptance: 'NOT_RUN',
  };
}
/** Synthetic runner only; CLI never calls this, and this module imports no
 * process runner. Supplied public metadata is fixture data, never live proof. */
export function verifyOfflineFixture(plan, { now, agentPublicKeys, knownHostsLine, childRunner }) {
  const request = prepareOfflineRequest(plan, now);
  const c = plan.connection;
  if (!Array.isArray(agentPublicKeys) || agentPublicKeys.length !== 1 || publicKeyFingerprint(agentPublicKeys[0]) !== c.clientFingerprint || agentPublicKeys[0].split(' ').slice(0, 2).join(' ') !== c.clientPublicKey.split(' ').slice(0, 2).join(' ')) throw Error('exact_single_ephemeral_agent_identity_required');
  if (knownHostsLine !== 'vmi3152467 ' + HOST_PUBLIC_KEY + '\n') throw Error('dedicated_known_hosts_pin_mismatch');
  if (typeof childRunner !== 'function') throw Error('fixture_runner_required');
  const result = childRunner({ fixtureOnly: true, binary: '/usr/bin/ssh', args: [...request.sshArgumentTemplate], stdin: '', timeout: 15000, maxBuffer: 262144 });
  if (result?.status !== 0 || typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > 262144) throw Error('fixture_child_failed');
  const observation = JSON.parse(result.stdout);
  if (observation.namespace !== plan.namespace || !Number.isSafeInteger(observation.uid) || observation.uid <= 0 || observation.storageOwner !== 0 || observation.scope !== 'read-only staging preflight only' || observation.stdinIsTty !== false || observation.applicationIsolation !== 'NOT_PROVISIONED' || observation.databaseIsolation !== 'NOT_PROVISIONED') throw Error('staging_gateway_identity_or_scope_mismatch');
  return { ...request, evidence: 'SYNTHETIC_FIXTURE_ONLY', projected: capacity(plan, observation), isolationProof: 'PENDING independent service/database/queue/storage/role runtime checks' };
}
function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--verify-read-only'].includes(arg)) || args.length > 1) throw Error('unsupported_argument');
  const raw = fs.readFileSync(defaultPlan); const plan = JSON.parse(raw);
  const report = { scope: 'offline isolated staging preparation only', mode: args.length ? 'OFFLINE_NOT_ADMITTED' : 'DRY_RUN', planSha256: createHash('sha256').update(raw).digest('hex'), errors: validatePlan(plan), liveBlocker: 'official_sidecar_connector_not_implemented_or_independently_reviewed', environmentRead: false, childProcesses: 0, networkAttempts: 0, provisioned: false, stagingAcceptance: 'NOT_RUN' };
  console.log(JSON.stringify(report, null, 2));
  return 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch { console.error('staging_offline_preparation_failed'); process.exitCode = 2; }
}
