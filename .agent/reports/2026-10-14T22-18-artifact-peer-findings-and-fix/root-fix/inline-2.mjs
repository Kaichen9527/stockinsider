import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { resolveReviewedRuntimeRelease } = createRequire(import.meta.url)('./scripts/runtime/reviewed-runtime-release.js');
const release = resolveReviewedRuntimeRelease({ repositoryRoot: process.cwd(), sourceCommit: process.env.REVIEWED_SOURCE, attestationCommit: process.env.REVIEW_EVIDENCE });
assert.equal(release.commitSha, process.env.REVIEWED_SOURCE);
assert.equal(release.treeSha, process.env.REVIEWED_TREE);
assert.match(process.env.GITHUB_WORKFLOW_SHA ?? '', /^[a-f0-9]{40}$/u);
assert.match(process.env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/u);
fs.writeFileSync(process.env.RUNNER_TEMP + '/standalone-export/review-binding.json', JSON.stringify({
  sourceCommit: release.commitSha, sourceTree: release.treeSha,
  directChildEvidence: process.env.REVIEW_EVIDENCE, reviewAttestationSha256: release.reviewAttestationSha256,
  builderWorkflowSha: process.env.GITHUB_WORKFLOW_SHA, triggerCommit: process.env.GITHUB_SHA,
  builderCorrectnessReceipt: 'builder-correctness.json',
  workflowRef: process.env.GITHUB_WORKFLOW_REF, runId: process.env.GITHUB_RUN_ID,
  databaseConnectionAttempted: false, deploymentPerformed: false,
}, null, 2) + '\n', { flag: 'wx' });
