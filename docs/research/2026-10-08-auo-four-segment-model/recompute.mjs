import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { calculateQuarter, requiredEarningsAtMultiple, calculateCommercializationBridge } from '../../../web/src/lib/auo-deep-dive-model.ts';
import { sourceControllerInstant } from '../../../web/src/lib/research-source-attempt-controller.ts';
import { researchCanonicalHash } from '../../../web/src/lib/research-agent-qualification.ts';

const directory=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(directory,'../../..');
const sum=values=>values.reduce((a,b)=>a+b,0);
const keys=['display','mobility','vertical','other'];
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,`bridge mismatch ${a} / ${b}`);
export const scenarioInputs={
  bear:{q3Weights:[.94,.98,1.01,1],growth:[[-.04,-.03,0,-.05],[-.10,-.02,0,-.05],[.01,.01,.01,0],[-.01,.01,.01,0],[.01,.01,.01,0]],
    grossMargins:[.06,.19,.20,.07],opMargins:[-.045,.02,.035,-.075],quarterMarginStep:0,interestIncome:225,financeCosts:-700,otherIncome:450,equityMethodProfit:0,fxAndOtherRecurring:-100,taxRate:.25,taxFloor:150,nci:200,futureDilution:.01},
  base:{q3Weights:[.97,1,1.03,1],growth:[[-.01,.02,.03,0],[-.05,-.02,.01,0],[.03,.03,.03,0],[-.01,.02,.03,0],[.02,.03,.04,0]],
    grossMargins:[.08,.20,.22,.08],opMargins:[-.03,.04,.06,-.065],quarterMarginStep:.002,interestIncome:250,financeCosts:-650,otherIncome:650,equityMethodProfit:100,fxAndOtherRecurring:0,taxRate:.22,taxFloor:300,nci:450,futureDilution:.01},
  bull:{q3Weights:[.98,1.02,1.05,1],growth:[[.02,.04,.05,.01],[-.02,0,.02,0],[.04,.04,.05,.01],[.01,.04,.05,.01],[.03,.04,.05,.01]],
    grossMargins:[.10,.22,.24,.09],opMargins:[-.01,.05,.075,-.055],quarterMarginStep:.003,interestIncome:275,financeCosts:-625,otherIncome:700,equityMethodProfit:250,fxAndOtherRecurring:0,taxRate:.20,taxFloor:300,nci:650,futureDilution:.015},
};
export function forecastQuarter(period,revenueRows,assumption,index,shares) {
  assert.equal(revenueRows.length,4);
  assert.ok(revenueRows.every(x=>Number.isFinite(x)&&x>=0));
  assert.ok(Number.isFinite(shares)&&shares>0);
  const segments=keys.map((key,i)=>{
    const grossMargin=assumption.grossMargins[i]+index*assumption.quarterMarginStep;
    const operatingMargin=assumption.opMargins[i]+index*assumption.quarterMarginStep;
    assert.ok(Number.isFinite(grossMargin)&&grossMargin>=-1&&grossMargin<=1&&operatingMargin<=grossMargin);
    const revenue=revenueRows[i],grossProfit=revenue*grossMargin,operatingProfit=revenue*operatingMargin;
    return {key,revenue,grossMarginAssumed:grossMargin,operatingMarginAssumed:operatingMargin,grossProfit,
      operatingExpenses:grossProfit-operatingProfit,operatingProfit,status:'research_allocation_not_disclosed_segment_gross_margin'};
  });
  assert.ok(assumption.taxRate>=0&&assumption.taxRate<=1&&assumption.taxFloor>=0&&assumption.nci>=0);
  const revenue=sum(revenueRows),grossProfit=sum(segments.map(s=>s.grossProfit));
  const operatingExpenses=sum(segments.map(s=>s.operatingExpenses)),operatingProfit=grossProfit-operatingExpenses;
  const nonOperating=sum(['interestIncome','financeCosts','otherIncome','equityMethodProfit','fxAndOtherRecurring'].map(k=>assumption[k]));
  const pretaxProfit=operatingProfit+nonOperating,taxExpense=Math.max(Math.max(pretaxProfit,0)*assumption.taxRate,assumption.taxFloor);
  const netProfit=pretaxProfit-taxExpense,ownersNetProfit=netProfit-assumption.nci;
  const existing=calculateQuarter({period,year:Number(period.slice(0,4)),segments:Object.fromEntries(segments.map(s=>[s.key,{revenue:s.revenue,operatingMargin:s.operatingMarginAssumed}])),
    corporateAndOtherOperatingIncome:0,recurringNonOperatingIncome:nonOperating,taxRate:assumption.taxRate,
    nonControllingInterest:assumption.nci,oneOffAfterTax:0},shares);
  // The existing helper taxes positive group pretax only. Separate jurisdiction-tax
  // floor sensitivity can still charge tax when consolidated pretax is negative.
  close(existing.operatingIncome,Math.round(operatingProfit),1);
  close(existing.pretaxIncome,Math.round(pretaxProfit),1);
  return {period,status:period==='2026Q3'?'known_monthly_total_unknown_profit_and_mix':'research_forecast',segments,revenue,grossProfit,operatingExpenses,operatingProfit,
    interestIncome:assumption.interestIncome,financeCosts:assumption.financeCosts,otherIncome:assumption.otherIncome,
    equityMethodProfit:assumption.equityMethodProfit,fxAndOtherRecurring:assumption.fxAndOtherRecurring,nonOperating,pretaxProfit,
    taxExpense,nonControllingNetProfit:assumption.nci,netProfit,ownersNetProfit,dilutedSharesMillionAssumed:shares,
    dilutedEpsConditional:ownersNetProfit/shares,oneOffGainsIncluded:0,newCpoGcsRevenueAssumed:null,
    existingHelper:{operatingIncome:existing.operatingIncome,pretaxIncome:existing.pretaxIncome,ownersBeforeTaxFloor:existing.normalizedNetIncome},
    additionalJurisdictionTaxAssumed:taxExpense-Math.max(pretaxProfit,0)*assumption.taxRate};
}
function aggregate(rows,shares){const result={};for(const key of ['revenue','grossProfit','operatingExpenses','operatingProfit','nonOperating','pretaxProfit','taxExpense','netProfit','nonControllingNetProfit','ownersNetProfit'])result[key]=sum(rows.map(r=>r[key]));return {...result,dilutedSharesMillionAssumed:shares,dilutedEpsConditional:result.ownersNetProfit/shares};}
export function buildModel(financial,historical,monthly,market,asOf,context={}){
  assert.equal(financial.amountUnit,'TWD_thousands');assert.equal(historical.amountUnit,'TWD_thousands');
  const cutoff=sourceControllerInstant(asOf);
  for(const clock of [financial.recordedAt,historical.recordedAt,market.asOf,...Object.values(context).map(value=>value.recordedAt)])assert.ok(sourceControllerInstant(clock)<=cutoff,'future evidence');
  assert.deepEqual(financial.segmentLabels,['display_technology','mobility','vertical_solutions','other']);
  const q2=financial.reports.find(r=>r.columnPeriods.includes('2026H1'));
  const actual=period=>Object.fromEntries(Object.entries(q2.columns).map(([k,v])=>[k,k.includes('Eps')?v[q2.columnPeriods.indexOf(period)]:v[q2.columnPeriods.indexOf(period)]/1000]));
  const actualH1=actual('2026H1'),actualQ2=actual('2026Q2');
  const segmentActuals=financial.segments.map(s=>({period:s.period,revenue:s.revenue.map(x=>x/1000),operatingProfit:s.operatingProfit.map(x=>x/1000),segmentGrossMargins:null}));
  for(const s of segmentActuals){const a=s.period==='2026Q1'?financial.reports.find(r=>r.label==='2026q1-consolidated-tc').columns: q2.columns;
    const i=s.period==='2026Q1'?0:q2.columnPeriods.indexOf(s.period);close(sum(s.revenue),a.revenue[i]/1000);close(sum(s.operatingProfit),a.operatingProfit[i]/1000);}
  const q3Months=monthly.monthlyConsolidatedRevenue.filter(r=>['2026-07','2026-08','2026-09'].includes(r.period));
  assert.equal(q3Months.length,3);assert.equal(new Set(q3Months.map(r=>r.period)).size,3);assert.ok(q3Months.every(r=>r.unit==='TWD_million'&&r.consolidated&&sourceControllerInstant(r.observedAt)<=cutoff));
  const q3Total=sum(q3Months.map(r=>r.reportedRevenue));const q2Seg=segmentActuals.find(s=>s.period==='2026Q2');
  const knownShares=financial.epsNotes.dilutedWeightedSharesThousands[0]/1000;
  const periods=['2026Q3','2026Q4','2027Q1','2027Q2','2027Q3','2027Q4'];
  const scenarios=Object.entries(scenarioInputs).map(([id,a])=>{
    let previous=q2Seg.revenue.map((x,i)=>x*a.q3Weights[i]);const guidanceImpliedTotal=sum(previous),scale=q3Total/guidanceImpliedTotal;
    previous=previous.map(x=>x*scale);
    const quarters=periods.map((period,i)=>{if(i)previous=previous.map((x,k)=>x*(1+a.growth[i-1][k]));return forecastQuarter(period,previous,a,i,knownShares*(period.startsWith('2027')?1+a.futureDilution:1));});
    const forecastH2=aggregate(quarters.slice(0,2),knownShares);
    const year2026=aggregate([actualH1,forecastH2],knownShares);
    // Future weighted shares are explicit assumptions, not June30 issued shares.
    const year2027=aggregate(quarters.slice(2),knownShares*(1+a.futureDilution));
    const forwardShares=knownShares*(1+a.futureDilution/2);
    const nextFour=aggregate(quarters.slice(0,4),forwardShares);
    return {id,assumptions:a,guidanceImpliedQ3Total:guidanceImpliedTotal,monthlyTotalReconciliationScale:scale,
      consolidatedGuidanceDifference:q3Total-guidanceImpliedTotal,quarters,
      calendar2026:{...year2026,composition:'reportedH1 + forecastQ3Q4; historical oneoffs retained; not normalized'},
      calendar2027:{...year2027,composition:'four forecast quarters; no new CPO/GCS or asset-sale gains'},
      nextFourUnreported:{...nextFour,periods:periods.slice(0,4),composition:'2026Q3–2027Q2, not rolling12months from October8'},
      pe2027Conditional:year2027.dilutedEpsConditional>.1?market.stockBars.at(-1).close/year2027.dilutedEpsConditional:null,
      targetPrice:null,multiplesCalibrated:false};
  });
  const gains=financial.heldForSaleTransactions;close(sum(gains.map(r=>r.pretaxGain)),financial.otherGains.columns.heldForSaleDisposalGains[0]);
  const normalizationSensitivity=[];
  for(const taxRate of [.10,.20,.30])for(const darwinWeight of [.30,.4105,.50]){
    const assumedOwnersGainMillion=(gains[0].pretaxGain+gains[1].pretaxGain*darwinWeight)/1000*(1-taxRate);
    normalizationSensitivity.push({taxRateAssumed:taxRate,bvxmWeightAssumed:1,darwinWeightAssumed:darwinWeight,
      assumedOwnersGainMillion,q2OwnersAfterHypotheticalRemoval:actualQ2.ownersNetProfit-assumedOwnersGainMillion,
      q2EpsAfterHypotheticalRemoval:(actualQ2.ownersNetProfit-assumedOwnersGainMillion)/knownShares,
      h1OwnersAfterHypotheticalRemoval:actualH1.ownersNetProfit-assumedOwnersGainMillion,
      h1EpsAfterHypotheticalRemoval:(actualH1.ownersNetProfit-assumedOwnersGainMillion)/knownShares,status:'sensitivity_not_verified_normalized_earnings'});
  }
  const ttm=historical.quarters.slice(-4).map(q=>Object.fromEntries(Object.entries(q.values).map(([k,v])=>[k,k.includes('Eps')?v:v/1000])));
  const exactTtm=Object.fromEntries(['revenue','operatingProfit','nonOperating','ownersNetProfit'].map(k=>[k,sum(ttm.map(r=>r[k]))]));
  const price=market.stockBars.at(-1).close;
  const reverse=[10,15,20,30].map(multiple=>({multipleTestParameter:multiple,...requiredEarningsAtMultiple(price,multiple,knownShares,scenarios.find(s=>s.id==='base').calendar2027.revenue),sharesAssumedNotFutureVerified:true}));
  const commercial=calculateCommercializationBridge({shippedCapacityUnits:null,utilization:null,yieldRate:null,averageSellingPriceMillion:null,grossMargin:null,incrementalOpexMillion:null,depreciationMillion:null,taxRate:.22,attributableShare:null,intercompanyRevenueMillion:null,dilutedSharesMillion:knownShares});
  // Existing draft's 32.2 trigger / 36.6 target are preserved as paper-plan references.
  // Current raw reconstruction does not certify original-time eligibility or fills.
  const firstLegacyTarget=market.stockBars.find(r=>r.session>='2026-09-21'&&r.high>=36.6)?.session??null;
  const legacyRows=market.stockBars.filter(b=>b.session>='2026-09-21').map(b=>({session:b.session,close:b.close,high:b.high,
    originalPaperTrigger:32.2,originalPaperTarget:36.6,firstTargetObserved:firstLegacyTarget,
    paperTargetState:firstLegacyTarget&&b.session>=firstLegacyTarget?'target_already_observed_do_not_reactivate':'before_first_target',approvedEntry:false}));
  const result={schemaVersion:'auo-four-segment-research-model-v1',symbol:'2409',asOf,unit:'TWD_million; EPS TWD/share',status:'draft/incomplete',
    historicalPITEligible:false,published:false,researchQualified:false,strategyApproved:false,price,priceSession:market.stockBars.at(-1).session,
    actualH1,actualQ2,segmentActuals,segmentComparability:financial.segmentComparability,exactTtm,
    q3KnownMonthlyRevenue:{sum:q3Total,roundingRange:[q3Total-1.5,q3Total+1.5],precision:'three independently rounded monthly amounts; upper bound exclusive',months:q3Months.map(r=>({period:r.period,value:r.reportedRevenue,source:r.sourceUrl,observedAt:r.observedAt,publicationInstant:r.sourcePublicationTimestamp})),q3EpsPublished:false},
    dilutedShares:{q2ReportedMillion:knownShares,futureVerified:false,annual2026Assumption:knownShares,endingOutstandingSharesVerified:false},
    scenarios,normalizationSensitivity,reversePriceSensitivity:reverse,commercialization:commercial,legacyPaperPlanDaily:legacyRows,
    limitations:['Segment gross margins and expense allocation are research assumptions, not issuer disclosures','Q1 segment allocation conflict and nonrestated2025 comparability retained','Future tax/NCI/dilution assumed; loss-period tax can be positive','No precise original financial publication instant or historicalPIT','No calibrated PE, target price, certified current P/B, approved entry or model/lease IDs'],
    calculationComponent:'existing auo-deep-dive-model.calculateQuarter / requiredEarningsAtMultiple / calculateCommercializationBridge'};
  return {...result,canonicalHash:researchCanonicalHash(result)};
}

export function renderArticle(model,template){
  const actualQ2=model.segmentActuals.find(row=>row.period==='2026Q2'),actualH1=model.segmentActuals.find(row=>row.period==='2026H1');
  const number=x=>x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  let segments='|部門|Q2收入|Q2營業利益|H1收入|H1營業利益|\n|---|---:|---:|---:|---:|\n';
  ['顯示','移動','垂直','Other'].forEach((label,i)=>{segments+=`|${label}|${number(actualQ2.revenue[i])}|${number(actualQ2.operatingProfit[i])}|${number(actualH1.revenue[i])}|${number(actualH1.operatingProfit[i])}|\n`;});
  segments+=`|合併|${number(model.actualQ2.revenue)}|${number(model.actualQ2.operatingProfit)}|${number(model.actualH1.revenue)}|${number(model.actualH1.operatingProfit)}|`;
  let annual='|情境|2026收入|2026條件EPS|2027收入|2027條件EPS|未公告四季條件EPS|\n|---|---:|---:|---:|---:|---:|\n';
  model.scenarios.forEach((row,i)=>{annual+=`|${['悲觀','中性','樂觀'][i]}|${number(row.calendar2026.revenue)}|${number(row.calendar2026.dilutedEpsConditional)}|${number(row.calendar2027.revenue)}|${number(row.calendar2027.dilutedEpsConditional)}|${number(row.nextFourUnreported.dilutedEpsConditional)}|\n`;});
  let quarters='|情境／季|收入|毛利|費用|OP|淨業外|稅|NCI|歸母|條件稀釋EPS|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for(const scenario of model.scenarios)for(const q of scenario.quarters)quarters+=`|${scenario.id}/${q.period}|${[q.revenue,q.grossProfit,q.operatingExpenses,q.operatingProfit,q.nonOperating,q.taxExpense,q.nonControllingNetProfit,q.ownersNetProfit,q.dilutedEpsConditional].map(number).join('|')}|\n`;
  const rendered=template.replace('{{QUARTERS}}',quarters).replace('{{SEGMENTS}}',segments).replace('{{ANNUAL}}',annual)
    .replace('{{BULL27_EPS}}',number(model.scenarios.find(s=>s.id==='bull').calendar2027.dilutedEpsConditional))
    .replace('{{BASE27_OP}}',number(model.scenarios.find(s=>s.id==='base').calendar2027.operatingProfit));
  assert.ok(!rendered.includes('{{'),'unresolved article token');return rendered;
}
export async function loadInputs(){const files=['docs/research/2026-10-08-auo-full-financial/financial-relay.json','docs/research/2026-10-08-auo-full-financial/historical-income-relay.json','docs/research/2026-10-08-auo/dataset.json','docs/research/2026-10-08-auo-market/dataset.json',...['guidance','ownership','technology-context'].map(name=>`docs/research/2026-10-08-auo-full-financial/${name}-relay.json`)];const raw=await Promise.all(files.map(f=>readFile(path.join(root,f))));return {values:raw.slice(0,4).map(b=>JSON.parse(b)),context:Object.fromEntries(['guidance','ownership','technology'].map((name,i)=>[name,JSON.parse(raw[i+4])])),manifest:files.map((file,i)=>({file,bytes:raw[i].length,sha256:createHash('sha256').update(raw[i]).digest('hex')}))};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {values,manifest,context}=await loadInputs();const model=buildModel(...values,process.argv[2]??new Date().toISOString(),context);
  await writeFile(path.join(directory,'model-results.json'),JSON.stringify({...model,inputManifest:manifest},null,2)+'\n');
  await writeFile(path.join(directory,'article.md'),renderArticle(model,await readFile(path.join(directory,'article-template.md'),'utf8')));
  console.log(JSON.stringify({canonicalHash:model.canonicalHash,scenarios:model.scenarios.map(s=>({id:s.id,eps2026:s.calendar2026.dilutedEpsConditional,eps2027:s.calendar2027.dilutedEpsConditional,forward4:s.nextFourUnreported.dilutedEpsConditional})),sourceInputHashes:manifest.map(m=>m.sha256)}));
}
