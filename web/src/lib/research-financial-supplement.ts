import { createHash } from 'node:crypto';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { financialInventory as inventory } from './research-financial-inventory.ts';
import { parseAuthorInputRequest, type AuthorInputRequest } from './research-deep-author-input.ts';
import { FinancialDeadline, FINANCIAL_READ_LIMITS, readPinnedFinancialFiles, financialReaderExecutionIdentity, type FinancialFilePin } from './research-financial-file-reader.ts';
import { financialInstant } from './research-financial-clock.ts';
import { recalculateResearchBusinessScenarios, businessCalculatorExecutionHash } from './research-business-calculator.ts';

type Row = Record<string, unknown>;
export type FinancialSupplementRequest = { request: AuthorInputRequest; preparationId: string; preparationInputHash: string };
const PERIODS = ['2026Q3','2026Q4','2027Q1','2027Q2','2027Q3','2027Q4'];
const SEGMENTS = ['display','mobility','vertical','other'];
function ensure(ok: unknown): asserts ok { if (!ok) throw new Error('research_financial_supplement_invalid'); }
function row(value: unknown): Row { ensure(value && typeof value === 'object' && !Array.isArray(value)); return value as Row; }
function list(value: unknown, limit = 64): unknown[] { ensure(Array.isArray(value) && value.length <= limit); return value; }
function number(value: unknown): number { ensure(typeof value === 'number' && Number.isFinite(value)); return value; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Row)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function hash(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function assertFinancialJsonBytes(value: unknown, bytes: number) { const text = JSON.stringify(value); ensure(Buffer.byteLength(text,'utf8') <= bytes); return text; }
export function parseFinancialSupplementRequest(value: unknown): FinancialSupplementRequest {
  const fields = row(value), {preparationId,preparationInputHash,...request} = fields;
  ensure(typeof preparationId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(preparationId)
    && typeof preparationInputHash === 'string' && /^[a-f0-9]{64}$/u.test(preparationInputHash));
  const input = parseAuthorInputRequest(request); ensure(input.scope === 'research_observed_v1' && input.bundleId === null);
  return {request:input,preparationId,preparationInputHash};
}
function project(symbol: '2409'|'2383', files: Map<string,{pin:FinancialFilePin;value:unknown}>, now: string) {
  const pins = inventory.companies[symbol], modelFile = pins[0].path, model = row(files.get(modelFile)?.value);
  ensure(model.symbol === symbol && model.unit === 'TWD_million; EPS TWD/share' && model.asOf === (symbol==='2409'?'2026-10-08T10:20:00Z':'2026-10-08T12:12:00Z'));
  const manifest = pins.slice(1).map(p=>({file:p.path,bytes:p.bytes,sha256:p.sha256}));
  ensure(hash(model.inputManifest) === hash(manifest));
  const {canonicalHash,inputManifest,...originalMaterial} = model; void inputManifest;
  ensure(canonicalHash === hash(originalMaterial));
  const get = (ending: string) => { const selected = pins.filter(p=>p.path.endsWith(ending)); ensure(selected.length===1); return {file:selected[0],data:row(files.get(selected[0].path)?.value)}; };
  const financial = get('/financial-relay.json'), notes = symbol==='2383'?get('/financial-notes-relay.json'):financial;
  ensure(financial.data.symbol === symbol && financial.data.amountUnit === 'TWD_thousands');
  ensure(typeof financial.data.recordedAt === 'string' && financialInstant(financial.data.recordedAt)<=financialInstant(model.asOf));
  ensure(typeof notes.data.recordedAt === 'string' && financialInstant(notes.data.recordedAt)<=financialInstant(model.asOf));
  const reports = list(financial.data.reports,16).map(row), report = reports.find(r=>list(r.columnPeriods,4).includes('2026Q2'));
  ensure(report); const reportedFacts: Row[]=[];
  const fact = (value: unknown, metric:string, period:string, unit:string, pointer:string, input:{file:FinancialFilePin;data:Row}, page:unknown, column:unknown, source:unknown) => {
    number(value); const s = source && typeof source === 'object'?row(source):{};
    reportedFacts.push({metric,period,periodKind:period.includes('H')?'half_year_cumulative':'quarter',unit,value,status:'reported_attributed_relay',
      signConvention:'printed_signed_value',locator:{file:input.file.path,fileSha256:input.file.sha256,jsonPointer:pointer,pdfPage:page??null,column:column??null},
      source:{url:s.url??null,rawSha256:s.sha256??null,rawObservedAt:s.observedAt??null,attemptedAt:s.attemptedAt??null,extractionRecordedAt:input.data.recordedAt??null},
      locallyReadAt:now,databaseFinancialAdmissionAt:null,verificationAttribution:'root public-reader relay with unsigned scoped data review; VM verifies Git bytes only'});
  };
  const reportIndex=reports.indexOf(report), periods=list(report.columnPeriods,4), columns=row(report.columns);
  for(const period of ['2026Q2','2026H1']){
    const col=periods.indexOf(period);ensure(col>=0);
    for(const [metric,values]of Object.entries(columns)){
      // The bounded projection keeps the group operating-expense total; its
      // three disclosed components remain in the pinned relay, not this view.
      if (period==='2026H1' && metric.includes('Eps')) continue;
      if (['sellingExpenses','administrativeExpenses','researchDevelopmentExpenses'].includes(metric)) continue;
      const valuesArray=list(values,4);ensure(valuesArray.length===periods.length);
      fact(valuesArray[col],metric,period,metric.includes('Eps')?'TWD_per_share':'TWD_thousands',`/reports/${reportIndex}/columns/${metric}/${col}`,financial,report.pdfPage,period,report.source);
    }
  }
  let ordinary: number, q3: number;
  const monthlyFacts: Row[] = []; let monthlyBridge: Row;
  let q2Segments: number[]=[];
  if(symbol==='2409'){
    const eps=row(financial.data.epsNotes);ordinary=number(list(eps.basicWeightedSharesThousands,4)[0])/1000;
    for(const key of ['basicWeightedSharesThousands','dilutedWeightedSharesThousands'])fact(list(eps[key],4)[0],key,'2026Q2','thousand_shares',`/epsNotes/${key}/0`,financial,eps.pdfPage,'2026Q2',report.source);
    const segments=list(financial.data.segments,3).map(row);ensure(segments.length===3);
    for(let i=0;i<segments.length;i++){
      const s=segments[i];ensure(['2026Q2','2026H1','2026Q1'].includes(String(s.period)));
      for(const metric of ['revenue','operatingProfit']){
        const values=list(s[metric],4);ensure(values.length===4);
        for(let j=0;j<4;j++)fact(values[j],SEGMENTS[j]+':'+metric,String(s.period),'TWD_thousands',`/segments/${i}/${metric}/${j}`,financial,s.pdfPage,SEGMENTS[j],reports.find(r=>r.label===s.sourceLabel)?.source);
      }
      if(s.period==='2026Q2')q2Segments=list(s.revenue,4).map(x=>number(x)/1000);
    }
    ensure(q2Segments.length===4);
    const monthly=get('2026-10-08-auo/dataset.json');const selected=list(monthly.data.monthlyConsolidatedRevenue,24).map(row).filter(r=>['2026-07','2026-08','2026-09'].includes(String(r.period)));
    ensure(selected.length===3&&new Set(selected.map(r=>r.period)).size===3&&selected.every(r=>r.unit==='TWD_million'&&r.consolidated===true));
    const rows=list(monthly.data.monthlyConsolidatedRevenue,24);
    for(const m of selected){
      ensure(typeof m.observedAt==='string' && financialInstant(m.observedAt)<=financialInstant(model.asOf));
      monthlyFacts.push({metric:'monthlyConsolidatedRevenue',period:m.period,periodKind:'month',unit:m.unit,value:number(m.reportedRevenue),status:'reported_attributed_relay',signConvention:'positive_revenue',
        locator:{file:monthly.file.path,fileSha256:monthly.file.sha256,jsonPointer:`/monthlyConsolidatedRevenue/${rows.indexOf(m)}/reportedRevenue`},
        source:{url:m.sourceUrl,rawObservedAt:m.observedAt,extractionRecordedAt:null,publication:{precision:'unknown',value:null}},roundingInterval:m.roundingInterval,locallyReadAt:now});
    }
    q3=selected.reduce((n,r)=>n+number(r.reportedRevenue),0);
    const intervals=selected.map(m=>row(m.roundingInterval));
    monthlyBridge={metric:'q3MonthlyRevenueAnchor',period:'2026Q3',periodKind:'quarter_monthly_sum',unit:'TWD_million',value:q3,status:'derived_not_reported_q3_income_statement',
      formula:'sum(reported July, August, September TWD million)',conversionDivisor:1,operands:monthlyFacts.map(m=>m.locator),namedOperands:monthlyFacts.map(m=>({name:`reportedMonthlyRevenue:${m.period}`,value:m.value,unit:m.unit,locator:m.locator,source:m.source})),
      roundingInterval:{lower:intervals.reduce((n,x)=>n+number(Number(x.lower)),0),upper:intervals.reduce((n,x)=>n+number(Number(x.upper)),0),lowerInclusive:true,upperInclusive:false},
      reconciliation:'monthly printed rounding retained; no Q3 financial statement reconciliation or EPS inferred'};
  }else{
    const eps=row(notes.data.earningsPerShareNotes);ordinary=number(list(eps.basicWeightedShares,4)[0])/1000;
    for(const metric of ['basicWeightedShares','dilutedWeightedShares','basicOwnersProfit','dilutedOwnersProfit','convertibleAfterTaxNumeratorAdjustment'])fact(list(eps[metric],4)[0],metric,'2026Q2',metric.includes('Shares')?'thousand_shares':'TWD_thousands',`/earningsPerShareNotes/${metric}/0`,notes,notes.data.earningsPerShareNotes && row(notes.data.earningsPerShareNotes).pdfPages,'2026Q2',notes.data.source);
    const monthly=row(financial.data.monthlyRevenue);ensure(monthly.unit==='TWD');const selected=list(monthly.rows,24).map(row).filter(r=>['2026-07','2026-08','2026-09'].includes(String(r.month)));
    ensure(selected.length===3&&new Set(selected.map(r=>r.month)).size===3);
    const rows=list(monthly.rows,24),source=row(monthly.source);
    ensure(typeof source.observedAt==='string' && financialInstant(source.observedAt)<=financialInstant(financial.data.recordedAt));
    for(const m of selected)monthlyFacts.push({metric:'monthlyConsolidatedRevenue',period:m.month,periodKind:'month',unit:'TWD',value:number(m.revenueTwd),status:'reported_attributed_relay',signConvention:'positive_revenue',
      locator:{file:financial.file.path,fileSha256:financial.file.sha256,jsonPointer:`/monthlyRevenue/rows/${rows.indexOf(m)}/revenueTwd`},
      source:{url:source.url,rawSha256:source.sha256,attemptedAt:source.attemptedAt,rawObservedAt:source.observedAt,extractionRecordedAt:financial.data.recordedAt,
        publication:{precision:'date_without_verified_zone',value:monthly.documentProducedDate??source.documentProducedDate??null}},roundingInterval:null,locallyReadAt:now});
    q3=selected.reduce((n,r)=>n+number(r.revenueTwd),0)/1e6;
    monthlyBridge={metric:'q3MonthlyRevenueAnchor',period:'2026Q3',periodKind:'quarter_monthly_sum',unit:'TWD_million',value:q3,status:'derived_not_reported_q3_income_statement',
      formula:'sum(reported July, August, September TWD) / 1000000',conversionDivisor:1000000,operands:monthlyFacts.map(m=>m.locator),namedOperands:monthlyFacts.map(m=>({name:`reportedMonthlyRevenue:${m.period}`,value:m.value,unit:m.unit,locator:m.locator,source:m.source})),roundingInterval:null,
      reconciliation:'preliminary monthly totals differ from quarterly reported revenue; unresolved differences retained, no forced adjustment or EPS inferred',historicalReconciliation:monthly.reconciliation};
  }
  ensure(reportedFacts.length+monthlyFacts.length+1<=64);
  const scenarios=list(model.scenarios,3).map((s,i)=>{
    const scenario=row(s),a=row(scenario.assumptions);ensure(scenario.id===['bear','base','bull'][i]);
    const growth=list(a.growth,5);ensure(growth.length===5);
    let previous = symbol==='2409'?q2Segments.map((n,j)=>n*number(list(a.q3Weights,4)[j])):[q3];
    if(symbol==='2409'){const scale=q3/previous.reduce((n,x)=>n+x,0);previous=previous.map(n=>n*scale);}
    const quarters=PERIODS.map((period,index)=>{
      if(index)previous=previous.map((n,j)=>n*(1+number(symbol==='2409'?list(growth[index-1],4)[j]:growth[index-1])));
      const common={period,shares:{openingOrdinaryMillion:ordinary,issuedOrdinaryMillion:0,fractionOutstanding:0,potentialAwardsMillion:period.startsWith('2027')?ordinary*number(a[symbol==='2409'?'potentialSharesRatio':'potentialRatio']):0},taxRate:number(a.taxRate),taxFloor:symbol==='2409'?number(a.taxFloor):0,nci:number(a.nci)};
      return symbol==='2409'?{...common,segments:SEGMENTS.map((key,j)=>({key,revenue:previous[j],grossMargin:number(list(a.grossMargins,4)[j])+index*number(a.quarterMarginStep),operatingMargin:number(list(a.opMargins,4)[j])+index*number(a.quarterMarginStep)})),interestIncome:number(a.interestIncome),financeCosts:number(a.financeCosts),otherIncome:number(a.otherIncome),equityMethodProfit:number(a.equityMethodProfit),fxAndOtherRecurring:number(a.fxAndOtherRecurring)}
        :{...common,revenue:previous[0],grossMargin:number(a.grossMargin)+index*number(a.marginStep),opexRatio:number(a.opexRatio),bankInterest:number(a.bankInterest),financeCost:number(a.financeCost),fx:number(a.fx),otherGainsExFx:number(a.otherGainsExFx)};
    });
    return {id:scenario.id,quarters};
  });
  const projected={schemaVersion:'business-scenarios-v2',calculatorId:symbol==='2409'?'auo_four_segment_v1':'emc_ccl_v1',symbol,unit:'TWD_million',originalModelCutoff:model.asOf,researchCutoff:now,latestReportedQuarter:'2026Q2',
    observations:manifest.map(p=>{const artifact=row(files.get(p.file)?.value);const floor=artifact.recordedAt??artifact.observedAt??artifact.completedAt??artifact.latestRelayRecordAt??artifact.dataCutoffObservation??(Array.isArray(artifact.sourceLedger)?artifact.sourceLedger.map(x=>row(x).observedAt).filter(x=>typeof x==='string').sort((a,b)=>financialInstant(a as string)<financialInstant(b as string)?-1:1).at(-1):undefined);ensure(typeof floor==='string'&&financialInstant(floor)<=financialInstant(now));return {sourceArtifactHash:p.sha256,observationHash:hash({p,originalAvailabilityFloor:floor}),observedAt:floor,admittedAt:now,publication:{precision:'unknown',value:null}};}),scenarios};
  const projection={projected,reportedFacts,monthlyFacts,monthlyBridge,selectionOmissions:['selling/admin/R&D expense detail (group total retained)','H1 reported EPS detail (Q2 basic/diluted and share basis retained)'],assumptionProvenance:{file:modelFile,fileSha256:pins[0].sha256,jsonPointers:['/scenarios/0/assumptions','/scenarios/1/assumptions','/scenarios/2/assumptions'],status:'manual_research_assumptions_not_reported_forecasts'},
    allocationDiscrepancies:symbol==='2409'?financial.data.segmentComparability:null,
    originalModelCanonicalHash:canonicalHash,rawModel:{sha256:pins[0].sha256,bytes:pins[0].bytes},sourceManifest:manifest,sourceManifestHash:hash(manifest),
    clocks:{originalModelCutoff:model.asOf,financialRecordedAt:financial.data.recordedAt,shareNotesRecordedAt:notes.data.recordedAt,currentLocalReadKnownAt:now,databaseFinancialAdmissionAt:null},
    gaps:['reported_2026_ytd_plus_forecast_bridge_incomplete','no_normalized_earnings_verification','capacity_yield_asp_orders_not_quantifiable','no_complete_2025_segment_recast','no_verified_future_share_count'],
    observationsClockMeaning:'observedAt retains original artifact availability floor; admittedAt is current local in-memory acceptance only, not DB admission; monthly facts retain original source precision/clocks separately'};
  assertFinancialJsonBytes(projection,FINANCIAL_READ_LIMITS.projection);return projection;
}
export async function loadResearchFinancialSupplement(db:Pick<SupabaseClient,'rpc'>,input:FinancialSupplementRequest,
  root=path.resolve(process.cwd(),'..'), sharedDeadline?:FinancialDeadline): Promise<Row> {
  const deadline=sharedDeadline??new FinancialDeadline();let files:Awaited<ReturnType<typeof readPinnedFinancialFiles>>|undefined;
  const check=async()=>{
    const result=await deadline.wait(db.rpc('assert_research_input_preparation_v2',{p_request:input.request,p_preparation_id:input.preparationId,p_input_hash:input.preparationInputHash}).abortSignal(deadline.controller.signal));
    ensure(!result.error);const saved=row(result.data),payload=row(saved.payload);
    ensure(saved.preparation_id===input.preparationId&&saved.input_hash===input.preparationInputHash&&saved.replay===true&&saved.dispatchReady===false
      && hash(payload)===input.preparationInputHash && hash(saved.request)===hash(input.request)
      && saved.job_id===input.request.jobId&&saved.attempt===input.request.attempt&&saved.reservation_id===input.request.reservationId
      && payload.scope===input.request.scope&&payload.snapshotHash===input.request.snapshotHash&&payload.modelDispatched===false);
    return saved;
  };
  try{
    const before=await check(),payload=row(before.payload),symbol=payload.symbol;
    if(symbol!=='2409'&&symbol!=='2383'){
      const after=await check();ensure(hash(before)===hash(after));deadline.check();
      return {status:'unavailable',reason:'fixed_company_calculator_not_available',symbol,preparationId:input.preparationId,preparationInputHash:input.preparationInputHash,dispatchReady:false,financialVerified:false,modelDispatched:false,publishableResearch:false,researchQualified:false,strategyApproved:false,entryEligible:false};
    }
    files=await readPinnedFinancialFiles(root,inventory.companies[symbol],deadline);
    const now=new Date().toISOString(),projection=project(symbol,files.records,now);deadline.check();
    const calculation=recalculateResearchBusinessScenarios(projection.projected,now);deadline.check();
    const result={schemaVersion:'research-financial-supplement-v1',status:'unsealed_calculation_only',preparationId:input.preparationId,preparationInputHash:input.preparationInputHash,
      preparationAdmittedAt:before.admitted_at,originalScope:payload.scope,originalSnapshotHash:payload.snapshotHash,
      projection,projectionHash:hash(projection),assumptionsHash:hash(projection.projected.scenarios),calculation,
      calculatorExecutionHash:hash({core:businessCalculatorExecutionHash(),reader:financialReaderExecutionIdentity(),adapter:[ensure,row,list,number,canonical,hash,assertFinancialJsonBytes,parseFinancialSupplementRequest,project,loadResearchFinancialSupplement].map(f=>f.toString()),node:process.version,periods:PERIODS,segments:SEGMENTS,inventoryHash:hash(inventory)}),
      financialVerified:false,dispatchReady:false,modelDispatched:false,publishableResearch:false,researchQualified:false,strategyApproved:false,entryEligible:false};
    const complete = {...result,supplementHash:hash(result)};assertFinancialJsonBytes(complete,FINANCIAL_READ_LIMITS.result);await files.validate();const after=await check();ensure(hash(before)===hash(after));await files.validate();deadline.check();
    await files.close();deadline.check();return complete;
  }catch(error){if(files)await files.fail(error);throw error;}finally{if(!sharedDeadline)deadline.controller.abort();}
}
