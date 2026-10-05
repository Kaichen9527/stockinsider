import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { canonical, digest } from './host-recovery-packet.mjs';
import { recoverySourceFacts } from './host-recovery-proposal.mjs';
import { DEPLOYMENT_FIELDS, FROZEN_CANDIDATE, FROZEN_FACTS_SHA256,
  draftRecoveryInstallPlan, validateRecoveryInstallationHandoff } from './host-recovery-install-plan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('./host-recovery-install-plan.mjs', import.meta.url));
const encode = value => Buffer.from(`${canonical(value)}\n`);
const facts = recoverySourceFacts(root, '169aad1b6cfa747f78ae3464b614f43c0749d806', FROZEN_CANDIDATE);
const factsBytes = encode(facts);
// All keys, paths, protocols, reports and capability observations below are
// disposable synthetic fixtures. They are NOT external authority or live proof.
function fixture(mutateEvidence = () => {}) {
  const contract = Object.fromEntries(DEPLOYMENT_FIELDS.map(name => [name,
    name.endsWith('Sha256') ? '1'.repeat(64) : name.endsWith('Commit') || name.endsWith('Tree')
      ? '2'.repeat(40) : name.endsWith('Root') ? `/synthetic-only/${name}` : `synthetic-${name}`]));
  contract.packetVerifierSha256 = facts.recoveryVerifierSha256;
  const plan = draftRecoveryInstallPlan(factsBytes, contract), planBytes = encode(plan);
  const payload = { schema: 'stockinsider-host-recovery-v1', repository: facts.repository,
    authorityId: contract.authorityId, nonce: 'a'.repeat(64),
    issuedAt: '2026-10-05T00:00:00.000Z', expiresAt: '2026-10-05T01:00:00.000Z', makerId: 'synthetic-maker' };
  for (const field of ['predecessor', 'candidate', 'activeGraphSha256', 'hostFixtureSha256',
    'nativeIdentitySha256', 'recoveryVerifierSha256', 'permissionPolicySha256']) payload[field] = structuredClone(facts[field]);
  const pem = key => key.export({ type: 'spki', format: 'pem' });
  const signed = (value, key) => sign(null, Buffer.from(canonical(value)), key).toString('base64');
  const authority = generateKeyPairSync('ed25519');
  const packetContext = { ...structuredClone(payload), nowMs: Date.parse('2026-10-05T00:30:00.000Z'),
    authorityPublicKey: pem(authority.publicKey), reviewSources: {} };
  const reviews = ['requirements', 'architecture', 'exact-review'].map(role => {
    const pair = generateKeyPairSync('ed25519'), reportBytes = Buffer.from(`synthetic-only ${role} report`);
    const evidence = { schema: 'stockinsider-host-recovery-install-review-v1', role,
      candidateCommit: FROZEN_CANDIDATE, installationPlanSha256: digest(planBytes),
      deploymentContractSha256: digest(encode(contract)), reviewReportSha256: digest(reportBytes) };
    mutateEvidence(evidence, role);
    const evidenceBytes = encode(evidence);
    packetContext.reviewSources[role] = { reviewerId: `synthetic-${role}`, evidenceBytes, reportBytes, publicKey: pem(pair.publicKey) };
    const statement = { role, reviewerId: `synthetic-${role}`, evidenceSha256: digest(evidenceBytes), payloadSha256: digest(canonical(payload)), verdict: 'PASS' };
    return { ...statement, signature: signed(statement, pair.privateKey) };
  });
  const packet = { payload, reviews };
  packet.authoritySignature = signed(packet, authority.privateKey);
  const trusted = { deploymentContract: structuredClone(contract), packetContext,
    readiness: {
      durableCas: 'externally_verified_atomic_durable_compare_and_set',
      failureRetention: 'consume_before_execution_never_delete',
      installationPermission: 'externally_verified_base_worker_and_review_registry_scope',
      currentPredecessor: 'externally_measured_exact_frozen_predecessor',
      hostIdentity: 'externally_measured_exact_frozen_host_identity',
      installedControlPlane: 'externally_measured_exact_deployment_contract_release',
    } };
  return { plan, planBytes, packetBytes: encode(packet), trusted,
    validate() { return validateRecoveryInstallationHandoff(this.planBytes, this.packetBytes, this.trusted); } };
}

test('immutable Git reconstruction equals frozen e94 facts; unsigned dry run lists every missing contract field', () => {
  assert.equal(digest(factsBytes), FROZEN_FACTS_SHA256);
  const plan = draftRecoveryInstallPlan(factsBytes);
  assert.deepEqual(plan.missingDeploymentFields, DEPLOYMENT_FIELDS);
  assert.equal(plan.activationAllowed, false);
  assert.equal(plan.protectedGatePassed, false);
  assert.equal(plan.subject.candidate.commit, FROZEN_CANDIDATE);
  assert.equal(plan.orderedOperations.length, 6);
});
test('complete synthetic external evidence validates only, without reserving or executing anything', () => {
  const f = fixture(), before = encode(f.trusted);
  const result = f.validate();
  assert.equal(result.status, 'validation_only_no_execution');
  for (const key of ['executionAuthorized', 'predecessorReserved', 'activationAllowed', 'protectedGatePassed']) assert.equal(result[key], false);
  assert.equal(result.transitionKey, '9a81db5124b7a8f9eae2fb65c32f65007a9177c80f9a6f99b61a87192bada088');
  assert.ok(before.equals(encode(f.trusted)));
  assert.deepEqual(f.validate(), result); // validation replay is not a second reservation
});
test('missing external authority or any deployment field fails closed', () => {
  const f = fixture();
  assert.throws(() => validateRecoveryInstallationHandoff(f.planBytes, f.packetBytes), /trusted context/u);
  for (const field of DEPLOYMENT_FIELDS) {
    const contract = { ...f.plan.deploymentContract }; delete contract[field];
    const plan = draftRecoveryInstallPlan(factsBytes, contract);
    assert.deepEqual(plan.missingDeploymentFields, [field]);
    assert.throws(() => validateRecoveryInstallationHandoff(encode(plan), f.packetBytes, f.trusted), /incomplete/u);
  }
});
test('claims of durable CAS, permission, host, predecessor and installed source must all come from external context', () => {
  for (const field of Object.keys(fixture().trusted.readiness)) {
    const f = fixture(); delete f.trusted.readiness[field]; assert.throws(() => f.validate());
    const g = fixture(); g.trusted.readiness[field] = true; assert.throws(() => g.validate());
  }
  const f = fixture(); f.trusted.readiness.execute = true; assert.throws(() => f.validate(), /closed schema/u);
});
test('candidate-selected contract, installer, path, ledger and permission identities cannot replace external measurements', () => {
  for (const field of DEPLOYMENT_FIELDS) {
    const f = fixture(); f.trusted.deploymentContract[field] += 'changed';
    assert.throws(() => f.validate(), /externally verified deployment contract/u);
  }
});
test('a newly measured deployment still requires new plan-bound signatures; old valid packet cannot authorize changed installation', () => {
  const f = fixture();
  f.trusted.deploymentContract.installationRoot = '/synthetic-only/replacement-root';
  f.planBytes = encode(draftRecoveryInstallPlan(factsBytes, f.trusted.deploymentContract));
  assert.throws(() => f.validate(), /signed evidence must bind/u);
});
for (const field of ['installationPlanSha256', 'deploymentContractSha256', 'reviewReportSha256', 'candidateCommit', 'role']) {
  test(`valid external signatures on mismatched ${field} cannot validate this installation`, () => {
    const f = fixture((evidence, role) => { if (role === 'exact-review') evidence[field] = '0'.repeat(64); });
    assert.throws(() => f.validate(), /signed evidence must bind/u);
  });
}
test('generic signed packet, absent report, altered report, and altered evidence are not installation review', () => {
  const generic = fixture(evidence => { for (const key of Object.keys(evidence)) delete evidence[key]; evidence.summary = 'ordinary review'; });
  assert.throws(() => generic.validate(), /signed evidence must bind/u);
  for (const role of ['requirements', 'architecture', 'exact-review']) {
    for (const value of [undefined, Buffer.alloc(0), Buffer.from('changed report')]) {
      const f = fixture(); f.trusted.packetContext.reviewSources[role].reportBytes = value;
      assert.throws(() => f.validate());
    }
    const f = fixture(); f.trusted.packetContext.reviewSources[role].evidenceBytes = Buffer.from('changed');
    assert.throws(() => f.validate(), /exact independent evidence/u);
  }
});
test('old packet verifier still rejects expired authority, substituted keys and changed frozen bindings', () => {
  const expired = fixture(); expired.trusted.packetContext.nowMs = Date.parse('2026-10-05T01:00:00.000Z');
  assert.throws(() => expired.validate(), /authority window/u);
  const key = fixture(); key.trusted.packetContext.authorityPublicKey = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  assert.throws(() => key.validate(), /signature verification/u);
  const changed = fixture(); changed.trusted.packetContext.candidate.tree = '0'.repeat(40);
  assert.throws(() => changed.validate(), /frozen candidate binding/u);
});
test('canonical bounded closed schemas reject altered facts, plan flags, duplicate keys and arbitrary deployment options', () => {
  const changed = structuredClone(facts); changed.candidate.tree = '0'.repeat(40);
  assert.throws(() => draftRecoveryInstallPlan(encode(changed)), /frozen source facts/u);
  for (const proposal of [{ execute: true }, { authorityId: '' }, { installationRoot: '/' },
    { installationRoot: '/tmp/../install' }, { stagingRoot: 'relative' }, { ledgerId: 'has\nnewline' },
    { workerBundleSha256: 'z'.repeat(64) }]) assert.throws(() => draftRecoveryInstallPlan(factsBytes, proposal));
  const f = fixture();
  for (const bytes of [encode({ ...f.plan, activationAllowed: true }), encode({ ...f.plan, extra: true }),
    Buffer.from(JSON.stringify(f.plan)), Buffer.alloc(128 * 1024 + 1),
    Buffer.from(f.planBytes.toString().replace('"status":', '"status":"forged","status":'))])
    assert.throws(() => validateRecoveryInstallationHandoff(bytes, f.packetBytes, f.trusted));
});
test('CLI only emits unsigned dry run; execute, trusted context and signing flags have no entry point', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'recovery-plan-test-'));
  try {
    const file = path.join(dir, 'facts.json'); writeFileSync(file, factsBytes);
    const output = execFileSync(process.execPath, [cli, '--dry-run', file], { cwd: root });
    assert.deepEqual(JSON.parse(output), draftRecoveryInstallPlan(factsBytes));
    for (const args of [['--execute', file], ['--sign', file], ['--trusted', file], ['--dry-run', file, '--execute'],
      ['--dry-run', file, file, '--execute']]) {
      const result = spawnSync(process.execPath, [cli, ...args], { cwd: root });
      assert.notEqual(result.status, 0); assert.equal(result.stdout.length, 0);
    }
    const large = path.join(dir, 'large.json'); writeFileSync(large, Buffer.alloc(128 * 1024 + 1));
    assert.notEqual(spawnSync(process.execPath, [cli, '--dry-run', large]).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
