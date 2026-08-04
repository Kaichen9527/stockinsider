'use strict';

const { percentile } = require('./codec');
const { buildPointInTimeOperatingBridge } = require('./valuation-operating-bridge');
const { selectComparableValuationInputs } = require('./valuation-comparables');
const { selectSectorValuationMethod } = require('./valuation-method');
const { verifyCompanyValuationEvidence } = require('./valuation-evidence');
const { selectOfficialReportedPe } = require('./reported-pe-authority');

function review(reason, context) {
  return Object.freeze({ status: 'valuation_review', targetPrice: null, valuationRange: null, reason, ...context });
}

function median(values) { return percentile([...values].sort((left, right) => left - right), 0.5); }

function scenarioTarget(method, multiple, bridge, facts, cycleHistory) {
  if (method === 'pe') return bridge.eps * multiple;
  if (method === 'normalized_pe') {
    const normalized = cycleHistory.length >= 12 && cycleHistory.every(Number.isFinite) ? median(cycleHistory) : null;
    return Number.isFinite(normalized) && normalized > 0 ? normalized * multiple : null;
  }
  if (method === 'ev_ebitda' || method === 'ev_sales') {
    const operating = method === 'ev_ebitda' ? facts.ebitda : facts.revenue;
    const netDebt = Number.isFinite(facts.netDebt) ? facts.netDebt
      : Number.isFinite(facts.totalDebt) && Number.isFinite(facts.cash) ? facts.totalDebt - facts.cash : null;
    return Number.isFinite(operating) && operating > 0 && Number.isFinite(netDebt) && bridge.dilutedShares > 0
      ? (operating * multiple - netDebt) / bridge.dilutedShares : null;
  }
  if (method === 'pb_roe' || method === 'residual_income') return Number.isFinite(facts.bookValue) && facts.bookValue > 0 ? facts.bookValue * multiple : null;
  if (method === 'nav') return Number.isFinite(facts.nav) && facts.nav > 0 ? facts.nav * multiple : null;
  return null;
}

function evaluateCandidateValuation(input) {
  const bridge = buildPointInTimeOperatingBridge(input.facts);
  if (bridge.availability !== 'available') return review(bridge.reason, { eps: null, bridge });
  const evidence = verifyCompanyValuationEvidence(input);
  const comparable = selectComparableValuationInputs({ ...input, subjectStockId: input.subjectStockId ?? input.stockId, cutoff: input.cutoff });
  const reportedPe = selectOfficialReportedPe(input);
  const method = selectSectorValuationMethod({ ...input.facts, sector: input.sector, cycleHistory: input.cycleHistory, crossCheck: input.crossCheck });
  const context = { eps: bridge.eps, bridge, evidence, comparable, method, reportedPe };
  if (evidence.availability !== 'available' || comparable.availability !== 'available' || method.availability !== 'available') {
    return review(evidence.reason || comparable.reason || method.reason, context);
  }
  const peMethod = ['pe', 'normalized_pe'].includes(method.method);
  if (peMethod && bridge.eps <= 0) return review('non_positive_eps_disallows_pe', context);
  const methodRows = comparable.rows.filter((row) => row.method === method.method || (peMethod && ['pe', 'normalized_pe'].includes(row.method)));
  if (methodRows.length < 5) return review('insufficient_method_comparables', context);
  const orderedMultiples = methodRows.map((row) => row.value).sort((a, b) => a - b);
  const baseMultiple = percentile(orderedMultiples, 0.5);
  const scenarioInput = input.scenarios;
  if (!scenarioInput || !['bear', 'base', 'bull'].every((key) => Number.isFinite(scenarioInput[key]?.multiple)
    && typeof scenarioInput[key]?.asOf === 'string' && scenarioInput[key]?.sourceRef)) return review('scenario_provenance_incomplete', context);
  const scenarioTargets = Object.fromEntries(['bear', 'base', 'bull'].map((key) => [key, Object.freeze({
    multiple: scenarioInput[key].multiple,
    targetPrice: scenarioTarget(method.method, scenarioInput[key].multiple, bridge, input.facts, input.cycleHistory ?? []),
    asOf: scenarioInput[key].asOf,
    sourceRef: scenarioInput[key].sourceRef,
  })]));
  if (Object.values(scenarioTargets).some((scenario) => !Number.isFinite(scenario.targetPrice) || scenario.targetPrice <= 0)
    || !(scenarioTargets.bear.targetPrice <= scenarioTargets.base.targetPrice && scenarioTargets.base.targetPrice <= scenarioTargets.bull.targetPrice)) {
    return review('scenario_order_or_method_invalid', context);
  }
  if (peMethod && (reportedPe.availability !== 'available' || reportedPe.sectorReference?.availability !== 'available')) return review(reportedPe.reason || reportedPe.sectorReference?.reason, context);
  const valuationScores = {
    ownHistoryScore: peMethod ? 100 * (1 - reportedPe.ownReference.percentile) : null,
    sectorRelativeScore: peMethod ? Math.max(0, Math.min(100, 50 + 50 * (reportedPe.sectorReference.capWeighted - reportedPe.current) / reportedPe.sectorReference.capWeighted)) : null,
    scenarioBridgeScore: input.valuationScores?.scenarioBridgeScore,
    capitalStructureScore: input.valuationScores?.capitalStructureScore,
    crossCheckScore: input.valuationScores?.crossCheckScore,
  };
  const requiredScores = peMethod ? Object.values(valuationScores) : [valuationScores.scenarioBridgeScore, valuationScores.capitalStructureScore, valuationScores.crossCheckScore];
  if (!requiredScores.every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) return review('valuation_axis_incomplete', context);
  const valuationAxisScore = peMethod
    ? 0.2 * valuationScores.ownHistoryScore + 0.15 * valuationScores.sectorRelativeScore + 0.3 * valuationScores.scenarioBridgeScore
      + 0.2 * valuationScores.capitalStructureScore + 0.15 * valuationScores.crossCheckScore
    : 0.4 * valuationScores.scenarioBridgeScore + 0.35 * valuationScores.capitalStructureScore + 0.25 * valuationScores.crossCheckScore;
  return Object.freeze({ status: 'normal', targetPrice: scenarioTargets.base.targetPrice,
    valuationRange: { bear: scenarioTargets.bear.targetPrice, base: scenarioTargets.base.targetPrice, bull: scenarioTargets.bull.targetPrice },
    scenarios: scenarioTargets, eps: bridge.eps, method, bridge, evidence, comparable, reportedPe, valuationScores, valuationAxisScore,
    modelComparablePe: peMethod ? Object.freeze({ availability: 'available', value: baseMultiple, method: method.method }) : null,
    relativeMultiple: peMethod ? { current: reportedPe.current, reference: reportedPe.ownReference.p50, ratio: reportedPe.current / reportedPe.ownReference.p50 } : null,
  });
}

module.exports = { evaluateCandidateValuation };
