import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
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
const modelOracleReuseRelative = '.github/protected-model-oracle-reuse-v1.json';
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
    count: 272,
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
    ref: 'refs/remotes/origin/codex/source-led-opportunity-engine-v3-v320-requirements-evidence',
    path: `${changeRelative}/requirements-review-v3.20.md`,
    finalLine: 'Final reviewed implementation commit/tree',
    rangeLine: 'Full reviewed range',
  },
  architecture: {
    ref: 'refs/remotes/origin/codex/source-led-opportunity-engine-v3-v320-architecture-evidence',
    path: `${changeRelative}/architecture-review-v3.20.md`,
    finalLine: 'Final reviewed implementation commit/tree',
    rangeLine: 'Full reviewed implementation range',
  },
  'exact-review': {
    ref: 'refs/remotes/origin/codex/source-led-opportunity-engine-v3-v320-exact-review-evidence',
    path: `${changeRelative}/exact-commit-review-final.md`,
    finalLine: 'Final reviewed repair/tree',
    rangeLine: 'Full final range',
  },
});

const v319ReviewSources = Object.freeze({
  requirements: Object.freeze({
    ref: 'refs/remotes/origin/codex/source-led-opportunity-engine-v3-v319-requirements-evidence',
    path: `${changeRelative}/requirements-review-v3.19.md`,
    finalLine: 'Final repair-closure commit/tree',
    rangeLine: 'Full reviewed range',
  }),
  architecture: Object.freeze({
    ref: 'refs/remotes/origin/codex/source-led-opportunity-engine-v3-v319-architecture-evidence',
    path: `${changeRelative}/architecture-review-v3.19.md`,
    finalLine: 'Final repair-closure commit/tree',
    rangeLine: 'Full reviewed implementation range',
  }),
});

const graphBoundReviewSources = Object.freeze({
  '4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b': Object.freeze({
    requirements: Object.freeze({
      ref: 'refs/remotes/origin/codex/source-led-opportunity-engine-v3-v320-requirements-evidence',
      path: `${changeRelative}/requirements-review-v3.20.md`,
      finalLine: 'Final reviewed implementation commit/tree',
      rangeLine: 'Full reviewed range',
    }),
    architecture: Object.freeze({
      ref: 'refs/remotes/origin/codex/source-led-opportunity-engine-v3-v320-architecture-evidence',
      path: `${changeRelative}/architecture-review-v3.20.md`,
      finalLine: 'Final reviewed implementation commit/tree',
      rangeLine: 'Full reviewed implementation range',
    }),
  }),
// V3.20's final amendment graph adds the graph-authoritative KOL/runtime
// artifact. The protected worker runs from the base branch, so this mapping
// belongs here before a PR with that graph can prove its own reviews.
  '13081345293dcb3306c68420270ca82ea090fa18a0ecb878ccd8da08d63e0587': Object.freeze({
    requirements: Object.freeze({
      ref: 'refs/remotes/origin/codex/source-led-opportunity-engine-v3-v320-requirements-evidence',
      path: `${changeRelative}/requirements-review-v3.20.md`,
      finalLine: 'Final reviewed implementation commit/tree',
      rangeLine: 'Full reviewed range',
    }),
    architecture: Object.freeze({
      ref: 'refs/remotes/origin/codex/source-led-opportunity-engine-v3-v320-architecture-evidence',
      path: `${changeRelative}/architecture-review-v3.20.md`,
      finalLine: 'Final reviewed implementation commit/tree',
      rangeLine: 'Full reviewed implementation range',
    }),
  }),
  // V3.20's catalog-integrity repair changes the active graph because its
  // protected authority bytes changed. These immutable evidence refs are
  // registered from a normal bootstrap change while the prior graph remains
  // authoritative, so a candidate cannot select its own review source.
  '329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64': Object.freeze({
    requirements: Object.freeze({
      ref: 'refs/remotes/origin/evidence/source-led-opportunity-v3-requirements-ef3dbb25a599e9d132aec24041ddca96f244e003',
      path: `${changeRelative}/requirements-review-v3.20.md`,
      finalLine: 'Final reviewed implementation commit/tree',
      rangeLine: 'Full reviewed range',
    }),
    architecture: Object.freeze({
      ref: 'refs/remotes/origin/evidence/source-led-opportunity-v3-architecture-01599c20d11044c0d0bac730df393c5c383ff78c',
      path: `${changeRelative}/architecture-review-v3.20.md`,
      finalLine: 'Final reviewed implementation commit/tree',
      rangeLine: 'Full reviewed implementation range',
    }),
  }),
  '5f985e391799fd8332df16c2151f75cc95dfb643a087912d92df2845a435016e': Object.freeze({
    requirements: v319ReviewSources.requirements,
    architecture: v319ReviewSources.architecture,
  }),
});

function reviewSource(check, attestation = null, identity = null) {
  const source = reviewSources[check];
  assert.ok(source, 'closed review check');
  if (check !== 'exact-review' && identity !== null) {
    const graphSources = graphBoundReviewSources[identity.activeGraphSha256];
    assert.ok(graphSources, `${check} active graph evidence source`);
    return graphSources[check];
  }
  if (check !== 'exact-review' || attestation === null) return source;
  // Exact-review evidence is about one immutable subject commit.  Keep the
  // Requirements and Architecture evidence on their already graph-bound
  // immutable refs, but fetch the exact review from its subject-addressed
  // append-only ref so one later review cannot move an earlier PR's proof.
  return {
    ...source,
    ref: `refs/remotes/origin/evidence/source-led-opportunity-v3-exact-review-${attestation.subjectCommitSha}`,
  };
}

function reviewSourceValues(attestation) {
  const values = [reviewSource('exact-review', attestation)];
  for (const graphSources of Object.values(graphBoundReviewSources)) {
    values.push(graphSources.requirements, graphSources.architecture);
  }
  return [...new Map(values.map((source) => [source.ref, source])).values()];
}

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

function treeIdentity(subjectRoot, treeSha) {
  const catalogPath = `${changeRelative}/active-artifact-catalog-v3.json`;
  const catalogBytes = treeBlob(subjectRoot, treeSha, catalogPath, 'active catalog');
  const catalog = JSON.parse(catalogBytes);
  const rows = catalog.activeFiles.map((file) => {
    const repositoryPath = `${changeRelative}/${file}`;
    const bytes = treeBlob(subjectRoot, treeSha, repositoryPath, `active artifact ${file}`);
    return [file, git(subjectRoot, ['rev-parse', `${treeSha}:${repositoryPath}`]), bytes.length, sha256(bytes)];
  });
  const inventory = JSON.parse(treeBlob(subjectRoot, treeSha, `${changeRelative}/acceptance-tests.json`, 'acceptance inventory'));
  return {
    activeGraphSha256: sha256(canonicalJson(['opportunity-active-graph-v1', sha256(catalogBytes), rows])),
    inventory,
  };
}

function subjectIdentity(subjectRoot, attestation) {
  return treeIdentity(subjectRoot, attestation.subjectTreeSha);
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
  const source = reviewSource(check, attestation, identity);
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
  const evidenceParent = check === 'exact-review' ? attestation.subjectCommitSha : reviewedHeadOrTreeSha;
  assert.deepEqual(git(subjectRoot, ['show', '-s', '--format=%P', evidenceCommitSha]).split(/\s+/u).filter(Boolean),
    [evidenceParent], `${check} evidence must be its reviewed commit's unique direct child`);
  if (check === 'exact-review') {
    // A review of an equal tree is not a review of an equal implementation
    // commit: parentage and immutable range provenance are part of the claim.
    assert.equal(reviewedHeadOrTreeSha, attestation.subjectCommitSha, 'exact-review reviewed subject commit');
    assert.equal(finalMatch[2], attestation.subjectTreeSha, 'exact-review reviewed subject tree');
  }
  const exactReviewPaths = [
    `${changeRelative}/exact-commit-review-final.md`,
    `${changeRelative}/pcr-fulfillment-record-v1.json`,
    `${changeRelative}/runtime-review-attestation.json`,
  ].toSorted();
  const allowedPaths = check === 'exact-review' ? exactReviewPaths : [source.path];
  const changedRows = git(subjectRoot, ['diff-tree', '--no-commit-id', '--name-status', '-r',
    evidenceParent, evidenceCommitSha]).split('\n').filter(Boolean).map((line) => line.split('\t'));
  if (check === 'exact-review') {
    assert.deepEqual(changedRows, allowedPaths.map((repositoryPath) => ['A', repositoryPath]),
      `${check} evidence-only diff must exactly match its closed path set`);
  } else {
    assert.deepEqual(changedRows.map((row) => row[1]), allowedPaths, `${check} evidence-only path set`);
    assert.ok(['A', 'M'].includes(changedRows[0][0]), `${check} evidence path status`);
    assert.ok(treeBlob(subjectRoot, attestation.subjectTreeSha, source.path, `${check} carried evidence`).equals(bytes),
      `${check} evidence bytes must be carried by subject`);
    assert.equal(treeIdentity(subjectRoot, finalMatch[2]).activeGraphSha256, identity.activeGraphSha256,
      `${check} reviewed graph reusable by subject`);
  }
  const evidenceOnlyPaths = changedRows.map((row) => row[1]);
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
    const attestationPath = `${changeRelative}/runtime-review-attestation.json`;
    const reviewAttestationBytes = treeBlob(subjectRoot, evidenceTreeSha, attestationPath, 'exact-review runtime attestation');
    const reviewAttestationText = reviewAttestationBytes.toString('utf8');
    assert.equal(reviewAttestationText.endsWith('\n'), true, 'exact-review attestation final LF');
    const reviewAttestation = JSON.parse(reviewAttestationText);
    exactKeys(reviewAttestation, ['baseSha','evidenceSha256','headSha','p0','p1','range','reviewedAt','schema','treeSha','verdict'],
      'exact-review runtime attestation');
    assert.equal(`${canonicalJson(reviewAttestation)}\n`, reviewAttestationText, 'exact-review attestation canonical');
    assert.equal(reviewAttestation.schema, 'stockinsider-exact-review-attestation-v1', 'exact-review attestation schema');
    assert.equal(reviewAttestation.baseSha, reviewedBaseSha, 'exact-review attestation base');
    assert.equal(reviewAttestation.headSha, attestation.subjectCommitSha, 'exact-review attestation subject');
    assert.equal(reviewAttestation.treeSha, attestation.subjectTreeSha, 'exact-review attestation tree');
    assert.equal(reviewAttestation.range, rangeMatch[1], 'exact-review attestation range');
    assert.equal(reviewAttestation.verdict, 'PASS', 'exact-review attestation verdict');
    assert.equal(reviewAttestation.p0, 0, 'exact-review attestation P0');
    assert.equal(reviewAttestation.p1, 0, 'exact-review attestation P1');
    assert.equal(reviewAttestation.evidenceSha256, sha256(bytes), 'exact-review attestation evidence binding');
    review.pcrFulfillmentPath = pcrFulfillmentPath;
    review.pcrFulfillmentSha256 = sha256(fulfillment);
  }
  return review;
}

function sanitizedEnvironment(attestation, track, extra = {}) {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'stockinsider-v3-external-gate-'));
  try {
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

function trustedPostgresBin() {
  assert.equal(process.platform, 'linux', 'protected PostgreSQL fixture requires Linux');
  const directory = process.env.OPPORTUNITY_V3_POSTGRES_BIN;
  assert.match(directory ?? '', /^\/usr\/lib\/postgresql\/[0-9]+\/bin$/u,
    'protected PostgreSQL bin uses the package-owned path');
  assert.equal(realpathSync(directory), directory, 'protected PostgreSQL bin realpath');
  const stat = lstatSync(directory);
  assert.equal(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o002) === 0,
    true, 'protected PostgreSQL bin is non-world-writable');
  for (const name of ['initdb', 'pg_ctl', 'psql']) {
    const executable = path.join(directory, name);
    const executableStat = lstatSync(executable);
    assert.equal(realpathSync(executable), executable, `protected PostgreSQL ${name} realpath`);
    assert.equal(executableStat.isFile() && !executableStat.isSymbolicLink() && (executableStat.mode & 0o111) !== 0,
      true, `protected PostgreSQL ${name} executable`);
  }
  return directory;
}

function stageNonCredentialModelHome(scratch) {
  const codexDirectory = path.join(scratch, '.codex');
  mkdirSync(codexDirectory, { mode: 0o700 });
  writeFileSync(path.join(codexDirectory, 'auth.json'), '{"externalGate":"non-credential-placeholder"}\n',
    { flag: 'wx', mode: 0o600 });
}

function protectedHostPinFixture() {
  return JSON.parse(treeBlob(baseRoot, git(baseRoot, ['rev-parse', 'HEAD^{tree}']),
    `${changeRelative}/model-runner-host-pins-v3.json`, 'protected host pin fixture'));
}

function trustedPinnedNodeExecutable() {
  const node = protectedHostPinFixture().executables.find(({ name }) => name === 'node');
  assert.ok(node && path.isAbsolute(node.path), 'protected pinned Node path');
  assert.equal(realpathSync(node.path), node.realpath, 'protected pinned Node realpath');
  return node.path;
}

function trustedNodeToolchainRoot() {
  const nodeExecutable = realpathSync(process.execPath);
  const binDirectory = path.dirname(nodeExecutable);
  assert.equal(path.basename(binDirectory), 'bin', 'protected Node executable lives in a bin directory');
  const toolchainRoot = realpathSync(path.dirname(binDirectory));
  const npmExecutable = realpathSync(path.join(binDirectory, 'npm'));
  const npmRelative = path.relative(toolchainRoot, npmExecutable);
  assert.equal(
    npmRelative.length > 0 && npmRelative !== '..' && !npmRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(npmRelative),
    true,
    'protected npm resolves inside the setup-node toolchain root',
  );
  return toolchainRoot;
}

function trustedAppleDeveloperToolchainRoot() {
  assert.equal(process.platform, 'darwin', 'protected external model runner requires macOS');
  const developerRoot = realpathSync(execFileSync('/usr/bin/xcode-select', ['-p'], {
    encoding: 'utf8',
  }).trim());
  const gitExecutable = realpathSync(execFileSync('/usr/bin/xcrun', ['--find', 'git'], {
    encoding: 'utf8',
  }).trim());
  const gitRelative = path.relative(developerRoot, gitExecutable);
  assert.equal(
    gitRelative.length > 0 && gitRelative !== '..' && !gitRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(gitRelative),
    true,
    'protected git resolves inside the selected Apple developer root',
  );
  return { gitBin: path.dirname(gitExecutable), root: developerRoot };
}

function candidateSandbox(subjectRoot, scratch, environment, executable, args, { writableSource = false, network = false } = {}) {
  const fixture = protectedHostPinFixture();
  const codex = fixture.executables.find(({ name }) => name === 'codex');
  assert.ok(codex && path.isAbsolute(codex.path), 'protected Codex path');
  const pinnedNodeExecutable = trustedPinnedNodeExecutable();
  const nodeToolchainRoot = trustedNodeToolchainRoot();
  const appleDeveloperToolchain = trustedAppleDeveloperToolchainRoot();
  const policyRoot = mkdtempSync(path.join(os.tmpdir(), 'stockinsider-v3-candidate-policy-'));
  try {
    const escaped = (value) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    const profile = [
      'default_permissions = "external-gate-candidate"', '',
      '[permissions.external-gate-candidate.filesystem]',
      '":root" = "deny"', '":minimal" = "read"',
      `"${escaped(subjectRoot)}" = "${writableSource ? 'write' : 'read'}"`,
      `"${escaped(scratch)}" = "write"`,
      `"${escaped(policyRoot)}" = "read"`,
      `"${escaped(nodeToolchainRoot)}" = "read"`,
      `"${escaped(pinnedNodeExecutable)}" = "read"`,
      `"${escaped(appleDeveloperToolchain.root)}" = "read"`,
      '"/System/Library/OpenSSL" = "read"',
      '"/Applications/ChatGPT.app" = "read"', '',
      '[permissions.external-gate-candidate.network]',
      `enabled = ${network ? 'true' : 'false'}`, '',
    ].join('\n');
    writeFileSync(path.join(policyRoot, 'config.toml'), profile, { flag: 'wx', mode: 0o600 });
    return run(subjectRoot, codex.path, [
      'sandbox', '--profile', 'external-gate-candidate', '--permission-profile', 'external-gate-candidate',
      '-C', subjectRoot, '--', executable, ...args,
    ], {
      ...environment,
      CODEX_HOME: policyRoot,
      OPPORTUNITY_V3_PROTECTED_CANDIDATE_POLICY: policyRoot,
      OPPORTUNITY_V3_PROTECTED_CANDIDATE_SCRATCH: scratch,
      PATH: `${appleDeveloperToolchain.gitBin}${path.delimiter}${environment.PATH}`,
    }, `sandboxed ${executable} ${args.join(' ')}`);
  } finally {
    rmSync(policyRoot, { force: true, recursive: true });
  }
}

const MODEL_ORACLE_PATHS = Object.freeze([
  '.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json',
  'scripts/loop-model-runner-v3.js',
  'scripts/model-runner-v3',
]);

const modelOracleReuseKeys = Object.freeze([
  'artifactDigest', 'artifactId', 'artifactName', 'completedAt', 'expiresAt',
  'jobId', 'requiredRunnerLabels', 'rootJobId', 'schema', 'subjectCommitSha',
  'workflowRunId',
]);

function assertSubjectModelOracleEqualsProtectedBase(subjectRoot, subjectCommitSha) {
  const listing = (root, commit) => git(root, [
    'ls-tree', '-r', '--full-tree', commit, '--', ...MODEL_ORACLE_PATHS,
  ]);
  assert.equal(
    listing(subjectRoot, subjectCommitSha),
    listing(baseRoot, 'HEAD'),
    'the credentialed model oracle must execute protected-base bytes identical to the exact subject',
  );
}

function publicGithubJson(url, label) {
  assert.match(url, /^https:\/\/api[.]github[.]com\/repos\/Kaichen9527\/stockinsider\/actions\//u,
    `${label} closed GitHub API URL`);
  const bytes = execFileSync('/usr/bin/curl', [
    '--fail', '--silent', '--show-error', '--location', '--max-time', '15',
    '--header', 'Accept: application/vnd.github+json',
    '--header', 'X-GitHub-Api-Version: 2022-11-28',
    '--header', 'User-Agent: stockinsider-protected-model-oracle-v1',
    url,
  ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(bytes);
}

function readModelOracleReuse() {
  const bytes = treeBlob(baseRoot, git(baseRoot, ['rev-parse', 'HEAD^{tree}']),
    modelOracleReuseRelative, 'protected model oracle reuse record');
  const value = JSON.parse(bytes);
  exactKeys(value, modelOracleReuseKeys, 'protected model oracle reuse record');
  assert.equal(value.schema, 'stockinsider-protected-model-oracle-reuse-v1', 'model oracle reuse schema');
  sha(value.subjectCommitSha, 'model oracle reuse subjectCommitSha');
  for (const key of ['artifactId', 'jobId', 'rootJobId', 'workflowRunId']) {
    assert.equal(Number.isSafeInteger(value[key]) && value[key] > 0, true, `model oracle reuse ${key}`);
  }
  assert.match(value.artifactDigest, /^sha256:[0-9a-f]{64}$/u, 'model oracle artifact digest');
  assert.equal(value.artifactName,
    `opportunity-gate-result-model-runner-code-gate-${value.subjectCommitSha}`,
    'model oracle artifact name');
  assert.deepEqual(value.requiredRunnerLabels, ['ARM64', 'macOS', 'self-hosted'],
    'model oracle runner labels');
  for (const key of ['completedAt', 'expiresAt']) {
    assert.match(value[key], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u, `model oracle reuse ${key}`);
  }
  assert.ok(Date.parse(value.expiresAt) > Date.now(), 'model oracle reuse evidence has not expired');
  return value;
}

function trustedReusableHostModelOracle(subjectRoot, attestation) {
  const reuse = readModelOracleReuse();
  const listing = (root, commit) => git(root, [
    'ls-tree', '-r', '--full-tree', commit, '--', ...MODEL_ORACLE_PATHS,
  ]);
  assert.equal(git(subjectRoot, ['cat-file', '-t', reuse.subjectCommitSha]), 'commit',
    'reused model oracle subject exists');
  assert.equal(listing(subjectRoot, attestation.subjectCommitSha), listing(subjectRoot, reuse.subjectCommitSha),
    'reused live oracle is allowed only for byte-identical model-runner inputs');

  const artifact = publicGithubJson(
    `https://api.github.com/repos/Kaichen9527/stockinsider/actions/artifacts/${reuse.artifactId}`,
    'model oracle artifact',
  );
  assert.equal(artifact.id, reuse.artifactId, 'model oracle artifact id');
  assert.equal(artifact.name, reuse.artifactName, 'model oracle artifact name from GitHub');
  assert.equal(artifact.digest, reuse.artifactDigest, 'model oracle artifact digest from GitHub');
  assert.equal(artifact.expired, false, 'model oracle artifact is live');
  assert.equal(artifact.expires_at, reuse.expiresAt, 'model oracle artifact expiry');
  assert.equal(artifact.workflow_run?.id, reuse.workflowRunId, 'model oracle artifact workflow run');
  assert.equal(artifact.workflow_run?.head_sha, reuse.subjectCommitSha, 'model oracle artifact subject');

  const workflow = publicGithubJson(
    `https://api.github.com/repos/Kaichen9527/stockinsider/actions/runs/${reuse.workflowRunId}`,
    'model oracle workflow',
  );
  assert.equal(workflow.id, reuse.workflowRunId, 'model oracle workflow id');
  assert.equal(workflow.head_sha, reuse.subjectCommitSha, 'model oracle workflow subject');
  assert.equal(workflow.event, 'pull_request_target', 'model oracle workflow event');
  assert.equal(workflow.conclusion, 'success', 'model oracle workflow conclusion');
  assert.equal(workflow.path, '.github/workflows/source-led-opportunity-external-gate.yml',
    'model oracle workflow path');

  const jobs = publicGithubJson(
    `https://api.github.com/repos/Kaichen9527/stockinsider/actions/runs/${reuse.workflowRunId}/jobs?per_page=100`,
    'model oracle jobs',
  ).jobs;
  assert.ok(Array.isArray(jobs), 'model oracle jobs array');
  const modelJob = jobs.find(({ id }) => id === reuse.jobId);
  assert.ok(modelJob, 'model oracle job exists');
  assert.equal(modelJob.name, 'model-runner-code-gate', 'model oracle job name');
  assert.equal(modelJob.head_sha, reuse.subjectCommitSha, 'model oracle job subject');
  assert.equal(modelJob.conclusion, 'success', 'model oracle job conclusion');
  assert.equal(modelJob.completed_at, reuse.completedAt, 'model oracle job completion');
  assert.deepEqual([...modelJob.labels].toSorted(), reuse.requiredRunnerLabels,
    'model oracle trusted runner labels');
  const rootJob = jobs.find(({ id }) => id === reuse.rootJobId);
  assert.ok(rootJob, 'model oracle root job exists');
  assert.equal(rootJob.name, 'stockinsider-v3-gate-root', 'model oracle root job name');
  assert.equal(rootJob.head_sha, reuse.subjectCommitSha, 'model oracle root subject');
  assert.equal(rootJob.conclusion, 'success', 'model oracle root conclusion');
  return {
    stderr: Buffer.alloc(0),
    stdout: Buffer.from(`${canonicalJson({
      artifactDigest: reuse.artifactDigest,
      artifactId: reuse.artifactId,
      mode: 'content_addressed_reuse',
      priorSubjectCommitSha: reuse.subjectCommitSha,
      status: 'pass',
      workflowRunId: reuse.workflowRunId,
    })}\n`),
  };
}

function trustedHostModelOracle(subjectRoot, attestation, nodeExecutable) {
  assertSubjectModelOracleEqualsProtectedBase(subjectRoot, attestation.subjectCommitSha);
  const reuse = readModelOracleReuse();
  const listing = (root, commit) => git(root, [
    'ls-tree', '-r', '--full-tree', commit, '--', ...MODEL_ORACLE_PATHS,
  ]);
  if (listing(subjectRoot, attestation.subjectCommitSha) === listing(subjectRoot, reuse.subjectCommitSha)) {
    return trustedReusableHostModelOracle(subjectRoot, attestation);
  }
  const runnerHome = process.env.HOME;
  assert.equal(typeof runnerHome, 'string', 'runner HOME required for trusted host oracle');
  const authentication = path.join(absolute(runnerHome, 'runner HOME'), '.codex', 'auth.json');
  const stat = lstatSync(authentication);
  assert.equal(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0,
    true, 'trusted host oracle authentication boundary');
  const hostScratch = mkdtempSync(path.join(os.tmpdir(), 'stockinsider-v3-host-oracle-'));
  try {
    chmodSync(hostScratch, 0o700);
    return run(baseRoot, nodeExecutable, [
      '--test', 'scripts/model-runner-v3/model-runner-v3.test.js',
    ], {
      ...process.env,
      OPPORTUNITY_V3_PROTECTED_HOST_PREFLIGHT_SCRATCH: hostScratch,
      OPPORTUNITY_V3_PROTECTED_NO_LIVE_AUTH: '0',
      OPPORTUNITY_V3_PROTECTED_LIVE_ONLY: '1',
    }, 'trusted protected-base host model oracle');
  } finally {
    rmSync(hostScratch, { force: true, recursive: true });
  }
}

function measuredResult(output, label) {
  const text = Buffer.from(output.stdout ?? '').toString('utf8');
  const tapPass = [...text.matchAll(/^# pass (\d+)$/gmu)].at(-1);
  const tapFail = [...text.matchAll(/^# fail (\d+)$/gmu)].at(-1);
  const tapSkipped = [...text.matchAll(/^# skipped (\d+)$/gmu)].at(-1);
  if (tapPass) {
    return {
      label,
      passed: Number(tapPass[1]),
      failed: Number(tapFail?.[1] ?? 0),
      skipped: Number(tapSkipped?.[1] ?? 0),
      todo: Number([...text.matchAll(/^# todo (\d+)$/gmu)].at(-1)?.[1] ?? 0),
    };
  }
  const playwright = [...text.matchAll(/(?:^|\s)(\d+) passed(?:\s|$)/gmu)].at(-1);
  return { label, passed: playwright ? Number(playwright[1]) : 1, failed: 0, skipped: 0, todo: 0 };
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
    ? { check: 'product-runtime-code-gate', registeredCount: 272, name: 'product-runtime-track' }
    : track === 'model_runner'
      ? { check: 'model-runner-code-gate', registeredCount: 28, name: 'model-runner-track' }
      : null;
  assert.ok(descriptor, 'closed executable track');
  const postgresBin = track === 'product_runtime' ? trustedPostgresBin() : null;
  const { environment, scratch } = sanitizedEnvironment(attestation, track, {
    OPPORTUNITY_V3_ACCEPTANCE_TRACK: track,
    OPPORTUNITY_V3_GATE_ROOT: realpathSync(subjectRoot),
    ...(postgresBin === null ? {} : {
      OPPORTUNITY_V3_POSTGRES_BIN: postgresBin,
      PATH: `${postgresBin}${path.delimiter}${process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'}`,
    }),
  });
  try {
    const outputs = [];
    const measured = [];
    const modelNodeExecutable = track === 'model_runner' ? trustedPinnedNodeExecutable() : process.execPath;
    const execute = (executable, args, label) => outputs.push(run(subjectRoot, executable, args, environment, label));
    const executeCandidate = track === 'model_runner'
      ? (executable, args, label, options) => outputs.push(candidateSandbox(subjectRoot, scratch, environment,
        executable, args, options ?? {}))
      : (executable, args, label) => execute(executable, args, label);
    if (track === 'model_runner') stageNonCredentialModelHome(scratch);
    executeCandidate('npm', ['ci', '--ignore-scripts'], 'root dependency preparation',
      { writableSource: true, network: true });
    // Both partition traces import the shared Web TypeScript graph, so both need
    // its JavaScript dependencies. Only the product partition owns browser cases
    // and may download Chromium or its operating-system dependencies.
    executeCandidate('npm', ['--prefix', 'web', 'ci', '--ignore-scripts'], 'web dependency preparation',
      { writableSource: true, network: true });
    if (track === 'product_runtime') {
      executeCandidate(path.join(subjectRoot, 'web/node_modules/.bin/playwright'), ['install', '--with-deps', 'chromium'],
        'project-local Chromium preparation', { writableSource: true, network: true });
    }
    cleanTree(subjectRoot, attestation.subjectCommitSha, attestation.subjectTreeSha);
    const candidateEnvironment = track === 'model_runner'
      ? { ...environment, OPPORTUNITY_V3_PROTECTED_NO_LIVE_AUTH: '1' } : environment;
    const executeClosedCandidate = track === 'model_runner'
      ? (executable, args, label) => outputs.push(candidateSandbox(subjectRoot, scratch, candidateEnvironment,
        executable, args, { writableSource: false, network: false }))
      : execute;
    const verify = (executeCommand, executable, args, label, ownsPartitionCount = false) => {
      const before = outputs.length;
      executeCommand(executable, args, label);
      assert.equal(outputs.length, before + 1, `${label} output ownership`);
      measured.push({ ...measuredResult(outputs.at(-1), label), ownsPartitionCount });
    };
    verify(executeClosedCandidate, modelNodeExecutable, ['--experimental-strip-types', 'scripts/opportunity-v3/acceptance-gate-runner.mjs', '--track', track], `${track} traceability`, true);
    if (track === 'product_runtime') {
      for (const script of [
        'test:source-led-opportunity-v3',
        'test:source-led-opportunity-v3:product-correctness',
        'test:source-led-opportunity-v3:migration',
        'test:legacy-v1-v2-regression',
        'typecheck:source-led-opportunity-v3',
        'lint:source-led-opportunity-v3',
        'build:source-led-opportunity-v3',
      ]) verify(execute, 'npm', ['run', script], script);
      verify(execute, 'npm', ['--prefix', 'web', 'run', 'test:e2e:v3-correctness'], 'test:e2e:v3-correctness');
      verify(execute, 'npm', ['run', 'test:source-led-opportunity-v3:performance'], 'test:source-led-opportunity-v3:performance');
    } else {
      verify(executeClosedCandidate, modelNodeExecutable, ['scripts/run-node22.js', '--test',
        'scripts/model-runner-v3/model-runner-v3.test.js'], 'test:model-runner-v3');
      verify(executeClosedCandidate, modelNodeExecutable, ['scripts/run-node22.js', '--experimental-strip-types',
        'scripts/opportunity-v3/doctor.mjs', '--expect-mode', 'disabled', '--require-host-pin',
        'model-runner-host-pins-v3.14'], 'disabled model runner doctor');
      const oracle = trustedHostModelOracle(subjectRoot, attestation, modelNodeExecutable);
      outputs.push(oracle);
      measured.push({ ...measuredResult(oracle, 'trusted protected-base exact-subject model oracle'), ownsPartitionCount: false });
    }
    cleanTree(subjectRoot, attestation.subjectCommitSha, attestation.subjectTreeSha);
    const stdout = Buffer.concat(outputs.map(({ stdout: value }) => value));
    const stderr = Buffer.concat(outputs.map(({ stderr: value }) => value));
    const totals = measured.reduce((result, row) => ({
      passed: result.passed + (row.ownsPartitionCount ? row.passed : 0),
      failed: result.failed + row.failed,
      skipped: result.skipped + row.skipped,
      todo: result.todo + row.todo,
    }), { passed: 0, failed: 0, skipped: 0, todo: 0 });
    assert.equal(measured.filter((row) => row.ownsPartitionCount).length, 1,
      `${track} has exactly one registered acceptance owner`);
    assert.deepEqual(
      { ...totals, registeredCount: descriptor.registeredCount },
      { passed: descriptor.registeredCount, failed: 0, skipped: 0, todo: 0,
        registeredCount: descriptor.registeredCount },
      `measured ${track} execution must close the registered partition`,
    );
    const result = baseResult(descriptor.check, identity, attestation);
    result.commands = [{
      command: `protected://stockinsider-v3-gate-root/execute-track --track ${track}`,
      exitCode: 0,
      failed: totals.failed,
      name: descriptor.name,
      passed: totals.passed,
      skipped: totals.skipped,
      stderrSha256: sha256(stderr),
      stdoutSha256: sha256(stdout),
      todo: totals.todo,
    }];
    result.executedCount = totals.passed + totals.failed + totals.skipped + totals.todo;
    result.partition = track;
    result.registeredCount = descriptor.registeredCount;
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
  const remoteTargets = [
    attestation.subjectCommitSha,
    ...reviewSourceValues(attestation).map(({ ref }) => {
      const remoteBranch = ref.replace('refs/remotes/origin/', 'refs/heads/');
      return `${remoteBranch}:${ref}`;
    }),
  ];
  execFileSync('/usr/bin/git', ['fetch', '--no-tags', 'origin', ...remoteTargets], { cwd: baseRoot, stdio: 'inherit' });
  const target = absolute(subjectRoot, 'subject root');
  execFileSync('/usr/bin/git', ['init', target], { cwd: baseRoot, stdio: 'inherit' });
  const localTargets = [
    attestation.subjectCommitSha,
    attestation.baseCommitSha,
    attestation.registryCommitSha,
    ...reviewSourceValues(attestation).map(({ ref }) => `${ref}:${ref}`),
  ];
  execFileSync('/usr/bin/git', ['fetch', '--no-tags', baseRoot, ...localTargets], { cwd: target, stdio: 'inherit' });
  execFileSync('/usr/bin/git', ['checkout', '--detach', attestation.subjectCommitSha], { cwd: target, stdio: 'inherit' });
  assert.equal(git(target, ['remote']), '', 'subject checkout has no configured remote');
  const credentialConfig = spawnSync('/usr/bin/git', ['config', '--local', '--get-regexp', '^http[.].*[.]extraheader$'], {
    cwd: target,
    encoding: 'utf8',
  });
  assert.equal(credentialConfig.status, 1, 'subject checkout has no credential-bearing Git config');
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
    for (const [index, check] of requiredChecks.entries()) {
      validateEnvelope(values[index], identity, attestation, check);
      if (reviewSources[check]) assert.deepEqual(values[index].result.review,
        captureReview(subjectRoot, check, identity, attestation), `${check} aggregate Git/evidence binding`);
    }
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
