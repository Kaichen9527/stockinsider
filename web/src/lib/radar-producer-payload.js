const PRODUCER_CARD_BUCKETS = [
  'opportunities',
  'scenarioUpsideCandidates',
  'earlyWatchlist',
  'recentFormal7d',
  'fallbackOpportunities90d',
  'hotTracking',
  'partiallyVerified',
  'earlySignals',
];

const CARD_OBJECT_FIELDS = {
  confidenceScoreBreakdown: ['bridgeEvidence', 'freshness', 'scenario', 'entryReadiness', 'upsideQuality', 'sectorRotationImpact'],
  entryDecision: ['action', 'buyZone', 'stopLoss', 'invalidation', 'buyNowAllowed'],
  scenarioChecklistBreakdown: ['completed', 'total', 'score', 'status'],
  socialMentionStats: ['mentionCount', 'sourceCount', 'positiveCount', 'negativeCount', 'asOf'],
  tradeDecision: ['action', 'entryZone', 'stopLoss', 'takeProfit', 'confidence'],
};

const CARD_SCALAR_FIELDS = new Set([
  'recommendationId', 'symbol', 'name', 'chineseName', 'market', 'currentPrice',
  'priceAsOf', 'priceRefreshStatus', 'score', 'confidence', 'action', 'rationale',
  'targetPrice', 'stopLoss', 'strategyState', 'recommendationState', 'storyType',
  'thesisTitle', 'thesisSummary', 'catalystSummary', 'expectedUpsidePct',
  'verificationStatus', 'conditionalRecommendationNote', 'whyNotRecommended',
  'firstRecommendedAt', 'estimatedCatalystDate', 'evidenceAgeHours', 'lastValidatedAt',
  'recommendationBucket', 'valuationQuality', 'scenarioDriverType', 'whyNotPromoted',
  'baseTarget', 'upsideTarget', 'displayBaseUpsidePct', 'displayScenarioUpsidePct',
  'cardPrimaryUpsidePct', 'cardPrimaryUpsideLabel', 'recommendationConfidenceScore',
  'entryReadinessLabel', 'baseVerificationLabel', 'researchConfidenceScore',
  'recommendationLifecycleStage', 'whyChanged', 'candidateReason', 'candidateSourceType',
  'discoveryRunAt', 'hotTrackingReason', 'socialHitSummary', 'valuationSanityStatus',
  'baseTargetVerificationStatus', 'revaluationStatus', 'revaluationReason',
  'recommendationGateStatus', 'formalGateStatus', 'targetCoverageStatus', 'staleReason',
  'archiveReason', 'scenarioPromotionStatus', 'entryActionLabel', 'marketGateStatus',
  'whyBuyNow', 'whyExitNow', 'isActionableRecommendation', 'displayBucket',
  'displayTargetMode', 'sourceSignalSummary',
]);

const CARD_ARRAY_FIELDS = new Set([
  'entryReadinessReasons', 'sourceSignalBadges',
]);

const CONNECTOR_FIELDS = [
  'connector', 'credentialStatus', 'lastRunStatus', 'lastRunAt', 'lastSuccessAt',
  'lastRecordsWritten', 'lastErrorSummary', 'recordsWritten24h', 'failureReason',
  'workerFreshnessStatus', 'workerScriptVersion',
];

const THEME_FIELDS = [
  'themeKey', 'themeName', 'windowType', 'marketRegime', 'heatScore', 'relatedSymbols',
  'evidenceCount', 'asOfDate', 'verificationStatus', 'sourceCoverage', 'missingSources',
  'latestSourceAt', 'leadLagSpreadPct', 'overseasMomentumAsOf',
];

const RADAR_PRODUCER_MAX_BYTES = 150_000;

function compactText(value, max = 96) {
  if (typeof value !== 'string') return value;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function compactScalarArray(value, limit = 3) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item == null || ['string', 'number', 'boolean'].includes(typeof item))
    .slice(0, limit).map((item) => compactText(item, 72));
}

function selectFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value;
  return Object.fromEntries(fields.filter((field) => source[field] !== undefined).map((field) => {
    const item = source[field];
    if (Array.isArray(item)) return [field, compactScalarArray(item)];
    return [field, compactText(item, 64)];
  }));
}

function compactCard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const card = value;
  const entries = [];
  for (const [key, item] of Object.entries(card)) {
    if (CARD_SCALAR_FIELDS.has(key) && (item == null || ['number', 'boolean'].includes(typeof item))) entries.push([key, item]);
    else if (CARD_SCALAR_FIELDS.has(key) && typeof item === 'string') entries.push([key, compactText(item, 80)]);
    else if (CARD_ARRAY_FIELDS.has(key) && Array.isArray(item)) entries.push([key, compactScalarArray(item)]);
    else if (CARD_OBJECT_FIELDS[key]) entries.push([key, selectFields(item, CARD_OBJECT_FIELDS[key])]);
  }
  return Object.fromEntries(entries);
}

function compactConnector(value) {
  return selectFields(value, CONNECTOR_FIELDS);
}

function compactTheme(value) {
  return selectFields(value, THEME_FIELDS);
}

function compactReports(value) {
  if (!Array.isArray(value)) return value;
  return value.slice(0, 12).map((item) => selectFields(item, [
    'title', 'slug', 'summary', 'reportKind', 'recommendationState', 'catalystCalendar',
    'entryExitRules', 'relatedSymbols',
  ]));
}

function compactThemeHypotheses(value) {
  if (!Array.isArray(value)) return value;
  return value.slice(0, 12).map((item) => selectFields(item, [
    'themeKey', 'title', 'summary', 'assumptions', 'evidenceLevel', 'symbols', 'sourceUrls', 'updatedAt',
  ]));
}

function compactProducerRadarPayload(payload) {
  const compacted = { ...payload };
  for (const bucket of PRODUCER_CARD_BUCKETS) {
    if (Array.isArray(compacted[bucket])) compacted[bucket] = compacted[bucket].map(compactCard);
  }
  if (Array.isArray(compacted.connectorStatus)) compacted.connectorStatus = compacted.connectorStatus.map(compactConnector);
  if (compacted.sourceHealthSummary && typeof compacted.sourceHealthSummary === 'object'
      && !Array.isArray(compacted.sourceHealthSummary)) {
    const { connectorDetails: _connectorDetails, ...summary } = compacted.sourceHealthSummary;
    compacted.sourceHealthSummary = Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, compactText(value, 112)]));
  }
  if (Array.isArray(compacted.hotThemes)) compacted.hotThemes = compacted.hotThemes.map(compactTheme);
  compacted.reports = compactReports(compacted.reports);
  compacted.themeHypotheses = compactThemeHypotheses(compacted.themeHypotheses);
  if (producerRadarPayloadBytes(compacted) > RADAR_PRODUCER_MAX_BYTES) {
    throw new Error('producer_radar_payload_oversize');
  }
  return compacted;
}

function producerRadarPayloadBytes(payload) {
  return Buffer.byteLength(JSON.stringify(payload));
}

module.exports = {
  compactProducerRadarPayload,
  producerRadarPayloadBytes,
  RADAR_PRODUCER_MAX_BYTES,
};
