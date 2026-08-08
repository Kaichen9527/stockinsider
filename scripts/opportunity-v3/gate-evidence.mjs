import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../web/src/lib/opportunity-v3/canonical.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const changeRelative = '.loop-engineering/state/changes/source-led-opportunity-engine-v3';
const change = path.join(root, changeRelative);
const catalogRelative = `${changeRelative}/active-artifact-catalog-v3.json`;
const registryRelative = `${changeRelative}/external-gate-release-registry-v1.json`;
const pcrBoundariesRelative = `${changeRelative}/pcr-implementation-boundaries-v3.json`;
const acceptanceRelative = `${changeRelative}/acceptance-tests.json`;
const envelopeKeys = ['attestation', 'harnessReleaseSha256', 'issuedAt', 'issuer', 'result', 'resultSha256', 'schema', 'subjectCommitSha', 'subjectTreeSha'];
const resultKeys = ['acceptanceVersion', 'activeGraphSha256', 'blockedReason', 'check', 'commandCatalogSha256', 'commands', 'commitSha', 'completedAt', 'cwdMode', 'evidenceSha256', 'executedCount', 'inputs', 'partition', 'registeredCount', 'review', 'schema', 'scriptValueRowsSha256', 'status', 'treeSha'];
const reviewKeys = ['evidenceCommitSha', 'evidenceFileSha256', 'evidenceOnlyPaths', 'evidencePath', 'evidenceTreeSha', 'p0', 'p1', 'pcrFulfillmentPath', 'pcrFulfillmentSha256', 'reviewedActiveGraphSha256', 'reviewedBaseSha', 'reviewedHeadOrTreeSha', 'reviewedRange', 'reviewedTreeSha', 'verdict'];
const attestationKeys = ['baseCommitSha', 'checkRun', 'registryCommitSha', 'registryPath', 'registrySha256', 'registryTreeSha', 'releaseId', 'releaseSha256', 'repository', 'schema', 'subjectCommitSha', 'subjectTreeSha', 'workflowPath'];
const checkNames = new Set([
  'requirements', 'architecture', 'product-runtime-code-gate', 'model-runner-code-gate',
  'evaluation-governance', 'exact-review', 'code-gate-aggregate', 'shadow-activation-gate',
  'promotion-gate-aggregate',
]);
const requiredCodeInputs = ['requirements', 'architecture', 'product-runtime-code-gate', 'model-runner-code-gate', 'exact-review'];
const shadowCommandCatalogSha256 = '9224cc76f0aada2a2c678d27f71ed92a93c5c2cc37a9b4b4a90a831afe40a5c4';
const shadowCommands = Object.freeze([
  ['shadow-migration-rehearsal', '/usr/local/bin/node scripts/opportunity-v3/shadow-activation-gate.mjs migration-rehearsal'],
  ['shadow-runtime-installation-rehearsal', '/usr/local/bin/node scripts/opportunity-v3/shadow-activation-gate.mjs runtime-installation-rehearsal'],
  ['shadow-runtime-doctor', '/usr/local/bin/node scripts/opportunity-v3/shadow-activation-gate.mjs runtime-doctor'],
  ['shadow-disabled-web-smoke', '/usr/local/bin/node scripts/opportunity-v3/shadow-activation-gate.mjs disabled-web-smoke'],
  ['shadow-rollback-lock-verification', '/usr/local/bin/node scripts/opportunity-v3/shadow-activation-gate.mjs rollback-lock-verification'],
]);
const commonEvidencePaths = new Set([
  `${changeRelative}/status.json`,
  `${changeRelative}/tasks.md`,
  `${changeRelative}/gate-summary.md`,
]);
const gatePolicies = Object.freeze({
  requirements: { commands: [], count: 0, partition: null },
  architecture: { commands: [], count: 0, partition: null },
  'product-runtime-code-gate': {
    commands: [['product-runtime-track', 'protected://stockinsider-v3-gate-root/execute-track --track product_runtime']],
    count: 249,
    partition: 'product_runtime',
  },
  'model-runner-code-gate': {
    commands: [['model-runner-track', 'protected://stockinsider-v3-gate-root/execute-track --track model_runner']],
    count: 28,
    partition: 'model_runner',
  },
  'evaluation-governance': {
    commands: [['evaluation-governance-track', 'protected://stockinsider-v3-gate-root/execute-track --track evaluation_governance']],
    count: 20,
    partition: 'evaluation_governance',
  },
  'exact-review': { commands: [], count: 0, partition: null },
  'code-gate-aggregate': { commands: [], count: 0, partition: null },
  'shadow-activation-gate': { commands: shadowCommands, count: 0, partition: null },
  'promotion-gate-aggregate': { commands: [], count: 0, partition: null },
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, keys, label) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} keys`);
}

function readJson(filename) {
  return JSON.parse(readFileSync(filename, 'utf8'));
}

function git(args, options = {}) {
  return execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8', ...options }).trim();
}

function gitResult(args) {
  try {
    return { ok: true, value: git(args) };
  } catch {
    return { ok: false, value: '' };
  }
}

function assertSha(value, label, length = 40) {
  assert.match(value, new RegExp(`^[0-9a-f]{${length}}$`, 'u'), label);
}

function assertRepositoryPath(value, label) {
  assert.match(value, /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u, label);
  assert.ok(!value.includes('//'), `${label} canonical separators`);
}

function commitTree(commitSha, label) {
  assertSha(commitSha, `${label} commit`);
  assert.equal(git(['cat-file', '-t', commitSha]), 'commit', `${label} must resolve to a commit`);
  return git(['rev-parse', `${commitSha}^{tree}`]);
}

function treeBlob(treeSha, repositoryPath, label) {
  assertSha(treeSha, `${label} tree`);
  assertRepositoryPath(repositoryPath, `${label} path`);
  assert.equal(git(['cat-file', '-t', treeSha]), 'tree', `${label} tree object`);
  const object = `${treeSha}:${repositoryPath}`;
  assert.equal(git(['cat-file', '-t', object]), 'blob', `${label} regular blob`);
  return execFileSync('/usr/bin/git', ['cat-file', 'blob', object], { cwd: root });
}

function activeGraphSha256(treeSha) {
  const catalogBytes = treeBlob(treeSha, catalogRelative, 'active catalog');
  const catalog = JSON.parse(catalogBytes);
  const rows = catalog.activeFiles.map((file) => {
    const repositoryPath = `${changeRelative}/${file}`;
    const oid = git(['rev-parse', `${treeSha}:${repositoryPath}`]);
    const bytes = treeBlob(treeSha, repositoryPath, `active artifact ${file}`);
    return [file, oid, bytes.length, sha256(bytes)];
  });
  const inventory = JSON.parse(treeBlob(treeSha, acceptanceRelative, 'acceptance inventory'));
  return {
    inventory,
    value: sha256(canonicalJson(['opportunity-active-graph-v1', sha256(catalogBytes), rows])),
  };
}

function fixtureSha256(item) {
  return sha256(canonicalJson([
    'source-led-opportunity-product-correctness-fixture-v1',
    item.id,
    item.requirement,
    item.layer,
    item.setup,
    item.expected,
  ]));
}

function validateCommand(command, label) {
  exactKeys(command, ['command', 'exitCode', 'failed', 'name', 'passed', 'skipped', 'stderrSha256', 'stdoutSha256', 'todo'], label);
  assert.match(command.name, /\S/u, `${label} name`);
  assert.match(command.command, /\S/u, `${label} command`);
  for (const key of ['exitCode', 'passed', 'failed', 'skipped', 'todo']) {
    assert.ok(Number.isSafeInteger(command[key]) && command[key] >= 0, `${label} ${key}`);
  }
  for (const key of ['stdoutSha256', 'stderrSha256']) assertSha(command[key], `${label} ${key}`, 64);
}

function reviewEvidencePathFor(check) {
  if (check === 'requirements') return new RegExp(`^${changeRelative}/requirements-review-round-[0-9]+\\.md$`, 'u');
  if (check === 'architecture') return new RegExp(`^${changeRelative}/architecture-review-round-[0-9]+\\.md$`, 'u');
  return `${changeRelative}/exact-commit-review-final.md`;
}

function validateReviewedRange(review, label) {
  const match = review.reviewedRange.match(/^([0-9a-f]{40})\.\.([0-9a-f]{40})$/u);
  assert.ok(match, `${label} exact commit range`);
  assert.equal(match[1], review.reviewedBaseSha, `${label} range base`);
  assert.equal(match[2], review.reviewedHeadOrTreeSha, `${label} range head`);
  assert.equal(git(['cat-file', '-t', match[1]]), 'commit', `${label} range base commit`);
  assert.equal(git(['cat-file', '-t', match[2]]), 'commit', `${label} range head commit`);
  return match;
}

function validatePcrFulfillment(review, expected, label) {
  assert.equal(typeof review.pcrFulfillmentPath, 'string', `${label} PCR fulfillment path`);
  assertSha(review.pcrFulfillmentSha256, `${label} PCR fulfillment SHA-256`, 64);
  assert.equal(review.pcrFulfillmentPath, `${changeRelative}/pcr-fulfillment-record-v1.json`, `${label} PCR fulfillment canonical path`);
  assert.ok(review.evidenceOnlyPaths.includes(review.pcrFulfillmentPath), `${label} PCR fulfillment is evidence-only`);
  const recordBytes = treeBlob(review.evidenceTreeSha, review.pcrFulfillmentPath, `${label} PCR fulfillment`);
  assert.equal(sha256(recordBytes), review.pcrFulfillmentSha256, `${label} PCR fulfillment bytes`);
  const record = JSON.parse(recordBytes);
  exactKeys(record, ['activeGraphSha256', 'entries', 'implementationCommitSha', 'implementationTreeSha', 'recordSha256', 'reviewedRange', 'schema'], `${label} PCR fulfillment`);
  assert.equal(record.schema, 'source-led-opportunity-pcr-fulfillment-record-v1', `${label} PCR fulfillment schema`);
  assert.equal(record.implementationCommitSha, expected.commitSha, `${label} PCR implementation commit`);
  assert.equal(record.implementationTreeSha, expected.treeSha, `${label} PCR implementation tree`);
  assert.equal(record.activeGraphSha256, expected.activeGraphSha256, `${label} PCR active graph`);
  assert.equal(record.reviewedRange, review.reviewedRange, `${label} PCR reviewed range`);
  const withoutDigest = { ...record };
  delete withoutDigest.recordSha256;
  assert.equal(record.recordSha256, sha256(canonicalJson(withoutDigest)), `${label} PCR record digest`);
  const inventory = JSON.parse(treeBlob(review.reviewedTreeSha, acceptanceRelative, `${label} PCR inventory`));
  const boundaries = JSON.parse(treeBlob(review.reviewedTreeSha, pcrBoundariesRelative, `${label} PCR boundaries`));
  const expectedRows = inventory.cases.filter(({ id }) => id.startsWith('PCR-')).map((item) => {
    const boundary = boundaries.boundaries.find(({ id }) => id === item.id);
    assert.ok(boundary, `${label} ${item.id} immutable boundary`);
    return [item.id, fixtureSha256(item), boundary];
  });
  assert.equal(expectedRows.length, 31, `${label} one fulfillment entry per PCR`);
  assert.deepEqual(record.entries.map(({ id }) => id), expectedRows.map(([id]) => id), `${label} PCR entry order`);
  for (const [index, [id, expectedFixtureSha, boundary]] of expectedRows.entries()) {
    const entry = record.entries[index];
    exactKeys(entry, ['caller', 'execution', 'fixtureSha256', 'id', 'owner', 'resultDependency'], `${label} ${id} fulfillment`);
    assert.equal(entry.id, id, `${label} ${id} ID`);
    assert.equal(entry.fixtureSha256, expectedFixtureSha, `${label} ${id} fixture`);
    assert.deepEqual(entry.owner, boundary.owner, `${label} ${id} owner`);
    assert.deepEqual(entry.caller, boundary.caller, `${label} ${id} caller`);
    assert.notEqual(entry.owner.path, entry.caller.path, `${label} ${id} distinct module boundary`);
    exactKeys(entry.resultDependency, ['consumerFunction', 'consumerPath', 'kind'], `${label} ${id} result dependency`);
    assert.equal(entry.resultDependency.consumerPath, entry.caller.path, `${label} ${id} consumer path`);
    assert.equal(entry.resultDependency.consumerFunction, entry.caller.function, `${label} ${id} consumer function`);
    assert.ok(['persisted_row', 'returned_value', 'serialized_response'].includes(entry.resultDependency.kind), `${label} ${id} dependency kind`);
    exactKeys(entry.execution, ['commandName', 'commandSha256', 'exitCode', 'failed', 'passed', 'skipped', 'stdoutSha256', 'testName', 'todo'], `${label} ${id} execution`);
    assert.match(entry.execution.commandName, /\S/u, `${label} ${id} command name`);
    assert.match(entry.execution.testName, /\S/u, `${label} ${id} test name`);
    for (const key of ['commandSha256', 'stdoutSha256']) assertSha(entry.execution[key], `${label} ${id} ${key}`, 64);
    assert.equal(entry.execution.exitCode, 0, `${label} ${id} execution exit`);
    assert.ok(entry.execution.passed > 0, `${label} ${id} execution pass`);
    for (const key of ['failed', 'skipped', 'todo']) assert.equal(entry.execution[key], 0, `${label} ${id} execution ${key}`);
  }
}

function validateReview(review, check, expected, label) {
  assert.notEqual(review, null, `${label} requires review evidence`);
  exactKeys(review, reviewKeys, label);
  assert.equal(review.verdict, 'PASS', `${label} verdict`);
  assert.equal(review.p0, 0, `${label} P0`);
  assert.equal(review.p1, 0, `${label} P1`);
  for (const key of ['reviewedBaseSha', 'reviewedHeadOrTreeSha', 'reviewedTreeSha', 'evidenceCommitSha', 'evidenceTreeSha']) {
    assertSha(review[key], `${label} ${key}`);
  }
  for (const key of ['evidenceFileSha256', 'reviewedActiveGraphSha256']) assertSha(review[key], `${label} ${key}`, 64);
  const range = validateReviewedRange(review, label);
  assert.equal(git(['rev-parse', `${review.reviewedHeadOrTreeSha}^{tree}`]), review.reviewedTreeSha, `${label} reviewed head/tree`);
  assert.equal(commitTree(review.evidenceCommitSha, `${label} evidence`), review.evidenceTreeSha, `${label} evidence tree`);
  assert.ok(Array.isArray(review.evidenceOnlyPaths), `${label} evidence paths array`);
  assert.deepEqual(review.evidenceOnlyPaths, [...new Set(review.evidenceOnlyPaths)].toSorted(), `${label} evidence paths canonical order`);
  for (const evidencePath of review.evidenceOnlyPaths) assertRepositoryPath(evidencePath, `${label} evidence-only path`);
  const actualChangedPaths = git(['diff-tree', '--no-commit-id', '--name-only', '-r', review.reviewedTreeSha, review.evidenceTreeSha])
    .split('\n').filter(Boolean).toSorted();
  assert.deepEqual(review.evidenceOnlyPaths, actualChangedPaths, `${label} evidence-only tree diff`);
  const expectedReviewPath = reviewEvidencePathFor(check);
  assert.ok(
    typeof expectedReviewPath === 'string'
      ? review.evidencePath === expectedReviewPath
      : expectedReviewPath.test(review.evidencePath),
    `${label} canonical review evidence path`,
  );
  assert.ok(review.evidenceOnlyPaths.includes(review.evidencePath), `${label} review evidence in diff`);
  for (const evidencePath of review.evidenceOnlyPaths) {
    assert.ok(
      commonEvidencePaths.has(evidencePath)
        || evidencePath === review.evidencePath
        || (check === 'exact-review' && evidencePath === review.pcrFulfillmentPath)
        || (check === 'exact-review' && evidencePath === `${changeRelative}/runtime-review-attestation.json`),
      `${label} unapproved evidence-only path ${evidencePath}`,
    );
  }
  const evidenceBytes = treeBlob(review.evidenceTreeSha, review.evidencePath, `${label} review evidence`);
  assert.equal(sha256(evidenceBytes), review.evidenceFileSha256, `${label} review evidence bytes`);
  assert.equal(activeGraphSha256(review.reviewedTreeSha).value, review.reviewedActiveGraphSha256, `${label} reviewed active graph`);
  assert.equal(review.reviewedActiveGraphSha256, expected.activeGraphSha256, `${label} reviewed graph matches subject`);
  if (check === 'exact-review') {
    assert.equal(review.reviewedHeadOrTreeSha, expected.commitSha, `${label} exact reviewed head`);
    assert.equal(review.reviewedTreeSha, expected.treeSha, `${label} exact reviewed tree`);
    assert.equal(range[2], expected.commitSha, `${label} exact range head`);
    assert.equal(git(['rev-parse', `${review.evidenceCommitSha}^`]), expected.commitSha, `${label} exact evidence direct child`);
    validatePcrFulfillment(review, expected, label);
  } else {
    assert.equal(review.pcrFulfillmentPath, null, `${label} no PCR fulfillment path`);
    assert.equal(review.pcrFulfillmentSha256, null, `${label} no PCR fulfillment digest`);
  }
}

function validateAttestation(attestation, envelope, expected) {
  exactKeys(attestation, attestationKeys, 'external gate attestation');
  assert.equal(attestation.schema, 'stockinsider-external-gate-attestation-v1', 'attestation schema');
  assert.equal(attestation.repository, 'Kaichen9527/stockinsider', 'attestation repository');
  assert.equal(attestation.workflowPath, '.github/workflows/source-led-opportunity-external-gate.yml', 'attestation workflow');
  assert.equal(attestation.checkRun, 'stockinsider-v3-gate-root', 'attestation check');
  assert.equal(attestation.registryPath, registryRelative, 'attestation registry path');
  for (const key of ['baseCommitSha', 'registryCommitSha', 'registryTreeSha', 'subjectCommitSha', 'subjectTreeSha']) assertSha(attestation[key], `attestation ${key}`);
  for (const key of ['registrySha256', 'releaseSha256']) assertSha(attestation[key], `attestation ${key}`, 64);
  assert.equal(attestation.subjectCommitSha, expected.commitSha, 'attestation subject commit');
  assert.equal(attestation.subjectTreeSha, expected.treeSha, 'attestation subject tree');
  assert.equal(envelope.harnessReleaseSha256, attestation.releaseSha256, 'envelope/attestation release binding');
  assert.equal(commitTree(attestation.registryCommitSha, 'attestation registry'), attestation.registryTreeSha, 'attestation registry tree');
  assert.equal(gitResult(['merge-base', '--is-ancestor', attestation.registryCommitSha, attestation.baseCommitSha]).ok, true,
    'attestation registry must predate the protected PR base');
  assert.equal(gitResult(['merge-base', '--is-ancestor', attestation.baseCommitSha, expected.commitSha]).ok, true,
    'attestation base must be an ancestor of the subject');
  const registryBytes = treeBlob(attestation.registryTreeSha, attestation.registryPath, 'attestation registry');
  assert.equal(sha256(registryBytes), attestation.registrySha256, 'attestation registry bytes');
  const registry = JSON.parse(registryBytes);
  exactKeys(registry, ['issuer', 'protectedCheckRun', 'protectedWorkflowPath', 'releases', 'repository', 'schema'], 'external gate registry');
  assert.equal(registry.schema, 'stockinsider-external-gate-release-registry-v1', 'registry schema');
  assert.equal(registry.issuer, envelope.issuer, 'registry issuer');
  assert.equal(registry.repository, attestation.repository, 'registry repository');
  assert.equal(registry.protectedWorkflowPath, attestation.workflowPath, 'registry workflow');
  assert.equal(registry.protectedCheckRun, attestation.checkRun, 'registry check');
  const release = registry.releases.find(({ id }) => id === attestation.releaseId);
  assert.ok(release, 'attestation registered release');
  exactKeys(release, ['bootstrapPath', 'bootstrapSha256', 'id'], 'registered release');
  assertRepositoryPath(release.bootstrapPath, 'registered release bootstrap path');
  assertSha(release.bootstrapSha256, 'registered release bootstrap SHA-256', 64);
  const bootstrapBytes = treeBlob(attestation.registryTreeSha, release.bootstrapPath, 'registered release bootstrap');
  assert.equal(sha256(bootstrapBytes), release.bootstrapSha256, 'registered release bootstrap bytes');
  assert.equal(release.bootstrapSha256, attestation.releaseSha256, 'registered release attestation binding');
}

function validateResult(result, expected, nested = new Map()) {
  exactKeys(result, resultKeys, 'gate result');
  assert.equal(result.schema, 'opportunity-gate-result-v1', 'result schema');
  assert.ok(checkNames.has(result.check), 'closed check name');
  const policy = gatePolicies[result.check];
  assert.ok(policy, 'closed gate policy');
  for (const key of ['commitSha', 'treeSha']) assertSha(result[key], `result ${key}`);
  for (const key of ['activeGraphSha256', 'scriptValueRowsSha256', 'evidenceSha256']) assertSha(result[key], `result ${key}`, 64);
  assert.ok(['pass', 'fail', 'blocked'].includes(result.status), 'result status');
  assert.ok(result.blockedReason === null || [
    'non_fabricated_elapsed_cohorts_unavailable', 'production_authority_not_granted',
    'shadow_activation_not_executed', 'external_harness_attestation_unavailable',
  ].includes(result.blockedReason), 'closed blocker');
  assert.equal(result.partition, policy.partition, 'check partition');
  assert.equal(
    result.commandCatalogSha256,
    result.check === 'shadow-activation-gate' ? shadowCommandCatalogSha256 : null,
    'check command catalog binding',
  );
  assert.equal(
    result.cwdMode,
    result.check === 'shadow-activation-gate' ? 'verified-subject-checkout-root' : null,
    'check cwd mode binding',
  );
  assert.ok(Number.isSafeInteger(result.registeredCount) && result.registeredCount >= 0, 'registered count');
  assert.ok(Number.isSafeInteger(result.executedCount) && result.executedCount >= 0, 'executed count');
  assert.ok(Array.isArray(result.commands) && Array.isArray(result.inputs), 'commands and inputs');
  assert.match(result.completedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u, 'whole-second completion time');
  for (const [index, command] of result.commands.entries()) validateCommand(command, `command ${index}`);
  if (result.check === 'shadow-activation-gate') {
    assert.equal(result.commands.length, policy.commands.length, 'shadow exact command count');
    for (const [index, [name, command]] of policy.commands.entries()) {
      assert.equal(result.commands[index].name, name, `shadow command ${index} name`);
      assert.equal(result.commands[index].command, command, `shadow command ${index} command`);
    }
  }
  const withoutEvidence = { ...result };
  delete withoutEvidence.evidenceSha256;
  assert.equal(result.evidenceSha256, sha256(canonicalJson(withoutEvidence)), 'result canonical evidence digest');
  assert.equal(result.commitSha, expected.commitSha, 'result subject commit');
  assert.equal(result.treeSha, expected.treeSha, 'result subject tree');
  assert.equal(result.activeGraphSha256, expected.activeGraphSha256, 'result active graph');
  assert.equal(result.acceptanceVersion, expected.inventory.version, 'result acceptance version');
  assert.equal(result.scriptValueRowsSha256, expected.inventory.scriptValueRowsSha256, 'result frozen script rows');
  if (['requirements', 'architecture', 'exact-review'].includes(result.check)) validateReview(result.review, result.check, expected, 'review');
  else assert.equal(result.review, null, `${result.check} cannot smuggle review evidence`);
  if (result.status === 'pass') {
    assert.equal(result.blockedReason, null, 'pass has no blocker');
    assert.equal(result.registeredCount, policy.count, 'pass exact registered partition');
    assert.equal(result.executedCount, policy.count, 'pass exact executed partition');
    assert.equal(result.commands.length, policy.commands.length, 'pass exact command count');
    for (const [index, [name, command]] of policy.commands.entries()) {
      const row = result.commands[index];
      assert.equal(row.name, name, `pass command ${index} name`);
      assert.equal(row.command, command, `pass command ${index} command`);
      assert.equal(row.exitCode, 0, `${row.name} exit`);
      assert.equal(row.failed, 0, `${row.name} failures`);
      assert.equal(row.skipped, 0, `${row.name} skips`);
      assert.equal(row.todo, 0, `${row.name} todos`);
      assert.equal(row.passed, policy.count, `${row.name} full partition pass count`);
    }
  }
  const requiredInputs = result.check === 'code-gate-aggregate'
    ? requiredCodeInputs
    : result.check === 'promotion-gate-aggregate'
      ? ['code-gate-aggregate', 'evaluation-governance']
      : result.check === 'shadow-activation-gate'
        ? ['code-gate-aggregate']
        : [];
  assert.deepEqual(result.inputs.map(({ check }) => check), requiredInputs, `${result.check} ordered inputs`);
  for (const input of result.inputs) {
    exactKeys(input, ['check', 'evidenceSha256'], `input ${input.check}`);
    assertSha(input.evidenceSha256, `input ${input.check} digest`, 64);
    const nestedResult = nested.get(input.check);
    assert.ok(nestedResult, `resolved input ${input.check}`);
    assert.equal(nestedResult.evidenceSha256, input.evidenceSha256, `input ${input.check} digest binding`);
    assert.equal(nestedResult.status, 'pass', `input ${input.check} must pass`);
  }
  if (result.check === 'code-gate-aggregate') assert.equal(result.commands.length, 0, 'aggregate has no substitute commands');
  return result;
}

function validateEnvelope(envelope, expected) {
  exactKeys(envelope, envelopeKeys, 'external gate envelope');
  assert.equal(envelope.schema, 'stockinsider-external-gate-envelope-v1', 'envelope schema');
  assert.equal(envelope.issuer, 'stockinsider-v3-gate-root', 'protected issuer');
  for (const key of ['harnessReleaseSha256', 'resultSha256']) assertSha(envelope[key], `envelope ${key}`, 64);
  for (const key of ['subjectCommitSha', 'subjectTreeSha']) assertSha(envelope[key], `envelope ${key}`);
  assert.match(envelope.issuedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u, 'envelope issued time');
  assert.equal(envelope.subjectCommitSha, expected.commitSha, 'envelope subject commit');
  assert.equal(envelope.subjectTreeSha, expected.treeSha, 'envelope subject tree');
  assert.equal(envelope.resultSha256, sha256(canonicalJson(envelope.result)), 'envelope result digest');
  validateAttestation(envelope.attestation, envelope, expected);
  return envelope;
}

// The external protected worker calls this exact pure boundary after it has
// obtained a clean detached subject.  Keeping it exportable lets the local
// contract suite exercise the same validator without ever impersonating that
// external authority or manufacturing an attestation.
export function validateOpportunityGateEvidence(envelope, expected) {
  return validateEnvelope(envelope, expected);
}

// Result validation is deliberately separate from envelope authentication:
// aggregate/shadow results bind upstream evidence and therefore require the
// caller to provide the already-authenticated result graph.
export function validateOpportunityGateResult(result, expected, nested = new Map()) {
  return validateResult(result, expected, nested);
}

function parseArguments(argv) {
  const [verb, ...rest] = argv;
  assert.ok(['validate', 'aggregate'].includes(verb), 'verb is validate or aggregate');
  const values = { verb, inputs: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    const value = rest[index + 1];
    assert.ok(['--input', '--output'].includes(key) && typeof value === 'string', 'closed CLI arguments');
    if (key === '--input') values.inputs.push(value);
    else {
      assert.equal(values.output, undefined, 'one output');
      values.output = value;
    }
    index += 1;
  }
  assert.ok(values.inputs.length > 0, 'one or more envelope inputs');
  if (verb === 'validate') assert.equal(values.inputs.length, 1, 'validate accepts one envelope');
  if (verb === 'aggregate') assert.equal(typeof values.output, 'string', 'aggregate requires output');
  return values;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const treeSha = git(['rev-parse', 'HEAD^{tree}']);
  const { inventory, value: graph } = activeGraphSha256(treeSha);
  const expected = {
    commitSha: git(['rev-parse', 'HEAD']),
    treeSha,
    activeGraphSha256: graph,
    inventory,
  };
  const envelopes = args.inputs.map((filename) => validateEnvelope(readJson(filename), expected));
  const nested = new Map(envelopes.map(({ result }) => [result.check, result]));
  for (const envelope of envelopes) validateResult(envelope.result, expected, nested);
  if (args.verb === 'validate') {
    process.stdout.write(`${canonicalJson({ compatibilityValidation: 'pass', check: envelopes[0].result.check, authority: 'external_harness_required' })}\n`);
    return;
  }
  assert.deepEqual(envelopes.map(({ result }) => result.check), requiredCodeInputs, 'aggregate input order');
  const result = {
    acceptanceVersion: inventory.version,
    activeGraphSha256: expected.activeGraphSha256,
    blockedReason: null,
    check: 'code-gate-aggregate',
    commandCatalogSha256: null,
    commands: [],
    commitSha: expected.commitSha,
    completedAt: new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
    cwdMode: null,
    inputs: envelopes.map(({ result: input }) => ({ check: input.check, evidenceSha256: input.evidenceSha256 })),
    partition: null,
    registeredCount: 0,
    executedCount: 0,
    review: null,
    schema: 'opportunity-gate-result-v1',
    scriptValueRowsSha256: inventory.scriptValueRowsSha256,
    status: 'pass',
    treeSha: expected.treeSha,
  };
  result.evidenceSha256 = sha256(canonicalJson(result));
  validateResult(result, expected, nested);
  writeFileSync(args.output, `${canonicalJson(result)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${canonicalJson({ compatibilityValidation: 'pass', output: args.output, check: result.check, evidenceSha256: result.evidenceSha256, authority: 'external_harness_required' })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`gate-evidence validation failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
