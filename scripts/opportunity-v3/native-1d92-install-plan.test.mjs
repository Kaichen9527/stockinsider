// Portable tests only. Ephemeral synthetic keys/receipts are never live authority.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { canonical, digest } from './host-recovery-packet.mjs';
import { recoverySourceFacts } from './host-recovery-proposal.mjs';
import { draftRecoveryInstallPlan as oldDraft } from './host-recovery-install-plan.mjs';
import { DEPLOYMENT_FIELDS, FROZEN_CANDIDATE, FROZEN_FACTS_SHA256,
  draftRecoveryInstallPlan, validateRecoveryInstallationHandoff } from './native-1d92-install-plan.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./native-1d92-install-plan.mjs', import.meta.url));
const encode = value => Buffer.from(`${canonical(value)}\n`);
const predecessor = '169aad1b6cfa747f78ae3464b614f43c0749d806';
const historical = 'e94d21f9fe05dc436211a2458ea59adb52195e26';
const facts = recoverySourceFacts(root, predecessor, FROZEN_CANDIDATE), factsBytes = encode(facts);
const roles = ['requirements', 'architecture', 'exact-review'];
const fingerprint = publicKey => digest(publicKey.export({ type: 'spki', format: 'der' }));
const pem = publicKey => publicKey.export({ type: 'spki', format: 'pem' });
const signed = (value, privateKey) => sign(null, Buffer.from(canonical(value)), privateKey).toString('base64');
function fixture({ registryMutation = () => {}, workerMutation = () => {}, evidenceMutation = () => {}, shareOwnerKey = false } = {}) {
  const owner = generateKeyPairSync('ed25519');
  const reviewers = Object.fromEntries(roles.map(role => [role, generateKeyPairSync('ed25519')]));
  if (shareOwnerKey) reviewers.requirements = owner;
  const contract = Object.fromEntries(DEPLOYMENT_FIELDS.map(name => [name,
    name.endsWith('Sha256') ? '1'.repeat(64) : name.endsWith('Commit') || name.endsWith('Tree')
      ? '2'.repeat(40) : name.endsWith('Root') ? `/synthetic-only/${name}` : `synthetic-${name}`]));
  contract.packetVerifierSha256 = facts.recoveryVerifierSha256;
  const registry = { schema: 'stockinsider-established-recovery-registry-v1',
    registryId: contract.authorityRegistryId, authorityId: contract.authorityId, makerId: 'synthetic-maker',
    owner: { principalId: 'synthetic-owner', publicKeySha256: fingerprint(owner.publicKey) },
    reviewers: Object.fromEntries(roles.map(role => [role, { principalId: `synthetic-${role}`, publicKeySha256: fingerprint(reviewers[role].publicKey) }])) };
  registryMutation(registry);
  const external = { authorityRegistryBytes: encode(registry),
    authorityProvenanceReceiptBytes: Buffer.from('SYNTHETIC provenance receipt; not a real authority'),
    durableCasProtocolBytes: Buffer.from('SYNTHETIC CAS protocol; no durable storage'),
    permissionReceiptBytes: Buffer.from('SYNTHETIC permission receipt; grants no permission') };
  for (const [key, field] of [['authorityRegistryBytes', 'authorityRegistrySha256'], ['authorityProvenanceReceiptBytes', 'authorityProvenanceReceiptSha256'],
    ['durableCasProtocolBytes', 'durableCasProtocolSha256'], ['permissionReceiptBytes', 'permissionReceiptSha256']]) contract[field] = digest(external[key]);
  const worker = { schema: 'stockinsider-native-1d92-worker-manifest-v1', predecessor: facts.predecessor, candidate: facts.candidate,
    activeGraphSha256: facts.activeGraphSha256, hostFixtureSha256: facts.hostFixtureSha256,
    nativeIdentitySha256: facts.nativeIdentitySha256, recoveryVerifierSha256: facts.recoveryVerifierSha256,
    permissionPolicySha256: facts.permissionPolicySha256, workerBundleSha256: contract.workerBundleSha256,
    protectedWorkerSha256: contract.protectedWorkerSha256, recoveredBaseCommit: contract.recoveredBaseCommit,
    recoveredBaseTree: contract.recoveredBaseTree, protectedWorkflowSha256: contract.protectedWorkflowSha256,
    reviewRegistrySha256: contract.reviewRegistrySha256, atomicInstallProtocolSha256: contract.atomicInstallProtocolSha256 };
  workerMutation(worker);
  external.workerManifestBytes = encode(worker); contract.workerManifestSha256 = digest(external.workerManifestBytes);
  const planBytes = encode(draftRecoveryInstallPlan(factsBytes, contract));
  const payload = { schema: 'stockinsider-host-recovery-v1', repository: facts.repository,
    authorityId: contract.authorityId, nonce: 'a'.repeat(64), issuedAt: '2026-10-08T00:00:00.000Z',
    expiresAt: '2026-10-08T01:00:00.000Z', makerId: 'synthetic-maker' };
  for (const field of ['predecessor', 'candidate', 'activeGraphSha256', 'hostFixtureSha256',
    'nativeIdentitySha256', 'recoveryVerifierSha256', 'permissionPolicySha256']) payload[field] = facts[field];
  const packetContext = { ...payload, nowMs: Date.parse('2026-10-08T00:30:00.000Z'), authorityPublicKey: pem(owner.publicKey), reviewSources: {} };
  const reviews = roles.map(role => {
    const reportBytes = Buffer.from(`synthetic-only ${role} report`);
    const evidence = { schema: 'stockinsider-native-1d92-install-review-v1', role, candidateCommit: FROZEN_CANDIDATE,
      installationPlanSha256: digest(planBytes), deploymentContractSha256: digest(encode(contract)), reviewReportSha256: digest(reportBytes) };
    evidenceMutation(evidence, role);
    const evidenceBytes = encode(evidence);
    packetContext.reviewSources[role] = { reviewerId: `synthetic-${role}`, evidenceBytes, reportBytes, publicKey: pem(reviewers[role].publicKey) };
    const statement = { role, reviewerId: `synthetic-${role}`, evidenceSha256: digest(evidenceBytes), payloadSha256: digest(canonical(payload)), verdict: 'PASS' };
    return { ...statement, signature: signed(statement, reviewers[role].privateKey) };
  });
  const packet = { payload, reviews }; packet.authoritySignature = signed(packet, owner.privateKey);
  const trusted = { ...external, deploymentContract: contract, packetContext, readiness: {
    durableCas: 'externally_verified_atomic_durable_compare_and_set', failureRetention: 'consume_before_execution_never_delete',
    installationPermission: 'externally_verified_base_worker_and_review_registry_scope',
    currentPredecessor: 'externally_measured_exact_frozen_predecessor', hostIdentity: 'externally_measured_exact_frozen_host_identity',
    installedControlPlane: 'externally_measured_exact_deployment_contract_release',
    establishedRegistry: 'externally_authenticated_preexisting_registry_and_host_recovery_scope' } };
  return { planBytes, packetBytes: encode(packet), trusted,
    validate() { return validateRecoveryInstallationHandoff(this.planBytes, this.packetBytes, this.trusted); } };
}

test('new planner accepts only exact 1d92 facts; e94d planner and packet source remain unchanged', () => {
  assert.equal(FROZEN_CANDIDATE, '1d92e04e26c393c6d9c32b549854281e3f29f115');
  assert.equal(digest(factsBytes), FROZEN_FACTS_SHA256);
  const plan = draftRecoveryInstallPlan(factsBytes);
  assert.equal(plan.missingDeploymentFields.length, 28); assert.equal(plan.activationAllowed, false);
  assert.equal(plan.subject.candidate.tree, '855a50b220f755b37680f7ed02163d1198d6c482');
  assert.throws(() => oldDraft(factsBytes), /exact frozen source facts/u);
  assert.throws(() => draftRecoveryInstallPlan(encode(recoverySourceFacts(root, predecessor, historical))), /exact frozen source facts/u);
  for (const name of ['host-recovery-packet.mjs', 'host-recovery-install-plan.mjs'])
    assert.ok(readFileSync(path.join(root, 'scripts/opportunity-v3', name)).equals(execFileSync('/usr/bin/git', ['--no-replace-objects', '-C', root, 'show', `${FROZEN_CANDIDATE}:scripts/opportunity-v3/${name}`])));
});
test('synthetic complete context validates only; never reserves, installs or authorizes execution', () => {
  const f = fixture(), result = f.validate();
  for (const name of ['executionAuthorized', 'predecessorReserved', 'activationAllowed', 'protectedGatePassed']) assert.equal(result[name], false);
  assert.equal(result.transitionKey, '9a81db5124b7a8f9eae2fb65c32f65007a9177c80f9a6f99b61a87192bada088');
  assert.deepEqual(result, f.validate());
});
test('every external contract field and every readiness obligation is required', () => {
  const f = fixture(); assert.throws(() => validateRecoveryInstallationHandoff(f.planBytes, f.packetBytes), /trusted context/u);
  for (const field of DEPLOYMENT_FIELDS) {
    const contract = { ...f.trusted.deploymentContract }; delete contract[field];
    const plan = draftRecoveryInstallPlan(factsBytes, contract);
    assert.deepEqual(plan.missingDeploymentFields, [field]);
    assert.throws(() => validateRecoveryInstallationHandoff(encode(plan), f.packetBytes, f.trusted), /incomplete/u);
  }
  for (const field of Object.keys(f.trusted.readiness)) {
    const g = fixture(); delete g.trusted.readiness[field]; assert.throws(() => g.validate());
  }
});
test('missing/changed registry provenance, CAS and permission bytes cannot be replaced by readiness assertions', () => {
  for (const field of ['authorityRegistryBytes', 'authorityProvenanceReceiptBytes', 'durableCasProtocolBytes', 'permissionReceiptBytes', 'workerManifestBytes']) {
    for (const value of [undefined, Buffer.alloc(0), Buffer.alloc(128 * 1024 + 1), Buffer.from('changed')]) {
      const f = fixture(); f.trusted[field] = value; assert.throws(() => f.validate());
    }
  }
});
test('validly signed plans cannot select foreign registry keys, identity, scope or schema', () => {
  for (const mutation of [r => r.owner.publicKeySha256 = '0'.repeat(64), r => r.reviewers.requirements.publicKeySha256 = '0'.repeat(64),
    r => r.reviewers.architecture.principalId = 'other', r => r.makerId = 'other', r => r.authorityId = 'other',
    r => r.registryId = 'other', r => r.owner.principalId = r.makerId, r => r.selfBootstrap = true])
    assert.throws(() => fixture({ registryMutation: mutation }).validate());
  assert.throws(() => fixture({ shareOwnerKey: true }).validate(), /independent owner and review authorities/u);
});
test('worker manifest must bind exact subject, predecessor, host, protected worker and recovered-base scope', () => {
  for (const key of ['candidate', 'predecessor', 'activeGraphSha256', 'hostFixtureSha256', 'nativeIdentitySha256',
    'recoveryVerifierSha256', 'permissionPolicySha256', 'workerBundleSha256', 'protectedWorkerSha256',
    'recoveredBaseCommit', 'recoveredBaseTree', 'protectedWorkflowSha256', 'reviewRegistrySha256', 'atomicInstallProtocolSha256']) {
    assert.throws(() => fixture({ workerMutation: w => { w[key] = '0'.repeat(64); } }).validate(), /exact subject worker/u);
  }
});
test('three signed reports bind this exact plan and deployment; generic chat/prose is not accepted evidence', () => {
  for (const field of ['candidateCommit', 'installationPlanSha256', 'deploymentContractSha256', 'reviewReportSha256', 'role'])
    assert.throws(() => fixture({ evidenceMutation: (e, role) => { if (role === 'exact-review') e[field] = 'wrong'; } }).validate(), /signed evidence must bind/u);
  const f = fixture(); f.trusted.packetContext.reviewSources.requirements.reportBytes = Buffer.from('different');
  assert.throws(() => f.validate(), /signed evidence must bind/u);
});
test('expired packet and swapped owner key still fail the unchanged packet verifier boundary', () => {
  const f = fixture(); f.trusted.packetContext.nowMs = Date.parse('2026-10-08T01:00:00.000Z');
  assert.throws(() => f.validate(), /authority window/u);
  const g = fixture(); g.trusted.packetContext.authorityPublicKey = pem(generateKeyPairSync('ed25519').publicKey);
  assert.throws(() => g.validate(), /established owner key/u);
});
test('canonical closed schemas reject unknown fields and arbitrary plan execution flags', () => {
  const f = fixture(), plan = JSON.parse(f.planBytes);
  for (const bytes of [Buffer.from(JSON.stringify(plan)), encode({ ...plan, executionAuthorized: true }),
    Buffer.from(f.planBytes.toString().replace('"status":', '"status":"forged","status":'))])
    assert.throws(() => validateRecoveryInstallationHandoff(bytes, f.packetBytes, f.trusted));
  assert.throws(() => draftRecoveryInstallPlan(factsBytes, { selfBootstrap: true }), /closed schema/u);
});
test('CLI only emits unsigned proposal; no authority/registry/sign/install input mode exists', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'native-1d92-plan-test-'));
  try {
    const file = path.join(dir, 'facts.json'); writeFileSync(file, factsBytes);
    const output = execFileSync(process.execPath, [cli, '--dry-run', file], { cwd: root });
    assert.deepEqual(JSON.parse(output), draftRecoveryInstallPlan(factsBytes));
    for (const mode of ['--install', '--execute', '--sign', '--registry', '--trusted']) {
      const result = spawnSync(process.execPath, [cli, mode, file], { cwd: root });
      assert.notEqual(result.status, 0); assert.equal(result.stdout.length, 0);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
