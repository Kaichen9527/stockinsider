'use strict';

const { canonicalJson, immutableBundle, invariant, sha256 } = require('./codec');
const { deriveDiscoveryDisposition } = require('./discovery-disposition');

const SOURCE_CLASS_PRIORITY = Object.freeze({ official: 100, public_research: 85, curated_thesis: 70, community: 50 });

function discoveryPriority(outcome, disposition) {
  const source = Number.isFinite(outcome.sourcePriority)
    ? Math.max(0, Math.min(100, Number(outcome.sourcePriority)))
    : SOURCE_CLASS_PRIORITY[outcome.sourceClass] ?? 0;
  const evidence = disposition.disposition === 'promoted' ? 10 : disposition.disposition === 'refreshed' ? 5 : 0;
  return source + evidence;
}

function effectiveTimestamp(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function buildCandidateFunnel({ outcomes, seedSymbols, priorLedger, sourceAvailable = true }) {
  const candidates = [];
  for (const outcome of outcomes) {
    if (outcome.link?.disposition !== 'linked' || outcome.claimEligible === false) continue;
    const materialEvidenceHash = sha256(canonicalJson([outcome.link.stockId, outcome.claimId, outcome.raw]));
    const disposition = deriveDiscoveryDisposition({ linked: outcome.link, seedSymbols, priorLedger, evidenceHash: materialEvidenceHash, sourceAvailable });
    candidates.push({
      stockId: outcome.link.stockId,
      symbol: outcome.link.symbol,
      claimId: outcome.claimId,
      claimAsOf: outcome.claimAsOf ?? null,
      mentionId: outcome.mentionId,
      sourceKey: outcome.sourceKey ?? null,
      revisionId: outcome.revisionId ?? null,
      canonicalSector: outcome.canonicalSector ?? 'unknown',
      sourceClass: outcome.sourceClass ?? 'community',
      sourcePriority: discoveryPriority(outcome, disposition),
      raw: outcome.raw,
      materialEvidenceHash,
      ...disposition,
    });
  }
  const deduped = candidates.sort((left, right) => right.sourcePriority - left.sourcePriority
      || effectiveTimestamp(right.claimAsOf) - effectiveTimestamp(left.claimAsOf)
      || String(right.revisionId ?? '').localeCompare(String(left.revisionId ?? ''))
      || String(left.claimId).localeCompare(String(right.claimId))
      || left.symbol.localeCompare(right.symbol))
    .filter((candidate, index, all) => all.findIndex((other) => other.stockId === candidate.stockId) === index)
    .slice(0, 60)
    .map((candidate, index) => Object.freeze({ ...candidate, shallowSelected: index < 30, deepSelected: index < 20 }));
  const currentIds = new Set(deduped.map((candidate) => candidate.stockId));
  const prior = (priorLedger ?? []).filter((row) => row && typeof row === 'object');
  const added = deduped.filter((row) => row.disposition === 'promoted').map((row) => row.symbol);
  const continued = deduped.filter((row) => row.disposition === 'refreshed' || row.disposition === 'unchanged')
    .map((row) => row.symbol);
  const exited = prior.filter((row) => typeof row.stockId === 'string' && !currentIds.has(row.stockId))
    .map((row) => row.symbol).filter((symbol) => typeof symbol === 'string').sort();
  const unchangedReasons = deduped.filter((row) => row.disposition === 'unchanged')
    .map((row) => ({ symbol: row.symbol, reason: row.reason })).sort((a, b) => a.symbol.localeCompare(b.symbol));
  return Object.freeze({
    candidateLedger: deduped,
    candidateInput: immutableBundle('candidate_input_v3_11', deduped),
    discoverySummary: {
      promoted: deduped.filter((row) => row.disposition === 'promoted').length,
      refreshed: deduped.filter((row) => row.disposition === 'refreshed').length,
      unchanged: deduped.filter((row) => row.disposition === 'unchanged').length,
      sourceSignals: deduped.filter((row) => row.researchDisposition === 'source_signal_only').length,
      rejected: outcomes.filter((row) => row.link?.disposition !== 'linked' || row.claimEligible === false).length,
    },
    discoveryDelta: Object.freeze({ added, exited, continued, unchangedReasons }),
  });
}

function selectLiveDiscoveryCards({ candidateLedger, totalOutage = false }) {
  if (totalOutage) return { cards: [], fallback: 'total_outage_zero_cards' };
  invariant(candidateLedger.length <= 60, 'candidate projection bound');
  return {
    cards: candidateLedger.filter((candidate) => candidate.disposition !== 'rejected').map((candidate) => ({
      symbol: candidate.symbol,
      researchMaturity: 'source_signal',
      newPositionAction: 'valuation_review',
      changedBecause: candidate.reason,
      sourceClass: candidate.sourceClass ?? 'community',
      valuationStatus: 'pending',
      technicalState: 'unavailable',
    })),
    fallback: null,
  };
}

module.exports = { buildCandidateFunnel, discoveryPriority, selectLiveDiscoveryCards };
