'use strict';

const { percentile } = require('./codec');
const { buildMethodSpecificValuationBridge } = require('./valuation-method-bridge');
const { selectComparableValuationInputs } = require('./valuation-comparables');
const { selectSectorValuationMethod } = require('./valuation-method');
const { verifyCompanyValuationEvidence } = require('./valuation-evidence');
const { selectOfficialReportedPe, unavailableReportedPe } = require('./reported-pe-authority');

function review(reason, context) {
  return Object.freeze({ status: 'valuation_review', targetPrice: null, valuationRange: null, reason, ...context });
}

function median(values) { return percentile([...values].sort((left, right) => left - right), 0.5); }

const CASES = Object.freeze(['bear','base','bull']);
const CASE_QUANTILE = Object.freeze({ bear:0.1,base:0.5,bull:0.9 });

function clamp(value, minimum, maximum) { return Math.max(minimum,Math.min(maximum,value)); }
function mad(values) {
  const center=median(values);return median(values.map((value)=>Math.abs(value-center)));
}

function revenueDistribution(facts) {
  const history=(facts.monthlyRevenueHistory??[]).filter(Number.isFinite);
  if(history.length<15||!(facts.revenue>0))return null;
  const growth=history.slice(-3).map((value,index)=>100*(value/history[history.length-15+index]-1));
  if(growth.some((value)=>!Number.isFinite(value)))return null;
  const base=clamp(median(growth),-30,50);const spread=clamp(1.4826*mad(growth),5,20);
  return Object.freeze({bear:facts.revenue*(1+clamp(base-spread,-50,70)/100),
    base:facts.revenue*(1+clamp(base,-50,70)/100),bull:facts.revenue*(1+clamp(base+spread,-50,70)/100)});
}

function marginDistribution(facts, numeratorKey) {
  const revenue=(numeratorKey==='quarterlyNetIncomeHistory'
    ?facts.quarterlyNetIncomeRevenueHistory: numeratorKey==='quarterlyEbitdaHistory'
      ?facts.quarterlyEbitdaRevenueHistory:facts.quarterlyRevenueHistory??[]).filter(Number.isFinite);
  const numerator=(facts[numeratorKey]??[]).filter(Number.isFinite);
  if(revenue.length<8||numerator.length!==revenue.length||revenue.some((value)=>value<=0))return null;
  const margins=revenue.map((value,index)=>100*numerator[index]/value);
  const ttmRevenue=revenue.slice(-4).reduce((sum,value)=>sum+value,0);
  const ttmNumerator=numerator.slice(-4).reduce((sum,value)=>sum+value,0);
  const latest=margins.at(-1);const priorYear=margins.at(-5);
  const base=100*ttmNumerator/ttmRevenue+clamp((latest-priorYear)/2,-3,3);
  const spread=Math.max(1,mad(margins.slice(-4)));
  return Object.freeze({bear:base-spread,base,bull:base+spread});
}

function fundamentalDistribution(method,facts,cycleHistory) {
  if(method==='normalized_pe') {
    const ordered=(cycleHistory??[]).filter(Number.isFinite).sort((a,b)=>a-b);
    return ordered.length===12?Object.freeze({bear:percentile(ordered,.25),base:percentile(ordered,.5),
      bull:percentile(ordered,.75)}):null;
  }
  if(method==='pb_roe') {
    const history=(facts.bookValueHistory??[]).filter(Number.isFinite);
    if(history.length!==9)return null;
    const changes=history.slice(1).map((value,index)=>value-history[index]);
    return Object.freeze(Object.fromEntries(CASES.map((key)=>[key,
      Math.max(0,history.at(-1)+4*percentile([...changes].sort((a,b)=>a-b),CASE_QUANTILE[key]))])));
  }
  const revenue=revenueDistribution(facts);
  if(method==='ev_sales')return revenue;
  if(method==='pe'||method==='ev_ebitda') {
    const margins=marginDistribution(facts,method==='pe'?'quarterlyNetIncomeHistory':'quarterlyEbitdaHistory');
    if(!revenue||!margins)return null;
    if(method==='pe'&&!(facts.dilutedShares>0))return null;
    return Object.freeze(Object.fromEntries(CASES.map((key)=>[key,
      method==='pe'?revenue[key]*margins[key]/100/facts.dilutedShares:revenue[key]*margins[key]/100])));
  }
  return null;
}

function scenarioTarget(method, multiple, bridge, facts, cycleHistory, scenarioName,distribution=null) {
  if (method === 'pe') return Number.isFinite(distribution?.[scenarioName]) ? distribution[scenarioName] * multiple : null;
  if (method === 'normalized_pe') {
    return Number.isFinite(distribution?.[scenarioName]) && distribution[scenarioName] > 0
      ? distribution[scenarioName] * multiple : null;
  }
  if (method === 'ev_ebitda' || method === 'ev_sales') {
    const operating = distribution?.[scenarioName];
    const netDebt = Number.isFinite(facts.netDebt) ? facts.netDebt
      : Number.isFinite(facts.totalDebt) && Number.isFinite(facts.cash) ? facts.totalDebt - facts.cash : null;
    return Number.isFinite(operating) && operating > 0 && Number.isFinite(netDebt) && bridge.dilutedShares > 0
      ? (operating * multiple - netDebt) / bridge.dilutedShares : null;
  }
  if (method === 'pb_roe') return Number.isFinite(distribution?.[scenarioName]) && distribution[scenarioName] > 0
    ? distribution[scenarioName] * multiple : null;
  if (method === 'residual_income') {
    const ordered=(facts.roeHistory??[]).slice(-8).filter(Number.isFinite).sort((a,b)=>a-b);
    const quantile={bear:.25,base:.5,bull:.75}[scenarioName];
    const parameters={bear:[.12,0],base:[.10,.03],bull:[.08,.05]}[scenarioName];
    const roe=ordered.length===8?percentile(ordered,quantile)/100:null;
    if(!Number.isFinite(roe)||!parameters||!(facts.bookValue>0))return null;
    const [costOfEquity,growth]=parameters;
    return facts.bookValue+Math.max(-facts.bookValue,((roe-costOfEquity)*facts.bookValue)/(costOfEquity-growth));
  }
  if (method === 'nav') return Number.isFinite(facts.nav) && facts.nav > 0 && bridge.dilutedShares > 0
    ? facts.nav / bridge.dilutedShares * multiple : null;
  return null;
}

function requiredCurrentAnchors(method) {
  if(method==='pe')return ['quarterly_revenue','quarterly_gross_profit','quarterly_operating_expense',
    'quarterly_operating_income','quarterly_non_operating_income','quarterly_pretax_income',
    'quarterly_income_tax_expense','quarterly_noncontrolling_interest','quarterly_net_income',
    'quarterly_net_income_attributable_to_common','quarterly_diluted_eps','diluted_weighted_average_shares'];
  if(method==='normalized_pe')return ['quarterly_net_income_attributable_to_common','quarterly_diluted_eps',
    'diluted_weighted_average_shares'];
  if(method==='ev_ebitda')return ['quarterly_revenue','quarterly_ebitda','cash_and_equivalents','total_debt',
    'diluted_weighted_average_shares'];
  if(method==='ev_sales')return ['quarterly_revenue','cash_and_equivalents','total_debt','diluted_weighted_average_shares'];
  if(method==='pb_roe'||method==='residual_income')return ['book_value_per_share','roe'];
  if(method==='nav')return ['net_asset_value','diluted_weighted_average_shares'];
  return [];
}

function staleFinancialReason(method,facts,cutoff) {
  const cutoffMs=Date.parse(cutoff);if(!Number.isFinite(cutoffMs))return 'stale_financial_inputs';
  const timestamps=facts.currentAnchorSourceTimestamps??{};
  const stale=requiredCurrentAnchors(method).some((key)=>!Number.isFinite(Date.parse(timestamps[key]))
    ||cutoffMs-Date.parse(timestamps[key])>135*86400000);
  if(stale)return 'stale_financial_inputs';
  if(['pe','ev_ebitda','ev_sales'].includes(method)) {
    const monthly=timestamps.monthly_revenue;
    if(!Number.isFinite(Date.parse(monthly))||cutoffMs-Date.parse(monthly)>45*86400000)return 'stale_financial_inputs';
  }
  return null;
}

function authorityFreshnessReason(authority,cutoff,expectedMethod) {
  if(authority?.availability!=='available'||authority.ownSessionCount<252||authority.peerCount<8)return 'insufficient_multiple_reference';
  if(authority.method!==expectedMethod)return 'multiple_reference_method_mismatch';
  const cutoffMs=Date.parse(cutoff);const asOfMs=Date.parse(authority.asOf);
  if(!Number.isFinite(cutoffMs)||!Number.isFinite(asOfMs)||asOfMs>cutoffMs||cutoffMs-asOfMs>10*86400000
    ||typeof authority.primarySourceRef!=='string'||authority.primarySourceRef.length===0)return 'stale_financial_inputs';
  if(authority.crossOwnSessionCount>0&&(authority.crossOwnSessionCount<252||authority.crossPeerCount<8
    ||typeof authority.crossSourceRef!=='string'||authority.crossSourceRef.length===0))return 'cross_check_unavailable';
  return null;
}

function firstFactSource(facts,keys,fallback) {
  const row=(facts.sourceRows??[]).filter((candidate)=>keys.includes(candidate?.[1])&&typeof candidate?.[12]==='string')
    .sort((left,right)=>String(right[3]).localeCompare(String(left[3]))||String(left[12]).localeCompare(String(right[12])))[0];
  return row?.[12]??fallback;
}

function scenarioInputs(method,caseName,multiple,distribution,bridge,facts,asOf,sourceRef) {
  const fundamental=Number.isFinite(distribution?.[caseName])?distribution[caseName]
    :method==='nav'?facts.nav:method==='residual_income'?facts.bookValue:null;
  const inputs=[];
  const add=(key,value,unit,keys=[])=>{if(Number.isFinite(value))inputs.push(Object.freeze({key,value,unit,
    sourceRef:firstFactSource(facts,keys,sourceRef),asOf}));};
  add('fundamental',fundamental,method==='residual_income'?'TWD_per_share':method==='nav'?'TWD':'TWD',
    method==='nav'?['net_asset_value']:method==='residual_income'?['book_value_per_share']:
      method==='normalized_pe'?['quarterly_net_income_attributable_to_common']:
        method==='pe'?['quarterly_revenue','quarterly_net_income_attributable_to_common']:
          method==='ev_ebitda'?['quarterly_revenue','quarterly_ebitda']:['quarterly_revenue']);
  add('multiple_or_discount',multiple,'multiple');
  add('diluted_weighted_average_shares',bridge.dilutedShares,'share',['diluted_weighted_average_shares']);
  add('net_debt',bridge.netDebt??facts.netDebt,'TWD',['cash_and_equivalents','total_debt']);
  add('book_value_per_share',facts.bookValue,'TWD_per_share',['book_value_per_share']);
  add('roe',facts.roe,'percentage_points',['roe']);
  return inputs.slice(0,24);
}

function scenarioSensitivity(method,caseName,multiple,distribution,bridge,facts,cycleHistory,target) {
  const result=(fundamentalFactor,multipleFactor)=>{
    if(method==='residual_income')return scenarioTarget(method,multiple,bridge,{...facts,bookValue:facts.bookValue*fundamentalFactor},
      cycleHistory,caseName,distribution);
    const changed=distribution&&Number.isFinite(distribution[caseName])
      ?{...distribution,[caseName]:distribution[caseName]*fundamentalFactor}:distribution;
    return scenarioTarget(method,multiple*multipleFactor,bridge,facts,cycleHistory,caseName,changed);
  };
  return Object.freeze([
    Object.freeze({key:'fundamental',delta:-10,result:result(.9,1)}),
    Object.freeze({key:'fundamental',delta:10,result:result(1.1,1)}),
    Object.freeze({key:'multiple_or_discount',delta:-10,result:method==='residual_income'?target*.9:result(1,.9)}),
    Object.freeze({key:'multiple_or_discount',delta:10,result:method==='residual_income'?target*1.1:result(1,1.1)}),
  ]);
}

function completeScenario({method,caseName,multiple,bridge,facts,cycleHistory,distribution,asOf,sourceRef}) {
  const targetPrice=scenarioTarget(method,multiple,bridge,facts,cycleHistory,caseName,distribution);
  return Object.freeze({case:caseName,value:targetPrice,multiple,targetPrice,
    fundamental:Number.isFinite(distribution?.[caseName])?distribution[caseName]:null,asOf,sourceRef,
    inputs:scenarioInputs(method,caseName,multiple,distribution,bridge,facts,asOf,sourceRef),
    sensitivity:scenarioSensitivity(method,caseName,multiple,distribution,bridge,facts,cycleHistory,targetPrice)});
}

function evaluateCandidateValuation(input) {
  if (input.authorityConflict === 'authority_conflict') {
    return review('authority_conflict', { eps:null,bridge:null,method:null,
      reportedPe:unavailableReportedPe('authority_conflict'),
      relativeMultiple:{ exchangeReportedPe:unavailableReportedPe('authority_conflict').current,
        ownHistory:unavailableReportedPe('authority_conflict').ownHistory,
        sector:unavailableReportedPe('authority_conflict').sector,
        modelComparablePe:{ value:null,method:null,asOf:null,sourceRefs:[],reason:'valuation_review' } } });
  }
  const method = selectSectorValuationMethod({ ...input.facts, sector: input.sector, cycleHistory: input.cycleHistory, crossCheck: input.crossCheck });
  if (method.availability !== 'available') return review(method.reason, { eps: null, bridge: null, method });
  if (input.requireCompleteOfficialBridge === true && ['pe','normalized_pe','ev_ebitda','ev_sales'].includes(method.method)
    && input.facts?.periodReadiness !== 'ttm_from_four_official_quarters') {
    return review(input.facts?.periodReadiness || 'missing_complete_official_bridge', { eps:null,bridge:null,method });
  }
  const bridge = buildMethodSpecificValuationBridge(method.method, input.facts);
  if (bridge.availability !== 'available') return review(bridge.reason, { eps: null, bridge, method });
  if(input.requireCompleteOfficialBridge===true) {
    const staleReason=staleFinancialReason(method.method,input.facts,input.cutoff);
    if(staleReason)return review(staleReason,{eps:null,bridge,method,valuationReadiness:'stale'});
    const authorityReason=authorityFreshnessReason(input.methodAuthority,input.cutoff,method.method);
    if(authorityReason)return review(authorityReason,{eps:null,bridge,method,methodAuthority:input.methodAuthority??null});
  }
  const verifiedEvidence = verifyCompanyValuationEvidence(input);
  const evidence = verifiedEvidence.availability === 'available' ? Object.freeze({ ...verifiedEvidence,
    sourceRefs:[...new Set(verifiedEvidence.evidence.map((row)=>row.sourceRef).filter(Boolean))].slice(0,8) }) : verifiedEvidence;
  const formulaOnly=['nav','residual_income'].includes(method.method);
  const comparable = formulaOnly ? Object.freeze({availability:'available',rows:[],peerStockIds:[],sector:input.sector})
    : selectComparableValuationInputs({ ...input, subjectStockId: input.subjectStockId ?? input.stockId, cutoff: input.cutoff });
  const reportedPe = selectOfficialReportedPe(input);
  const context = { eps: bridge.eps, bridge, evidence, comparable, method, reportedPe };
  if (evidence.availability !== 'available' || comparable.availability !== 'available' || method.availability !== 'available') {
    return review(evidence.reason || comparable.reason || method.reason, context);
  }
  const peMethod = ['pe', 'normalized_pe'].includes(method.method);
  if (peMethod && bridge.eps <= 0) return review('non_positive_eps_disallows_pe', context);
  const methodRows = comparable.rows.filter((row) => row.method === method.method || (peMethod && ['pe', 'normalized_pe'].includes(row.method)));
  if (!formulaOnly && methodRows.length < 8) return review('insufficient_method_comparables', context);
  const orderedMultiples = methodRows.map((row) => row.value).sort((a, b) => a - b);
  const baseMultiple = formulaOnly ? null : percentile(orderedMultiples, 0.5);
  const formulaScenarios=method.method==='nav'
    ? Object.freeze({bear:{multiple:.65,asOf:input.asOf,sourceRef:'official:nav-discount-policy-v3.4'},
      base:{multiple:.8,asOf:input.asOf,sourceRef:'official:nav-discount-policy-v3.4'},
      bull:{multiple:.95,asOf:input.asOf,sourceRef:'official:nav-discount-policy-v3.4'}})
    : method.method==='residual_income'
      ? Object.freeze(Object.fromEntries(['bear','base','bull'].map((key)=>[key,
        {multiple:1,asOf:input.asOf,sourceRef:'official:residual-income-policy-v3.4'}]))) : null;
  const scenarioInput = formulaScenarios ?? input.scenarios;
  const cutoffMs=Date.parse(input.cutoff);
  if (!scenarioInput || !['bear', 'base', 'bull'].every((key) => Number.isFinite(scenarioInput[key]?.multiple)
    && typeof scenarioInput[key]?.asOf === 'string' && Number.isFinite(Date.parse(scenarioInput[key].asOf))
    && Date.parse(scenarioInput[key].asOf)<=cutoffMs && scenarioInput[key]?.sourceRef)) return review('scenario_provenance_incomplete', context);
  const distribution=fundamentalDistribution(method.method,input.facts,input.cycleHistory??[]);
  if(!formulaOnly&&!distribution)return review('insufficient_series',context);
  const scenarioTargets = Object.fromEntries(CASES.map((key) => [key,completeScenario({method:method.method,
    caseName:key,multiple:scenarioInput[key].multiple,bridge,facts:input.facts,cycleHistory:input.cycleHistory??[],
    distribution,asOf:scenarioInput[key].asOf,sourceRef:scenarioInput[key].sourceRef})]));
  if (Object.values(scenarioTargets).some((scenario) => !Number.isFinite(scenario.targetPrice) || scenario.targetPrice <= 0)
    || !(scenarioTargets.bear.targetPrice <= scenarioTargets.base.targetPrice && scenarioTargets.base.targetPrice <= scenarioTargets.bull.targetPrice)) {
    return review('scenario_order_or_method_invalid', context);
  }
  if (peMethod && (reportedPe.availability !== 'available' || reportedPe.sectorReference?.availability !== 'available')) return review(reportedPe.reason || reportedPe.sectorReference?.reason, context);
  const mandatoryCrossMethod=method.method==='normalized_pe'?'ev_ebitda':method.method==='residual_income'?'pb_roe':null;
  let crossChecks=[];
  let actualCrossCheckScore=input.valuationScores?.crossCheckScore;
  if(mandatoryCrossMethod) {
    const crossStale=staleFinancialReason(mandatoryCrossMethod,input.facts,input.cutoff);
    if(input.requireCompleteOfficialBridge===true&&crossStale)return review(crossStale,{...context,methodAuthority:input.methodAuthority});
    const cross=input.crossCheck;
    if(cross?.method!==mandatoryCrossMethod||!cross.scenarios||!CASES.every((key)=>Number.isFinite(cross.scenarios[key]?.multiple)
      &&typeof cross.scenarios[key]?.sourceRef==='string'&&cross.scenarios[key].sourceRef.length>0
      &&typeof cross.scenarios[key]?.asOf==='string'&&Number.isFinite(Date.parse(cross.scenarios[key].asOf))
      &&Date.parse(cross.scenarios[key].asOf)<=cutoffMs))return review('cross_check_unavailable',context);
    const crossBridge=buildMethodSpecificValuationBridge(mandatoryCrossMethod,input.facts);
    const crossDistribution=fundamentalDistribution(mandatoryCrossMethod,input.facts,input.cycleHistory??[]);
    if(crossBridge.availability!=='available'||!crossDistribution)return review('cross_check_unavailable',context);
    const crossTargets=Object.fromEntries(CASES.map((key)=>[key,completeScenario({method:mandatoryCrossMethod,
      caseName:key,multiple:cross.scenarios[key].multiple,bridge:crossBridge,facts:input.facts,
      cycleHistory:input.cycleHistory??[],distribution:crossDistribution,asOf:cross.scenarios[key].asOf,
      sourceRef:cross.scenarios[key].sourceRef})]));
    if(Object.values(crossTargets).some((row)=>!Number.isFinite(row.targetPrice)||row.targetPrice<=0)
      ||!(crossTargets.bear.targetPrice<=crossTargets.base.targetPrice
        &&crossTargets.base.targetPrice<=crossTargets.bull.targetPrice))
      return review('cross_check_unavailable',context);
    const divergence=Math.abs(scenarioTargets.base.targetPrice-crossTargets.base.targetPrice)
      /Math.max(Math.abs(scenarioTargets.base.targetPrice),.01);
    const crossSummary=Object.freeze({method:mandatoryCrossMethod,scenarios:crossTargets,divergence,
      bear:crossTargets.bear.targetPrice,base:crossTargets.base.targetPrice,bull:crossTargets.bull.targetPrice,
      asOf:crossTargets.base.asOf,evidenceRefs:[...new Set(CASES.map((key)=>crossTargets[key].sourceRef))]});
    if(divergence>.35)return review('method_divergence',{...context,scenarioTargets,
      valuationRange:{bear:scenarioTargets.bear.targetPrice,base:scenarioTargets.base.targetPrice,
        bull:scenarioTargets.bull.targetPrice},crossChecks:[crossSummary],methodAuthority:input.methodAuthority});
    actualCrossCheckScore=100*(1-divergence/.35);
    crossChecks=[crossSummary];
  }
  const valuationScores = {
    ownHistoryScore: peMethod ? 100 * (1 - reportedPe.ownReference.percentile) : null,
    sectorRelativeScore: peMethod ? Math.max(0, Math.min(100, 50 + 50 * (reportedPe.sectorReference.capWeighted - reportedPe.currentValue) / reportedPe.sectorReference.capWeighted)) : null,
    scenarioBridgeScore: input.valuationScores?.scenarioBridgeScore,
    capitalStructureScore: input.valuationScores?.capitalStructureScore,
    crossCheckScore: actualCrossCheckScore,
  };
  const requiredScores = peMethod ? Object.values(valuationScores) : formulaOnly
    ? [valuationScores.scenarioBridgeScore,valuationScores.capitalStructureScore,
      ...(mandatoryCrossMethod?[valuationScores.crossCheckScore]:[])]
    : [valuationScores.scenarioBridgeScore, valuationScores.capitalStructureScore, valuationScores.crossCheckScore];
  if (!requiredScores.every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) return review('valuation_axis_incomplete', context);
  const valuationAxisScore = peMethod
    ? 0.2 * valuationScores.ownHistoryScore + 0.15 * valuationScores.sectorRelativeScore + 0.3 * valuationScores.scenarioBridgeScore
      + 0.2 * valuationScores.capitalStructureScore + 0.15 * valuationScores.crossCheckScore
    : formulaOnly ? mandatoryCrossMethod
      ? 0.4*valuationScores.scenarioBridgeScore+0.35*valuationScores.capitalStructureScore+0.25*valuationScores.crossCheckScore
      : 0.55 * valuationScores.scenarioBridgeScore + 0.45 * valuationScores.capitalStructureScore
      : 0.4 * valuationScores.scenarioBridgeScore + 0.35 * valuationScores.capitalStructureScore + 0.25 * valuationScores.crossCheckScore;
  return Object.freeze({ status: 'normal', targetPrice: scenarioTargets.base.targetPrice,asOf:input.asOf,
    valuationRange: { bear: scenarioTargets.bear.targetPrice, base: scenarioTargets.base.targetPrice, bull: scenarioTargets.bull.targetPrice },
    scenarios: scenarioTargets,crossChecks, eps: bridge.eps, method, bridge, evidence, comparable, reportedPe, valuationScores, valuationAxisScore,
    modelComparablePe: peMethod ? Object.freeze({ availability: 'available', value: baseMultiple, method: method.method }) : null,
    relativeMultiple: peMethod ? { exchangeReportedPe:reportedPe.current,ownHistory:reportedPe.ownHistory,
      sector:reportedPe.sector,modelComparablePe:{ value:baseMultiple,method:method.method,asOf:input.asOf,
        sourceRefs:evidence.sourceRefs,reason:null } } : null,
  });
}

module.exports = { evaluateCandidateValuation };
