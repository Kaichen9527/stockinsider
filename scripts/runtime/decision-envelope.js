'use strict';

const { canonicalJson, sha256 } = require('./codec');

const ACTIONS = Object.freeze([
  'buy', 'accumulate', 'research_starter', 'wait_value', 'wait_market', 'wait_breakout', 'wait_reclaim',
  'avoid_chase', 'avoid', 'unavailable',
]);

const CONFLICT_REASONS = new Set([
  'authority_conflict', 'contradictory_bridge_inputs', 'method_divergence',
  'scenario_order_or_method_invalid', 'calendar_authority_mismatch',
]);

function finite(value) { return Number.isFinite(value) ? value : null; }
function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  const scaled=Math.abs(value)*scale;
  const tolerance=Number.EPSILON*Math.max(1,scaled)*16;
  const rounded = Math.sign(value) * Math.round(scaled+tolerance) / scale;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function meetsMinimum(value, minimum) {
  if (!Number.isFinite(value)) return false;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(minimum)) * 16;
  return value >= minimum || Math.abs(value - minimum) <= tolerance;
}

function relativeValuation(score, currentPrice) {
  const axis = score?.axes?.valuation;
  const historyCount = Number(axis?.historySampleCount ?? 0);
  const sectorCount = Number(axis?.sectorCount ?? 0);
  const current = finite(axis?.currentPe);
  const historyP25 = finite(axis?.historyPeP25);
  const historyP50 = finite(axis?.historyPeMedian);
  const historyP75 = finite(axis?.historyPeP75);
  const sectorP50 = finite(axis?.sectorPe);
  const evidence=axis?.valuationEvidence;
  const evidenceValid=evidence&&evidence.algorithm==='official-relative-pe-evidence-v1'
    &&['currentObservationRoot','historyMembershipRoot','sectorMembershipRoot','evidenceRoot']
      .every((key)=>typeof evidence[key]==='string'&&/^[0-9a-f]{64}$/u.test(evidence[key]))
    &&evidence.historySessions===historyCount&&evidence.sectorPeers===sectorCount;
  if (axis?.trustworthy !== true || historyCount < 252 || sectorCount < 8
      ||!evidenceValid
      || ![current, historyP25, historyP50, historyP75, sectorP50, currentPrice].every(Number.isFinite)
      || current <= 0 || currentPrice <= 0) {
    return Object.freeze({ availability: 'unavailable', reason: historyCount < 252
      ? 'insufficient_reported_pe_history' : sectorCount < 8
        ? 'insufficient_sector_reported_pe_population' : 'relative_valuation_unavailable' });
  }
  const baseMultiple = Math.min(historyP50, sectorP50);
  const lowMultiple = Math.min(historyP25, sectorP50 * 0.85);
  const highMultiple = Math.min(historyP75, sectorP50 * 1.15);
  if (!(lowMultiple > 0 && lowMultiple <= baseMultiple && baseMultiple <= highMultiple)) {
    return Object.freeze({ availability: 'unavailable', reason: 'relative_valuation_conflict' });
  }
  const impliedEps = currentPrice / current;
  const discountPct = 100 * (1 - current / baseMultiple);
  return Object.freeze({
    availability: 'available', method: 'reported_pe_relative', currentMultiple: current,
    referenceMultiple: baseMultiple, discountPctRaw: discountPct,discountPct: round(discountPct, 1),
    referenceBand: Object.freeze({
      low: round(impliedEps * lowMultiple), base: round(impliedEps * baseMultiple),
      high: round(impliedEps * highMultiple),
    }),
    historySessions: historyCount, sectorPeers: sectorCount, valuationEvidence:evidence,asOf: axis.asOf ?? null,
    sourceRefs: Array.isArray(axis.sourceRefs) ? axis.sourceRefs.slice(0, 8) : [],
  });
}

function geometryMetrics(geometry, baseTargetRaw) {
  if (geometry?.availability !== 'available' || !Array.isArray(geometry.entryZone)
      || geometry.entryZone.length !== 2 || !geometry.entryZone.every(Number.isFinite)
      || !Number.isFinite(geometry.invalidation)) return null;
  const entry = (geometry.entryZone[0] + geometry.entryZone[1]) / 2;
  const risk = entry - geometry.invalidation;
  const reward = Number.isFinite(baseTargetRaw) ? baseTargetRaw - entry : null;
  if (!(entry > 0 && risk > 0)) return null;
  const rewardRiskRaw=Number.isFinite(reward)?reward/risk:null;
  return Object.freeze({ entry: round(entry), risk: round(risk), reward: round(reward),rewardRiskRaw,
    rewardRisk: Number.isFinite(rewardRiskRaw) ? round(rewardRiskRaw, 2) : null });
}

function technicalAction(state) {
  if (state === 'below_support' || state === 'reclaim_required') return 'wait_reclaim';
  if (state === 'breakout_pending') return 'wait_breakout';
  if (state === 'extended') return 'avoid_chase';
  if (state === 'invalidated') return 'avoid';
  return null;
}

function decisionRevisionMaterial(value) {
  const { evaluatedAt: _heartbeat, decisionRevisionId: _identity, ...material } = value;
  return material;
}

function deriveDecisionEnvelope(input) {
  const valuation = input?.valuation ?? {};
  const technical = input?.technical ?? {};
  const geometry = input?.geometry ?? null;
  const state = technical.technicalState ?? technical.state ?? null;
  const currentPrice = finite(technical?.plane?.current ?? input?.currentPrice);
  const qualityEligible = input?.qualityActionEligible === true;
  const marketAllowsAction = input?.marketAllowsAction === true;
  const qualityReadiness=input?.qualityReadiness??(typeof input?.qualityActionEligible==='boolean'?'available':'missing');
  const marketReadiness=input?.marketReadiness??(typeof input?.marketAllowsAction==='boolean'?'available':'missing');
  const authorityPrerequisiteUnavailable=qualityReadiness!=='available'||marketReadiness!=='available';
  const relative = relativeValuation(input?.researchScore, currentPrice);
  const formal = valuation.status === 'normal' && valuation.valuationRange
    && ['bear', 'base', 'bull'].every((key) => Number.isFinite(valuation.valuationRange[key]));
  const hasConflict = CONFLICT_REASONS.has(valuation.reason) || relative.reason === 'relative_valuation_conflict';
  const readiness = hasConflict ? 'conflict' : input?.stale === true ? 'stale'
    : formal ? 'complete' : relative.availability === 'available' ? 'relative_only' : 'missing';
  const authority = readiness === 'conflict' || readiness === 'stale' ? 'none'
    : formal ? 'formal' : relative.availability === 'available' ? 'conditional_research' : 'none';
  const blockers = [];
  if (qualityReadiness!=='available')blockers.push(`fundamental_quality_authority_${qualityReadiness}`);
  else if (!qualityEligible) blockers.push('fundamental_quality_gate_not_met');
  if (marketReadiness!=='available')blockers.push(`market_authority_${marketReadiness}`);
  else if (!marketAllowsAction) blockers.push('market_gate_not_met');
  if (!state) blockers.push('technical_unavailable');
  if (readiness === 'missing') blockers.push(valuation.reason || relative.reason || 'valuation_missing');
  if (readiness === 'stale') blockers.push('valuation_stale');
  if (readiness === 'conflict') blockers.push(valuation.reason || relative.reason || 'valuation_conflict');

  const formalRange = formal ? Object.freeze({
    bear: round(valuation.valuationRange.bear), base: round(valuation.valuationRange.base),
    bull: round(valuation.valuationRange.bull),
  }) : null;
  const baseTargetRaw=formal?valuation.valuationRange.base:null;
  const metrics = geometryMetrics(geometry, baseTargetRaw);
  const baseUpsidePctRaw=formal&&currentPrice>0?100*(baseTargetRaw/currentPrice-1):null;
  const baseUpsidePct=Number.isFinite(baseUpsidePctRaw)?round(baseUpsidePctRaw,1):null;
  const knownTechnicalAction = technicalAction(state);
  let userAction = 'unavailable';
  let reason = blockers[0] ?? null;

  if (readiness === 'conflict') {
    userAction = 'avoid'; reason = blockers.at(-1) ?? 'valuation_conflict';
  } else if (authority === 'none') {
    userAction = 'unavailable'; reason = blockers.at(-1) ?? 'valuation_missing';
  } else if (authorityPrerequisiteUnavailable) {
    userAction = 'unavailable';reason=blockers.find((value)=>value.includes('_authority_'))??'decision_authority_unavailable';
  } else if (!qualityEligible || !marketAllowsAction) {
    userAction = 'unavailable'; reason = blockers[0];
  } else if (knownTechnicalAction) {
    const waitGeometryValid=state==='breakout_pending'?geometry?.availability==='available'&&metrics
      :['below_support','reclaim_required','extended'].includes(state)?geometry?.availability==='conditional'
        :state==='invalidated'&&geometry?.availability==='invalidated';
    if (!waitGeometryValid) {
      userAction = 'unavailable'; reason = 'invalid_entry_geometry'; blockers.push(reason);
    } else {
      userAction = knownTechnicalAction;
      reason = state === 'below_support' || state === 'reclaim_required' ? 'support_must_be_reclaimed'
        : state === 'breakout_pending' ? 'breakout_not_confirmed'
          : state === 'extended' ? 'price_extended_wait_for_reset' : 'entry_invalidated';
    }
  } else if (!['at_support', 'breakout_confirmed'].includes(state)) {
    userAction = 'unavailable'; reason = 'technical_unavailable';
  } else if (geometry?.availability !== 'available' || !metrics) {
    userAction = 'unavailable'; reason = 'invalid_entry_geometry'; blockers.push(reason);
  } else if (authority === 'formal') {
    if (!meetsMinimum(baseUpsidePctRaw,15) || !meetsMinimum(metrics.rewardRiskRaw,2)) {
      userAction = 'avoid'; reason = baseUpsidePctRaw <= 0 ? 'formal_valuation_reflected' : 'insufficient_margin_of_safety';
    } else {
      userAction = state === 'breakout_confirmed' ? 'buy' : 'accumulate'; reason = `formal_${state}`;
    }
  } else if (meetsMinimum(relative.discountPctRaw,15)) {
    userAction = 'research_starter'; reason = `conditional_${state}`;
  } else {
    userAction = 'avoid'; reason = 'relative_discount_below_15_percent';
  }

  const valuationSummary = Object.freeze({
    kind: formal ? 'formal_range' : relative.availability === 'available' ? 'relative_reference_band' : 'unavailable',
    currentPrice, formalRange, relativeBand: formal ? null : relative.referenceBand ?? null,
    baseUpsidePct, relativeDiscountPct: formal ? null : relative.discountPct ?? null,
    method: formal ? valuation.method?.method ?? null : relative.method ?? null,
    asOf: formal ? valuation.asOf ?? null : relative.asOf ?? null,
    sourceRefs: formal ? valuation.evidence?.sourceRefs ?? [] : relative.sourceRefs ?? [],
    thresholdAuthority:formal?Object.freeze({kind:'formal',baseTargetRaw})
      :relative.availability==='available'?Object.freeze({kind:'relative',currentMultiple:relative.currentMultiple,
        referenceMultiple:relative.referenceMultiple,historySessions:relative.historySessions,sectorPeers:relative.sectorPeers,
        algorithm:relative.valuationEvidence.algorithm,evidenceRoot:relative.valuationEvidence.evidenceRoot,
        currentObservationRoot:relative.valuationEvidence.currentObservationRoot,
        historyMembershipRoot:relative.valuationEvidence.historyMembershipRoot,
        sectorMembershipRoot:relative.valuationEvidence.sectorMembershipRoot})
        :null,
    blockers: [...new Set(blockers)],
  });
  const entryPlan = authority !== 'none'&&['available','conditional','invalidated'].includes(geometry?.availability)
    ? Object.freeze({
    technicalState: state, trigger: technical.trigger ?? geometry.trigger ?? null,
    entryZone: Array.isArray(geometry.entryZone)?[...geometry.entryZone]:null, invalidation: geometry.invalidation??null,
    rewardRisk: metrics?.rewardRisk ?? null,
  }) : null;
  const material = { recommendationAuthority: authority, valuationReadiness: readiness, userAction,
    reason, valuationSummary, entryPlan };
  return Object.freeze({
    version: 'decision-envelope-v3.13.0', decisionRevisionId: `decision-v3.13:${sha256(canonicalJson(material))}`,
    recommendationAuthority: authority, valuationReadiness: readiness, userAction, reason,
    whyNow: userAction === 'buy' ? '完整估值、安全邊際與突破條件同時通過。'
      : userAction === 'accumulate' ? '完整估值與安全邊際通過，股價位於有效支撐區。'
        : userAction === 'research_starter' ? '相對估值折價、基本面與技術面通過；尚非正式目標價。'
          : userAction === 'wait_reclaim' ? '估值條件仍可追蹤，但必須先收復支撐。'
            : userAction === 'wait_breakout' ? '研究條件可追蹤，等待量價突破確認。'
              : userAction === 'avoid_chase' ? '技術乖離過高，等待回到合理區間。'
                : userAction === 'avoid' ? '已知估值、風險或技術條件不支持新倉。'
                  : '必要資料尚未形成可驗證的買進判斷。',
    valuationSummary, entryPlan, blockers: valuationSummary.blockers,
    evaluatedAt: input?.lastEvaluatedAt ?? null,
  });
}

function overrideDecisionEnvelopeAction(envelope, userAction, reason) {
  if (!ACTIONS.includes(userAction)) throw new Error('decision action is not closed');
  const blockers=userAction==='unavailable'?[...new Set([...(envelope.blockers??[]),reason])]:envelope.blockers;
  const valuationSummary=userAction==='unavailable'
    ?Object.freeze({...envelope.valuationSummary,blockers}):envelope.valuationSummary;
  const changed = { ...envelope, userAction, reason,
    whyNow: userAction === 'avoid' ? '乖離或風險條件使新倉失效。'
      :userAction==='unavailable'?'決策摘要引用不足；僅降級此股票，不影響其他研究卡。':envelope.whyNow,
    blockers,valuationSummary,
    ...(envelope.version==='decision-envelope-v3.14.0'?{
      nextUnlock:userAction==='wait_value'?envelope.nextUnlock??null:null,
      thresholdAuthority:userAction==='avoid'?null:envelope.thresholdAuthority??null,
    }:{}),
  };
  delete changed.decisionRevisionId;
  return Object.freeze({ ...changed,
    decisionRevisionId: `${envelope.version==='decision-envelope-v3.14.0'?'decision-v3.14':'decision-v3.13'}:${sha256(canonicalJson(decisionRevisionMaterial(changed)))}` });
}

function compatibilityAction(envelope) {
  if (envelope?.userAction === 'buy' || envelope?.userAction === 'accumulate') return 'starter_now';
  if (envelope?.userAction === 'research_starter') return 'event_starter';
  if (['wait_value','wait_market','wait_breakout', 'wait_reclaim', 'avoid_chase'].includes(envelope?.userAction)) return 'wait_trigger';
  if (envelope?.userAction === 'avoid') return 'avoid';
  return 'valuation_review';
}

function unavailableDecisionEnvelope({ reason = 'authoritative_decision_envelope_missing', evaluatedAt = null, symbol = null } = {}) {
  const material = { recommendationAuthority:'none',valuationReadiness:'missing',userAction:'unavailable',
    reason,symbol };
  return Object.freeze({ version:'decision-envelope-v3.13.0',
    decisionRevisionId:`decision-v3.13:${sha256(canonicalJson(material))}`,
    recommendationAuthority:'none',valuationReadiness:'missing',userAction:'unavailable',reason,
    whyNow:'權威決策封包缺失；本次只顯示待研究狀態，不執行相容性決策。',
    valuationSummary:Object.freeze({kind:'unavailable',currentPrice:null,formalRange:null,relativeBand:null,
      baseUpsidePct:null,relativeDiscountPct:null,method:null,asOf:null,sourceRefs:[],thresholdAuthority:null,blockers:[reason]}),
    entryPlan:null,blockers:[reason],evaluatedAt });
}

const ENVELOPE_AUTHORITIES=new Set(['formal','conditional_research','none']);
const ENVELOPE_READINESS=new Set(['complete','relative_only','missing','stale','conflict']);
function nonemptyString(value){return typeof value==='string'&&value===value.trim()&&value.length>0;}
function finitePositive(value){return Number.isFinite(value)&&value>0;}
function validInstant(value){
  if(typeof value!=='string')return false;
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:[.](\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if(!match)return false;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const hour=Number(match[4]),minute=Number(match[5]),second=Number(match[6]);
  if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()
    ||hour>23||minute>59||second>59)return false;
  if(match[8]!=='Z'){
    const offsetHour=Number(match[10]),offsetMinute=Number(match[11]);
    if(offsetHour>14||offsetMinute>59||(offsetHour===14&&offsetMinute!==0))return false;
  }
  return Number.isFinite(Date.parse(value));
}
function validAsOf(value){
  if(validInstant(value))return true;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value))return false;
  const [year,month,day]=value.split('-').map(Number);
  return month>=1&&month<=12&&day>=1&&day<=new Date(Date.UTC(year,month,0)).getUTCDate();
}
function exactObjectKeys(value,allowed){
  const keys=Object.keys(value);
  return keys.length===allowed.length&&keys.every((key)=>allowed.includes(key));
}
function validTypedTrigger(value,kind){
  return Boolean(value&&typeof value==='object'&&!Array.isArray(value)
    &&exactObjectKeys(value,value.volumeRatioMinimum===undefined?['kind','threshold']
      :['kind','threshold','volumeRatioMinimum'])
    &&value.kind===kind&&finitePositive(value.threshold)
    &&(value.volumeRatioMinimum===undefined||value.volumeRatioMinimum===null||finitePositive(value.volumeRatioMinimum)));
}
function validPlanShape(plan,hasGeometry,hasNoGeometry){
  if(['below_support','reclaim_required'].includes(plan.technicalState))
    return hasNoGeometry&&validTypedTrigger(plan.trigger,'reclaim');
  if(plan.technicalState==='breakout_pending')return hasGeometry&&validTypedTrigger(plan.trigger,'breakout');
  if(plan.technicalState==='extended')return hasNoGeometry&&validTypedTrigger(plan.trigger,'pullback');
  if(plan.technicalState==='invalidated')return hasNoGeometry&&plan.trigger===null;
  if(['at_support','breakout_confirmed'].includes(plan.technicalState))return hasGeometry&&plan.trigger===null;
  return false;
}
function sameStringArray(left,right){
  return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length
    &&left.every((value,index)=>value===right[index]);
}
function validateDecisionEnvelopeV313(value,outerRevisionId){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!=='decision-envelope-v3.13.0'
    ||!nonemptyString(value.decisionRevisionId)||!/^decision-v3[.]13:[0-9a-f]{64}$/u.test(value.decisionRevisionId)
    ||(outerRevisionId!==undefined&&value.decisionRevisionId!==outerRevisionId)
    ||!ENVELOPE_AUTHORITIES.has(value.recommendationAuthority)||!ENVELOPE_READINESS.has(value.valuationReadiness)
    ||!ACTIONS.includes(value.userAction)||!nonemptyString(value.reason)||!nonemptyString(value.whyNow)||!Array.isArray(value.blockers)
    ||value.blockers.some((item)=>!nonemptyString(item))||new Set(value.blockers).size!==value.blockers.length)return null;
  if((value.recommendationAuthority==='formal'&&value.valuationReadiness!=='complete')
    ||(value.recommendationAuthority==='conditional_research'&&value.valuationReadiness!=='relative_only')
    ||(value.recommendationAuthority==='none'&&!['missing','stale','conflict'].includes(value.valuationReadiness)))return null;
  const summary=value.valuationSummary;
  if(!summary||typeof summary!=='object'||Array.isArray(summary)
    ||!['formal_range','relative_reference_band','unavailable'].includes(summary.kind)
    ||!Array.isArray(summary.sourceRefs)||summary.sourceRefs.some((item)=>!nonemptyString(item))
    ||new Set(summary.sourceRefs).size!==summary.sourceRefs.length
    ||!Array.isArray(summary.blockers)||summary.blockers.some((item)=>!nonemptyString(item))
    ||new Set(summary.blockers).size!==summary.blockers.length||!sameStringArray(value.blockers,summary.blockers))return null;
  if(value.recommendationAuthority==='formal'&&summary.kind!=='formal_range')return null;
  if(value.recommendationAuthority==='conditional_research'&&summary.kind!=='relative_reference_band')return null;
  if(value.recommendationAuthority==='none'&&summary.kind!=='unavailable')return null;
  const range=summary.kind==='formal_range'?summary.formalRange:summary.kind==='relative_reference_band'?summary.relativeBand:null;
  if(range){const values=summary.kind==='formal_range'?[range.bear,range.base,range.bull]:[range.low,range.base,range.high];
    if(!values.every(finitePositive)||values[0]>values[1]||values[1]>values[2])return null;
  }else if(value.recommendationAuthority!=='none')return null;
  const threshold=summary.thresholdAuthority;
  let rawUpside=null,rawDiscount=null,rawRewardRisk=null;
  if(value.recommendationAuthority==='formal'){
    if(!threshold||typeof threshold!=='object'||Array.isArray(threshold)||threshold.kind!=='formal'
      ||!finitePositive(threshold.baseTargetRaw)||round(threshold.baseTargetRaw,2)!==summary.formalRange.base)return null;
    rawUpside=100*(threshold.baseTargetRaw/summary.currentPrice-1);
    const expectedUpside=round(rawUpside,1);
    if(!finitePositive(summary.currentPrice)||!Number.isFinite(summary.baseUpsidePct)
      ||summary.baseUpsidePct!==expectedUpside||summary.relativeBand!==null||summary.relativeDiscountPct!==null
      ||!nonemptyString(summary.method)||!validAsOf(summary.asOf)||summary.sourceRefs.length===0)return null;
  }else if(value.recommendationAuthority==='conditional_research'){
    if(!threshold||typeof threshold!=='object'||Array.isArray(threshold)||threshold.kind!=='relative'
      ||!finitePositive(threshold.currentMultiple)||!finitePositive(threshold.referenceMultiple)
      ||threshold.algorithm!=='official-relative-pe-evidence-v1'
      ||!['currentObservationRoot','historyMembershipRoot','sectorMembershipRoot','evidenceRoot']
        .every((key)=>typeof threshold[key]==='string'&&/^[0-9a-f]{64}$/u.test(threshold[key]))
      ||!Number.isSafeInteger(threshold.historySessions)||threshold.historySessions!==252
      ||!Number.isSafeInteger(threshold.sectorPeers)||threshold.sectorPeers<8
      ||round(summary.currentPrice/threshold.currentMultiple*threshold.referenceMultiple,2)!==summary.relativeBand.base)return null;
    rawDiscount=100*(1-threshold.currentMultiple/threshold.referenceMultiple);
    if(!finitePositive(summary.currentPrice)||!Number.isFinite(summary.relativeDiscountPct)
      ||summary.relativeDiscountPct!==round(rawDiscount,1)
      ||summary.formalRange!==null||summary.baseUpsidePct!==null||!nonemptyString(summary.method)
      ||!validAsOf(summary.asOf)||summary.sourceRefs.length===0)return null;
  }else if(summary.currentPrice!==null&& !finitePositive(summary.currentPrice)
    ||summary.formalRange!==null||summary.relativeBand!==null||summary.baseUpsidePct!==null
    ||summary.relativeDiscountPct!==null||summary.method!==null||summary.asOf!==null||summary.sourceRefs.length!==0
    ||summary.thresholdAuthority!==null)return null;
  const plan=value.entryPlan;
  if(plan!==null){
    if(!plan||typeof plan!=='object'||Array.isArray(plan)
      ||!exactObjectKeys(plan,['technicalState','trigger','entryZone','invalidation','rewardRisk'])
      ||!nonemptyString(plan.technicalState))return null;
    const hasGeometry=Array.isArray(plan.entryZone)&&plan.entryZone.length===2&&plan.entryZone.every(finitePositive)
      &&finitePositive(plan.invalidation)&&plan.invalidation<plan.entryZone[0]&&plan.entryZone[0]<=plan.entryZone[1];
    const hasNoGeometry=plan.entryZone===null&&plan.invalidation===null;
    if(!hasGeometry&&!hasNoGeometry||!validPlanShape(plan,hasGeometry,hasNoGeometry))return null;
    if(hasGeometry&&value.recommendationAuthority==='formal'){
      const entry=(plan.entryZone[0]+plan.entryZone[1])/2;
      rawRewardRisk=(threshold.baseTargetRaw-entry)/(entry-plan.invalidation);
      const expectedRewardRisk=round(rawRewardRisk,2);
      if(!Number.isFinite(plan.rewardRisk)||plan.rewardRisk!==expectedRewardRisk)return null;
    }else if(plan.rewardRisk!==null)return null;
    if(value.userAction==='buy'&&(!hasGeometry||plan.technicalState!=='breakout_confirmed'))return null;
    if(value.userAction==='accumulate'&&(!hasGeometry||plan.technicalState!=='at_support'))return null;
    if(value.userAction==='research_starter'&&(!hasGeometry||!['at_support','breakout_confirmed'].includes(plan.technicalState)))return null;
    if(value.userAction==='wait_breakout'&&(!hasGeometry||plan.technicalState!=='breakout_pending'))return null;
    if(value.userAction==='wait_reclaim'&&(!hasNoGeometry||!['below_support','reclaim_required'].includes(plan.technicalState)))return null;
    if(value.userAction==='avoid_chase'&&(!hasNoGeometry||plan.technicalState!=='extended'))return null;
    if(value.userAction==='avoid'&&plan.technicalState==='invalidated'&&!hasNoGeometry)return null;
  }else if(['buy','accumulate','research_starter','wait_breakout','wait_reclaim','avoid_chase'].includes(value.userAction))return null;
  if(['buy','accumulate'].includes(value.userAction)
    &&(value.recommendationAuthority!=='formal'||!meetsMinimum(rawUpside,15)
      ||!meetsMinimum(rawRewardRisk,2)||value.blockers.length>0))return null;
  if(value.userAction==='research_starter'&&(value.recommendationAuthority!=='conditional_research'
    ||!meetsMinimum(rawDiscount,15)||value.blockers.length>0))return null;
  if(['wait_breakout','wait_reclaim','avoid_chase'].includes(value.userAction)
    &&(value.recommendationAuthority==='none'||value.blockers.length>0||plan.trigger===null))return null;
  if(value.userAction==='avoid'){
    if(value.recommendationAuthority==='none'&&value.valuationReadiness!=='conflict')return null;
    if(value.recommendationAuthority==='formal'&&(!plan||!(!meetsMinimum(rawUpside,15)
      ||(rawRewardRisk!==null&&!meetsMinimum(rawRewardRisk,2))
      ||plan.technicalState==='invalidated'||value.reason==='bias_observe_only')))return null;
    if(value.recommendationAuthority==='conditional_research'&&(!plan||!(!meetsMinimum(rawDiscount,15)
      ||plan.technicalState==='invalidated'||value.reason==='bias_observe_only')))return null;
  }
  if(value.userAction==='unavailable'&&value.blockers.length===0)return null;
  if(value.recommendationAuthority==='none'&&['missing','stale'].includes(value.valuationReadiness)
    &&value.userAction!=='unavailable')return null;
  return value;
}

module.exports = { ACTIONS, compatibilityAction, deriveDecisionEnvelope, overrideDecisionEnvelopeAction,
  unavailableDecisionEnvelope, relativeValuation, validateDecisionEnvelopeV313 };
