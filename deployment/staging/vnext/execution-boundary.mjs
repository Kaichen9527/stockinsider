/** Source/fixtures only. No platform transport is implemented or registered.
 * The production facade cannot accept caller adapters, approvals or provenance.
 */
import { prepareOfflineRequest, publicKeyFingerprint, capacity, HOST_PUBLIC_KEY, VPN_REFERENCE } from './verify.mjs';

/** @typedef {'NOT_OBSERVED'} ReadinessState */
/** @typedef {{id: string, state: ReadinessState, requiredEvidence: string}} ReadinessRequirement */
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** @type {ReadonlyArray<Readonly<ReadinessRequirement>>} */
export const EXECUTION_READINESS_REQUIREMENTS = freeze([
  { id: 'independent_platform_executor', state: 'NOT_OBSERVED', requiredEvidence: 'Platform-authenticated current dedicated staging executor, distinct from development; exact configured and observed revisions' },
  { id: 'official_sidecar_broker', state: 'NOT_OBSERVED', requiredEvidence: 'Independently reviewed official outer-executor CONNECT integration, proxy:8088, exact Contabo tailnet IPv4:22, current enrollment and scoped ACL observations' },
  { id: 'platform_approval', state: 'NOT_OBSERVED', requiredEvidence: 'Platform-verifiable approval for this exact executor, destination, command and bounded execution; generic network permission is insufficient' },
  { id: 'ephemeral_agent_provenance', state: 'NOT_OBSERVED', requiredEvidence: 'Platform-authenticated agent custody, exactly one matching public fingerprint, <=1hour expiry, revocation and session cleanup; fixture metadata is insufficient' },
]);
const FIXTURE_TIMEOUT_MS = 15000;
const MAX_OUTPUT_BYTES = 262144;
function exactKeys(value, names) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...names].sort().join(',');
}
function canonicalNow(now) {
  if (typeof now !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(now) || !Number.isFinite(Date.parse(now)) || new Date(now).toISOString() !== now.replace('Z', '.000Z')) throw Error('explicit_valid_utc_now_required');
}
function checkedPlan(plan, now) {
  canonicalNow(now);
  const snapshot = structuredClone(plan);
  const request = prepareOfflineRequest(snapshot, now);
  return { plan: freeze(snapshot), request: freeze(request) };
}
/** Closed production integration boundary: no public registration function or
 * caller-created provenance token exists. A future verified platform integration
 * requires a separate reviewed implementation; metadata cannot enable this one.
 */
export function inspectExecutionBoundary(plan, options) {
  if (!exactKeys(options, ['now'])) throw Error('caller_execution_overrides_forbidden');
  checkedPlan(plan, options.now);
  return freeze({ state: 'Disabled', executable: false, platformReadiness: 'NOT_OBSERVED', platformAdapter: 'NOT_IMPLEMENTED_NOT_ADMITTED', requirements: EXECUTION_READINESS_REQUIREMENTS, stagingAcceptance: 'NOT_RUN' });
}
export async function executeReadOnlyPreflight(plan, options) {
  inspectExecutionBoundary(plan, options);
  throw Error('verified_platform_execution_integration_unavailable');
}
function fixtureRequest(plan, offline) {
  const c = plan.connection;
  return freeze({
    kind: 'FixtureRequestOnly', executable: false,
    executorIntent: c.intendedExecutorId,
    connectorIntent: { reference: VPN_REFERENCE, path: 'official-outer-executor-sidecar-CONNECT', proxy: 'proxy:8088', destination: c.destinationTailnetIPv4, port: 22 },
    sshIntent: { hostFingerprint: c.hostFingerprint, clientFingerprint: c.clientFingerprint, clientExpiresUtc: c.clientExpiresUtc, user: c.sshUser, forcedCommand: c.forcedCommand, argumentTemplate: [...offline.sshArgumentTemplate] },
    stdin: '', timeoutMs: FIXTURE_TIMEOUT_MS, maxOutputBytes: MAX_OUTPUT_BYTES,
    commands: 1, pty: false, forwarding: false, environmentRead: false,
  });
}
function parseGateway(stdout) {
  // The gateway protocol is a flat JSON object. Parse each scalar token to
  // reject duplicates, nested data and trailing output instead of silently
  // accepting JSON.parse's last duplicate value.
  let offset = 0;
  const object = Object.create(null);
  function token(pattern) {
    pattern.lastIndex = offset;
    const match = pattern.exec(stdout);
    if (!match) throw Error('fixture_gateway_json_rejected');
    offset = pattern.lastIndex;
    return match[0];
  }
  token(/[ \t\r\n]*\{[ \t\r\n]*/uy);
  while (stdout[offset] !== '}') {
    const key = JSON.parse(token(/"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/uy));
    token(/[ \t\r\n]*:[ \t\r\n]*/uy);
    const value = JSON.parse(token(/(?:"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)/uy));
    if (Object.hasOwn(object, key)) throw Error('fixture_gateway_duplicate_field');
    object[key] = value;
    token(/[ \t\r\n]*/uy);
    if (stdout[offset] === '}') break;
    token(/,[ \t\r\n]*/uy);
    if (stdout[offset] === '}') throw Error('fixture_gateway_json_rejected');
  }
  token(/\}[ \t\r\n]*/uy);
  if (offset !== stdout.length) throw Error('fixture_gateway_json_rejected');
  return object;
}
function gatewayCapacity(plan, response) {
  if (!exactKeys(response, ['status', 'stdout', 'stderr', 'timedOut']) || response.status !== 0 || response.timedOut !== false || response.stderr !== '' || typeof response.stdout !== 'string' || Buffer.byteLength(response.stdout) > MAX_OUTPUT_BYTES) throw Error('fixture_response_rejected');
  const observation = parseGateway(response.stdout);
  if (!exactKeys(observation, ['namespace', 'uid', 'storageOwner', 'diskAvailable', 'memoryAvailable', 'scope', 'stdinIsTty', 'applicationIsolation', 'databaseIsolation']) || observation.namespace !== plan.namespace || !Number.isSafeInteger(observation.uid) || observation.uid <= 0 || observation.storageOwner !== 0 || observation.scope !== 'read-only staging preflight only' || observation.stdinIsTty !== false || observation.applicationIsolation !== 'NOT_PROVISIONED' || observation.databaseIsolation !== 'NOT_PROVISIONED') throw Error('fixture_gateway_scope_rejected');
  const result = capacity(plan, observation);
  return freeze({ capacityReady: result.ready, projectedDisk: result.projectedDisk, projectedMemory: result.projectedMemory, warning: result.warning });
}
async function bounded(operation, controller) {
  let timer;
  let onAbort;
  const stopped = new Promise((_, reject) => {
    onAbort = () => reject(Error('fixture_cancelled'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { reject(Error('fixture_deadline_exceeded')); controller.abort(); }, FIXTURE_TIMEOUT_MS);
  });
  try {
    if (controller.signal.aborted) throw Error('fixture_cancelled');
    return await Promise.race([Promise.resolve().then(operation), stopped]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
/** Injected fixture functions are test code, never a production adapter. No
 * fixture success can populate the closed platform integration or observations.
 * close() must reclaim all fixture resources, including partial open failures.
 */
export async function verifyExecutionBoundaryFixture(plan, options) {
  const names = ['now', 'agentPublicKeys', 'knownHostsLine', 'adapter'];
  if (!exactKeys(options, options?.signal === undefined ? names : [...names, 'signal'])) throw Error('unsupported_fixture_options');
  const { plan: snapshot, request: offline } = checkedPlan(plan, options.now);
  const c = snapshot.connection;
  if (!Array.isArray(options.agentPublicKeys) || options.agentPublicKeys.length !== 1 || publicKeyFingerprint(options.agentPublicKeys[0]) !== c.clientFingerprint || options.agentPublicKeys[0].split(' ').slice(0, 2).join(' ') !== c.clientPublicKey.split(' ').slice(0, 2).join(' ')) throw Error('exact_single_fixture_agent_identity_required');
  if (options.knownHostsLine !== 'vmi3152467 ' + HOST_PUBLIC_KEY + '\n') throw Error('fixture_host_pin_mismatch');
  const adapter = options.adapter;
  if (!exactKeys(adapter, ['kind', 'open', 'execute', 'close']) || adapter.kind !== 'FixtureAdapterOnly' || ['open', 'execute', 'close'].some(key => typeof adapter[key] !== 'function')) throw Error('explicit_fixture_adapter_required');
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw Error('fixture_abort_signal_required');
  if (options.signal?.aborted) throw Error('fixture_cancelled');
  const controller = new AbortController();
  const onCancel = () => controller.abort();
  options.signal?.addEventListener('abort', onCancel, { once: true });
  const request = fixtureRequest(snapshot, offline);
  let session = null;
  let projected;
  let failure = false;
  let cleaned = false;
  let settled = false;
  let abandoned = false;
  async function closeFixture(outcome) {
    const cleanupController = new AbortController();
    try {
      const cleanup = await bounded(() => adapter.close(freeze({ kind: 'FixtureCleanupOnly', session, outcome }), cleanupController.signal), cleanupController);
      return exactKeys(cleanup, ['closed', 'remainingResources']) && cleanup.closed === true && cleanup.remainingResources === 0;
    } catch { return false; }
    finally { cleanupController.abort(); }
  }
  const operation = Promise.resolve().then(async () => {
    if (controller.signal.aborted) throw Error('fixture_cancelled');
    session = await adapter.open(request, controller.signal);
    if (!exactKeys(session, ['fixtureSessionId']) || !/^fixture_[a-z0-9_]{1,80}$/u.test(session.fixtureSessionId)) throw Error('fixture_session_rejected');
    session = freeze(structuredClone(session));
    if (controller.signal.aborted) throw Error('fixture_cancelled');
    projected = gatewayCapacity(snapshot, await adapter.execute(request, session, controller.signal));
  });
  const onSettled = () => {
    settled = true;
    // A fixture that ignores cancellation cannot establish cleanup. If it
    // eventually returns after both bounded windows, reclaim late resources
    // again; never promote that rejected invocation to a successful result.
    if (abandoned) void closeFixture('rejected');
  };
  operation.then(onSettled, onSettled);
  try {
    await bounded(() => operation, controller);
  } catch { failure = true; }
  finally {
    controller.abort();
    options.signal?.removeEventListener('abort', onCancel);
    // Wait for cancelled fixture work to settle before accepting any close
    // receipt; late open/execute allocations must precede final cleanup.
    const settlementController = new AbortController();
    try {
      await bounded(() => operation.catch(() => {}), settlementController);
    } catch { abandoned = !settled; }
    finally { settlementController.abort(); }
    cleaned = await closeFixture(failure ? 'rejected' : 'completed');
    if (abandoned) cleaned = false;
  }
  if (!cleaned) throw Error('fixture_cleanup_not_confirmed');
  if (failure) throw Error('fixture_execution_rejected');
  return freeze({ state: 'FixtureOnly', executable: false, platformReadiness: 'NOT_OBSERVED', stagingAcceptance: 'NOT_RUN', projected, isolation: { application: 'NOT_PROVISIONED', database: 'NOT_PROVISIONED', service: 'NOT_OBSERVED', queue: 'NOT_OBSERVED', storage: 'NOT_OBSERVED', writer: 'NOT_OBSERVED', network: 'NOT_OBSERVED' }, cleanup: 'FIXTURE_CONFIRMED', request });
}
