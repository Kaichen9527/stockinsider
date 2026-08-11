'use strict';

const { bounded, canonicalJson, invariant } = require('./codec');
const { compatibilityAction, unavailableDecisionEnvelope, validateDecisionEnvelopeV313 } = require('./decision-envelope');
const { validateDecisionEnvelopeV314 } = require('./decision-envelope-v314');

const TECHNICAL_STATES = new Set(['below_support', 'reclaim_required', 'at_support', 'breakout_pending', 'breakout_confirmed', 'extended', 'invalidated']);
const ACTIONS = new Set(['avoid', 'valuation_review', 'wait_trigger', 'event_starter', 'starter_now']);
const MATURITY = new Set(['source_signal', 'fundamental_review', 'decision_ready']);

function closedUnavailable(value, fallbackReason) {
  if (value?.availability === 'available') return value;
  return { availability: 'unavailable', reason: value?.reason || fallbackReason };
}

function unavailableReportedComparison(reason) {
  const current={ status:'unavailable',reason,value:null,asOf:null,sourceRef:null,manifestRef:null };
  const ownHistory={ status:'unavailable',reason,count:0,p10:null,p25:null,p50:null,p75:null,p90:null,
    currentPercentile:null,asOf:null,manifestRef:null };
  const sector={ status:'unavailable',reason,count:0,p25:null,p50:null,p75:null,
    capWeightedAggregate:null,asOf:null,manifestRef:null };
  return { current,ownHistory,sector };
}

function reportedComparison(valuation) {
  const rawReason=valuation?.reportedPe?.reason||valuation?.reason||'missing_official_pe';
  const reason=new Set(['authority_conflict','non_positive_reported_pe','insufficient_own_history',
    'sector_reference_insufficient','missing_official_pe','missing_shares_outstanding',
    'calendar_authority_mismatch','manifest_missing','manifest_hash_mismatch']).has(rawReason)
    ?rawReason:'missing_official_pe';
  const fallback=unavailableReportedComparison(reason);
  const reported=valuation?.reportedPe;
  const exchangeReportedPe=reported?.current?.status?reported.current:fallback.current;
  const ownHistory=reported?.ownHistory?.status?reported.ownHistory:fallback.ownHistory;
  const sector=reported?.sector?.status?reported.sector:fallback.sector;
  const model=valuation?.relativeMultiple?.modelComparablePe??(valuation?.modelComparablePe?.value
    ?{ value:valuation.modelComparablePe.value,method:valuation.modelComparablePe.method,
      asOf:valuation.modelComparablePe.asOf??valuation.asOf??null,
      sourceRefs:valuation.modelComparablePe.sourceRefs??[],reason:null }
    :{ value:null,method:null,asOf:null,sourceRefs:[],reason:'valuation_review' });
  return { exchangeReportedPe,ownHistory,sector,modelComparablePe:model };
}

function canonicalSingleLine(value, maximum) {
  return typeof value === 'string' && [...value].length >= 1 && [...value].length <= maximum
    && value === value.normalize('NFC') && value === value.trim()
    && !/[\r\n\u0000-\u001f\u007f]/u.test(value);
}

function opaqueEvidenceReference(value) {
  return typeof value === 'string' && [...value].length >= 1 && [...value].length <= 120
    && value === value.trim();
}

function serializeFundamental(value, lastEvaluatedAt) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'fundamental narrative unavailable');
  invariant(canonicalSingleLine(value.thesis, 240), 'fundamental thesis unavailable');
  invariant(canonicalSingleLine(value.latestChange, 200), 'fundamental latest change unavailable');
  invariant(Array.isArray(value.risks) && value.risks.length >= 1 && value.risks.length <= 4
    && value.risks.every((risk) => canonicalSingleLine(risk, 160)), 'fundamental risks unavailable');
  invariant(Array.isArray(value.evidenceRefs) && value.evidenceRefs.length >= 1 && value.evidenceRefs.length <= 8
    && value.evidenceRefs.every(opaqueEvidenceReference)
    && new Set(value.evidenceRefs).size === value.evidenceRefs.length, 'fundamental evidence unavailable');
  invariant(typeof lastEvaluatedAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.]\d{3})?Z$/u.test(lastEvaluatedAt)
    && Number.isFinite(Date.parse(lastEvaluatedAt)), 'fundamental evaluation cutoff unavailable');
  invariant(typeof value.asOf === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.]\d{3})?Z$/u.test(value.asOf)
    && Number.isFinite(Date.parse(value.asOf))
    && Date.parse(value.asOf) <= Date.parse(lastEvaluatedAt), 'fundamental as-of unavailable');
  return { thesis: value.thesis, latestChange: value.latestChange, risks: [...value.risks],
    evidenceRefs: [...value.evidenceRefs], asOf: value.asOf };
}

function serializeFactorAxes(value) {
  if (value?.availability !== 'available') return closedUnavailable(value, 'factor_unavailable');
  const axes = Object.fromEntries(Object.entries(value.axes || {}).map(([key, axis]) => [key,
    Number.isFinite(axis) ? axis : axis?.availability === 'available' && Number.isFinite(axis.score) ? axis.score : null]));
  if (Object.values(axes).some((score) => score === null)) return { availability: 'unavailable', reason: 'factor_axis_unavailable' };
  return { availability: 'available', axes };
}

function serializeCorrectnessPublicUnion(decision) {
  const suppliedEnvelope=decision?.decisionEnvelope;
  const validatedEnvelope=validateDecisionEnvelopeV313(suppliedEnvelope)??validateDecisionEnvelopeV314(suppliedEnvelope);
  const envelope = validatedEnvelope ? suppliedEnvelope : unavailableDecisionEnvelope({ reason:'authoritative_decision_envelope_missing',
      evaluatedAt:decision?.lastEvaluatedAt ?? null,symbol:decision?.symbol ?? null });
  const mappedAction = compatibilityAction(envelope);
  const action = ACTIONS.has(mappedAction) ? mappedAction : 'valuation_review';
  const state = TECHNICAL_STATES.has(decision?.technical?.technicalState) ? decision.technical.technicalState : null;
  const geometry = decision?.geometry?.availability === 'available' ? decision.geometry : null;
  const buyLike = action === 'starter_now' || action === 'event_starter';
  const trigger = decision?.technical?.trigger ?? geometry?.trigger ?? null;
  const entryZone = geometry?.entryZone ? { kind: state === 'breakout_confirmed' ? 'trigger_zone' : 'market_zone', lower: geometry.entryZone[0], upper: geometry.entryZone[1] } : null;
  const invalidation = buyLike && Number.isFinite(geometry?.invalidation) ? { stop: geometry.invalidation, thesisLevel: geometry.invalidation } : null;
  const materialChangedBecause = Array.isArray(decision?.materialChangedBecause ?? decision?.changedBecause)
    ? [...new Set(decision.materialChangedBecause ?? decision.changedBecause)].sort() : [];
  const comparison=reportedComparison(decision?.valuation);
  const payload = {
    ...(decision?.symbol ? { symbol: decision.symbol } : {}),
    ...(decision?.name ? { name: decision.name } : {}),
    researchMaturity: MATURITY.has(decision?.researchMaturity) ? decision.researchMaturity : 'source_signal',
    newPositionAction: action,
    decisionEnvelope: envelope,
    decisionRevisionId: envelope.decisionRevisionId,
    fundamental: serializeFundamental(decision?.fundamental, decision?.lastEvaluatedAt),
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
      relativeMultiple: comparison,
      exchangeReportedPe: comparison.exchangeReportedPe,
      modelComparablePe: decision.valuation.modelComparablePe ?? null,
    } : { status: 'valuation_review', targetPrice: null, valuationRange: null,
      relativeMultiple: comparison,
      exchangeReportedPe: comparison.exchangeReportedPe, modelComparablePe: null },
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
