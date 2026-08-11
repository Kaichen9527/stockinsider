'use strict';

const { canonicalJson, sha256 } = require('./codec');
const { deriveDecisionEnvelope, validateDecisionEnvelopeV313 } = require('./decision-envelope');

const ACTIONS = Object.freeze(['buy','accumulate','research_starter','wait_value','wait_market',
  'wait_breakout','wait_reclaim','avoid_chase','avoid','unavailable']);
const THRESHOLD_KEYS = Object.freeze(['actualMarginPct','actualRewardRisk','evidenceRoot','marketRegime',
  'requiredMarginPct','requiredRewardRisk']);
const exactObjectKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');

function meets(value,minimum){return Number.isFinite(value)&&value>=minimum-Number.EPSILON*Math.max(1,Math.abs(value),minimum)*16;}
function tickSize(price){return price<10?0.01:price<50?0.05:price<100?0.1:price<500?0.5:price<1000?1:5;}
function tickRoundDown(value){const tick=tickSize(value);return Math.floor((value+Number.EPSILON)/tick)*tick;}

function seal(base,{userAction=base.userAction,reason=base.reason,blockers=base.blockers,nextUnlock=null,whyNow=base.whyNow,
  thresholdAuthority=null}={}){
  const unique=[...new Set(blockers??[])];
  const material={...base,version:'decision-envelope-v3.14.0',userAction,reason,whyNow,blockers:unique,
    valuationSummary:{...base.valuationSummary,blockers:unique},nextUnlock,thresholdAuthority};
  delete material.decisionRevisionId;
  return Object.freeze({...material,decisionRevisionId:`decision-v3.14:${sha256(canonicalJson(material))}`});
}

function deriveDecisionEnvelopeV314(input){
  const marketReadiness=input?.marketReadiness??(typeof input?.marketAllowsAction==='boolean'?'available':'missing');
  const base=deriveDecisionEnvelope({...input,marketAllowsAction:marketReadiness==='available'});
  const state=base.entryPlan?.technicalState;
  if(base.valuationReadiness==='conflict')return seal(base,{userAction:'unavailable',reason:'valuation_authority_conflict',
    blockers:['valuation_authority_conflict']});
  if(base.recommendationAuthority==='none'||!['at_support','breakout_confirmed'].includes(state))return seal(base);
  if(input?.qualityActionEligible!==true||marketReadiness!=='available')return seal(base);
  const selective=input?.marketRegime==='selective_or_defensive';
  const requiredMargin=selective?0.20:0.15;
  const requiredRR=selective?2.5:2;
  let stockGatePassed=false;
  let waitValue=false;
  let maxEntry=null;
  let actualMargin=null;let actualRR=null;let marginPassed=false;let rrPassed=false;
  if(base.recommendationAuthority==='formal'){
    const current=base.valuationSummary.currentPrice;
    const target=base.valuationSummary.thresholdAuthority?.baseTargetRaw;
    const zone=base.entryPlan?.entryZone;const stop=base.entryPlan?.invalidation;
    const midpoint=Array.isArray(zone)?(zone[0]+zone[1])/2:null;
    const upside=Number.isFinite(current)&&current>0&&Number.isFinite(target)?100*(target/current-1):null;
    const rr=Number.isFinite(midpoint)&&Number.isFinite(stop)&&midpoint>stop
      ?(target-midpoint)/(midpoint-stop):null;
    actualMargin=upside;actualRR=rr;marginPassed=meets(upside,requiredMargin*100);rrPassed=meets(rr,requiredRR);
    stockGatePassed=marginPassed&&rrPassed;
    waitValue=marginPassed!==rrPassed&&Number.isFinite(upside)&&upside>0&&Number.isFinite(rr)&&rr>0;
    if(waitValue){
      maxEntry=tickRoundDown(Math.min(target/(1+requiredMargin),(target+requiredRR*stop)/(1+requiredRR)));
    }
  }else{
    const relativeAuthority=base.valuationSummary.thresholdAuthority;
    const currentMultiple=relativeAuthority?.currentMultiple;
    const referenceMultiple=relativeAuthority?.referenceMultiple;
    const discount=Number.isFinite(currentMultiple)&&currentMultiple>0&&Number.isFinite(referenceMultiple)
      &&referenceMultiple>0?100*(1-currentMultiple/referenceMultiple):null;
    const zone=base.entryPlan.entryZone;const stop=base.entryPlan.invalidation;
    const midpoint=(zone[0]+zone[1])/2;
    const relativeTarget=Number.isFinite(base.valuationSummary.currentPrice)&&Number.isFinite(currentMultiple)
      &&currentMultiple>0&&Number.isFinite(referenceMultiple)
      ?base.valuationSummary.currentPrice/currentMultiple*referenceMultiple:null;
    const rr=(relativeTarget-midpoint)/(midpoint-stop);
    actualMargin=discount;actualRR=rr;marginPassed=meets(discount,requiredMargin*100);rrPassed=meets(rr,requiredRR);
    stockGatePassed=marginPassed&&rrPassed;
    waitValue=marginPassed!==rrPassed&&Number.isFinite(discount)&&discount>0&&Number.isFinite(rr)&&rr>0;
    if(waitValue)maxEntry=tickRoundDown(Math.min(relativeTarget*(1-requiredMargin),
      (relativeTarget+requiredRR*stop)/(1+requiredRR)));
  }
  const thresholdAuthority=Object.freeze({marketRegime:selective?'selective_or_defensive':'risk_on',
    requiredMarginPct:requiredMargin*100,requiredRewardRisk:requiredRR,actualMarginPct:actualMargin,
    actualRewardRisk:actualRR,evidenceRoot:sha256(canonicalJson([base.decisionRevisionId,input?.marketRegime,
      requiredMargin,requiredRR,actualMargin,actualRR]))});
  if(stockGatePassed&&input?.marketAllowsAction!==true)return seal(base,{userAction:'wait_market',
    reason:'market_regime_gate',blockers:['market_regime_gate'],thresholdAuthority,
    whyNow:'個股條件已通過，等待市場風險預算恢復。'});
  if(stockGatePassed)return seal(base,{userAction:base.recommendationAuthority==='formal'
    ?state==='breakout_confirmed'?'buy':'accumulate':'research_starter',reason:`v314_${state}`,
    blockers:[],thresholdAuthority,whyNow:base.recommendationAuthority==='formal'?'估值、安全邊際、品質與技術條件同時通過。'
      :'官方相對估值折價、品質與技術條件同時通過；尚非正式目標價。'});
  if(waitValue&&Number.isFinite(maxEntry)&&maxEntry>0)return seal(base,{userAction:'wait_value',
    reason:'entry_price_above_required_value_gate',blockers:['entry_price_above_required_value_gate'],
    thresholdAuthority,nextUnlock:{kind:'max_entry',price:maxEntry,requiredMarginPct:requiredMargin*100,requiredRewardRisk:requiredRR},
    whyNow:`研究條件仍成立；價格回到 ${maxEntry.toFixed(2)} 以下才符合安全邊際。`});
  return seal(base,{userAction:'unavailable',reason:'multiple_decision_gates_not_met',
    blockers:['margin_gate_not_met','reward_risk_gate_not_met'].filter((_,index)=>index===0?!marginPassed:!rrPassed),
    thresholdAuthority,whyNow:'個股仍有多個決策條件未通過，保留研究但不形成新倉動作。'});
}

function validateDecisionEnvelopeV314(value){
  if(!value||value.version!=='decision-envelope-v3.14.0'||!/^decision-v3[.]14:[0-9a-f]{64}$/u.test(value.decisionRevisionId)
    ||!ACTIONS.includes(value.userAction))return null;
  if(value.userAction==='wait_value'&&(!value.nextUnlock||value.nextUnlock.kind!=='max_entry'
    ||!Number.isFinite(value.nextUnlock.price)||value.nextUnlock.price<=0))return null;
  if(value.userAction!=='wait_value'&&value.nextUnlock!==null)return null;
  const thresholdActions=['buy','accumulate','research_starter','wait_value','wait_market'];
  if(thresholdActions.includes(value.userAction)&&value.thresholdAuthority===null)return null;
  if(value.thresholdAuthority!==null){
    if(!thresholdActions.includes(value.userAction)&&value.userAction!=='unavailable')return null;
    const authority=value.thresholdAuthority;
    if(!exactObjectKeys(authority,THRESHOLD_KEYS)
      ||!['risk_on','selective_or_defensive'].includes(authority.marketRegime)
      ||![15,20].includes(authority.requiredMarginPct)||![2,2.5].includes(authority.requiredRewardRisk)
      ||!Number.isFinite(authority.actualMarginPct)||!Number.isFinite(authority.actualRewardRisk)
      ||!/^[0-9a-f]{64}$/u.test(authority.evidenceRoot))return null;
    if((authority.marketRegime==='risk_on'
        &&(authority.requiredMarginPct!==15||authority.requiredRewardRisk!==2))
      ||(authority.marketRegime==='selective_or_defensive'
        &&(authority.requiredMarginPct!==20||authority.requiredRewardRisk!==2.5)))return null;

    const adapted={...value,version:'decision-envelope-v3.13.0',
      decisionRevisionId:`decision-v3.13:${value.decisionRevisionId.slice('decision-v3.14:'.length)}`,
      userAction:['wait_value','wait_market'].includes(value.userAction)?'unavailable':value.userAction};
    delete adapted.nextUnlock;delete adapted.thresholdAuthority;
    if(!validateDecisionEnvelopeV313(adapted))return null;

    const summary=value.valuationSummary;const plan=value.entryPlan;
    if(!summary||!plan||!Array.isArray(plan.entryZone)||plan.entryZone.length!==2
      ||!Number.isFinite(plan.invalidation))return null;
    const midpoint=(plan.entryZone[0]+plan.entryZone[1])/2;
    const valuationThreshold=summary.thresholdAuthority;
    const target=value.recommendationAuthority==='formal'?valuationThreshold?.baseTargetRaw
      :Number.isFinite(summary.currentPrice)&&Number.isFinite(valuationThreshold?.currentMultiple)
        &&valuationThreshold.currentMultiple>0&&Number.isFinite(valuationThreshold?.referenceMultiple)
        ?summary.currentPrice/valuationThreshold.currentMultiple*valuationThreshold.referenceMultiple:null;
    const actualMargin=value.recommendationAuthority==='formal'
      ?Number.isFinite(target)&&Number.isFinite(summary.currentPrice)&&summary.currentPrice>0
        ?100*(target/summary.currentPrice-1):null
      :Number.isFinite(valuationThreshold?.currentMultiple)&&valuationThreshold.currentMultiple>0
        &&Number.isFinite(valuationThreshold?.referenceMultiple)&&valuationThreshold.referenceMultiple>0
        ?100*(1-valuationThreshold.currentMultiple/valuationThreshold.referenceMultiple):null;
    const actualRewardRisk=Number.isFinite(target)&&midpoint>plan.invalidation
      ?(target-midpoint)/(midpoint-plan.invalidation):null;
    const close=(left,right)=>Number.isFinite(left)&&Number.isFinite(right)
      &&Math.abs(left-right)<=1e-9*Math.max(1,Math.abs(left),Math.abs(right));
    if(!close(authority.actualMarginPct,actualMargin)||!close(authority.actualRewardRisk,actualRewardRisk))return null;
    const marginPassed=meets(actualMargin,authority.requiredMarginPct);
    const rewardRiskPassed=meets(actualRewardRisk,authority.requiredRewardRisk);
    if(['buy','accumulate','research_starter','wait_market'].includes(value.userAction)
      &&(!marginPassed||!rewardRiskPassed))return null;
    if(value.userAction==='wait_market'
      &&(value.blockers.length!==1||value.blockers[0]!=='market_regime_gate'))return null;
    if(value.userAction==='wait_value'){
      if(marginPassed===rewardRiskPassed||value.blockers.length!==1
        ||value.blockers[0]!=='entry_price_above_required_value_gate'
        ||value.nextUnlock.requiredMarginPct!==authority.requiredMarginPct
        ||value.nextUnlock.requiredRewardRisk!==authority.requiredRewardRisk)return null;
    }
    if(value.userAction==='unavailable'&&marginPassed&&rewardRiskPassed
      &&value.reason!=='insufficient_cited_decision_brief')return null;
  }else{
    const adapted={...value,version:'decision-envelope-v3.13.0',
      decisionRevisionId:`decision-v3.13:${value.decisionRevisionId.slice('decision-v3.14:'.length)}`};
    delete adapted.nextUnlock;delete adapted.thresholdAuthority;
    if(!validateDecisionEnvelopeV313(adapted))return null;
  }
  return value;
}

module.exports={ACTIONS,deriveDecisionEnvelopeV314,validateDecisionEnvelopeV314};
