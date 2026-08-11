import type { DecisionEnvelopeV313 } from '@/lib/types';

export const DECISION_CARD_BUCKETS = [
  'sourceSignals', 'opportunities', 'scenarioUpsideCandidates', 'earlyWatchlist', 'hotTracking',
] as const;

const ACTIONS = new Set<DecisionEnvelopeV313['userAction']>([
  'buy', 'accumulate', 'research_starter', 'wait_value', 'wait_market', 'wait_breakout', 'wait_reclaim', 'avoid_chase', 'avoid', 'unavailable',
]);
const AUTHORITIES = new Set(['formal', 'conditional_research', 'none']);
const READINESS = new Set(['complete', 'relative_only', 'missing', 'stale', 'conflict']);
const POINTS = ['thesis:0', 'thesis:1', 'thesis:2', 'risk:0', 'risk:1', 'risk:2'];
const DECISION_REVISION_PATTERN = /^decision-v3[.](?:13|14):[0-9a-f]{64}$/u;
export const DECISION_BRIEF_UNAVAILABLE_REASON = 'insufficient_cited_decision_brief' as const;
export const STALE_READONLY_REASON = 'projection_stale_readonly' as const;

export type PublishedDecisionDetailAvailability = 'available'|'unavailable'|'stale_readonly';

export interface ValidatedPublishedDecisionCard {
  card: Record<string,unknown>; envelope: DecisionEnvelopeV313; thesis:string[]; risks:string[];
  citations:Record<string,unknown>[]; provenance:Record<string,unknown>;
  briefAvailability:'available'|'unavailable'; briefBlocker:typeof DECISION_BRIEF_UNAVAILABLE_REASON|null;
  detailAvailability:PublishedDecisionDetailAvailability;
  lastKnownAction:DecisionEnvelopeV313['userAction']|null;
}

export type DecisionRevisionQuery =
  | { status: 'absent'; revisionId: null }
  | { status: 'valid'; revisionId: string }
  | { status: 'invalid_or_ambiguous'; revisionId: null };

export function parseDecisionRevisionQuery(
  query: Record<string, string | string[] | undefined>,
): DecisionRevisionQuery {
  const raw=query.decisionRevisionId;
  if(raw===undefined)return {status:'absent',revisionId:null};
  const values=Array.isArray(raw)?raw:[raw];
  if(values.length!==1||!DECISION_REVISION_PATTERN.test(values[0])){
    return {status:'invalid_or_ambiguous',revisionId:null};
  }
  return {status:'valid',revisionId:values[0]};
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && value.length > 0;
}

export function validHttpsPublicationUrl(value: unknown): value is string {
  if (!nonempty(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0
      && parsed.username === '' && parsed.password === '';
  } catch { return false; }
}

export function validRfc3339Instant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:[.](\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone, , offsetHourText, offsetMinuteText] = match;
  const year=Number(yearText); const month=Number(monthText); const day=Number(dayText);
  const hour=Number(hourText); const minute=Number(minuteText); const second=Number(secondText);
  const maximumDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  if (month<1||month>12||day<1||day>maximumDay||hour>23||minute>59||second>59)return false;
  if(zone!=='Z'){
    const offsetHour=Number(offsetHourText);const offsetMinute=Number(offsetMinuteText);
    if(offsetHour>14||offsetMinute>59||(offsetHour===14&&offsetMinute!==0))return false;
  }
  return Number.isFinite(Date.parse(value));
}

function validCitation(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row=value as Record<string,unknown>;
  if(!nonempty(row.ref)||!nonempty(row.sourceKey)||!nonempty(row.sourceName)
    ||!validHttpsPublicationUrl(row.sourceUrl)||!validRfc3339Instant(row.publishedAt)
    ||!validRfc3339Instant(row.collectedAt)||!validRfc3339Instant(row.evaluatedAt))return false;
  return Date.parse(row.publishedAt)<=Date.parse(row.collectedAt)
    &&Date.parse(row.collectedAt)<=Date.parse(row.evaluatedAt);
}

function validProvenance(value: unknown): value is Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const row=value as Record<string,unknown>;
  if(!nonempty(row.sourceKey)||!nonempty(row.sourceName)||!validHttpsPublicationUrl(row.sourceUrl)
    ||!validRfc3339Instant(row.publishedAt)||!validRfc3339Instant(row.collectedAt)
    ||!validRfc3339Instant(row.evaluatedAt))return false;
  return Date.parse(row.publishedAt)<=Date.parse(row.collectedAt)
    &&Date.parse(row.collectedAt)<=Date.parse(row.evaluatedAt);
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function rounded(value:number,digits:number){
  const scale=10**digits;
  const scaled=Math.abs(value)*scale;
  const tolerance=Number.EPSILON*Math.max(1,scaled)*16;
  const result=Math.sign(value)*Math.round(scaled+tolerance)/scale;
  return Object.is(result,-0)?0:result;
}
function meetsMinimum(value:number|null,minimum:number){
  if(!Number.isFinite(value))return false;
  const numeric=value as number;
  const tolerance=Number.EPSILON*Math.max(1,Math.abs(numeric),Math.abs(minimum))*16;
  return numeric>=minimum||Math.abs(numeric-minimum)<=tolerance;
}
function validAsOf(value:unknown){
  if(validRfc3339Instant(value))return true;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value))return false;
  const [year,month,day]=value.split('-').map(Number);
  return month>=1&&month<=12&&day>=1&&day<=new Date(Date.UTC(year,month,0)).getUTCDate();
}
function exactObjectKeys(value:Record<string,unknown>,allowed:string[]){
  const keys=Object.keys(value);
  return keys.length===allowed.length&&keys.every((key)=>allowed.includes(key));
}
function validTypedTrigger(value:unknown,kind:'reclaim'|'breakout'|'pullback'){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const trigger=value as Record<string,unknown>;
  return exactObjectKeys(trigger,trigger.volumeRatioMinimum===undefined?['kind','threshold']
    :['kind','threshold','volumeRatioMinimum'])&&trigger.kind===kind&&finitePositive(trigger.threshold)
    &&(trigger.volumeRatioMinimum===undefined||trigger.volumeRatioMinimum===null
      ||finitePositive(trigger.volumeRatioMinimum));
}
function validPlanShape(entry:Record<string,unknown>,hasGeometry:boolean,hasNoGeometry:boolean){
  if(['below_support','reclaim_required'].includes(String(entry.technicalState)))
    return hasNoGeometry&&validTypedTrigger(entry.trigger,'reclaim');
  if(entry.technicalState==='breakout_pending')return hasGeometry&&validTypedTrigger(entry.trigger,'breakout');
  if(entry.technicalState==='extended')return hasNoGeometry&&validTypedTrigger(entry.trigger,'pullback');
  if(entry.technicalState==='invalidated')return hasNoGeometry&&entry.trigger===null;
  if(['at_support','breakout_confirmed'].includes(String(entry.technicalState)))return hasGeometry&&entry.trigger===null;
  return false;
}
function sameStringArray(left:unknown,right:unknown){
  return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length
    &&left.every((value,index)=>value===right[index]);
}

export function validateDecisionEnvelopeV313(value: unknown, outerRevisionId?: string): DecisionEnvelopeV313 | null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const envelope=value as Record<string,unknown>;
  if(!['decision-envelope-v3.13.0','decision-envelope-v3.14.0'].includes(String(envelope.version))
    ||!nonempty(envelope.decisionRevisionId)
    ||!/^decision-v3[.](?:13|14):[0-9a-f]{64}$/u.test(envelope.decisionRevisionId)
    ||(envelope.version==='decision-envelope-v3.13.0'&&!String(envelope.decisionRevisionId).startsWith('decision-v3.13:'))
    ||(envelope.version==='decision-envelope-v3.14.0'&&!String(envelope.decisionRevisionId).startsWith('decision-v3.14:'))
    ||(outerRevisionId!==undefined&&envelope.decisionRevisionId!==outerRevisionId)
    ||!AUTHORITIES.has(String(envelope.recommendationAuthority))
    ||!READINESS.has(String(envelope.valuationReadiness))
    ||!ACTIONS.has(envelope.userAction as DecisionEnvelopeV313['userAction'])
    ||!nonempty(envelope.reason)||!nonempty(envelope.whyNow)||!Array.isArray(envelope.blockers)
    ||envelope.blockers.some((item)=>!nonempty(item))||new Set(envelope.blockers).size!==envelope.blockers.length)return null;
  const authority=String(envelope.recommendationAuthority);const readiness=String(envelope.valuationReadiness);
  const action=envelope.userAction as DecisionEnvelopeV313['userAction'];
  if(envelope.version==='decision-envelope-v3.14.0'){
    const unlock=envelope.nextUnlock;
    if(action==='wait_value'){
      if(!unlock||typeof unlock!=='object'||Array.isArray(unlock))return null;
      const row=unlock as Record<string,unknown>;
      if(row.kind!=='max_entry'||!finitePositive(row.price)||!finitePositive(row.requiredMarginPct)
        ||!finitePositive(row.requiredRewardRisk))return null;
    }else if(unlock!==null)return null;
    const thresholdActions=['buy','accumulate','research_starter','wait_value','wait_market'];
    if(thresholdActions.includes(action)&&envelope.thresholdAuthority===null)return null;
    if(envelope.thresholdAuthority!==null){
      if(!thresholdActions.includes(action)&&action!=='unavailable')return null;
      const authority=envelope.thresholdAuthority;
      if(!authority||typeof authority!=='object'||Array.isArray(authority))return null;
      const row=authority as Record<string,unknown>;
      if(!exactObjectKeys(row,['actualMarginPct','actualRewardRisk','evidenceRoot','marketRegime',
        'requiredMarginPct','requiredRewardRisk'])
        ||!['risk_on','selective_or_defensive'].includes(String(row.marketRegime))
        ||![15,20].includes(Number(row.requiredMarginPct))||![2,2.5].includes(Number(row.requiredRewardRisk))
        ||typeof row.actualMarginPct!=='number'||!Number.isFinite(row.actualMarginPct)
        ||typeof row.actualRewardRisk!=='number'||!Number.isFinite(row.actualRewardRisk)
        ||typeof row.evidenceRoot!=='string'||!/^[0-9a-f]{64}$/u.test(row.evidenceRoot))return null;
      if((row.marketRegime==='risk_on'&&(row.requiredMarginPct!==15||row.requiredRewardRisk!==2))
        ||(row.marketRegime==='selective_or_defensive'
          &&(row.requiredMarginPct!==20||row.requiredRewardRisk!==2.5)))return null;
    }
  }
  if((authority==='formal'&&readiness!=='complete')
    ||(authority==='conditional_research'&&readiness!=='relative_only')
    ||(authority==='none'&&!['missing','stale','conflict'].includes(readiness)))return null;
  const summary=envelope.valuationSummary;
  if(!summary||typeof summary!=='object'||Array.isArray(summary))return null;
  const valuation=summary as Record<string,unknown>;
  if(!['formal_range','relative_reference_band','unavailable'].includes(String(valuation.kind))
    ||!Array.isArray(valuation.sourceRefs)||valuation.sourceRefs.some((item)=>!nonempty(item))
    ||new Set(valuation.sourceRefs).size!==valuation.sourceRefs.length
    ||!Array.isArray(valuation.blockers)||valuation.blockers.some((item)=>!nonempty(item))
    ||new Set(valuation.blockers).size!==valuation.blockers.length
    ||!sameStringArray(envelope.blockers,valuation.blockers))return null;
  if(authority==='formal'&&valuation.kind!=='formal_range')return null;
  if(authority==='conditional_research'&&valuation.kind!=='relative_reference_band')return null;
  if(authority==='none'&&valuation.kind!=='unavailable')return null;
  const range=valuation.kind==='formal_range'?valuation.formalRange:
    valuation.kind==='relative_reference_band'?valuation.relativeBand:null;
  if(range){
    if(typeof range!=='object'||Array.isArray(range))return null;
    const values=valuation.kind==='formal_range'
      ?[(range as Record<string,unknown>).bear,(range as Record<string,unknown>).base,(range as Record<string,unknown>).bull]
      :[(range as Record<string,unknown>).low,(range as Record<string,unknown>).base,(range as Record<string,unknown>).high];
    if(!values.every(finitePositive)||!(values[0]!<=values[1]!&&values[1]!<=values[2]!))return null;
  }else if(authority!=='none')return null;
  const threshold=valuation.thresholdAuthority as Record<string,unknown>|null;
  let rawUpside:number|null=null;let rawDiscount:number|null=null;let rawRewardRisk:number|null=null;
  if(authority==='formal'){
    const formalRange=valuation.formalRange as Record<string,number>;
    if(!threshold||threshold.kind!=='formal'||!finitePositive(threshold.baseTargetRaw)
      ||rounded(threshold.baseTargetRaw,2)!==formalRange.base)return null;
    rawUpside=100*((threshold.baseTargetRaw as number)/(valuation.currentPrice as number)-1);
    if(!finitePositive(valuation.currentPrice)||typeof valuation.baseUpsidePct!=='number'
      ||!Number.isFinite(valuation.baseUpsidePct)||valuation.baseUpsidePct!==rounded(rawUpside,1)
      ||valuation.relativeBand!==null||valuation.relativeDiscountPct!==null||!nonempty(valuation.method)
      ||!validAsOf(valuation.asOf)||(valuation.sourceRefs as unknown[]).length===0)return null;
  }else if(authority==='conditional_research'){
    if(!threshold||threshold.kind!=='relative'||!finitePositive(threshold.currentMultiple)
      ||!finitePositive(threshold.referenceMultiple)||threshold.algorithm!=='official-relative-pe-evidence-v1'
      ||!['currentObservationRoot','historyMembershipRoot','sectorMembershipRoot','evidenceRoot']
        .every((key)=>typeof threshold[key]==='string'&&/^[0-9a-f]{64}$/u.test(threshold[key] as string))
      ||!Number.isSafeInteger(threshold.historySessions)||(threshold.historySessions as number)!==252
      ||!Number.isSafeInteger(threshold.sectorPeers)
      ||(threshold.sectorPeers as number)<8
      ||rounded((valuation.currentPrice as number)/(threshold.currentMultiple as number)
        *(threshold.referenceMultiple as number),2)!==(valuation.relativeBand as Record<string,number>).base)return null;
    rawDiscount=100*(1-(threshold.currentMultiple as number)/(threshold.referenceMultiple as number));
    if(!finitePositive(valuation.currentPrice)||typeof valuation.relativeDiscountPct!=='number'
      ||!Number.isFinite(valuation.relativeDiscountPct)||valuation.relativeDiscountPct!==rounded(rawDiscount,1)
      ||valuation.formalRange!==null||valuation.baseUpsidePct!==null||!nonempty(valuation.method)
      ||!validAsOf(valuation.asOf)||(valuation.sourceRefs as unknown[]).length===0)return null;
  }else if((valuation.currentPrice!==null&&!finitePositive(valuation.currentPrice))||valuation.formalRange!==null
    ||valuation.relativeBand!==null||valuation.baseUpsidePct!==null||valuation.relativeDiscountPct!==null
    ||valuation.method!==null||valuation.asOf!==null||(valuation.sourceRefs as unknown[]).length!==0
    ||valuation.thresholdAuthority!==null)return null;
  const plan=envelope.entryPlan;
  if(plan!==null){
    if(!plan||typeof plan!=='object'||Array.isArray(plan))return null;
    const entry=plan as Record<string,unknown>;const zone=entry.entryZone;
    if(!exactObjectKeys(entry,['technicalState','trigger','entryZone','invalidation','rewardRisk'])
      ||!nonempty(entry.technicalState))return null;
    const hasGeometry=Array.isArray(zone)&&zone.length===2&&zone.every(finitePositive)
      &&finitePositive(entry.invalidation)&&(entry.invalidation as number)<(zone[0] as number)
      &&(zone[0] as number)<=(zone[1] as number);
    const hasNoGeometry=zone===null&&entry.invalidation===null;
    if((!hasGeometry&&!hasNoGeometry)||!validPlanShape(entry,hasGeometry,hasNoGeometry))return null;
    if(hasGeometry&&authority==='formal'){
      const numericZone=zone as number[];
      const midpoint=(numericZone[0]+numericZone[1])/2;
      rawRewardRisk=((threshold!.baseTargetRaw as number)-midpoint)/(midpoint-(entry.invalidation as number));
      const expectedRewardRisk=rounded(rawRewardRisk,2);
      if(typeof entry.rewardRisk!=='number'||!Number.isFinite(entry.rewardRisk)||entry.rewardRisk!==expectedRewardRisk)return null;
    }else if(entry.rewardRisk!==null)return null;
    if(action==='buy'&&(!hasGeometry||entry.technicalState!=='breakout_confirmed'))return null;
    if(action==='accumulate'&&(!hasGeometry||entry.technicalState!=='at_support'))return null;
    if(action==='research_starter'&&(!hasGeometry||!['at_support','breakout_confirmed'].includes(entry.technicalState as string)))return null;
    if(['wait_value','wait_market'].includes(action)&&(!hasGeometry
      ||!['at_support','breakout_confirmed'].includes(entry.technicalState as string)))return null;
    if(action==='wait_breakout'&&(!hasGeometry||entry.technicalState!=='breakout_pending'))return null;
    if(action==='wait_reclaim'&&(!hasNoGeometry||!['below_support','reclaim_required'].includes(entry.technicalState as string)))return null;
    if(action==='avoid_chase'&&(!hasNoGeometry||entry.technicalState!=='extended'))return null;
    if(action==='avoid'&&entry.technicalState==='invalidated'&&!hasNoGeometry)return null;
  }else if(['buy','accumulate','research_starter','wait_value','wait_market','wait_breakout','wait_reclaim','avoid_chase'].includes(action))return null;
  if(envelope.version==='decision-envelope-v3.14.0'&&envelope.thresholdAuthority!==null){
    const outer=envelope.thresholdAuthority as Record<string,number|string>;
    if(!plan||typeof plan!=='object'||Array.isArray(plan))return null;
    const numericPlan=plan as Record<string,unknown>;const zone=numericPlan.entryZone;
    if(!Array.isArray(zone)||zone.length!==2||!zone.every(finitePositive)
      ||!finitePositive(numericPlan.invalidation))return null;
    const numericZone=zone as number[];const midpoint=(numericZone[0]+numericZone[1])/2;
    const invalidation=numericPlan.invalidation as number;
    const target=authority==='formal'?(threshold!.baseTargetRaw as number)
      :(valuation.currentPrice as number)/(threshold!.currentMultiple as number)*(threshold!.referenceMultiple as number);
    const actualMargin=authority==='formal'?rawUpside:rawDiscount;
    const actualRewardRisk=(target-midpoint)/(midpoint-invalidation);
    const close=(left:unknown,right:number|null)=>typeof left==='number'&&Number.isFinite(left)&&Number.isFinite(right)
      &&Math.abs(left-(right as number))<=1e-9*Math.max(1,Math.abs(left),Math.abs(right as number));
    if(!close(outer.actualMarginPct,actualMargin)||!close(outer.actualRewardRisk,actualRewardRisk))return null;
    const marginPassed=meetsMinimum(actualMargin,outer.requiredMarginPct as number);
    const rewardRiskPassed=meetsMinimum(actualRewardRisk,outer.requiredRewardRisk as number);
    if(['buy','accumulate','research_starter','wait_market'].includes(action)
      &&(!marginPassed||!rewardRiskPassed))return null;
    if(action==='wait_market'&&((envelope.blockers as unknown[]).length!==1
      ||envelope.blockers[0]!=='market_regime_gate'))return null;
    if(action==='wait_value'){
      const unlock=envelope.nextUnlock as Record<string,unknown>;
      if(marginPassed===rewardRiskPassed||(envelope.blockers as unknown[]).length!==1
        ||envelope.blockers[0]!=='entry_price_above_required_value_gate'
        ||unlock.requiredMarginPct!==outer.requiredMarginPct
        ||unlock.requiredRewardRisk!==outer.requiredRewardRisk)return null;
    }
    if(action==='unavailable'&&marginPassed&&rewardRiskPassed
      &&envelope.reason!=='insufficient_cited_decision_brief')return null;
  }
  if(['buy','accumulate'].includes(action)&&(authority!=='formal'||!meetsMinimum(rawUpside,15)
    ||!meetsMinimum(rawRewardRisk,2)||(envelope.blockers as unknown[]).length>0))return null;
  if(action==='research_starter'&&(authority!=='conditional_research'||!meetsMinimum(rawDiscount,15)
    ||(envelope.blockers as unknown[]).length>0))return null;
  if(['wait_breakout','wait_reclaim','avoid_chase'].includes(action)
    &&(authority==='none'||(envelope.blockers as unknown[]).length>0||(plan as Record<string,unknown>).trigger===null))return null;
  if(['wait_value','wait_market'].includes(action)
    &&(authority==='none'||(envelope.blockers as unknown[]).length!==1||!plan))return null;
  if(action==='avoid'){
    const entry=plan as Record<string,unknown>|null;
    if(authority==='none'&&readiness!=='conflict')return null;
    if(authority==='formal'&&(!entry||!(!meetsMinimum(rawUpside,15)
      ||(rawRewardRisk!==null&&!meetsMinimum(rawRewardRisk,2))||entry.technicalState==='invalidated'||envelope.reason==='bias_observe_only')))return null;
    if(authority==='conditional_research'&&(!entry||!(!meetsMinimum(rawDiscount,15)
      ||entry.technicalState==='invalidated'||envelope.reason==='bias_observe_only')))return null;
  }
  if(action==='unavailable'&&(envelope.blockers as unknown[]).length===0)return null;
  if(authority==='none'&&['missing','stale'].includes(readiness)&&action!=='unavailable')return null;
  return value as DecisionEnvelopeV313;
}

export function validatePublishedDecisionCard(value: unknown): ValidatedPublishedDecisionCard|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const card=value as Record<string,unknown>;
  if(!nonempty(card.symbol)||!/^\d{4}$/u.test(card.symbol)||!nonempty(card.decisionRevisionId))return null;
  if(card.researchDecision!==undefined&&(!card.researchDecision||typeof card.researchDecision!=='object'
    ||Array.isArray(card.researchDecision)))return null;
  const nested=card.researchDecision
    ?(card.researchDecision as Record<string,unknown>).decisionEnvelope:null;
  if(card.researchDecision&&nested===undefined)return null;
  if(card.decisionEnvelope&&nested&&card.decisionEnvelope!==nested
    &&JSON.stringify(card.decisionEnvelope)!==JSON.stringify(nested))return null;
  const envelope=validateDecisionEnvelopeV313(card.decisionEnvelope??nested,String(card.decisionRevisionId));
  if(!envelope)return null;
  const projectionReadOnly=card.projectionReadOnly===true;
  if((card.projectionReadOnly!==undefined&&!projectionReadOnly)
    ||(projectionReadOnly&&(!ACTIONS.has(card.lastKnownAction as DecisionEnvelopeV313['userAction'])
      ||card.lastKnownAction!==envelope.userAction))
    ||(!projectionReadOnly&&card.lastKnownAction!==undefined))return null;
  const rawCitations=card.citations;
  if(!Array.isArray(rawCitations)||rawCitations.length===0||rawCitations.some((item)=>!validCitation(item)))return null;
  const citations=rawCitations as Record<string,unknown>[];const refs=citations.map((row)=>row.ref as string);
  if(new Set(refs).size!==refs.length)return null;
  if(!validProvenance(card.sourceProvenance))return null;
  const provenance=card.sourceProvenance as Record<string,unknown>;
  if(!citations.some((citation)=>['sourceKey','sourceName','sourceUrl','publishedAt','collectedAt','evaluatedAt']
    .every((key)=>citation[key]===provenance[key])))return null;
  const brief=card.decisionBrief;
  if(!brief||typeof brief!=='object'||Array.isArray(brief))return null;
  const record=brief as Record<string,unknown>;
  if(record.availability==='unavailable'){
    if(Object.keys(record).length!==2||record.reason!==DECISION_BRIEF_UNAVAILABLE_REASON
      ||envelope.userAction!=='unavailable')return null;
    return {card,envelope,thesis:[],risks:[],citations,provenance,
      briefAvailability:'unavailable',briefBlocker:DECISION_BRIEF_UNAVAILABLE_REASON,
      detailAvailability:projectionReadOnly?'stale_readonly':'unavailable',
      lastKnownAction:projectionReadOnly?envelope.userAction:null};
  }
  const thesis=record.thesis;const risks=record.risks;const evidence=record.evidence;
  if(!Array.isArray(thesis)||thesis.length!==3||thesis.some((item)=>!nonempty(item)||item.length>240)
    ||!Array.isArray(risks)||risks.length!==3||risks.some((item)=>!nonempty(item)||item.length>240)
    ||!Array.isArray(evidence)||evidence.length!==6)return null;
  const pointNames=evidence.map((item)=>item&&typeof item==='object'&&!Array.isArray(item)
    ?(item as Record<string,unknown>).point:null);
  if(new Set(pointNames).size!==6||!POINTS.every((point)=>pointNames.includes(point)))return null;
  for(const item of evidence){
    if(!item||typeof item!=='object'||Array.isArray(item))return null;
    const itemRefs=(item as Record<string,unknown>).refs;
    if(!Array.isArray(itemRefs)||itemRefs.length===0||itemRefs.some((ref)=>!nonempty(ref)||!refs.includes(ref))
      ||new Set(itemRefs).size!==itemRefs.length)return null;
  }
  return {card,envelope,thesis:thesis as string[],risks:risks as string[],citations,provenance,
    briefAvailability:'available',briefBlocker:null,
    detailAvailability:projectionReadOnly?'stale_readonly':'available',
    lastKnownAction:projectionReadOnly?envelope.userAction:null};
}

export function buildPublishedDecisionDetailResult(validated:ValidatedPublishedDecisionCard){
  const {card,envelope}=validated;
  if(validated.detailAvailability==='stale_readonly'){
    return {statusCode:409,cacheControl:'no-store',body:{schema:'stock-detail-v3.13.0' as const,
      status:'stale_readonly' as const,symbol:String(card.symbol),
      decisionRevisionId:envelope.decisionRevisionId,reason:STALE_READONLY_REASON,
      lastKnownAction:validated.lastKnownAction}};
  }
  if(validated.detailAvailability==='unavailable'){
    return {statusCode:409,cacheControl:'no-store',body:{schema:'stock-detail-v3.13.0' as const,
      status:'unavailable' as const,symbol:String(card.symbol),
      decisionRevisionId:envelope.decisionRevisionId,reason:validated.briefBlocker}};
  }
  // Freshness is evaluated at request time. A shared cache entry created immediately
  // before the next scheduled-run boundary must never preserve an actionable envelope
  // after that boundary, so every revision-bound detail response is origin-only.
  return {statusCode:200,cacheControl:'no-store',
    body:{schema:'stock-detail-v3.13.0' as const,status:'ready' as const,symbol:String(card.symbol),
      decisionRevisionId:envelope.decisionRevisionId,decisionEnvelope:envelope,
      decisionBrief:card.decisionBrief,valuationSummary:envelope.valuationSummary,
      sourceProvenance:card.sourceProvenance,citations:card.citations}};
}

export function selectUniquePublishedDecisionCard(projection: Record<string,unknown>|null,symbol:string,revisionId?:string){
  if(!projection)return null;
  const matches:ReturnType<typeof validatePublishedDecisionCard>[]=[];
  let rawMatches=0;
  for(const bucket of DECISION_CARD_BUCKETS){
    const rows=projection[bucket];if(!Array.isArray(rows))continue;
    for(const row of rows){
      const candidate=row&&typeof row==='object'&&!Array.isArray(row)?row as Record<string,unknown>:null;
      const claimsDecision=Boolean(candidate&&(typeof candidate.decisionRevisionId==='string'
        ||candidate.decisionEnvelope!==undefined));
      if(claimsDecision&&candidate?.symbol===symbol
        &&(!revisionId||candidate.decisionRevisionId===revisionId))rawMatches+=1;
      const validated=validatePublishedDecisionCard(row);
      if(validated&&validated.card.symbol===symbol&&(!revisionId||validated.card.decisionRevisionId===revisionId))matches.push(validated);
    }
  }
  return rawMatches===1&&matches.length===1?matches[0]:null;
}
