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
  ['approvalPolicy', 'never'], ['codexVersion', '0.158.0-alpha.2.1'], ['contractVersion', 'model-runner-v3.7'],
  ['gitVersion', '2.50.1 (Apple Git-155)'], ['hardIsolationClaims', ['external_user_read', 'authoritative_write', 'command_network']],
  ['hostPinFixtureSha256', 'c43c25a48f442dc0aa8902918243efc9fac354c4bfe3ef9af7432d093ed2aed9'],
  ['hostPinVersion', 'model-runner-host-pins-v3.21'], ['journalVersion', 'model-runner-journal-v3.5'],
  ['manifestVersion', 'loop-model-manifest-v3.6'], ['nodeVersion', 'v22.14.0'],
  ['permissionProfileVersion', 'model-runner-permissions-v3.6'], ['promptPolicyVersion', 'model-runner-prompt-v3.5'],
  ['requestProtocol', 'loop-model-v3.5'], ['resultProtocol', 'loop-model-result-v3.5'],
  ['routingVersion', 'model-runner-routing-v3.6'], ['sourceViewVersion', 'model-runner-source-view-v3.5'],
  ['stateNamespace', 'model-runner-v3-astra-v1'], ['trustedApplyVersion', 'model-runner-trusted-apply-v3.5'],
];
const MODEL_RUNNER_IDENTITY_SHA256 = '0a34cc38c06e432c865aa842278cf05fae724ecf0313f795e753f2086d02cfe1';

assert(Buffer.byteLength(canonicalJson(MODEL_RUNNER_IDENTITY)) === 894 && sha256(canonicalJson(MODEL_RUNNER_IDENTITY)) === MODEL_RUNNER_IDENTITY_SHA256, 12);

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
    run: new Set(['--manifest', '--task', '--strategy']),
    review: new Set(['--manifest', '--task', '--strategy']),
    verify: new Set(['--manifest', '--task', '--strategy']),
    status: new Set(['--manifest', '--task']),
  }[command];
  for (const flag of Object.keys(flags)) assert(allowed.has(flag), 2);
  assert(typeof flags['--manifest'] === 'string', 2);
  const requiresTask = ['run', 'review', 'verify', 'status'].includes(command);
  assert(!requiresTask || typeof flags['--task'] === 'string', 2);
  assert(!flags['--strategy'] || flags['--strategy'] === 'astra-only', 2);
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

function validateWaiver() {
  // Historical waivers never authorize the Astra-only successor.
  throw new RunnerError(5);
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
  assert(effectiveStrategy === 'astra-only' && !flags['--waiver'], 5);
  const pins = verifyExecutionHost(flags['--manifest']);
  const waiver = null;
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
