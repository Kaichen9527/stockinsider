'use strict';

const { bounded, canonicalJson, invariant } = require('./codec');

const TECHNICAL_STATES = new Set(['below_support', 'reclaim_required', 'at_support', 'breakout_pending', 'breakout_confirmed', 'extended', 'invalidated']);
const ACTIONS = new Set(['avoid', 'valuation_review', 'wait_trigger', 'event_starter', 'starter_now']);
const MATURITY = new Set(['source_signal', 'fundamental_review', 'decision_ready']);

function closedUnavailable(value, fallbackReason) {
  if (value?.availability === 'available') return value;
  return { availability: 'unavailable', reason: value?.reason || fallbackReason };
}

function serializeFactorAxes(value) {
  if (value?.availability !== 'available') return closedUnavailable(value, 'factor_unavailable');
  const axes = Object.fromEntries(Object.entries(value.axes || {}).map(([key, axis]) => [key,
    Number.isFinite(axis) ? axis : axis?.availability === 'available' && Number.isFinite(axis.score) ? axis.score : null]));
  if (Object.values(axes).some((score) => score === null)) return { availability: 'unavailable', reason: 'factor_axis_unavailable' };
  return { availability: 'available', axes };
}

function serializeCorrectnessPublicUnion(decision) {
  const action = ACTIONS.has(decision?.action) ? decision.action : 'valuation_review';
  const state = TECHNICAL_STATES.has(decision?.technical?.technicalState) ? decision.technical.technicalState : null;
  const geometry = decision?.geometry?.availability === 'available' ? decision.geometry : null;
  const buyLike = action === 'starter_now' || action === 'event_starter';
  const trigger = decision?.technical?.trigger ?? geometry?.trigger ?? null;
  const entryZone = geometry?.entryZone ? { kind: state === 'breakout_confirmed' ? 'trigger_zone' : 'market_zone', lower: geometry.entryZone[0], upper: geometry.entryZone[1] } : null;
  const invalidation = buyLike && Number.isFinite(geometry?.invalidation) ? { stop: geometry.invalidation, thesisLevel: geometry.invalidation } : null;
  const materialChangedBecause = Array.isArray(decision?.materialChangedBecause ?? decision?.changedBecause)
    ? [...new Set(decision.materialChangedBecause ?? decision.changedBecause)].sort() : [];
  const payload = {
    ...(decision?.symbol ? { symbol: decision.symbol } : {}),
    ...(decision?.name ? { name: decision.name } : {}),
    researchMaturity: MATURITY.has(decision?.researchMaturity) ? decision.researchMaturity : 'source_signal',
    newPositionAction: action,
    fundamental: closedUnavailable(decision?.fundamental, 'fundamental_unavailable'),
    technical: {
      availability: state ? 'available' : 'unavailable',
      state,
      maDeviation: Number.isFinite(decision?.technical?.plane?.maDeviation) ? decision.technical.plane.maDeviation : null,
      bias: decision?.technical?.plane?.bias?.availability === 'available' ? decision.technical.plane.bias : closedUnavailable(null, 'bias_unavailable'),
      trigger: trigger && typeof trigger === 'object' ? trigger : state === 'reclaim_required' || state === 'below_support'
        ? { kind: 'reclaim', threshold: Number(trigger), volumeRatioMinimum: 1 } : null,
      entryZone: buyLike ? entryZone : null,
      invalidation,
    },
    valuation: decision?.valuation?.status === 'normal' ? {
      status: 'normal', targetPrice: decision.valuation.targetPrice ?? null, valuationRange: decision.valuation.valuationRange ?? null,
      relativeMultiple: decision.valuation.relativeMultiple ?? closedUnavailable(null, 'reported_pe_unavailable'),
      exchangeReportedPe: decision.valuation.reportedPe ?? closedUnavailable(null, 'reported_pe_unavailable'),
      modelComparablePe: decision.valuation.modelComparablePe ?? null,
    } : { status: 'valuation_review', targetPrice: null, valuationRange: null,
      relativeMultiple: closedUnavailable(decision?.valuation?.relativeMultiple, decision?.valuation?.reason || 'valuation_review'),
      exchangeReportedPe: closedUnavailable(decision?.valuation?.reportedPe, 'reported_pe_unavailable'), modelComparablePe: null },
    factorAxes: serializeFactorAxes(decision?.factorAxes),
    timingRisk: ['below_support', 'reclaim_required', 'invalidated'].includes(state) ? { status: 'blocked', reason: state }
      : decision?.reason === 'bias_observe_only' ? { status: 'observe_only', reason: 'bias_observe_only' }
        : state ? { status: 'eligible', reason: null } : { status: 'unavailable', reason: 'technical_unavailable' },
    lastEvaluatedAt: decision?.lastEvaluatedAt ?? null,
    analysisGeneratedAt: decision?.analysisGeneratedAt ?? null,
    materialChangeHash: decision?.materialChangeHash ?? null,
    materialChangedBecause,
    noChangeMessage: decision?.evaluationDisposition === 'unchanged' ? decision?.noChangeMessage ?? `已於 ${decision.lastEvaluatedAt ?? '最近一次排程'} 檢查，無重大變化` : null,
  };
  bounded(payload, 10000, 'public correctness union');
  return Object.freeze(payload);
}

function serializeOpportunityPublicProjection(input) {
  invariant(['shadow', 'disabled', 'drain'].includes(input?.mode), 'public mode');
  if (input.mode !== 'shadow') return null;
  const cards = (input.cards || []).slice(0, 60).map(serializeCorrectnessPublicUnion);
  const payload = { ...input.legacy, cards, schema: 'opportunity-public-projection-v3.11.3' };
  bounded(payload, 150000, 'public projection');
  return Object.freeze(JSON.parse(canonicalJson(payload)));
}

module.exports = { serializeCorrectnessPublicUnion, serializeOpportunityPublicProjection };
