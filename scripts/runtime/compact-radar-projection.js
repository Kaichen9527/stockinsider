'use strict';

const { bounded, canonicalJson, immutableBundle, invariant, sha256 } = require('./codec');
const { serializeCorrectnessPublicUnion } = require('./public-projection');
const { selectLiveDiscoveryCards } = require('./candidate-funnel');

const CARD_BUCKETS = Object.freeze([
  'opportunities', 'scenarioUpsideCandidates', 'earlyWatchlist',
  'recentFormal7d', 'fallbackOpportunities90d', 'hotTracking',
]);

function compactPositiveReason(row) {
  const key=`${row?.axis}:${row?.reason}`;
  return ({
    'discovery:price_dislocation_scan':'d:dislocation','fundamental:official_revenue_not_deteriorating':'f:revenue_ok',
    'fundamental:official_revenue_deteriorating':'f:revenue_down','priceDislocation:large_drawdown':'p:drawdown',
    'priceDislocation:moderate_dislocation':'p:moderate','priceDislocation:extended':'p:extended',
    'valuation:pe_compared_with_sector_and_own_history':'v:sector_history','valuation:pe_compared_with_own_history':'v:history',
    'valuation:pe_compared_with_sector_reference':'v:sector','timing:below_ma20_reclaim_required':'t:reclaim',
    'timing:breakout_pending':'t:breakout_pending','timing:breakout_confirmed':'t:breakout_confirmed',
    'timing:at_support':'t:at_support','timing:extended':'t:extended',
  })[key] ?? `${String(row?.axis ?? 'e').slice(0,1)}:${String(row?.reason ?? 'available').slice(0,40)}`;
}

function compactRisk(reason) {
  if (String(reason).startsWith('missing:')) return reason;
  return ({ price_must_reclaim_support_before_entry:'reclaim_first',research_coverage_below_70_percent:'coverage_lt_70',
    formal_valuation_target_unavailable:'valuation_target_missing' })[reason] ?? String(reason).slice(0,48);
}

function finiteAxisScore(score, axis) {
  const value = score?.axes?.[axis];
  return value?.trustworthy === true && Number.isFinite(value.score) ? value.score : null;
}

function derivePublicOpportunityView(decision, marketAnalysis = null) {
  const score = decision?.researchScore;
  const rawTechnicalState = score?.priceContext?.technicalState ?? score?.axes?.timing?.technicalState ?? 'unavailable';
  const bias20Pct = score?.priceContext?.bias20Pct;
  const technicalState = rawTechnicalState === 'breakout_pending' && Number.isFinite(bias20Pct)
    && bias20Pct > -3 && bias20Pct <= 1.5 ? 'at_support' : rawTechnicalState;
  const axisScores = {
    fundamental: finiteAxisScore(score, 'fundamental'),
    dislocation: finiteAxisScore(score, 'priceDislocation'),
    valuation: finiteAxisScore(score, 'valuation'),
    timing: finiteAxisScore(score, 'timing'),
  };
  const compactAxes = Object.fromEntries(Object.entries(axisScores).filter(([, value]) => Number.isFinite(value)));
  const completeRelativeCase = Number.isFinite(score?.underreactionScore) && score.underreactionScore >= 72
    && (score.coverage ?? 0) >= 0.85 && (score.confidence ?? 0) >= 0.75
    && axisScores.fundamental >= 64 && axisScores.valuation >= 58 && axisScores.dislocation >= 52;
  const selectiveHighConviction = completeRelativeCase && score.underreactionScore >= 76
    && axisScores.fundamental >= 70 && axisScores.valuation >= 68;
  const marketAllowsSetup = marketAnalysis?.status === 'risk_on'
    ? completeRelativeCase : marketAnalysis?.status === 'selective_or_defensive' && selectiveHighConviction;

  let opportunityAction = 'evidence_watch'; let actionReason = 'relative_evidence_incomplete';
  if (Number.isFinite(score?.underreactionScore) && score.underreactionScore < 35) {
    opportunityAction = 'avoid'; actionReason = 'underreaction_score_below_floor';
  } else if (technicalState === 'extended') {
    opportunityAction = 'avoid_chase'; actionReason = 'price_extended_wait_for_reset';
  } else if (!completeRelativeCase) {
    opportunityAction = 'evidence_watch'; actionReason = 'relative_evidence_incomplete';
  } else if (marketAnalysis?.status === 'data_incomplete' || !marketAnalysis) {
    opportunityAction = 'evidence_watch'; actionReason = 'market_evidence_incomplete';
  } else if (technicalState === 'reclaim_required' || technicalState === 'below_support') {
    opportunityAction = 'wait_reclaim'; actionReason = 'support_must_be_reclaimed';
  } else if (technicalState === 'breakout_pending') {
    opportunityAction = 'wait_breakout'; actionReason = 'breakout_not_confirmed';
  } else if (marketAllowsSetup && (technicalState === 'at_support' || technicalState === 'breakout_confirmed')) {
    opportunityAction = 'setup_ready';
    actionReason = marketAnalysis.status === 'risk_on'
      ? `risk_on_${technicalState}` : `selective_high_conviction_${technicalState}`;
  } else {
    opportunityAction = 'evidence_watch'; actionReason = 'market_or_timing_gate_not_met';
  }
  return Object.freeze({ opportunityAction, actionReason, technicalState, axisScores: compactAxes });
}

function normalizedMarketAnalysis(marketAnalysis) {
  if (!marketAnalysis) return null;
  const components = marketAnalysis.components ?? {};
  const indexSummary = (label, row) => row ? `${label}${row.state === 'uptrend' ? '多頭' : row.state === 'drawdown' ? '跌深' : '拉回'}${Number.isFinite(row.drawdownPct) ? `、距區間高點 ${row.drawdownPct.toFixed(1)}%` : ''}` : `${label}資料待補`;
  const breadthSummary = components.breadth && Number.isFinite(components.breadth.aboveMa20Pct)
    ? `市場廣度 ${components.breadth.aboveMa20Pct.toFixed(1)}% 站上 MA20` : '市場廣度待補';
  const foreignNet = components.foreignFlow?.net5d ?? components.foreignFlow?.net1d;
  const foreignSummary = Number.isFinite(foreignNet)
    ? `外資${Number.isFinite(components.foreignFlow?.net5d) ? '五日' : '單日'}淨${foreignNet >= 0 ? '買' : '賣'}超 ${Math.abs(foreignNet / 1e8).toFixed(1)} 億元`
    : '外資動向待補';
  const summary = [indexSummary('加權', components.taiex), indexSummary('櫃買', components.otc), breadthSummary, foreignSummary].join('；');
  const riskBudget = marketAnalysis.status === 'risk_on'
    ? '大盤允許積極選股；仍需個股相對估值與技術條件同時通過。'
    : marketAnalysis.status === 'selective_or_defensive'
      ? '只保留高信念選股候選；不追高，跌破支撐先等收復。'
      : '市場證據未完整，不形成進場候選。';
  return Object.freeze({ ...marketAnalysis, summary, riskBudget });
}

function alignLegacyMarketView(legacy, marketAnalysis) {
  if (!marketAnalysis) return legacy;
  const status = marketAnalysis.status === 'risk_on' ? 'risk_on_can_attack'
    : marketAnalysis.status === 'selective_or_defensive' ? 'selective_only' : 'market_data_missing';
  const label = marketAnalysis.status === 'risk_on' ? '趨勢與廣度支持'
    : marketAnalysis.status === 'selective_or_defensive' ? '選股／防守優先' : '大盤證據未完整';
  const existingIndex = legacy.marketIndexSignal && typeof legacy.marketIndexSignal === 'object'
    ? legacy.marketIndexSignal : {};
  const existingHighlight = legacy.marketHighlightSummary && typeof legacy.marketHighlightSummary === 'object'
    ? legacy.marketHighlightSummary : {};
  return {
    ...legacy,
    marketRegime: marketAnalysis.status === 'risk_on' ? 'risk-on' : marketAnalysis.status === 'selective_or_defensive'
      ? 'selective-risk-on' : 'live-unavailable',
    marketBreadthSummary: marketAnalysis.summary,
    marketIndexSignal: { ...existingIndex, status, label, summary: marketAnalysis.summary,
      asOf: marketAnalysis.asOf, trendScore: status === 'risk_on_can_attack' ? 80 : status === 'selective_only' ? 50 : null,
      taiexState: marketAnalysis.components?.taiex?.state ?? null,
      otcState: marketAnalysis.components?.otc?.state ?? null,
      breadthState: Number.isFinite(marketAnalysis.components?.breadth?.aboveMa20Pct)
        ? marketAnalysis.components.breadth.aboveMa20Pct >= 50 ? 'healthy' : 'weak' : null,
      foreignFlowState: Number.isFinite(marketAnalysis.components?.foreignFlow?.net5d ?? marketAnalysis.components?.foreignFlow?.net1d)
        ? (marketAnalysis.components.foreignFlow.net5d ?? marketAnalysis.components.foreignFlow.net1d) >= 0 ? 'net_buy' : 'net_sell' : null,
      riskBudget: marketAnalysis.riskBudget,
      entryBias: status === 'risk_on_can_attack' ? '優先等待個股確認' : '只做高信念確認型候選',
      exitBias: status === 'risk_on_can_attack' ? '個股失效即退出' : '支撐失效優先防守',
      reasons: marketAnalysis.missingComponents?.length ? ['market_evidence_incomplete'] : [marketAnalysis.status] },
    marketHighlightSummary: { ...existingHighlight, regimeLabel: label,
      regimeExplanation: marketAnalysis.summary, riskNote: marketAnalysis.riskBudget },
  };
}

function stripCorrectnessAdditions(payload) {
  invariant(payload && typeof payload === 'object' && !Array.isArray(payload), 'legacy radar payload required');
  const clean = Object.fromEntries(Object.entries(payload).filter(([key]) => ![
    'sourceLedCorrectness', 'sourceSignals', 'discoveryDelta', 'underreactionMarket',
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

function addResearchDecisions(legacyPayload, decisions, asOf, sourceCandidates = [], marketAnalysis = null) {
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
  const signalReasons = new Set(['new_in_seed_symbol', 'new_out_of_seed_symbol', 'new_source_evidence', 'material_source_change', 'price_dislocation']);
  const signalPool = [...decisions, ...sourceCandidates];
  const liveSymbols = new Set(selectLiveDiscoveryCards({ candidateLedger: signalPool }).cards.map((card) => card.symbol));
  const sourceSignals = signalPool.sort((left, right) => (right.researchScore?.underreactionScore ?? -1)
      - (left.researchScore?.underreactionScore ?? -1) || (right.sourcePriority ?? 0) - (left.sourcePriority ?? 0)
      || String(left.symbol ?? '').localeCompare(String(right.symbol ?? '')))
    .filter((decision) => typeof decision?.symbol === 'string'
      && liveSymbols.has(decision.symbol) && !visible.has(decision.symbol))
    .slice(0, 30).map((decision) => ({
      symbol: decision.symbol, chineseName: typeof decision.name === 'string'
        ? [...decision.name.normalize('NFC')].slice(0,20).join('') : null, researchMaturity: 'source_signal',
      newPositionAction: 'valuation_review', discoveredAt: decision.lastEvaluatedAt ?? asOf,
      sourceClass: decision.sourceClass ?? 'community', sourceSummary: [...String(decision.sourceSummary ?? decision.raw ?? '來源訊號待研究').normalize('NFC').replace(/[\r\n]+/gu, ' ')].slice(0, 100).join(''),
      evidenceRefs: [decision.claimId].filter((value) => typeof value === 'string').slice(0, 1),
      valuationStatus: 'pending', technicalState: decision.technical?.technicalState
        ?? decision.researchScore?.priceContext?.technicalState ?? 'unavailable',
      changedBecause: signalReasons.has(decision.reason) ? decision.reason : 'new_source_evidence',
      ...(marketAnalysis ? derivePublicOpportunityView(decision, marketAnalysis) : {}),
      ...(Number.isFinite(decision.researchScore?.underreactionScore) ? {
        underreactionScore: decision.researchScore.underreactionScore,
        scoreCoverage: decision.researchScore.coverage,
        scoreConfidence: decision.researchScore.confidence,
        researchDisposition: decision.researchScore.researchDisposition,
        positiveReasons: (decision.researchScore.reasons ?? []).slice(0, 2).map(compactPositiveReason),
        riskReasons: (decision.researchScore.risks ?? []).slice(0, 2).map(compactRisk),
        currentPrice: decision.researchScore.priceContext?.currentPrice ?? decision.currentPrice ?? null,
        drawdown60Pct: decision.researchScore.priceContext?.drawdown60Pct ?? null,
        drawdown120Pct: decision.researchScore.priceContext?.drawdown120Pct ?? null,
        bias20Pct: decision.researchScore.priceContext?.bias20Pct ?? null,
        bias60Pct: decision.researchScore.priceContext?.bias60Pct ?? null,
        bias120Pct: decision.researchScore.priceContext?.bias120Pct ?? null,
        rsi14: decision.researchScore.priceContext?.rsi14 ?? null,
        volumeRatio20: decision.researchScore.priceContext?.volumeRatio20 ?? null,
        relativeStrength20Pct: decision.researchScore.priceContext?.relativeStrength20Pct ?? null,
        revenueYoy: decision.researchScore.axes?.fundamental?.yoyGrowth ?? null,
        currentPe: decision.researchScore.axes?.valuation?.currentPe ?? null,
        sectorPe: decision.researchScore.axes?.valuation?.sectorPe ?? null,
        historyPeMedian: decision.researchScore.axes?.valuation?.historyPeMedian ?? null,
        valuationAsOf: decision.researchScore.axes?.valuation?.asOf ?? null,
        valuationAuthority: decision.researchScore.axes?.valuation?.sourceRef ? 'exchange_reported' : null,
        valuationExchange: String(decision.researchScore.axes?.valuation?.sourceRef ?? '').startsWith('twse-')
          ? 'TWSE' : String(decision.researchScore.axes?.valuation?.sourceRef ?? '').startsWith('tpex-') ? 'TPEx' : null,
        historyPeSessions: (decision.researchScore.axes?.valuation?.historyAsOf ?? []).slice(0,4),
        ...(Number.isFinite(decision.researchScore.axes?.valuation?.historyRelativePe) ? {
          ownPeDiscountPct: Math.round((decision.researchScore.axes.valuation.historyRelativePe - 1) * 1000) / 10,
        } : {}),
        ...(Number.isFinite(decision.researchScore.axes?.valuation?.relativePe) ? {
          sectorPeDiscountPct: Math.round((decision.researchScore.axes.valuation.relativePe - 1) * 1000) / 10,
        } : {}),
      } : {}),
    }));
  return { legacy: alignLegacyMarketView(clean, marketAnalysis), sourceSignals };
}

function publishCompactRadarProjection({ decisions, sourceCandidates = [], discoveryDelta, marketAnalysis = null, window, asOf, producerIdentity, legacyPayload }) {
  invariant(['daily', 'hot', 'weekly', 'home'].includes(window), 'radar window');
  invariant(decisions.length <= 60, 'radar card bound');
  invariant(legacyPayload && typeof legacyPayload === 'object' && !Array.isArray(legacyPayload), 'legacy radar payload required');
  invariant(decisions.length + sourceCandidates.length <= 60, 'radar discovery bound');
  const publicMarketAnalysis = normalizedMarketAnalysis(marketAnalysis);
  const layered = addResearchDecisions(legacyPayload, decisions, asOf, sourceCandidates, publicMarketAnalysis);
  const payload = {
    ...layered.legacy,
    sourceSignals: layered.sourceSignals,
    discoveryDelta,
    underreactionMarket: publicMarketAnalysis,
    sourceLedCorrectness: { schema: 'legacy-radar-v3.12.0', window, asOf, producerIdentity },
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

module.exports = { CARD_BUCKETS, addResearchDecisions, derivePublicOpportunityView, publishCompactRadarProjection, stripCorrectnessAdditions };
