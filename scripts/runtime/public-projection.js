'use strict';

const { bounded, canonicalJson, invariant } = require('./codec');
const { canonicalDecisionNumber, compatibilityAction, unavailableDecisionEnvelope,
  validateDecisionEnvelopeV313 } = require('./decision-envelope');
const { validateDecisionEnvelopeV314 } = require('./decision-envelope-v314');

const TECHNICAL_STATES = new Set(['below_support', 'reclaim_required', 'at_support', 'breakout_pending', 'breakout_confirmed', 'extended', 'invalidated']);
const ACTIONS = new Set(['avoid', 'valuation_review', 'wait_trigger', 'event_starter', 'starter_now']);
const MATURITY = new Set(['source_signal', 'fundamental_review', 'decision_ready']);
const BIAS_UNAVAILABLE_REASONS = new Set(['technical_unavailable','insufficient_own_history',
  'sector_reference_insufficient','manifest_missing','manifest_hash_mismatch']);
const REPORTED_UNAVAILABLE_REASONS = new Set(['authority_conflict','non_positive_reported_pe','insufficient_own_history',
  'sector_reference_insufficient','missing_official_pe','missing_shares_outstanding','calendar_authority_mismatch',
  'manifest_missing','manifest_hash_mismatch']);
const MATERIAL_REASONS = new Set(['source_evidence_changed','financial_fact_changed','price_trigger_changed',
  'technical_state_changed','valuation_changed','risk_changed','factor_correctness_changed']);
const FACTOR_KEYS = ['discovery','quality','valuation','timingRisk'];
const LEGACY_CHANGE_CODES = new Set(['candidate_state_changed','new_position_action_changed',
  'formal_status_changed','factor_contribution_changed']);
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');
const finite=(value)=>Number.isFinite(value);
const validDate=(value)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const positive=(value)=>finite(value)&&value>0;

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
  const reason=REPORTED_UNAVAILABLE_REASONS.has(rawReason)
    ?rawReason:'missing_official_pe';
  const fallback=unavailableReportedComparison(reason);
  const reported=valuation?.reportedPe;
  if(reported!==undefined&&reported!==null){
    invariant(reported&&typeof reported==='object'&&!Array.isArray(reported), 'reported PE evidence shape');
    if(!reported.current&&!reported.ownHistory&&!reported.sector){
      invariant(reported.availability==='unavailable'&&REPORTED_UNAVAILABLE_REASONS.has(reported.reason),
        'reported PE unavailable evidence');
    }else invariant(reported.current&&reported.ownHistory&&reported.sector,'reported PE closed branches');
  }
  const current=reported?.current; const history=reported?.ownHistory; const sectorRaw=reported?.sector;
  const validateUnavailable=(branch,keys)=>exactKeys(branch,keys)&&branch.status==='unavailable'
    &&REPORTED_UNAVAILABLE_REASONS.has(branch.reason);
  if(current) invariant((exactKeys(current,['status','reason','value','asOf','sourceRef','manifestRef'])
    &&((current.status==='available'&&current.reason===null&&positive(current.value)&&validDate(current.asOf)
      &&opaqueEvidenceReference(current.sourceRef)&&opaqueEvidenceReference(current.manifestRef))
      ||(validateUnavailable(current,['status','reason','value','asOf','sourceRef','manifestRef'])
        &&current.value===null&&current.asOf===null&&current.sourceRef===null&&current.manifestRef===null))),
    'reported PE current branch');
  if(history) invariant(exactKeys(history,['status','reason','count','p10','p25','p50','p75','p90','currentPercentile','asOf','manifestRef'])
    &&((history.status==='available'&&history.reason===null&&Number.isInteger(history.count)&&history.count>=252&&history.count<=1260
      &&['p10','p25','p50','p75','p90'].every((key)=>positive(history[key]))
      &&history.p10<=history.p25&&history.p25<=history.p50&&history.p50<=history.p75&&history.p75<=history.p90
      &&finite(history.currentPercentile)&&history.currentPercentile>=0&&history.currentPercentile<=1
      &&validDate(history.asOf)&&opaqueEvidenceReference(history.manifestRef))
    ||(validateUnavailable(history,['status','reason','count','p10','p25','p50','p75','p90','currentPercentile','asOf','manifestRef'])
      &&Number.isInteger(history.count)&&history.count>=0&&['p10','p25','p50','p75','p90','currentPercentile','asOf','manifestRef'].every((key)=>history[key]===null))),
    'reported PE history branch');
  if(sectorRaw) invariant(exactKeys(sectorRaw,['status','reason','count','p25','p50','p75','capWeightedAggregate','asOf','manifestRef'])
    &&((sectorRaw.status==='available'&&sectorRaw.reason===null&&Number.isInteger(sectorRaw.count)&&sectorRaw.count>=8
      &&['p25','p50','p75','capWeightedAggregate'].every((key)=>positive(sectorRaw[key]))
      &&sectorRaw.p25<=sectorRaw.p50&&sectorRaw.p50<=sectorRaw.p75&&validDate(sectorRaw.asOf)
      &&opaqueEvidenceReference(sectorRaw.manifestRef))
    ||(validateUnavailable(sectorRaw,['status','reason','count','p25','p50','p75','capWeightedAggregate','asOf','manifestRef'])
      &&Number.isInteger(sectorRaw.count)&&sectorRaw.count>=0
      &&['p25','p50','p75','capWeightedAggregate','asOf','manifestRef'].every((key)=>sectorRaw[key]===null))),
    'reported PE sector branch');
  const exchangeReportedPe=current??fallback.current;
  const ownHistory=history??fallback.ownHistory;
  const sector=sectorRaw??fallback.sector;
  const model=valuation?.relativeMultiple?.modelComparablePe??(valuation?.modelComparablePe?.value
    ?{ value:valuation.modelComparablePe.value,method:valuation.modelComparablePe.method,
      asOf:valuation.modelComparablePe.asOf??valuation.asOf??null,
      sourceRefs:valuation.modelComparablePe.sourceRefs??[],reason:null }
    :{ value:null,method:null,asOf:null,sourceRefs:[],reason:'valuation_review' });
  invariant(exactKeys(model,['value','method','asOf','sourceRefs','reason'])
    &&((positive(model.value)&&['pe','normalized_pe'].includes(model.method)&&validDate(model.asOf)
      &&Array.isArray(model.sourceRefs)&&model.sourceRefs.length>0&&model.sourceRefs.every(opaqueEvidenceReference)
      &&model.reason===null)
    ||(model.value===null&&model.method===null&&model.asOf===null&&Array.isArray(model.sourceRefs)
      &&model.sourceRefs.length===0&&['negative_eps','method_not_pe','valuation_review'].includes(model.reason))),
  'model comparable PE evidence');
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
  if(value===undefined||value===null)return {availability:'unavailable',reason:'factor_unavailable'};
  invariant(value&&typeof value==='object'&&!Array.isArray(value),'factor axes evidence shape');
  if(value.availability!=='available'){
    invariant(value.availability==='unavailable'&&['factor_unavailable','factor_axis_unavailable'].includes(value.reason)
      &&(exactKeys(value,['availability','reason'])||exactKeys(value,['availability','reason','axes'])),
    'factor axes unavailable evidence');
    if(value.axes!==undefined)invariant(exactKeys(value.axes,FACTOR_KEYS)
      &&FACTOR_KEYS.every((key)=>value.axes[key]===null||(finite(value.axes[key])&&value.axes[key]>=0&&value.axes[key]<=100)),
    'factor axes unavailable values');
    return {availability:'unavailable',reason:value.reason};
  }
  invariant(exactKeys(value,['availability','axes'])&&exactKeys(value.axes,FACTOR_KEYS)
    &&FACTOR_KEYS.every((key)=>finite(value.axes[key])&&value.axes[key]>=0&&value.axes[key]<=100),
  'factor axes available evidence');
  return {availability:'available',axes:{...value.axes}};
}

function serializeBias(value) {
  if(value===undefined||value===null)return {availability:'unavailable',reason:'technical_unavailable'};
  invariant(value&&typeof value==='object'&&!Array.isArray(value),'BIAS evidence shape');
  if(value.availability!=='available'){
    invariant(exactKeys(value,['availability','reason'])&&value.availability==='unavailable'
      &&BIAS_UNAVAILABLE_REASONS.has(value.reason),'BIAS unavailable evidence');
    return {availability:'unavailable',reason:value.reason};
  }
  const allowed=new Set(['availability','bias20Pct','bias60Pct','bias120Pct','bias20Atr','ownHistory','sector']);
  invariant(Object.keys(value).every((key)=>allowed.has(key))&&finite(value.bias20Pct)
    &&['bias60Pct','bias120Pct','bias20Atr'].every((key)=>value[key]===undefined||value[key]===null||finite(value[key])),
  'BIAS available evidence');
  if(value.ownHistory!==undefined&&value.ownHistory!==null)invariant(
    exactKeys(value.ownHistory,['p10','p25','p50','p75','p90','label'])
      &&['p10','p25','p50','p75','p90'].every((key)=>finite(value.ownHistory[key]))
      &&value.ownHistory.p10<=value.ownHistory.p25&&value.ownHistory.p25<=value.ownHistory.p50
      &&value.ownHistory.p50<=value.ownHistory.p75&&value.ownHistory.p75<=value.ownHistory.p90
      &&new Set(['extreme_low','low','normal','high','extended']).has(value.ownHistory.label),
    'BIAS own-history evidence');
  invariant(value.sector===undefined||value.sector===null,'BIAS sector evidence is not in the public runtime plane');
  return {...value};
}

function validateChangeReasons(decision){
  const material=decision?.materialChangedBecause;
  if(material!==undefined){
    invariant(Array.isArray(material)&&material.length<=7&&new Set(material).size===material.length
      &&material.every((reason)=>MATERIAL_REASONS.has(reason)),'materialChangedBecause evidence');
  }
  const legacy=decision?.changedBecause;
  if(legacy!==undefined){
    invariant(Array.isArray(legacy)&&legacy.length<=3,'changedBecause evidence');
    for(const change of legacy){
      invariant(change&&typeof change==='object'&&!Array.isArray(change)&&LEGACY_CHANGE_CODES.has(change.code),
        'changedBecause variant');
      if(change.code==='factor_contribution_changed')invariant(exactKeys(change,['code','factor','delta'])
        &&new Set(['priceVolume','chip','catalyst','marketSector','fundamental','valuation']).has(change.factor)
        &&finite(change.delta),'changedBecause factor variant');
      else {
        const values=change.code==='candidate_state_changed'
          ?new Set(['actionable_now','waiting_trigger','valuation_review','avoid'])
          :change.code==='new_position_action_changed'
            ?new Set(['avoid','valuation_review','wait_trigger','event_starter','starter_now'])
            :new Set(['not_evaluated','insufficient_evidence','valuation_review','formal_watch','formal_candidate']);
        invariant(exactKeys(change,['code','from','to'])&&values.has(change.from)&&values.has(change.to),
          'changedBecause state variant');
      }
    }
  }
  return material?[...material]:[];
}

function serializeCorrectnessPublicUnion(decision) {
  const suppliedEnvelope=decision?.decisionEnvelope;
  const validatedEnvelope=validateDecisionEnvelopeV313(suppliedEnvelope)??validateDecisionEnvelopeV314(suppliedEnvelope);
  const envelope = validatedEnvelope ? suppliedEnvelope : unavailableDecisionEnvelope({ reason:'authoritative_decision_envelope_missing',
      evaluatedAt:decision?.lastEvaluatedAt ?? null,symbol:decision?.symbol ?? null });
  const mappedAction = compatibilityAction(envelope);
  const action = ACTIONS.has(mappedAction) ? mappedAction : 'valuation_review';
  const plan=validatedEnvelope?envelope.entryPlan:null;
  const state = TECHNICAL_STATES.has(plan?.technicalState) ? plan.technicalState
    : TECHNICAL_STATES.has(decision?.technical?.technicalState) ? decision.technical.technicalState : null;
  const geometry = plan&&Array.isArray(plan.entryZone)?{entryZone:plan.entryZone,invalidation:plan.invalidation,trigger:plan.trigger}:null;
  if(plan&&decision?.technical?.technicalState!==undefined)invariant(decision.technical.technicalState===plan.technicalState,
    'published technical state conflicts with immutable envelope');
  if(plan&&decision?.technical?.trigger!==undefined)invariant(canonicalJson(decision.technical.trigger)===canonicalJson(plan.trigger),
    'published trigger conflicts with immutable envelope');
  if(plan&&decision?.geometry?.availability==='available')invariant(canonicalJson(decision.geometry.entryZone)===canonicalJson(plan.entryZone)
    &&decision.geometry.invalidation===plan.invalidation&&canonicalJson(decision.geometry.trigger??null)===canonicalJson(plan.trigger),
  'published geometry conflicts with immutable envelope');
  const buyLike = action === 'starter_now' || action === 'event_starter';
  const trigger = validatedEnvelope ? plan?.trigger??null : decision?.technical?.trigger ?? null;
  const entryZone = geometry?.entryZone ? { kind: state === 'breakout_confirmed' ? 'trigger_zone' : 'market_zone', lower: geometry.entryZone[0], upper: geometry.entryZone[1] } : null;
  const invalidation = buyLike && Number.isFinite(geometry?.invalidation) ? { stop: geometry.invalidation, thesisLevel: geometry.invalidation } : null;
  const materialChangedBecause = validateChangeReasons(decision);
  if(decision?.valuation!==undefined&&decision?.valuation!==null)invariant(
    decision.valuation&&typeof decision.valuation==='object'&&!Array.isArray(decision.valuation)
      &&['normal','valuation_review'].includes(decision.valuation.status),
  'published valuation status evidence');
  const comparison=reportedComparison(decision?.valuation);
  const formalRange=validatedEnvelope&&envelope.recommendationAuthority==='formal'
    ?envelope.valuationSummary?.formalRange:null;
  if(formalRange&&decision?.valuation?.status==='normal'){
    const producerRange=decision.valuation.valuationRange;
    invariant(decision.valuation.targetPrice===undefined
      ||canonicalDecisionNumber(decision.valuation.targetPrice)===formalRange.base,
      'published valuation target conflicts with immutable envelope');
    invariant(producerRange===undefined||(exactKeys(producerRange,['bear','base','bull'])
      &&canonicalDecisionNumber(producerRange.bear)===formalRange.bear
      &&canonicalDecisionNumber(producerRange.base)===formalRange.base
      &&canonicalDecisionNumber(producerRange.bull)===formalRange.bull),
    'published valuation range conflicts with immutable envelope');
  }
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
      bias: serializeBias(decision?.technical?.plane?.bias),
      trigger: trigger && typeof trigger === 'object' ? trigger : state === 'reclaim_required' || state === 'below_support'
        ? { kind: 'reclaim', threshold: Number(trigger), volumeRatioMinimum: 1 } : null,
      entryZone: buyLike ? entryZone : null,
      invalidation,
    },
    valuation: formalRange ? {
      status: 'normal', targetPrice: formalRange.base, valuationRange: [formalRange.bear,formalRange.bull],
      relativeMultiple: comparison,
      exchangeReportedPe: comparison.exchangeReportedPe,
      modelComparablePe: comparison.modelComparablePe,
    } : { status: 'valuation_review', targetPrice: null, valuationRange: null,
      relativeMultiple: comparison,
      exchangeReportedPe: comparison.exchangeReportedPe, modelComparablePe: null },
    factorAxes: serializeFactorAxes(decision?.factorAxes),
    timingRisk: !state ? { status: 'unavailable', reason: 'technical_unavailable' }
      : ['below_support', 'reclaim_required', 'invalidated'].includes(state) ? { status: 'blocked', reason: state }
        : decision?.reason === 'bias_observe_only' ? { status: 'observe_only', reason: 'bias_observe_only' }
          : { status: 'eligible', reason: null },
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
