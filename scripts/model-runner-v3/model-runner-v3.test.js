'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const test = require('node:test');
const ordinaryTest = process.env.OPPORTUNITY_V3_PROTECTED_LIVE_ONLY === '1' ? () => {} : test;

const { RunnerError } = require('./artifacts');
const { canonicalJson, parseJsonWithNoDuplicateKeys, sha256 } = require('./canonicalJson');
const { parseManifest, pathForbidden } = require('./manifest');
const { routeManifest } = require('./routing');
const { sourceViewIdentity, promptPathAllowed } = require('./sourceView');
const { codexArgs, profileToml } = require('./codexAdapter');
const { validatePatch } = require('./patchParser');
const { validateTerminalResult } = require('./seal');
const { operationKey } = require('./transactionJournal');
const { resourceAttemptKey } = require('./resourceJournal');
const {
  acquireTaskLock,
  appendJournal,
  createOwnedResource,
  readJournal,
  releaseTaskLock,
  removeOwnedResource,
  reserveResource,
  runtimePaths,
} = require('./journalStore');
const {
  MODEL_RUNNER_IDENTITY,
  MODEL_RUNNER_IDENTITY_SHA256,
  parseArguments,
  validateWaiver,
} = require('./runner');
const {
  PIN_FIXTURE_BYTES,
  ancestorIdentity,
  assertAncestorIdentity,
  loadHostPins,
  validatedVersionOutput,
  verifyCurrentNode,
} = require('./hostPreflight');
const {
  executeModel,
  executeOperation,
  prepareTransport,
  probePermissions,
  readState,
  statePath,
  terminalResultFromJsonl,
} = require('./execution');

function manifestObject(strategy = 'hybrid') {
  return {
    protocol: 'loop-model-manifest-v3.5',
    checkpoint: 'model_runner_v3',
    changeId: 'source-led-opportunity-engine-v3',
    base: 'a'.repeat(40),
    inputHead: 'b'.repeat(40),
    defaultStrategy: strategy,
    tasks: [{
      id: 'runner-foundation', sequence: 0, assurance: 'critical', dependsOn: [],
      task: 'Build the independent V3 runner foundation.', acceptanceCriteria: ['Foundation has deterministic tests.'],
      allowedPaths: ['scripts/model-runner-v3/**'], inspectionPaths: ['scripts/**'],
      promptFiles: ['.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-contract.md'],
      timeLimits: { makeSeconds: 60, reviewSeconds: 60, verifySeconds: 60 },
    }],
  };
}

function parsedManifest(strategy) {
  const raw = canonicalJson(manifestObject(strategy));
  return parseManifest(Buffer.from(raw + '\n'));
}

function expectExit(exit, fn) {
  assert.throws(fn, (error) => error instanceof RunnerError && error.exit === exit);
}

function permissionProbeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  process.nextTick(() => {
    child.stdout.end('ok');
    child.stderr.end();
    child.emit('close', 0, null);
  });
  return child;
}

ordinaryTest('manifest requires canonical LF-terminated JSON with unique keys', () => {
  const parsed = parsedManifest();
  assert.equal(parsed.manifestSha256, sha256(canonicalJson(manifestObject())));
  expectExit(3, () => parseManifest(Buffer.from(canonicalJson(manifestObject()))));
  assert.throws(() => parseJsonWithNoDuplicateKeys('{"a":1,"a":2}'), /duplicate key/);
});

ordinaryTest('permanent path exclusions outrank manifest selectors and prompts', () => {
  assert.equal(pathForbidden('AGENTS.md'), true);
  assert.equal(pathForbidden('docs/.env.production'), true);
  assert.equal(pathForbidden('safe/source.js'), false);
  assert.equal(promptPathAllowed('source-led-opportunity-engine-v3', '.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-contract.md'), true);
  assert.equal(promptPathAllowed('source-led-opportunity-engine-v3', '.loop-engineering/state/changes/source-led-opportunity-engine-v3/status.md'), false);
  assert.equal(promptPathAllowed('source-led-opportunity-engine-v3', '.loop-engineering/state/changes/source-led-opportunity-engine-v3/secret-contract.md'), false);
});

ordinaryTest('routing never represents Luna and reports terra-only review/verify as blocked', () => {
  const hybrid = routeManifest(parsedManifest('hybrid'));
  assert.equal(hybrid.routes[0].make.model, 'gpt-5.6-terra');
  assert.equal(hybrid.routes[0].review.model, 'gpt-5.6-sol');
  const terraOnly = routeManifest(parsedManifest('terra-only'));
  assert.deepEqual(terraOnly.routes[0].review, { blocked: 'ROUTING_BLOCKED' });
  assert.deepEqual(terraOnly.routes[0].verify, { blocked: 'ROUTING_BLOCKED' });
});

ordinaryTest('source-view identity binds sorted readable tracked entries', () => {
  const identity = sourceViewIdentity({
    viewPurpose: 'make_initial', inputHead: 'b'.repeat(40), sourceCommit: 'b'.repeat(40), entries: [
      ['scripts/model-runner-v3/a.js', 'c'.repeat(40), '100644', '0444', 1, 'd'.repeat(64)],
      ['scripts/model-runner-v3/b.js', 'e'.repeat(40), '100755', '0444', 2, 'f'.repeat(64)],
    ],
  });
  assert.match(identity.sourceViewSha256, /^[a-f0-9]{64}$/);
  expectExit(3, () => sourceViewIdentity({
    viewPurpose: 'make_initial', inputHead: 'b'.repeat(40), sourceCommit: 'b'.repeat(40), entries: [
      ['scripts/model-runner-v3/b.js', 'e'.repeat(40), '100755', '0444', 2, 'f'.repeat(64)],
      ['scripts/model-runner-v3/a.js', 'c'.repeat(40), '100644', '0444', 1, 'd'.repeat(64)],
    ],
  }));
});

ordinaryTest('Codex profile is custom least privilege and never uses legacy sandbox', () => {
  const profile = profileToml('/private/view', '/private/scratch');
  assert.match(profile, /":root" = "deny"/);
  assert.match(profile, /":minimal" = "read"/);
  assert.match(profile, /"\/private\/scratch" = "write"/);
  const args = codexArgs({
    model: 'gpt-5.6-terra',
    reasoningEffort: 'high',
    viewPath: '/private/view',
  });
  assert.equal(args.includes('--sandbox'), false);
  assert.equal(args.includes('-s'), false);
  assert.equal(args.includes('--ephemeral'), true);
  assert.equal(args.includes('--ignore-user-config'), true);
  assert.equal(args.includes('model_reasoning_effort="high"'), true);
  expectExit(5, () => codexArgs({
    model: 'gpt-5.6-terra',
    reasoningEffort: 'xhigh',
    viewPath: '/private/view',
  }));
});

ordinaryTest('patch parser accepts only selected ordinary text paths', () => {
  const patch = 'diff --git a/scripts/model-runner-v3/new.js b/scripts/model-runner-v3/new.js\nnew file mode 100644\n';
  assert.deepEqual(validatePatch(patch, ['scripts/model-runner-v3/**']), ['scripts/model-runner-v3/new.js']);
  const ordinaryPatch = 'diff --git a/scripts/model-runner-v3/new.js b/scripts/model-runner-v3/new.js\nindex 0000000..1111111 100644\n--- /dev/null\n+++ b/scripts/model-runner-v3/new.js\n@@ -0,0 +1 @@\n+module.exports = 1;\n';
  assert.deepEqual(validatePatch(ordinaryPatch, ['scripts/model-runner-v3/**']), ['scripts/model-runner-v3/new.js']);
  expectExit(6, () => validatePatch(ordinaryPatch.replaceAll('scripts/model-runner-v3/new.js', '.env'), ['**']));
  expectExit(6, () => validatePatch(ordinaryPatch + 'old mode 100644\nnew mode 100755\n', ['scripts/model-runner-v3/**']));
  expectExit(6, () => validatePatch(ordinaryPatch + 'GIT binary patch\n', ['scripts/model-runner-v3/**']));
  expectExit(6, () => validatePatch(
    'diff --git a/scripts/model-runner-v3/link.js b/scripts/model-runner-v3/link.js\nnew file mode 120000\n--- /dev/null\n+++ b/scripts/model-runner-v3/link.js\n@@ -0,0 +1 @@\n+../../../AGENTS.md\n',
    ['scripts/model-runner-v3/**'],
  ));
  const mixed = ordinaryPatch + [
    '--- a/AGENTS.md',
    '+++ b/AGENTS.md',
    '@@ -1 +1 @@',
    '-forbidden',
    '+escaped',
    '',
  ].join('\n');
  expectExit(6, () => validatePatch(mixed, ['scripts/model-runner-v3/**']));
});

ordinaryTest('sealed terminal results enforce operation-specific result matrices', () => {
  const expected = { operation: 'review', requestSha256: '1'.repeat(64), sourceViewSha256: '2'.repeat(64) };
  const valid = {
    protocol: 'loop-model-result-v3.5', operation: 'review', requestSha256: expected.requestSha256,
    sourceViewSha256: expected.sourceViewSha256, status: 'changes_required', patch: null,
    findings: [{ id: 'F-1', severity: 'P1', path: 'scripts/model-runner-v3/runner.js', line: 1, message: 'missing proof' }],
    evidence: [{ kind: 'probe', ref: 'runner-contract', status: 'pass', exitCode: 0, sha256: null, summary: 'checked' }], summary: 'changes required',
  };
  assert.equal(validateTerminalResult(valid, expected), valid);
  expectExit(12, () => validateTerminalResult({ ...valid, status: 'pass' }, expected));
});

ordinaryTest('pinned Codex JSONL parser accepts one terminal agent message and rejects trailing events', () => {
  const terminal = {
    protocol: 'loop-model-result-v3.5', operation: 'make',
    requestSha256: '1'.repeat(64), sourceViewSha256: '2'.repeat(64),
    status: 'proposal', patch: 'diff --git a/a b/a\n', findings: [], evidence: [], summary: 'proposal',
  };
  const events = [
    { type: 'thread.started', thread_id: '123e4567-e89b-42d3-a456-426614174000' },
    { type: 'turn.started' },
    { type: 'item.completed', item: { id: 'final', type: 'agent_message', text: canonicalJson(terminal) } },
    { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 } },
  ].map(canonicalJson).join('\n') + '\n';
  assert.equal(canonicalJson(terminalResultFromJsonl(events)), canonicalJson(terminal));
  expectExit(12, () => terminalResultFromJsonl(events + canonicalJson({ type: 'turn.started' }) + '\n'));
});

ordinaryTest('operation and resource identities are deterministic and bound', () => {
  const identity = {
    modelRunnerIdentitySha256: MODEL_RUNNER_IDENTITY_SHA256,
    checkpoint: 'model_runner_v3', manifestSha256: '1'.repeat(64),
    taskId: 'runner-foundation', operation: 'make', inputHead: '2'.repeat(40), round: 1,
  };
  const key = operationKey(identity);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.notEqual(key, operationKey({ ...identity, operation: 'review' }));
  assert.match(resourceAttemptKey({
    modelRunnerIdentitySha256: MODEL_RUNNER_IDENTITY_SHA256,
    operationKeySha256: key,
    resourceAttemptOrdinal: 0,
  }), /^[a-f0-9]{64}$/);
  assert.equal(MODEL_RUNNER_IDENTITY_SHA256.length, 64);
  assert.equal(Buffer.byteLength(canonicalJson(MODEL_RUNNER_IDENTITY)), 884);
  assert.deepEqual(MODEL_RUNNER_IDENTITY.find(([name]) => name === 'codexVersion'), ['codexVersion', '0.147.0-alpha.1.2']);
  assert.deepEqual(MODEL_RUNNER_IDENTITY.find(([name]) => name === 'contractVersion'), ['contractVersion', 'model-runner-v3.6']);
  assert.deepEqual(MODEL_RUNNER_IDENTITY.find(([name]) => name === 'hostPinVersion'), ['hostPinVersion', 'model-runner-host-pins-v3.6']);
});

ordinaryTest('task locks, contiguous reservations and resource hash chains fail closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-v3-journal-'));
  const paths = runtimePaths(root, '1'.repeat(64), '2'.repeat(64));
  const lock = acquireTaskLock(paths.lock);
  expectExit(8, () => acquireTaskLock(paths.lock));
  const operationIdentity = {
    operationKeySha256: '3'.repeat(64),
    operation: 'make',
    round: 1,
  };
  const reservation = reserveResource(paths, operationIdentity, 'pending');
  assert.equal(reservation.resourceAttemptOrdinal, 0);
  const owned = createOwnedResource(paths, reservation);
  const journal = path.join(paths.resourceJournalDirectory, `${reservation.resourceAttemptKeySha256}.jsonl`);
  const base = (state, payload) => appendJournal(
    journal,
    { name: 'resourceAttemptKeySha256', value: reservation.resourceAttemptKeySha256 },
    {
      protocol: 'model-runner-resource-journal-v3.5',
      operationKeySha256: reservation.operationKeySha256,
      resourceAttemptKeySha256: reservation.resourceAttemptKeySha256,
      resourceAttemptOrdinal: reservation.resourceAttemptOrdinal,
      state,
      payload,
      failureCode: null,
      exit: null,
    },
  );
  base('allocated', { tokenDigest: reservation.tokenDigest, device: reservation.device });
  base('preparation_failed', { primaryFailureCode: 'TASK_FAILED', primaryExit: 10 });
  base('cleanup_started', { tokenDigest: reservation.tokenDigest });
  removeOwnedResource(owned.directory, reservation);
  base('cleanup_complete', { removed: true });
  assert.deepEqual(
    readJournal(journal, {
      name: 'resourceAttemptKeySha256',
      value: reservation.resourceAttemptKeySha256,
    }).map((row) => row.state),
    ['allocated', 'preparation_failed', 'cleanup_started', 'cleanup_complete'],
  );
  const retry = reserveResource(paths, operationIdentity, 'pending');
  assert.equal(retry.resourceAttemptOrdinal, 1);
  const afterRecoveredReservation = reserveResource(paths, operationIdentity, 'pending');
  assert.equal(afterRecoveredReservation.resourceAttemptOrdinal, 2);
  assert.deepEqual(
    readJournal(
      path.join(paths.resourceJournalDirectory, `${retry.resourceAttemptKeySha256}.jsonl`),
      { name: 'resourceAttemptKeySha256', value: retry.resourceAttemptKeySha256 },
    ).map((row) => row.state),
    ['preparation_failed', 'cleanup_started', 'cleanup_complete'],
  );
  releaseTaskLock(lock);

  fs.appendFileSync(journal, '{}\n');
  expectExit(11, () => readJournal(journal, {
    name: 'resourceAttemptKeySha256',
    value: reservation.resourceAttemptKeySha256,
  }));
  fs.rmSync(root, { recursive: true, force: true });
});

ordinaryTest('host pin fixture has an exact hash-bound format', async () => {
  const fixture = path.resolve(__dirname, '../../.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json');
  assert.equal(fs.statSync(fixture).size, PIN_FIXTURE_BYTES);
  const pins = loadHostPins(fixture);
  assert.equal(pins.fixtureVersion, 'model-runner-host-pins-v3.6');
  assert.equal(pins.executables.find((entry) => entry.name === 'codex').version, 'codex-cli 0.147.0-alpha.1.2');
  assert.equal(verifyCurrentNode(pins), true);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-v3-pins-'));
  const altered = path.join(directory, 'pins.json');
  fs.writeFileSync(altered, fs.readFileSync(fixture).subarray(0, -1));
  expectExit(5, () => loadHostPins(altered));
  const stale = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  stale.executables.find((entry) => entry.name === 'codex').version = 'codex-cli 0.146.0-alpha.9';
  fs.writeFileSync(altered, canonicalJson(stale) + '\n');
  expectExit(5, () => loadHostPins(altered));
  const probeView = path.join(directory, 'probe-view');
  const probeScratch = path.join(directory, 'probe-scratch');
  const probeTransport = path.join(directory, 'probe-transport');
  fs.mkdirSync(probeView);
  fs.mkdirSync(probeScratch);
  fs.mkdirSync(probeTransport);
  for (const failurePhase of [1, 2, 3]) {
    let checks = 0;
    let spawns = 0;
    await assert.rejects(probePermissions({
      pins,
      source: { view: probeView },
      scratch: probeScratch,
      transport: probeTransport,
      verifyHostFn: () => {
        checks += 1;
        if (checks === failurePhase) throw new RunnerError(5);
        return true;
      },
      spawnFn: () => {
        spawns += 1;
        return permissionProbeChild();
      },
    }), (error) => error?.exit === 5);
    assert.equal(checks, failurePhase);
    assert.equal(spawns, failurePhase === 1 ? 0 : 1);
  }
  const ancestorRoot = path.join(fs.realpathSync(directory), 'ancestor');
  const ancestorBin = path.join(ancestorRoot, 'bin');
  const ancestorExecutable = path.join(ancestorBin, 'tool');
  fs.mkdirSync(ancestorBin, { recursive: true });
  fs.writeFileSync(ancestorExecutable, 'tool');
  const baselineAncestors = ancestorIdentity([ancestorExecutable]);
  fs.renameSync(ancestorBin, path.join(ancestorRoot, 'old-bin'));
  fs.mkdirSync(ancestorBin);
  fs.writeFileSync(ancestorExecutable, 'tool');
  expectExit(5, () => assertAncestorIdentity(
    ancestorIdentity([ancestorExecutable]),
    baselineAncestors,
  ));
  fs.rmSync(directory, { recursive: true, force: true });
});

ordinaryTest('version probes admit only one or two exact Apple Git sandbox cache denials', () => {
  const stdout = 'git version 2.50.1 (Apple Git-155)\n';
  const denial = "git: error: couldn't create cache file '/var/folders/pt/opaque_123/T/xcrun_db-Ab12Cd' (errno=Operation not permitted)\n";
  assert.equal(validatedVersionOutput('/usr/bin/git', stdout, ''), stdout);
  assert.equal(validatedVersionOutput('/usr/bin/git', stdout, denial), stdout);
  assert.equal(validatedVersionOutput('/usr/bin/git', stdout, `${denial}${denial}`), stdout);
  expectExit(5, () => validatedVersionOutput('/usr/bin/git', stdout, denial.trimEnd()));
  expectExit(5, () => validatedVersionOutput('/usr/bin/git', stdout, `${denial}${denial}${denial}`));
  expectExit(5, () => validatedVersionOutput('/usr/bin/git', stdout, `${denial}${denial}unexpected\n`));
  expectExit(5, () => validatedVersionOutput('/Applications/ChatGPT.app/Contents/Resources/codex', stdout,
    `${denial}${denial}`));
});

async function runRealPermissionProbe() {
  const fixture = path.resolve(__dirname, '../../.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json');
  const pins = loadHostPins(fixture);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-v3-profile-'));
  const view = path.join(directory, 'view');
  const scratch = path.join(directory, 'scratch');
  const transport = path.join(directory, 'transport');
  fs.mkdirSync(view, { mode: 0o700 });
  fs.mkdirSync(scratch, { mode: 0o700 });
  fs.writeFileSync(path.join(view, 'tracked.txt'), 'tracked\n', { mode: 0o400 });
  const source = { view };
  const prepared = prepareTransport({ source, scratch, transport });
  assert.match(prepared.profileSha256, /^[a-f0-9]{64}$/u);
  assert.match(prepared.authMaterialSha256, /^[a-f0-9]{64}$/u);
  assert.equal(fs.existsSync(path.join(transport, 'model-runner-v3.config.toml')), true);
  const inheritedProxyNames = [
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
  ];
  const inheritedProxyValues = new Map(
    inheritedProxyNames.map((name) => [name, process.env[name]]),
  );
  try {
    for (const name of inheritedProxyNames) {
      process.env[name] = 'http://127.0.0.1:9';
    }
    assert.equal(await probePermissions({ pins, source, scratch, transport }), true);
  } finally {
    for (const [name, value] of inheritedProxyValues) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  fs.rmSync(directory, { recursive: true, force: true });
}

function runIsolatedRealModelAttempt() {
  const worker = path.join(__dirname, 'real-model-attempt-worker.js');
  const result = spawnSync(process.execPath, [worker], {
    cwd: __dirname,
    detached: true,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024,
    shell: false,
    timeout: 150_000,
  });
  assert.equal(result.error, undefined, `real model worker error: ${result.error?.message ?? ''}`);
  assert.equal(result.signal, null, `real model worker signal: ${result.signal ?? ''}`);
  assert.equal(result.status, 0, `real model worker stderr: ${result.stderr}`);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), {
    protocol: 'model-runner-real-attempt-v1',
    status: 'pass',
  });
}

if (process.env.OPPORTUNITY_V3_PROTECTED_NO_LIVE_AUTH !== '1') {
  test('pinned Codex blocks filesystem DNS TCP UDP HTTP HTTPS loopback private IP proxy and Unix sockets across direct setsid and double-fork paths', async () => {
    await runRealPermissionProbe();
  });

  test('pinned Codex propagates network denials through distinct ordinary process-group setsid fork double-fork and delayed descendants before an actual model attempt', async () => {
    runIsolatedRealModelAttempt();
  });
}

ordinaryTest('CLI validates canonical input and fails closed before execution when the adjacent pin fixture is absent', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-v3-'));
  const filename = path.join(directory, 'manifest.json');
  fs.writeFileSync(filename, canonicalJson(manifestObject()) + '\n');
  const cli = path.resolve(__dirname, '..', 'loop-model-runner-v3.js');
  const validated = spawnSync(process.execPath, [cli, 'validate', '--manifest', filename], { encoding: 'utf8' });
  assert.equal(validated.status, 0);
  assert.equal(validated.stderr, '');
  assert.deepEqual(JSON.parse(validated.stdout), {
    changeId: 'source-led-opportunity-engine-v3', inputHead: 'b'.repeat(40), manifestSha256: sha256(canonicalJson(manifestObject())),
    protocol: 'loop-model-validate-v3.5', taskCount: 1, valid: true,
  });
  const run = spawnSync(process.execPath, [cli, 'run', '--manifest', filename, '--task', 'runner-foundation'], { encoding: 'utf8' });
  assert.equal(run.status, 5);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /"code":"ROUTING_BLOCKED"/);
  expectExit(2, () => parseArguments([
    'run', '--manifest', filename, '--task', 'runner-foundation',
    '--strategy', 'sol-only',
  ]));
  const waiverDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-v3-waiver-'));
  const waiverPath = path.join(waiverDirectory, 'waiver.json');
  const now = new Date('2026-07-26T00:00:00Z');
  const waiver = {
    protocol: 'model-runner-waiver-v3.5',
    checkpoint: 'model_runner_v3',
    changeId: 'source-led-opportunity-engine-v3',
    taskId: 'runner-foundation',
    inputHead: 'b'.repeat(40),
    strategy: 'sol-only',
    approvedBy: 'repository-owner',
    reason: 'Explicit owner approval for the Sol-only maker route.',
    expiresAt: '2026-07-27T00:00:00Z',
  };
  fs.writeFileSync(waiverPath, canonicalJson(waiver) + '\n', { mode: 0o600 });
  const waiverIdentity = validateWaiver(waiverPath, {
    parsed: parsedManifest('sol-only'),
    task: parsedManifest('sol-only').manifest.tasks[0],
    root: directory,
    now,
  });
  assert.deepEqual(waiverIdentity, {
    sha256: sha256(canonicalJson(waiver) + '\n'),
    expiresAt: waiver.expiresAt,
  });
  fs.chmodSync(waiverPath, 0o644);
  expectExit(5, () => validateWaiver(waiverPath, {
    parsed: parsedManifest('sol-only'),
    task: parsedManifest('sol-only').manifest.tasks[0],
    root: directory,
    now,
  }));
  fs.rmSync(waiverDirectory, { recursive: true, force: true });
  fs.rmSync(directory, { recursive: true, force: true });
});

ordinaryTest('maker execution materializes a tracked source view, applies the sealed patch, and persists its result ref', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-v3-execution-'));
  const changeDirectory = path.join(
    directory,
    '.loop-engineering/state/changes/source-led-opportunity-engine-v3',
  );
  const sourceDirectory = path.join(directory, 'scripts/model-runner-v3');
  fs.mkdirSync(changeDirectory, { recursive: true });
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.writeFileSync(path.join(sourceDirectory, 'source.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(changeDirectory, 'model-runner-contract.md'), '# Contract\n');
  const git = (args, options = {}) => {
    const result = spawnSync('/usr/bin/git', ['-C', directory, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Runner Test',
        GIT_AUTHOR_EMAIL: 'runner-test@localhost',
        GIT_COMMITTER_NAME: 'Runner Test',
        GIT_COMMITTER_EMAIL: 'runner-test@localhost',
      },
      ...options,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(['init', '-q']);
  git(['add', '.']);
  git(['commit', '-q', '-m', 'fixture']);
  const inputHead = git(['rev-parse', 'HEAD']);
  const object = manifestObject();
  object.base = inputHead;
  object.inputHead = inputHead;
  const manifestPath = path.join(changeDirectory, 'manifest.json');
  fs.writeFileSync(manifestPath, canonicalJson(object) + '\n');
  const parsed = parseManifest(fs.readFileSync(manifestPath));
  const task = parsed.manifest.tasks[0];
  await assert.rejects(
    executeOperation({
      parsed,
      task,
      operation: 'review',
      strategy: 'hybrid',
      pins: Object.freeze({ executables: [{ name: 'codex', version: 'codex-cli test' }] }),
      manifestPath,
      executeModelFn: () => {
        throw new Error('invalid starting state must not start a model');
      },
    }),
    (error) => error?.exit === 8,
  );
  const result = await executeOperation({
    parsed,
    task,
    operation: 'make',
    strategy: 'hybrid',
    pins: Object.freeze({ executables: [{ name: 'codex', version: 'codex-cli test' }] }),
    manifestPath,
    prepareTransportFn: ({ transport }) => {
      fs.mkdirSync(transport, { mode: 0o700 });
      return { profileSha256: '1'.repeat(64), authMaterialSha256: '2'.repeat(64) };
    },
    executeModelFn: ({ request, source }) => ({
      protocol: 'loop-model-result-v3.5',
      operation: 'make',
      requestSha256: sha256(canonicalJson(request)),
      sourceViewSha256: source.identity.sourceViewSha256,
      status: 'proposal',
      patch: [
        'diff --git a/scripts/model-runner-v3/source.js b/scripts/model-runner-v3/source.js',
        'index bd816ea..4bbffde 100644',
        '--- a/scripts/model-runner-v3/source.js',
        '+++ b/scripts/model-runner-v3/source.js',
        '@@ -1 +1 @@',
        '-module.exports = 1;',
        '+module.exports = 2;',
        '',
      ].join('\n'),
      findings: [],
      evidence: [],
      summary: 'deterministic fixture proposal',
    }),
  });
  assert.equal(result.status, 'proposal');
  const persisted = readState(statePath(directory, parsed, task), parsed, task);
  assert.equal(persisted.state, 'proposal_ready');
  assert.equal(persisted.lastExit, 0);
  assert.match(persisted.proposalCommit, /^[0-9a-f]{40}$/u);
  assert.match(persisted.resultRef, /^refs\/model-runner-v3\//u);
  assert.equal(git(['show', `${persisted.proposalCommit}:scripts/model-runner-v3/source.js`]), 'module.exports = 2;');
  assert.equal(git(['rev-parse', persisted.resultRef]), persisted.proposalCommit);
  assert.equal(
    fs.existsSync(path.join(path.dirname(statePath(directory, parsed, task)), 'results', 'make-1.result.json')),
    true,
  );
  const paths = runtimePaths(directory, parsed.manifestSha256, sha256(task.id));
  const operationKeySha256 = operationKey({
    modelRunnerIdentitySha256: MODEL_RUNNER_IDENTITY_SHA256,
    checkpoint: parsed.manifest.checkpoint,
    manifestSha256: parsed.manifestSha256,
    taskId: task.id,
    operation: 'make',
    inputHead,
    round: 1,
  });
  const operationRecords = readJournal(
    path.join(paths.operationDirectory, `${operationKeySha256}.jsonl`),
    { name: 'operationKeySha256', value: operationKeySha256 },
  );
  assert.deepEqual(operationRecords.map((row) => row.state), [
    'prepared', 'model_started', 'result_sealed', 'apply_started',
    'commit_created', 'ref_published', 'completed',
  ]);
  const reservation = JSON.parse(fs.readFileSync(
    path.join(paths.reservationDirectory, operationKeySha256, '0.json'),
    'utf8',
  ));
  const resourceRecords = readJournal(
    path.join(paths.resourceJournalDirectory, `${reservation.resourceAttemptKeySha256}.jsonl`),
    { name: 'resourceAttemptKeySha256', value: reservation.resourceAttemptKeySha256 },
  );
  assert.deepEqual(resourceRecords.map((row) => row.state), [
    'allocated', 'view_ready', 'transport_ready', 'scratch_ready',
    'child_started', 'child_exited', 'cleanup_started', 'cleanup_complete',
  ]);
  const attempt = JSON.parse(fs.readFileSync(
    path.join(paths.attemptDirectory, `${reservation.resourceAttemptKeySha256}.json`),
    'utf8',
  ));
  assert.equal(attempt.modelRunnerIdentitySha256, MODEL_RUNNER_IDENTITY_SHA256);
  assert.equal(attempt.operationKeySha256, operationKeySha256);
  assert.equal(attempt.resourceAttemptOrdinal, 0);
  assert.equal(attempt.processClassification, 'exited');
  assert.equal(attempt.primaryFailureCode, 'OK');
  assert.equal(attempt.finalExit, 0);
  assert.equal(fs.readdirSync(paths.liveDirectory).length, 0);
  const resultStat = fs.statSync(path.join(paths.resultDirectory, 'make-1.result.json'));
  const statusStat = fs.statSync(paths.status);
  assert.ok(resultStat.mtimeMs <= statusStat.mtimeMs);
  const operationJournalPath = path.join(
    paths.operationDirectory,
    `${operationKeySha256}.jsonl`,
  );
  const resourceJournalPath = path.join(
    paths.resourceJournalDirectory,
    `${reservation.resourceAttemptKeySha256}.jsonl`,
  );
  fs.writeFileSync(
    operationJournalPath,
    fs.readFileSync(operationJournalPath, 'utf8').split('\n').slice(0, 3).join('\n') + '\n',
  );
  fs.writeFileSync(
    resourceJournalPath,
    fs.readFileSync(resourceJournalPath, 'utf8').split('\n').slice(0, 6).join('\n') + '\n',
  );
  createOwnedResource(paths, reservation);
  fs.writeFileSync(paths.status, canonicalJson({
    protocol: 'loop-model-status-v3.5',
    manifestSha256: parsed.manifestSha256,
    modelRunnerIdentitySha256: MODEL_RUNNER_IDENTITY_SHA256,
    taskId: task.id,
    inputHead,
    state: 'making',
    makeRound: 1,
    reviewRound: 0,
    verifyRound: 0,
    proposalCommit: null,
    resultRef: null,
    lastOperation: 'make',
    lastExit: null,
    integrity: 'ok',
  }) + '\n');
  const replayed = await executeOperation({
    parsed,
    task,
    operation: 'make',
    strategy: 'hybrid',
    pins: Object.freeze({ executables: [{ name: 'codex', version: 'codex-cli test' }] }),
    manifestPath,
    executeModelFn: () => {
      throw new Error('terminal replay must not respawn the model');
    },
  });
  assert.equal(replayed.status, 'proposal');
  const replayedState = readState(paths.status, parsed, task);
  assert.equal(replayedState.state, 'proposal_ready');
  assert.equal(replayedState.proposalCommit, persisted.proposalCommit);
  assert.equal(replayedState.resultRef, persisted.resultRef);
  assert.equal(fs.readdirSync(path.join(paths.reservationDirectory, operationKeySha256)).length, 1);
  assert.deepEqual(
    readJournal(operationJournalPath, {
      name: 'operationKeySha256',
      value: operationKeySha256,
    }).map((row) => row.state),
    [
      'prepared', 'model_started', 'result_sealed', 'apply_started',
      'commit_created', 'ref_published', 'completed',
    ],
  );
  assert.deepEqual(
    readJournal(resourceJournalPath, {
      name: 'resourceAttemptKeySha256',
      value: reservation.resourceAttemptKeySha256,
    }).map((row) => row.state),
    [
      'allocated', 'view_ready', 'transport_ready', 'scratch_ready',
      'child_started', 'child_exited', 'cleanup_started', 'cleanup_complete',
    ],
  );
  fs.writeFileSync(paths.status, canonicalJson({
    protocol: 'loop-model-status-v3.5',
    manifestSha256: parsed.manifestSha256,
    modelRunnerIdentitySha256: MODEL_RUNNER_IDENTITY_SHA256,
    taskId: task.id,
    inputHead,
    state: 'making',
    makeRound: 1,
    reviewRound: 0,
    verifyRound: 0,
    proposalCommit: null,
    resultRef: null,
    lastOperation: 'make',
    lastExit: null,
    integrity: 'ok',
  }) + '\n');
  const terminalReplay = await executeOperation({
    parsed,
    task,
    operation: 'make',
    strategy: 'hybrid',
    pins: Object.freeze({ executables: [{ name: 'codex', version: 'codex-cli test' }] }),
    manifestPath,
    executeModelFn: () => {
      throw new Error('completed replay must not respawn the model');
    },
  });
  assert.equal(terminalReplay.status, 'proposal');

  await assert.rejects(
    executeOperation({
      parsed,
      task,
      operation: 'review',
      strategy: 'hybrid',
      pins: Object.freeze({ executables: [{ name: 'codex', version: 'codex-cli test' }] }),
      manifestPath,
      prepareTransportFn: ({ transport }) => {
        fs.mkdirSync(transport, { mode: 0o700 });
        return { profileSha256: '3'.repeat(64), authMaterialSha256: '4'.repeat(64) };
      },
      executeModelFn: ({ request, source }) => ({
        protocol: 'loop-model-result-v3.5',
        operation: 'review',
        requestSha256: sha256(canonicalJson(request)),
        sourceViewSha256: source.identity.sourceViewSha256,
        status: 'pass',
        patch: null,
        findings: [],
        evidence: [{
          kind: 'probe',
          ref: 'cleanup-retention',
          status: 'pass',
          exitCode: 0,
          sha256: null,
          summary: 'semantic review completed before cleanup',
        }],
        summary: 'review passed before cleanup failure',
      }),
      removeOwnedResourceFn: () => {
        throw new Error('injected cleanup failure');
      },
    }),
    (error) => error?.exit === 11,
  );
  const cleanupFailureState = readState(paths.status, parsed, task);
  assert.equal(cleanupFailureState.state, 'recovery_required');
  assert.equal(cleanupFailureState.lastExit, 11);
  assert.equal(cleanupFailureState.proposalCommit, persisted.proposalCommit);
  assert.equal(cleanupFailureState.resultRef, persisted.resultRef);
  const reviewOperationKey = operationKey({
    modelRunnerIdentitySha256: MODEL_RUNNER_IDENTITY_SHA256,
    checkpoint: parsed.manifest.checkpoint,
    manifestSha256: parsed.manifestSha256,
    taskId: task.id,
    operation: 'review',
    inputHead,
    round: 1,
  });
  const reviewOperationRecords = readJournal(
    path.join(paths.operationDirectory, `${reviewOperationKey}.jsonl`),
    { name: 'operationKeySha256', value: reviewOperationKey },
  );
  assert.deepEqual(reviewOperationRecords.map((row) => row.state), [
    'prepared', 'model_started', 'result_sealed', 'verdict_recorded', 'failed',
  ]);
  assert.equal(reviewOperationRecords.at(-1).failureCode, 'IO_ERROR');
  assert.equal(reviewOperationRecords.at(-1).payload.retainedResultSha256, cleanupFailureState.resultSha256);
  const reviewReservation = JSON.parse(fs.readFileSync(
    path.join(paths.reservationDirectory, reviewOperationKey, '0.json'),
    'utf8',
  ));
  const reviewResourceRecords = readJournal(
    path.join(paths.resourceJournalDirectory, `${reviewReservation.resourceAttemptKeySha256}.jsonl`),
    { name: 'resourceAttemptKeySha256', value: reviewReservation.resourceAttemptKeySha256 },
  );
  assert.deepEqual(reviewResourceRecords.map((row) => row.state), [
    'allocated', 'view_ready', 'transport_ready', 'scratch_ready',
    'child_started', 'child_exited', 'cleanup_started', 'failed',
  ]);
  const reviewAttempt = JSON.parse(fs.readFileSync(
    path.join(paths.attemptDirectory, `${reviewReservation.resourceAttemptKeySha256}.json`),
    'utf8',
  ));
  assert.equal(reviewAttempt.primaryFailureCode, 'OK');
  assert.equal(reviewAttempt.primaryExit, 0);
  assert.equal(reviewAttempt.finalExit, 11);
  await assert.rejects(
    executeOperation({
      parsed,
      task,
      operation: 'review',
      strategy: 'hybrid',
      pins: Object.freeze({ executables: [{ name: 'codex', version: 'codex-cli test' }] }),
      manifestPath,
      executeModelFn: () => {
        throw new Error('cleanup-failure replay must not respawn the model');
      },
    }),
    (error) => error?.exit === 11,
  );

  fs.writeFileSync(paths.status, canonicalJson({
    ...cleanupFailureState,
    state: 'review_passed',
    integrity: 'ok',
    lastOperation: 'review',
    lastExit: 0,
    verifyRound: 0,
  }) + '\n');
  const verifyOperationKey = operationKey({
    modelRunnerIdentitySha256: MODEL_RUNNER_IDENTITY_SHA256,
    checkpoint: parsed.manifest.checkpoint,
    manifestSha256: parsed.manifestSha256,
    taskId: task.id,
    operation: 'verify',
    inputHead,
    round: 1,
  });
  const abandoned = reserveResource(paths, {
    operationKeySha256: verifyOperationKey,
    operation: 'verify',
    round: 1,
  }, 'review_passed');
  createOwnedResource(paths, abandoned);
  let prePreparedModelStarts = 0;
  const invokePrePreparedRecovery = () => executeOperation({
    parsed,
    task,
    operation: 'verify',
    strategy: 'hybrid',
    pins: Object.freeze({ executables: [{ name: 'codex', version: 'codex-cli test' }] }),
    manifestPath,
    executeModelFn: () => {
      prePreparedModelStarts += 1;
      throw new Error('pre-prepared cleanup replay must not start a model');
    },
    removeOwnedResourceFn: () => {
      throw new Error('injected pre-prepared cleanup failure');
    },
  });
  await assert.rejects(invokePrePreparedRecovery(), (error) => error?.exit === 11);
  const prePreparedFailureState = readState(paths.status, parsed, task);
  assert.equal(prePreparedFailureState.state, 'recovery_required');
  assert.equal(prePreparedFailureState.integrity, 'recovery_required');
  assert.equal(prePreparedFailureState.lastOperation, 'verify');
  assert.equal(prePreparedFailureState.lastExit, 11);
  assert.equal(prePreparedModelStarts, 0);
  const abandonedRecords = readJournal(
    path.join(paths.resourceJournalDirectory, `${abandoned.resourceAttemptKeySha256}.jsonl`),
    { name: 'resourceAttemptKeySha256', value: abandoned.resourceAttemptKeySha256 },
  );
  assert.deepEqual(abandonedRecords.map((row) => row.state), [
    'preparation_failed', 'cleanup_started', 'failed',
  ]);
  assert.equal(abandonedRecords.at(-1).failureCode, 'IO_ERROR');
  assert.equal(abandonedRecords.at(-1).exit, 11);
  assert.deepEqual(abandonedRecords.at(-1).payload, {
    phase: 'cleanup',
    primaryFailureCode: 'TASK_FAILED',
    primaryExit: 10,
  });
  const abandonedAttempt = JSON.parse(fs.readFileSync(
    path.join(paths.attemptDirectory, `${abandoned.resourceAttemptKeySha256}.json`),
    'utf8',
  ));
  assert.equal(abandonedAttempt.processClassification, 'not_started');
  assert.equal(abandonedAttempt.primaryFailureCode, 'TASK_FAILED');
  assert.equal(abandonedAttempt.primaryExit, 10);
  assert.equal(abandonedAttempt.finalExit, 11);
  await assert.rejects(invokePrePreparedRecovery(), (error) => error?.exit === 11);
  assert.equal(prePreparedModelStarts, 0);
  assert.deepEqual(
    readJournal(
      path.join(paths.resourceJournalDirectory, `${abandoned.resourceAttemptKeySha256}.jsonl`),
      { name: 'resourceAttemptKeySha256', value: abandoned.resourceAttemptKeySha256 },
    ),
    abandonedRecords,
  );
  assert.equal(
    fs.readdirSync(path.join(paths.reservationDirectory, verifyOperationKey)).length,
    1,
  );
  fs.rmSync(directory, { recursive: true, force: true });
});
