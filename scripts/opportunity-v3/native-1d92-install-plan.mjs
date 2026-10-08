// Exact 1d92 native successor only; the historical e94d planner remains unchanged.
// Inactive proposal only. No install, signing, ledger writes, or gate registration.
import assert from 'node:assert/strict';
import { createPublicKey } from 'node:crypto';
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical, digest, verifyRecoveryPacket } from './host-recovery-packet.mjs';

export const FROZEN_FACTS_SHA256 = '7dd015469853502fbfbfc41fefd798b9eb66420768d361a80c93bbf2237726e1';
export const FROZEN_CANDIDATE = '1d92e04e26c393c6d9c32b549854281e3f29f115';
const MAX_BYTES = 128 * 1024;
const roles = ['requirements', 'architecture', 'exact-review'];
// These are REQUIRED EXTERNAL CONTRACT INPUTS, not suggested production values.
export const DEPLOYMENT_FIELDS = Object.freeze([
  'authorityId', 'entryPointId', 'controlPlaneCommit', 'controlPlaneTree',
  'controlPlaneBundleSha256', 'plannerSha256', 'packetVerifierSha256',
  'workerBundleSha256', 'workerManifestSha256', 'installationRoot', 'stagingRoot',
  'activeSlotId', 'serviceId', 'atomicInstallProtocolSha256', 'reviewRegistryId',
  'reviewRegistrySha256', 'registryWriteProtocolSha256', 'ledgerId', 'durableCasProtocolSha256',
  'permissionPrincipalId', 'permissionReceiptSha256',
  'recoveredBaseCommit', 'recoveredBaseTree', 'protectedWorkflowSha256',
  'authorityRegistryId', 'authorityRegistrySha256', 'authorityProvenanceReceiptSha256',
  'protectedWorkerSha256',
]);
const closed = (value, expected) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'object required');
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), 'closed schema');
};
const encoded = value => Buffer.from(`${canonical(value)}\n`);
function decode(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_BYTES, 'bounded input');
  const value = JSON.parse(bytes.toString('utf8'));
  assert.ok(bytes.equals(encoded(value)), 'canonical UTF-8 JSON with one LF');
  return value;
}
function deployment(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'deployment object');
  const missing = DEPLOYMENT_FIELDS.filter(name => !Object.hasOwn(value, name));
  closed(value, DEPLOYMENT_FIELDS.filter(name => Object.hasOwn(value, name)));
  for (const [name, item] of Object.entries(value)) {
    assert.equal(typeof item, 'string', `${name}: string`);
    assert.ok(item.length > 0 && item.length <= 1024 && !/[\x00-\x20\x7f]/u.test(item), `${name}: bounded nonempty value`);
    if (name.endsWith('Sha256')) assert.match(item, /^[a-f0-9]{64}$/u, name);
    if (name.endsWith('Commit') || name.endsWith('Tree')) assert.match(item, /^[a-f0-9]{40}$/u, name);
    if (name.endsWith('Root')) {
      assert.ok(path.posix.isAbsolute(item) && item !== '/' && path.posix.normalize(item) === item && !item.endsWith('/'), `${name}: explicit normalized absolute path`);
    }
  }
  if (value.installationRoot && value.stagingRoot)
    assert.notEqual(value.installationRoot, value.stagingRoot, 'separate staging path');
  return missing;
}

function fingerprint(pem) {
  const key = createPublicKey(pem);
  assert.equal(key.asymmetricKeyType, 'ed25519', 'established Ed25519 registry key');
  return digest(key.export({ type: 'spki', format: 'der' }));
}
function exactExternalBytes(bytes, expected, label) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_BYTES, `bounded ${label}`);
  assert.equal(digest(bytes), expected, `exact external ${label}`);
}

// These are bindings to externally authenticated inputs, not bootstrap logic.
// An existing trusted caller must verify provenance, scopes, revocation and
// installed bundle/protocol semantics independently BEFORE supplying context.
function verifyExternalBindings(plan, trusted) {
  const contract = plan.deploymentContract, context = trusted.packetContext;
  exactExternalBytes(trusted.authorityRegistryBytes, contract.authorityRegistrySha256, 'authority registry');
  exactExternalBytes(trusted.authorityProvenanceReceiptBytes, contract.authorityProvenanceReceiptSha256, 'authority provenance receipt');
  exactExternalBytes(trusted.durableCasProtocolBytes, contract.durableCasProtocolSha256, 'durable CAS protocol');
  exactExternalBytes(trusted.permissionReceiptBytes, contract.permissionReceiptSha256, 'installation permission receipt');
  const registry = decode(trusted.authorityRegistryBytes);
  closed(registry, ['schema', 'registryId', 'authorityId', 'makerId', 'owner', 'reviewers']);
  assert.equal(registry.schema, 'stockinsider-established-recovery-registry-v1');
  assert.equal(registry.registryId, contract.authorityRegistryId);
  assert.equal(registry.authorityId, contract.authorityId);
  assert.equal(registry.makerId, context.makerId, 'established maker identity');
  closed(registry.owner, ['principalId', 'publicKeySha256']);
  assert.equal(typeof registry.owner.principalId, 'string');
  assert.ok(registry.owner.principalId.length > 0 && registry.owner.principalId.length <= 1024);
  assert.equal(registry.owner.publicKeySha256, fingerprint(context.authorityPublicKey), 'established owner key');
  closed(registry.reviewers, roles);
  const principals = new Set([registry.makerId]);
  assert.ok(!principals.has(registry.owner.principalId), 'owner distinct from maker');
  principals.add(registry.owner.principalId);
  const keys = new Set([registry.owner.publicKeySha256]);
  for (const role of roles) {
    const entry = registry.reviewers[role], source = context.reviewSources[role];
    closed(entry, ['principalId', 'publicKeySha256']);
    assert.equal(typeof entry.principalId, 'string');
    assert.ok(entry.principalId.length > 0 && entry.principalId.length <= 1024);
    assert.equal(entry.principalId, source.reviewerId, 'established reviewer identity');
    assert.equal(entry.publicKeySha256, fingerprint(source.publicKey), 'established reviewer key');
    assert.ok(!principals.has(entry.principalId) && !keys.has(entry.publicKeySha256), 'independent owner and review authorities');
    principals.add(entry.principalId); keys.add(entry.publicKeySha256);
  }
  exactExternalBytes(trusted.workerManifestBytes, contract.workerManifestSha256, 'worker manifest');
  const worker = decode(trusted.workerManifestBytes);
  assert.deepEqual(worker, {
    schema: 'stockinsider-native-1d92-worker-manifest-v1',
    predecessor: plan.subject.predecessor, candidate: plan.subject.candidate,
    activeGraphSha256: plan.subject.activeGraphSha256,
    hostFixtureSha256: plan.subject.hostFixtureSha256,
    nativeIdentitySha256: plan.subject.nativeIdentitySha256,
    recoveryVerifierSha256: plan.subject.recoveryVerifierSha256,
    permissionPolicySha256: plan.subject.permissionPolicySha256,
    workerBundleSha256: contract.workerBundleSha256,
    protectedWorkerSha256: contract.protectedWorkerSha256,
    recoveredBaseCommit: contract.recoveredBaseCommit, recoveredBaseTree: contract.recoveredBaseTree,
    protectedWorkflowSha256: contract.protectedWorkflowSha256,
    reviewRegistrySha256: contract.reviewRegistrySha256,
    atomicInstallProtocolSha256: contract.atomicInstallProtocolSha256,
  }, 'exact subject worker and recovered-base manifest');
}

/** Pure unsigned dry run. Populated fields never establish external authority. */
export function draftRecoveryInstallPlan(factsBytes, deploymentProposal = {}) {
  const facts = decode(factsBytes);
  assert.equal(digest(factsBytes), FROZEN_FACTS_SHA256, 'exact frozen source facts');
  assert.equal(facts.candidate.commit, FROZEN_CANDIDATE);
  const missing = deployment(deploymentProposal);
  return {
    schema: 'stockinsider-native-1d92-install-plan-v1',
    status: 'unsigned_inactive_proposal', activationAllowed: false, protectedGatePassed: false,
    sourceFactsSha256: FROZEN_FACTS_SHA256,
    subject: facts,
    protectedChecks: { workflow: '.github/workflows/source-led-opportunity-external-gate.yml',
      event: 'pull_request_target', requiredRoot: 'stockinsider-v3-gate-root', integrationId: 15368,
      requireAllFiveInputs: true, requireBothLiveOracles: true },
    deploymentContract: structuredClone(deploymentProposal),
    missingDeploymentFields: missing,
    requiredExternalEvidence: [
      'independently_installed_and_pinned_control_plane', 'authenticated_preexisting_owner_and_reviewer_registry_and_provenance',
      'three_signed_plan_bound_independent_reviews', 'owner_signed_exact_packet',
      'durable_predecessor_cas_and_permanent_failure_retention', 'base_owned_installation_permission',
      'fresh_host_measurement', 'fresh_full_protected_checks_including_live_oracles',
    ],
    // Interface descriptions only. No supplied function, command, URL or adapter executes.
    orderedOperations: [
      'validate_external_contract_signatures_host_and_current_predecessor',
      'durably_consume_predecessor_once_before_any_installation_action',
      'stage_and_verify_exact_control_plane_and_candidate_worker_bundles',
      'atomically_install_worker_and_exact_review_registry_via_reviewed_external_protocol',
      'run_fresh_base_owned_pull_request_target_checks_for_exact_candidate',
      'verify_all_protected_inputs_and_gate_root_without_synthesizing_success',
    ],
    failurePolicy: 'retain_consumed_predecessor_on_every_failure_no_automatic_retry_or_rollback_authority',
  };
}

/** trusted MUST come from an independently installed control plane. This pure
 * function does not authenticate that caller, prove its capabilities, reserve a
 * predecessor, authorize execution, or return an installation token. There is
 * deliberately no CLI for trusted context. The caller separately authenticates
 * readiness evidence against its own authority roots and installed release. */
export function validateRecoveryInstallationHandoff(planBytes, packetBytes, trusted) {
  const plan = decode(planBytes);
  assert.ok(trusted && typeof trusted === 'object', 'external trusted context required');
  const expected = draftRecoveryInstallPlan(encoded(plan.subject), plan.deploymentContract);
  assert.deepEqual(plan, expected, 'exact recomputed plan');
  assert.equal(plan.missingDeploymentFields.length, 0, 'external deployment contract incomplete');
  assert.deepEqual(plan.deploymentContract, trusted.deploymentContract, 'externally verified deployment contract');
  assert.equal(plan.deploymentContract.authorityId, trusted.packetContext?.authorityId, 'external authority binding');
  assert.equal(plan.deploymentContract.packetVerifierSha256, plan.subject.recoveryVerifierSha256, 'frozen verifier release');
  const readiness = trusted.readiness;
  closed(readiness, ['durableCas', 'failureRetention', 'installationPermission', 'currentPredecessor', 'hostIdentity', 'installedControlPlane', 'establishedRegistry']);
  assert.deepEqual(readiness, {
    durableCas: 'externally_verified_atomic_durable_compare_and_set',
    failureRetention: 'consume_before_execution_never_delete',
    installationPermission: 'externally_verified_base_worker_and_review_registry_scope',
    currentPredecessor: 'externally_measured_exact_frozen_predecessor',
    hostIdentity: 'externally_measured_exact_frozen_host_identity',
    installedControlPlane: 'externally_measured_exact_deployment_contract_release',
    establishedRegistry: 'externally_authenticated_preexisting_registry_and_host_recovery_scope',
  }, 'external readiness evidence required');
  const context = trusted.packetContext;
  for (const field of ['repository', 'predecessor', 'candidate', 'activeGraphSha256',
    'hostFixtureSha256', 'nativeIdentitySha256', 'recoveryVerifierSha256', 'permissionPolicySha256'])
    assert.deepEqual(context[field], plan.subject[field], `frozen ${field} binding`);
  verifyExternalBindings(plan, trusted);
  const receipt = verifyRecoveryPacket(packetBytes, context);
  for (const role of roles) {
    const source = context.reviewSources[role];
    const evidence = decode(source.evidenceBytes);
    assert.ok(Buffer.isBuffer(source.reportBytes) && source.reportBytes.length > 0 && source.reportBytes.length <= MAX_BYTES,
      'bounded external review report required');
    assert.deepEqual(evidence, {
      schema: 'stockinsider-native-1d92-install-review-v1', role,
      candidateCommit: FROZEN_CANDIDATE,
      installationPlanSha256: digest(planBytes),
      deploymentContractSha256: digest(encoded(plan.deploymentContract)),
      reviewReportSha256: digest(source.reportBytes),
    }, 'signed evidence must bind exact plan, deployment contract, and external report');
  }
  return Object.freeze({ schema: 'stockinsider-native-1d92-install-handoff-validated-v1',
    status: 'validation_only_no_execution', planSha256: digest(planBytes),
    packetSha256: receipt.packetSha256, transitionKey: receipt.transitionKey,
    candidateCommit: FROZEN_CANDIDATE, executionAuthorized: false,
    predecessorReserved: false, activationAllowed: false, protectedGatePassed: false });
}

// Bounded descriptor read avoids unbounded readFileSync before validation.
function input(filename) {
  assert.ok(path.isAbsolute(filename), 'absolute input path required');
  const fd = openSync(filename, 'r');
  try {
    const stat = fstatSync(fd);
    assert.ok(stat.isFile() && stat.size > 0 && stat.size <= MAX_BYTES, 'bounded regular input file');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let size = 0, count;
    while (size < buffer.length && (count = readSync(fd, buffer, size, buffer.length - size, null)) > 0) size += count;
    assert.ok(size <= MAX_BYTES, 'bounded input file');
    return buffer.subarray(0, size);
  } finally { closeSync(fd); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, factsPath, deploymentPath, ...extra] = process.argv.slice(2);
  assert.ok(mode === '--dry-run' && factsPath && extra.length === 0,
    'usage: native-1d92-install-plan.mjs --dry-run /absolute/facts.json [/absolute/deployment-proposal.json]');
  process.stdout.write(encoded(draftRecoveryInstallPlan(input(factsPath), deploymentPath ? decode(input(deploymentPath)) : {})));
}
