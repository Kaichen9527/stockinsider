import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildModel,loadInputs,forecastQuarter,scenarioInputs,renderArticle,conditionalEps,weightedOrdinaryShares,loadCashFlowPacket,integrateHistoricalCashFlow,historicalCashFlow,assertHistoricalCashBinding,validateHistoricalCashManifest } from '../docs/research/2026-10-08-auo-four-segment-model/recompute.mjs';
const {values,context,manifest}=await loadInputs();const cutoff='2026-10-08T10:20:00Z';const model=buildModel(...values,cutoff,context);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} / ${b}`);
test('official exact four-segment H1/Q2 includes Other and reconciles',()=>{
  for(const s of model.segmentActuals)assert.equal(s.revenue.length,4);
  near(model.segmentActuals[0].revenue.reduce((a,b)=>a+b),70891.194);
  near(model.segmentActuals[1].operatingProfit.reduce((a,b)=>a+b),-417.279);
  assert.deepEqual(model.segmentComparability.derivedMinusOriginal.operatingProfit,[363974,-546733,182759,0]);
  assert.equal(model.segmentComparability.priorYearRestated,false);
});
test('Q3 monthly total constrains all scenarios without inventing Q3 EPS',()=>{
  assert.equal(model.q3KnownMonthlyRevenue.sum,66876);assert.equal(model.q3KnownMonthlyRevenue.q3EpsPublished,false);
  assert.deepEqual(model.q3KnownMonthlyRevenue.roundingRange,[66874.5,66877.5]);
  for(const s of model.scenarios)near(s.quarters[0].revenue,66876);
});
for(const s of model.scenarios)test(`${s.id} all six quarterly bridges independently reconcile to conditional EPS`,()=>{
  for(const q of s.quarters){
    near(q.revenue,q.segments.reduce((sum,row)=>sum+row.revenue,0));near(q.grossProfit,q.segments.reduce((sum,row)=>sum+row.grossProfit,0));
    near(q.operatingProfit,q.grossProfit-q.operatingExpenses);near(q.nonOperating,q.interestIncome+q.financeCosts+q.otherIncome+q.equityMethodProfit+q.fxAndOtherRecurring);
    near(q.netProfit,q.pretaxProfit-q.taxExpense);near(q.ownersNetProfit,q.netProfit-q.nonControllingNetProfit);near(q.dilutedEpsConditional,q.ownersNetProfit/q.dilutedSharesMillionAssumed);
    assert.equal(q.newCpoGcsRevenueAssumed,null);assert.equal(q.oneOffGainsIncluded,0);
  }
  assert.deepEqual(s.nextFourUnreported.periods,['2026Q3','2026Q4','2027Q1','2027Q2']);
  near(s.calendar2026.ownersNetProfit,199.555+s.quarters[0].ownersNetProfit+s.quarters[1].ownersNetProfit);
  near(s.calendar2027.revenue,s.quarters.slice(2).reduce((sum,q)=>sum+q.revenue,0));
  assert.equal(s.targetPrice,null);
});
test('normalization sensitivity respects tax and differentiated ownership, no exact normalized claim',()=>{
  const r=model.normalizationSensitivity[4];near(r.assumedOwnersGainMillion,(863.731+1127.507*.4105)*.8);
  near(r.q2EpsAfterHypotheticalRemoval,(1343.092-r.assumedOwnersGainMillion)/7547.099);
  assert.equal(r.status,'sensitivity_not_verified_normalized_earnings');assert.notEqual(r.assumedOwnersGainMillion,1991.238);
});
test('loss scenarios can incur positive jurisdiction tax; future shares not marked actual',()=>{
  const bear=model.scenarios[0].quarters[0];assert.ok(bear.pretaxProfit<0&&bear.taxExpense>0);
  assert.equal(model.dilutedShares.futureVerified,false);assert.ok(model.scenarios[1].calendar2027.dilutedSharesMillionAssumed>7547.099);
});
test('invalid units, missing Other, duplicate month and future microsecond evidence fail',()=>{
  let copy=structuredClone(values);copy[0].amountUnit='TWD_million';assert.throws(()=>buildModel(...copy,cutoff,context));
  copy=structuredClone(values);copy[0].segmentLabels.pop();assert.throws(()=>buildModel(...copy,cutoff,context));
  copy=structuredClone(values);copy[2].monthlyConsolidatedRevenue.push(structuredClone(copy[2].monthlyConsolidatedRevenue.at(-1)));assert.throws(()=>buildModel(...copy,cutoff,context));
  const future=structuredClone(context);future.guidance.recordedAt='2026-10-08T10:20:00.000001Z';assert.throws(()=>buildModel(...values,cutoff,future),/future evidence/);
  assert.throws(()=>forecastQuarter('2027Q1',[1,2,3,4],scenarioInputs.base,0,0));
});
test('unknown commercialization inputs remain incomplete; no fabricated capacity or target',()=>{
  assert.equal(model.commercialization.status,'incomplete');assert.ok(model.commercialization.missing.includes('yieldRate'));
  assert.ok(model.reversePriceSensitivity.every(r=>r.multipleTestParameter>0&&r.sharesAssumedNotFutureVerified));
});
test('old paper target first observed September22 remains terminal every later daily row',()=>{
  for(const row of model.legacyPaperPlanDaily.filter(r=>r.session>='2026-09-22')){assert.equal(row.firstTargetObserved,'2026-09-22');assert.equal(row.paperTargetState,'target_already_observed_do_not_reactivate');assert.equal(row.approvedEntry,false);}
});
test('same evidence and cutoff regenerate same canonical model',()=>{assert.equal(buildModel(...values,cutoff,context).canonicalHash,model.canonicalHash);});

test('unpublished working article renders both tables and forecast claims from the same result',async()=>{
  const template=await readFile(new URL('../docs/research/2026-10-08-auo-four-segment-model/article-template.md',import.meta.url),'utf8');
  const article=await readFile(new URL('../docs/research/2026-10-08-auo-four-segment-model/article.md',import.meta.url),'utf8');
  assert.equal(renderArticle(supplemented,template),article);assert.ok(article.includes('Other'));assert.ok(article.includes('樂觀2027條件EPS約0.96'));
  const body=article.split('<details>')[0],characters=[...body].filter(c=>c>='\u4e00'&&c<='\u9fff').length;
  assert.ok(characters>=4000 && characters<=6000,`main-body Chinese characters ${characters}`);
  const defined=new Set([...article.matchAll(/^\[([A-Z]+)\]:/gmu)].map(m=>m[1]));
  for(const m of body.matchAll(/\[([A-Z]+)\]/gu))assert.ok(defined.has(m[1]),`missing reference ${m[1]}`);
  assert.ok(!article.includes('{{'));
});

test('paper target lifecycle does not invent a hit when no post-reference high reaches it',()=>{
  const copy=structuredClone(values);copy[3].stockBars=copy[3].stockBars.map(row=>row.session<'2026-09-21'?row:{...row,high:Math.min(row.high,36.59),close:Math.min(row.close,36.59),open:Math.min(row.open,36.59),low:Math.min(row.low,36.59)});
  const result=buildModel(...copy,cutoff,context);
  assert.ok(result.legacyPaperPlanDaily.every(row=>row.firstTargetObserved===null&&row.paperTargetState==='before_first_target'));
});

test('potential shares are excluded for annual loss rather than reducing loss per share',()=>{ const s=model.scenarios[0].calendar2027; near(s.dilutedSharesMillionAssumed,7547.099); near(s.dilutedEpsConditional,s.ownersNetProfit/7547.099); });

test('positive earnings include potential awards; losses exclude only potential shares',()=>{near(conditionalEps(110,100,10).dilutedEpsConditional,1);near(conditionalEps(-100,100,10).dilutedEpsConditional,-1);near(conditionalEps(0,100,10).dilutedSharesMillionAssumed,100);});
test('issued ordinary shares remain in loss denominator with actual-period weight',()=>{near(conditionalEps(-110,weightedOrdinaryShares(100,20,.5),10).dilutedEpsConditional,-1);near(weightedOrdinaryShares(100,20,1),120);near(weightedOrdinaryShares(100,20,0),100);assert.notEqual(weightedOrdinaryShares(100,20,.25),weightedOrdinaryShares(100,20,.75));assert.throws(()=>weightedOrdinaryShares(100,20,1.01));});
test('quarter and annual loss use their own profit and potential share weights',()=>{const s=model.scenarios[0];for(const q of s.quarters.slice(2)){near(q.ordinaryWeightedSharesMillionAssumed,7547.099);near(q.antiDilutiveExcludedMillion,7547.099*.01);}near(s.calendar2027.antiDilutiveExcludedMillion,7547.099*.01);near(s.nextFourUnreported.antiDilutiveExcludedMillion,7547.099*.005);assert.ok(model.scenarios[1].calendar2027.potentialIncludedMillion>0);});
test('patent, annual and nine-month citations link directly to their primary sources',async()=>{const t=await readFile(new URL('../docs/research/2026-10-08-auo-four-segment-model/article-template.md',import.meta.url),'utf8');assert.match(t,/證據链。\[P\]/);assert.match(t,/\[H\]: https:\/\/www.auo.com.*4Q2025_TC.pdf/);assert.match(t,/\[HH\]: https:\/\/www.auo.com.*3Q2025_TC.pdf/);assert.ok(!/\[(N|I)\]: \.\.\//.test(t));});

const cash=await loadCashFlowPacket();const supplemented=integrateHistoricalCashFlow(model,cash.packet,cash.packet.extractionAvailableAt,[...manifest,cash.manifest]);
test('historical cash integration retains every original forecast/price field and binds full manifest',()=>{
 const original=model;for(const [key,value] of Object.entries(original))if(!['asOf','canonicalHash'].includes(key))assert.deepEqual(supplemented[key],value,key);
 assert.equal(supplemented.originalModelAsOf,original.asOf);assert.equal(supplemented.originalModelCanonicalHash,original.canonicalHash);
 assert.equal(supplemented.inputManifest.length,manifest.length+1);assert.equal(supplemented.historicalCashFlow.noFutureCash,true);assert.equal(supplemented.historicalCashFlow.forecastCash,null);
 assert.equal(supplemented.historicalCashFlow.technicalAdmission,false);assert.equal(supplemented.historicalCashFlow.valuationApproved,false);
});
test('both signed H1 bridges use group denominator and exclude disposal and lease cash from proxy',()=>{
 const h=supplemented.historicalCashFlow;assert.equal(h.rows.length,2);assert.equal(h.extractionAvailableAt,cash.packet.extractionAvailableAt);
 for(const row of h.rows){assert.equal(row.unit,'TWD_thousands');assert.match(row.grain,/not standalone Q2/);assert.equal(row.cfoLessPpeAndIntangibleCashOutlay,row.cfo+row.ppeCashAcquisition+row.intangibleCashAcquisition);near(row.cfoDividedByGroupNetProfit,row.cfo/row.groupNetProfit);assert.equal(row.openingCash+row.cashChange,row.closingCash);assert.equal(row.cfo+row.investingCash+row.financingCash+row.fxCash,row.cashChange);}
 for(const locator of Object.values(h.sourceFacts)){assert.ok(locator.pdfPage>0);assert.match(locator.sourceJsonPointer,/^\/issuers\/\d\/facts\//);assert.equal(locator.values.length,2);}
 assert.deepEqual(h.rows.map(r=>r.cfoLessPpeAndIntangibleCashOutlay),[1134612,-5692596]);near(h.historicalCapital.ownersEquityPerIssuedCommonShareTwd,20.457839363);assert.equal(h.historicalCapital.treasurySharesThousands,null);assert.equal(h.historicalCapital.currentPB,null);assert.equal(h.rows[0].assetDisposalGainAlreadyRemoved,-1991238);
});
test('packet mutation sign/unit/grain/hash/clocks and pre-availability successor fail closed',()=>{
 assert.throws(()=>historicalCashFlow(cash.packet,model.symbol,'2026-10-08T12:12:00Z'),/not yet available/);
 for(const change of [p=>p.issuers[0].unit='TWD_million',p=>p.issuers[0].grain='Q2',p=>p.issuers[0].facts.ppeCash.values[0]*=-1,p=>p.issuers[0].source.sha256='0'.repeat(64),p=>p.extractionAvailableAt='2026-10-08T00:00:00Z']){const p=structuredClone(cash.packet);change(p);assert.throws(()=>historicalCashFlow(p,model.symbol,cash.packet.extractionAvailableAt),/canonical binding/);}
});

test("successor stored result exactly recomputes with complete packet manifest",async()=>{const stored=JSON.parse(await readFile(new URL("../docs/research/2026-10-08-auo-four-segment-model/model-results.json",import.meta.url),"utf8"));assert.deepEqual(stored,supplemented);});

test('nested complete manifest is canonical-bound and top duplicate/prefix/unique packet remain exact',()=>{
 assert.deepEqual(supplemented.inputManifest,supplemented.historicalCashFlow.sourceInputManifest);
 assertHistoricalCashBinding(supplemented);
 for(const mutate of [m=>m.inputManifest[0].sha256='0'.repeat(64),m=>m.historicalCashFlow.sourceInputManifest[0].sha256='0'.repeat(64),m=>m.inputManifest.pop(),m=>m.inputManifest.push(m.inputManifest.at(-1)),m=>m.inputManifest.reverse(),m=>m.historicalCashFlow.sourcePacketSha256='0'.repeat(64)]){const changed=structuredClone(supplemented);mutate(changed);assert.throws(()=>assertHistoricalCashBinding(changed));}
 for(const mutate of [a=>a[0].bytes++,a=>a[0].file=a[1].file,a=>a.at(-1).bytes++,a=>a.splice(0,1),a=>a.push(a.at(-1))]){const a=structuredClone(supplemented.inputManifest);mutate(a);assert.throws(()=>validateHistoricalCashManifest(a,supplemented.symbol));}
});
test('real existing working draft consumer accepts successor and preserves original source/model clocks',async()=>{
 const {loadReadOnlyWorkingDraft}=await import('../web/src/lib/research-working-draft-loader.ts');
 const {parseWorkingDraft}=await import('../web/src/lib/research-working-draft.ts');
 const root=new URL('../',import.meta.url).pathname;const draft=await loadReadOnlyWorkingDraft(root,supplemented.symbol);
 assert.equal(draft.evidenceCutoffAt,supplemented.asOf);assert.equal(draft.sections.length,7);
 const folder=new URL('../docs/research/2026-10-08-auo-four-segment-model/',import.meta.url);const meta=JSON.parse(await readFile(new URL('draft-metadata.json',folder),'utf8'));const article=await readFile(new URL('article.md',folder),'utf8');
 assert.equal(meta.evidenceCutoffAt,supplemented.asOf);assert.equal(meta.originalEvidenceCutoffAt,supplemented.originalModelAsOf);assert.equal(meta.authoredAndVerifiedAt,meta.successorArtifactCompletedAt);assert.notEqual(meta.authoredAndVerifiedAt,meta.originalAuthoredAndVerifiedAt);
 assert.throws(()=>parseWorkingDraft(supplemented.symbol,article,{...meta,authoredAndVerifiedAt:'2027-01-01T00:00:00Z'},'2026-10-14T02:34:47Z'),/future/);
 assert.throws(()=>parseWorkingDraft(supplemented.symbol,article,{...meta,evidenceCutoffAt:'2027-01-01T00:00:00Z'}),/cutoff/);
 assert.equal(draft.published,false);assert.equal(draft.strategyApproved,false);
});

test('actual loader rejects metadata/model/canonical drift even after updating only raw file manifests',async()=>{
 const fs=await import('node:fs/promises');const {createHash}=await import('node:crypto');const path=await import('node:path');const os=await import('node:os');const {loadReadOnlyWorkingDraft}=await import('../web/src/lib/research-working-draft-loader.ts');
 const folder='docs/research/2026-10-08-auo-four-segment-model',root=new URL('../',import.meta.url).pathname;
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cash-consumer-drift-'));
 const originalMeta=JSON.parse(await fs.readFile(path.join(root,folder,'draft-metadata.json'),'utf8'));
 try{
  for(const mutate of [x=>x.meta.evidenceCutoffAt=supplemented.originalModelAsOf,x=>x.meta.modelCanonicalHash='0'.repeat(64),x=>x.model.canonicalHash='0'.repeat(64),x=>x.model.historicalCashFlow.sourceInputManifest[0].sha256='0'.repeat(64),x=>x.model.inputManifest[0].bytes++]){
   await fs.mkdir(path.join(temp,'docs/research'),{recursive:true});await fs.cp(path.join(root,folder),path.join(temp,folder),{recursive:true});
   const value={meta:structuredClone(originalMeta),model:structuredClone(supplemented)};mutate(value);
   await fs.writeFile(path.join(temp,folder,'draft-metadata.json'),JSON.stringify(value.meta));await fs.writeFile(path.join(temp,folder,'model-results.json'),JSON.stringify(value.model));
   // Normal file manifest alone cannot replace the canonical nested binding.
   // The top-only case deliberately retains original file hash to test raw drift.
   if(value.model.inputManifest[0].bytes===supplemented.inputManifest[0].bytes){
    const file=path.join(temp,folder,'hashes.json');const hashes=JSON.parse(await fs.readFile(file,'utf8'));
    for(const name of ['draft-metadata.json','model-results.json']){const row=hashes.files.find(r=>r.file===folder+'/'+name),bytes=await fs.readFile(path.join(temp,folder,name));row.bytes=bytes.length;row.sha256=createHash('sha256').update(bytes).digest('hex');}
    await fs.writeFile(file,JSON.stringify(hashes));
   }
   await assert.rejects(loadReadOnlyWorkingDraft(temp,supplemented.symbol),/mismatch/);
   await fs.rm(path.join(temp,'docs'),{recursive:true});
  }
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
