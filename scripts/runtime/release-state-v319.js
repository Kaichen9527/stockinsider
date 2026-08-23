'use strict';

const { canonicalJson, invariant, sha256 } = require('./codec');

const RELEASE_PHASES_V319 = Object.freeze([
  'workspace_ready', 'contract_passed', 'implementation_reviewed', 'runtime_staged',
  'run1_terminal', 'web_deployed', 'run2_terminal', 'verified', 'closed',
]);
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA64 = /^[0-9a-f]{64}$/u;

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
}
function validNullableHash(value, pattern) { return value === null || (typeof value === 'string' && pattern.test(value)); }
function validEvidence(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && exactKeys(value, ['kind','sha256']) && typeof value.kind === 'string' && /^[a-z][a-z0-9_]{2,63}$/u.test(value.kind)
    && SHA64.test(value.sha256);
}
function releaseIdentity(value) {
  invariant(exactKeys(value, ['commitSha','treeSha','runtimeManifestSha256','migrationLevel']), 'release identity shape');
  invariant(validNullableHash(value.commitSha, SHA40) && validNullableHash(value.treeSha, SHA40)
    && validNullableHash(value.runtimeManifestSha256, SHA64)
    && (value.migrationLevel === null || value.migrationLevel === 'release-reconciliation-v3.19'), 'release identity invalid');
  return Object.freeze({ ...value });
}
function validateReleaseStateV319(value) {
  invariant(exactKeys(value, ['schema','version','phase','releaseIdentity','history']), 'release state shape');
  invariant(value.schema === 'stockinsider-release-state-v3.19.0' && value.version === 'v3.19', 'release state version');
  invariant(RELEASE_PHASES_V319.includes(value.phase), 'release state phase');
  releaseIdentity(value.releaseIdentity);
  invariant(Array.isArray(value.history) && value.history.length === RELEASE_PHASES_V319.indexOf(value.phase) + 1,
    'release state history length');
  const phases = value.history.map((entry) => entry?.phase);
  invariant(canonicalJson(phases) === canonicalJson(RELEASE_PHASES_V319.slice(0, phases.length)), 'release state ordering');
  invariant(value.history.every((entry) => exactKeys(entry, ['phase','evidence']) && RELEASE_PHASES_V319.includes(entry.phase)
    && validEvidence(entry.evidence)), 'release state evidence');
  return Object.freeze({ ...value, releaseIdentity: Object.freeze({ ...value.releaseIdentity }),
    history: Object.freeze(value.history.map((entry) => Object.freeze({ ...entry, evidence: Object.freeze({ ...entry.evidence }) }))) });
}
function createReleaseStateV319({ evidence, releaseIdentity: identity = { commitSha:null, treeSha:null, runtimeManifestSha256:null, migrationLevel:null } } = {}) {
  invariant(validEvidence(evidence) && evidence.kind === 'workspace_audit', 'workspace release evidence required');
  return validateReleaseStateV319({ schema: 'stockinsider-release-state-v3.19.0', version: 'v3.19', phase: 'workspace_ready',
    releaseIdentity: identity, history: [{ phase: 'workspace_ready', evidence }] });
}
function advanceReleaseStateV319(state, { phase, evidence, releaseIdentity: identity = state?.releaseIdentity } = {}) {
  const current = validateReleaseStateV319(state);
  const nextIndex = RELEASE_PHASES_V319.indexOf(current.phase) + 1;
  invariant(phase === RELEASE_PHASES_V319[nextIndex], 'release state phase transition invalid');
  invariant(validEvidence(evidence), 'release state evidence required');
  const resolved = releaseIdentity(identity);
  if (nextIndex >= RELEASE_PHASES_V319.indexOf('implementation_reviewed')) {
    invariant(SHA40.test(resolved.commitSha ?? '') && SHA40.test(resolved.treeSha ?? ''), 'reviewed identity required');
  }
  if (nextIndex >= RELEASE_PHASES_V319.indexOf('runtime_staged')) {
    invariant(SHA64.test(resolved.runtimeManifestSha256 ?? '') && resolved.migrationLevel === 'release-reconciliation-v3.19',
      'runtime release identity required');
  }
  return validateReleaseStateV319({ ...current, phase, releaseIdentity: resolved,
    history: [...current.history, { phase, evidence }] });
}
function releaseStateDigestV319(state) { return sha256(canonicalJson(validateReleaseStateV319(state))); }

module.exports = { RELEASE_PHASES_V319, advanceReleaseStateV319, createReleaseStateV319, releaseStateDigestV319,
  validateReleaseStateV319 };
