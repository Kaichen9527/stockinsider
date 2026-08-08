'use strict';

const { immutableBundle, invariant } = require('./codec');
const { pageSelectedRevisionCursor } = require('./source-revision-pagination');
const { writeRevisionEvidenceOutcomes } = require('./source-claim-extraction');
const { buildCandidateFunnel } = require('./candidate-funnel');
const { appendAnalysisRevision } = require('./analysis-revision');
const { publishCompactRadarProjection } = require('./compact-radar-projection');

// The DB adapter is intentionally narrow: PostgreSQL owns the lease, idempotency
// key and transaction; this worker never receives a service-role escape hatch.
async function executeSourceRunTransaction({ occurrence, revisions, resolveInstrument, adapter, seedSymbols, priorLedger = [], now }) {
  invariant(occurrence?.scheduledOccurrenceId && occurrence?.configHash, 'occurrence identity required');
  invariant(adapter && typeof adapter.transaction === 'function', 'transactional runtime adapter required');
  return adapter.transaction(async (tx) => {
    const run = await tx.acquireOccurrence({ occurrence, idempotencyKey: occurrence.scheduledOccurrenceId });
    if (run.terminal) return { disposition: 'reused_terminal_run', run };
    const pages = [];
    let cursor = null;
    do {
      const page = pageSelectedRevisionCursor({ revisions, after: cursor });
      pages.push(page.page);
      cursor = page.nextCursor;
    } while (cursor);
    const frozenRoot = immutableBundle('legacy_source_revision_root_v3_11', pages.map((page) => ({ hash: page.hash, rowCount: page.rowCount })));
    await tx.persistFrozenAuthority({ runId: run.id, occurrence, root: frozenRoot, pages });
    const outcomes = [];
    for (const revision of revisions.slice(0, 1000)) {
      const mentions = revision.mentions || [];
      const parsed = writeRevisionEvidenceOutcomes({ revision, mentions, resolveInstrument });
      await tx.persistRevisionOutcomes({ runId: run.id, revisionId: revision.revisionId, parsed });
      outcomes.push(...parsed.outcomes);
    }
    const funnel = buildCandidateFunnel({ outcomes, seedSymbols, priorLedger });
    await tx.persistCandidateInput({ runId: run.id, bundle: funnel.candidateInput, ledger: funnel.candidateLedger });
    const revisionsOut = [];
    for (const candidate of funnel.candidateLedger) {
      const prior = await tx.readPriorRevision({ stockId: candidate.stockId });
      const revision = appendAnalysisRevision({ priorRevision: prior, input: { sourceEvidence: candidate.materialEvidenceHash, facts: candidate.facts ?? null }, changedBecause: [candidate.reason], now });
      await tx.persistAnalysisRevision({ runId: run.id, stockId: candidate.stockId, revision });
      revisionsOut.push({ ...candidate, ...revision.revision, action: 'valuation_review', valuation: { status: 'valuation_review' } });
    }
    const projection = publishCompactRadarProjection({ decisions: revisionsOut, window: 'daily', asOf: occurrence.sourceCutoff, producerIdentity: { configHash: occurrence.configHash, runId: run.id } });
    await tx.persistProjection({ runId: run.id, projection });
    await tx.terminalizeRun({ runId: run.id, status: 'success', frozenRootHash: frozenRoot.hash });
    return Object.freeze({ disposition: 'success', runId: run.id, frozenRoot, funnel, projection });
  });
}

module.exports = { executeSourceRunTransaction };
