import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This program is deliberately base-owned: it is checked out from the protected
// pull-request base, consumes only the preceding base-owned bootstrap artifact,
// and writes every envelope itself. Candidate scripts may be executed only after
// this program creates a detached, clean checkout with a replacement environment.
const baseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const changeRelative = '.loop-engineering/state/changes/source-led-opportunity-engine-v3';
const registryRelative = `${changeRelative}/external-gate-release-registry-v1.json`;
const attestationKeys = [
  'baseCommitSha', 'checkRun', 'registryCommitSha', 'registryPath', 'registrySha256',
  'registryTreeSha', 'releaseId', 'releaseSha256', 'repository', 'schema',
  'subjectCommitSha', 'subjectTreeSha', 'workflowPath',
];
const envelopeKeys = [
  'attestation', 'harnessReleaseSha256', 'issuedAt', 'issuer', 'result', 'resultSha256',
  'schema', 'subjectCommitSha', 'subjectTreeSha',
];
const resultKeys = [
  'acceptanceVersion', 'activeGraphSha256', 'blockedReason', 'check', 'commandCatalogSha256',
  'commands', 'commitSha', 'completedAt', 'cwdMode', 'evidenceSha256', 'executedCount',
  'inputs', 'partition', 'registeredCount', 'review', 'schema', 'scriptValueRowsSha256',
  'status', 'treeSha',
];
const reviewKeys = [
  'evidenceCommitSha', 'evidenceFileSha256', 'evidenceOnlyPaths', 'evidencePath',
  'evidenceTreeSha', 'p0', 'p1', 'pcrFulfillmentPath', 'pcrFulfillmentSha256',
  'reviewedActiveGraphSha256', 'reviewedBaseSha', 'reviewedHeadOrTreeSha', 'reviewedRange',
  'reviewedTreeSha', 'verdict',
];
const requiredChecks = [
  'requirements', 'architecture', 'product-runtime-code-gate', 'model-runner-code-gate', 'exact-review',
];
const gatePolicies = Object.freeze({
  requirements: { commands: [], count: 0, partition: null, review: true },
  architecture: { commands: [], count: 0, partition: null, review: true },
  'product-runtime-code-gate': {
    commands: [['product-runtime-track', 'protected://stockinsider-v3-gate-root/execute-track --track product_runtime']],
    count: 249,
    partition: 'product_runtime',
    review: false,
  },
  'model-runner-code-gate': {
    commands: [['model-runner-track', 'protected://stockinsider-v3-gate-root/execute-track --track model_runner']],
    count: 28,
    partition: 'model_runner',
    review: false,
  },
  'exact-review': { commands: [], count: 0, partition: null, review: true },
  'code-gate-aggregate': { commands: [], count: 0, partition: null, review: false },
});
const reviewSources = Object.freeze({
  requirements: {
    ref: 'refs/remotes/origin/codex/source-led-opportunity-engine-v3-requirements-evidence',
    path: `${changeRelative}/requirements-review-round-100.md`,
    finalLine: 'Final repair-closure commit/tree',
    rangeLine: 'Full reviewed range',
  },
  architecture: {
    ref: 'refs/remotes/origin/codex/source-led-opportunity-engine-v3-architecture-evidence-v2',
    path: `${changeRelative}/architecture-review-round-11.md`,
    finalLine: 'Final repair-closure commit/tree',
    rangeLine: 'Full reviewed implementation range',
  },
  'exact-review': {
    ref: 'refs/remotes/origin/codex/source-led-opportunity-engine-v3-exact-review-evidence',
    path: `${changeRelative}/exact-commit-review-final.md`,
    finalLine: 'Final reviewed repair/tree',
    rangeLine: 'Full final range',
  },
});

function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), 'canonical JSON finite number');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  assert.ok(value && typeof value === 'object', 'canonical JSON object');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, keys, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} keys`);
}

function sha(value, label, length = 40) {
  assert.match(value, new RegExp(`^[0-9a-f]{${length}}$`, 'u'), label);
}

function absolute(value, label) {
  assert.equal(path.isAbsolute(value), true, `${label} absolute`);
  return path.resolve(value);
}

function git(cwd, args, options = {}) {
  return execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8', ...options }).trim();
}

function gitStatus(cwd, args) {
  const result = spawnSync('/usr/bin/git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.error, undefined, `git ${args.join(' ')} starts`);
  return result.status;
}

function treeBlob(cwd, treeSha, relativePath, label) {
  assert.match(relativePath, /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u, `${label} safe path`);
  assert.equal(git(cwd, ['cat-file', '-t', `${treeSha}:${relativePath}`]), 'blob', `${label} blob`);
  return execFileSync('/usr/bin/git', ['cat-file', 'blob', `${treeSha}:${relativePath}`], { cwd });
}

function cleanTree(cwd, expectedCommit, expectedTree) {
  assert.equal(git(cwd, ['rev-parse', 'HEAD']), expectedCommit, 'subject HEAD');
  assert.equal(git(cwd, ['rev-parse', 'HEAD^{tree}']), expectedTree, 'subject tree');
  assert.equal(gitStatus(cwd, ['symbolic-ref', '--quiet', 'HEAD']), 1, 'subject must be detached');
  assert.equal(git(cwd, ['status', '--porcelain=v1', '--untracked-files=all']), '', 'subject checkout clean');
}

function readAttestation(filename) {
  const value = JSON.parse(readFileSync(absolute(filename, 'attestation path'), 'utf8'));
  exactKeys(value, attestationKeys, 'bootstrap attestation');
  assert.equal(value.schema, 'stockinsider-external-gate-attestation-v1', 'attestation schema');
  assert.equal(value.repository, 'Kaichen9527/stockinsider', 'attestation repository');
  assert.equal(value.workflowPath, '.github/workflows/source-led-opportunity-external-gate.yml', 'attestation workflow');
  assert.equal(value.checkRun, 'stockinsider-v3-gate-root', 'attestation root check');
  assert.equal(value.registryPath, registryRelative, 'attestation registry path');
  for (const key of ['baseCommitSha', 'registryCommitSha', 'registryTreeSha', 'subjectCommitSha', 'subjectTreeSha']) sha(value[key], `attestation ${key}`);
  for (const key of ['registrySha256', 'releaseSha256']) sha(value[key], `attestation ${key}`, 64);
  return value;
}

function validateAttestation(attestation, subjectRoot) {
  assert.equal(git(baseRoot, ['rev-parse', 'HEAD']), attestation.baseCommitSha, 'worker must execute protected base');
  assert.equal(git(baseRoot, ['status', '--porcelain=v1', '--untracked-files=all']), '', 'protected base checkout clean');
  assert.equal(git(subjectRoot, ['cat-file', '-t', attestation.subjectCommitSha]), 'commit', 'attested subject commit exists');
  assert.equal(git(subjectRoot, ['cat-file', '-t', attestation.baseCommitSha]), 'commit', 'attested base commit exists');
  assert.equal(gitStatus(subjectRoot, ['merge-base', '--is-ancestor', attestation.baseCommitSha, attestation.subjectCommitSha]), 0, 'subject descends from attested base');
  assert.equal(git(subjectRoot, ['rev-parse', `${attestation.subjectCommitSha}^{tree}`]), attestation.subjectTreeSha, 'attested subject tree');
  assert.equal(git(subjectRoot, ['rev-parse', `${attestation.registryCommitSha}^{tree}`]), attestation.registryTreeSha, 'attested registry tree');
  assert.equal(gitStatus(subjectRoot, ['merge-base', '--is-ancestor', attestation.registryCommitSha, attestation.baseCommitSha]), 0, 'registry precedes base');
  const registryBytes = treeBlob(subjectRoot, attestation.registryTreeSha, registryRelative, 'registered release registry');
  assert.equal(sha256(registryBytes), attestation.registrySha256, 'registered release registry digest');
  const registry = JSON.parse(registryBytes);
  exactKeys(registry, ['issuer', 'protectedCheckRun', 'protectedWorkflowPath', 'releases', 'repository', 'schema'], 'registered release registry');
  assert.equal(registry.schema, 'stockinsider-external-gate-release-registry-v1', 'registry schema');
  assert.equal(registry.issuer, 'stockinsider-v3-gate-root', 'registry issuer');
  assert.equal(registry.repository, attestation.repository, 'registry repository');
  const release = registry.releases.find(({ id }) => id === attestation.releaseId);
  assert.ok(release, 'attestation release exists');
  exactKeys(release, ['bootstrapPath', 'bootstrapSha256', 'id'], 'attestation release');
  const bootstrapBytes = treeBlob(subjectRoot, attestation.registryTreeSha, release.bootstrapPath, 'registered bootstrap');
  assert.equal(sha256(bootstrapBytes), attestation.releaseSha256, 'registered bootstrap digest');
  assert.equal(release.bootstrapSha256, attestation.releaseSha256, 'release digest matches attestation');
  cleanTree(subjectRoot, attestation.subjectCommitSha, attestation.subjectTreeSha);
}

function subjectIdentity(subjectRoot, attestation) {
  const catalogPath = `${changeRelative}/active-artifact-catalog-v3.json`;
  const catalogBytes = treeBlob(subjectRoot, attestation.subjectTreeSha, catalogPath, 'active catalog');
  const catalog = JSON.parse(catalogBytes);
  const rows = catalog.activeFiles.map((file) => {
    const repositoryPath = `${changeRelative}/${file}`;
    const bytes = treeBlob(subjectRoot, attestation.subjectTreeSha, repositoryPath, `active artifact ${file}`);
    return [file, git(subjectRoot, ['rev-parse', `${attestation.subjectTreeSha}:${repositoryPath}`]), bytes.length, sha256(bytes)];
  });
  const inventory = JSON.parse(treeBlob(subjectRoot, attestation.subjectTreeSha, `${changeRelative}/acceptance-tests.json`, 'acceptance inventory'));
  return {
    activeGraphSha256: sha256(canonicalJson(['opportunity-active-graph-v1', sha256(catalogBytes), rows])),
    inventory,
  };
}

function timestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

function writeCanonical(filename, value) {
  writeFileSync(absolute(filename, 'output path'), `${canonicalJson(value)}\n`, { encoding: 'utf8', flag: 'wx' });
}

function envelope(attestation, result) {
  return {
    attestation,
    harnessReleaseSha256: attestation.releaseSha256,
    issuedAt: timestamp(),
    issuer: 'stockinsider-v3-gate-root',
    result,
    resultSha256: sha256(canonicalJson(result)),
    schema: 'stockinsider-external-gate-envelope-v1',
    subjectCommitSha: attestation.subjectCommitSha,
    subjectTreeSha: attestation.subjectTreeSha,
  };
}

function baseResult(check, identity, attestation) {
  return {
    acceptanceVersion: identity.inventory.version,
    activeGraphSha256: identity.activeGraphSha256,
    blockedReason: null,
    check,
    commandCatalogSha256: null,
    commands: [],
    commitSha: attestation.subjectCommitSha,
    completedAt: timestamp(),
    cwdMode: null,
    inputs: [],
    partition: null,
    registeredCount: 0,
    executedCount: 0,
    review: null,
    schema: 'opportunity-gate-result-v1',
    scriptValueRowsSha256: identity.inventory.scriptValueRowsSha256,
    status: 'pass',
    treeSha: attestation.subjectTreeSha,
  };
}

function captureReview(subjectRoot, check, identity, attestation) {
  const source = reviewSources[check];
  assert.ok(source, 'closed review check');
  const evidenceCommitSha = git(subjectRoot, ['rev-parse', source.ref]);
  sha(evidenceCommitSha, 'evidence commit');
  const evidenceTreeSha = git(subjectRoot, ['rev-parse', `${evidenceCommitSha}^{tree}`]);
  const bytes = treeBlob(subjectRoot, evidenceTreeSha, source.path, `${check} evidence`);
  const markdown = bytes.toString('utf8');
  assert.match(markdown, /(?:Result|Final verdict): `PASS`/u, `${check} review verdict`);
  assert.match(markdown, /P0=0 P1=0/u, `${check} review findings`);
  const finalMatch = markdown.match(new RegExp('^- ' + source.finalLine + ': `([0-9a-f]{40})` / `([0-9a-f]{40})`$', 'mu'));
  assert.ok(finalMatch, `${check} reviewed commit/tree`);
  const rangeMatch = markdown.match(new RegExp('^- ' + source.rangeLine + ': `([0-9a-f]{40}\\.\\.[0-9a-f]{40})`$', 'mu'));
  assert.ok(rangeMatch, `${check} reviewed range`);
  const graphMatch = markdown.match(/^- Active graph: `([0-9a-f]{64})`$/mu);
  assert.ok(graphMatch, `${check} active graph`);
  assert.equal(graphMatch[1], identity.activeGraphSha256, `${check} active graph matches subject`);
  const reviewedBaseSha = rangeMatch[1].slice(0, 40);
  const reviewedHeadOrTreeSha = rangeMatch[1].slice(42);
  assert.equal(reviewedHeadOrTreeSha, finalMatch[1], `${check} reviewed range head`);
  assert.equal(git(subjectRoot, ['rev-parse', `${reviewedHeadOrTreeSha}^{tree}`]), finalMatch[2], `${check} reviewed head tree`);
  if (check === 'exact-review') {
    // A review of an equal tree is not a review of an equal implementation
    // commit: parentage and immutable range provenance are part of the claim.
    assert.equal(reviewedHeadOrTreeSha, attestation.subjectCommitSha, 'exact-review reviewed subject commit');
    assert.equal(finalMatch[2], attestation.subjectTreeSha, 'exact-review reviewed subject tree');
  }
  const evidenceOnlyPaths = git(subjectRoot, ['diff-tree', '--no-commit-id', '--name-only', '-r', finalMatch[2], evidenceTreeSha])
    .split('\n').filter(Boolean).toSorted();
  assert.ok(evidenceOnlyPaths.includes(source.path), `${check} evidence path changed`);
  const review = {
    evidenceCommitSha,
    evidenceFileSha256: sha256(bytes),
    evidenceOnlyPaths,
    evidencePath: source.path,
    evidenceTreeSha,
    p0: 0,
    p1: 0,
    pcrFulfillmentPath: null,
    pcrFulfillmentSha256: null,
    reviewedActiveGraphSha256: identity.activeGraphSha256,
    reviewedBaseSha,
    reviewedHeadOrTreeSha,
    reviewedRange: rangeMatch[1],
    reviewedTreeSha: finalMatch[2],
    verdict: 'PASS',
  };
  if (check === 'exact-review') {
    const pcrFulfillmentPath = `${changeRelative}/pcr-fulfillment-record-v1.json`;
    const fulfillment = treeBlob(subjectRoot, evidenceTreeSha, pcrFulfillmentPath, 'exact-review PCR fulfillment');
    review.pcrFulfillmentPath = pcrFulfillmentPath;
    review.pcrFulfillmentSha256 = sha256(fulfillment);
  }
  return review;
}

function stageModelAuthentication(scratch) {
  const runnerHome = process.env.HOME;
  assert.equal(typeof runnerHome, 'string', 'runner HOME required for model authentication');
  const source = path.join(absolute(runnerHome, 'runner HOME'), '.codex', 'auth.json');
  const before = lstatSync(source);
  assert.equal(before.isSymbolicLink(), false, 'model authentication cannot be a symbolic link');
  assert.equal(before.isFile(), true, 'model authentication must be a regular file');
  assert.equal(before.uid, process.getuid(), 'model authentication owned by runner user');
  assert.equal(before.mode & 0o077, 0, 'model authentication cannot grant group/other access');
  assert.ok(before.size > 0 && before.size <= 1024 * 1024, 'model authentication bounded size');
  const descriptor = openSync(source, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    assert.equal(opened.isFile(), true, 'opened model authentication regular file');
    assert.equal(opened.dev, before.dev, 'model authentication device stable');
    assert.equal(opened.ino, before.ino, 'model authentication inode stable');
    assert.equal(opened.uid, before.uid, 'model authentication owner stable');
    assert.equal(opened.mode & 0o077, 0, 'opened model authentication permissions');
    const bytes = readFileSync(descriptor);
    JSON.parse(bytes.toString('utf8'));
    const codexDirectory = path.join(scratch, '.codex');
    mkdirSync(codexDirectory, { mode: 0o700 });
    writeFileSync(path.join(codexDirectory, 'auth.json'), bytes, { flag: 'wx', mode: 0o600 });
  } finally {
    closeSync(descriptor);
  }
}

function sanitizedEnvironment(attestation, track, extra = {}) {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'stockinsider-v3-external-gate-'));
  try {
    if (track === 'model_runner') stageModelAuthentication(scratch);
    return {
      environment: {
        HOME: scratch,
        LANG: 'C',
        LC_ALL: 'C',
        PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
        PLAYWRIGHT_BROWSERS_PATH: '0',
        TMPDIR: scratch,
        TZ: 'Asia/Taipei',
        OPPORTUNITY_V3_GATE_HARNESS_RELEASE_SHA256: attestation.releaseSha256,
        OPPORTUNITY_V3_GATE_RUNNER: 'protected-external-harness-v1',
        OPPORTUNITY_V3_GATE_RUNNER_COMMIT: attestation.subjectCommitSha,
        ...extra,
      },
      scratch,
    };
  } catch (error) {
    rmSync(scratch, { force: true, recursive: true });
    throw error;
  }
}

function run(subjectRoot, executable, args, environment, label) {
  const detached = process.platform !== 'win32';
  const result = spawnSync(executable, args, {
    cwd: subjectRoot,
    detached,
    encoding: null,
    env: environment,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (detached && Number.isSafeInteger(result.pid) && result.pid > 1) {
    try {
      process.kill(-result.pid, 'SIGKILL');
    } catch (error) {
      assert.equal(error?.code, 'ESRCH', `${label} candidate process-group cleanup`);
    }
  }
  if (result.error) throw result.error;
  const stdout = Buffer.from(result.stdout ?? '');
  const stderr = Buffer.from(result.stderr ?? '');
  assert.equal(result.signal, null, `${label} signal`);
  assert.equal(
    result.status,
    0,
    `${label} failed:\nstdout:\n${stdout.toString('utf8')}\nstderr:\n${stderr.toString('utf8')}`,
  );
  return { stdout, stderr };
}

function executeTrack(subjectRoot, track, identity, attestation) {
  const descriptor = track === 'product_runtime'
    ? { check: 'product-runtime-code-gate', count: 249, name: 'product-runtime-track' }
    : track === 'model_runner'
      ? { check: 'model-runner-code-gate', count: 28, name: 'model-runner-track' }
      : null;
  assert.ok(descriptor, 'closed executable track');
  const { environment, scratch } = sanitizedEnvironment(attestation, track, {
    OPPORTUNITY_V3_ACCEPTANCE_TRACK: track,
    OPPORTUNITY_V3_GATE_ROOT: realpathSync(subjectRoot),
  });
  try {
    const outputs = [];
    const execute = (executable, args, label) => outputs.push(run(subjectRoot, executable, args, environment, label));
    execute('npm', ['ci', '--ignore-scripts'], 'root dependency preparation');
    // Acceptance ownership tests exercise shared Web modules for both tracks. Install
    // their locked dependencies before either traceability run; no lifecycle scripts
    // or ambient credentials are inherited into this detached checkout.
    execute('npm', ['--prefix', 'web', 'ci', '--ignore-scripts'], 'web dependency preparation');
    // PCR-024 is an explicit acceptance-owner probe in both partitions, so its
    // project-local browser binary is part of each isolated trace's prerequisites.
    execute(path.join(subjectRoot, 'web/node_modules/.bin/playwright'), ['install', '--with-deps', 'chromium'], 'project-local Chromium preparation');
    cleanTree(subjectRoot, attestation.subjectCommitSha, attestation.subjectTreeSha);
    execute(process.execPath, ['--experimental-strip-types', 'scripts/opportunity-v3/acceptance-gate-runner.mjs', '--track', track], `${track} traceability`);
    if (track === 'product_runtime') {
      for (const script of [
        'test:source-led-opportunity-v3',
        'test:source-led-opportunity-v3:product-correctness',
        'test:source-led-opportunity-v3:migration',
        'test:legacy-v1-v2-regression',
        'typecheck:source-led-opportunity-v3',
        'lint:source-led-opportunity-v3',
        'build:source-led-opportunity-v3',
      ]) execute('npm', ['run', script], script);
      execute('npm', ['--prefix', 'web', 'run', 'test:e2e:v3-correctness'], 'test:e2e:v3-correctness');
      execute('npm', ['run', 'test:source-led-opportunity-v3:performance'], 'test:source-led-opportunity-v3:performance');
    } else {
      execute('npm', ['run', 'test:model-runner-v3'], 'test:model-runner-v3');
      execute('npm', ['run', 'v3:doctor', '--', '--expect-mode', 'disabled', '--require-host-pin', 'model-runner-host-pins-v3.5'], 'disabled model runner doctor');
    }
    cleanTree(subjectRoot, attestation.subjectCommitSha, attestation.subjectTreeSha);
    const stdout = Buffer.concat(outputs.map(({ stdout: value }) => value));
    const stderr = Buffer.concat(outputs.map(({ stderr: value }) => value));
    const result = baseResult(descriptor.check, identity, attestation);
    result.commands = [{
      command: `protected://stockinsider-v3-gate-root/execute-track --track ${track}`,
      exitCode: 0,
      failed: 0,
      name: descriptor.name,
      passed: descriptor.count,
      skipped: 0,
      stderrSha256: sha256(stderr),
      stdoutSha256: sha256(stdout),
      todo: 0,
    }];
    result.executedCount = descriptor.count;
    result.partition = track;
    result.registeredCount = descriptor.count;
    result.evidenceSha256 = sha256(canonicalJson(result));
    return result;
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
}

function validateCommand(command, policy, index) {
  exactKeys(command, [
    'command', 'exitCode', 'failed', 'name', 'passed', 'skipped', 'stderrSha256',
    'stdoutSha256', 'todo',
  ], `command ${index}`);
  const [expectedName, expectedCommand] = policy.commands[index];
  assert.equal(command.name, expectedName, `command ${index} name`);
  assert.equal(command.command, expectedCommand, `command ${index} invocation`);
  assert.equal(command.exitCode, 0, `command ${index} exit`);
  assert.equal(command.passed, policy.count, `command ${index} pass count`);
  for (const key of ['failed', 'skipped', 'todo']) assert.equal(command[key], 0, `command ${index} ${key}`);
  for (const key of ['stderrSha256', 'stdoutSha256']) sha(command[key], `command ${index} ${key}`, 64);
}

function validateReview(review, expectedCheck, identity, attestation) {
  exactKeys(review, reviewKeys, `${expectedCheck} review`);
  assert.equal(review.verdict, 'PASS', `${expectedCheck} review verdict`);
  assert.equal(review.p0, 0, `${expectedCheck} review P0`);
  assert.equal(review.p1, 0, `${expectedCheck} review P1`);
  for (const key of [
    'evidenceCommitSha', 'evidenceTreeSha', 'reviewedBaseSha', 'reviewedHeadOrTreeSha',
    'reviewedTreeSha',
  ]) sha(review[key], `${expectedCheck} review ${key}`);
  for (const key of ['evidenceFileSha256', 'reviewedActiveGraphSha256']) {
    sha(review[key], `${expectedCheck} review ${key}`, 64);
  }
  assert.equal(review.reviewedActiveGraphSha256, identity.activeGraphSha256, `${expectedCheck} review graph`);
  assert.match(review.reviewedRange, /^[0-9a-f]{40}\.\.[0-9a-f]{40}$/u, `${expectedCheck} reviewed range`);
  assert.equal(review.reviewedRange.slice(0, 40), review.reviewedBaseSha, `${expectedCheck} range base`);
  assert.equal(review.reviewedRange.slice(42), review.reviewedHeadOrTreeSha, `${expectedCheck} range head`);
  assert.ok(Array.isArray(review.evidenceOnlyPaths), `${expectedCheck} evidence path array`);
  assert.deepEqual(review.evidenceOnlyPaths, [...new Set(review.evidenceOnlyPaths)].toSorted(), `${expectedCheck} evidence path order`);
  for (const evidencePath of review.evidenceOnlyPaths) {
    assert.match(evidencePath, /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u, `${expectedCheck} evidence path`);
  }
  assert.ok(review.evidenceOnlyPaths.includes(review.evidencePath), `${expectedCheck} evidence file included`);
  if (expectedCheck === 'exact-review') {
    assert.equal(review.reviewedHeadOrTreeSha, attestation.subjectCommitSha, 'exact-review subject commit');
    assert.equal(review.reviewedTreeSha, attestation.subjectTreeSha, 'exact-review subject tree');
    assert.equal(review.pcrFulfillmentPath, `${changeRelative}/pcr-fulfillment-record-v1.json`, 'exact-review PCR fulfillment path');
    sha(review.pcrFulfillmentSha256, 'exact-review PCR fulfillment digest', 64);
    assert.ok(review.evidenceOnlyPaths.includes(review.pcrFulfillmentPath), 'exact-review PCR fulfillment included');
  } else {
    assert.equal(review.pcrFulfillmentPath, null, `${expectedCheck} no PCR fulfillment path`);
    assert.equal(review.pcrFulfillmentSha256, null, `${expectedCheck} no PCR fulfillment digest`);
  }
}

function validateEnvelope(value, identity, attestation, expectedCheck) {
  exactKeys(value, envelopeKeys, 'external gate envelope');
  assert.equal(value.schema, 'stockinsider-external-gate-envelope-v1', 'envelope schema');
  assert.equal(value.issuer, 'stockinsider-v3-gate-root', 'envelope issuer');
  assert.deepEqual(value.attestation, attestation, 'envelope exact attestation');
  assert.equal(value.harnessReleaseSha256, attestation.releaseSha256, 'envelope release');
  assert.equal(value.subjectCommitSha, attestation.subjectCommitSha, 'envelope subject commit');
  assert.equal(value.subjectTreeSha, attestation.subjectTreeSha, 'envelope subject tree');
  assert.match(value.issuedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u, 'envelope issue time');
  sha(value.resultSha256, 'envelope result digest', 64);
  exactKeys(value.result, resultKeys, 'external gate result');
  const policy = gatePolicies[expectedCheck];
  assert.ok(policy, 'closed expected check policy');
  assert.equal(value.result.schema, 'opportunity-gate-result-v1', 'result schema');
  assert.equal(value.result.check, expectedCheck, 'envelope check');
  assert.equal(value.result.status, 'pass', 'envelope pass');
  assert.equal(value.result.blockedReason, null, 'pass has no blocker');
  assert.equal(value.result.commandCatalogSha256, null, 'no candidate command catalog authority');
  assert.equal(value.result.cwdMode, null, 'no candidate cwd claim');
  assert.equal(value.result.commitSha, attestation.subjectCommitSha, 'result subject commit');
  assert.equal(value.result.treeSha, attestation.subjectTreeSha, 'result subject tree');
  assert.equal(value.result.activeGraphSha256, identity.activeGraphSha256, 'result graph');
  assert.equal(value.result.acceptanceVersion, identity.inventory.version, 'result acceptance version');
  assert.equal(value.result.scriptValueRowsSha256, identity.inventory.scriptValueRowsSha256, 'result script rows');
  assert.match(value.result.completedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u, 'result completion time');
  sha(value.result.evidenceSha256, 'result evidence digest', 64);
  assert.equal(value.result.partition, policy.partition, 'result partition');
  assert.equal(value.result.registeredCount, policy.count, 'result registered count');
  assert.equal(value.result.executedCount, policy.count, 'result executed count');
  assert.ok(Array.isArray(value.result.commands), 'result commands array');
  assert.equal(value.result.commands.length, policy.commands.length, 'result command count');
  value.result.commands.forEach((command, index) => validateCommand(command, policy, index));
  if (policy.review) validateReview(value.result.review, expectedCheck, identity, attestation);
  else assert.equal(value.result.review, null, `${expectedCheck} cannot carry review evidence`);
  const expectedInputs = expectedCheck === 'code-gate-aggregate' ? requiredChecks : [];
  assert.ok(Array.isArray(value.result.inputs), 'result inputs array');
  assert.deepEqual(value.result.inputs.map(({ check }) => check), expectedInputs, 'result input order');
  for (const input of value.result.inputs) {
    exactKeys(input, ['check', 'evidenceSha256'], `result input ${input.check}`);
    sha(input.evidenceSha256, `result input ${input.check} digest`, 64);
  }
  const withoutEvidence = { ...value.result };
  delete withoutEvidence.evidenceSha256;
  assert.equal(value.result.evidenceSha256, sha256(canonicalJson(withoutEvidence)), 'result canonical evidence digest');
  assert.equal(value.resultSha256, sha256(canonicalJson(value.result)), 'result digest');
  return value;
}

function parseArguments(argv) {
  const [verb, ...rest] = argv;
  assert.ok(['prepare', 'review', 'track', 'aggregate'].includes(verb), 'closed worker verb');
  const values = { inputs: [], verb };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    assert.ok(['--attestation', '--subject-root', '--output', '--check', '--track', '--input'].includes(key) && typeof value === 'string', 'closed worker arguments');
    if (key === '--input') values.inputs.push(value);
    else {
      assert.equal(values[key], undefined, `one ${key}`);
      values[key] = value;
    }
  }
  for (const key of ['--attestation', '--subject-root']) assert.equal(typeof values[key], 'string', `${key} required`);
  if (verb !== 'prepare') assert.equal(typeof values['--output'], 'string', '--output required');
  if (verb === 'review') assert.ok(['requirements', 'architecture', 'exact-review'].includes(values['--check']), 'closed review check');
  if (verb === 'track') assert.ok(['product_runtime', 'model_runner'].includes(values['--track']), 'closed executable track');
  if (verb === 'aggregate') assert.equal(values.inputs.length, requiredChecks.length, 'five aggregate inputs');
  return values;
}

function prepare(attestation, subjectRoot) {
  assert.equal(git(baseRoot, ['rev-parse', 'HEAD']), attestation.baseCommitSha, 'prepare from protected base');
  assert.equal(git(baseRoot, ['status', '--porcelain=v1', '--untracked-files=all']), '', 'prepare base clean');
  const targets = [
    attestation.subjectCommitSha,
    ...Object.values(reviewSources).map(({ ref }) => {
      const remoteBranch = ref.replace('refs/remotes/origin/', 'refs/heads/');
      return `${remoteBranch}:${ref}`;
    }),
  ];
  execFileSync('/usr/bin/git', ['fetch', '--no-tags', 'origin', ...targets], { cwd: baseRoot, stdio: 'inherit' });
  const target = absolute(subjectRoot, 'subject root');
  execFileSync('/usr/bin/git', ['worktree', 'add', '--detach', target, attestation.subjectCommitSha], { cwd: baseRoot, stdio: 'inherit' });
  for (const command of [
    ['remote', 'remove', 'origin'],
    ['config', '--unset-all', 'http.https://github.com/.extraheader'],
  ]) {
    const result = spawnSync('/usr/bin/git', command, { cwd: target, encoding: 'utf8' });
    assert.ok(result.status === 0 || command[1] === '--unset-all', `sanitize subject Git config: ${command.join(' ')}`);
  }
  validateAttestation(attestation, target);
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const attestation = readAttestation(args['--attestation']);
  const subjectRoot = absolute(args['--subject-root'], 'subject root');
  if (args.verb === 'prepare') {
    prepare(attestation, subjectRoot);
    process.stdout.write(`${canonicalJson({ status: 'prepared', subjectCommitSha: attestation.subjectCommitSha, subjectRoot })}\n`);
    return;
  }
  validateAttestation(attestation, subjectRoot);
  const identity = subjectIdentity(subjectRoot, attestation);
  let result;
  if (args.verb === 'review') {
    result = baseResult(args['--check'], identity, attestation);
    result.review = captureReview(subjectRoot, args['--check'], identity, attestation);
    result.evidenceSha256 = sha256(canonicalJson(result));
  } else if (args.verb === 'track') {
    result = executeTrack(subjectRoot, args['--track'], identity, attestation);
  } else {
    const values = args.inputs.map((filename) => JSON.parse(readFileSync(absolute(filename, 'aggregate input'), 'utf8')));
    for (const [index, check] of requiredChecks.entries()) validateEnvelope(values[index], identity, attestation, check);
    result = baseResult('code-gate-aggregate', identity, attestation);
    result.inputs = values.map(({ result: input }) => ({ check: input.check, evidenceSha256: input.evidenceSha256 }));
    result.evidenceSha256 = sha256(canonicalJson(result));
  }
  const output = absolute(args['--output'], 'output');
  const produced = envelope(attestation, result);
  validateEnvelope(produced, identity, attestation, result.check);
  writeCanonical(output, produced);
  process.stdout.write(`${canonicalJson({ check: result.check, evidenceSha256: result.evidenceSha256, status: 'pass', subjectCommitSha: attestation.subjectCommitSha })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`protected external gate worker failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
