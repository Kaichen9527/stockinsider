import {isDeepStrictEqual} from 'node:util';
import {inputHash} from './policy.ts';
import {assertWorkerJsonCodec} from './worker-output.ts';
type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Row,s:string)=>Object.keys(v).sort().join('|')===s.split(' ').sort().join('|');
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(v);
const civil=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
function fail():never{throw Error('vnext_published_target_assessment_invalid');}
export type TargetAssessment={schemaVersion:'vnext-published-target-assessment-v1';symbol:string;revisionId:string;inputHash:string;outputHash:string;publishedAt:string;observedAt:string;result:Row};
/** Public READ transport validation only. The existing SQL current-target routine
 * verifies the persisted preparation, two distinct executions, current original
 * rights, market interval and latest revision. No client Boolean grants that
 * authority. This observation cannot be submitted as an exit/publication proof. */
export function validatePublishedTargetAssessment(value:unknown,published:unknown,symbol:string,now:string):TargetAssessment{
 if(Buffer.byteLength(JSON.stringify(value)??'null')>1048576)fail();assertWorkerJsonCodec(value);
 if(!row(value)||!keys(value,'schemaVersion symbol revisionId inputHash outputHash publishedAt observedAt result')||value.schemaVersion!=='vnext-published-target-assessment-v1'||value.symbol!==symbol||!/^\d{4}$/u.test(symbol)||!uuid(value.revisionId)||!hash(value.inputHash)||!hash(value.outputHash)||!row(published)||!row(published.content)||published.revisionId!==value.revisionId||published.inputHash!==value.inputHash||published.content.inputHash!==value.inputHash||published.content.outputHash!==value.outputHash||value.outputHash!==inputHash({...published.content,outputHash:undefined})||typeof value.publishedAt!=='string'||typeof published.publishedAt!=='string'||Date.parse(value.publishedAt)!==Date.parse(published.publishedAt)||typeof value.observedAt!=='string'||![now,value.observedAt,value.publishedAt].every(v=>Number.isFinite(Date.parse(v)))||Date.parse(value.publishedAt)>Date.parse(value.observedAt)||Date.parse(value.observedAt)>Date.parse(now)||Date.parse(now)-Date.parse(value.observedAt)>10000||!row(value.result))fail();
 const result=value.result;
 if(result.status==='deferred'){
  if(!keys(result,'status reason')||typeof result.reason!=='string'||!/^target_[a-z_]{1,110}$/u.test(result.reason))fail();
  return structuredClone(value) as TargetAssessment;
 }
 if(!['at_target','below_target'].includes(String(result.status))||!keys(result,'status originalBaseline rebasing currentPrice')||!row(result.originalBaseline)||!keys(result.originalBaseline,'base bear bull unit quoteAt')||!row(result.currentPrice)||!keys(result.currentPrice,'value session observationId'))fail();
 const baseline=result.originalBaseline,price=result.currentPrice,content=published.content;
 if(!Array.isArray(content.claims)||!civil(baseline.quoteAt)||baseline.quoteAt!==content.quoteDate||!['TWD','TWD_per_share','TWD/share'].includes(String(baseline.unit))||![baseline.bear,baseline.base,baseline.bull,price.value].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)||!(Number(baseline.bear)<=Number(baseline.base)&&Number(baseline.base)<=Number(baseline.bull))||!civil(price.session)||String(price.session)<String(baseline.quoteAt)||!uuid(price.observationId))fail();
 for(const [name,key]of [['bear','valuation_bear'],['base','valuation_base'],['bull','valuation_bull']] as const){
  const matches=content.claims.filter(c=>row(c)&&row(c.numeric)&&c.numeric.key===key);
  if(matches.length!==1||!row(matches[0].numeric)||matches[0].numeric.value!==baseline[name]||!['TWD','TWD_per_share','TWD/share'].includes(String(matches[0].numeric.unit)))fail();
 }
 const originalPrice=content.claims.filter(c=>row(c)&&row(c.numeric)&&c.numeric.key==='current_price');
 if(originalPrice.length!==1||!row(originalPrice[0].numeric)||originalPrice[0].numeric.unit!==baseline.unit||originalPrice[0].numeric.period!==baseline.quoteAt||typeof originalPrice[0].numeric.value!=='number'||!Number.isFinite(originalPrice[0].numeric.value)||originalPrice[0].numeric.value<=0||String(price.session)>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value.observedAt)))fail();
 let base=Number(baseline.base);
 if(result.rebasing!==null){
  const r=result.rebasing;
  if(!row(r)||!keys(r,'schemaVersion symbol revisionId originalBaselineHash originalInputHash originalOutputHash original shareRatio rebased actionReceiptHashes receiptHash')||r.schemaVersion!=='vnext-per-share-target-rebase-v1'||r.symbol!==symbol||r.revisionId!==value.revisionId||r.originalInputHash!==value.inputHash||r.originalOutputHash!==value.outputHash||!isDeepStrictEqual(r.original,baseline)||r.originalBaselineHash!==inputHash({...baseline,inputHash:value.inputHash,outputHash:value.outputHash})||!row(r.shareRatio)||!keys(r.shareRatio,'numerator denominator')||!row(r.rebased)||!keys(r.rebased,'base bear bull unit')||r.rebased.unit!=='TWD_per_share'||!Array.isArray(r.actionReceiptHashes)||r.actionReceiptHashes.length<1||r.actionReceiptHashes.length>32||!r.actionReceiptHashes.every(hash)||new Set(r.actionReceiptHashes).size!==r.actionReceiptHashes.length)fail();
  const {receiptHash,...unsigned}=r;if(receiptHash!==inputHash(unsigned))fail();
  const numerator=r.shareRatio.numerator,denominator=r.shareRatio.denominator;
  if(typeof numerator!=='string'||typeof denominator!=='string'||! /^[1-9]\d{0,480}$/u.test(numerator)||! /^[1-9]\d{0,480}$/u.test(denominator))fail();
  const n=BigInt(numerator),d=BigInt(denominator);const gcd=(a:bigint,b:bigint):bigint=>b===BigInt(0)?a:gcd(b,a%b);
  if(gcd(n,d)!==BigInt(1)||n*BigInt(1000000)<d||n>d*BigInt(1000000))fail();
  for(const name of ['bear','base','bull'] as const){
   const parts=String(baseline[name]).split('.');if(!/^\d+$/u.test(parts[0])||(parts[1]||'').length>6)fail();
   const scaled=BigInt(parts[0]+(parts[1]||'').padEnd(6,'0'))*d;
   if(scaled%n!==BigInt(0)||scaled/n<BigInt(1)||scaled/n>=BigInt(10)**BigInt(27)||r.rebased[name]!==Number(scaled/n)/1e6)fail();
  }
  base=Number(r.rebased.base);
 }
 if((Number(price.value)>=base)!==(result.status==='at_target'))fail();
 return structuredClone(value) as TargetAssessment;
}
/** Only the fixed existing public read RPC. No mutation/retry/claim/FS/model.
 * Missing candidate on an older installation remains an explicitly absent
 * assessment; it never synthesizes a rebase from an untrusted cached artifact. */
export async function readPublishedStockTarget(client:{rpc:(name:string,args:Row)=>PromiseLike<{data:unknown;error:unknown}>},symbol:string){
 if(!/^\d{4}$/u.test(symbol))throw Error('vnext_published_symbol_invalid');
 const response=await client.rpc('vnext_read_v1',{p_symbol:symbol});
 if(response.error)throw Error('vnext_published_contract_unavailable');
 if(response.data===null)return null;
 if(!row(response.data)||response.data.symbol!==symbol||!Array.isArray(response.data.history))throw Error('vnext_published_contract_unavailable');
 const value=structuredClone(response.data);
 if(Object.hasOwn(value,'targetAssessment')&&value.targetAssessment!==null){
  const latest=(value.history as unknown[])[0];
  value.targetAssessment=validatePublishedTargetAssessment(value.targetAssessment,latest,symbol,new Date().toISOString());
 }
 return structuredClone(value);
}
