'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const { canonicalJson, sha256 } = require('./codec');
const { RuntimeInstallationError } = require('./auth-source-worker-installation');
const { TRACKED_RUNTIME_PATHS } = require('./tracked-runtime-bundle');

const SHA40 = /^[0-9a-f]{40}$/u;
const SHA64 = /^[0-9a-f]{64}$/u;
const RFC3339_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const CHANGE_ROOT = '.loop-engineering/state/changes/source-led-opportunity-engine-v3';
const REVIEW_PATH = `${CHANGE_ROOT}/exact-commit-review-final.md`;
const ATTESTATION_PATH = `${CHANGE_ROOT}/runtime-review-attestation.json`;
const PCR_PATH = `${CHANGE_ROOT}/pcr-fulfillment-record-v1.json`;
const EVIDENCE_PATHS = Object.freeze([REVIEW_PATH, PCR_PATH, ATTESTATION_PATH].sort());

function fail(reason) { throw new RuntimeInstallationError(reason); }
function exactKeys(value, keys) {
  return value && !Array.isArray(value) && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
}

function createGitRepository(repositoryRoot) {
  if (typeof repositoryRoot !== 'string' || !path.isAbsolute(repositoryRoot)) fail('invalid_arguments');
  const run = (args, encoding = 'utf8') => execFileSync('/usr/bin/git', args, {
    cwd: repositoryRoot,
    encoding,
    env: { PATH: '/usr/bin:/bin', TZ: 'Asia/Taipei' },
  });
  return Object.freeze({
    objectType: (object) => run(['cat-file', '-t', object]).trim(),
    parents: (commit) => run(['show', '-s', '--format=%P', commit]).trim().split(/\s+/u).filter(Boolean),
    tree: (commit) => run(['rev-parse', `${commit}^{tree}`]).trim(),
    replacements: () => run(['replace', '-l']).trim().split('\n').filter(Boolean),
    isAncestor: (base, head) => {
      try { run(['merge-base', '--is-ancestor', base, head]); return true; } catch { return false; }
    },
    changedRows: (base, head) => run(['diff-tree', '--no-commit-id', '--name-status', '-r', base, head])
      .trim().split('\n').filter(Boolean).map((line) => line.split('\t')),
    entry: (tree, repositoryPath) => {
      const row = run(['ls-tree', tree, '--', repositoryPath]).trim().split(/\s+/u);
      return row.length >= 3 ? { mode: row[0], type: row[1], object: row[2] } : null;
    },
    bytes: (tree, repositoryPath) => run(['cat-file', 'blob', `${tree}:${repositoryPath}`], null),
  });
}

function parseCanonicalAttestation(bytes) {
  let value;
  try {
    const text = bytes.toString('utf8');
    if (!text.endsWith('\n') || text.slice(0, -1).includes('\n')) fail('attestation_noncanonical');
    value = JSON.parse(text);
    if (`${canonicalJson(value)}\n` !== text) fail('attestation_noncanonical');
  } catch (error) {
    if (error instanceof RuntimeInstallationError) throw error;
    fail('attestation_noncanonical');
  }
  if (!exactKeys(value, ['schema','baseSha','headSha','treeSha','range','verdict','p0','p1','evidenceSha256','reviewedAt'])
    || value.schema !== 'stockinsider-exact-review-attestation-v1'
    || !SHA40.test(value.baseSha) || !SHA40.test(value.headSha) || !SHA40.test(value.treeSha)
    || !SHA64.test(value.evidenceSha256) || !RFC3339_SECONDS.test(value.reviewedAt)) {
    fail('attestation_schema_mismatch');
  }
  return value;
}

function resolveReviewedRuntimeRelease({ repositoryRoot, sourceCommit, attestationCommit }, repositoryOverride) {
  if (!SHA40.test(sourceCommit ?? '') || !SHA40.test(attestationCommit ?? '')) fail('invalid_arguments');
  const repository = repositoryOverride ?? createGitRepository(repositoryRoot);
  try {
    if (repository.objectType(attestationCommit) !== 'commit') fail('attestation_commit_unavailable');
  } catch (error) {
    if (error instanceof RuntimeInstallationError) throw error;
    fail('attestation_commit_unavailable');
  }
  if (repository.parents(attestationCommit).length !== 1 || repository.parents(attestationCommit)[0] !== sourceCommit) {
    fail('attestation_commit_not_direct_child');
  }
  const rows = repository.changedRows(sourceCommit, attestationCommit);
  if (canonicalJson(rows) !== canonicalJson(EVIDENCE_PATHS.map((repositoryPath) => ['A', repositoryPath]))) {
    fail('attestation_commit_has_extra_diff');
  }
  const evidenceTree = repository.tree(attestationCommit);
  for (const repositoryPath of EVIDENCE_PATHS) {
    const entry = repository.entry(evidenceTree, repositoryPath);
    if (!entry || entry.mode !== '100644' || entry.type !== 'blob') fail('attestation_not_regular');
  }
  const reviewBytes = repository.bytes(evidenceTree, REVIEW_PATH);
  const attestationBytes = repository.bytes(evidenceTree, ATTESTATION_PATH);
  const attestation = parseCanonicalAttestation(attestationBytes);
  if (attestation.verdict !== 'PASS' || attestation.p0 !== 0 || attestation.p1 !== 0) fail('review_not_pass');
  try {
    if (repository.objectType(sourceCommit) !== 'commit' || repository.replacements().includes(sourceCommit)) {
      fail('source_commit_unavailable');
    }
  } catch (error) {
    if (error instanceof RuntimeInstallationError) throw error;
    fail('source_commit_unavailable');
  }
  const sourceTree = repository.tree(sourceCommit);
  if (attestation.headSha !== sourceCommit || attestation.treeSha !== sourceTree
    || attestation.range !== `${attestation.baseSha}..${sourceCommit}`) fail('review_identity_mismatch');
  try {
    if (repository.objectType(attestation.baseSha) !== 'commit'
      || !repository.isAncestor(attestation.baseSha, sourceCommit)) fail('review_identity_mismatch');
  } catch (error) {
    if (error instanceof RuntimeInstallationError) throw error;
    fail('review_identity_mismatch');
  }
  if (attestation.evidenceSha256 !== sha256(reviewBytes)) fail('review_evidence_unbound');
  const members = TRACKED_RUNTIME_PATHS.map((repositoryPath) => {
    const entry = repository.entry(sourceTree, repositoryPath);
    if (!entry || entry.mode !== '100644' || entry.type !== 'blob') fail('authoritative_path_invalid');
    const bytes = repository.bytes(sourceTree, repositoryPath);
    return [repositoryPath, bytes.length, sha256(bytes)];
  });
  const configEntry = repository.entry(sourceTree, 'config/runtime/auth-source-dag.json');
  if (!configEntry || configEntry.mode !== '100644' || configEntry.type !== 'blob') fail('authoritative_path_invalid');
  const workerSha256 = sha256(Buffer.from(canonicalJson({ schema: 'stockinsider-tracked-runtime-bundle-v1', members })));
  return Object.freeze({
    commitSha: sourceCommit,
    treeSha: sourceTree,
    reviewAttestationSha256: sha256(attestationBytes),
    workerSha256,
    configSha256: sha256(repository.bytes(sourceTree, 'config/runtime/auth-source-dag.json')),
  });
}

module.exports = {
  ATTESTATION_PATH,
  EVIDENCE_PATHS,
  PCR_PATH,
  REVIEW_PATH,
  createGitRepository,
  parseCanonicalAttestation,
  resolveReviewedRuntimeRelease,
};
