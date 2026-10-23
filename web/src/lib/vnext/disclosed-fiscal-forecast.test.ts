/** Synthetic original disclosures/current DB transport, not acquired guidance,
 * native SQL, a real provider or independent semantic review. */
import test from 'node:test';import assert from 'node:assert/strict';
import {extractDisclosedFiscalForecast,calculateDisclosedFiscalForecast,fiscalForecastEvidence} from './disclosed-fiscal-forecast.ts';
import {readCurrentForecasts,validateCurrentForecasts} from './forecast-current.ts';
import {freezeFinancialPreparation} from './preparation-reconciliation.ts';
import {normalizeWorkerAuthor,normalizeWorkerReview} from './worker-output.ts';
import {inputHash} from './policy.ts';import {REQUIRED_SECTIONS} from './research.ts';
const at='2026-10-23T01:00:00.000Z',id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const header='Synthetic engineering original, not actual MOPS guidance.\n😀 complete original context\n數值預測口徑: 財年固定股數v1\n股票代號: 2409\n會計年度起始月: 1\n財年標示: 起始年\n預測期間類型: 未來四季\n預測股數基礎: 稀釋\n預測固定股數: 1000\n股數假設開始日期: 2027-01-01\n股數假設結束日期: 2027-12-31\n期間股數假設: 明示預測期間固定股數\n預估淨利單位: TWD\n預估淨利歸屬: 普通股股東';
const rows=['2027|1|2027-01-01|2027-03-31|1000','2027|2|2027-04-01|2027-06-30|2000','2027|3|2027-07-01|2027-09-30|-1000','2027|4|2027-10-01|2027-12-31|3000'];
const body=header+'\n'+rows.map(r=>'預估列: '+r).join('\n');
const source={stockId:id(1),symbol:'2409',verificationId:id(2),revisionId:id(3),sourceHash:'a'.repeat(64),publisherAuthorityId:id(4),sourceAuthorityId:id(5),policyId:id(6),manifestHash:'b'.repeat(64),source:'https://mops.twse.com.tw/public-guidance',publishedAt:'2026-10-22T01:00:00.000Z',knownAt:at};
function current(original=body){return {schemaVersion:'vnext-current-forecasts-v1',stockId:source.stockId,symbol:source.symbol,asOf:at,...fiscalForecastEvidence(original,source,at),gaps:[]};}
test('actual original producer binds calendar/fixed shares/four exact common-income periods with Unicode spans',()=>{
 const p=extractDisclosedFiscalForecast(body),c=calculateDisclosedFiscalForecast(p,at);assert.equal(p.shares,'1000');assert.equal(c.value,5);assert.equal(c.numeratorCommonIncome,'5000');assert.equal(c.key,'next_four_quarter_eps');assert.equal(c.period,'2027-Q1/2027-Q4');assert.equal(c.reported,false);
 for(const span of Object.values(p.spans))assert.equal([...body].slice(span.startCp,span.endCp).join(''),span.quote);
});
test('annual forecast is an assumption with explicit full year; never reported annual EPS',()=>{
 const annual=header.replace('未來四季','全年度')+'\n預估列: 2027|A|2027-01-01|2027-12-31|10000';const c=calculateDisclosedFiscalForecast(extractDisclosedFiscalForecast(annual),at);assert.equal(c.value,10);assert.equal(c.key,'source_annual_forecast_eps');assert.equal(c.period,'2027-01-01/2027-12-31');assert.equal(current(annual).evidence[0].kind,'assumption');
});
test('non-January fiscal calendar works without mislabelling fiscal quarters as calendar-quarter summary',()=>{
 const original=header.replace('起始月: 1','起始月: 7')+'\n'+['2026|3|2027-01-01|2027-03-31|1000','2026|4|2027-04-01|2027-06-30|2000','2027|1|2027-07-01|2027-09-30|-1000','2027|2|2027-10-01|2027-12-31|3000'].map(r=>'預估列: '+r).join('\n');
 const c=calculateDisclosedFiscalForecast(extractDisclosedFiscalForecast(original),at);assert.equal(c.value,5);assert.equal(c.key,'source_next_four_fiscal_quarter_eps');assert.equal(c.period,'2027-01-01/2027-12-31');
});
test('missing/duplicate calendar or share terms, denominator inference, wrong unit/owner and missing or disordered periods reject',()=>{
 for(const s of [body.replace('會計年度起始月: 1\n',''),body+'\n預測固定股數: 1000',body.replace('明示預測期間固定股數','歷史股數不變'),body.replace('淨利單位: TWD','淨利單位: thousand_TWD'),body.replace('普通股股東','母公司所有股東'),body.replace('預估列: '+rows[3],''),header+'\n'+[rows[1],rows[0],...rows.slice(2)].map(r=>'預估列: '+r).join('\n'),body.replace('2027-03-31','2027-04-01'),body.replace('預測期間類型: 未來四季','預測期間類型: NTM'),body.replace('股數假設結束日期: 2027-12-31','股數假設結束日期: 2027-09-30')])assert.throws(()=>extractDisclosedFiscalForecast(s),/vnext_fiscal/);
});
test('exact division, losses, leap year and next-future-quarter restriction are deterministic',()=>{
 assert.throws(()=>calculateDisclosedFiscalForecast(extractDisclosedFiscalForecast(body.replace('股數: 1000','股數: 3000')),at),/exact_eps_decimal/);
 assert.throws(()=>calculateDisclosedFiscalForecast(extractDisclosedFiscalForecast(body),'2027-01-01T00:00:00Z'),/not_next/);
 const annual=header.replace('未來四季','全年度').replaceAll('2027','2028')+'\n預估列: 2028|A|2028-01-01|2028-12-31|-10000';assert.equal(calculateDisclosedFiscalForecast(extractDisclosedFiscalForecast(annual),'2027-10-23T00:00:00Z').value,-10);
});
test('current read reconstructs full original and immutable receipt/calculation; no caller schema or trusted descriptor',async()=>{
 const data=current(),before=JSON.stringify(data),calls:unknown[]=[];const result=await readCurrentForecasts({rpc:async(name:string,args:unknown)=>{calls.push({name,args});return {data,error:null};}} as unknown as Parameters<typeof readCurrentForecasts>[0],{role:'author',principal:'synthetic-configured-author'},id(7),id(8));
 assert.equal(result.evidence[0].value,5);assert.equal((result.evidence[1].value as {statement:string}).statement,body);assert.equal(JSON.stringify(data),before);assert.deepEqual(calls,[{name:'vnext_forecast_read_v1',args:{p_principal:'synthetic-configured-author',p_job:id(7),p_execution:id(8)}}]);
});
test('hash-correct scalar/receipt tampering, missing original, classification, source, issuer and clocks still reject',()=>{
 for(const change of [(f:ReturnType<typeof current>)=>{f.evidence[0].value=6;f.receipts[0].evidenceHash=inputHash(f.evidence[0]);},(f:ReturnType<typeof current>)=>{f.evidence.pop();f.receipts.pop();},(f:ReturnType<typeof current>)=>{f.receipts[0].parsed.shares='2000';},(f:ReturnType<typeof current>)=>{Object.assign(f.receipts[0],{approved:true});},(f:ReturnType<typeof current>)=>{f.evidence[0].kind='fact';},(f:ReturnType<typeof current>)=>{f.evidence[0].unit='TWD';},(f:ReturnType<typeof current>)=>{f.evidence[1].source='https://example.com/other';},(f:ReturnType<typeof current>)=>{f.symbol='2383';},(f:ReturnType<typeof current>)=>{f.evidence[1].availableAt='2099-01-01T00:00:00Z';}]){const f=current();change(f);assert.throws(()=>validateCurrentForecasts(f));}
});
test('actual preparation and author/distinct-review contract consume full original plus exact four-quarter calculation, not reported annual',()=>{
 const f=validateCurrentForecasts(current()),original={hash:inputHash('admission'),evidence:[],gaps:[]};const history={notEntryAuthority:true as const,nextSessionAuthority:false as const,completedSessions:[],bars:[],priceBasis:null,sourceDatasetRevision:'synthetic',availableAt:at,missingData:['synthetic_price_gap']},financial={evidence:[],receipts:[],deferredCount:0,deferredDigest:inputHash([]),deferredDetails:[],deferredDetailsTruncated:false,gaps:[]};
 const frozen=freezeFinancialPreparation(original,history,financial,at,f);assert.deepEqual(frozen.evidence.forecastSourceReceipts,f.receipts);assert.equal(frozen.inputHash,inputHash(frozen.evidence));
 const ids=f.evidence.map(e=>e.id),claim={id:'forward-four',kind:'assumption' as const,text:'Synthetic source explicitly assumes1000 forecast shares and projects common-income5000 for four exact future calendar quarters; not reported earnings.',evidenceIds:ids,numeric:{key:'next_four_quarter_eps',value:5,unit:'TWD_per_share',period:'2027-Q1/2027-Q4'}};
 const raw={sections:Object.fromEntries(REQUIRED_SECTIONS.map(k=>[k,{text:'Synthetic engineering forecast; complete original, exact periods and explicitly disclosed denominator retained. No actual provider or formal semantic approval.',claimIds:[claim.id],evidenceIds:ids}])),claims:[claim],quoteDate:'2026-10-22',valuationDate:'2026-10-22',annualEps:null,nextFourQuarterEps:5,gaps:['annual_eps_missing','quote_authority_missing']};
 const a=normalizeWorkerAuthor(raw,{model:'synthetic-author',modelVersion:'contract'},frozen.inputHash,f.evidence),review={approved:true,findings:[],factsChecked:true,valuationChecked:true,claimsChecked:true,claimChecks:[{claimId:claim.id,verdict:'supported',reason:'Synthetic distinct-review contract reads complete original; not actual independent semantic approval.',sources:f.evidence.map(e=>({id:e.id,contentHash:e.contentHash}))}]};assert.equal(normalizeWorkerReview(review,'synthetic-distinct-reviewer',a,f.evidence).approved,true);assert.throws(()=>normalizeWorkerAuthor({...raw,annualEps:5},{model:'synthetic',modelVersion:'contract'},frozen.inputHash,f.evidence),/annual_eps_summary_unbound/);
});
test('the same receive byte/depth caps and current public-source restriction are retained',()=>{
 const huge=current();(huge.evidence[1].value as {statement:string}).statement='x'.repeat(1048577);assert.throws(()=>validateCurrentForecasts(huge),/wire_bound/);
 const deep=current();let nested:unknown=1;for(let i=0;i<14;i++)nested={item:nested};Object.assign(deep.receipts[0],{unexpected:nested});assert.throws(()=>validateCurrentForecasts(deep),/json_depth/);
 for(const path of ['paid/member-guidance','login','subscription-guidance']){const f=current();f.evidence[1].source='https://mops.twse.com.tw/'+path;assert.throws(()=>validateCurrentForecasts(f),/current_source_or_clocks/);}
});
test('unknown metadata is refused even when the material hash intentionally ignores its key',()=>{
 for(const key of ['fetchedAt','collectedAt','retrievedAt','evaluatedAt'])for(const target of ['evidence','parsed','calculation']){
  const f=current(),value=target==='evidence'?f.evidence[0]:target==='parsed'?f.receipts[0].parsed:f.receipts[0].calculation,before=inputHash(value);Object.assign(value,{[key]:'UNKNOWN_UNTRUSTED_METADATA'});assert.equal(inputHash(value),before);assert.throws(()=>validateCurrentForecasts(f),/current_pair_or_calculation_drift/);
 }
});
