'use strict';

const { bounded, canonicalJson, immutableBundle, invariant, sha256 } = require('./codec');
const { serializeCorrectnessPublicUnion } = require('./public-projection');
const { selectLiveDiscoveryCards } = require('./candidate-funnel');

const CARD_BUCKETS = Object.freeze([
  'opportunities', 'scenarioUpsideCandidates', 'earlyWatchlist',
  'recentFormal7d', 'fallbackOpportunities90d', 'hotTracking',
]);

function stripCorrectnessAdditions(payload) {
  invariant(payload && typeof payload === 'object' && !Array.isArray(payload), 'legacy radar payload required');
  const clean = Object.fromEntries(Object.entries(payload).filter(([key]) => ![
    'sourceLedCorrectness', 'sourceSignals', 'discoveryDelta',
  ].includes(key)));
  for (const bucket of CARD_BUCKETS) {
    if (!Array.isArray(clean[bucket])) continue;
    clean[bucket] = clean[bucket].map((card) => {
      if (!card || typeof card !== 'object' || Array.isArray(card)) return card;
      const { researchDecision: _removed, ...legacyCard } = card;
      return legacyCard;
    });
  }
  return clean;
}

function unavailableResearchDecision(lastEvaluatedAt) {
  return Object.freeze({
    version: 'legacy-research-decision-v3.11.0', availability: 'unavailable',
    reason: 'projection_missing', researchMaturity: 'source_signal',
    newPositionAction: 'valuation_review', lastEvaluatedAt,
    analysisGeneratedAt: null, materialChangeHash: null,
    materialChangedBecause: [], noChangeMessage: null,
  });
}

function availableResearchDecision(decision) {
  return Object.freeze({
    version: 'legacy-research-decision-v3.11.0', availability: 'available',
    ...serializeCorrectnessPublicUnion(decision),
  });
}

function addResearchDecisions(legacyPayload, decisions, asOf, sourceCandidates = []) {
  const clean = stripCorrectnessAdditions(legacyPayload);
  invariant(Array.isArray(clean.opportunities), 'legacy opportunities required');
  const bySymbol = new Map(decisions.filter((decision) => typeof decision?.symbol === 'string')
    .map((decision) => [decision.symbol, decision]));
  for (const bucket of CARD_BUCKETS) {
    if (!Array.isArray(clean[bucket])) continue;
    clean[bucket] = clean[bucket].map((card) => {
      if (!card || typeof card !== 'object' || Array.isArray(card)) return card;
      const decision = bySymbol.get(card.symbol);
      return { ...card, researchDecision: decision ? availableResearchDecision(decision) : unavailableResearchDecision(asOf) };
    });
  }
  const visible = new Set(CARD_BUCKETS.flatMap((bucket) => Array.isArray(clean[bucket])
    ? clean[bucket].map((card) => card?.symbol).filter((symbol) => typeof symbol === 'string') : []));
  const signalReasons = new Set(['new_in_seed_symbol', 'new_out_of_seed_symbol', 'new_source_evidence', 'material_source_change']);
  const signalPool = [...decisions, ...sourceCandidates];
  const liveSymbols = new Set(selectLiveDiscoveryCards({ candidateLedger: signalPool }).cards.map((card) => card.symbol));
  const sourceSignals = signalPool.filter((decision) => typeof decision?.symbol === 'string'
      && liveSymbols.has(decision.symbol) && !visible.has(decision.symbol))
    .slice(0, 30).map((decision) => ({
      symbol: decision.symbol, chineseName: decision.name ?? null, researchMaturity: 'source_signal',
      newPositionAction: 'valuation_review', discoveredAt: decision.lastEvaluatedAt ?? asOf,
      sourceClass: decision.sourceClass ?? 'community', sourceSummary: String(decision.raw ?? '來源訊號待研究').normalize('NFC').replace(/[\r\n]+/gu, ' ').slice(0, 180),
      evidenceRefs: [decision.claimId].filter((value) => typeof value === 'string').slice(0, 5),
      valuationStatus: 'pending', technicalState: decision.technical?.technicalState ?? 'unavailable',
      changedBecause: signalReasons.has(decision.reason) ? decision.reason : 'new_source_evidence',
      researchDecision: bySymbol.has(decision.symbol)
        ? availableResearchDecision(decision) : unavailableResearchDecision(asOf),
    }));
  return { legacy: clean, sourceSignals };
}

function publishCompactRadarProjection({ decisions, sourceCandidates = [], discoveryDelta, window, asOf, producerIdentity, legacyPayload }) {
  invariant(['daily', 'hot', 'weekly', 'home'].includes(window), 'radar window');
  invariant(decisions.length <= 60, 'radar card bound');
  invariant(legacyPayload && typeof legacyPayload === 'object' && !Array.isArray(legacyPayload), 'legacy radar payload required');
  invariant(decisions.length + sourceCandidates.length <= 60, 'radar discovery bound');
  const layered = addResearchDecisions(legacyPayload, decisions, asOf, sourceCandidates);
  const payload = {
    ...layered.legacy,
    sourceSignals: layered.sourceSignals,
    discoveryDelta,
    sourceLedCorrectness: { schema: 'legacy-radar-v3.11.3', window, asOf, producerIdentity },
  };
  bounded(payload, 150000, 'radar payload');
  const canonical = canonicalJson(payload);
  const payloadChecksum = sha256(canonical);
  const storageWindow = window === 'hot' ? 'three_day' : window;
  return Object.freeze({
    projectionKey: `legacy-radar-v3.11:${storageWindow}:${asOf}:${payloadChecksum}`,
    storageWindow,
    payload,
    payloadChecksum,
    etag: `\"sha256:${payloadChecksum}\"`,
    producerIdentity,
    bundle: immutableBundle('legacy_radar_projection_v3_11', payload),
  });
}

module.exports = { CARD_BUCKETS, addResearchDecisions, publishCompactRadarProjection, stripCorrectnessAdditions };
