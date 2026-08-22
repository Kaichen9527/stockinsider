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

function sessionId(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
}

function retainedSessionCount(prior, currentSession, completedSessions) {
  const current=sessionId(currentSession);
  // A retry has the same frozen source cutoff. It must replay the exact
  // ledger rather than consume another retention session merely because the
  // worker was interrupted after candidate_funnel completed.
  if(current&&sessionId(prior?.retentionCountedThroughSession)===current)
    return Number.isInteger(prior?.retainedSessionCount)&&prior.retainedSessionCount>=0
      ?prior.retainedSessionCount:0;
  const priorSession=sessionId(prior?.retentionCountedThroughSession)
    ??sessionId(prior?.lastObservedSession);
  const sessions=(Array.isArray(completedSessions)?completedSessions:[])
    .map((row)=>typeof row==='string'?row:row?.session).filter(sessionId);
  const priorIndex=priorSession?sessions.lastIndexOf(priorSession):-1;
  const currentIndex=current?sessions.lastIndexOf(current):-1;
  // The transaction owns a single completed trading-session occurrence.  When
  // its bounded calendar slice does not include an older observation, the
  // persisted count advances by exactly one; it never infers sessions from
  // wall-clock days or a future calendar.
  if(priorIndex>=0&&currentIndex>=priorIndex)return currentIndex-priorIndex;
  return Number.isInteger(prior?.retainedSessionCount)&&prior.retainedSessionCount>=0
    ?prior.retainedSessionCount+1:1;
}

function retainedCandidate(prior,{currentSession,completedSessions,retentionSessions,sourceAvailable}) {
  const retained=retainedSessionCount(prior,currentSession,completedSessions);
  if(retained>retentionSessions)return null;
  const evidence=Array.isArray(prior.evidence)?prior.evidence:[];
  return Object.freeze({ ...prior,
    firstObservedSession:sessionId(prior.firstObservedSession)??sessionId(prior.lastObservedSession)??sessionId(currentSession),
    lastObservedSession:sessionId(prior.lastObservedSession)??sessionId(currentSession),
    retentionCountedThroughSession:sessionId(currentSession)
      ??sessionId(prior.retentionCountedThroughSession)??sessionId(prior.lastObservedSession),
    retainedSessionCount:retained,
    disposition:'unchanged',
    reason:sourceAvailable?'source_evidence_retained_within_20_sessions':'source_unavailable_retained_last_good',
    sourcePriority:Number.isFinite(prior.sourcePriority)?Math.max(0,prior.sourcePriority-0.01):0,
    evidence:Object.freeze(evidence),
    evidenceCount:Number.isInteger(prior.evidenceCount)?prior.evidenceCount:evidence.length,
  });
}

function buildCandidateFunnel({ outcomes, seedSymbols, priorLedger, sourceAvailable = true,
  currentSession = null, completedSessions = [], retentionSessions = 20 }) {
  invariant(Number.isInteger(retentionSessions)&&retentionSessions>0&&retentionSessions<=60,'candidate retention bound');
  const observations = [];
  for (const outcome of outcomes) {
    if (outcome.link?.disposition !== 'linked' || outcome.claimEligible === false) continue;
    const evidenceHash = sha256(canonicalJson([outcome.link.stockId, outcome.claimId, outcome.raw]));
    observations.push({
      stockId: outcome.link.stockId,
      symbol: outcome.link.symbol,
      name: outcome.name ?? null,
      claimId: outcome.claimId,
      claimAsOf: outcome.claimAsOf ?? null,
      mentionId: outcome.mentionId,
      sourceKey: outcome.sourceKey ?? null,
      revisionId: outcome.revisionId ?? null,
      canonicalSector: outcome.canonicalSector ?? 'unknown',
      sourceClass: outcome.sourceClass ?? 'community',
      sourcePriority: discoveryPriority(outcome, { disposition: 'unchanged' }),
      raw: outcome.raw,
      sourceSummary: outcome.sourceSummary ?? null,
      sourceUrl: outcome.sourceUrl ?? null,
      sourceName: outcome.sourceName ?? null,
      kolIdentity: outcome.kolIdentity ?? null,
      sourcePublishedAt: outcome.sourcePublishedAt ?? outcome.claimAsOf ?? null,
      sourceCollectedAt: outcome.sourceCollectedAt ?? null,
      evidenceHash,
    });
  }
  const ordered = observations.sort((left, right) => right.sourcePriority - left.sourcePriority
      || effectiveTimestamp(right.claimAsOf) - effectiveTimestamp(left.claimAsOf)
      || String(right.revisionId ?? '').localeCompare(String(left.revisionId ?? ''))
      || String(left.claimId).localeCompare(String(right.claimId))
      || left.symbol.localeCompare(right.symbol));
  const byStock = new Map();
  for (const observation of ordered) {
    const selected = byStock.get(observation.stockId) ?? [];
    selected.push(observation);
    byStock.set(observation.stockId, selected);
  }
  const candidates = [...byStock.values()].map((evidence) => {
    const representative = evidence[0];
    const materialEvidenceHash = sha256(canonicalJson(evidence.map((row) => ({
      claimId: row.claimId, evidenceHash: row.evidenceHash, revisionId: row.revisionId,
      sourceKey: row.sourceKey, claimAsOf: row.claimAsOf,
    }))));
    const disposition = deriveDiscoveryDisposition({ linked: { disposition: 'linked', stockId: representative.stockId,
      symbol: representative.symbol }, seedSymbols, priorLedger, evidenceHash: materialEvidenceHash, sourceAvailable });
    return { ...representative, sourcePriority: discoveryPriority(representative, disposition), materialEvidenceHash,
      evidence: evidence.map((row) => Object.freeze({ claimId: row.claimId, mentionId: row.mentionId,
        revisionId: row.revisionId, sourceKey: row.sourceKey, sourceClass: row.sourceClass,
        sourcePriority: row.sourcePriority, claimAsOf: row.claimAsOf, raw: row.raw,
        sourceSummary: row.sourceSummary, sourceUrl: row.sourceUrl, sourceName: row.sourceName,
        kolIdentity: row.kolIdentity, sourcePublishedAt: row.sourcePublishedAt,
        sourceCollectedAt: row.sourceCollectedAt, evidenceHash: row.evidenceHash })),
      evidenceCount: evidence.length, ...disposition };
  });
  const currentByStock=new Map(candidates.map((candidate)=>[candidate.stockId,Object.freeze({ ...candidate,
    firstObservedSession:sessionId((priorLedger??[]).find((prior)=>prior?.stockId===candidate.stockId)?.firstObservedSession)
      ??sessionId((priorLedger??[]).find((prior)=>prior?.stockId===candidate.stockId)?.lastObservedSession)
      ??sessionId(currentSession),
    lastObservedSession:sessionId(currentSession),
    retentionCountedThroughSession:sessionId(currentSession),retainedSessionCount:0,
  })]));
  const prior = (priorLedger ?? []).filter((row) => row && typeof row === 'object');
  // A completed ledger is already bounded to the coarse-universe cap.  Keep
  // that invariant explicit: if it is ever violated, silently choosing a
  // subset would turn a persistence defect into an unexplained disappearance.
  invariant(prior.length <= 60, 'candidate retention ledger bound');
  const retained=prior.filter((prior)=>typeof prior.stockId==='string'
    &&!currentByStock.has(prior.stockId)).map((prior)=>retainedCandidate(prior,{currentSession,completedSessions,
      retentionSessions,sourceAvailable})).filter(Boolean);
  const candidateOrder=(left, right) => right.sourcePriority - left.sourcePriority
      || effectiveTimestamp(right.claimAsOf) - effectiveTimestamp(left.claimAsOf)
      || left.symbol.localeCompare(right.symbol);
  // A source-led card that remains inside its bounded 20-session retention
  // window is last-good research, not optional ranking material.  Reserving
  // its slot before admitting fresh claims prevents a burst of new evidence
  // from silently evicting it.  Fresh claims that cannot fit remain durably
  // represented by their already-persisted claim outcome and receive a typed
  // deferred disposition rather than disappearing from the audit trail.
  const reservedRetained = retained.sort(candidateOrder);
  const availableFreshSlots = 60 - reservedRetained.length;
  invariant(availableFreshSlots >= 0, 'candidate retention reservation bound');
  const orderedCurrent = [...currentByStock.values()].sort(candidateOrder);
  const admittedCurrent = orderedCurrent.slice(0, availableFreshSlots);
  const deferredCurrent = orderedCurrent.slice(availableFreshSlots).map((candidate) => Object.freeze({
    symbol: candidate.symbol,
    stockId: candidate.stockId,
    reason: 'candidate_capacity_reserved_for_retention',
  }));
  const deduped = [...admittedCurrent,...reservedRetained].sort(candidateOrder)
    .map((candidate, index) => Object.freeze({ ...candidate, shallowSelected: index < 30, deepSelected: index < 20 }));
  const currentIds = new Set(deduped.map((candidate) => candidate.stockId));
  const added = deduped.filter((row) => row.disposition === 'promoted').map((row) => row.symbol);
  const continued = deduped.filter((row) => row.disposition === 'refreshed' || row.disposition === 'unchanged')
    .map((row) => row.symbol);
  const exited = prior.filter((row) => typeof row.stockId === 'string' && !currentIds.has(row.stockId)
      &&retainedSessionCount(row,currentSession,completedSessions)>retentionSessions)
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
      deferred: deferredCurrent.length,
    },
    discoveryDelta: Object.freeze({ added, exited, continued, unchangedReasons,
      retained:deduped.filter((row)=>row.retainedSessionCount>0).map((row)=>row.symbol).sort(),
      deferred: deferredCurrent,
    }),
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

module.exports = { buildCandidateFunnel, discoveryPriority, retainedSessionCount, selectLiveDiscoveryCards };
