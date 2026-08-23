'use strict';

const { canonicalJson, sha256 } = require('./codec');

const READINESS = Object.freeze(['actionable','near_action','waiting','data_needed']);

function finite(value) { return Number.isFinite(value) ? value : null; }
function shortText(value, maximum = 240) {
  return typeof value === 'string' && value.trim().length > 0
    ? [...value.trim()].slice(0, maximum).join('') : null;
}
function uniqueStrings(values, maximum = 12) {
  return [...new Set((Array.isArray(values) ? values : []).map((value)=>shortText(value,160)).filter(Boolean))].slice(0,maximum);
}
function boundedRows(values, maximum, map) {
  return (Array.isArray(values) ? values : []).map(map).filter(Boolean).slice(0, maximum);
}
function cleanScenario(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const row=value;
  const target=finite(row.targetPrice ?? row.value);
  if(target===null||target<=0)return null;
  return Object.freeze({ case:shortText(row.case,16), targetPrice:target,
    multiple:finite(row.multiple), fundamental:finite(row.fundamental), asOf:shortText(row.asOf,40),
    sourceRef:shortText(row.sourceRef,240),
    inputs:boundedRows(row.inputs,24,(input)=>input&&typeof input==='object'&&!Array.isArray(input)
      ?Object.freeze({key:shortText(input.key,64),value:finite(input.value),unit:shortText(input.unit,40),
        sourceRef:shortText(input.sourceRef,240),asOf:shortText(input.asOf,40)}):null),
    sensitivity:boundedRows(row.sensitivity,8,(input)=>input&&typeof input==='object'&&!Array.isArray(input)
      ?Object.freeze({key:shortText(input.key,64),delta:finite(input.delta),result:finite(input.result)}):null),
  });
}

function valuationDossier(valuation, envelope) {
  const range=envelope?.valuationSummary?.formalRange ?? valuation?.valuationRange ?? null;
  const reported=valuation?.reportedPe ?? null;
  const scenarios=valuation?.scenarios ?? {};
  const sourceRefs=uniqueStrings([
    ...(valuation?.evidence?.sourceRefs ?? []), ...(envelope?.valuationSummary?.sourceRefs ?? []),
  ],8);
  return Object.freeze({
    status:shortText(valuation?.status,48) ?? 'valuation_review',
    blocker:shortText(valuation?.reason,160),
    method:shortText(valuation?.method?.method,48),
    asOf:shortText(valuation?.asOf,40),
    eps:finite(valuation?.eps),
    bridge:valuation?.bridge&&typeof valuation.bridge==='object'?Object.freeze({
      availability:shortText(valuation.bridge.availability,48), reason:shortText(valuation.bridge.reason,160),
      eps:finite(valuation.bridge.eps), dilutedShares:finite(valuation.bridge.dilutedShares),
      netDebt:finite(valuation.bridge.netDebt),
    }):null,
    formalRange:range&&Number.isFinite(range.bear)&&Number.isFinite(range.base)&&Number.isFinite(range.bull)
      ?Object.freeze({bear:range.bear,base:range.base,bull:range.bull}):null,
    relative:reported&&typeof reported==='object'?Object.freeze({
      current:finite(reported.current?.value ?? reported.currentValue),
      ownHistoryMedian:finite(reported.ownHistory?.median ?? reported.ownReference?.median),
      sector:finite(reported.sectorReference?.median ?? reported.sector?.median),
      ownSessionCount:finite(reported.ownHistory?.sampleCount ?? reported.ownReference?.sampleCount),
      peerCount:finite(reported.sectorReference?.count),
    }):null,
    scenarios:Object.freeze(['bear','base','bull'].map((key)=>cleanScenario({case:key,...(scenarios?.[key]??{})})).filter(Boolean)),
    sourceRefs:Object.freeze(sourceRefs),
  });
}

function technicalDossier(decision,researchScore) {
  const technical=decision?.technical ?? {};
  const context=researchScore?.priceContext ?? {};
  const plane=technical?.plane ?? {};
  return Object.freeze({
    availability:shortText(technical.availability,48), reason:shortText(technical.reason,160),
    state:shortText(technical.technicalState ?? context.technicalState,48),
    trigger:finite(technical.trigger?.threshold ?? technical.trigger),
    entryZone:boundedRows(technical.entryZone ?? decision?.decisionEnvelope?.entryPlan?.entryZone,2,(value)=>finite(value)),
    invalidation:finite(technical.invalidation ?? decision?.decisionEnvelope?.entryPlan?.invalidation),
    support:finite(plane.support), resistance:finite(plane.resistance),
    ma20:finite(context.ma20),ma60:finite(context.ma60),ma120:finite(context.ma120),
    bias20Pct:finite(context.bias20Pct),bias60Pct:finite(context.bias60Pct),bias120Pct:finite(context.bias120Pct),
    rsi14:finite(context.rsi14),macd:finite(context.macd),atr:finite(context.atr),
    volumeRatio20:finite(context.volumeRatio20),relativeStrength20Pct:finite(context.relativeStrength20Pct),
  });
}

function readiness({ envelope, ranking, technical }) {
  const action=envelope?.userAction;
  if(['buy','accumulate','research_starter'].includes(action))return 'actionable';
  const score=finite(ranking?.rankingScore); const coverage=finite(ranking?.coverage);
  const axes=ranking?.missingAxes ?? []; const blockers=envelope?.blockers ?? ranking?.softBlockers ?? [];
  const soft=uniqueStrings(blockers).length;
  if(score!==null&&score>=70&&coverage!==null&&coverage>=.75&&axes.length===0&&soft<=1
    &&technical?.state&&!['invalidated','below_support'].includes(technical.state))return 'near_action';
  // A technical setup is not a waiting-to-buy setup when the research still
  // lacks the facts needed to make any decision.  Keep it in the data-needed
  // lane so the UI explains the missing authority instead of implying that a
  // breakout alone will make it tradeable.
  if(axes.length>0||['missing','stale','conflict'].includes(String(envelope?.valuationReadiness))
    ||score===null||coverage===null)return 'data_needed';
  if(['wait_value','wait_market','wait_breakout','wait_reclaim','avoid_chase'].includes(action)
    ||['at_support','breakout_pending','reclaim_required'].includes(technical?.state))return 'waiting';
  return 'data_needed';
}

// The dossier is a deterministic display projection of data that already
// belongs to one immutable analysis revision. It never calculates a target,
// fabricates a thesis, or changes a DecisionEnvelope action.
function buildResearchDossierV318({ candidate = {}, decision = {}, sourceCutoff = null, researchReadiness = null } = {}) {
  const envelope=decision.decisionEnvelope ?? candidate.decisionEnvelope ?? null;
  const ranking=decision.researchRanking ?? candidate.researchRanking ?? null;
  const researchScore=decision.researchScore ?? candidate.researchScore ?? null;
  const valuation=valuationDossier(decision.valuation ?? candidate.valuation ?? null,envelope);
  const technical=technicalDossier(decision,researchScore);
  const fundamental=decision.fundamental ?? {};
  const citations=boundedRows(decision.citations ?? candidate.citations,16,(citation)=>citation&&typeof citation==='object'&&!Array.isArray(citation)
    ?Object.freeze({ref:shortText(citation.ref,240),sourceKey:shortText(citation.sourceKey,48),sourceName:shortText(citation.sourceName,120),
      sourceUrl:shortText(citation.sourceUrl,2048),publishedAt:shortText(citation.publishedAt,40),
      collectedAt:shortText(citation.collectedAt,40),evaluatedAt:shortText(citation.evaluatedAt,40)}):null);
  const thesis=uniqueStrings(decision.decisionBrief?.thesis ?? [fundamental.thesis],3);
  const risks=uniqueStrings(decision.decisionBrief?.risks ?? fundamental.risks,3);
  const blockers=uniqueStrings([...(envelope?.blockers ?? []),...(ranking?.softBlockers ?? []),...(ranking?.missingAxes ?? [])]);
  const material={
    symbol:shortText(candidate.symbol ?? decision.symbol,8),
    decisionRevisionId:shortText(envelope?.decisionRevisionId,96),sourceCutoff:shortText(sourceCutoff ?? decision.sourceCutoff,40),
    valuation,technical,
    fundamental:Object.freeze({thesis:Object.freeze(thesis),risks:Object.freeze(risks),
      qualityScore:finite(researchScore?.axes?.fundamental?.score),revenueYoy:finite(researchScore?.axes?.fundamental?.yoyGrowth),
      latestChange:shortText(fundamental.latestChange,240),asOf:shortText(fundamental.asOf,40)}),
    ranking:Object.freeze({score:finite(ranking?.rankingScore),coverage:finite(ranking?.coverage),
      readiness:shortText(researchReadiness?.status,32),missingAxes:Object.freeze(uniqueStrings(ranking?.missingAxes,8))}),
    researchReadiness:researchReadiness&&typeof researchReadiness==='object'
      ?Object.freeze({version:shortText(researchReadiness.version,40),status:shortText(researchReadiness.status,32),
        reason:shortText(researchReadiness.reason,160),blockers:Object.freeze(uniqueStrings(researchReadiness.blockers,12))}):null,
    citations:Object.freeze(citations),blockers:Object.freeze(blockers),
  };
  const readinessValue=researchReadiness?.status??readiness({envelope,ranking,technical});
  const finalized={...material,ranking:Object.freeze({...material.ranking,readiness:readinessValue})};
  return Object.freeze({version:'research-dossier-v3.18.0',
    dossierId:`research-v3.18:${sha256(canonicalJson(finalized))}`,...finalized});
}

module.exports={ READINESS, buildResearchDossierV318 };
