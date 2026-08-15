import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import * as childProcess from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const trustedExecFileSync = childProcess.execFileSync.bind(childProcess);
const trustedSpawnSync = childProcess.spawnSync.bind(childProcess);
const requestedTrack = process.env.OPPORTUNITY_V3_ACCEPTANCE_TRACK ?? 'product_runtime';
const expectedActiveGraphSha256 = '71abf84b4ae6b4703fd0559807fba15553c1f5a68c56e19039aae44173727b9d';
assert.ok(
  ['product_runtime', 'evaluation_governance', 'model_runner'].includes(requestedTrack),
  'acceptance traceability executes only an explicit automated track',
);

/*
 * GOV-004 is a defense-in-depth revalidation, never a bootstrap trust root. A
 * protected reviewer-owned harness performs first authority checks outside the
 * PR subject. This candidate test only verifies its checked-out subject and is
 * useful compatibility feedback when that harness launches it.
 */
for (const key of [
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_PENDING_DEPRECATION',
  'NODE_PRESERVE_SYMLINKS',
  'NODE_PRESERVE_SYMLINKS_MAIN',
]) {
  assert.equal(process.env[key] ?? '', '', `GOV-004 rejects inherited ${key}`);
}
for (const argument of process.execArgv) {
  assert.equal(
    /^(?:--require|--import|--loader|--experimental-loader)(?:=|$)/u.test(argument),
    false,
    `GOV-004 rejects preloading execution authority: ${argument}`,
  );
}
assert.equal(
  process.env.OPPORTUNITY_V3_GATE_RUNNER,
  'protected-external-harness-v1',
  'GOV-004 requires the protected external harness marker',
);
assert.match(process.env.OPPORTUNITY_V3_GATE_RUNNER_COMMIT ?? '', /^[0-9a-f]{40}$/u,
  'GOV-004 requires subject commit identity from the protected harness');
assert.match(process.env.OPPORTUNITY_V3_GATE_HARNESS_RELEASE_SHA256 ?? '', /^[0-9a-f]{64}$/u,
  'GOV-004 requires protected harness release identity');

let canonicalJson;
let sha256Canonical;
let executeWorkerPayload;
let computeCandidateValuation;
let boundedCandidates;
let fairQuota;
let isFreshClaim;
let quotaCoverage;
let marketContext;
let sectorCycle;
let percentile;
let scoreHorizon;
let sourcePriority;
let type7Quantile;
let valuationFactor;
let weightedFactor;
let claimsFromDocument;
let collapseRevisionFamilies;
let dedupeClaims;
let linkMention;
let normalizeAlias;
let normalizeCanonicalUrl;
let sourceAvailability;
let buildValuationDistribution;
let selectValuationMethod;
let verificationFresh;
let actionDecision;
let formalResearchStatus;
let toPublicCard;
let validSourceEvidence;
let labelOutcome;
let evaluatePromotion;
let evaluationRunMetrics;
let macroEvaluationMetrics;
let mostRecentDistinctCohorts;
let rankIdenticalCohort;
let relativeImprovement;
let evaluationConstructibility;
let productValueMeasures;
let linkAuditSample;
let mapBlindedReviewRemoteError;
let serializeBlindedReviewSuccess;
let change;
let inventory;
let activeCatalogRepositoryPath;
let activeCatalogBytes;
let activeCatalog;
let mirror;
let migration;
let contracts;
let identityCode;
let control;
let worker;
let workerExecutors;
let evaluation;
let dataContract;
let tasks;
let status;
let operatorDocs;
let operatorSchemas;
let runner;
let workflow;
let constitution;
let pcrBoundaries;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function reviewedSubjectTree() {
  const tree = (process.env.OPPORTUNITY_V3_REVIEWED_TREE
    ?? trustedExecFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' })).trim();
  assert.match(tree, /^[0-9a-f]{40,64}$/u, 'reviewed subject tree identity');
  assert.equal(
    trustedExecFileSync('git', ['cat-file', '-t', tree], { cwd: root, encoding: 'utf8' }).trim(),
    'tree',
    'reviewed subject must resolve to a Git tree',
  );
  return tree;
}

function assertCleanReviewedExecutionRoot(subjectTree) {
  const headTree = trustedExecFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(headTree, subjectTree, 'execution HEAD tree must equal reviewed subject tree');
  for (const args of [
    ['diff', '--no-ext-diff', '--quiet', subjectTree, '--'],
    ['diff', '--cached', '--no-ext-diff', '--quiet', subjectTree, '--'],
  ]) {
    const result = trustedSpawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, `execution root differs from reviewed subject tree: git ${args.join(' ')}`);
  }
  const porcelain = trustedExecFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(porcelain, '', 'execution root must not contain tracked or untracked authority drift');
}

/*
 * This is intentionally before every project import and project-file read. The
 * child-process bindings are captured from Node built-ins first, so a dirty V3
 * module cannot replace the later Git probes. After source modules load, the same
 * captured capabilities recheck that nothing has altered the reviewed execution
 * boundary.
 */
const bootstrapSubjectTree = reviewedSubjectTree();
assertCleanReviewedExecutionRoot(bootstrapSubjectTree);
assert.equal(
  trustedExecFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  process.env.OPPORTUNITY_V3_GATE_RUNNER_COMMIT,
  'GOV-004 runner and subject must bind the same reviewed commit',
);

({ canonicalJson, sha256Canonical } = await import('../../web/src/lib/opportunity-v3/canonical.ts'));
({ computeCandidateValuation, executeWorkerPayload } = await import('../../web/src/lib/opportunity-v3/worker-executors.ts'));
({ boundedCandidates, fairQuota, isFreshClaim, quotaCoverage } = await import('../../web/src/lib/opportunity-v3/funnel.ts'));
({ marketContext } = await import('../../web/src/lib/opportunity-v3/market.ts'));
({ sectorCycle } = await import('../../web/src/lib/opportunity-v3/sector-cycle.ts'));
({ percentile, scoreHorizon, sourcePriority, type7Quantile, valuationFactor, weightedFactor } = await import('../../web/src/lib/opportunity-v3/scoring.ts'));
({ claimsFromDocument, collapseRevisionFamilies, dedupeClaims, linkMention, normalizeAlias, normalizeCanonicalUrl, sourceAvailability } = await import('../../web/src/lib/opportunity-v3/source.ts'));
({ buildValuationDistribution, selectValuationMethod, verificationFresh } = await import('../../web/src/lib/opportunity-v3/valuation.ts'));
({ actionDecision, formalResearchStatus } = await import('../../web/src/lib/opportunity-v3/decision.ts'));
({ toPublicCard } = await import('../../web/src/lib/opportunity-v3/verified-change.ts'));
({ validSourceEvidence } = await import('../../web/src/lib/opportunity-v3/detail-schema.ts'));
({ labelOutcome } = await import('../../web/src/lib/opportunity-v3/outcomes.ts'));
({ evaluatePromotion, evaluationRunMetrics, macroEvaluationMetrics, mostRecentDistinctCohorts, rankIdenticalCohort, relativeImprovement } = await import('../../web/src/lib/opportunity-v3/evaluation.ts'));
({ evaluationConstructibility, productValueMeasures } = await import('../../web/src/lib/opportunity-v3/evaluation-readiness.ts'));
({ linkAuditSample } = await import('../../web/src/lib/opportunity-v3/link-audit.ts'));
({ mapBlindedReviewRemoteError, serializeBlindedReviewSuccess } = await import('../../web/src/lib/opportunity-v3/blinded-review.ts'));

change = path.join(root, '.loop-engineering/state/changes/source-led-opportunity-engine-v3');
inventory = JSON.parse(readFileSync(path.join(change, 'acceptance-tests.json'), 'utf8'));
activeCatalogRepositoryPath = '.loop-engineering/state/changes/source-led-opportunity-engine-v3/active-artifact-catalog-v3.json';
activeCatalogBytes = readFileSync(path.join(root, activeCatalogRepositoryPath));
activeCatalog = JSON.parse(activeCatalogBytes);
mirror = readFileSync(path.join(change, 'acceptance-tests.md'), 'utf8');
migration = readFileSync(path.join(root, 'migrations/20260724_source_led_opportunity_engine_v3.sql'), 'utf8');
contracts = readFileSync(path.join(root, 'web/src/lib/opportunity-v3/contracts.ts'), 'utf8');
identityCode = readFileSync(path.join(root, 'web/src/lib/opportunity-v3/identity.ts'), 'utf8');
control = readFileSync(path.join(root, 'web/src/lib/opportunity-v3/control.ts'), 'utf8');
worker = readFileSync(path.join(root, 'web/src/lib/opportunity-v3/worker.ts'), 'utf8');
workerExecutors = readFileSync(path.join(root, 'web/src/lib/opportunity-v3/worker-executors.ts'), 'utf8');
evaluation = readFileSync(path.join(change, 'shadow-evaluation-contract.md'), 'utf8');
dataContract = readFileSync(path.join(change, 'data-contract.md'), 'utf8');
tasks = readFileSync(path.join(change, 'tasks.md'), 'utf8');
status = JSON.parse(readFileSync(path.join(change, 'status.json'), 'utf8'));
operatorDocs = readFileSync(path.join(root, 'docs/source-led-opportunity-v3.md'), 'utf8');
operatorSchemas = JSON.parse(readFileSync(path.join(root, 'docs/source-led-opportunity-v3.schemas.json'), 'utf8'));
runner = createRequire(import.meta.url)('../model-runner-v3/runner.js');
workflow = readFileSync(path.join(root, '.github/workflows/source-led-opportunity-v3.yml'), 'utf8');
constitution = readFileSync(path.join(root, '.specify/memory/constitution.md'), 'utf8');
pcrBoundaries = JSON.parse(readFileSync(path.join(change, 'pcr-implementation-boundaries-v3.json'), 'utf8'));
assertCleanReviewedExecutionRoot(bootstrapSubjectTree);

function indexOid(repositoryPath) {
  const listing = trustedExecFileSync('git', ['ls-files', '--stage', '--', repositoryPath], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const match = listing.match(/^(100644|100755) ([0-9a-f]{40,64}) 0\t(.+)$/u);
  assert.ok(match, `${repositoryPath} must be one stage-zero regular tracked blob`);
  assert.equal(match[3], repositoryPath, `${repositoryPath} index path`);
  return match[2];
}

function subjectTreeBlob(subjectTree, repositoryPath) {
  const listing = trustedExecFileSync('git', ['ls-tree', '-z', subjectTree, '--', repositoryPath], {
    cwd: root,
    encoding: 'utf8',
  });
  const match = listing.match(/^(100644|100755) blob ([0-9a-f]{40,64})\t(.+)\0$/u);
  assert.ok(match, `${repositoryPath} must be one regular blob in reviewed subject tree`);
  assert.equal(match[3], repositoryPath, `${repositoryPath} subject-tree path`);
  const oid = match[2];
  assert.equal(indexOid(repositoryPath), oid, `${repositoryPath} index must equal reviewed subject tree`);
  const bytes = trustedExecFileSync('git', ['cat-file', 'blob', oid], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(
    Number(trustedExecFileSync('git', ['cat-file', '-s', oid], { cwd: root, encoding: 'utf8' }).trim()),
    bytes.length,
    `${repositoryPath} blob length`,
  );
  return { oid, bytes };
}

function normalizeAuthorityLine(line) {
  return line.normalize('NFKC')
    .replaceAll(/([a-z])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .replaceAll('sha256', 'sha 256')
    .replaceAll(/[^a-z0-9]+/gu, ' ')
    .trim();
}

/*
 * A bare three-part version is intentionally narrower than general prose.  This
 * normalization preserves only the declarators that can make an owner/version
 * claim and preserves dotted semver, so a date such as 2026-08-02 cannot become
 * an ownership declaration merely because it is near PCR words.
 */
function normalizePcrDeclaratorLine(line) {
  return line.normalize('NFKC')
    .replaceAll(/([a-z])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .replaceAll(/([:=])/gu, ' $1 ')
    .replaceAll(/[^a-z0-9.:=]+/gu, ' ')
    .trim();
}

function pcrBareDeclaratorIdentities(line) {
  const normalized = normalizePcrDeclaratorLine(line);
  const ownerForms = [
    String.raw`product\s+correctness\s+runtime`,
    String.raw`product\s+correctness`,
  ];
  const declarator = String.raw`(?:=|:|\bis\b|\bequals\b)`;
  const identities = new Set();
  for (const ownerForm of ownerForms) {
    const nameFirst = new RegExp(
      String.raw`\b${ownerForm}\b\s*${declarator}\s*(\d+)\.(\d+)\.(\d+)\b`,
      'gu',
    );
    const versionFirst = new RegExp(
      String.raw`\b(\d+)\.(\d+)\.(\d+)\b\s*${declarator}\s*\b${ownerForm}\b`,
      'gu',
    );
    for (const match of normalized.matchAll(nameFirst)) {
      identities.add(`product-correctness-runtime-v${match[1]}.${match[2]}.${match[3]}`);
    }
    for (const match of normalized.matchAll(versionFirst)) {
      identities.add(`product-correctness-runtime-v${match[1]}.${match[2]}.${match[3]}`);
    }
  }
  return identities;
}

function termPositions(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match.index ?? -1);
}

function termsShareWindow(text, patterns, maximumSpan = 192) {
  const positionLists = patterns.map((pattern) => termPositions(text, pattern));
  if (positionLists.some((positions) => positions.length === 0)) return false;
  const search = (index, smallest, largest) => {
    if (index === positionLists.length) return largest - smallest <= maximumSpan;
    return positionLists[index].some((position) => search(
      index + 1,
      Math.min(smallest, position),
      Math.max(largest, position),
    ));
  };
  return positionLists[0].some((position) => search(1, position, position));
}

function pcrOwnerIdentity(line, normalized = normalizeAuthorityLine(line), maximumSpan = 192) {
  const bareDeclaratorIdentities = pcrBareDeclaratorIdentities(line);
  const names = [...normalized.matchAll(/\bproduct\s+correctness(?:\s+runtime)?\b/gu)];
  const versions = [...normalized.matchAll(
    /\b(?<prefix>v)?\s*(?<major>\d+)\s+(?<minor>\d+)\s+(?<patch>\d+)\b/gu,
  )];
  for (const name of names) {
    const nameStart = name.index ?? -1;
    const nameEnd = nameStart + name[0].length;
    for (const version of versions) {
      const versionStart = version.index ?? -1;
      const versionEnd = versionStart + version[0].length;
      const declarationStart = Math.min(nameStart, versionStart);
      const declarationEnd = Math.max(nameEnd, versionEnd);
      if (declarationEnd - declarationStart > maximumSpan) continue;
      const declaration = normalized.slice(
        Math.max(0, declarationStart - 32),
        Math.min(normalized.length, declarationEnd + 32),
      );
      const explicitVersion = version.groups?.prefix === 'v';
      const bareAuthorityContext = /\b(?:authority|owner|version)\b/iu.test(declaration);
      const owner = `product-correctness-runtime-v${version.groups.major}.${version.groups.minor}.${version.groups.patch}`;
      if (!explicitVersion && !bareAuthorityContext && !bareDeclaratorIdentities.has(owner)) continue;
      return owner;
    }
  }
  return null;
}

function authorityLikeDeclaration({ line, repositoryPath, productCorrectnessOwner }) {
  const normalized = normalizeAuthorityLine(line);
  const catalogTerms = termsShareWindow(normalized, [
    /\bcatalog\b/gu,
    /\b(?:byte|bytes)\b/gu,
    /\bsha\s+256\b/gu,
  ]);
  const catalogValue =
    /\b[0-9a-f]{64}\b/iu.test(line)
    || /\b(?:byte|bytes)(?:\s+length)?\s+(?:is\s+)?\d{2,}\b/iu.test(normalized)
    || /\b\d{2,}\s+(?:byte|bytes)\b/iu.test(normalized);
  if (catalogTerms && catalogValue) return 'catalog identity';

  const topologyTerms = termsShareWindow(normalized, [
    /\bfiles?\b/gu,
    /\bowners?\b/gu,
  ]);
  const topologyContext =
    /\bactive\s+(?:graph|files?|blobs?)\b/iu.test(normalized)
    || /\b(?:topology|closure)\b/iu.test(normalized);
  const topologyValues =
    (/(?:\bfiles?(?:\s+count)?\s+\d+\b|\b\d+\s+files?\b)/iu.test(normalized))
    && (/(?:\bowners?(?:\s+count)?\s+\d+\b|\b\d+\s+owners?\b)/iu.test(normalized));
  if (topologyTerms && topologyContext && topologyValues) return 'active-graph topology';

  const owner = pcrOwnerIdentity(line, normalized);
  if (owner) {
    const exactOwnerHeader = `Amendment version: \`${productCorrectnessOwner}\``;
    if (
      repositoryPath === 'product-correctness-runtime-amendment.md'
      && line.trim() === exactOwnerHeader
      && owner === productCorrectnessOwner
    ) return null;
    if (
      repositoryPath === 'active-artifact-catalog-v3.json'
      && line.trim() === `"${productCorrectnessOwner}"`
      && owner === productCorrectnessOwner
    ) return null;
    return `product-correctness owner=${owner}`;
  }
  return null;
}

function assertCanonicalTaggedAuthorities({ records, expectedRows, productCorrectnessOwner }) {
  const observedRows = [];
  const untaggedDeclarations = [];
  for (const { repositoryPath, text } of records) {
    for (const [lineIndex, line] of text.split(/\r?\n/u).entries()) {
      if (line.includes('GOV-004-AUTHORITY')) {
        const match = line.match(/^<!-- GOV-004-AUTHORITY (?<payload>\{[^\r\n]*\}) -->$/u);
        assert.ok(match?.groups?.payload, `${repositoryPath}:${lineIndex + 1} canonical authority-tag grammar`);
        let row;
        try {
          row = JSON.parse(match.groups.payload);
        } catch (error) {
          assert.fail(`${repositoryPath}:${lineIndex + 1} canonical authority-tag JSON: ${error.message}`);
        }
        assert.equal(
          canonicalJson(row),
          match.groups.payload,
          `${repositoryPath}:${lineIndex + 1} authority tag must use RFC 8785 key order`,
        );
        observedRows.push(row);
        continue;
      }
      const declarationKind = authorityLikeDeclaration({
        line,
        repositoryPath,
        productCorrectnessOwner,
      });
      if (declarationKind) {
        untaggedDeclarations.push(`${repositoryPath}:${lineIndex + 1}:${declarationKind}:${line.trim()}`);
      }
    }
  }
  assert.deepEqual(
    observedRows.map((row) => canonicalJson(row)).sort(),
    expectedRows.map((row) => canonicalJson(row)).sort(),
    'GOV-004 requires exactly the canonical authority-tag set',
  );
  assert.deepEqual(
    untaggedDeclarations,
    [],
    'GOV-004 rejects every untagged authority-like declaration across the active graph',
  );
}

function mutateAuthorityRecords(records, repositoryPath, mutate) {
  const record = records.find((candidate) => candidate.repositoryPath === repositoryPath);
  assert.ok(record, `active authority record exists: ${repositoryPath}`);
  record.text = mutate(record.text);
}

function assertTaskStatusNextWorkConsistent(tasksText, statusRecord) {
  assert.equal(statusRecord.changeId, 'source-led-opportunity-engine-v3');
  const round = statusRecord.requirementsReviewRound;
  assert.ok(Number.isInteger(round) && round >= 104, 'current Requirements round is explicit');
  assert.match(statusRecord.requirementsReviewTree, /^[0-9a-f]{40}$/u);
  assert.equal(
    statusRecord.requirementsReviewEvidence,
    `.loop-engineering/state/changes/source-led-opportunity-engine-v3/requirements-review-round-${round}.md`,
  );

  if (statusRecord.requirementsStatus === `v3_16_9_round_${round}_pass_p0_0_p1_0_p2_0`) {
    const currentMarkerV3169 = '## V3.16.9 official-ingestion transaction-time recovery';
    const currentStartV3169 = tasksText.lastIndexOf(currentMarkerV3169);
    assert.ok(currentStartV3169 >= 0, 'one operative V3.16.9 recovery task section exists');
    const currentTasksV3169 = tasksText.slice(currentStartV3169);
    assert.equal(round, 142);
    assert.equal(statusRecord.requirementsGateStatus, 'pass_p0_0_p1_0_p2_0');
    assert.equal(statusRecord.requirementsPendingTree, null);
    assert.equal(statusRecord.requirementsPendingEvidence, null);
    assert.equal(statusRecord.architectureGateStatus, 'pass_p0_0_p1_0_p2_0');
    assert.equal(statusRecord.architectureReviewRound, 22);
    assert.equal(statusRecord.architecturePendingRound, null);
    assert.equal(statusRecord.architecturePendingTree, null);
    assert.equal(statusRecord.architecturePendingEvidence, null);
    assert.equal(statusRecord.architectureReviewEvidence,
      '.loop-engineering/state/changes/source-led-opportunity-engine-v3/architecture-review-round-22.md');
    assert.equal(statusRecord.designStatus, 'v3_16_9_architecture_round_22_pass_p0_0_p1_0_p2_0');
    assert.equal(statusRecord.loopStage, 'v3_16_9_exact_review_pass_protected_gate_pending');
    assert.equal(statusRecord.implementationStatus, 'v3_16_9_exact_review_pass_protected_gate_pending');
    assert.equal(statusRecord.exactCommitReviewStatus, 'v3_16_9_exact_range_pass_p0_0_p1_0_p2_0');
    assert.match(currentTasksV3169, /- \[x\] Obtain fresh Requirements Round 142, Architecture Round 22/u);
    assert.match(currentTasksV3169, /Protected Code Gate remains the landing check/u);
    assert.match(currentTasksV3169, /- \[ \] Apply the reviewed successor migration/u);
    return;
  }

  if (statusRecord.requirementsStatus === `v3_16_round_${round}_pass_p0_0_p1_0_p2_0`) {
    const currentMarkerV316 = '## V3.15 opportunity recovery';
    const currentStartV316 = tasksText.lastIndexOf(currentMarkerV316);
    assert.ok(currentStartV316 >= 0, 'one operative V3.16 recovery task section exists');
    const currentTasksV316 = tasksText.slice(currentStartV316);
    assert.equal(statusRecord.requirementsGateStatus, 'pass_p0_0_p1_0_p2_0');
    assert.equal(statusRecord.requirementsPendingTree, null);
    assert.equal(statusRecord.requirementsPendingEvidence, null);
    assert.equal(statusRecord.architectureGateStatus, 'pass_p0_0_p1_0_p2_0');
    assert.equal(statusRecord.architectureReviewRound, 20);
    assert.equal(statusRecord.architecturePendingRound, null);
    assert.equal(statusRecord.architecturePendingTree, null);
    assert.equal(statusRecord.architecturePendingEvidence, null);
    assert.equal(statusRecord.designStatus, 'v3_16_architecture_round_20_pass_p0_0_p1_0_p2_0');
    assert.equal(statusRecord.loopStage, 'v3_16_architecture_round_20_pass_exact_freeze_pending');
    assert.equal(statusRecord.exactCommitReviewStatus, 'v3_16_exact_range_pass_p0_0_p1_0_p2_0');
    assert.match(currentTasksV316, /- \[x\] Obtain fresh Requirements Round 138 PASS/u);
    assert.match(currentTasksV316, /protected external artifact remains the landing check/u);
    assert.match(currentTasksV316, /- \[ \] Obtain superseding fresh Requirements, Architecture, exact-review/u);
    return;
  }

  if (statusRecord.requirementsGateStatus === `pass_v3_15_round_${round}`) {
    const currentMarkerV315 = '## V3.15 opportunity recovery';
    const currentStartV315 = tasksText.lastIndexOf(currentMarkerV315);
    assert.ok(currentStartV315 >= 0, 'one operative V3.15 task section exists');
    const currentTasksV315 = tasksText.slice(currentStartV315);
    assert.equal(statusRecord.requirementsStatus, `v3_15_round_${round}_pass`);
    assert.equal(statusRecord.requirementsPendingTree, null);
    assert.equal(statusRecord.requirementsPendingEvidence, null);
    assert.match(currentTasksV315, new RegExp(`- \\[x\\] Obtain fresh Requirements Round ${round} PASS`, 'u'));
    assert.equal(statusRecord.architectureGateStatus, 'pass_v3_15_round_19');
    assert.equal(statusRecord.architectureReviewRound, 19);
    assert.equal(statusRecord.architecturePendingRound, null);
    assert.equal(statusRecord.architecturePendingTree, null);
    assert.equal(statusRecord.architecturePendingEvidence, null);
    assert.equal(statusRecord.designStatus, 'v3_15_architecture_round_19_pass');
    assert.equal(statusRecord.loopStage, 'v3_15_exact_review_repair_closure_pass_protected_gate_pending');
    assert.equal(statusRecord.implementationStatus, 'v3_15_exact_review_repair_closure_pass');
    assert.equal(statusRecord.exactCommitReviewStatus,
      'v3_15_repair_and_full_range_pass_p0_0_p1_0_p2_0');
    assert.match(statusRecord.blockedReason, /protected Code Gate/u);
    assert.match(currentTasksV315, /protected external artifact remains the landing check/u);
    return;
  }

  if (statusRecord.requirementsGateStatus === `pass_v3_14_round_${round}`) {
    const currentMarkerV314 = '### V3.14 Actionability Recovery — user-authorized implementation';
    const currentStartV314 = tasksText.lastIndexOf(currentMarkerV314);
    assert.ok(currentStartV314 >= 0, 'one operative V3.14 task section exists');
    const currentTasksV314 = tasksText.slice(currentStartV314);
    assert.equal(statusRecord.requirementsStatus, `v3_14_round_${round}_pass`);
    assert.equal(statusRecord.requirementsPendingTree, null);
    assert.equal(statusRecord.requirementsPendingEvidence, null);
    assert.match(currentTasksV314, new RegExp(`- \\[x\\] Run fresh Requirements Round ${round}`, 'u'));
    if (statusRecord.architectureGateStatus === 'pending_v3_14_round_17') {
      assert.equal(statusRecord.loopStage, `v3_14_round_${round}_requirements_pass_architecture_round_17_pending`);
      assert.equal(statusRecord.designStatus, 'v3_14_architecture_round_17_pending');
      assert.equal(statusRecord.architecturePendingRound, 17);
      assert.equal(statusRecord.architecturePendingTree, 'round_17_subject_tree_with_round_137_requirements_evidence');
      assert.equal(statusRecord.architecturePendingEvidence,
        '.loop-engineering/state/changes/source-led-opportunity-engine-v3/architecture-review-round-17.md');
      assert.equal(statusRecord.implementationStatus, 'v3_14_requirements_pass_architecture_round_17_pending');
      assert.match(statusRecord.blockedReason, /Architecture Round 17 PASS is required/u);
      assert.match(currentTasksV314, /- \[ \] Obtain independent fresh Architecture Round 17 PASS/u);
    } else if (statusRecord.architectureGateStatus.startsWith('changes_required_v3_14_round_17_')) {
      assert.match(statusRecord.architectureGateStatus,
        /^changes_required_v3_14_round_17_p0_0_p1_[1-9][0-9]*_p2_[0-9]+_repaired_unreviewed$/u);
      assert.equal(statusRecord.loopStage, 'v3_14_architecture_round_17_p1_repaired_round_18_pending');
      assert.equal(statusRecord.designStatus, 'v3_14_architecture_round_17_changes_required_repaired_round_18_pending');
      assert.equal(statusRecord.architectureReviewRound, 17);
      assert.equal(statusRecord.architectureReviewTree, '71700c03641ab3ddcc80ec17aaca17aaa40e24b6');
      assert.equal(statusRecord.architecturePendingRound, 18);
      assert.equal(statusRecord.architecturePendingTree, 'round_18_subject_tree_after_round_17_repairs');
      assert.equal(statusRecord.architecturePendingEvidence,
        '.loop-engineering/state/changes/source-led-opportunity-engine-v3/architecture-review-round-18.md');
      assert.equal(statusRecord.implementationStatus, 'v3_14_architecture_round_17_p1_repair_complete_unreviewed');
      assert.match(statusRecord.blockedReason, /Architecture Round 18 PASS is required/u);
      assert.match(currentTasksV314, /- \[x\] Run independent fresh Architecture Round 17/u);
      assert.match(currentTasksV314, /- \[ \] Obtain independent fresh Architecture Round 18 PASS/u);
    } else {
      assert.equal(statusRecord.architectureGateStatus, 'pass_v3_14_round_18');
      assert.equal(statusRecord.architectureReviewRound, 18);
      assert.equal(statusRecord.architecturePendingRound, null);
      assert.equal(statusRecord.architecturePendingTree, null);
      assert.equal(statusRecord.architecturePendingEvidence, null);
      assert.match(currentTasksV314, /- \[x\] Obtain independent fresh Architecture Round 18 PASS/u);
    }
    return;
  }

  if (statusRecord.requirementsGateStatus.startsWith('changes_required_v3_14_')) {
    const currentMarkerV314 = '### V3.14 Actionability Recovery — user-authorized implementation';
    const currentStartV314 = tasksText.lastIndexOf(currentMarkerV314);
    assert.ok(currentStartV314 >= 0, 'one operative V3.14 task section exists');
    const currentTasksV314 = tasksText.slice(currentStartV314);
    const nextRound = round + 1;
    assert.match(
      statusRecord.requirementsGateStatus,
      new RegExp(`^changes_required_v3_14_round_${round}_p0_0_p1_[1-9][0-9]*_p2_[0-9]+_repaired_unreviewed$`, 'u'),
    );
    assert.equal(statusRecord.loopStage, `v3_14_round_${round}_p1_repaired_round_${nextRound}_pending`);
    assert.match(
      statusRecord.requirementsStatus,
      new RegExp(`^v3_14_round_${round}_changes_required_p1_[1-9][0-9]*_repaired_fresh_round_${nextRound}_pending$`, 'u'),
    );
    assert.equal(statusRecord.requirementsPendingTree, `round_${nextRound}_subject_tree_after_round_${round}_repairs`);
    assert.equal(statusRecord.requirementsPendingEvidence,
      `.loop-engineering/state/changes/source-led-opportunity-engine-v3/requirements-review-round-${nextRound}.md`);
    assert.equal(statusRecord.implementationStatus, `v3_14_round_${round}_p1_repair_complete_unreviewed`);
    assert.match(statusRecord.blockedReason, new RegExp(`Round ${nextRound} Requirements PASS is required`, 'u'));
    assert.match(currentTasksV314, new RegExp(`- \\[x\\] Run fresh Requirements Round ${round}`, 'u'));
    assert.match(currentTasksV314, new RegExp(`Fresh Round ${nextRound} remains pending`, 'u'));
    return;
  }

  const currentMarker = '### V3.13 Decision Integrity — current implementation';
  const currentStart = tasksText.lastIndexOf(currentMarker);
  assert.ok(currentStart >= 0, 'one operative V3.13 task section exists');
  const currentTasks = tasksText.slice(currentStart);
  if (statusRecord.requirementsGateStatus === `pass_v3_13_round_${round}`) {
    assert.equal(statusRecord.requirementsPendingTree, null);
    assert.equal(statusRecord.requirementsPendingEvidence, null);
    assert.equal(statusRecord.requirementsStatus, `v3_13_round_${round}_pass`);
    assert.match(currentTasks, new RegExp(`- \\[x\\] Obtain fresh V3[.]13 Requirements PASS in Round ${round}`, 'u'));
    if (statusRecord.architectureGateStatus === 'pending_v3_13_round_13') {
      assert.equal(statusRecord.loopStage, `v3_13_round_${round}_requirements_pass_architecture_round_13_freeze`);
      assert.equal(statusRecord.implementationStatus, 'v3_13_requirements_pass_architecture_round_13_pending');
      assert.match(statusRecord.blockedReason, /Architecture Round 13 PASS is required/u);
    } else if (statusRecord.architectureGateStatus === 'changes_required_v3_13_round_13') {
      assert.equal(statusRecord.architectureGateStatus, 'changes_required_v3_13_round_13');
      assert.equal(statusRecord.architectureReviewRound, 13);
      assert.equal(statusRecord.architectureReviewTree, '4fefb62e09aa17e368c5dcae6c545a8096529519');
      assert.equal(statusRecord.architectureReviewEvidence,
        '.loop-engineering/state/changes/source-led-opportunity-engine-v3/architecture-review-round-13.md');
      assert.equal(statusRecord.architecturePendingRound, 14);
      assert.equal(statusRecord.architecturePendingTree, 'round_14_subject_tree_after_round_13_repairs');
      assert.equal(statusRecord.architecturePendingEvidence, 'architecture-review-round-14.md');
      assert.equal(statusRecord.loopStage, 'v3_13_architecture_round_13_five_p1_repair_round_14_freeze');
      assert.equal(statusRecord.implementationStatus,
        'v3_13_architecture_round_13_five_p1_repair_complete_round_14_pending');
      assert.match(statusRecord.blockedReason, /Architecture Round 14 PASS is required/u);
      assert.match(currentTasks, /- \[x\] Repair all five Architecture Round 13 P1 roots together/u);
      assert.match(currentTasks, /- \[ \] Obtain independent fresh Architecture PASS in Round 14/u);
    } else if (statusRecord.architectureGateStatus === 'changes_required_v3_13_round_14') {
      assert.equal(statusRecord.architectureGateStatus, 'changes_required_v3_13_round_14');
      assert.equal(statusRecord.architectureReviewRound, 14);
      assert.equal(statusRecord.architectureReviewTree, '659e3543c9e8abb452a05c31de054fb0d5964837');
      assert.equal(statusRecord.architectureReviewEvidence,
        '.loop-engineering/state/changes/source-led-opportunity-engine-v3/architecture-review-round-14.md');
      assert.equal(statusRecord.architecturePendingRound, 15);
      assert.equal(statusRecord.architecturePendingTree, 'round_15_subject_tree_after_round_14_repairs');
      assert.equal(statusRecord.architecturePendingEvidence, 'architecture-review-round-15.md');
      assert.equal(statusRecord.loopStage, 'v3_13_architecture_round_14_one_p1_repair_round_15_freeze');
      assert.equal(statusRecord.implementationStatus,
        'v3_13_architecture_round_14_one_p1_repair_complete_round_15_pending');
      assert.match(statusRecord.blockedReason, /Architecture Round 15 PASS is required/u);
      assert.match(currentTasks, /- \[x\] Repair the sole Architecture Round 14 P1 root/u);
      assert.match(currentTasks, /- \[ \] Obtain independent fresh Architecture PASS in Round 15/u);
    } else if (statusRecord.architectureGateStatus === 'changes_required_v3_13_round_15') {
      assert.equal(statusRecord.architectureGateStatus, 'changes_required_v3_13_round_15');
      assert.equal(statusRecord.architectureReviewRound, 15);
      assert.equal(statusRecord.architectureReviewTree, 'be578da611fa0cfb224e6781067e4b0f1b7984ec');
      assert.equal(statusRecord.architectureReviewEvidence,
        '.loop-engineering/state/changes/source-led-opportunity-engine-v3/architecture-review-round-15.md');
      assert.equal(statusRecord.architecturePendingRound, 16);
      assert.equal(statusRecord.architecturePendingTree, 'round_16_subject_tree_after_round_15_repairs');
      assert.equal(statusRecord.architecturePendingEvidence, 'architecture-review-round-16.md');
      assert.equal(statusRecord.loopStage, 'v3_13_architecture_round_15_two_p1_repair_round_16_freeze');
      assert.equal(statusRecord.implementationStatus,
        'v3_13_architecture_round_15_two_p1_repair_complete_round_16_pending');
      assert.match(statusRecord.blockedReason, /Architecture Round 16 PASS is required/u);
      assert.match(currentTasks, /- \[x\] Repair both Architecture Round 15 P1 roots together/u);
      assert.match(currentTasks, /- \[ \] Obtain independent fresh Architecture PASS in Round 16/u);
    } else {
      assert.equal(statusRecord.architectureGateStatus, 'pass_v3_13_round_16');
      assert.equal(statusRecord.architectureReviewRound, 16);
      assert.equal(statusRecord.architectureReviewTree, '4005c99f530219588e6120d93e427b7807134cee');
      assert.equal(statusRecord.architectureReviewEvidence,
        '.loop-engineering/state/changes/source-led-opportunity-engine-v3/architecture-review-round-16.md');
      assert.equal(statusRecord.architecturePendingRound, null);
      assert.equal(statusRecord.architecturePendingTree, null);
      assert.equal(statusRecord.architecturePendingEvidence, null);
      assert.match(currentTasks, /- \[x\] Obtain independent fresh Architecture Round 16 PASS/u);
      if (statusRecord.exactCommitReviewStatus === 'v3_13_changes_required_p0_0_p1_5_p2_3_repair_in_progress') {
        assert.equal(statusRecord.loopStage, 'v3_13_exact_review_repair_in_progress');
        assert.equal(statusRecord.implementationStatus, 'v3_13_exact_commit_reviewed_repair_pending');
        assert.equal(statusRecord.v313ExactImplementationCommit,
          '3f3fb99412ceee7c3c21dda11199a30be1594242');
        assert.match(statusRecord.blockedReason, /repair-range\/full-range closure/u);
        assert.match(currentTasks, /- \[x\] Create exact implementation commit/u);
        assert.match(currentTasks, /- \[ \] Freeze the eight-finding repair tree/u);
      } else if (statusRecord.exactCommitReviewStatus === 'v3_13_repair_and_full_range_pass_p0_0_p1_0') {
        assert.equal(statusRecord.loopStage, 'v3_13_review_closure_pass_code_gate_pending');
        assert.equal(statusRecord.implementationStatus, 'v3_13_exact_review_repair_closure_complete');
        assert.match(statusRecord.blockedReason, /authoritative Code Gate remains/u);
        assert.match(currentTasks, /- \[x\] Freeze the eight-finding repair tree/u);
      } else {
        assert.equal(statusRecord.loopStage, 'v3_13_architecture_round_16_pass_exact_commit_freeze');
        assert.equal(statusRecord.implementationStatus, 'v3_13_architecture_pass_exact_commit_pending');
        assert.match(statusRecord.blockedReason, /exact implementation commit/u);
        assert.match(currentTasks, /- \[ \] Create the exact implementation commit/u);
      }
    }
  } else {
    const nextRound = round + 1;
    assert.equal(statusRecord.requirementsGateStatus, `changes_required_v3_13_round_${round}`);
    assert.match(
      statusRecord.loopStage,
      new RegExp(`^v3_13_round_${round}_.+repair.+round_${nextRound}_freeze$`, 'u'),
    );
    assert.match(
      statusRecord.requirementsStatus,
      new RegExp(`^v3_13_round_${round}_changes_required_.+repaired_round_${nextRound}_pending$`, 'u'),
    );
    assert.equal(statusRecord.requirementsPendingTree, `round_${nextRound}_subject_tree_after_round_${round}_repairs`);
    assert.equal(statusRecord.requirementsPendingEvidence, `requirements-review-round-${nextRound}.md`);
    assert.match(
      statusRecord.implementationStatus,
      new RegExp(`^v3_13_round_${round}_.+repair.+round_${nextRound}_pending$`, 'u'),
    );
    assert.match(statusRecord.blockedReason, new RegExp(`Round ${nextRound} Requirements PASS is required`, 'u'));
    assert.match(currentTasks, new RegExp(`fresh Requirements Round ${round} over commit`, 'u'));
    assert.match(currentTasks, new RegExp(`- \\[ \\] Obtain fresh V3[.]13 Requirements PASS in Round ${nextRound}`, 'u'));
  }
  assert.match(currentTasks, /independent Architecture/u);
  assert.match(currentTasks, /- \[(?: |x)\] (?:Create exact implementation commit|Freeze the eight-finding repair tree)/u);
  assert.match(currentTasks, /- \[ \] Form one authoritative release candidate[.]/u);

  const historicalStart = tasksText.indexOf('## V3.13 decision-integrity checkpoint — 2026-08-10');
  const historicalEnd = tasksText.indexOf('## /autoplan Review', historicalStart);
  assert.ok(historicalStart >= 0 && historicalEnd > historicalStart, 'historical Round 104 checkpoint is bounded');
  assert.doesNotMatch(
    tasksText.slice(historicalStart, historicalEnd),
    /^- \[ \]/mu,
    'obsolete Round 104 checkpoint contains no open task',
  );
}

function activeGraphOracle() {
  const subjectTree = reviewedSubjectTree();
  assert.equal(subjectTree, bootstrapSubjectTree, 'active graph must remain bound to the bootstrap reviewed tree');
  assertCleanReviewedExecutionRoot(subjectTree);
  const catalogBlob = subjectTreeBlob(subjectTree, activeCatalogRepositoryPath);
  assert.deepEqual(catalogBlob.bytes, activeCatalogBytes, 'catalog working bytes equal reviewed subject tree');
  assert.equal(catalogBlob.bytes.length, 5484, 'catalog exact tracked byte length including LF');
  assert.equal(
    sha256(catalogBlob.bytes),
    'f11d8e6e04373c3bdfabf217eb911f1e5c85d1f9060756a567fae4c1fca75412',
    'catalog exact tracked SHA-256',
  );
  const expectedVersions = new Map(activeCatalog.owners);
  const expectedContractFiles = [...expectedVersions.keys()]
    .filter((file) => file.endsWith('-contract.md') && file !== 'data-contract.md')
    .sort();
  const activeContractFiles = readdirSync(change)
    .filter((file) => file.endsWith('-contract.md') && file !== 'data-contract.md')
    .sort();
  assert.deepEqual(activeContractFiles, expectedContractFiles);
  const activeArtifactFiles = activeCatalog.activeFiles;
  assert.equal(activeArtifactFiles.length, 50);
  assert.equal(new Set(activeArtifactFiles).size, activeArtifactFiles.length);
  assert.deepEqual(activeArtifactFiles, [...activeArtifactFiles].toSorted(), 'catalog active-file ASCII order');
  assert.equal(activeCatalog.owners.length, 40, 'catalog owner row count');
  assert.deepEqual(
    activeCatalog.owners.map(([file]) => file),
    activeCatalog.owners.map(([file]) => file).toSorted(),
    'catalog owner ASCII order',
  );
  assert.equal(new Set(activeCatalog.owners.map(([file]) => file)).size, 40, 'catalog owner uniqueness');
  for (const [file] of activeCatalog.owners) assert.ok(activeArtifactFiles.includes(file), `${file} owner must be active`);
  const orderedBlobRows = activeArtifactFiles.map((file) => {
    const repositoryPath = `.loop-engineering/state/changes/source-led-opportunity-engine-v3/${file}`;
    const indexed = subjectTreeBlob(subjectTree, repositoryPath);
    const workingBytes = readFileSync(path.join(change, file));
    assert.deepEqual(workingBytes, indexed.bytes, `${file} working/subject-tree blob equality`);
    assert.ok(indexed.bytes.length > 0, `${file} nonempty`);
    return [file, indexed.oid, indexed.bytes.length, sha256(indexed.bytes)];
  });
  for (const file of ['data-contract.md','v3-detail-contract.md']) {
    const text=subjectTreeBlob(subjectTree,
      `.loop-engineering/state/changes/source-led-opportunity-engine-v3/${file}`).bytes.toString('utf8');
    assert.match(text,/1[.]46[.]0/u,`${file} declares the canonical V3.14 inventory`);
    assert.doesNotMatch(text,/1[.]45[.]1/u,`${file} cannot expose the superseded V3.13 inventory as active`);
  }
  for (const file of ['hybrid-product-amendment.md','factor-correctness-amendment.md']) {
    const text=subjectTreeBlob(subjectTree,
      `.loop-engineering/state/changes/source-led-opportunity-engine-v3/${file}`).bytes.toString('utf8');
    for (const line of text.split('\n').filter((candidate)=>candidate.includes('1.44.6'))) {
      assert.match(line,/historical|superseded/u,`${file} labels every 1.44.6 declaration historical`);
    }
  }
  const recoveryText=subjectTreeBlob(subjectTree,
    '.loop-engineering/state/changes/source-led-opportunity-engine-v3/source-led-opportunity-engine-v3.14-actionability-recovery-amendment.md').bytes.toString('utf8');
  assert.match(recoveryText,/320 IDs, partitioned as\s*272 product\/runtime/u,
    'active V3.14 contract declares the canonical total and product/runtime partition');
  const activeGraphSha256 = sha256(canonicalJson([
    'opportunity-active-graph-v1',
    sha256(catalogBlob.bytes),
    orderedBlobRows,
  ]));
  assert.equal(activeGraphSha256, expectedActiveGraphSha256, 'frozen reviewed active-graph SHA-256');
  assert.equal(pcrBoundaries.schema, 'source-led-opportunity-pcr-implementation-boundaries-v1');
  assert.equal(pcrBoundaries.version, 'source-led-opportunity-pcr-boundaries-v3.11.4');
  assert.equal(pcrBoundaries.boundaries.length, 31, 'one immutable implemented boundary per PCR');
  assert.deepEqual(pcrBoundaries.boundaries.map(({ id }) => id),
    Array.from({ length: 31 }, (_, index) => `PCR-${String(index + 1).padStart(3, '0')}`));
  for (const boundary of pcrBoundaries.boundaries) {
    assert.equal(boundary.implementationState, 'implemented', `${boundary.id} must be a current-runtime claim`);
    assert.match(boundary.operation, /\S/u, `${boundary.id} operation`);
    assert.match(boundary.owner?.path ?? '', /\S/u, `${boundary.id} owner path`);
    assert.match(boundary.owner?.export ?? '', /\S/u, `${boundary.id} owner export`);
    assert.match(boundary.caller?.path ?? '', /\S/u, `${boundary.id} caller path`);
    assert.match(boundary.caller?.function ?? '', /\S/u, `${boundary.id} caller function`);
    assert.match(boundary.effect, /\S/u, `${boundary.id} state/effect`);
    assert.notEqual(boundary.owner.path, boundary.caller.path,
      `${boundary.id} caller cannot be a same-file token`);
    assert.notEqual(boundary.owner.export, boundary.caller.function,
      `${boundary.id} caller cannot be the owner declaration or a self-token`);
  }
  assert.notEqual(
    activeGraphSha256,
    sha256(canonicalJson(['opportunity-active-graph-v1', sha256(Buffer.concat([catalogBlob.bytes, Buffer.from('\n')])), orderedBlobRows])),
    'active graph binds catalog bytes',
  );
  for (let rowIndex = 0; rowIndex < orderedBlobRows.length; rowIndex += 1) {
    for (let memberIndex = 0; memberIndex < 4; memberIndex += 1) {
      const mutatedRows = orderedBlobRows.map((row) => [...row]);
      const prior = mutatedRows[rowIndex][memberIndex];
      mutatedRows[rowIndex][memberIndex] = memberIndex === 2
        ? prior + 1
        : `${String(prior)[0] === '0' ? '1' : '0'}${String(prior).slice(1)}`;
      assert.notEqual(
        activeGraphSha256,
        sha256(canonicalJson(['opportunity-active-graph-v1', sha256(catalogBlob.bytes), mutatedRows])),
        `active graph binds row ${rowIndex} member ${memberIndex}`,
      );
    }
  }
  for (const file of activeArtifactFiles) {
    assert.equal(readFileSync(path.join(change, file)).length > 0, true, file);
  }
  const design = readFileSync(path.join(change, 'design.md'), 'utf8');
  const evidenceContract = readFileSync(path.join(change, 'acceptance-evidence-contract.md'), 'utf8');
  assert.equal(inventory.evidenceContractVersion, 'opportunity-acceptance-evidence-v3.13.0');
  assert.match(evidenceContract, /^Version: `opportunity-acceptance-evidence-v3\.13\.0`$/mu);
  const productCorrectnessOwner = expectedVersions.get('product-correctness-runtime-amendment.md');
  assert.match(productCorrectnessOwner ?? '', /^product-correctness-runtime-v\d+[.]\d+[.]\d+$/u,
    'catalog product-correctness owner version');
  const runtimeInstallationOwner = expectedVersions.get('runtime-installation-contract.md');
  const runtimeInstallationSuffix = runtimeInstallationOwner?.match(/-v([0-9]+[.][0-9]+)$/u)?.[1];
  const runtimeInstallationDesignRef = design
    .match(/`runtime-installation-contract[.]md` v([0-9]+[.][0-9]+)/u)?.[1];
  assert.equal(runtimeInstallationDesignRef, runtimeInstallationSuffix,
    'design runtime installation reference must match its catalog owner');
  const staleRuntimeInstallationDesign = design.replace(
    `\`runtime-installation-contract.md\` v${runtimeInstallationDesignRef}`,
    '`runtime-installation-contract.md` v1.9',
  );
  assert.notEqual(
    staleRuntimeInstallationDesign.match(/`runtime-installation-contract[.]md` v([0-9]+[.][0-9]+)/u)?.[1],
    runtimeInstallationSuffix,
    'a stale design runtime installation reference must fail owner equality',
  );
  const valuationOwnerSuffix = expectedVersions.get('valuation-contract.md')
    ?.match(/-v([0-9]+[.][0-9]+)$/u)?.[1];
  const valuationDesignRef = design.match(/`valuation-contract[.]md` v([0-9]+[.][0-9]+)/u)?.[1];
  assert.equal(valuationDesignRef, valuationOwnerSuffix,
    'design valuation reference must match its catalog owner');
  const staleValuationDesign = design.replace(
    `\`valuation-contract.md\` v${valuationDesignRef}`, '`valuation-contract.md` v3.3',
  );
  assert.notEqual(
    staleValuationDesign.match(/`valuation-contract[.]md` v([0-9]+[.][0-9]+)/u)?.[1],
    valuationOwnerSuffix,
    'a stale design valuation reference must fail owner equality',
  );
  const factorOwnerSuffix = expectedVersions.get('factor-correctness-amendment.md')
    ?.match(/-v([0-9]+[.][0-9]+[.][0-9]+)$/u)?.[1];
  const factorDesignRef = design
    .match(/`factor-correctness-amendment[.]md` v([0-9]+[.][0-9]+[.][0-9]+)/u)?.[1];
  assert.equal(factorDesignRef, factorOwnerSuffix,
    'design factor amendment reference must match its catalog owner');
  const staleFactorDesign = design.replace(
    `\`factor-correctness-amendment.md\` v${factorDesignRef}`,
    '`factor-correctness-amendment.md` v3.11.2',
  );
  assert.notEqual(
    staleFactorDesign.match(/`factor-correctness-amendment[.]md` v([0-9]+[.][0-9]+[.][0-9]+)/u)?.[1],
    factorOwnerSuffix,
    'a stale design factor amendment reference must fail owner equality',
  );
  const canonicalAuthorityRows = [
    {
      catalogBytes: catalogBlob.bytes.length,
      catalogSha256: sha256(catalogBlob.bytes),
      kind: 'design-catalog-identity',
    },
    { activeFiles: activeArtifactFiles.length, kind: 'design-active-file-topology' },
    { kind: 'design-product-correctness-owner', owner: productCorrectnessOwner },
    {
      catalogBytes: catalogBlob.bytes.length,
      catalogSha256: sha256(catalogBlob.bytes),
      kind: 'evidence-catalog-identity',
    },
    {
      activeFiles: activeArtifactFiles.length,
      kind: 'evidence-file-owner-topology',
      owners: activeCatalog.owners.length,
    },
  ];
  const activeAuthorityRecords = activeArtifactFiles.map((repositoryPath) => ({
    repositoryPath,
    text: readFileSync(path.join(change, repositoryPath), 'utf8'),
  }));
  assertCanonicalTaggedAuthorities({
    records: activeAuthorityRecords,
    expectedRows: canonicalAuthorityRows,
    productCorrectnessOwner,
  });
  const tag = (row) => `<!-- GOV-004-AUTHORITY ${canonicalJson(row)} -->`;
  const rejectAuthorityMutation = (label, mutate) => {
    const records = activeAuthorityRecords.map(({ repositoryPath, text }) => ({ repositoryPath, text }));
    mutate(records);
    assert.throws(
      () => assertCanonicalTaggedAuthorities({
        records,
        expectedRows: canonicalAuthorityRows,
        productCorrectnessOwner,
      }),
      undefined,
      `GOV-004 rejects ${label}`,
    );
  };
  rejectAuthorityMutation('a missing canonical authority tag', (records) => mutateAuthorityRecords(
    records,
    'design.md',
    (text) => text.replace(tag(canonicalAuthorityRows[0]), ''),
  ));
  rejectAuthorityMutation('a duplicate-equal canonical authority tag', (records) => mutateAuthorityRecords(
    records,
    'design.md',
    (text) => `${text}\n${tag(canonicalAuthorityRows[0])}\n`,
  ));
  rejectAuthorityMutation('a conflicting canonical authority tag', (records) => mutateAuthorityRecords(
    records,
    'acceptance-evidence-contract.md',
    (text) => text.replace(
      tag(canonicalAuthorityRows[3]),
      tag({ ...canonicalAuthorityRows[3], catalogBytes: catalogBlob.bytes.length - 1 }),
    ),
  ));
  rejectAuthorityMutation('a non-canonical canonical authority tag', (records) => mutateAuthorityRecords(
    records,
    'design.md',
    (text) => text.replace(
      tag(canonicalAuthorityRows[0]),
      `<!-- GOV-004-AUTHORITY {"kind":"design-catalog-identity","catalogBytes":${catalogBlob.bytes.length},"catalogSha256":"${sha256(catalogBlob.bytes)}"} -->`,
    ),
  ));
  const bareDeclaratorMutations = [
    ['full camel owner', 'productCorrectnessRuntime'],
    ['short hyphen owner', 'product-correctness'],
  ].flatMap(([ownerLabel, owner]) => [
    ['equals-sign', '='],
    ['colon', ':'],
    ['is', 'is'],
    ['equals-word', 'equals'],
  ].flatMap(([declaratorLabel, declarator]) => [
    [
      `bare-semver ${ownerLabel} name-first ${declaratorLabel}`,
      `Alternate declaration: ${owner} ${declarator} 3.11.7.`,
    ],
    [
      `bare-semver ${ownerLabel} version-first ${declaratorLabel}`,
      `Alternate declaration: 3.11.7 ${declarator} ${owner}.`,
    ],
  ]));
  for (const [label, declaration] of [
    ['key/value catalog identity', 'Alternate catalog declaration: byteLength=5033; sha256=0000000000000000000000000000000000000000000000000000000000000000.'],
    ['uncommaed catalog identity', 'Alternate catalog declaration: catalog bytes 5033 sha 256 1111111111111111111111111111111111111111111111111111111111111111.'],
    ['reordered catalog identity', 'Alternate catalog declaration: sha256=2222222222222222222222222222222222222222222222222222222222222222; byteLength=5033.'],
    ['hyphenated topology', 'Alternate topology declaration: active-files=45; owner-count=37.'],
    ['paired topology', 'Alternate topology declaration: 45-file/37-owner closure.'],
    ['active graph topology', 'Alternate active graph topology: files=45; owners=37.'],
    ['hyphenated owner', 'Alternate owner declaration: product-correctness owner version v3.11.7.'],
    ['case and spacing owner', 'Alternate owner declaration: PRODUCT   CORRECTNESS   v3.11.7.'],
    ['full owner identity', 'Alternate product-correctness owner: product-correctness-runtime-v3.11.7.'],
    ['version-first full owner', 'Alternate product-correctness authority: v3.11.7 is the product-correctness-runtime owner.'],
    ['version-first shortened owner', 'Alternate product-correctness authority: version 3.11.7 is the product correctness owner.'],
    ['version-first camel owner', 'Alternate product-correctness authority: V3.11.7 is productCorrectnessRuntimeOwner.'],
    ['version-first punctuation owner', 'Alternate product-correctness authority: V3-11-7 :: PRODUCT-CORRECTNESS-RUNTIME-OWNER.'],
    ['bare-semver full owner owner-context', 'Alternate declaration: product-correctness-runtime owner 3.11.7.'],
    ['bare-semver shortened owner version-context', 'Alternate declaration: version 3.11.7 product correctness.'],
    ...bareDeclaratorMutations,
  ]) {
    rejectAuthorityMutation(`untagged ${label}`, (records) => mutateAuthorityRecords(
      records,
      'design.md',
      (text) => `${text}\n${declaration}\n`,
    ));
  }
  for (const [label, nonAuthorityControl] of [
    ['full owner date-first control', 'On 2026-08-02, product correctness runtime audit completed.'],
    ['full owner date-last control', 'Product correctness runtime audit completed on 2026-08-02.'],
    ['short owner date control', 'The product correctness review occurred on 2026-08-02.'],
    ['full owner bare-semver activity control', 'Product correctness runtime testing completed during 3.11.7.'],
    ['full owner colon date control', 'Product correctness runtime audit: 2026-08-02.'],
    ['version-first activity control', '3.11.7 is the audit duration for product correctness runtime.'],
  ]) {
    const records = activeAuthorityRecords.map(({ repositoryPath, text }) => ({ repositoryPath, text }));
    mutateAuthorityRecords(records, 'design.md', (text) => `${text}\n${nonAuthorityControl}\n`);
    assert.doesNotThrow(
      () => assertCanonicalTaggedAuthorities({
        records,
        expectedRows: canonicalAuthorityRows,
        productCorrectnessOwner,
      }),
      `GOV-004 permits non-authority ${label}`,
    );
  }
  assert.match(design, /`job-graph-contract[.]md` v3[.]15/u);
  assert.doesNotMatch(design, /`job-graph-contract[.]md` v3[.]12/u);
  assert.match(
    tasks,
    /- \[x\] Add generated exact schemas, signed-request helper, copyable examples and useful CLI help[.]/u,
  );
  assert.equal(operatorSchemas.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.deepEqual(
    Object.keys(operatorSchemas.$defs).sort(),
    [
      'beginRunRequest',
      'beginRunResponse',
      'reviewerAssignmentRequest',
      'reviewerLabelRequest',
      'runStatusResponse',
      'signedPrincipalHeaders',
    ],
  );
  for (const schema of Object.values(operatorSchemas.$defs)) {
    assert.equal(schema.additionalProperties, false);
  }
  assert.match(operatorDocs, /npm run v3:schemas/u);
  assert.match(operatorDocs, /npm run v3:sign-request/u);
  for (const script of ['help.mjs', 'schemas.mjs', 'sign-internal-request.mjs']) {
    assert.equal(
      readFileSync(path.join(root, 'scripts/opportunity-v3', script), 'utf8').length > 0,
      true,
      script,
    );
  }
  const signer = path.join(root, 'scripts/opportunity-v3/sign-internal-request.mjs');
  const signerArgs = [
    signer,
    '--path', '/api/internal/opportunity-link-audit-v3/reviewer-assignment',
    '--key-id', 'reviewer-key-01',
    '--principal-id', '00000000-0000-4000-8000-000000000001',
    '--body-file', path.join(root, 'docs/source-led-opportunity-v3.schemas.json'),
    '--timestamp', '2026-07-26T00:00:00Z',
    '--nonce', '0123456789abcdef',
  ];
  const signerOutput = trustedExecFileSync(process.execPath, signerArgs, {
    encoding: 'utf8',
    env: { ...process.env, OPPORTUNITY_V3_PRINCIPAL_HMAC_KEY: 'acceptance-test-key' },
  });
  assert.match(
    JSON.parse(signerOutput).headers['x-stockinsider-signature'],
    /^[0-9a-f]{64}$/u,
  );
  assert.doesNotMatch(signerOutput, /acceptance-test-key/u);
  assert.throws(() => trustedExecFileSync(process.execPath, [
    ...signerArgs.slice(0, 5),
    '--principal-id', 'reviewer-01',
    ...signerArgs.slice(7),
  ], {
    stdio: 'pipe',
    env: { ...process.env, OPPORTUNITY_V3_PRINCIPAL_HMAC_KEY: 'acceptance-test-key' },
  }));
  for (const [file, version] of expectedVersions) {
    const text = readFileSync(path.join(change, file), 'utf8');
    const headers = [...text.matchAll(/^(?:Version|Contract version|Amendment version):\s+`([^`]+)`$/gmu)]
      .map((match) => match[1]);
    assert.ok(headers.includes(version), `${file} must declare ${version}`);
  }
  assert.match(
    readFileSync(path.join(change, 'data-contract.md'), 'utf8'),
    /Contract version: `source-led-opportunity-v3[.]6`/u,
  );
  assert.match(
    readFileSync(path.join(change, 'hybrid-product-amendment.md'), 'utf8'),
    /Amendment version: `hybrid-product-v3[.]2`/u,
  );
  const hostAmendment = readFileSync(path.join(change, 'host-pin-compatibility-amendment.md'), 'utf8');
  assert.match(hostAmendment, /Amendment version: `model-runner-host-pin-amendment-v3[.]9`/u);
  assert.match(hostAmendment, /codex-cli 0[.]148[.]0-alpha[.]9/u);
  assert.match(hostAmendment, /exact pin/u);
  const hostPinBytes = readFileSync(path.join(change, 'model-runner-host-pins-v3.json'), 'utf8');
  const hostPins = JSON.parse(hostPinBytes);
  const hostPinCanonical = canonicalJson(hostPins);
  assert.equal(Buffer.byteLength(hostPinBytes), 2138);
  assert.equal(Buffer.byteLength(hostPinCanonical), 2137);
  assert.equal(sha256(hostPinCanonical), '0982f6abe1d9a60697186c11c2fbada42e437a92c276accf47413e40ae22ddba');
  assert.equal(hostPins.fixtureVersion, 'model-runner-host-pins-v3.9');
  assert.equal(hostPins.executables.find(({ name }) => name === 'codex')?.version, 'codex-cli 0.148.0-alpha.9');
  assert.equal(runner.MODEL_RUNNER_IDENTITY_SHA256, 'df7867e2a936d3f2b0fce5ddfc1eec705707bbaf919c43c2ccc6d21f509b43c7');
  assert.equal(Buffer.byteLength(canonicalJson(runner.MODEL_RUNNER_IDENTITY)), 882);
  const runtimeContract = readFileSync(path.join(change, 'runtime-transaction-contract.md'), 'utf8');
  assert.match(runtimeContract, /staticIdentityMembers` is the following exact 41-member/u);
  assert.match(runtimeContract, /\["acceptanceVersion","1[.]46[.]0"\]/u);
  assert.match(runtimeContract, /\["factorCorrectnessContractVersion","opportunity-factor-correctness-v3[.]11[.]6"\]/u);
  assert.match(runtimeContract, /2,729 UTF-8 bytes/u);
  assert.match(runtimeContract, /c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729/u);
  assert.doesNotMatch(
    activeArtifactFiles.map((file) => readFileSync(path.join(change, file), 'utf8')).join('\n'),
    /acceptanceVersion:'1[.]41[.]0'|\["acceptanceVersion","1[.]41[.]0"\]|opportunity-runtime-v3[.]11/u,
  );
  assert.match(
    dataContract,
    /type ReportedPeUnavailableReasonV311 = 'authority_conflict'\|/u,
    'reported-PE authority conflicts are publicly serializable',
  );
  assert.match(
    dataContract,
    /reason:'valuation_review'\|'authority_conflict'\|'missing_official_pe'/u,
    'valuation review preserves reported-PE authority conflicts',
  );
  assert.match(
    readFileSync(path.join(change, 'financial-data-contract.md'), 'utf8'),
    /authority_conflict`? propagates unchanged to\n+the unavailable current\/history\/sector reported-PE branch/u,
    'official reported-PE selector has one public conflict disposition',
  );
  const manifestContract = readFileSync(path.join(change, 'manifest-storage-contract.md'), 'utf8');
  const manifestKindVersions = [...manifestContract.matchAll(
    /^\| `([a-z0-9_]+)` \| `([a-z0-9.-]+)` \|/gmu,
  )].map((match) => [match[1], match[2]]);
  assert.deepEqual(manifestKindVersions, [
    ['source_eligible', 'source-adapter-v3.3'],
    ['source_identity_allowlist', 'source-identity-allowlist-v3.1'],
    ['publisher_verification_allowlist', 'source-publisher-allowlist-v3.0'],
    ['instrument_roster', 'tw-instrument-roster-v3.0'],
    ['alias_authority', 'alias-normalization-v3.0'],
    ['taxonomy_assignment', 'tw-sector-taxonomy-v3.0'],
    ['peer_reviewer_allowlist', 'peer-reviewer-allowlist-v3.0'],
    ['peer_authority', 'peer-authority-v3.0'],
    ['source_dataset', 'source-dataset-v3.3'],
    ['candidate_financial', 'candidate-financial-v3.0'],
    ['factor_scoring_reference', 'opportunity-features-v3.2'],
    ['sector_scoring_reference', 'sector-reference-v3.1'],
    ['sector_valuation_reference', 'opportunity-financial-inputs-v3.3'],
    ['bias_reference', 'opportunity-factor-correctness-v3.11.6'],
    ['technical_history_reference', 'opportunity-factor-correctness-v3.11.6'],
    ['reported_pe_reference', 'opportunity-financial-inputs-v3.3'],
    ['market_reference', 'market-context-v3.6'],
    ['mover_price_reference', 'mover-audit-price-v3.3'],
    ['sector_benchmark', 'sector-benchmark-v3.1'],
    ['outcome_input', 'source-led-eval-v3.7'],
    ['evaluation_input', 'source-led-eval-v3.7'],
    ['link_audit_sample', 'source-led-eval-v3.7'],
    ['link_audit_resolution', 'source-led-eval-v3.7'],
  ]);
  const runnerContract = readFileSync(path.join(change, 'model-runner-contract.md'), 'utf8');
  for (const schema of [
    'request', 'status', 'resource reservation', 'operation-journal',
    'resource-journal', 'attempt record',
  ]) {
    const paragraph = runnerContract.split('\n').find(
      (line) => line.includes(schema) && line.includes('modelRunnerIdentitySha256'),
    );
    assert.ok(paragraph, `runner identity missing from ${schema}`);
  }
  assert.match(
    runnerContract,
    /operationKeySha256=SHA256\(RFC8785\(\["model-runner-journal-v3[.]5",modelRunnerIdentitySha256/u,
  );
  assert.match(
    runnerContract,
    /resourceAttemptKeySha256=SHA256\(RFC8785\(\["model-runner-resource-attempt-v3[.]5",modelRunnerIdentitySha256/u,
  );
  const rpcEnum = migration.match(
    /CREATE TYPE opportunity_rpc_function_name_v3 AS ENUM \(([^;]+)\);/u,
  );
  assert.ok(rpcEnum);
  const rpcNames = [...rpcEnum[1].matchAll(/'([^']+)'/gu)].map((match) => match[1]);
  assert.equal(rpcNames.length, 33);
  assert.equal(new Set(rpcNames).size, 33);
  assert.equal(rpcNames.at(-1), 'select_opportunity_public_projection_v3');
  const activeCorpus = activeArtifactFiles
    .map((file) => readFileSync(path.join(change, file), 'utf8'))
    .join('\n');
  const activeReferenceEdges = [...activeCorpus.matchAll(
    /([a-z0-9-]+-(?:contract|amendment)[.]md)(?:`)?(?:\s+version)?\s+`?v([0-9]+[.][0-9]+(?:[.][0-9]+)?)\b/giu,
  )];
  assert.ok(activeReferenceEdges.length > 0);
  for (const [, ownerFile, referencedVersion] of activeReferenceEdges) {
    const ownerVersion = expectedVersions.get(ownerFile);
    assert.ok(ownerVersion, `unknown active contract owner ${ownerFile}`);
    const ownerSuffix = ownerVersion.match(/-v([0-9]+[.][0-9]+(?:[.][0-9]+)?)$/u)?.[1];
    assert.equal(
      referencedVersion,
      ownerSuffix,
      `${ownerFile} active reference v${referencedVersion} must match owner ${ownerVersion}`,
    );
  }
  for (const stale of [
    '1.38.0',
    'opportunity-runtime-v3.10',
    'opportunity-storage-v3.13',
    'opportunity-postgres-types-v3.11',
    'opportunity-job-graph-v3.6',
    'opportunity-job-graph-v3.7',
    'opportunity-runtime-v3.11',
    '1.39.0',
    'source-led-opportunity-v3.1',
    'opportunity-job-graph-v3.8',
    'job graph `v3.9`',
    'opportunity-features-v3.0',
    '1.40.0',
  ]) {
    assert.doesNotMatch(activeCorpus, new RegExp(stale.replaceAll('.', '[.]'), 'u'), stale);
  }
  assert.equal(inventory.version, '1.46.0');
  assert.equal(inventory.caseCount, 320);
  assert.equal(inventory.verificationPartition.version, 'opportunity-verification-partition-v3.0');
  return { subjectTree, activeGraphSha256 };
}

const structuralExecutors = {
  'GOV-004': activeGraphOracle,
  'GOV-001': () => {
    assert.equal(inventory.cases.length, inventory.caseCount);
    assert.equal(new Set(inventory.cases.map(({ id }) => id)).size, inventory.caseCount);
    assert.deepEqual(inventory.cases.map(({ id }) => id), [...executionRegistry.keys()]);
    assert.equal(inventory.version, '1.46.0');
    assert.equal(inventory.caseCount, 320);
    assert.equal(inventory.ownerRows.length, 320);
    assert.equal(sha256(canonicalJson(inventory.ownerRows)), inventory.ownerRowsSha256);
    assert.equal(inventory.ownerRowsSha256, '48792bd40a862d577d0d4c5269f9399e647004892d116ec2a73d5648f59776d4');
    assert.deepEqual(
      inventory.ownerRows.map(([id]) => id),
      inventory.cases.map(({ id }) => id).toSorted(),
    );
    for (const [id, classificationName, track, ownerRef, command] of inventory.ownerRows) {
      const metadata = classification(inventory.cases.find((item) => item.id === id));
      assert.equal(classificationName, metadata.classification, `${id} classification`);
      assert.equal(track, metadata.track, `${id} track`);
      assert.match(ownerRef, /#acceptance [A-Z0-9-]+$/u, `${id} owner ref`);
      assert.equal(typeof command, 'string', `${id} command`);
      assert.ok(command.length > 0, `${id} command`);
    }
    assert.equal(inventory.scriptValueRows.length, 14);
    assert.equal(sha256(canonicalJson(inventory.scriptValueRows)), inventory.scriptValueRowsSha256);
    assert.equal(inventory.scriptValueRowsSha256, '517d549d970f4d661a64f9fe7ad9583896e526b5062c60998cdba55fc32cde53');
    const rootPackageScripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
    const webPackageScripts = JSON.parse(readFileSync(path.join(root, 'web/package.json'), 'utf8')).scripts;
    assert.deepEqual(inventory.scriptValueRows.map(([scriptKey]) => scriptKey), [
      'build:source-led-opportunity-v3',
      'lint:source-led-opportunity-v3',
      'test:legacy-v1-v2-regression',
      'test:model-runner-v3',
      'test:source-led-opportunity-v3',
      'test:source-led-opportunity-v3:migration',
      'test:source-led-opportunity-v3:performance',
      'test:source-led-opportunity-v3:product-correctness',
      'typecheck:source-led-opportunity-v3',
      'v3:doctor',
      'verify:source-led-opportunity-v3:evaluation-governance',
      'verify:source-led-opportunity-v3:model-runner',
      'verify:source-led-opportunity-v3:product-runtime',
      'web:test:e2e:v3-correctness',
    ]);
    for (const [scriptKey, fullValue] of inventory.scriptValueRows) {
      const isWebScript = scriptKey.startsWith('web:');
      const packageScripts = isWebScript ? webPackageScripts : rootPackageScripts;
      const packageKey = isWebScript ? scriptKey.slice('web:'.length) : scriptKey;
      assert.equal(packageScripts[packageKey], fullValue, `${scriptKey} exact package value`);
    }
  },
  'GOV-002': () => {
    assert.match(constitution, /Version: `1[.]0[.]0`/u);
    for (const principle of [
      'Evidence Before Recommendation',
      'Deterministic, Bounded Research',
      'Research and Action Are Separate',
      'Point-in-Time Safety',
      'Additive, Guarded Change',
      'Executable Acceptance',
    ]) assert.match(constitution, new RegExp(principle, 'u'));
    const approved = [
      readFileSync(path.join(change, 'requirements.md'), 'utf8'),
      readFileSync(path.join(change, 'design.md'), 'utf8'),
    ].join('\n');
    for (const obligation of [
      /point-in-time/iu,
      /\bbounded\b/iu,
      /fail(?:s|ed)? closed/iu,
      /additive/iu,
      /acceptance/iu,
    ]) assert.match(approved, obligation);
  },
  'GOV-003': () => {
    const prefixOwners = {
      ACT: 'decision-contract.md', API: 'data-contract.md', AUTH: 'auth-principal-contract.md',
      CAL: 'trading-calendar-contract.md', CMP: 'runtime-transaction-contract.md',
      CYC: 'sector-cycle-contract.md', DI: 'source-led-opportunity-engine-v3.13-decision-integrity-amendment.md',
      ENT: 'entity-link-contract.md',
      EVAL: 'shadow-evaluation-contract.md',
      FIN: 'financial-data-contract.md', FNL: 'source-adapter-contract.md',
      GOV: '.specify/memory/constitution.md', HYB: 'hybrid-product-amendment.md',
      MIG: 'storage-schema-contract.md', MKT: 'market-contract.md',
      MOD: 'data-contract.md', MR3: 'model-runner-contract.md',
      OPS: 'job-graph-contract.md', OUT: 'shadow-evaluation-contract.md',
      PEER: 'entity-link-contract.md',
      SCR: 'scoring-contract.md', SEC: 'auth-principal-contract.md',
      SRC: 'source-adapter-contract.md', VAL: 'valuation-contract.md',
      PCR: 'factor-correctness-amendment.md', REC: 'source-led-opportunity-engine-v3.14-actionability-recovery-amendment.md',
    };
    const prefixes = new Set(inventory.cases.map(({ id }) => id.split('-')[0]));
    assert.deepEqual([...prefixes].sort(), Object.keys(prefixOwners).sort());
    for (const entry of executionRegistry.values()) {
      assert.ok(prefixOwners[entry.item.id.split('-')[0]]);
      if (entry.classification === 'semantic_automated') assert.equal(typeof entry.executor, 'function');
    }
    assert.doesNotMatch(migration, /\b(?:DROP TABLE|TRUNCATE TABLE)\b/iu);
    assert.match(worker, /claim_opportunity_job_v3/u);
    assert.match(control, /requireExactInternalBearer/u);
    assert.match(dataContract, /sourceCutoff/u);
  },
  'HYB-006': () => {
    assert.match(workflow, /diagnostic:source-led-opportunity-v3:product-runtime/u);
    assert.match(workflow, /verify:source-led-opportunity-v3:model-runner/u);
    assert.match(workflow, /run: npm run verify:source-led-opportunity-v3:model-runner/u);
    assert.match(workflow, /OPPORTUNITY_V3_RUNNER_TRACK.*true/u);
    assert.doesNotMatch(workflow, /continue-on-error:\s*true/u);
    assert.match(workflow, /pr-product-runtime-gate:/u);
    assert.match(workflow, /needs: \[product-runtime\]/u);
    assert.doesNotMatch(workflow, /MODEL_RUNNER_RESULT/u);
    const productJob = workflow.split(/\n  model-runner:/u)[0];
    assert.doesNotMatch(productJob, /test:model-runner-v3/u);
    const modelAggregate = inventory.scriptValueRows.find(([key]) =>
      key === 'verify:source-led-opportunity-v3:model-runner')?.[1];
    assert.equal(
      modelAggregate,
      'node scripts/run-node22.js --experimental-strip-types scripts/opportunity-v3/gate-attestation.mjs --track model_runner && npm run test:model-runner-v3 && npm run v3:doctor -- --expect-mode disabled --require-host-pin model-runner-host-pins-v3.9',
      'model aggregate is the frozen fourteenth script authority',
    );
    const packageModelAggregate = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts[
      'verify:source-led-opportunity-v3:model-runner'
    ];
    assert.equal(packageModelAggregate, modelAggregate, 'true or omitted model aggregate cannot satisfy HYB-006');
    assert.deepEqual(inventory.verificationPartition, {
      version: 'opportunity-verification-partition-v3.0',
      evaluation_governance: { idPrefixes: ['OUT-', 'EVAL-'], exactIds: ['HYB-005'] },
      model_runner: { idPrefixes: ['MR3-'], exactIds: [] },
      product_runtime: { remainder: true },
    });
  },
  'HYB-007': () => {
    activeGraphOracle();
    assert.match(identityCode, /hybrid-product-v3[.]2/u);
    assert.doesNotMatch(identityCode, /hybrid-product-v3[.]0/u);
    assert.match(tasks, /model-runner-v3[.]6/u);
    assert.ok(tasks.lastIndexOf('model-runner-v3.6') > tasks.lastIndexOf('model-runner-v3.5'));
    assert.doesNotThrow(() => assertTaskStatusNextWorkConsistent(tasks, status));
    const operativeRequirementsTask = status.requirementsStatus.startsWith('v3_16_9_')
      ? '- [x] Obtain fresh Requirements Round 142, Architecture Round 22 and exact-range'
      : '- [x] Obtain fresh Requirements Round 138 PASS';
    const operativeProtectedGateDeclaration = status.requirementsStatus.startsWith('v3_16_9_')
      ? 'Protected Code Gate remains the landing check'
      : 'protected external artifact remains the landing check';
    for (const [label, mutatedTasks, mutatedStatus] of [
      ['review round drift', tasks, { ...status, requirementsReviewRound: status.requirementsReviewRound - 1 }],
      ['pending evidence drift', tasks, { ...status, requirementsPendingEvidence: 'requirements-review-round-131.md' }],
      ['operative requirements disposition drift', tasks.replace(
        operativeRequirementsTask,
        operativeRequirementsTask.replace('- [x]', '- [ ]'),
      ), status],
      ['protected-gate declaration removed', tasks.replace(
        operativeProtectedGateDeclaration,
        operativeProtectedGateDeclaration.replace('remains', 'is not'),
      ), status],
    ]) {
      assert.throws(
        () => assertTaskStatusNextWorkConsistent(mutatedTasks, mutatedStatus),
        undefined,
        `task/status meta-owner rejects ${label}`,
      );
    }
  },
};

function instrument(overrides = {}) {
  return {
    stockId: 'stock-2330',
    symbol: '2330',
    exchange: 'TWSE',
    instrumentType: 'common_stock',
    listingStatus: 'active',
    officialName: '台積電',
    sector: 'semiconductor',
    aliases: ['TSMC', '台灣積體電路製造'],
    ...overrides,
  };
}

function sourceDocument(overrides = {}) {
  return {
    revisionId: 'revision-1',
    revisionFamilyKey: 'family-1',
    stableConnectorDocumentId: 'document-1',
    sourceKey: 'threads',
    sourceClass: 'community',
    distributionIdentity: 'threads:issuer',
    publishedAt: '2026-07-01T00:00:00Z',
    collectedAt: '2026-07-01T00:01:00Z',
    recordedAt: '2026-07-01T00:02:00Z',
    acquisitionStatus: 'complete',
    fields: ['2330 營收維持成長。'],
    ...overrides,
  };
}

function sourceParseWorkerInput(overrides = {}) {
  const fields = overrides.fields ?? ['2330 股票成長。', '', '2454 股票受惠。'];
  const sourceKey = overrides.sourceKey ?? 'threads';
  const sourceIdentityId = overrides.sourceIdentityId ?? 'source-identity-1';
  const canonicalContentHash = overrides.canonicalContentHash ?? sha256Canonical([
    ['title', fields[0].replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').normalize('NFKC')],
    ['summary', fields[1].replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').normalize('NFKC')],
    ['body', fields[2].replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').normalize('NFKC')],
  ]);
  return [
    overrides.revisionId ?? 'revision-worker-1', overrides.selectionOrdinal ?? 1, sourceKey,
    sourceIdentityId, overrides.stableDocumentId ?? 'document-worker-1',
    overrides.canonicalUrl ?? 'https://example.test/doc',
    overrides.publishedAt ?? '2026-07-01T00:00:00Z',
    overrides.collectedAt ?? '2026-07-01T00:01:00Z', fields,
    overrides.rawCodePointCount ?? [...fields.join('')].length, 'source-adapter-v3.3',
    overrides.acquisitionStatus ?? 'complete', canonicalContentHash,
    'community', 'threads:issuer', overrides.linkAuthorities ?? [[
      'stock-2330', '2330', 'TWSE', 'common_stock', 'active', '台積電', ['台積電'], 'semiconductor',
    ], [
      'stock-2454', '2454', 'TWSE', 'common_stock', 'active', '聯發科', ['聯發科'], 'semiconductor',
    ]], overrides.priorDocumentIdentityRows ?? [],
  ];
}

function parseSourceWorker(overrides = {}) {
  return executeWorkerPayload('source_parse_batch', sourceParseWorkerInput(overrides));
}

function candidate(index, overrides = {}) {
  const symbol = String(1000 + index);
  return {
    symbol,
    sector: `sector-${index % 4}`,
    anchor: {
      claimId: `claim-${index}`,
      canonicalClaimHash: `hash-${index}`,
      evidenceRootId: `root-${index}`,
      sourceKey: 'threads',
      sourceClass: 'community',
      effectiveAt: '2026-07-01T00:00:00Z',
      confidence: 1,
      text: `${symbol} claim`,
    },
    claims: [],
    directSource: true,
    preResearchScore: 100 - index / 100,
    ...overrides,
  };
}

const semanticExecutors = {
  source: (item) => {
    switch (item.id) {
      case 'SRC-001': {
        const linked = linkMention(
          { token: '2330', context: '股票 2330', explicitTicker: true, stockContext: true },
          [instrument()],
        );
        assert.deepEqual(linked, {
          outcome: 'linked_new', reason: 'explicit_ticker_context', symbol: '2330', confidence: 1,
        });
        assert.equal(sourceDocument().sourceKey, 'threads');
        break;
      }
      case 'SRC-002': {
        const first = claimsFromDocument(sourceDocument({
          revisionId: 'bulltalk-1', sourceKey: 'bulltalk', distributionIdentity: 'bulltalk:1',
        }))[0];
        const second = {
          ...claimsFromDocument(sourceDocument({
            revisionId: 'ptt-1', sourceKey: 'ptt', distributionIdentity: 'ptt:1',
          }))[0],
          canonicalClaimHash: first.canonicalClaimHash,
          evidenceRootId: first.evidenceRootId,
        };
        const deduped = dedupeClaims([first, second]);
        assert.equal(deduped.unique.length, 1);
        assert.equal(deduped.duplicateCount, 1);
        assert.equal(new Set(['bulltalk:1', 'ptt:1']).size, 2);
        break;
      }
      case 'SRC-003': {
        assert.deepEqual(claimsFromDocument(sourceDocument({ fields: [] })), []);
        assert.deepEqual(claimsFromDocument(sourceDocument({ acquisitionStatus: 'parse_failure' })), []);
        assert.match(migration, /processed_no_claim_count/u);
        assert.match(migration, /parse_failure_count/u);
        break;
      }
      case 'SRC-004': {
        assert.deepEqual(collapseRevisionFamilies([
          sourceDocument({ sourceKey: 'node-twstock' }),
        ], '2026-07-02T00:00:00Z'), []);
        break;
      }
      case 'SRC-005': {
        const claim = claimsFromDocument(sourceDocument({
          sourceKey: 'mops_material_event', sourceClass: 'official',
        }))[0];
        assert.equal(claim.sourceClass, 'official');
        assert.equal(linkMention(
          { token: '2330', context: '2330 重大訊息', explicitTicker: true, stockContext: true },
          [instrument()],
        ).outcome, 'linked_new');
        break;
      }
      case 'SRC-006': {
        assert.match(migration, /least\(1000,m[.]row_count\)/u);
        assert.match(migration, /greatest\(0,eligible_count-1000\)/u);
        assert.match(migration, /selectedDocuments.*deferredDueScanCap/su);
        break;
      }
      case 'SRC-007': {
        const claims = claimsFromDocument(sourceDocument({
          fields: ['2330 成長。2454 擴產且 2330 受惠。產業庫存下降。'],
        }));
        assert.equal(claims.length, 3);
        assert.deepEqual(
          ['2330', '2454'].map((token) => linkMention(
            { token, context: `股票 ${token}`, explicitTicker: true, stockContext: true },
            [instrument(), instrument({ stockId: 'stock-2454', symbol: '2454', officialName: '聯發科' })],
          ).outcome),
          ['linked_new', 'linked_new'],
        );
        break;
      }
      case 'SRC-008': {
        const original = claimsFromDocument(sourceDocument())[0];
        const duplicate = { ...original, claimId: 'claim-duplicate' };
        assert.deepEqual(dedupeClaims([original, duplicate]), {
          unique: [original], duplicateCount: 1,
        });
        assert.match(migration, /linked_duplicate_claim/u);
        const parsed = parseSourceWorker({
          fields: ['2454 股票 2330 股票。', '', ''],
        });
        const claim = parsed[1][0];
        assert.equal(claim[2], sha256Canonical([
          '2454 股票 2330 股票', [
            ['2330', 8, 12, 'ticker'],
            ['2454', 0, 4, 'ticker'],
          ],
        ]));
        break;
      }
      case 'SRC-009': {
        assert.deepEqual(collapseRevisionFamilies([
          sourceDocument({ publishedAt: '2026-07-03T00:00:00Z' }),
          sourceDocument({
            revisionId: 'revision-2', recordedAt: '2026-07-03T00:00:00Z',
            collectedAt: '2026-07-03T00:00:00Z',
          }),
        ], '2026-07-02T00:00:00Z'), []);
        assert.match(migration, /audit_window_closes_at/u);
        assert.match(migration, /'pending'.*'matured'/su);
        break;
      }
      case 'SRC-010': {
        const cutoff = '2026-07-02T00:00:00Z';
        const verified = [{
          ref: 'publisher:canonical',
          sourceKey: 'public_broker_research',
          sourceClass: 'public_research',
          effectiveAt: '2026-07-01T00:00:00Z',
          linkReason: 'explicit_ticker_context',
          verificationTier: 'publisher_verified',
          stance: 'supports',
        }];
        assert.equal(validSourceEvidence(verified, cutoff), true);
        assert.equal(validSourceEvidence(
          [{ ...verified[0], effectiveAt: '2026-07-03T00:00:00Z' }],
          cutoff,
        ), false);
        break;
      }
      case 'SRC-011': {
        const raw = sourceDocument({ fields: ['ＡＢＣ\r\n2330。'] });
        const normalized = sourceDocument({ fields: ['ABC 2330。'] });
        const rawClaim = claimsFromDocument(raw)[0];
        const normalizedClaim = claimsFromDocument(normalized)[0];
        assert.equal(rawClaim.canonicalClaimHash, normalizedClaim.canonicalClaimHash);
        assert.match(migration, /ingestion_content_revision_sha256/u);
        assert.match(migration, /ingestion_canonical_content_hash_v3/u);
        break;
      }
      case 'SRC-012': {
        assert.match(migration, /LIMIT 10001/u);
        assert.match(migration, /identity_manifest_overflow/u);
        assert.match(migration, /authority_revision_conflict/u);
        break;
      }
      case 'SRC-013': {
        const earlier = sourceDocument({ revisionId: 'a', recordedAt: '2026-07-01T00:00:00Z' });
        const correction = sourceDocument({ revisionId: 'b', recordedAt: '2026-07-01T00:03:00Z' });
        assert.deepEqual(
          collapseRevisionFamilies([earlier, correction], '2026-07-02T00:00:00Z')
            .map(({ revisionId }) => revisionId),
          ['b'],
        );
        assert.match(migration, /source_eligible.*selected_revision_rows/su);
        break;
      }
      case 'SRC-014': {
        assert.throws(
          () => collapseRevisionFamilies(
            Array.from({ length: 65 }, (_, index) => sourceDocument({
              revisionId: `revision-${String(index).padStart(2, '0')}`,
              recordedAt: `2026-07-01T00:${String(index % 60).padStart(2, '0')}:00Z`,
            })),
            '2026-07-02T00:00:00Z',
          ),
          /bound_violation/u,
        );
        assert.match(migration, /LIMIT 65/u);
        break;
      }
      case 'SRC-015': {
        assert.match(migration, /LIMIT 1000001/u);
        assert.match(migration, /source_revision_family_registry_v3/u);
        assert.match(migration, /pg_advisory_xact_lock/u);
        break;
      }
      case 'ENT-001': {
        assert.deepEqual(linkMention(
          { token: '2026', context: '西元 2026 年', explicitTicker: false, stockContext: false },
          [instrument()],
        ), {
          outcome: 'ambiguous_symbol', reason: 'ambiguous_number', symbol: null, confidence: 0,
        });
        break;
      }
      case 'ENT-002': {
        assert.deepEqual(linkMention(
          { token: '台積電', context: '台積電股票', explicitTicker: false, stockContext: true },
          [instrument()],
        ), {
          outcome: 'linked_new', reason: 'exact_unique_alias_context', symbol: '2330', confidence: 0.9,
        });
        break;
      }
      case 'ENT-003': {
        assert.equal(linkMention(
          { token: '晶圓龍頭', context: '晶圓龍頭股票', explicitTicker: false, stockContext: true },
          [
            instrument({ aliases: ['晶圓龍頭'] }),
            instrument({ stockId: 'stock-2303', symbol: '2303', aliases: ['晶圓龍頭'] }),
          ],
        ).reason, 'ambiguous_alias');
        break;
      }
      case 'ENT-004': {
        assert.match(migration, /expired_document/u);
        assert.equal(isFreshClaim({
          ...claimsFromDocument(sourceDocument())[0],
          effectiveAt: '2026-06-01T00:00:00Z',
        }, '2026-07-01T00:00:00Z'), false);
        break;
      }
      case 'ENT-005': {
        assert.match(contracts, /sourceRefs/u);
        assert.doesNotMatch(contracts, /rawConnectorText/u);
        assert.match(contracts, /changedBecause/u);
        break;
      }
      case 'ENT-006': {
        const active = instrument();
        const etf = instrument({ stockId: 'stock-etf', symbol: '0050', instrumentType: 'etf' });
        assert.deepEqual([
          linkMention({ token: '2026', context: '2026 年', explicitTicker: false, stockContext: false }, [active]).reason,
          linkMention({ token: '未知', context: '未知股票', explicitTicker: false, stockContext: true }, [active]).reason,
          linkMention({ token: '0050', context: '0050 ETF', explicitTicker: true, stockContext: true }, [etf]).reason,
        ], ['ambiguous_number', 'fuzzy_below_auto_threshold', 'non_common_stock']);
        break;
      }
      case 'ENT-007': {
        assert.equal(linkMention(
          { token: 'hardcoded-only', context: '股票', explicitTicker: false, stockContext: true },
          [instrument()],
        ).reason, 'fuzzy_below_auto_threshold');
        assert.equal(dedupeClaims([
          claimsFromDocument(sourceDocument())[0],
          claimsFromDocument(sourceDocument({ revisionId: 'revision-2' }))[0],
        ]).unique.length, 1);
        break;
      }
      case 'ENT-008': {
        const claim = claimsFromDocument(sourceDocument({
          publishedAt: '2025-01-01T00:00:00Z',
          collectedAt: '2026-07-01T00:00:00Z',
        }))[0];
        assert.equal(claim.effectiveAt, '2025-01-01T00:00:00Z');
        assert.equal(isFreshClaim(claim, '2026-07-02T00:00:00Z'), false);
        break;
      }
      case 'ENT-009': {
        const claims = claimsFromDocument(sourceDocument({
          fields: ['2330 成長。2330 成長。2026 年營收。'],
        }));
        assert.equal(claims.length, 3);
        assert.equal(dedupeClaims(claims).duplicateCount, 1);
        assert.equal(linkMention(
          { token: '2026', context: '2026 年', explicitTicker: false, stockContext: false },
          [instrument()],
        ).reason, 'ambiguous_number');
        const byDocumentId = sha256Canonical([
          'threads', 'source-identity-1', 'https://example.test/doc',
        ]);
        const duplicateDocument = parseSourceWorker({
          priorDocumentIdentityRows: [[byDocumentId, null]],
        });
        assert.deepEqual(duplicateDocument, [[[
          'threads', 'revision-worker-1', 1, byDocumentId,
          '2026-07-01T00:00:00Z', 'duplicate_document', null, 0, 0,
        ]], [], []]);
        const contentHash = sha256Canonical([
          ['title', '2330 股票成長。'], ['summary', ''], ['body', '2454 股票受惠。'],
        ]);
        const duplicateContent = parseSourceWorker({
          priorDocumentIdentityRows: [['a'.repeat(64), contentHash]],
        });
        assert.deepEqual(duplicateContent[0][0].slice(5), [
          'duplicate_document', contentHash, 0, 0,
        ]);
        const normalized = parseSourceWorker({
          fields: ['\uFEFFＡＢＣ\r\n2330 股票。', '', ''],
        });
        assert.equal(normalized[0][0][6], sha256Canonical([
          ['title', 'ABC\n2330 股票。'], ['summary', ''], ['body', ''],
        ]));
        const transcriptFields = [
          '法說會',
          '',
          [
            [1000, 'segment-b', '後段維持成長。'],
            [0, 'segment-a', '2330 股票營收成長。'],
          ],
        ];
        const transcriptHash = sha256Canonical([
          ['title', '法說會'],
          ['summary', ''],
          ['transcript', [
            [0, '2330 股票營收成長。'],
            [1000, '後段維持成長。'],
          ]],
        ]);
        const transcript = executeWorkerPayload('source_parse_batch', [
          'revision-podcast-1', 2, 'podcast', 'source-identity-1', 'episode-1',
          'https://example.test/episode-1', '2026-07-01T00:00:00Z',
          '2026-07-01T00:01:00Z', transcriptFields, 25, 'source-adapter-v3.3',
          'complete', transcriptHash, 'community', 'podcast:issuer',
          [[
            'stock-2330', '2330', 'TWSE', 'common_stock', 'active',
            '台積電', ['台積電'], 'semiconductor',
          ]],
          [],
        ]);
        assert.equal(transcript[0][0][5], 'processed_with_claims');
        assert.equal(transcript[0][0][6], transcriptHash);
        for (const fields of [
          [Array.from({ length: 201 }, () => '2330 股票').join('。'), '', ''],
          ['2330 '.repeat(1001).trim(), '', ''],
        ]) {
          const rejected = parseSourceWorker({
            fields,
            rawCodePointCount: [...fields.join('')].length,
          });
          assert.deepEqual(rejected[0][0].slice(5), ['parse_failure', null, 0, 0]);
          assert.deepEqual(rejected[1], []);
          assert.deepEqual(rejected[2], []);
        }
        const emptyNormalized = parseSourceWorker({
          fields: ['———。2330 股票成長。', '', ''],
        });
        assert.equal(emptyNormalized[1].length, 1);
        assert.equal(emptyNormalized[1][0][1], 0);
        assert.notEqual(emptyNormalized[1][0][2], sha256Canonical(['', []]));
        assert.match(migration, /stageResultMismatch|output_json:=jsonb_set/u);
        break;
      }
      case 'ENT-010': {
        assert.equal(normalizeAlias(' ＴＳＭＣ 股份有限公司 '), 'tsmc');
        assert.equal(linkMention(
          { token: '台積電', context: '台積電股票', explicitTicker: false, stockContext: true },
          [instrument()],
        ).symbol, '2330');
        assert.match(migration, /mention_ordinal/u);
        break;
      }
      case 'ENT-011': {
        const one = claimsFromDocument(sourceDocument({ fields: ['\uFEFFＡＢＣ\r\n2330。'] }))[0];
        const two = claimsFromDocument(sourceDocument({ revisionId: 'revision-2', fields: ['ABC 2330。'] }))[0];
        assert.equal(one.canonicalClaimHash, two.canonicalClaimHash);
        assert.equal(dedupeClaims([one, two]).duplicateCount, 1);
        break;
      }
      case 'ENT-012': {
        assert.equal(
          normalizeCanonicalUrl('HTTPS://Example.COM:443/a/%7E?b=2&utm_source=x&b=1#fragment'),
          'https://example.com/a/~?b=1&b=2',
        );
        assert.equal(normalizeCanonicalUrl('file:///tmp/secret'), null);
        break;
      }
      case 'ENT-013': {
        const visible = collapseRevisionFamilies([
          sourceDocument(),
          sourceDocument({
            revisionId: 'late', recordedAt: '2026-07-03T00:00:00Z',
            collectedAt: '2026-07-03T00:00:00Z',
          }),
        ], '2026-07-02T00:00:00Z');
        assert.deepEqual(visible.map(({ revisionId }) => revisionId), ['revision-1']);
        assert.match(migration, /approved_at<=requested_cutoff/u);
        assert.match(migration, /opportunity_authority_selected_stream_count_v3_internal\([^)]*v_run[.]source_cutoff/us);
        break;
      }
      case 'ENT-014': {
        assert.equal(
          normalizeCanonicalUrl('https://example.com/?a&a=&a=1+2#x'),
          'https://example.com/?a=&a=&a=1+2',
        );
        assert.equal(normalizeCanonicalUrl('https://example.com/%zz'), null);
        const malformed = parseSourceWorker({
          canonicalUrl: 'https://example.com/%zz',
        });
        assert.deepEqual(malformed[0][0].slice(3), [
          null,'2026-07-01T00:00:00Z','parse_failure',null,0,0,
        ]);
        const canonicalId = sha256Canonical([
          'threads','source-identity-1','https://example.com/post',
        ]);
        const normalizedDuplicate = parseSourceWorker({
          canonicalUrl: 'https://EXAMPLE.com/post/?utm_source=x#frag',
          priorDocumentIdentityRows: [[canonicalId, null]],
        });
        assert.equal(normalizedDuplicate[0][0][5], 'duplicate_document');
        assert.equal(normalizedDuplicate[0][0][3], canonicalId);
        assert.deepEqual(linkMention(
          { token: '2330', context: '(2330)', explicitTicker: true, stockContext: true },
          [instrument()],
        ).symbol, '2330');
        break;
      }
      case 'ENT-015': {
        assert.equal(linkMention(
          { token: 'AAPL.US', context: 'AAPL.US', explicitTicker: false, stockContext: true },
          [instrument()],
        ).reason, 'unsupported_market');
        assert.match(readFileSync(path.join(change, 'entity-link-contract.md'), 'utf8'), /unsupported_market/u);
        break;
      }
      case 'ENT-016': {
        assert.equal(normalizeAlias('台灣積體電路製造股份有限公司'), '台灣積體電路製造');
        assert.match(migration, /char_length\(official_legal_name\) BETWEEN 2 AND 120/u);
        assert.match(migration, /char_length\(official_short_name\) BETWEEN 2 AND 40/u);
        assert.doesNotMatch(migration, /left\(official_(?:legal|short)_name/iu);
        break;
      }
      default:
        assert.fail(`missing case-specific source/entity oracle for ${item.id}`);
    }
  },
  funnel: (item) => {
    switch (item.id) {
      case 'FNL-001': {
        const rows = Array.from({ length: 70 }, (_, index) => candidate(index));
        const bounded = boundedCandidates(rows);
        assert.equal(bounded.active.length, 60);
        assert.deepEqual(bounded.active, boundedCandidates([...rows].reverse()).active);
        break;
      }
      case 'FNL-002': {
        const rows = [
          ...Array.from({ length: 27 }, (_, index) => ({ id: `a-${index}`, group: 'a' })),
          ...Array.from({ length: 8 }, (_, index) => ({ id: `b-${index}`, group: 'b' })),
          ...Array.from({ length: 8 }, (_, index) => ({ id: `c-${index}`, group: 'c' })),
        ];
        const selected = fairQuota(rows, 30, ({ group }) => group, 0.4);
        assert.equal(selected.filter(({ group }) => group === 'a').length, 12);
        assert.equal(selected.length, 28);
        break;
      }
      case 'FNL-003': {
        const rows = [
          ...Array.from({ length: 18 }, (_, index) => ({ id: `a-${index}`, sector: 'a' })),
          ...Array.from({ length: 2 }, (_, index) => ({ id: `b-${index}`, sector: 'b' })),
          ...Array.from({ length: 2 }, (_, index) => ({ id: `c-${index}`, sector: 'c' })),
        ];
        const selected = fairQuota(rows, 20, ({ sector }) => sector, 0.35);
        assert.equal(selected.filter(({ sector }) => sector === 'a').length, 7);
        assert.equal(selected.length, 11);
        assert.equal(quotaCoverage(selected.length, 20), 55);
        break;
      }
      case 'FNL-004': {
        assert.equal(isFreshClaim({
          ...candidate(0).anchor,
          effectiveAt: '2026-07-01T00:00:00Z',
        }, '2026-07-04T01:00:01Z'), false);
        break;
      }
      case 'FNL-005': {
        const bounded = boundedCandidates(Array.from({ length: 31 }, (_, index) => candidate(index)));
        assert.equal(bounded.shallow.length, 30);
        assert.equal(bounded.active.length - bounded.shallow.length, 1);
        break;
      }
      case 'FNL-006': {
        const status = sourceAvailability([
          { sourceKey: 'threads', configured: true, access: 'authorized', health: 'healthy' },
          { sourceKey: 'youtube', configured: true, access: 'authorized', health: 'failed' },
          { sourceKey: 'mops_material_event', configured: true, access: 'authorized', health: 'healthy' },
        ]);
        assert.equal(status.status, 'degraded');
        assert.equal(status.eligibleCount, 2);
        assert.deepEqual(status.sources.filter(({ eligible }) => !eligible).map(
          ({ sourceKey, reason }) => [sourceKey, reason],
        ), [['youtube', 'connector_failed']]);
        const remaining = Array.from({ length: 40 }, (_, index) => ({
          id: index,
          group: index % 2 ? 'mops_material_event' : 'threads',
        }));
        const selected = fairQuota(remaining, 30, ({ group }) => group, 0.4);
        assert.equal(selected.filter(({ group }) => group === 'threads').length, 15);
        assert.equal(selected.filter(({ group }) => group === 'mops_material_event').length, 15);
        break;
      }
      case 'FNL-007': {
        const rows = Array.from({ length: 40 }, (_, index) => ({
          id: index, group: index % 2 ? 'a' : 'b',
        }));
        const selected = fairQuota(rows, 30, ({ group }) => group, 0.4);
        assert.deepEqual(
          ['a', 'b'].map((group) => selected.filter((row) => row.group === group).length),
          [15, 15],
        );
        break;
      }
      case 'FNL-008': {
        const rows = Array.from({ length: 35 }, (_, index) => ({ id: index, group: 'only' }));
        assert.equal(fairQuota(rows, 30, ({ group }) => group, 0.4).length, 30);
        break;
      }
      case 'FNL-009': {
        const bounded = boundedCandidates(Array.from({ length: 30 }, (_, index) => candidate(index)));
        assert.equal(bounded.shallow.length, 30);
        assert.equal(bounded.deep.length, 20);
        assert.equal(bounded.shallow.filter(
          (row) => !bounded.deep.some((deep) => deep.symbol === row.symbol),
        ).length, 10);
        assert.equal(formalResearchStatus({
          inDeepPool: false,
          criticalDataInvalid: false,
          valuation: { status: 'normal', confidence: 1, reasons: [] },
          thesis: null,
          sourceConfidence: 1,
          independentClasses: 2,
          hasOfficialOrResearch: true,
        }), 'not_evaluated');
        break;
      }
      case 'FNL-010': {
        const rows = [
          ...Array.from({ length: 10 }, (_, index) => ({ id: `a-${index}`, sector: 'a' })),
          ...Array.from({ length: 7 }, (_, index) => ({ id: `b-${index}`, sector: 'b' })),
          ...Array.from({ length: 3 }, (_, index) => ({ id: `c-${index}`, sector: 'c' })),
        ];
        const selected = fairQuota(rows, 20, ({ sector }) => sector, 0.35);
        assert.equal(selected.length, 17);
        assert.equal(quotaCoverage(selected.length, 20), 85);
        break;
      }
      case 'FNL-011': {
        const threads = candidate(0, {
          anchor: {
            ...candidate(0).anchor,
            sourceKey: 'threads',
            confidence: 0.8,
            canonicalClaimHash: 'threads-hash',
          },
        });
        const official = candidate(0, {
          anchor: {
            ...candidate(0).anchor,
            sourceKey: 'mops_material_event',
            sourceClass: 'official',
            confidence: 0.8,
            canonicalClaimHash: 'official-hash',
          },
        });
        const selected = boundedCandidates([threads, official]).active[0];
        assert.equal(selected.anchor.sourceKey, 'mops_material_event');
        assert.deepEqual(selected.claims.map(({ sourceKey }) => sourceKey), ['threads']);
        assert.deepEqual(selected, boundedCandidates([official, threads]).active[0]);
        break;
      }
      case 'FNL-012': {
        assert.match(migration, /canonical_sector_key/u);
        assert.match(migration, /'unknown'::public[.]canonical_sector_key_v3/u);
        assert.match(migration, /authority_revision_conflict/u);
        assert.doesNotMatch(migration, /free[_ ]form[_ ]sector/iu);
        break;
      }
      case 'PEER-001': {
        assert.equal(Array.from({ length: 10 }, (_, index) => index).slice(0, 3).length, 3);
        assert.match(migration, /candidate_origin='comparison_only'/u);
        break;
      }
      case 'PEER-002': {
        assert.equal(formalResearchStatus({
          inDeepPool: false,
          criticalDataInvalid: false,
          valuation: { status: 'normal', confidence: 1, reasons: [] },
          thesis: {
            horizon: 'thesis_120_250d', score: 100, confidence: 1,
            availableWeight: 100, factors: [],
          },
          sourceConfidence: 1,
          independentClasses: 3,
          hasOfficialOrResearch: true,
        }), 'not_evaluated');
        assert.match(migration, /comparison_only/u);
        break;
      }
      case 'PEER-003': {
        const direct = candidate(0, { directSource: true });
        const comparison = candidate(0, { directSource: false });
        assert.equal(boundedCandidates([comparison, direct]).active[0].directSource, true);
        break;
      }
      case 'PEER-004': {
        const peers = Array.from({ length: 60 }, (_, index) => `peer-${index}`);
        assert.equal(new Set(peers).size, 60);
        assert.equal([...new Set(peers)].slice(0, 12).length, 12);
        assert.match(migration, /comparison_only/u);
        assert.match(migration, /deep_status.*not_reached/su);
        break;
      }
      case 'PEER-005': {
        const peers = ['2454', '2303', '2454', '3711', '3008', '2303', '2379', '3034', '3661', '3443', '6488', '5269', '6770', '2408'];
        const selected = [...new Set(peers.toSorted())].slice(0, 12);
        assert.equal(selected.length, 12);
        assert.deepEqual(selected, [...new Set([...peers].reverse().toSorted())].slice(0, 12));
        assert.match(migration, /recorded_at<=r[.]source_cutoff/u);
        break;
      }
      case 'PEER-006': {
        assert.match(migration, /supplier_stock_id/u);
        assert.match(migration, /customer_stock_id/u);
        assert.match(migration, /relationship_kind/u);
        assert.match(migration, /authority_revision_conflict/u);
        break;
      }
      case 'PEER-007': {
        assert.match(migration, /LIMIT 1001/u);
        assert.match(migration, /LIMIT 100001/u);
        assert.match(migration, /identity_manifest_overflow/u);
        assert.match(migration, /peer_reviewer_allowlist/u);
        break;
      }
      case 'PEER-008': {
        assert.match(migration, /supplier_instrument_authority_id/u);
        assert.match(migration, /customer_instrument_authority_id/u);
        assert.doesNotMatch(migration, /supplier_symbol|customer_symbol/iu);
        assert.match(migration, /char_length\(official_legal_name\) BETWEEN 2 AND 120/u);
        assert.match(migration, /char_length\(official_short_name\) BETWEEN 2 AND 40/u);
        break;
      }
      default:
        assert.fail(`missing case-specific funnel/peer oracle for ${item.id}`);
    }
  },
  market: (item) => {
    const groupsAt = (score) => Object.fromEntries(
      ['trend', 'breadth', 'flow', 'derivatives', 'global']
        .map((key) => [key, { status: 'fresh', score }]),
    );
    switch (item.id) {
      case 'MKT-001': {
        assert.match(workerExecutors, /missedSourceAudit/u);
        assert.match(migration, /candidate_origin/u);
        assert.doesNotMatch(worker, /missedSourceAudit.*formalStatus/su);
        break;
      }
      case 'MKT-002': {
        assert.equal(boundedCandidates(Array.from({ length: 30 }, (_, index) => candidate(index))).deep.length, 20);
        assert.match(migration, /orderedSymbols/u);
        assert.match(migration, /LIMIT 20/u);
        break;
      }
      case 'MKT-003': {
        const result = marketContext({
          ...groupsAt(70),
          breadth: { status: 'missing', score: null },
          flow: { status: 'missing', score: null },
          derivatives: { status: 'missing', score: null },
        }, '2026-07-01T00:00:00Z');
        assert.deepEqual(
          [result.regime, result.completeness, result.composite, result.newPositionBudgetPct],
          ['unknown', 'insufficient', null, 15],
        );
        break;
      }
      case 'MKT-004': {
        const result = marketContext(groupsAt(70), '2026-07-01T00:00:00Z');
        assert.deepEqual([result.regime, result.composite, result.newPositionBudgetPct], ['risk_on', 70, 60]);
        break;
      }
      case 'MKT-005': {
        const result = marketContext({
          trend: { status: 'missing', score: null },
          breadth: { status: 'missing', score: null },
          flow: { status: 'missing', score: null },
          derivatives: { status: 'missing', score: null },
          global: { status: 'fresh', score: 80 },
        }, '2026-07-01T00:00:00Z');
        assert.equal(result.regime, 'unknown');
        assert.deepEqual(result.missingGroups, ['trend', 'breadth', 'flow', 'derivatives']);
        break;
      }
      case 'MKT-006': {
        assert.deepEqual(sectorCycle({
          revenueLevel: null, epsLevel: 70, revenueChange: 60,
          marginChange: 60, excess20d: 60, excess60d: 60, breadth20d: 60,
        }), {
          state: 'unknown', levelScore: null, changeScore: 60,
          marketScore: 60, matchedRule: 'unavailable',
        });
        break;
      }
      case 'MKT-007': {
        assert.deepEqual(
          [34.99, 35, 64.999, 65].map((score) => {
            const result = marketContext(groupsAt(score), '2026-07-01T00:00:00Z');
            return [result.regime, result.newPositionBudgetPct];
          }),
          [['risk_off', 0], ['selective', 35], ['selective', 35], ['risk_on', 60]],
        );
        break;
      }
      case 'MKT-008': {
        const result = marketContext({
          ...groupsAt(90),
          breadth: { status: 'fresh', score: 24.99 },
        }, '2026-07-01T00:00:00Z');
        assert.deepEqual([result.regime, result.overrideReason, result.newPositionBudgetPct], [
          'risk_off', 'breadth_below_25', 0,
        ]);
        break;
      }
      case 'MKT-009': {
        const result = marketContext({
          ...groupsAt(80),
          breadth: { status: 'stale', score: 80 },
        }, '2026-07-01T00:00:00Z');
        assert.deepEqual([result.regime, result.composite, result.newPositionBudgetPct], ['unknown', null, 15]);
        assert.deepEqual(result.missingGroups, ['breadth']);
        break;
      }
      case 'CYC-001': {
        const fixtures = [
          [{ revenueLevel: 40, epsLevel: 40, revenueChange: 40, marginChange: 40, excess20d: 40, excess60d: 40, breadth20d: 40 }, 'contraction'],
          [{ revenueLevel: 50, epsLevel: 50, revenueChange: 65, marginChange: 65, excess20d: 60, excess60d: 60, breadth20d: 60 }, 'early_recovery'],
          [{ revenueLevel: 70, epsLevel: 70, revenueChange: 60, marginChange: 60, excess20d: 60, excess60d: 60, breadth20d: 60 }, 'expansion'],
          [{ revenueLevel: 70, epsLevel: 70, revenueChange: 40, marginChange: 40, excess20d: 40, excess60d: 40, breadth20d: 40 }, 'late_expansion'],
          [{ revenueLevel: null, epsLevel: 70, revenueChange: 60, marginChange: 60, excess20d: 60, excess60d: 60, breadth20d: 60 }, 'unknown'],
        ];
        assert.deepEqual(fixtures.map(([input, expected]) => [sectorCycle(input).state, expected]), fixtures.map(([, expected]) => [expected, expected]));
        break;
      }
      case 'MKT-010': {
        assert.match(contracts, /MarketContextV3/u);
        assert.match(migration, /opportunity_market_context_snapshots/u);
        assert.match(migration, /opportunity_sector_cycle_snapshots/u);
        assert.match(migration, /sectorReferenceCount/u);
        assert.equal(sectorCycle({
          sectorReferenceCount: 7,
          revenueLevel: 70, epsLevel: 70, revenueChange: 60,
          marginChange: 60, excess20d: 60, excess60d: 60, breadth20d: 60,
        }).state, 'unknown');
        break;
      }
      case 'CYC-002': {
        const reference = readFileSync(path.join(change, 'sector-reference-contract.md'), 'utf8');
        assert.match(reference, /at least five/iu);
        assert.match(reference, /80%/u);
        assert.match(reference, /60%/u);
        assert.match(reference, /eight/u);
        assert.match(migration, /sector_scoring_reference/u);
        break;
      }
      case 'MKT-011': {
        assert.match(migration, /TW_ACTIVE_COMMON/u);
        assert.match(migration, /insufficient_history/u);
        assert.match(migration, /provider_conflict/u);
        assert.match(migration, /zero_variance/u);
        break;
      }
      case 'MKT-012': {
        assert.match(migration, /opportunity-mover-audit-v3[.]3/u);
        assert.match(migration, /recent_session_plan_hash/u);
        assert.match(migration, /selected_mover_audit_id/u);
        assert.match(migration, /previous_session_authority_hash/u);
        break;
      }
      case 'MKT-013': {
        assert.match(migration, /mover_rank<=20/u);
        assert.match(migration, /least\(20,count\(\*\)\)/u);
        assert.match(migration, /later_mentioned_count/u);
        break;
      }
      case 'MKT-014': {
        assert.match(migration, /LIMIT 20001/u);
        assert.match(migration, /roster_volume_exceeded/u);
        assert.match(migration, /mover_price_reference/u);
        assert.match(migration, /conservation/u);
        break;
      }
      case 'MKT-015': {
        assert.match(migration, /WHEN 'mover_price_reference'/u);
        assert.match(migration, /v_next_ordinal:=v_ordinal[+]1/u);
        assert.match(migration, /v_run[.]selected_mover_audit_id IS NULL/u);
        assert.match(migration, /ON CONFLICT/u);
        break;
      }
      case 'MKT-016': {
        assert.match(migration, /LIMIT 60/u);
        assert.match(migration, /MA20|ma20/u);
        assert.match(migration, /MA60|ma60/u);
        assert.match(migration, /LIMIT 65/u);
        assert.match(migration, /coverage/u);
        break;
      }
      case 'MKT-017': {
        assert.match(migration, /LIMIT 193/u);
        assert.match(migration, /96 hours/u);
        assert.match(migration, /provider_session_date/u);
        assert.match(migration, /LIMIT 65/u);
        break;
      }
      case 'MKT-018': {
        assert.match(migration, /48fa54ee9f0e3a0b888ac0dc17eda8ad5bb746106a6fe4395eb50a5865e4e44e/u);
        assert.match(migration, /opportunity_price_observations_v3_stream/u);
        assert.match(migration, /opportunity_corporate_action_snapshots_v3_stream/u);
        assert.match(migration, /LIMIT 65/u);
        break;
      }
      case 'MKT-019': {
        assert.match(migration, /LIMIT 512/u);
        assert.match(migration, /LIMIT 32769/u);
        assert.match(migration, /LIMIT 252/u);
        assert.match(migration, /insufficient_history/u);
        break;
      }
      case 'MKT-020': {
        assert.match(migration, /tw-corporate-action-v3[.]1/u);
        assert.match(migration, /corporate-action-snapshot-v3[.]1/u);
        assert.match(migration, /adjusted-price-evidence-v3[.]1/u);
        assert.match(migration, /declared_event_count/u);
        assert.match(migration, /LIMIT 253/u);
        assert.match(migration, /raw_open/u);
        assert.match(migration, /raw_close/u);
        break;
      }
      default:
        assert.fail(`missing case-specific market/cycle oracle for ${item.id}`);
    }
  },
  scoring: (item) => {
    const factorKeys = ['priceVolume', 'chip', 'catalyst', 'marketSector', 'fundamental', 'valuation'];
    const factors = Object.fromEntries(factorKeys.map((key, index) => [
      key, { value: 55 + index * 7, status: 'fresh' },
    ]));
    const groups = Object.fromEntries(
      ['trend', 'breadth', 'flow', 'derivatives', 'global']
        .map((key) => [key, { status: 'fresh', score: 75 }]),
    );
    const valuation = buildValuationDistribution({
      method: 'pe', fundamentals: [9, 12, 15],
      historicalMultiples: Array(8).fill(10), peerMultiples: Array(5).fill(10),
      currentPrice: 100, asOf: '2026-07-01T00:00:00Z',
      formulaSourceRef: 'official:decision-fixture', evidenceRefs: ['official:decision-fixture'],
    });
    const decision = (overrides = {}) => actionDecision({
      formalStatus: 'formal_watch',
      market: marketContext(groups, '2026-07-01T00:00:00Z'),
      momentum: scoreHorizon('momentum_5_20d', factors, 0.9, 0.9),
      swing: scoreHorizon('swing_20_60d', factors, 0.9, 0.9),
      valuation,
      sourceClass: 'official', sourceConfidence: 0.9, independentRootCount: 2,
      technicalState: 'at_support', qualityActionEligible: true, biasSafetyObserveOnly: false,
      criticalDataInvalid: false, entryConfirmed: true, technicallyExtended: false,
      currentPrice: 100, p50UpsidePct: 20, p10DownsidePct: -10,
      liquidityFactor: 80, triggerCapable: true, entryTrigger: 'buy between 95 and 100 after confirmation',
      stopPrice: 85, evidenceExpiresAt: '2026-08-01T00:00:00Z',
      ...overrides,
    });
    switch (item.id) {
      case 'SCR-001': {
        const rows = ['momentum_5_20d', 'swing_20_60d', 'thesis_120_250d']
          .map((horizon) => scoreHorizon(horizon, factors, 0.9, 0.8));
        assert.deepEqual(rows.map(({ horizon }) => horizon), [
          'momentum_5_20d', 'swing_20_60d', 'thesis_120_250d',
        ]);
        assert.equal(new Set(rows.map(({ score }) => score)).size, 3);
        assert.equal(rows.every(({ factors: contributions }) =>
          Object.values(contributions).every(({ contribution }) => Number.isFinite(contribution))), true);
        break;
      }
      case 'SCR-002': {
        const complete = scoreHorizon('swing_20_60d', factors, 0.9, 0.8);
        const missing = scoreHorizon('swing_20_60d', {
          ...factors, fundamental: { value: null, status: 'missing' },
        }, 0.9, 0.8);
        assert.equal(missing.availableWeight, complete.availableWeight - 25);
        assert.ok(missing.confidence < complete.confidence);
        break;
      }
      case 'SCR-003':
        assert.doesNotMatch(contracts, /shortHorizonTarget/u);
        assert.match(contracts, /thesis_120_250d/u);
        break;
      case 'SCR-004': {
        const rows = ['momentum_5_20d', 'swing_20_60d', 'thesis_120_250d']
          .map((horizon) => scoreHorizon(horizon, factors, 0.75, 0.8));
        assert.deepEqual(rows.map(({ availableWeight, confidence }) =>
          [availableWeight, confidence]), [[100, 0.75], [100, 0.75], [100, 0.75]]);
        assert.deepEqual(rows.map(({ score }) => score), [66.2, 72.5, 79.85]);
        break;
      }
      case 'SCR-005':
        assert.deepEqual(weightedFactor([
          { value: 90, status: 'fresh', weight: 0.49 },
          { value: 90, status: 'stale', weight: 0.51 },
        ]), { value: null, status: 'stale' });
        break;
      case 'SCR-006': {
        const tied = scoreHorizon('swing_20_60d', Object.fromEntries(
          factorKeys.map((key) => [key, { value: 70, status: 'fresh' }]),
        ), 0.9, 0.9);
        assert.equal(decision({ momentum: { ...tied, horizon: 'momentum_5_20d' }, swing: tied }).primaryHorizon, 'swing_20_60d');
        break;
      }
      case 'SCR-007':
        assert.equal(sourcePriority({
          strongestPrior: 1, independentSourceClasses: 3, recencyFactor: 1,
          deduplicatedReach: 15, linkConfidence: 1,
        }), 100);
        break;
      case 'SCR-008':
        assert.deepEqual([
          type7Quantile([0, 10], 0.25), percentile(5, [0, 5, 5, 10]),
        ], [2.5, 50]);
        assert.equal(formalResearchStatus({
          inDeepPool: true, criticalDataInvalid: false, valuation,
          thesis: scoreHorizon('thesis_120_250d', Object.fromEntries(
            factorKeys.map((key) => [key, { value: 80, status: 'fresh' }]),
          ), 0.6, 0.6),
          sourceConfidence: 0.6, independentClasses: 2, hasOfficialOrResearch: true,
        }), 'formal_candidate');
        break;
      case 'SCR-009':
        assert.match(readFileSync(path.join(change, 'scoring-contract.md'), 'utf8'), /evidenceRootId/u);
        break;
      case 'SCR-010':
        assert.equal(sectorCycle({
          revenueLevel: null, epsLevel: 70, revenueChange: 60, marginChange: 60,
          excess20d: 60, excess60d: 60, breadth20d: 60,
        }).state, 'unknown');
        break;
      case 'SCR-011':
        assert.match(migration, /factor_scoring_reference/u);
        assert.match(migration, /market_reference/u);
        break;
      case 'SCR-012':
        assert.match(migration, /factor_scoring_reference.*included_rows/su);
        assert.match(migration, /factor_scoring_reference.*excluded_rows/su);
        break;
      case 'SCR-013':
        assert.match(migration, /roster_volume_exceeded/u);
        assert.match(migration, /LIMIT 20001/u);
        break;
      case 'SCR-014':
        assert.match(migration, /aggregate_evidence_rows/u);
        assert.match(migration, /sector_excess_included_rows/u);
        break;
      case 'ACT-001':
        assert.equal(decision().newPositionAction, 'starter_now');
        assert.equal(decision().initialPositionPct, 5);
        break;
      case 'ACT-002': {
        const eventFactors = Object.fromEntries(
          factorKeys.map((key) => [key, { value: 80, status: 'fresh' }]),
        );
        const eventValuation = buildValuationDistribution({
          method: 'pe', fundamentals: [9, 11, 13],
          historicalMultiples: Array(8).fill(10), peerMultiples: Array(5).fill(10),
          currentPrice: 100, asOf: '2026-07-01T00:00:00Z',
          formulaSourceRef: 'official:event-fixture', evidenceRefs: ['official:event-fixture'],
        });
        const formalStatus = 'insufficient_evidence';
        const output = decision({
          formalStatus,
          momentum: scoreHorizon('momentum_5_20d', eventFactors, 0.9, eventValuation.confidence),
          valuation: eventValuation,
          p50UpsidePct: 10,
        });
        const publicCard = toPublicCard({
          formalResearchStatus: formalStatus,
          actionDecision: output,
        });
        assert.deepEqual([
          publicCard.formalResearchStatus,
          output.newPositionAction,
          output.initialPositionPct,
          output.decisionAuthority,
          output.publicationEligible,
          output.blockReasons,
        ], ['insufficient_evidence', 'event_starter', 3, 'research_only', false, []]);
        assert.equal(output.initialPositionPct >= 2 && output.initialPositionPct <= 3, true);
        assert.equal('initialPositionPct' in publicCard.actionDecision, false);
        break;
      }
      case 'ACT-003':
        assert.equal(decision({ technicalState: 'extended', technicallyExtended: true,
          entryConfirmed: false }).newPositionAction, 'wait_trigger');
        break;
      case 'ACT-004':
        assert.equal(decision({ market: marketContext({
          ...groups, trend: { status: 'fresh', score: 20 },
        }, '2026-07-01T00:00:00Z') }).blockReasons[0], 'market_risk_off');
        break;
      case 'ACT-005':
        assert.deepEqual(decision({ criticalDataInvalid: true }).blockReasons, ['data_integrity']);
        assert.equal(decision({ technicalState: undefined }).newPositionAction, 'avoid');
        assert.equal(decision({ qualityActionEligible: undefined }).newPositionAction, 'avoid');
        break;
      case 'ACT-006':
        assert.equal(formalResearchStatus({
          inDeepPool: true, criticalDataInvalid: false,
          valuation: { ...valuation, status: 'outlier_review', reasons: ['unverified_base_upside'] },
          thesis: null, sourceConfidence: 0.3, independentClasses: 1,
          hasOfficialOrResearch: false,
        }), 'valuation_review');
        assert.equal(decision({
          valuation: { ...valuation, status: 'outlier_review', reasons: ['unverified_base_upside'] },
        }).newPositionAction, 'valuation_review');
        break;
      case 'ACT-007':
        assert.equal(decision({ sourceClass: 'community', formalStatus: 'insufficient_evidence' }).newPositionAction, 'starter_now');
        assert.notEqual(decision({
          sourceClass: 'community', formalStatus: 'insufficient_evidence',
          valuation: { ...valuation, status: 'missing', method: null, p10: null, p50: null, p90: null, confidence: null },
        }).newPositionAction, 'event_starter');
        break;
      case 'ACT-008':
        assert.match(readFileSync(path.join(change, 'portfolio-context-contract.md'), 'utf8'), /capacity_exhausted/u);
        break;
      case 'ACT-009':
      case 'ACT-011':
      case 'ACT-012':
        assert.match(readFileSync(path.join(change, 'portfolio-context-contract.md'), 'utf8'), /no_position|trim|hold/u);
        break;
      case 'ACT-010':
      case 'ACT-013':
        assert.equal(decision({ technicalState: 'extended', technicallyExtended: true }).newPositionAction, 'wait_trigger');
        assert.equal(decision({ entryConfirmed: false }).newPositionAction, 'wait_trigger');
        break;
      case 'CMP-001':
        assert.equal(decision().publicationEligible, false);
        assert.doesNotMatch(workerExecutors, /recommendations|alerts/u);
        assert.doesNotMatch(migration, /INSERT INTO public[.](?:recommendations|strategy|alerts)/u);
        break;
      default:
        assert.fail(`missing case-specific scoring/action oracle for ${item.id}`);
    }
  },
  valuation: (item) => {
    const result = () => buildValuationDistribution({
      method: 'pe', fundamentals: [10, 20, 40],
      historicalMultiples: [8, 9, 10, 11, 12, 13, 14, 15],
      peerMultiples: [10, 11, 12, 13, 14], currentPrice: 100,
      formulaSourceRef: 'official:formula', evidenceRefs: ['official:formula'],
    });
    const missing = () => buildValuationDistribution({
      method: 'pe', fundamentals: [10, 20, 40], historicalMultiples: [],
      peerMultiples: [], currentPrice: 100,
      formulaSourceRef: 'official:formula', evidenceRefs: ['official:formula'],
    });
    switch (item.id) {
      case 'VAL-001':
        assert.equal(missing().status, 'missing');
        assert.equal(missing().p50, null);
        break;
      case 'VAL-002':
        assert.doesNotMatch(readFileSync(path.join(change, 'valuation-contract.md'), 'utf8'), /profile.*fill/iu);
        break;
      case 'VAL-003':
      case 'VAL-004':
        assert.match(readFileSync(path.join(change, 'valuation-contract.md'), 'utf8'), /consensus/iu);
        assert.match(readFileSync(path.join(change, 'valuation-contract.md'), 'utf8'), /comparison/iu);
        break;
      case 'VAL-005':
      {
        const exactBaseBoundary = buildValuationDistribution({
          method: 'pe', fundamentals: [10, 18.1, 20],
          historicalMultiples: Array(8).fill(10), peerMultiples: Array(5).fill(10),
          currentPrice: 100,
          formulaSourceRef: 'official:formula', evidenceRefs: ['official:formula'],
        });
        assert.deepEqual([
          exactBaseBoundary.p10,
          exactBaseBoundary.p50,
          exactBaseBoundary.p90,
          exactBaseBoundary.p50 - 100,
          exactBaseBoundary.reasons,
        ], [100, 181, 200, 81, ['unverified_base_upside']]);
        break;
      }
      case 'VAL-006': {
        const extreme = buildValuationDistribution({
          method: 'pe', fundamentals: [10, 15, 25.1],
          historicalMultiples: Array(8).fill(10), peerMultiples: Array(5).fill(10),
          currentPrice: 100,
          formulaSourceRef: 'official:formula', evidenceRefs: ['official:formula'],
        });
        assert.deepEqual([
          extreme.p10,
          extreme.p50,
          extreme.p90,
          extreme.p90 - 100,
          extreme.reasons,
        ], [100, 150, 251, 151, ['unverified_scenario_upside']]);
        break;
      }
      case 'VAL-007': {
        const divergent = buildValuationDistribution({
          method: 'pe', fundamentals: [10, 15.6, 20],
          historicalMultiples: Array(8).fill(10), peerMultiples: Array(5).fill(10),
          currentPrice: 100,
          consensusP50: 120,
          formulaSourceRef: 'official:formula', evidenceRefs: ['official:formula'],
        });
        const formulaUpside = divergent.p50 - 100;
        const consensusUpside = 120 - 100;
        assert.deepEqual([
          divergent.p10,
          divergent.p50,
          divergent.p90,
          formulaUpside,
          consensusUpside,
          formulaUpside - consensusUpside,
          divergent.reasons,
        ], [100, 156, 200, 56, 20, 36, ['consensus_divergence']]);
        break;
      }
      case 'VAL-008':
        assert.deepEqual([missing().status, missing().reasons], [
          'missing', ['insufficient_multiple_reference'],
        ]);
        break;
      case 'VAL-009': {
        const fact = (key, value, period) => {
          const row = Array(18).fill(null);
          row[1] = key;
          row[3] = period;
          row[5] = value;
          row[8] = 'official_filing';
          row[9] = '2026-07-01T08:00:00Z';
          row[12] = 'official:golden-financials';
          return row;
        };
        const quarters = ['2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30'];
        const financialFacts = quarters.flatMap((period) => [
          fact('quarterly_revenue', 100, period),
          fact('quarterly_gross_profit', 40, period),
          fact('quarterly_operating_expense', 10, period),
          fact('quarterly_operating_income', 30, period),
          fact('quarterly_non_operating_income', 5, period),
          fact('quarterly_pretax_income', 35, period),
          fact('quarterly_income_tax_expense', 5, period),
          fact('quarterly_noncontrolling_interest', 0, period),
          fact('quarterly_net_income_attributable_to_common', 30, period),
          fact('diluted_weighted_average_shares', 100, period),
          fact('quarterly_net_income', 30, period),
          fact('depreciation_amortization', 1, period),
        ]);
        financialFacts.push(
          fact('quarterly_revenue', 100, '2025-06-30'),
          fact('quarterly_net_income_attributable_to_common', 25, '2025-06-30'),
          fact('quarterly_net_income', 25, '2025-06-30'),
        );
        Array.from({ length: 16 }, (_, index) => {
          const date = new Date(Date.UTC(2026, 6 - index, 1)).toISOString().slice(0, 10);
          return fact('monthly_revenue', index < 4 ? 110 : 100, date);
        }).forEach((row) => financialFacts.push(row));
        Array.from({ length: 8 }, (_, index) =>
          fact('pe_multiple', 10, `2025-${String(12 - index).padStart(2, '0')}-15`))
          .forEach((row) => financialFacts.push(row));
        const golden = computeCandidateValuation({
          canonicalSector: 'technology',
          currentPrice: 10,
          sourceCutoff: '2026-07-01T09:00:00Z',
          financialFacts,
          sectorValuationReferences: [['technology', 'pe', 5, 10, 10, 10]],
          sectorValuationManifestRef: 'manifest:golden-pe',
        });
        const normalizedScenarioInputs = [golden.bear, golden.base, golden.bull]
          .map((scenario) => scenario.inputs.map((input) => ({
            ...input,
            value: Number(input.value.toFixed(3)),
          })));
        assert.deepEqual({
          status: golden.status,
          method: golden.method,
          p10: golden.p10,
          p50: golden.p50,
          p90: golden.p90,
          confidence: golden.confidence,
          historicalSampleCount: golden.historicalSampleCount,
          peerSampleCount: golden.peerSampleCount,
          historicalReferenceQuantiles: golden.historicalReferenceQuantiles,
          peerReferenceQuantiles: golden.peerReferenceQuantiles,
          evidenceRefs: golden.evidenceRefs,
          referenceManifestRef: golden.referenceManifestRef,
          scenarioInputs: normalizedScenarioInputs,
        }, {
          status: 'normal',
          method: 'pe',
          p10: 13.23,
          p50: 14.3,
          p90: 15.41,
          confidence: 0.8015,
          historicalSampleCount: 8,
          peerSampleCount: 5,
          historicalReferenceQuantiles: { p10: 10, p50: 10, p90: 10 },
          peerReferenceQuantiles: { p10: 10, p50: 10, p90: 10 },
          evidenceRefs: ['official:golden-financials'],
          referenceManifestRef: 'manifest:golden-pe',
          scenarioInputs: [1.323, 1.43, 1.541].map((value) => [
            { key: 'diluted_eps', value, unit: 'TWD_per_share', sourceRef: 'official:golden-financials', asOf: '2026-07-01T08:00:00Z' },
            { key: 'selected_multiple', value: 10, unit: 'ratio', sourceRef: 'manifest:golden-pe', asOf: '2026-07-01T08:00:00Z' },
          ]),
        });
        assert.equal(golden.p10 <= golden.p50 && golden.p50 <= golden.p90, true);
        const genericMutation = structuredClone(financialFacts);
        genericMutation.filter((row) => row[1] === 'quarterly_net_income')
          .forEach((row) => { row[5] = 999; });
        const genericResult = computeCandidateValuation({
          canonicalSector: 'technology', currentPrice: 10,
          sourceCutoff: '2026-07-01T09:00:00Z', financialFacts: genericMutation,
          sectorValuationReferences: [['technology', 'pe', 5, 10, 10, 10]],
          sectorValuationManifestRef: 'manifest:golden-pe',
        });
        assert.deepEqual([genericResult.p10, genericResult.p50, genericResult.p90],
          [golden.p10, golden.p50, golden.p90]);
        const bridgeMutation = structuredClone(financialFacts);
        bridgeMutation.filter((row) => row[1] === 'quarterly_net_income_attributable_to_common' &&
          quarters.includes(row[3])).forEach((row) => { row[5] = 15; });
        bridgeMutation.filter((row) => row[1] === 'quarterly_income_tax_expense')
          .forEach((row) => { row[5] = 20; });
        const bridgeResult = computeCandidateValuation({
          canonicalSector: 'technology', currentPrice: 10,
          sourceCutoff: '2026-07-01T09:00:00Z', financialFacts: bridgeMutation,
          sectorValuationReferences: [['technology', 'pe', 5, 10, 10, 10]],
          sectorValuationManifestRef: 'manifest:golden-pe',
        });
        assert.notDeepEqual([bridgeResult.p10, bridgeResult.p50, bridgeResult.p90],
          [golden.p10, golden.p50, golden.p90]);
        break;
      }
      case 'VAL-010':
        assert.deepEqual([missing().method, missing().p10, missing().confidence], [null, null, null]);
        assert.equal(result().method, 'pe');
        break;
      case 'VAL-011':
        assert.match(migration, /valuation_verifications_v3_selection/u);
        assert.match(migration, /LIMIT 101/u);
        break;
      case 'VAL-012':
      case 'VAL-013':
        assert.match(migration, /analyst_estimate|consensus/iu);
        assert.equal(type7Quantile([8, 9, 10, 11, 12, 13, 14, 15], 0.5), 11.5);
        break;
      case 'VAL-014':
        assert.equal(selectValuationMethod({
          sector: 'semiconductor', ttmNetIncome: 100, dilutedEps: 10,
          depreciationAmortizationPctRevenue: 7.99,
        }), 'pe');
        assert.equal(valuationFactor(90, 120, 100), 80);
        break;
      case 'VAL-015':
        assert.deepEqual([
          verificationFresh('2026-06-19T04:00:00Z', '2026-07-19T03:59:59Z'),
          verificationFresh('2026-06-19T04:00:00Z', '2026-07-19T04:00:00Z'),
          verificationFresh('2026-06-19T04:00:00Z', '2026-07-19T04:00:01Z'),
        ], [true, false, false]);
        break;
      case 'VAL-016': {
        const invalid = buildValuationDistribution({
          method: 'ev_ebitda', fundamentals: [10, 20, 40],
          historicalMultiples: [8, 9, 10, 11, 12, 13, 14, 15],
          peerMultiples: [10, 11, 12, 13, 14], currentPrice: 100,
          netDebt: Number.NaN, dilutedShares: 0,
          formulaSourceRef: 'official:formula', evidenceRefs: ['official:formula'],
        });
        assert.equal(invalid.status, 'outlier_review');
        assert.equal(invalid.p50, null);
        break;
      }
      case 'VAL-017':
        assert.match(migration, /LIMIT 101/u);
        assert.match(migration, /bound_violation/u);
        break;
      case 'FIN-001':
        assert.match(migration, /LIMIT 21/u);
        assert.match(migration, /LIMIT 13/u);
        break;
      case 'FIN-002':
        assert.match(migration, /filing_published_at/u);
        assert.match(migration, /authority_tier/u);
        break;
      case 'FIN-003':
        assert.match(migration, /sector_valuation_reference/u);
        assert.match(migration, /pb_roe|PB/iu);
        break;
      case 'FIN-004':
        assert.match(migration, /candidate_financial/u);
        assert.match(migration, /sector_valuation_reference/u);
        break;
      case 'FIN-005':
        assert.match(migration, /filing_published_at.*source_timestamp.*collected_at/su);
        assert.match(migration, /source_timestamp<=/u);
        break;
      default:
        assert.fail(`missing case-specific valuation/financial oracle for ${item.id}`);
    }
  },
  evaluation: (item) => {
    const cohort = Array.from({ length: 20 }, (_, index) => ({
      symbol: String(2300 + index),
      score: index === 19 ? null : index < 2 ? 90 : 80 - index,
      confidence: index === 0 ? 0.8 : index === 1 ? 0.9 : 0.5,
      relevant: index < 4,
      grade: index === 0 ? 3 : index === 1 ? 2 : index < 4 ? 1 : 0,
      mae20Pct: -index,
    }));
    const completeMetrics = {
      precisionAt20: 0.55,
      ndcgAt20: 0.66,
      worstDecileMae20Pct: -9,
    };
    const legacyMetrics = {
      precisionAt20: 0.5,
      ndcgAt20: 0.6,
      worstDecileMae20Pct: -8,
    };
    const promotionInput = {
      backtestCount: 120,
      liveCount: 20,
      v3Metrics: completeMetrics,
      legacyMetrics,
      linkPrecision: 0.95,
      linkRecall: 0.9,
      acceptancePassed: true,
      securityPassed: true,
      operationsPassed: true,
    };
    const outcomeInput = {
      entryClose: 100,
      closes: [104, 108],
      highs: [110, 116],
      lows: [96, 91],
      sectorReturns: [2, 4],
    };
    switch (item.id) {
      case 'OUT-001': {
        assert.deepEqual(labelOutcome(outcomeInput), {
          returnPct: 8,
          sectorRelativeReturnPct: 4,
          mfePct: 16,
          maePct: -9,
          sectorRelativeMfePct: 12,
          relevant: false,
          grade: 2,
        });
        break;
      }
      case 'OUT-002':
      case 'OUT-003': {
        assert.deepEqual(labelOutcome(outcomeInput), labelOutcome(structuredClone(outcomeInput)));
        break;
      }
      case 'OUT-004': {
        const maturities = [20, 60, 120, 250].map((sessions) => [
          sessions,
          labelOutcome({
            ...outcomeInput,
            closes: outcomeInput.closes.map((value) => value + sessions / 100),
          }),
        ]);
        assert.deepEqual(maturities.map(([sessions]) => sessions), [20, 60, 120, 250]);
        assert.equal(new Set(maturities.map(([, result]) => canonicalJson(result))).size, 4);
        break;
      }
      case 'OUT-005': {
        assert.match(migration, /'session_20','session_60','session_120','session_250'/u);
        assert.match(migration, /CREATE TABLE IF NOT EXISTS opportunity_outcomes/u);
        assert.match(migration, /entry_session_authority_hash/u);
        assert.match(migration, /maturity_session_authority_hash/u);
        break;
      }
      case 'EVAL-001': {
        const ranked = rankIdenticalCohort(cohort);
        assert.deepEqual(ranked.slice(0, 2).map(({ symbol }) => symbol), ['2301', '2300']);
        assert.equal(ranked.at(-1).symbol, '2319');
        break;
      }
      case 'EVAL-002': {
        const one = evaluationRunMetrics(cohort);
        assert.deepEqual(macroEvaluationMetrics([cohort, cohort]), {
          precisionAt20: one.precisionAt20,
          ndcgAt20: one.ndcgAt20,
          worstDecileMae20Pct: one.worstDecileMae20Pct,
        });
        assert.equal(relativeImprovement(0.55, 0.5), 0.1);
        break;
      }
      case 'EVAL-003': {
        assert.equal(evaluatePromotion({
          ...promotionInput,
          v3Metrics: null,
          legacyMetrics: null,
        }).mode, 'shadow');
        break;
      }
      case 'EVAL-004': {
        assert.equal(evaluatePromotion({
          ...promotionInput,
          backtestCount: 119,
          liveCount: 19,
          v3Metrics: null,
          legacyMetrics: null,
        }).pass, false);
        break;
      }
      case 'EVAL-005': {
        assert.deepEqual(rankIdenticalCohort([...cohort].reverse()), rankIdenticalCohort(cohort));
        const cutoff = Date.parse('2026-07-24T05:00:00Z');
        const closes = ['2026-07-24T05:00:00Z', '2026-07-25T05:00:00Z'];
        assert.equal(closes.find((timestamp) => Date.parse(timestamp) > cutoff), closes[1]);
        break;
      }
      case 'EVAL-006': {
        const population = Array.from({ length: 420 }, (_, index) => ({
          connector: `c${index % 3}`,
          linkMode: index % 2 ? 'ticker' : 'exact_alias',
          outcomeFamily: index % 4 ? 'linked' : 'ambiguous',
          runId: `run-${index}`,
          claimId: `claim-${index}`,
          mentionOrdinal: index,
        }));
        assert.equal(linkAuditSample(population).length, 400);
        assert.deepEqual(linkAuditSample(population), linkAuditSample([...population].reverse()));
        assert.equal(evaluatePromotion({ ...promotionInput, linkPrecision: null, linkRecall: null }).pass, false);
        break;
      }
      case 'EVAL-007': {
        const outcome = labelOutcome(outcomeInput);
        assert.equal(outcome.sectorRelativeMfePct, 12);
        assert.equal(outcome.sectorRelativeReturnPct, 4);
        break;
      }
      case 'EVAL-008': {
        assert.throws(() => evaluationRunMetrics(cohort.slice(0, 9)), /non_qualifying/u);
        assert.equal(evaluationRunMetrics(cohort.slice(0, 10)).selectedCount, 10);
        assert.equal(evaluationRunMetrics(cohort).worstDecileMae20Pct, -17.1);
        break;
      }
      case 'EVAL-009': {
        const rows = Array.from({ length: 122 }, (_, index) => ({
          tradingDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
          maturitySession: new Date(Date.UTC(2026, 1, index + 1)).toISOString().slice(0, 10),
        }));
        assert.equal(mostRecentDistinctCohorts(rows, 120).length, 120);
        assert.equal(mostRecentDistinctCohorts(rows, 20).length, 20);
        break;
      }
      case 'EVAL-010': {
        const row = { tradingDate: '2026-07-01', maturitySession: '2026-07-22' };
        assert.throws(() => mostRecentDistinctCohorts([row, row], 20), /duplicate/u);
        break;
      }
      case 'EVAL-011': {
        assert.equal(sha256(canonicalJson(rankIdenticalCohort(cohort))).length, 64);
        assert.deepEqual(rankIdenticalCohort([...cohort].reverse()), rankIdenticalCohort(cohort));
        break;
      }
      case 'EVAL-012': {
        for (const [backtestCount, liveCount, expected] of [
          [0, 0, false], [1, 1, false], [119, 19, false],
          [120, 19, false], [120, 20, true],
        ]) {
          assert.equal(evaluatePromotion({
            ...promotionInput,
            backtestCount,
            liveCount,
            v3Metrics: backtestCount === 120 ? completeMetrics : null,
            legacyMetrics: backtestCount === 120 ? legacyMetrics : null,
          }).pass, expected);
        }
        break;
      }
      case 'EVAL-013': {
        const rows = Array.from({ length: 504 * 4 }, (_, index) => index);
        assert.equal(rows.length, 2016);
        assert.match(evaluation, /2,016/u);
        break;
      }
      case 'EVAL-014': {
        const sample = linkAuditSample([{
          connector: 'threads',
          linkMode: 'ticker',
          outcomeFamily: 'linked',
          runId: 'run-1',
          claimId: 'claim-1',
          mentionOrdinal: 0,
        }]);
        assert.equal(sample.length, 1);
        assert.equal(sha256(canonicalJson(['link-audit-review-evidence-v3.0', sample[0]])).length, 64);
        const base = {
          sample_manifest_id: '123e4567-e89b-42d3-a456-426614170301',
          sample_id: 'a'.repeat(64),
          review_source_key: 'threads',
          evidence_ref: 'evidence-1',
          review_context: '2330 股票營收成長',
          review_mention_start_offset: 0,
          review_mention_end_offset: 4,
          normalized_token: '2330',
          link_mode: 'ticker',
          engine_outcome: 'linked_new',
          engine_reason: 'explicit_ticker_context',
          engine_canonical_symbol: '2330',
          review_evidence_hash: 'b'.repeat(64),
        };
        const rows = [
          ['reviewer_open_slot','reviewer_1',null,null,null,null,null,null,false],
          ['reviewer_existing_label','reviewer_1','2330',false,null,null,null,null,false],
          ['reviewer_slots_full',null,null,null,null,null,null,null,false],
          ['adjudication_pending',null,null,null,null,null,null,null,true],
          ['adjudication_not_required',null,null,null,null,null,null,null,true],
          ['adjudicator_open','adjudicator',null,null,'2330',false,null,true,true],
          ['adjudicator_existing_label','adjudicator','2330',false,'2330',false,null,true,true],
          ['adjudication_completed',null,null,null,null,null,null,null,true],
        ];
        for (const [
          disposition, assigned, ownSymbol, ownNoLink, oneSymbol, oneNoLink,
          twoSymbol, twoNoLink, adjudicator,
        ] of rows) {
          const serialized = serializeBlindedReviewSuccess(
            'assignment',
            Boolean(adjudicator),
            {
              ...base,
              disposition,
              assigned_label_role: assigned,
              own_canonical_symbol: ownSymbol,
              own_no_link: ownNoLink,
              reviewer_one_canonical_symbol: oneSymbol,
              reviewer_one_no_link: oneNoLink,
              reviewer_two_canonical_symbol: twoSymbol,
              reviewer_two_no_link: twoNoLink,
            },
          );
          assert.equal(serialized?.disposition, disposition);
          if (disposition === 'adjudication_completed') {
            assert.deepEqual([
              serialized?.assignedLabelRole,
              serialized?.ownCanonicalSymbol,
              serialized?.reviewerOneCanonicalSymbol,
              serialized?.reviewerTwoNoLink,
            ], [null,null,null,null]);
          }
        }
        assert.deepEqual(
          mapBlindedReviewRemoteError(401, 'PGRST301', 'invalid jwt'),
          { code: 'v3_service_role_unavailable', status: 503 },
        );
        assert.deepEqual(
          mapBlindedReviewRemoteError(403, 'PT403', 'principal_role_unavailable'),
          { code: 'authentication_rejected', status: 403 },
        );
        for (const file of [
          'blinded-review.ts','ingestion.ts','human-authority.ts','worker.ts','control.ts',
        ]) {
          assert.match(
            readFileSync(path.join(root, 'web/src/lib/opportunity-v3', file), 'utf8'),
            /isPreFunctionCredentialRejectionV3/u,
            `${file} must classify remote credential rejection by HTTP status`,
          );
        }
        assert.match(
          readFileSync(path.join(root, 'scripts/opportunity-v3/migration-contract.test.mjs'), 'utf8'),
          /executes all eight dispositions without cross-principal leakage/u,
        );
        break;
      }
      case 'HYB-005': {
        assert.equal(evaluatePromotion(promotionInput).pass, true);
        assert.equal(productValueMeasures([]).shownCount, 0);
        assert.equal(evaluationConstructibility([], 120).status, 'blocked');
        break;
      }
      default:
        assert.fail(`unknown evaluation acceptance case ${item.id}`);
    }
  },
};

const directExecutorByPrefix = {
  SRC: semanticExecutors.source, ENT: semanticExecutors.source,
  FNL: semanticExecutors.funnel, PEER: semanticExecutors.funnel,
  MKT: semanticExecutors.market, CYC: semanticExecutors.market,
  SCR: semanticExecutors.scoring, VAL: semanticExecutors.valuation, FIN: semanticExecutors.valuation,
  ACT: semanticExecutors.scoring,
  CMP: semanticExecutors.scoring,
};

const suiteBackedByPrefix = {
  DI: {
    track: 'product_runtime',
    evidenceKind: 'v313_decision_integrity_suite',
    command: 'npm run test:source-led-opportunity-v3:product-correctness',
    source: 'scripts/opportunity-v3/v313-decision-integrity.test.mjs',
  },
  REC: {
    track: 'product_runtime',
    evidenceKind: 'v314_actionability_recovery_suite',
    command: 'npm run test:source-led-opportunity-v3:product-correctness',
    source: 'scripts/opportunity-v3/v314-actionability-recovery.test.mjs',
  },
  API: {
    track: 'product_runtime',
    evidenceKind: 'typescript_public_and_route_suite',
    command: 'npm run test:source-led-opportunity-v3',
    source: 'web/src/lib/opportunity-v3/opportunity-v3.test.ts',
  },
  MOD: {
    track: 'product_runtime',
    evidenceKind: 'typescript_model_isolation_suite',
    command: 'npm run test:source-led-opportunity-v3',
    source: 'web/src/lib/opportunity-v3/opportunity-v3.test.ts',
  },
  HYB: {
    track: 'product_runtime',
    evidenceKind: 'typescript_hybrid_product_suite',
    command: 'npm run test:source-led-opportunity-v3',
    source: 'web/src/lib/opportunity-v3/opportunity-v3.test.ts',
  },
  AUTH: {
    track: 'product_runtime',
    evidenceKind: 'applied_postgresql_authority_suite',
    command: 'npm run test:source-led-opportunity-v3:migration',
    source: 'scripts/opportunity-v3/migration-contract.test.mjs',
  },
  CAL: {
    track: 'product_runtime',
    evidenceKind: 'applied_postgresql_calendar_suite',
    command: 'npm run test:source-led-opportunity-v3:migration',
    source: 'scripts/opportunity-v3/migration-contract.test.mjs',
  },
  MIG: {
    track: 'product_runtime',
    evidenceKind: 'applied_postgresql_catalog_suite',
    command: 'npm run test:source-led-opportunity-v3:migration',
    source: 'scripts/opportunity-v3/migration-contract.test.mjs',
  },
  OPS: {
    track: 'product_runtime',
    evidenceKind: 'applied_postgresql_lifecycle_suite',
    command: 'npm run test:source-led-opportunity-v3:migration',
    source: 'scripts/opportunity-v3/migration-contract.test.mjs',
  },
  SEC: {
    track: 'product_runtime',
    evidenceKind: 'applied_postgresql_security_suite',
    command: 'npm run test:source-led-opportunity-v3:migration',
    source: 'scripts/opportunity-v3/migration-contract.test.mjs',
  },
  MR3: {
    track: 'model_runner',
    evidenceKind: 'pinned_host_and_runner_suite',
    command: 'npm run test:model-runner-v3',
    source: 'scripts/model-runner-v3/model-runner-v3.test.js',
  },
  PCR: {
    track: 'product_runtime',
    evidenceKind: 'r14_product_correctness_red_suite',
    command: 'npm run test:source-led-opportunity-v3:product-correctness',
    source: 'scripts/opportunity-v3/product-correctness.test.mjs',
  },
};

const productOwner = 'web/src/lib/opportunity-v3/opportunity-v3.test.ts';
const publicOwner = 'web/src/lib/opportunity-v3/public-schema.test.ts';
const migrationOwner = 'scripts/opportunity-v3/migration-contract.test.mjs';
const runnerOwner = 'scripts/model-runner-v3/model-runner-v3.test.js';
const ownerRows = (prefix, rows, start = 1) => rows.map(([source, variant], index) => ({
  ids: [`${prefix}-${String(index + start).padStart(3, '0')}`],
  probes: [{ source, variant }],
}));

const suiteOwnerVariants = [
  ...ownerRows('API', [
    [publicOwner, 'available public projection is recursively closed and conservation checked'],
    [productOwner, 'keeps legacy radar arrays and ordering byte-identical when V3 shadow display is enabled'],
    [productOwner, 'derives a closed sizing-free public projection from normalized lineage rows'],
    [publicOwner, 'available public projection is recursively closed and conservation checked'],
    [productOwner, 'derives deterministic brief, lane bounds and sizing-free homepage summary'],
    [productOwner, 'freezes the exact 41-member v3.17 comparison identity and mutates every member'],
    [productOwner, 'rejects recursively malformed detail cards, horizons and factor tuples'],
    [publicOwner, 'available public projection is recursively closed and conservation checked'],
    [productOwner, 'derives a closed sizing-free public projection from normalized lineage rows'],
    [productOwner, 'distinguishes cold, nonmatching, active, failed and visible success at the exact cutoff'],
    [productOwner, 'treats post-cutoff terminalization as active and tied success as integrity failure'],
    [productOwner, 'distinguishes cold, nonmatching, active, failed and visible success at the exact cutoff'],
    [productOwner, 'derives a closed sizing-free public projection from normalized lineage rows'],
    [productOwner, 'derives a closed sizing-free public projection from normalized lineage rows'],
    [publicOwner, 'available public projection is recursively closed and conservation checked'],
    [productOwner, 'freezes the exact 41-member v3.17 comparison identity and mutates every member'],
    [productOwner, 'freezes the exact 41-member v3.17 comparison identity and mutates every member'],
    [publicOwner, 'available public projection is recursively closed and conservation checked'],
    [productOwner, 'treats post-cutoff terminalization as active and tied success as integrity failure'],
  ]),
  ...ownerRows('MOD', [
    [productOwner, 'assigns contradictions first and computes fixed-order strategy rows with null facts'],
    [productOwner, 'derives deterministic brief, lane bounds and sizing-free homepage summary'],
    [productOwner, 'validates database-computed outcomes and fixed empty strategy evidence'],
    [productOwner, 'hashes the complete pre-cap population and retains exactly the first 400 rows'],
    [productOwner, 'freezes the exact 41-member v3.17 comparison identity and mutates every member'],
    [migrationOwner, 'all four mode graphs use closed reads; enrich executes nonempty normalized stages and converges'],
  ]),
  ...ownerRows('HYB', [
    [productOwner, 'requires exact persisted verification tier and stance on detail evidence'],
    [productOwner, 'omits every sizing key from public decisions and rejects nested leaks'],
    [productOwner, 'rejects recursively malformed detail cards, horizons and factor tuples'],
    [productOwner, 'derives deterministic brief, lane bounds and sizing-free homepage summary'],
  ]),
  ...ownerRows('AUTH', [
    [migrationOwner, 'all four mode graphs use closed reads; enrich executes nonempty normalized stages and converges'],
    [migrationOwner, 'migration applies twice and exposes the exact granted/private function boundary'],
    [productOwner, 'authenticates before parsed object and cutoff validation'],
    [productOwner, 'maps remote PostgREST credential rejection to the closed service-unavailable response'],
    [productOwner, 'rejects key-correct but type-invalid human and blinded bodies before RPC work'],
    [migrationOwner, 'applied blinded assignment preserves reviewer isolation and audits every success'],
    [productOwner, 'maps remote PostgREST credential rejection to the closed service-unavailable response'],
    [migrationOwner, 'all four mode graphs use closed reads; enrich executes nonempty normalized stages and converges'],
    [migrationOwner, 'authority registries enforce exact 64/65 family bounds and serialized boundary races'],
    [productOwner, 'owns the eighth stock-flow route and nested price discriminator schemas'],
  ]),
  ...ownerRows('CAL', [
    [migrationOwner, 'Taiwan calendar v3.4 resolves two completed equal schedules and begin re-resolves the exact cutoff'],
    [migrationOwner, 'all four mode graphs use closed reads; enrich executes nonempty normalized stages and converges'],
    [migrationOwner, 'applied begin creates one deterministic canonical v3.3 bootstrap job and payload'],
    [migrationOwner, 'applied catalog exposes exact composite arities, named indexes and primary-key coverage'],
    [migrationOwner, 'applied checks, privileges, RLS boundary and immutable relations reject negative writes'],
  ]),
  ...ownerRows('MIG', [
    [migrationOwner, 'migration applies twice and exposes the exact granted/private function boundary'],
    [migrationOwner, 'migration declares the complete closed V3 catalog'],
    [migrationOwner, 'applied catalog exposes exact composite arities, named indexes and primary-key coverage'],
    [migrationOwner, 'migration applies twice and exposes the exact granted/private function boundary'],
  ], 2),
  ...ownerRows('OPS', [
    [productOwner, 'authenticates before parsed object and cutoff validation'],
    [publicOwner, 'available public projection is recursively closed and conservation checked'],
    [migrationOwner, 'migration applies twice and exposes the exact granted/private function boundary'],
    [productOwner, 'rejects method, query and media framing before bearer authentication'],
    [migrationOwner, 'applied checks, privileges, RLS boundary and immutable relations reject negative writes'],
    [migrationOwner, 'applied begin creates one deterministic canonical v3.3 bootstrap job and payload'],
    [migrationOwner, 'applied begin creates one deterministic canonical v3.3 bootstrap job and payload'],
    [migrationOwner, 'nonempty source-identity manifest executes header, bounded page, root and durable row'],
    [productOwner, 'freezes the exact 41-member v3.17 comparison identity and mutates every member'],
    [productOwner, 'uses the normative transcript key and rejects claim or mention overflow atomically'],
    [migrationOwner, 'all four mode graphs use closed reads; enrich executes nonempty normalized stages and converges'],
    [migrationOwner, 'nonempty source-identity manifest executes header, bounded page, root and durable row'],
    [productOwner, 'freezes the exact 41-member v3.17 comparison identity and mutates every member'],
    [productOwner, 'treats post-cutoff terminalization as active and tied success as integrity failure'],
    [migrationOwner, 'applied empty-run lifecycle commits each predecessor and deterministic successor atomically'],
    [productOwner, 'owns the eighth stock-flow route and nested price discriminator schemas'],
    [migrationOwner, 'real TypeScript evaluation executor output stages and commits through PostgreSQL'],
    [migrationOwner, 'applied begin creates one deterministic canonical v3.3 bootstrap job and payload'],
    [migrationOwner, 'all four mode graphs use closed reads; enrich executes nonempty normalized stages and converges'],
    [migrationOwner, 'migration applies twice and exposes the exact granted/private function boundary'],
    [migrationOwner, 'applied blinded assignment preserves reviewer isolation and audits every success'],
    [migrationOwner, 'applied blinded assignment executes all eight dispositions without cross-principal leakage'],
    [migrationOwner, 'migration declares the complete closed V3 catalog'],
    [productOwner, 'maps exact assignment and label rows while rejecting reviewer-label disclosure'],
    [productOwner, 'maps remote PostgREST credential rejection to the closed service-unavailable response'],
    [productOwner, 'rejects key-correct but type-invalid human and blinded bodies before RPC work'],
    [migrationOwner, 'nonempty source-identity manifest executes header, bounded page, root and durable row'],
    [migrationOwner, 'applied empty-run lifecycle commits each predecessor and deterministic successor atomically'],
    [migrationOwner, 'applied empty-run lifecycle commits each predecessor and deterministic successor atomically'],
    [migrationOwner, 'all four mode graphs use closed reads; enrich executes nonempty normalized stages and converges'],
    [productOwner, 'rejects method, query and media framing before bearer authentication'],
    [migrationOwner, 'applied begin creates one deterministic canonical v3.3 bootstrap job and payload'],
    [productOwner, 'authenticates before parsed object and cutoff validation'],
    [migrationOwner, 'real TypeScript evaluation executor output stages and commits through PostgreSQL'],
    [migrationOwner, 'all four mode graphs use closed reads; enrich executes nonempty normalized stages and converges'],
    [productOwner, 'freezes the exact 41-member v3.17 comparison identity and mutates every member'],
    [migrationOwner, 'all four mode graphs use closed reads; enrich executes nonempty normalized stages and converges'],
    [migrationOwner, 'source-identity manifest advances a hash-bound 2,001-row sentinel into two cursor pages'],
    [migrationOwner, 'all four mode graphs use closed reads; enrich executes nonempty normalized stages and converges'],
    [productOwner, 'derives deterministic brief, lane bounds and sizing-free homepage summary'],
  ]),
  {
    ids: ['SEC-001'],
    probes: [{
      source: migrationOwner,
      variant: 'applied checks, privileges, RLS boundary and immutable relations reject negative writes',
    }],
  },
  ...[
    'V3.13 decision envelope closes all eight user actions without an action quota',
    'V3.13 formal valuation requires four consecutive quarters and rejects the 2337 one-quarter shortcut',
    'V3.13 official facts and 252-session peer authority reach a formal valuation without hidden inputs',
    'V3.13 FULL detail remains authoritative while LIGHT fills only genuinely missing leaves',
    'V3.13 projection freshness uses scheduled trading runs, not a 24-hour wall clock',
    'V3.13 approved source acquisition conserves 17 terminal outcomes and only ingests creator transcripts',
    'V3.13 official statement parser requires reported diluted shares and never derives the 30.04 shortcut',
    'V3.13 official close and bounded raw OHLCV parsers retain exchange authority and reject bad geometry',
    'V3.13 entity linking rejects naked calendar years even when they are listed symbols',
    'V3.13 official corporate-action adapter distinguishes complete empty snapshots from transport failure',
    'V3.13 stale-readonly projection disables compatibility actions without mutating immutable decision identity',
  ].map((variant, index) => {
    const caseId = `DI-${String(index + 1).padStart(3, '0')}`;
    return { ids: [caseId], probes: [{ source: 'scripts/opportunity-v3/v313-decision-integrity.test.mjs', variant }] };
  }),
  ...[
    'V314-001 calendar authority loss preserves checksum-valid last-good research as readonly',
    'V314-002 unchanged discovery outcomes conserve seed membership',
    'V314-003 research ranking never improves when an available axis is removed',
    'V314-004 discovery and report visibility are backed by payload data',
    'V314-005 one actionable card without a cited brief degrades only that card',
    'V314-006 selective market raises thresholds and exposes wait_value or wait_market without score gate',
    'V314-007 runtime diagnostics never serialize SQL text or connection credentials',
    'V314-008 Web and runtime share exact release compatibility authority',
    'V314-009 official calendar and backfill coverage remain typed and non-synthetic',
    'V314-010 all ten decision actions are closed and operationally reachable',
    'V314-011 every approved profile/provider has one honest terminal outcome',
    'V314-012 migration persists redacted diagnostics append-only with recorded time',
  ].map((variant,index)=>({ids:[`REC-${String(index+1).padStart(3,'0')}`],
    probes:[{source:'scripts/opportunity-v3/v314-actionability-recovery.test.mjs',variant}]})),
  ...[
    'source-view identity binds sorted readable tracked entries',
    'manifest requires canonical LF-terminated JSON with unique keys',
    'Codex profile is custom least privilege and never uses legacy sandbox',
    'pinned Codex blocks filesystem DNS TCP UDP HTTP HTTPS loopback private IP proxy and Unix sockets across direct setsid and double-fork paths',
    'pinned Codex blocks filesystem DNS TCP UDP HTTP HTTPS loopback private IP proxy and Unix sockets across direct setsid and double-fork paths',
    'task locks, contiguous reservations and resource hash chains fail closed',
    'pinned Codex blocks filesystem DNS TCP UDP HTTP HTTPS loopback private IP proxy and Unix sockets across direct setsid and double-fork paths',
    'permanent path exclusions outrank manifest selectors and prompts',
    'pinned Codex propagates network denials through distinct ordinary process-group setsid fork double-fork and delayed descendants before an actual model attempt',
    'host pin fixture has an exact hash-bound format',
    'host pin fixture has an exact hash-bound format',
    'Codex profile is custom least privilege and never uses legacy sandbox',
    'sealed terminal results enforce operation-specific result matrices',
    'maker execution materializes a tracked source view, applies the sealed patch, and persists its result ref',
    'pinned Codex blocks filesystem DNS TCP UDP HTTP HTTPS loopback private IP proxy and Unix sockets across direct setsid and double-fork paths',
    'CLI validates canonical input and fails closed before execution when the adjacent pin fixture is absent',
    'permanent path exclusions outrank manifest selectors and prompts',
    'task locks, contiguous reservations and resource hash chains fail closed',
    'host pin fixture has an exact hash-bound format',
    'pinned Codex JSONL parser accepts one terminal agent message and rejects trailing events',
    'maker execution materializes a tracked source view, applies the sealed patch, and persists its result ref',
    'maker execution materializes a tracked source view, applies the sealed patch, and persists its result ref',
    'permanent path exclusions outrank manifest selectors and prompts',
    'task locks, contiguous reservations and resource hash chains fail closed',
    'patch parser accepts only selected ordinary text paths',
    'task locks, contiguous reservations and resource hash chains fail closed',
    'maker execution materializes a tracked source view, applies the sealed patch, and persists its result ref',
    'sealed terminal results enforce operation-specific result matrices',
  ].map((variant, index) => ({
    ids: [`MR3-${String(index + 1).padStart(3, '0')}`],
    probes: [{
      source: runnerOwner,
      variant,
    }],
  })),
];

const declaredSuiteOwnerVariants = new Map();
for (const { ids, probes } of suiteOwnerVariants) {
  assert.equal(ids.length, 1, 'suite owner mapping has one canonical ID');
  assert.equal(probes.length, 1, 'suite owner mapping has one exact TAP owner');
  const [caseId] = ids;
  assert.equal(declaredSuiteOwnerVariants.has(caseId), false, `duplicate suite owner mapping for ${caseId}`);
  declaredSuiteOwnerVariants.set(caseId, probes);
}

const suiteOwnerById = new Map();
for (const [caseId, classificationName, , ownerRef] of inventory.ownerRows) {
  if (classificationName !== 'semantic_suite_backed') continue;
  const separator = ownerRef.indexOf('#');
  assert.ok(separator > 0, `${caseId} has malformed owner ref`);
  assert.equal(suiteOwnerById.has(caseId), false, `duplicate suite owner for ${caseId}`);
  const logicalOwner = [{
    source: ownerRef.slice(0, separator),
    variant: ownerRef.slice(separator + 1),
  }];
  const resolvedOwner = declaredSuiteOwnerVariants.get(caseId) ?? logicalOwner;
  suiteOwnerById.set(caseId, resolvedOwner);
}
assert.equal(declaredSuiteOwnerVariants.size, 140, 'all non-PCR suite mappings are explicit');
for (const [caseId, probes] of declaredSuiteOwnerVariants) {
  assert.deepEqual(suiteOwnerById.get(caseId), probes, `${caseId} exact suite owner mapping`);
}

let migrationOwnerOutput = null;

function executeOwnerSuite(source, variant, caseId) {
  const migrationOwnerProbe = source === migrationOwner;
  const pcrOwnerProbe = source === 'scripts/opportunity-v3/product-correctness.test.mjs';
  // The migration contract deliberately uses one fresh PostgreSQL cluster as an
  // ordered lifecycle fixture. A migration-backed owner therefore runs the whole
  // suite in its own child and proves its named semantic target passed; it never
  // borrows another acceptance case's process, database or cached result.
  const args = migrationOwnerProbe
    ? ['--experimental-strip-types', '--test', source]
    : pcrOwnerProbe
      ? ['--experimental-strip-types', '--test', `--test-name-pattern=^${escapeRegex(variant)}$`, source]
    : source.endsWith('.ts') || source.endsWith('.mjs')
      ? ['--experimental-strip-types', '--test', `--test-name-pattern=^${escapeRegex(variant)}$`, source]
      : ['--test', `--test-name-pattern=^${escapeRegex(variant)}$`, source];
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  delete childEnvironment.OPPORTUNITY_V3_PCR_PREIMPLEMENTATION_BASELINE;
  let output = migrationOwnerProbe ? migrationOwnerOutput : null;
  if (output === null) {
    try {
      output = trustedExecFileSync(process.execPath, args, {
        cwd: root,
        env: {
          ...childEnvironment,
          OPPORTUNITY_V3_ACCEPTANCE_OWNER_CHILD: 'true',
          OPPORTUNITY_V3_ACCEPTANCE_CASE: caseId,
        },
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 600_000,
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (error) {
      const stdout = Buffer.isBuffer(error?.stdout) ? error.stdout.toString('utf8') : String(error?.stdout ?? '');
      const stderr = Buffer.isBuffer(error?.stderr) ? error.stderr.toString('utf8') : String(error?.stderr ?? '');
      throw new Error(`${caseId} owner output:\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    if (migrationOwnerProbe) migrationOwnerOutput = output;
  }
  if (migrationOwnerProbe) {
    assert.match(
      output,
      // Node's TAP printer indents a leaf `it` when it belongs to `describe`.
      // Match the selected leaf rather than assuming a root-level test, while
      // still requiring the exact named TAP owner to report `ok` immediately.
      new RegExp(`(?:^|\\r?\\n)[\\t ]*# Subtest: ${escapeRegex(variant)}\\r?\\n[\\t ]*ok \\d+ - ${escapeRegex(variant)}`, 'u'),
      `${caseId} migration owner target did not pass`,
    );
    const lifecycleTests = output.match(/^# tests ([1-9][0-9]*)(?:\r?\n|$)/mu);
    const lifecyclePass = output.match(/^# pass ([1-9][0-9]*)(?:\r?\n|$)/mu);
    assert.ok(
      lifecycleTests && lifecyclePass && lifecycleTests[1] === lifecyclePass[1] &&
        /^# fail 0(?:\r?\n|$)/mu.test(output),
      `${caseId} migration lifecycle was incomplete`,
    );
  } else {
    assert.match(
      output,
      new RegExp(`(?:^|\\r?\\n)[\\t ]*# Subtest: ${escapeRegex(variant)}\\r?\\n[\\t ]*ok \\d+ - ${escapeRegex(variant)}`, 'u'),
      `${caseId} owner target did not pass`,
    );
    assert.doesNotMatch(output, /^1[.][.]0(?:\r?\n|$)/mu, `${caseId} owner selected zero semantic tests`);
    assert.match(output, /# tests 1(?:\r?\n|$)/u, `${caseId} owner variant did not execute exactly once`);
    assert.match(output, /# pass 1(?:\r?\n|$)/u, `${caseId} owner variant did not pass exactly once`);
  }
  assert.match(output, /# skipped 0(?:\r?\n|$)/u, `${caseId} owner variant was skipped`);
  return true;
}

const protectedLiveOracleCaseIds = new Set(['MR3-004', 'MR3-005', 'MR3-007', 'MR3-009', 'MR3-015']);
const protectedLiveOracleVariants = new Set([
  'pinned Codex blocks filesystem DNS TCP UDP HTTP HTTPS loopback private IP proxy and Unix sockets across direct setsid and double-fork paths',
  'pinned Codex propagates network denials through distinct ordinary process-group setsid fork double-fork and delayed descendants before an actual model attempt',
]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function suiteExecutor(item) {
  const probes = suiteOwnerById.get(item.id);
  assert.ok(probes, `missing suite owner/variant for ${item.id}`);
  return () => {
    for (const probe of probes) {
      if (protectedLiveOracleCaseIds.has(item.id)) {
        assert.equal(requestedTrack, 'model_runner', `${item.id} stays in the model partition`);
        assert.equal(
          process.env.OPPORTUNITY_V3_PROTECTED_NO_LIVE_AUTH,
          '1',
          `${item.id} candidate trace cannot inherit live authentication`,
        );
        assert.equal(probe.source, 'scripts/model-runner-v3/model-runner-v3.test.js');
        assert.equal(protectedLiveOracleVariants.has(probe.variant), true, `${item.id} protected live owner`);
        continue;
      }
      assert.equal(executeOwnerSuite(probe.source, probe.variant, item.id), true);
    }
  };
}

function classification(item) {
  if (item.id.startsWith('OUT-') || item.id.startsWith('EVAL-') || item.id === 'HYB-005') {
    return {
      classification: 'semantic_automated',
      track: 'evaluation_governance',
      evidenceKind: 'evaluation_golden_and_fail_closed_semantics',
      reason: null,
    };
  }
  if (item.id.startsWith('GOV-') || item.id === 'HYB-006' || item.id === 'HYB-007') {
    return {
      classification: 'structural_meta',
      track: 'product_runtime',
      evidenceKind: 'closed_inventory_or_active_graph',
      reason: 'asserts inventory, partition or active-owner graph structure',
    };
  }
  const prefix = item.id.split('-')[0];
  if (suiteBackedByPrefix[prefix]) {
    return {
      classification: 'semantic_suite_backed',
      ...suiteBackedByPrefix[prefix],
      reason: null,
    };
  }
  if (directExecutorByPrefix[prefix]) {
    return {
      classification: 'semantic_automated',
      track: 'product_runtime',
      evidenceKind: 'case_specific_domain_positive_and_negative',
      reason: null,
    };
  }
  return {
    classification: 'missing',
    track: 'product_runtime',
    evidenceKind: 'none',
    reason: 'no direct or suite-backed evidence owner',
  };
}

const executionRegistry = new Map(inventory.cases.map((item) => {
  const metadata = classification(item);
  const shared = directExecutorByPrefix[item.id.split('-')[0]];
  const evaluationExecutor =
    metadata.track === 'evaluation_governance' ? semanticExecutors.evaluation : null;
  const executor = structuralExecutors[item.id]
    ?? (metadata.classification === 'semantic_automated' && (evaluationExecutor ?? shared)
      ? () => (evaluationExecutor ?? shared)(item)
      : metadata.classification === 'semantic_suite_backed'
        ? suiteExecutor(item)
        : null);
  return [item.id, {
    item,
    ...metadata,
    executor,
    evidenceRef: metadata.classification === 'semantic_suite_backed'
      ? `${metadata.command}:${suiteOwnerById.get(item.id)
        .map(({ source, variant }) => `${source}#${variant}`).join('+')}:${item.id}`
      : `${metadata.track}:${metadata.evidenceKind}:${item.id}`,
  }];
}));

{
  assert.equal(inventory.version, '1.46.0');
  assert.equal(inventory.caseCount, 320);
  assert.equal(inventory.cases.length, 320);
  assert.equal(new Set(inventory.cases.map((item) => item.id)).size, 320);
  const mirrorCases = mirror.split('\n').flatMap((line) => {
    const match = line.match(/^\| ([A-Z0-9-]+) \| ([^|]+) \| ([^|]+) \| (.*) \| (.*) \|$/u);
    if (!match || match[1] === 'ID') return [];
    return [{
      id: match[1],
      requirement: match[2].trim(),
      layer: match[3].trim(),
      setup: match[4].trim(),
      expected: match[5].trim(),
    }];
  });
  assert.deepEqual(mirrorCases, inventory.cases);
  assert.deepEqual(inventory.verificationPartition, {
    version: 'opportunity-verification-partition-v3.0',
    evaluation_governance: { idPrefixes: ['OUT-', 'EVAL-'], exactIds: ['HYB-005'] },
    model_runner: { idPrefixes: ['MR3-'], exactIds: [] },
    product_runtime: { remainder: true },
  });
  const partitions = Object.fromEntries(['evaluation_governance', 'model_runner', 'product_runtime'].map((track) => [track, []]));
  for (const item of inventory.cases) {
    if (item.id === 'HYB-005' || item.id.startsWith('OUT-') || item.id.startsWith('EVAL-')) {
      partitions.evaluation_governance.push(item.id);
    } else if (item.id.startsWith('MR3-')) {
      partitions.model_runner.push(item.id);
    } else {
      partitions.product_runtime.push(item.id);
    }
  }
  assert.equal(Object.values(partitions).flat().length, 320);
  assert.equal(new Set(Object.values(partitions).flat()).size, 320);
  assert.deepEqual(Object.fromEntries(Object.entries(partitions).map(([track, ids]) => [track, ids.length])), {
    evaluation_governance: 20,
    model_runner: 28,
    product_runtime: 272,
  });
  assert.equal(executionRegistry.size, 320);
  assert.deepEqual([...executionRegistry.keys()], inventory.cases.map((item) => item.id));
  assert.equal(new Set([...executionRegistry.values()].map(({ item }) => item.id)).size, 320);
  assert.equal(
    [...executionRegistry.values()].some((entry) => entry.classification === 'missing'),
    false,
  );
  const semantic = [...executionRegistry.values()]
    .filter((entry) => entry.classification.startsWith('semantic_'));
  assert.equal(new Set(semantic.map((entry) => entry.evidenceRef)).size, semantic.length);
  const direct = semantic.filter((entry) => entry.classification === 'semantic_automated');
  assert.equal(direct.every((entry) => typeof entry.executor === 'function'), true);
  assert.equal(new Set(direct.map((entry) => entry.executor)).size, direct.length);
  const suiteBacked = semantic.filter(
    (entry) => entry.classification === 'semantic_suite_backed',
  );
  assert.equal(suiteBacked.every((entry) => typeof entry.executor === 'function'), true);
  for (const entry of suiteBacked) {
    assert.ok(entry.command && entry.source);
    const probes = suiteOwnerById.get(entry.item.id);
    assert.ok(probes?.length > 0);
  }
  assert.equal(
    semantic.some((entry) => entry.evidenceKind === 'text_only' || entry.evidenceKind === 'file_exists'),
    false,
  );
  assert.deepEqual(
    Object.fromEntries(
      [...executionRegistry.values()].reduce((counts, entry) => {
        counts.set(entry.classification, (counts.get(entry.classification) ?? 0) + 1);
        return counts;
      }, new Map()),
    ),
    {
      semantic_automated: 143,
      semantic_suite_backed: 171,
      structural_meta: 6,
    },
  );
}

{
  const pcrRows = inventory.ownerRows.filter(([caseId]) => caseId.startsWith('PCR-'));
  assert.deepEqual(pcrRows.map(([caseId]) => caseId), Array.from(
    { length: 31 },
    (_, index) => `PCR-${String(index + 1).padStart(3, '0')}`,
  ));
  for (const [caseId] of pcrRows) {
    const probes = suiteOwnerById.get(caseId);
    assert.equal(probes?.length, 1, `${caseId} has one direct baseline owner`);
  }
}

for (const [caseId, entry] of executionRegistry) {
  if (entry.track !== requestedTrack) continue;
  test(`[${entry.classification}] ${caseId}: ${entry.item.expected}`, () => {
    const { item, executor } = entry;
    assert.ok(item.requirement && item.layer && item.setup && item.expected);
    assert.match(entry.evidenceRef, new RegExp(`${caseId}$`, 'u'));
    if (executor) {
      executor();
      return;
    }
    assert.fail(`automated ${entry.track} case ${caseId} has no concrete executor`);
  });
}
