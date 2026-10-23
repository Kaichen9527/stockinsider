/** Finite original-body adapter, not a descriptor/permission authority. The
 * current server reader must reparse the same complete original, source hash,
 * issuer, manifest and use permission. No filesystem/network/model owner. */
import {inputHash} from './policy.ts';
import {isDeepStrictEqual} from 'node:util';
import {assertWorkerJsonCodec} from './worker-output.ts';
import type {Evidence} from './research.ts';
type Row=Record<string,unknown>;
const labels={profile:'數值預測口徑',symbol:'股票代號',yearStartMonth:'會計年度起始月',yearLabel:'財年標示',kind:'預測期間類型',shareBasis:'預測股數基礎',shares:'預測固定股數',sharesStart:'股數假設開始日期',sharesEnd:'股數假設結束日期',sharesAssumption:'期間股數假設',incomeUnit:'預估淨利單位',incomeScope:'預估淨利歸屬'} as const;
type Span={startCp:number;endCp:number;quote:string};
export type FiscalForecastOriginal={schemaVersion:'vnext-disclosed-fiscal-forecast-v1';symbol:string;kind:'annual'|'four_quarters';yearStartMonth:number;yearLabel:'starting_year';shareBasis:'basic'|'diluted';shares:string;sharesStart:string;sharesEnd:string;sharesAssumption:'source_disclosed_fixed_forecast_denominator';rows:{year:number;quarter:number|null;start:string;end:string;commonIncome:string}[];spans:Record<string,Span>};
const fail=(s:string):never=>{throw Error('vnext_fiscal_'+s);};
const object=(x:unknown):x is Row=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const closed=(x:Row,k:string)=>Object.keys(x).sort().join('|')===k.split(' ').sort().join('|');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u,sha=/^[a-f0-9]{64}$/u;
function civil(s:string){return /^\d{4}-\d{2}-\d{2}$/u.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
const day=(d:Date)=>d.toISOString().slice(0,10);
function period(year:number,quarter:number,month:number){const start=new Date(Date.UTC(year,month-1+(quarter-1)*3,1));return {start:day(start),end:day(new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+3,0)))};}
function micros(s:string){if(!/^-?(0|[1-9]\d{0,13})(?:\.\d{1,6})?$/u.test(s)||s==='-0')fail('income_decimal');const negative=s.startsWith('-'),[a,b='']=s.replace(/^-/u,'').split('.');return BigInt(a)*BigInt(1000000)*(negative?BigInt(-1):BigInt(1))+BigInt(b.padEnd(6,'0'))*(negative?BigInt(-1):BigInt(1));}
function decimal(v:bigint){const sign=v<BigInt(0)?'-':'',n=v<BigInt(0)?-v:v;return sign+(n/BigInt(1000000)).toString()+((n%BigInt(1000000))?'.'+(n%BigInt(1000000)).toString().padStart(6,'0').replace(/0+$/u,''):'');}
/** All named fields and one/four explicit common-income rows must exist in the
 * original. Absence is a gap, never a Jan1 calendar or historical share default.
 * Example row: 預估列: 2027|1|2027-01-01|2027-03-31|1000000 */
export function extractDisclosedFiscalForecast(body:string):FiscalForecastOriginal{
 if(typeof body!=='string'||Buffer.byteLength(body)>307200||body!==body.normalize('NFKC')||/[\r\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(body))fail('original_body_bound');
 const values:Record<string,string>={},spans:Record<string,Span>={},rows:FiscalForecastOriginal['rows']=[];let offset=0;
 for(const line of body.split('\n')){
  for(const [field,label]of Object.entries(labels))if(line.startsWith(label+':')){if(field in values||!line.startsWith(label+': ')||line!==line.trimEnd())fail('field_duplicate_or_syntax');values[field]=line.slice(label.length+2);spans[field]={startCp:offset,endCp:offset+[...line].length,quote:line};}
  if(line.startsWith('預估列:')){
   if(!line.startsWith('預估列: ')||rows.length>=4||line!==line.trimEnd())fail('row_bound');
   const p=line.slice(5).split('|');if(p.length!==5||!/^\d{4}$/u.test(p[0])||!/^([1-4]|A)$/u.test(p[1])||!civil(p[2])||!civil(p[3]))fail('row_shape');
   const income=decimal(micros(p[4]));rows.push({year:Number(p[0]),quarter:p[1]==='A'?null:Number(p[1]),start:p[2],end:p[3],commonIncome:income});spans['row'+rows.length]={startCp:offset,endCp:offset+[...line].length,quote:line};
  }
  offset+=[...line].length+1;
 }
 if(Object.keys(values).length!==Object.keys(labels).length||values.profile!=='財年固定股數v1'||!/^\d{4}$/u.test(values.symbol)||!/^([1-9]|1[0-2])$/u.test(values.yearStartMonth)||values.yearLabel!=='起始年'||!['全年度','未來四季'].includes(values.kind)||!['基本','稀釋'].includes(values.shareBasis)||!/^([1-9]\d{0,11})$/u.test(values.shares)||!civil(values.sharesStart)||!civil(values.sharesEnd)||values.sharesStart>values.sharesEnd||values.sharesAssumption!=='明示預測期間固定股數'||values.incomeUnit!=='TWD'||values.incomeScope!=='普通股股東')fail('explicit_calendar_share_basis_missing');
 const kind=values.kind==='全年度'?'annual':'four_quarters',month=Number(values.yearStartMonth);
 if(rows.length!==(kind==='annual'?1:4))fail('complete_period_vector_required');
 for(const [i,r]of rows.entries()){
  if(r.year<1900||r.year>2199||kind==='annual'&&r.quarter!==null||kind==='four_quarters'&&r.quarter===null)fail('period_classification');
  const expected=period(r.year,r.quarter||1,month),end=kind==='annual'?period(r.year,4,month).end:expected.end;
  if(r.start!==expected.start||r.end!==end||i>0&&day(new Date(Date.parse(rows[i-1].end)+86400000))!==r.start||r.start<values.sharesStart||r.end>values.sharesEnd)fail('calendar_or_fixed_share_period_mismatch');
 }
 return {schemaVersion:'vnext-disclosed-fiscal-forecast-v1',symbol:values.symbol,kind,yearStartMonth:month,yearLabel:'starting_year',shareBasis:values.shareBasis==='基本'?'basic':'diluted',shares:values.shares,sharesStart:values.sharesStart,sharesEnd:values.sharesEnd,sharesAssumption:'source_disclosed_fixed_forecast_denominator',rows,spans};
}
/** Exact common-income / explicitly fixed forecast share denominator. A source
 * forecast stays an assumption even when all its operands are disclosed. */
export function calculateDisclosedFiscalForecast(parsed:FiscalForecastOriginal,cutoff:string){
 if(!Number.isFinite(Date.parse(cutoff)))fail('cutoff');const cutoffDay=day(new Date(Date.parse(cutoff)+8*3600000));const first=parsed.rows[0],last=parsed.rows.at(-1)!;
 if(parsed.kind==='annual'){
  if(last.end<cutoffDay||first.start>`${Number(cutoffDay.slice(0,4))+1}-12-31`)fail('annual_not_current_or_next');
 }else{
  const previousStart=day(new Date(Date.UTC(Number(first.start.slice(0,4)),Number(first.start.slice(5,7))-4,1)));
  if(first.start<=cutoffDay||cutoffDay<previousStart)fail('not_next_wholly_future_four_quarters');
 }
 const numerator=parsed.rows.reduce((n,r)=>n+micros(r.commonIncome),BigInt(0)),denominator=BigInt(parsed.shares);
 if(numerator%denominator!==BigInt(0))fail('exact_eps_decimal_unavailable');
 const exact=decimal(numerator/denominator),value=Number(exact);assertWorkerJsonCodec(value);if(String(value)!==exact)fail('eps_js_codec_unavailable');
 const key=parsed.kind==='annual'?'source_annual_forecast_eps':parsed.yearStartMonth===1?'next_four_quarter_eps':'source_next_four_fiscal_quarter_eps';
 const periodValue=key==='next_four_quarter_eps'?`${first.year}-Q${first.quarter}/${last.year}-Q${last.quarter}`:`${first.start}/${last.end}`;
 return {key,value,unit:'TWD_per_share' as const,period:periodValue,periodStart:first.start,periodEnd:last.end,numeratorCommonIncome:decimal(numerator),denominatorShares:parsed.shares,shareBasis:parsed.shareBasis,reported:false as const};
}
export type FiscalForecastSource={stockId:string;symbol:string;verificationId:string;revisionId:string;sourceHash:string;publisherAuthorityId:string;sourceAuthorityId:string;policyId:string;manifestHash:string;source:string;publishedAt:string;knownAt:string};
/** Called by the current reader projection; pure construction is NOT authority. */
export function fiscalForecastEvidence(body:string,source:FiscalForecastSource,cutoff:string){
 const parsed=extractDisclosedFiscalForecast(body);if(parsed.symbol!==source.symbol)fail('issuer_crosswire');const calc=calculateDisclosedFiscalForecast(parsed,cutoff);
 const core={schemaVersion:'vnext-fiscal-forecast-receipt-v1',stockId:source.stockId,symbol:source.symbol,classification:'source_disclosed_forecast_assumption_not_reported',verificationId:source.verificationId,revisionId:source.revisionId,sourceHash:source.sourceHash,bodyHash:inputHash(body),publisherAuthorityId:source.publisherAuthorityId,sourceAuthorityId:source.sourceAuthorityId,policyId:source.policyId,manifestHash:source.manifestHash,parsed,calculation:calc};
 const base={source:source.source,sourceTier:'public' as const,kind:'assumption' as const,eventAt:source.publishedAt,availableAt:source.knownAt};
 const evidence:Evidence[]=[{...base,id:`fiscal-forecast:${source.policyId}:${source.verificationId}:eps`,key:calc.key,value:calc.value,unit:calc.unit,period:calc.period,contentHash:inputHash({...core,entryRole:'eps'})},{...base,id:`fiscal-forecast:${source.policyId}:${source.verificationId}:original`,key:'fiscal_forecast_original',value:{schemaVersion:'vnext-fiscal-forecast-original-v1',statement:body},period:`${calc.periodStart}/${calc.periodEnd}`,contentHash:inputHash({...core,entryRole:'original'})}];
 return {evidence,receipts:evidence.map((e,i)=>({...core,entryRole:i===0?'eps':'original',evidenceHash:inputHash(e)}))};
}
/** Rebuild each complete numeric/original pair, not a trusted boolean/hash-only
 * receipt. Fresh SQL authorization remains necessary at every use. */
export function validateFiscalForecastPairs(evidence:unknown[],receipts:unknown[],scope:{stockId:string;symbol:string;asOf:string}){
 if(Buffer.byteLength(JSON.stringify({evidence,receipts}))>1048576)fail('current_wire_bound');assertWorkerJsonCodec({evidence,receipts});
 const selected=evidence.map((e,i)=>({e,r:receipts[i]})).filter(({e})=>object(e)&&String(e.id).startsWith('fiscal-forecast:'));
 const seen=new Set<string>();
 for(const {e,r}of selected){
  if(!object(e)||!object(r)||!closed(r,'schemaVersion stockId symbol classification verificationId revisionId sourceHash bodyHash publisherAuthorityId sourceAuthorityId policyId manifestHash parsed calculation entryRole evidenceHash')||r.schemaVersion!=='vnext-fiscal-forecast-receipt-v1'||r.stockId!==scope.stockId||r.symbol!==scope.symbol||r.classification!=='source_disclosed_forecast_assumption_not_reported'||!['verificationId','revisionId','publisherAuthorityId','sourceAuthorityId','policyId'].every(k=>typeof r[k]==='string'&&uuid.test(r[k] as string))||!['sourceHash','bodyHash','manifestHash','evidenceHash'].every(k=>typeof r[k]==='string'&&sha.test(r[k] as string))||!['eps','original'].includes(String(r.entryRole))||seen.has(String(e.id)))return fail('current_receipt_shape');
  seen.add(String(e.id));if(r.entryRole!=='original')continue;
  if(!object(e.value)||!closed(e.value,'schemaVersion statement')||e.value.schemaVersion!=='vnext-fiscal-forecast-original-v1'||typeof e.value.statement!=='string'||inputHash(e.value.statement)!==r.bodyHash)return fail('current_original_missing');
  if(typeof e.source!=='string'||typeof e.eventAt!=='string'||typeof e.availableAt!=='string')return fail('current_clocks');const url=new URL(e.source);
  if(url.protocol!=='https:'||!['mops.twse.com.tw','mopsov.twse.com.tw'].includes(url.hostname)||url.username||url.password||url.port||url.search||url.hash||/(paid|member|premium|subscription|login|authenticate|telegram|investanchors|\.invalid|\.local|localhost)/iu.test(e.source)||!Number.isFinite(Date.parse(e.eventAt))||!Number.isFinite(Date.parse(e.availableAt))||Date.parse(e.eventAt)>Date.parse(e.availableAt)||Date.parse(e.availableAt)>Date.parse(scope.asOf)||Date.parse(scope.asOf)-Date.parse(e.eventAt)>90*86400000)fail('current_source_or_clocks');
  const expected=fiscalForecastEvidence(e.value.statement,{stockId:scope.stockId,symbol:scope.symbol,verificationId:r.verificationId as string,revisionId:r.revisionId as string,sourceHash:r.sourceHash as string,publisherAuthorityId:r.publisherAuthorityId as string,sourceAuthorityId:r.sourceAuthorityId as string,policyId:r.policyId as string,manifestHash:r.manifestHash as string,source:e.source,publishedAt:e.eventAt,knownAt:e.availableAt},scope.asOf);
  for(let i=0;i<2;i++){const actual=selected.filter(v=>object(v.e)&&v.e.id===expected.evidence[i].id);if(actual.length!==1||!isDeepStrictEqual(actual[0].e,expected.evidence[i])||!isDeepStrictEqual(actual[0].r,expected.receipts[i]))fail('current_pair_or_calculation_drift');}
 }
 if(selected.filter(({r})=>object(r)&&r.entryRole==='original').length*2!==selected.length)fail('current_pair_missing');
}
