'use strict';

const { canonicalJson, sha256 } = require('./codec');

function finite(value) { return Number.isFinite(value) ? value : null; }
function text(value, maximum = 240) {
  return typeof value === 'string' && value.trim().length > 0 ? [...value.trim()].slice(0, maximum).join('') : null;
}
function boundedStrings(values, maximum = 3) {
  return (Array.isArray(values) ? values : []).map((value) => text(value)).filter(Boolean).slice(0, maximum);
}
function percent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 10) / 10}%` : null;
}

function gateWaterfall({ provenance, valuation, technicalState, fundamental, liquidityScore, missingAxes = [] }) {
  const missing = new Set((Array.isArray(missingAxes) ? missingAxes : []).filter((value) => typeof value === 'string'));
  const sourceReady = Boolean(provenance?.sourceKey && provenance?.sourceUrl);
  const valuationReady = [valuation.currentPe, valuation.historyPeMedian, valuation.sectorPe]
    .every((value) => Number.isFinite(value));
  return Object.freeze([
    Object.freeze({ gate: 'source', status: sourceReady ? 'pass' : 'missing',
      reason: sourceReady ? 'authorized_linked_source' : 'authorized_linked_source_required' }),
    Object.freeze({ gate: 'fundamental', status: Number.isFinite(fundamental.yoyGrowth) ? 'pass' : 'missing',
      reason: Number.isFinite(fundamental.yoyGrowth) ? 'official_revenue_available' : 'official_fundamental_data_required' }),
    Object.freeze({ gate: 'valuation', status: valuationReady ? 'pass' : 'missing',
      reason: valuationReady ? 'official_relative_valuation_available' : 'official_valuation_history_and_peer_data_required' }),
    Object.freeze({ gate: 'technical', status: technicalState ? 'pass' : 'missing',
      reason: technicalState ? `technical_${technicalState}` : 'adjusted_ohlcv_history_required' }),
    Object.freeze({ gate: 'liquidity', status: Number.isFinite(liquidityScore) ? 'pass' : 'missing',
      reason: Number.isFinite(liquidityScore) ? 'official_turnover_available' : 'official_turnover_data_required' }),
  ].map((row) => missing.has(row.gate) ? Object.freeze({ ...row, status: 'missing', reason: `${row.gate}_data_required` }) : row));
}

// The snapshot is a read-only, evidence-bound detail view.  It intentionally
// contains no sizing and never upgrades action authority.
function buildResearchSnapshotV317({ candidate = {}, decision = {}, researchScore = {}, sourceCutoff = null,
  researchNextStep = null } = {}) {
  const price = finite(researchScore?.priceContext?.currentPrice ?? decision.currentPrice);
  const axes = researchScore?.axes ?? {};
  const valuationAxis = axes.valuation ?? {};
  const timing = axes.timing ?? {};
  const fundamental = axes.fundamental ?? {};
  const provenance = candidate.sourceProvenance ?? {
    sourceKey: candidate.sourceKey ?? null,
    sourceName: candidate.sourceName ?? null,
    sourceUrl: candidate.sourceUrl ?? null,
    publishedAt: candidate.sourcePublishedAt ?? candidate.claimAsOf ?? null,
    collectedAt: candidate.sourceCollectedAt ?? null,
  };
  const technicalState = decision.technical?.technicalState ?? researchScore?.priceContext?.technicalState ?? null;
  const valuation = {
    currentPe: finite(valuationAxis.currentPe), historyPeMedian: finite(valuationAxis.historyPeMedian),
    sectorPe: finite(valuationAxis.sectorPe), asOf: valuationAxis.asOf ?? null,
    provisionalRelativeValue: valuationAxis.provisionalRelativeValue ?? null,
  };
  const thesis = boundedStrings(decision.decisionBrief?.thesis ?? decision.thesis ?? decision.positiveReasons);
  const risks = boundedStrings(decision.decisionBrief?.risks ?? decision.risks ?? decision.riskReasons);
  if (thesis.length === 0 && text(candidate.sourceSummary)) thesis.push(`來源訊號：${text(candidate.sourceSummary, 180)}`);
  if (thesis.length < 3 && percent(fundamental.yoyGrowth)) thesis.push(`官方營收年增：${percent(fundamental.yoyGrowth)}`);
  if (thesis.length < 3 && technicalState) thesis.push(`技術狀態：${technicalState}`);
  const missingAxes = Array.isArray(decision.researchRanking?.missingAxes) ? decision.researchRanking.missingAxes : [];
  if (risks.length === 0 && missingAxes.length > 0) risks.push(`尚缺資料：${missingAxes.join('、')}`);
  if (risks.length < 3 && researchNextStep?.reason) risks.push(`下一步條件：${researchNextStep.reason}`);
  const waterfall = gateWaterfall({ provenance, valuation, technicalState, fundamental,
    liquidityScore: candidate.liquidityScore ?? decision.liquidityScore, missingAxes });
  const material = {
    symbol: candidate.symbol ?? decision.symbol ?? null,
    currentPrice: price,
    valuation,
    technical: {
      state: technicalState,
      bias20Pct: finite(researchScore?.priceContext?.bias20Pct), bias60Pct: finite(researchScore?.priceContext?.bias60Pct),
      bias120Pct: finite(researchScore?.priceContext?.bias120Pct), rsi14: finite(researchScore?.priceContext?.rsi14),
      macd: finite(researchScore?.priceContext?.macd), atr: finite(researchScore?.priceContext?.atr),
      volumeRatio20: finite(researchScore?.priceContext?.volumeRatio20),
      relativeStrength20Pct: finite(researchScore?.priceContext?.relativeStrength20Pct),
      trigger: decision.technical?.trigger ?? null, invalidation: decision.technical?.invalidation ?? null,
    },
    fundamental: {
      revenueYoy: finite(fundamental.yoyGrowth), qualityScore: finite(fundamental.score),
      thesis: thesis.slice(0, 3), risks: risks.slice(0, 3),
    },
    gateWaterfall: waterfall, provenance, sourceCutoff, researchNextStep,
  };
  return Object.freeze({
    version: 'research-snapshot-v3.17.0',
    snapshotId: `research-v3.17:${sha256(canonicalJson(material))}`,
    ...material,
  });
}

module.exports = { buildResearchSnapshotV317 };
