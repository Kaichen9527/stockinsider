'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { RunnerError, assert } = require('./artifacts');
const { canonicalJson, parseJsonWithNoDuplicateKeys, sha256 } = require('./canonicalJson');
const { parseManifest } = require('./manifest');
const { routeManifest } = require('./routing');
const { loadHostPins, verifyCurrentNode } = require('./hostPreflight');
const { executeOperation, readState, statePath, repositoryRoot } = require('./execution');

const MODEL_RUNNER_IDENTITY = [
  ['approvalPolicy', 'never'], ['codexVersion', '0.150.0-alpha.8'], ['contractVersion', 'model-runner-v3.6'],
  ['gitVersion', '2.50.1 (Apple Git-155)'], ['hardIsolationClaims', ['external_user_read', 'authoritative_write', 'command_network']],
  ['hostPinFixtureSha256', '23de0561f8714d5177ff77dd40c1325e06bedaade8a420acf3b0dded992ea5b8'],
  ['hostPinVersion', 'model-runner-host-pins-v3.13'], ['journalVersion', 'model-runner-journal-v3.5'],
  ['manifestVersion', 'loop-model-manifest-v3.5'], ['nodeVersion', 'v22.14.0'],
  ['permissionProfileVersion', 'model-runner-permissions-v3.5'], ['promptPolicyVersion', 'model-runner-prompt-v3.5'],
  ['requestProtocol', 'loop-model-v3.5'], ['resultProtocol', 'loop-model-result-v3.5'],
  ['routingVersion', 'model-runner-routing-v3.5'], ['sourceViewVersion', 'model-runner-source-view-v3.5'],
  ['stateNamespace', 'model-runner-v3'], ['trustedApplyVersion', 'model-runner-trusted-apply-v3.5'],
];
const MODEL_RUNNER_IDENTITY_SHA256 = '1d31b82400086b090e89c0befda68df0d69e982113a600ad2e0755d1dbe64b48';

assert(Buffer.byteLength(canonicalJson(MODEL_RUNNER_IDENTITY)) === 883 && sha256(canonicalJson(MODEL_RUNNER_IDENTITY)) === MODEL_RUNNER_IDENTITY_SHA256, 12);

function parseArguments(argv) {
  assert(argv.length >= 1, 2);
  const command = argv[0];
  assert(['validate', 'route', 'run', 'review', 'verify', 'status'].includes(command), 2);
  const flags = {};
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    assert(typeof flag === 'string' && /^--[a-z]+(?:-[a-z]+)*$/.test(flag) && !Object.hasOwn(flags, flag), 2);
    const value = argv[index + 1];
    assert(typeof value === 'string' && value.length > 0 && !value.startsWith('--'), 2);
    flags[flag] = value;
    index += 1;
  }
  const allowed = {
    validate: new Set(['--manifest']),
    route: new Set(['--manifest', '--task']),
    run: new Set(['--manifest', '--task', '--strategy', '--waiver']),
    review: new Set(['--manifest', '--task', '--strategy', '--waiver']),
    verify: new Set(['--manifest', '--task', '--strategy', '--waiver']),
    status: new Set(['--manifest', '--task']),
  }[command];
  for (const flag of Object.keys(flags)) assert(allowed.has(flag), 2);
  assert(typeof flags['--manifest'] === 'string', 2);
  const requiresTask = ['run', 'review', 'verify', 'status'].includes(command);
  assert(!requiresTask || typeof flags['--task'] === 'string', 2);
  assert(!flags['--strategy'] || ['hybrid', 'sol-only', 'terra-only'].includes(flags['--strategy']), 2);
  assert(!flags['--waiver'] || (command === 'run' && flags['--strategy'] === 'sol-only'), 2);
  assert(
    command !== 'run' || flags['--strategy'] !== 'sol-only' || typeof flags['--waiver'] === 'string',
    2,
  );
  return { command, flags };
}

function loadManifest(pathname) {
  try {
    return parseManifest(fs.readFileSync(pathname));
  } catch (error) {
    if (error instanceof RunnerError) throw error;
    throw new RunnerError(11);
  }
}

function verifyExecutionHost(manifestPath) {
  const fixturePath = pathJoin(manifestPath, 'model-runner-host-pins-v3.json');
  const pins = loadHostPins(fixturePath);
  verifyCurrentNode(pins);
  return pins;
}

function pathJoin(manifestPath, basename) {
  return require('node:path').join(require('node:path').dirname(manifestPath), basename);
}

function selectedTask(parsed, taskId) {
  const task = parsed.manifest.tasks.find((candidate) => candidate.id === taskId);
  assert(task, 3);
  return task;
}

function validateWaiver(filename, { parsed, task, root, now = new Date() }) {
  let descriptor;
  try {
    assert(path.isAbsolute(filename), 5);
    const stat = fs.lstatSync(filename);
    assert(
      stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() &&
      [0o400, 0o600].includes(stat.mode & 0o777),
      5,
    );
    const real = fs.realpathSync(filename);
    const relative = path.relative(fs.realpathSync(root), real);
    assert(relative.startsWith('..' + path.sep) && relative !== '..', 5);
    descriptor = fs.openSync(real, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const bytes = fs.readFileSync(descriptor, 'utf8');
    assert(Buffer.byteLength(bytes) <= 16_384 && bytes.endsWith('\n'), 5);
    const waiver = parseJsonWithNoDuplicateKeys(bytes.slice(0, -1));
    assert(canonicalJson(waiver) + '\n' === bytes, 5);
    assert(
      Object.keys(waiver).sort().join(',') === [
        'approvedBy', 'changeId', 'checkpoint', 'expiresAt', 'inputHead',
        'protocol', 'reason', 'strategy', 'taskId',
      ].sort().join(',') &&
      waiver.protocol === 'model-runner-waiver-v3.5' &&
      waiver.checkpoint === parsed.manifest.checkpoint &&
      waiver.changeId === parsed.manifest.changeId &&
      waiver.taskId === task.id &&
      waiver.inputHead === parsed.manifest.inputHead &&
      waiver.strategy === 'sol-only' &&
      waiver.approvedBy === 'repository-owner' &&
      typeof waiver.reason === 'string' &&
      Buffer.byteLength(waiver.reason) >= 1 &&
      Buffer.byteLength(waiver.reason) <= 1024 &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(waiver.expiresAt),
      5,
    );
    const invocation = now.getTime();
    const expiry = Date.parse(waiver.expiresAt);
    assert(
      Number.isFinite(invocation) && Number.isFinite(expiry) &&
      expiry > invocation && expiry <= invocation + 7 * 24 * 60 * 60 * 1000,
      5,
    );
    return Object.freeze({ sha256: sha256(bytes), expiresAt: waiver.expiresAt });
  } catch (error) {
    if (error instanceof RunnerError) throw error;
    throw new RunnerError(5);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function validateOutput(parsed) {
  return {
    protocol: 'loop-model-validate-v3.5',
    manifestSha256: parsed.manifestSha256,
    changeId: parsed.manifest.changeId,
    inputHead: parsed.manifest.inputHead,
    taskCount: parsed.manifest.tasks.length,
    valid: true,
  };
}

function pendingStatus(parsed, task) {
  return {
    protocol: 'loop-model-status-v3.5',
    manifestSha256: parsed.manifestSha256,
    modelRunnerIdentitySha256: MODEL_RUNNER_IDENTITY_SHA256,
    taskId: task.id,
    inputHead: parsed.manifest.inputHead,
    state: 'pending',
    makeRound: 0,
    reviewRound: 0,
    verifyRound: 0,
    proposalCommit: null,
    resultRef: null,
    lastOperation: null,
    lastExit: null,
    integrity: 'ok',
  };
}

async function execute(argv) {
  const { command, flags } = parseArguments(argv);
  const parsed = loadManifest(flags['--manifest']);
  if (command === 'validate') return validateOutput(parsed);
  if (command === 'route') return routeManifest(parsed, flags['--task'], null);
  const task = selectedTask(parsed, flags['--task']);
  if (command === 'status') {
    const root = repositoryRoot(flags['--manifest']);
    return readState(statePath(root, parsed, task), parsed, task);
  }
  const effectiveStrategy = flags['--strategy'] || parsed.manifest.defaultStrategy;
  const waiverRequired = command === 'run' && effectiveStrategy === 'sol-only';
  assert(!waiverRequired || flags['--strategy'] === 'sol-only', 2);
  assert(Boolean(flags['--waiver']) === waiverRequired, 2);
  const pins = verifyExecutionHost(flags['--manifest']);
  const root = repositoryRoot(flags['--manifest']);
  const waiver = waiverRequired
    ? validateWaiver(flags['--waiver'], { parsed, task, root })
    : null;
  const result = await executeOperation({
    parsed,
    task,
    operation: command === 'run' ? 'make' : command,
    strategy: flags['--strategy'],
    pins,
    manifestPath: flags['--manifest'],
    waiver,
  });
  process.exitCode =
    result.status === 'changes_required' ? 7
      : result.status === 'verification_failed' ? 9
        : result.status === 'task_failed' ? 10
          : 0;
  return result;
}

module.exports = {
  MODEL_RUNNER_IDENTITY,
  MODEL_RUNNER_IDENTITY_SHA256,
  parseArguments,
  loadManifest,
  verifyExecutionHost,
  validateWaiver,
  validateOutput,
  pendingStatus,
  execute,
};
