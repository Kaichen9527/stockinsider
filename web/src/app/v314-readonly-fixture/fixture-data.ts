import type { RadarDailyPayload } from '@/lib/types';

function legacyCard(symbol: string) {
  return { symbol, chineseName:`唯讀股票 ${symbol}`, name:`唯讀股票 ${symbol}`, currentPrice:100,
    recommendationId:`readonly-${symbol}`, recommendationBucket:'early_formal', researchMaturity:'valuation_review',
    newPositionAction:'valuation_review', researchDecision:{availability:'unavailable',reason:'valuation_input_missing'},
    projectionReadOnly:true,projectionBlockers:['legacy_schema_without_v314_decision_authority'] };
}

function sourceSignal(symbol: string) {
  return { symbol,chineseName:`來源股票 ${symbol}`,discoveredAt:'2026-08-08T11:00:00Z',sourceClass:'podcast',
    sourceSummary:'舊來源研究快照，等待 producer 完成 V3.14 評估。',underreactionScore:75,evidenceRefs:[],
    valuationStatus:'missing',technicalState:'unavailable',changedBecause:'unchanged',projectionReadOnly:true,
    newPositionAction:'valuation_review',projectionBlockers:['legacy_schema_without_v314_decision_authority'] };
}

const sourceSignals=Array.from({length:30},(_,index)=>sourceSignal(String(9000+index)));
const earlyWatchlist=Array.from({length:12},(_,index)=>legacyCard(String(9030+index)));
const hotTracking=Array.from({length:4},(_,index)=>legacyCard(String(9042+index)));

export const v314ReadonlyRadar={asOf:'2026-08-08T11:09:55Z',opportunities:[],scenarioUpsideCandidates:[],fallbackOpportunities90d:[],
  earlyWatchlist,hotTracking,sourceSignals,hotThemes:[],discoveredStocks:[],reports:[
    {slug:'readonly-9000',title:'唯讀研究報告',summary:'last-good report remains navigable',reportKind:'stock',relatedSymbols:['9000']},
  ],sourceLedCorrectness:{schema:'legacy-radar-v3.12.0',window:'home',asOf:'2026-08-08T11:09:55Z'},
  projectionHealth:{status:'unavailable',integrityStatus:'valid',freshnessStatus:'unavailable',
    researchVisibility:'last_good_readonly',actionAuthority:'disabled',actionsEnabled:false,missedExpectedRuns:3,
    actionBlockers:['legacy_schema_without_v314_decision_authority']},
  riskDisclosure:'fixture'} as unknown as RadarDailyPayload;
