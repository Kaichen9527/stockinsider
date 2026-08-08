import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { canonicalJson } from '../../web/src/lib/opportunity-v3/canonical.ts';
import { validateOpportunityGateResult } from './gate-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const changeRelative = '.loop-engineering/state/changes/source-led-opportunity-engine-v3';
const change = path.join(root, changeRelative);
const registryRelative = `${changeRelative}/external-gate-release-registry-v1.json`;
const shadowCommandCatalogSha256 = '9224cc76f0aada2a2c678d27f71ed92a93c5c2cc37a9b4b4a90a831afe40a5c4';
const shadowCommands = [
  ['shadow-migration-rehearsal', '/usr/local/bin/node scripts/opportunity-v3/shadow-activation-gate.mjs migration-rehearsal'],
  ['shadow-runtime-installation-rehearsal', '/usr/local/bin/node scripts/opportunity-v3/shadow-activation-gate.mjs runtime-installation-rehearsal'],
  ['shadow-runtime-doctor', '/usr/local/bin/node scripts/opportunity-v3/shadow-activation-gate.mjs runtime-doctor'],
  ['shadow-disabled-web-smoke', '/usr/local/bin/node scripts/opportunity-v3/shadow-activation-gate.mjs disabled-web-smoke'],
  ['shadow-rollback-lock-verification', '/usr/local/bin/node scripts/opportunity-v3/shadow-activation-gate.mjs rollback-lock-verification'],
];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const git = (args) => execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' }).trim();

function graph() {
  const catalogPath = `${changeRelative}/active-artifact-catalog-v3.json`;
  const tree = git(['rev-parse', 'HEAD^{tree}']);
  const catalogBytes = execFileSync('/usr/bin/git', ['cat-file', 'blob', `${tree}:${catalogPath}`], { cwd: root });
  const catalog = JSON.parse(catalogBytes);
  const rows = catalog.activeFiles.map((file) => {
    const filePath = `${changeRelative}/${file}`;
    const oid = git(['rev-parse', `${tree}:${filePath}`]);
    const bytes = execFileSync('/usr/bin/git', ['cat-file', 'blob', oid], { cwd: root });
    return [file, oid, bytes.length, sha256(bytes)];
  });
  return sha256(canonicalJson(['opportunity-active-graph-v1', sha256(catalogBytes), rows]));
}

function subject() {
  const commit = git(['rev-parse', 'HEAD']);
  return { commit, tree: git(['rev-parse', 'HEAD^{tree}']), graph: graph() };
}

function attestation(currentSubject) {
  const registryCommitSha = git(['rev-parse', 'HEAD']);
  const registryTreeSha = git(['rev-parse', 'HEAD^{tree}']);
  const registryBytes = execFileSync('/usr/bin/git', ['cat-file', 'blob', `${registryTreeSha}:${registryRelative}`], { cwd: root });
  const registry = JSON.parse(registryBytes);
  const release = registry.releases[0];
  return {
    baseCommitSha: registryCommitSha,
    checkRun: 'stockinsider-v3-gate-root',
    registryCommitSha,
    registryPath: registryRelative,
    registrySha256: sha256(registryBytes),
    registryTreeSha,
    releaseId: release.id,
    releaseSha256: release.bootstrapSha256,
    repository: 'Kaichen9527/stockinsider',
    schema: 'stockinsider-external-gate-attestation-v1',
    subjectCommitSha: currentSubject.commit,
    subjectTreeSha: currentSubject.tree,
    workflowPath: '.github/workflows/source-led-opportunity-external-gate.yml',
  };
}

function result(check, inventory, currentSubject) {
  const policy = check === 'model-runner-code-gate'
    ? {
      command: 'protected://stockinsider-v3-gate-root/execute-track --track model_runner',
      count: 28,
      name: 'model-runner-track',
      partition: 'model_runner',
    }
    : { command: null, count: 0, name: null, partition: null };
  const commands = check === 'shadow-activation-gate'
    ? shadowCommands.map(([name, command]) => ({
      command,
      exitCode: 0,
      failed: 0,
      name,
      passed: 0,
      skipped: 0,
      stderrSha256: 'b'.repeat(64),
      stdoutSha256: 'c'.repeat(64),
      todo: 0,
    }))
    : policy.command === null ? [] : [{
      command: policy.command,
      exitCode: 0,
      failed: 0,
      name: policy.name,
      passed: policy.count,
      skipped: 0,
      stderrSha256: 'b'.repeat(64),
      stdoutSha256: 'c'.repeat(64),
      todo: 0,
    }];
  const value = {
    acceptanceVersion: inventory.version,
    activeGraphSha256: currentSubject.graph,
    blockedReason: null,
    check,
    commandCatalogSha256: check === 'shadow-activation-gate' ? shadowCommandCatalogSha256 : null,
    commands,
    commitSha: currentSubject.commit,
    completedAt: '2026-08-01T00:00:00Z',
    cwdMode: check === 'shadow-activation-gate' ? 'verified-subject-checkout-root' : null,
    inputs: [],
    partition: policy.partition,
    registeredCount: policy.count,
    executedCount: policy.count,
    review: null,
    schema: 'opportunity-gate-result-v1',
    scriptValueRowsSha256: inventory.scriptValueRowsSha256,
    status: 'pass',
    treeSha: currentSubject.tree,
  };
  value.evidenceSha256 = sha256(canonicalJson(value));
  return value;
}

function envelope(value, currentSubject) {
  const resultSha256 = sha256(canonicalJson(value));
  const authority = attestation(currentSubject);
  return {
    attestation: authority,
    harnessReleaseSha256: authority.releaseSha256,
    issuedAt: '2026-08-01T00:00:00Z',
    issuer: 'stockinsider-v3-gate-root',
    result: value,
    resultSha256,
    schema: 'stockinsider-external-gate-envelope-v1',
    subjectCommitSha: currentSubject.commit,
    subjectTreeSha: currentSubject.tree,
  };
}

function rewriteEvidence(value) {
  const withoutEvidence = { ...value };
  delete withoutEvidence.evidenceSha256;
  value.evidenceSha256 = sha256(canonicalJson(withoutEvidence));
}

function writeEnvelope(filename, value) {
  writeFileSync(filename, `${canonicalJson(value)}\n`);
}

function validateCommand(filename) {
  return [process.execPath, '--experimental-strip-types', 'scripts/opportunity-v3/gate-evidence.mjs', 'validate', '--input', filename];
}

test('PCR-023 gate evidence binds the registered external release and complete model partition', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'stockinsider-gate-evidence-'));
  try {
    const inventory = JSON.parse(readFileSync(path.join(change, 'acceptance-tests.json'), 'utf8'));
    const currentSubject = subject();
    const filename = path.join(directory, 'model.json');
    const canonical = envelope(result('model-runner-code-gate', inventory, currentSubject), currentSubject);
    writeEnvelope(filename, canonical);
    const command = validateCommand(filename);
    const accepted = spawnSync(command[0], command.slice(1), { cwd: root, encoding: 'utf8' });
    assert.equal(accepted.status, 0, accepted.stderr);

    const incomplete = structuredClone(canonical);
    incomplete.result.registeredCount = 1;
    incomplete.result.executedCount = 1;
    incomplete.result.commands[0].passed = 1;
    rewriteEvidence(incomplete.result);
    incomplete.resultSha256 = sha256(canonicalJson(incomplete.result));
    writeEnvelope(filename, incomplete);
    assert.notEqual(spawnSync(command[0], command.slice(1), { cwd: root, encoding: 'utf8' }).status, 0);

    const substituted = structuredClone(canonical);
    substituted.result.commands[0].command = 'true';
    rewriteEvidence(substituted.result);
    substituted.resultSha256 = sha256(canonicalJson(substituted.result));
    writeEnvelope(filename, substituted);
    assert.notEqual(spawnSync(command[0], command.slice(1), { cwd: root, encoding: 'utf8' }).status, 0);

    const unregistered = structuredClone(canonical);
    unregistered.harnessReleaseSha256 = 'd'.repeat(64);
    writeEnvelope(filename, unregistered);
    assert.notEqual(spawnSync(command[0], command.slice(1), { cwd: root, encoding: 'utf8' }).status, 0);

    const nonexistentReview = structuredClone(canonical);
    nonexistentReview.result.check = 'requirements';
    nonexistentReview.result.partition = null;
    nonexistentReview.result.registeredCount = 0;
    nonexistentReview.result.executedCount = 0;
    nonexistentReview.result.commands = [];
    nonexistentReview.result.review = {
      evidenceCommitSha: '1'.repeat(40),
      evidenceFileSha256: '2'.repeat(64),
      evidenceOnlyPaths: [`${changeRelative}/requirements-review-round-91.md`],
      evidencePath: `${changeRelative}/requirements-review-round-91.md`,
      evidenceTreeSha: '3'.repeat(40),
      p0: 0,
      p1: 0,
      pcrFulfillmentPath: null,
      pcrFulfillmentSha256: null,
      reviewedActiveGraphSha256: currentSubject.graph,
      reviewedBaseSha: '4'.repeat(40),
      reviewedHeadOrTreeSha: '5'.repeat(40),
      reviewedRange: `${'4'.repeat(40)}..${'5'.repeat(40)}`,
      reviewedTreeSha: '6'.repeat(40),
      verdict: 'PASS',
    };
    rewriteEvidence(nonexistentReview.result);
    nonexistentReview.resultSha256 = sha256(canonicalJson(nonexistentReview.result));
    writeEnvelope(filename, nonexistentReview);
    assert.notEqual(spawnSync(command[0], command.slice(1), { cwd: root, encoding: 'utf8' }).status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('shadow activation evidence requires the exact five-command catalog and verified cwd', () => {
  const inventory = JSON.parse(readFileSync(path.join(change, 'acceptance-tests.json'), 'utf8'));
  const currentSubject = subject();
  const canonical = result('shadow-activation-gate', inventory, currentSubject);
  const codeGate = { check: 'code-gate-aggregate', evidenceSha256: 'd'.repeat(64), status: 'pass' };
  canonical.status = 'blocked';
  canonical.blockedReason = 'production_authority_not_granted';
  canonical.inputs = [{ check: codeGate.check, evidenceSha256: codeGate.evidenceSha256 }];
  rewriteEvidence(canonical);
  const expected = {
    commitSha: currentSubject.commit,
    treeSha: currentSubject.tree,
    activeGraphSha256: currentSubject.graph,
    inventory,
  };
  const nested = new Map([[codeGate.check, codeGate]]);
  assert.doesNotThrow(() => validateOpportunityGateResult(canonical, expected, nested));

  for (const mutate of [
    (value) => { value.commandCatalogSha256 = '0'.repeat(64); },
    (value) => { value.cwdMode = null; },
    (value) => { value.commands[0].command = 'true'; },
    (value) => { value.commands.pop(); },
  ]) {
    const invalid = structuredClone(canonical);
    mutate(invalid);
    rewriteEvidence(invalid);
    assert.throws(() => validateOpportunityGateResult(invalid, expected, nested));
  }
});

test('PCR-023 protected bootstrap workflow is base-owned and its registered release is byte-bound', () => {
  const workflow = readFileSync(path.join(root, '.github/workflows/source-led-opportunity-external-gate.yml'), 'utf8');
  const registry = JSON.parse(readFileSync(path.join(change, 'external-gate-release-registry-v1.json'), 'utf8'));
  const release = registry.releases.find(({ bootstrapPath }) => bootstrapPath === 'scripts/opportunity-v3/protected-gate-root.mjs');
  assert.ok(release);
  assert.equal(sha256(readFileSync(path.join(root, release.bootstrapPath))), release.bootstrapSha256);
  assert.match(workflow, /^\s*pull_request_target:/mu);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/u);
  assert.match(workflow, /Fetch subject object without executing subject files/u);
  assert.match(workflow, /stockinsider-v3-gate-bootstrap-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/u);
});

test('PCR fulfillment writer seals all immutable fixtures and rejects a same-file caller', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'stockinsider-pcr-fulfillment-'));
  try {
    const inventory = JSON.parse(readFileSync(path.join(change, 'acceptance-tests.json'), 'utf8'));
    const boundaries = JSON.parse(readFileSync(path.join(change, 'pcr-implementation-boundaries-v3.json'), 'utf8'));
    const currentSubject = subject();
    const entries = inventory.cases.filter(({ id }) => id.startsWith('PCR-')).map((item) => {
      const boundary = boundaries.boundaries.find(({ id }) => id === item.id);
      const fixtureSha256 = sha256(canonicalJson([
        'source-led-opportunity-product-correctness-fixture-v1', item.id, item.requirement, item.layer, item.setup, item.expected,
      ]));
      return {
        caller: boundary.caller,
        execution: {
          commandName: 'product-runtime-track',
          commandSha256: 'a'.repeat(64),
          exitCode: 0,
          failed: 0,
          passed: 1,
          skipped: 0,
          stdoutSha256: 'b'.repeat(64),
          testName: `acceptance ${item.id}`,
          todo: 0,
        },
        fixtureSha256,
        id: item.id,
        owner: boundary.owner,
        resultDependency: {
          consumerFunction: boundary.caller.function,
          consumerPath: boundary.caller.path,
          kind: 'returned_value',
        },
      };
    });
    const input = {
      entries,
      implementationCommitSha: currentSubject.commit,
      implementationTreeSha: currentSubject.tree,
      reviewedRange: `${'0'.repeat(40)}..${currentSubject.commit}`,
      schema: 'source-led-opportunity-pcr-fulfillment-input-v1',
    };
    const inputPath = path.join(directory, 'input.json');
    const outputPath = path.join(directory, changeRelative, 'pcr-fulfillment-record-v1.json');
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(inputPath, `${canonicalJson(input)}\n`);
    const command = [process.execPath, '--experimental-strip-types', 'scripts/opportunity-v3/write-pcr-fulfillment-record.mjs', '--input', inputPath, '--output', outputPath];
    const written = spawnSync(command[0], command.slice(1), { cwd: root, encoding: 'utf8' });
    assert.equal(written.status, 0, written.stderr);
    const record = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(record.entries.length, 31);
    assert.equal(record.implementationCommitSha, currentSubject.commit);
    assert.match(record.recordSha256, /^[0-9a-f]{64}$/u);

    const invalid = structuredClone(input);
    invalid.entries[29].caller = invalid.entries[29].owner;
    const invalidPath = path.join(directory, 'invalid.json');
    const invalidOutputPath = path.join(directory, changeRelative, 'invalid-pcr-fulfillment-record-v1.json');
    writeFileSync(invalidPath, `${canonicalJson(invalid)}\n`);
    const invalidCommand = [process.execPath, '--experimental-strip-types', 'scripts/opportunity-v3/write-pcr-fulfillment-record.mjs', '--input', invalidPath, '--output', invalidOutputPath];
    assert.notEqual(spawnSync(invalidCommand[0], invalidCommand.slice(1), { cwd: root, encoding: 'utf8' }).status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
