import type { DecisionEnvelopeV313, SourceSignalCard } from '@/lib/types';

function envelope(revision: string, userAction: DecisionEnvelopeV313['userAction'],
  authority: DecisionEnvelopeV313['recommendationAuthority']): DecisionEnvelopeV313 {
  const formal=authority==='formal';const relative=authority==='conditional_research';
  const entryPlan:DecisionEnvelopeV313['entryPlan']=authority==='none'?null:userAction==='wait_reclaim'
    ?{technicalState:'reclaim_required',trigger:{kind:'reclaim',threshold:102},entryZone:null,
      invalidation:null,rewardRisk:null}
    :{technicalState:'breakout_confirmed',trigger:null,entryZone:[101,103],invalidation:92,
      rewardRisk:formal?1.8:null};
  return { version:'decision-envelope-v3.13.0',decisionRevisionId:revision,recommendationAuthority:authority,
    valuationReadiness:formal?'complete':relative?'relative_only':'missing',userAction,
    reason:authority==='none'?'official_financial_inputs_missing':userAction==='wait_reclaim'
      ?'support_must_be_reclaimed':userAction==='research_starter'?'conditional_breakout_confirmed':'fixture_decision',
    whyNow:formal?'官方財務與技術條件同時成立。':relative?'官方相對估值達研究門檻。':'新來源已出現，等待官方資料補齊。',
    valuationSummary:{kind:formal?'formal_range':relative?'relative_reference_band':'unavailable',currentPrice:authority==='none'?null:100,
      formalRange:formal?{bear:80,base:120,bull:150}:null,relativeBand:relative?{low:90,base:117.65,high:135}:null,
      baseUpsidePct:formal?20:null,relativeDiscountPct:relative?15:null,
      method:formal?'normalized_pe':relative?'official_relative_pe':null,asOf:authority==='none'?null:'2026-08-07T06:00:00Z',
      sourceRefs:authority==='none'?[]:['official-fixture'],thresholdAuthority:formal?{kind:'formal',baseTargetRaw:120}
        :relative?{kind:'relative',currentMultiple:12.75,referenceMultiple:15,historySessions:252,sectorPeers:8,
          algorithm:'official-relative-pe-evidence-v1',evidenceRoot:'a'.repeat(64),currentObservationRoot:'b'.repeat(64),
          historyMembershipRoot:'c'.repeat(64),sectorMembershipRoot:'d'.repeat(64)}:null,
      blockers:authority==='none'?['diluted_shares','cash_debt']:[]},
    entryPlan,blockers:authority==='none'?['diluted_shares','cash_debt']:[],
    evaluatedAt:'2026-08-07T06:30:00Z'};
}

function signal(symbol:string,name:string,decision:DecisionEnvelopeV313):SourceSignalCard {
  return {symbol,chineseName:name,researchMaturity:'source_signal',
    newPositionAction:decision.userAction==='research_starter'?'event_starter':decision.userAction==='wait_reclaim'?'wait_trigger':'valuation_review',
    decisionEnvelope:decision,decisionRevisionId:decision.decisionRevisionId,discoveredAt:'2026-08-07T05:00:00Z',
    sourceClass:'podcast',sourceSummary:decision.whyNow,evidenceRefs:['official-fixture'],
    valuationStatus:decision.valuationReadiness,technicalState:decision.entryPlan?.technicalState??'unavailable',
    changedBecause:'source_evidence_changed',currentPrice:100,missingAxes:decision.blockers,
    decisionBrief:{thesis:['官方資料形成可追溯的估值依據。','最新來源支持本次重新評估。','技術觸發與估值條件同時記錄於本 revision。'],
      risks:['估值倍數可能隨產業循環改變。','跌破失效價時研究假設失效。','資料過期時停止所有買進型動作。'],
      evidence:[{point:'thesis:0',refs:['official-fixture']},{point:'thesis:1',refs:['official-fixture']},
        {point:'thesis:2',refs:['official-fixture']},{point:'risk:0',refs:['official-fixture']},
        {point:'risk:1',refs:['official-fixture']},{point:'risk:2',refs:['official-fixture']}]},
    sourceProvenance:{sourceKey:'fixture.creator',sourceName:'授權來源 fixture',sourceUrl:'https://example.com/fixture',
      kolIdentity:'fixture',publishedAt:'2026-08-07T04:00:00Z',collectedAt:'2026-08-07T05:00:00Z',evaluatedAt:decision.evaluatedAt},
    citations:[{ref:'official-fixture',sourceKey:'fixture.creator',sourceName:'授權來源 fixture',
      sourceUrl:'https://example.com/fixture',kolIdentity:'fixture',publishedAt:'2026-08-07T04:00:00Z',
      collectedAt:'2026-08-07T05:00:00Z',evaluatedAt:decision.evaluatedAt}],
    detailHref:`/stock/${symbol}?decisionRevisionId=${encodeURIComponent(decision.decisionRevisionId)}`};
}

const nearBuy={...signal('9107','接近買點股票',envelope(`decision-v3.13:${'7'.repeat(64)}`,'unavailable','none')),
  proximityToAction:true,researchRanking:{version:'research-ranking-envelope-v3.14.0' as const,
    rankingScore:78,coverage:.9,missingAxes:['marketLiquidity'],axes:{valuation:84,fundamentalQuality:88,
      momentumTechnical:76,sourceCatalyst:82,marketLiquidity:null}}};

export const v313FixtureSignals=[
  signal('9101','行動股票',envelope(`decision-v3.13:${'a'.repeat(64)}`,'research_starter','conditional_research')),
  signal('9102','等待股票',envelope(`decision-v3.13:${'b'.repeat(64)}`,'wait_reclaim','formal')),
  signal('9103','待研究股票',envelope(`decision-v3.13:${'c'.repeat(64)}`,'unavailable','none')),
  nearBuy,
];

const v317FixtureBase=signal('2303','V3.17 支撐區研究股票',envelope(`decision-v3.13:${'3'.repeat(64)}`,'unavailable','none'));
export const v317ResearchOnlyFixture={...v317FixtureBase,projectionReadOnly:true,lastKnownAction:'unavailable' as const,
  currentPrice:45.2,
  technicalState:'at_support',researchNextStep:{version:'research-next-step-v3.17.0' as const,kind:'wait_refresh' as const,
    actionAuthority:'disabled' as const,reason:'action_authority_disabled',trigger:null,invalidation:43.5,unlockPrice:null,
    blockers:['missing:fundamental','missing:valuation','action_authority_disabled']},
  researchSnapshot:{version:'research-snapshot-v3.17.0' as const,snapshotId:`research-v3.17:${'3'.repeat(64)}`,
    symbol:'2303',currentPrice:45.2,valuation:{currentPe:null,historyPeMedian:null,sectorPe:null,asOf:null,provisionalRelativeValue:null},
    technical:{state:'at_support',bias20Pct:0.4,bias60Pct:-4.6,bias120Pct:-8.2,rsi14:48,macd:-0.12,atr:1.1,
      volumeRatio20:0.92,relativeStrength20Pct:2.1,trigger:null,invalidation:43.5},
    fundamental:{revenueYoy:null,qualityScore:null,thesis:['來源訊號：公開且已連結的研究事件。','技術狀態：at_support'],
      risks:['尚缺資料：fundamental、valuation','下一步條件：action_authority_disabled']},
    gateWaterfall:[{gate:'source',status:'pass',reason:'authorized_linked_source'},
      {gate:'fundamental',status:'missing',reason:'official_fundamental_data_required'},
      {gate:'valuation',status:'missing',reason:'official_valuation_history_and_peer_data_required'},
      {gate:'technical',status:'pass',reason:'technical_at_support'},
      {gate:'liquidity',status:'missing',reason:'official_turnover_data_required'}],
    provenance:v317FixtureBase.sourceProvenance!,sourceCutoff:'2026-08-20T10:20:00Z',researchNextStep:{version:'research-next-step-v3.17.0' as const,kind:'wait_refresh' as const,
      actionAuthority:'disabled' as const,reason:'action_authority_disabled',trigger:null,invalidation:43.5,unlockPrice:null,
      blockers:['missing:fundamental','missing:valuation','action_authority_disabled']}},
};

export const v317ResearchDataNeededFixture={...signal('2472','V3.17 資料待補股票',envelope(`decision-v3.13:${'4'.repeat(64)}`,'unavailable','none')),
  projectionReadOnly:true,lastKnownAction:'unavailable' as const,currentPrice:81.5,technicalState:'unavailable',
  researchNextStep:{version:'research-next-step-v3.17.0' as const,kind:'data_needed' as const,actionAuthority:'disabled' as const,
    reason:'data_required_for_formal_decision',trigger:null,invalidation:null,unlockPrice:null,blockers:['missing:fundamental','missing:technical']},
  researchSnapshot:{version:'research-snapshot-v3.17.0' as const,snapshotId:`research-v3.17:${'4'.repeat(64)}`,
    symbol:'2472',currentPrice:81.5,valuation:{currentPe:null,historyPeMedian:null,sectorPe:null,asOf:null,provisionalRelativeValue:null},
    technical:{state:null,bias20Pct:null,bias60Pct:null,bias120Pct:null,rsi14:null,macd:null,atr:null,volumeRatio20:null,relativeStrength20Pct:null,trigger:null,invalidation:null},
    fundamental:{revenueYoy:null,qualityScore:null,thesis:['來源訊號：公開且已連結的研究事件。'],risks:['尚缺資料：fundamental、technical']},
    gateWaterfall:[{gate:'source',status:'pass',reason:'authorized_linked_source'},
      {gate:'fundamental',status:'missing',reason:'official_fundamental_data_required'},
      {gate:'valuation',status:'missing',reason:'official_valuation_history_and_peer_data_required'},
      {gate:'technical',status:'missing',reason:'adjusted_ohlcv_history_required'},
      {gate:'liquidity',status:'missing',reason:'official_turnover_data_required'}],
    provenance:v317FixtureBase.sourceProvenance!,sourceCutoff:'2026-08-20T10:20:00Z',researchNextStep:{version:'research-next-step-v3.17.0' as const,
      kind:'data_needed' as const,actionAuthority:'disabled' as const,reason:'data_required_for_formal_decision',trigger:null,
      invalidation:null,unlockPrice:null,blockers:['missing:fundamental','missing:technical']}},
};

const malformed=signal('9104','錯誤來源股票',envelope(`decision-v3.13:${'d'.repeat(64)}`,
  'research_starter','conditional_research'));
malformed.citations=[{...malformed.citations![0],sourceUrl:'https://',evaluatedAt:'2026-99-99T00:00:00Z'}];
malformed.sourceProvenance={...malformed.sourceProvenance,sourceUrl:'https://',evaluatedAt:'2026-99-99T00:00:00Z'};
const malformedBrief=malformed.decisionBrief;
if(!malformedBrief||'availability' in malformedBrief)throw new Error('available fixture brief required');
malformed.decisionBrief={...malformedBrief,evidence:[...malformedBrief.evidence,
  {point:'thesis:0',refs:['official-fixture']}]} as SourceSignalCard['decisionBrief'];

const stale=signal('9105','過期決策股票',envelope(`decision-v3.13:${'e'.repeat(64)}`,
  'research_starter','conditional_research'));
stale.projectionReadOnly=true;
stale.lastKnownAction='research_starter';

export const v314StaleDecisionFixture={...signal('9106','V3.14 過期決策股票',
  envelope(`decision-v3.13:${'f'.repeat(64)}`,'research_starter','conditional_research')),
  decisionRevisionId:`decision-v3.14:${'f'.repeat(64)}`,
  detailHref:`/stock/9106?decisionRevisionId=${encodeURIComponent(`decision-v3.14:${'f'.repeat(64)}`)}`,
  projectionReadOnly:true,lastKnownAction:'research_starter',
  decisionEnvelope:{...envelope(`decision-v3.13:${'f'.repeat(64)}`,'research_starter','conditional_research'),
    version:'decision-envelope-v3.14.0',decisionRevisionId:`decision-v3.14:${'f'.repeat(64)}`,
    entryPlan:{technicalState:'breakout_confirmed',trigger:null,entryZone:[101,103],invalidation:95,rewardRisk:null},
    nextUnlock:null,thresholdAuthority:{marketRegime:'risk_on',requiredMarginPct:15,requiredRewardRisk:2,
      actualMarginPct:100*(1-12.75/15),actualRewardRisk:(100/12.75*15-102)/(102-95),
      evidenceRoot:'f'.repeat(64)}}} as unknown as SourceSignalCard;

export const v313DetailFailureFixtures=[malformed,stale,v314StaleDecisionFixture];
