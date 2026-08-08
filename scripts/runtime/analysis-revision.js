'use strict';

const { canonicalJson, immutableBundle, invariant } = require('./codec');
const { hashMaterialAnalysisChange } = require('./analysis-material-change');

function appendAnalysisRevision({ priorRevision = null, input, changedBecause = [], now }) {
  invariant(typeof now === 'string' && Number.isFinite(Date.parse(now)), 'revision timestamp');
  const change = typeof input?.materialChangeHash === 'string' && /^[0-9a-f]{64}$/u.test(input.materialChangeHash)
    ? Object.freeze({ materialChangeHash: input.materialChangeHash })
    : hashMaterialAnalysisChange(input);
  if (priorRevision?.materialChangeHash === change.materialChangeHash) return Object.freeze({ disposition: 'unchanged', revision: priorRevision, materialChangeHash: change.materialChangeHash });
  const reasons = [...new Set(changedBecause)].sort();
  const revision = Object.freeze({ schema: 'analysis-revision-v3.11', revisionId: immutableBundle('analysis_revision_id', [priorRevision?.revisionId ?? null, change.materialChangeHash, now]).hash,
    predecessorRevisionId: priorRevision?.revisionId ?? null, materialChangeHash: change.materialChangeHash, materialChangedBecause: reasons,
    lastEvaluatedAt: now, analysisGeneratedAt: now, facts: input?.facts ?? null, lockedNarrativeClaims: (input?.lockedNarrativeClaims ?? []).slice().sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))) });
  return Object.freeze({ disposition: 'appended', revision, materialChangeHash: change.materialChangeHash });
}

module.exports = { appendAnalysisRevision };
