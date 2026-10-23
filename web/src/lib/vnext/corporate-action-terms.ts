import {inputHash} from './policy.ts';
import type {VnextIdentity} from './auth.ts';
import type {Evidence} from './research.ts';
type Row=Record<string,unknown>;
const object=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(r:Row,list:string)=>Object.keys(r).sort().join('|')===list.split(' ').sort().join('|');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const hash=/^[a-f0-9]{64}$/u;
const civil=(s:string)=>/^\d{4}-\d{2}-\d{2}$/u.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const taipeiDay=(at:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
export const ACTION_TERM_LABELS={symbol:'股票代號',effectiveOn:'生效日期',kind:'公司行動類型',oldShares:'換發前股數',newShares:'換發後股數',cashDividendPerOldShare:'每舊股現金股利',cashReturnPerOldShare:'每舊股退還現金',subscriptionCashPerOldShare:'每舊股認購價款',currency:'計價幣別'} as const;
const kindNames={'每股面額變更':'par_value_change','除權息':'ex_right_dividend','減資':'capital_reduction'} as const;
export type ActionTerms={oldShares:number;newShares:number;cashDividendPerOldShare:number;cashReturnPerOldShare:number;subscriptionCashPerOldShare:number;currency:'TWD'};
export type ParsedAction={symbol:string;effectiveOn:string;kind:'par_value_change'|'ex_right_dividend'|'capital_reduction';terms:ActionTerms;spans:Record<string,{startCp:number;endCp:number;quote:string}>};
/** Finite disclosed-line adapter, not an exchange-price-factor inference. Every
 * required label occurs once in the ORIGINAL body. Missing/alternative prose
 * is a named gap, never an inferred zero. No HTTP/model mapping is accepted. */
export function extractDisclosedActionTerms(body:unknown):ParsedAction{
 if(typeof body!=='string'||Buffer.byteLength(body)>307200||body.includes('\r')||body.normalize('NFKC')!==body||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(body))throw Error('action_original_body_unsupported');
 const spans:ParsedAction['spans']={},values:Record<string,string>={};let offset=0;
 for(const line of body.split('\n')){
  for(const [key,label] of Object.entries(ACTION_TERM_LABELS))if(line.startsWith(label+':')){
   if(spans[key])throw Error('action_duplicate_disclosed_term');
   // Exact ASCII colon/space and numeric spelling; no locale guessing.
   if(!line.startsWith(label+': ')||line!==line.trimEnd())throw Error('action_disclosed_term_syntax');
   spans[key]={startCp:offset,endCp:offset+[...line].length,quote:line};values[key]=line.slice(label.length+2);
  }
  offset+=[...line].length+1;
 }
 if(Object.keys(spans).length!==Object.keys(ACTION_TERM_LABELS).length)throw Error('action_disclosed_terms_missing');
 if(!/^\d{4}$/u.test(values.symbol)||!civil(values.effectiveOn)||!(values.kind in kindNames)||values.currency!=='TWD')throw Error('action_disclosed_identity_or_unit');
 const terms:ActionTerms={oldShares:0,newShares:0,cashDividendPerOldShare:0,cashReturnPerOldShare:0,subscriptionCashPerOldShare:0,currency:'TWD'};
 for(const name of ['oldShares','newShares','cashDividendPerOldShare','cashReturnPerOldShare','subscriptionCashPerOldShare'] as const){
  if(!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/u.test(values[name]))throw Error('action_disclosed_number');
  terms[name]=Number(values[name]);
  if(name==='oldShares'||name==='newShares'){if(!Number.isSafeInteger(terms[name])||terms[name]<=0)throw Error('action_disclosed_share_count');}
  else if(terms[name]>=1e8)throw Error('action_disclosed_number_codec');
  const canonical=values[name].includes('.')?values[name].replace(/0+$/u,'').replace(/\.$/u,''):values[name];
  if(String(terms[name])!==canonical)throw Error('action_disclosed_number_codec');
 }
 return {symbol:values.symbol,effectiveOn:values.effectiveOn,kind:kindNames[values.kind as keyof typeof kindNames],terms,spans};
}
export type ActionReceipt={schemaVersion:'vnext-corporate-action-terms-v1';stockId:string;symbol:string;event:{snapshotId:string;ordinal:number;session:string;kind:ParsedAction['kind'];sourceRowRef:string};source:{verificationId:string;revisionId:string;contentHash:string;bodyHash:string;publisherAuthorityId:string;sourceAuthorityId:string;manifestHash:string;policyId:string;url:string;publishedAt:string;knownAt:string};terms:ActionTerms;spans:ParsedAction['spans'];receiptHash:string};
export type CurrentActionTerms={schemaVersion:'vnext-current-action-terms-v1';stockId:string;symbol:string;asOf:string;receipts:ActionReceipt[];evidence:Evidence[];gaps:string[]};
export function actionTermEvidence(r:ActionReceipt,body:string):Evidence[]{
 const numeric:Evidence[]= (['oldShares','newShares','cashDividendPerOldShare','cashReturnPerOldShare','subscriptionCashPerOldShare'] as const).map(key=>({id:`action:${r.source.policyId}:${key}`,key:`corporate_action_${key}`,value:r.terms[key],unit:key==='oldShares'||key==='newShares'?'share':'TWD_per_old_share',period:r.event.session,source:r.source.url,sourceTier:'official',kind:'fact',eventAt:r.source.publishedAt,availableAt:r.source.knownAt,contentHash:inputHash({receiptHash:r.receiptHash,key})}));
 return [...numeric,{id:`action:${r.source.policyId}:originalBody`,key:'corporate_action_original',period:r.event.session,value:{schemaVersion:'vnext-corporate-action-original-v1',statement:body},source:r.source.url,sourceTier:'official',kind:'fact',eventAt:r.source.publishedAt,availableAt:r.source.knownAt,contentHash:inputHash({receiptHash:r.receiptHash,key:'originalBody'})}];
}
/** Closed transport validation grants no authority by itself. Production paths
 * obtain this only from the current job-scoped server RPC, then SQL rechecks it
 * at prepare/provider/publish. A synthetic RPC tests code contracts only. */
export function validateCurrentActionTerms(value:unknown):CurrentActionTerms{
 if(!object(value)||!keys(value,'schemaVersion stockId symbol asOf receipts evidence gaps')||value.schemaVersion!=='vnext-current-action-terms-v1'||!uuid.test(String(value.stockId))||!/^\d{4}$/u.test(String(value.symbol))||typeof value.asOf!=='string'||!Number.isFinite(Date.parse(value.asOf))||Date.parse(value.asOf)>Date.now()||!Array.isArray(value.receipts)||value.receipts.length>32||!Array.isArray(value.evidence)||!Array.isArray(value.gaps)||value.gaps.length>64||value.gaps.some(g=>typeof g!=='string'||!/^[a-z_]{1,120}$/u.test(g)))throw Error('vnext_action_current_shape');
 const originals=value.evidence;
 const receipts:ActionReceipt[]=[];const seen=new Set<string>();let previous='';
 for(const raw of value.receipts){
  if(!object(raw)||!keys(raw,'schemaVersion stockId symbol event source terms spans receiptHash')||raw.schemaVersion!=='vnext-corporate-action-terms-v1'||raw.stockId!==value.stockId||raw.symbol!==value.symbol||!object(raw.event)||!keys(raw.event,'snapshotId ordinal session kind sourceRowRef')||!uuid.test(String(raw.event.snapshotId))||!Number.isSafeInteger(raw.event.ordinal)||Number(raw.event.ordinal)<0||Number(raw.event.ordinal)>9999||typeof raw.event.session!=='string'||!civil(raw.event.session)||!['par_value_change','capital_reduction','ex_right_dividend'].includes(String(raw.event.kind))||!hash.test(String(raw.event.sourceRowRef))||!object(raw.source)||!keys(raw.source,'verificationId revisionId contentHash bodyHash publisherAuthorityId sourceAuthorityId manifestHash policyId url publishedAt knownAt')||!['verificationId','revisionId','publisherAuthorityId','sourceAuthorityId','policyId'].every(k=>uuid.test(String((raw.source as Row)[k])))||!['contentHash','bodyHash','manifestHash'].every(k=>hash.test(String((raw.source as Row)[k])))||typeof raw.source.url!=='string'||!/^https:\/\/[^\s@?#]+\/[^\s?#]*$/u.test(raw.source.url)||typeof raw.source.publishedAt!=='string'||typeof raw.source.knownAt!=='string'||![raw.source.publishedAt,raw.source.knownAt].every(v=>Number.isFinite(Date.parse(v)))||Date.parse(raw.source.publishedAt)>Date.parse(raw.source.knownAt)||Date.parse(raw.source.knownAt)>Date.parse(value.asOf)||!object(raw.spans)||!object(raw.terms)||!keys(raw.terms,'oldShares newShares cashDividendPerOldShare cashReturnPerOldShare subscriptionCashPerOldShare currency'))throw Error('vnext_action_current_binding');
  if(!keys(raw.spans,Object.keys(ACTION_TERM_LABELS).join(' ')))throw Error('vnext_action_current_spans');
  const ordered=[] as {startCp:number;endCp:number;quote:string}[];
  for(const [name,span] of Object.entries(raw.spans)){
   if(!object(span)||!keys(span,'startCp endCp quote')||!Number.isSafeInteger(span.startCp)||!Number.isSafeInteger(span.endCp)||Number(span.startCp)<0||Number(span.endCp)>100000||typeof span.quote!=='string'||!span.quote.startsWith(ACTION_TERM_LABELS[name as keyof typeof ACTION_TERM_LABELS]+': ')||[...span.quote].length!==Number(span.endCp)-Number(span.startCp))throw Error('vnext_action_current_spans');
   ordered.push(span as {startCp:number;endCp:number;quote:string});
  }
  ordered.sort((a,b)=>a.startCp-b.startCp);
  if(ordered.some((s,i)=>i>0&&s.startCp<=ordered[i-1].endCp))throw Error('vnext_action_current_spans');
  const source=raw.source;const original=originals.find(e=>object(e)&&e.id===`action:${source.policyId}:originalBody`);
  if(!object(original)||!object(original.value)||!keys(original.value,'schemaVersion statement')||original.value.schemaVersion!=='vnext-corporate-action-original-v1'||typeof original.value.statement!=='string'||inputHash(original.value.statement)!==source.bodyHash)throw Error('vnext_action_original_body_hash');
  const parsed=extractDisclosedActionTerms(original.value.statement);
  if(inputHash(parsed.spans)!==inputHash(raw.spans))throw Error('vnext_action_original_spans');
  if(parsed.symbol!==raw.symbol||parsed.effectiveOn!==raw.event.session||raw.event.session>taipeiDay(value.asOf)||parsed.kind!==raw.event.kind||inputHash(parsed.terms)!==inputHash(raw.terms))throw Error('vnext_action_current_terms');
  const {receiptHash,...unsigned}=raw;
  const identity=`${raw.event.session}:${raw.event.snapshotId}:${String(raw.event.ordinal).padStart(5,'0')}`;
  if(identity<previous||seen.has(`${raw.event.snapshotId}:${raw.event.ordinal}`)||receiptHash!==inputHash(unsigned))throw Error('vnext_action_current_hash_or_order');
  previous=identity;seen.add(`${raw.event.snapshotId}:${raw.event.ordinal}`);receipts.push(raw as ActionReceipt);
 }
 const expected=receipts.flatMap(r=>{const context=originals.find(e=>object(e)&&e.id===`action:${r.source.policyId}:originalBody`) as Row;return actionTermEvidence(r,String((context.value as Row).statement));});
 if(inputHash(value.evidence)!==inputHash(expected))throw Error('vnext_action_current_evidence');
 return structuredClone(value) as CurrentActionTerms;
}
export async function readCurrentActionTerms(client:{rpc:(name:string,args:Row)=>PromiseLike<{data:unknown;error:unknown}>},identity:VnextIdentity,jobId:string,executionId:string):Promise<CurrentActionTerms>{
 if(identity.role!=='author'||!identity.principal||!uuid.test(jobId)||!uuid.test(executionId))throw Error('vnext_action_author_execution_required');
 const response=await client.rpc('vnext_action_terms_read_v1',{p_principal:identity.principal,p_job:jobId,p_execution:executionId});
 if(response.error)throw Error('vnext_action_current_source_unavailable');
 return validateCurrentActionTerms(response.data);
}
/** Derived receipt only: the original reviewed target and publication are never
 * changed. Inputs here need actual current SQL authority, not caller assertion.
 * Cash/rights terms require an explicit product decision about price versus
 * total return; this routine never invents that decision. */
export function rebasePerShareTarget(baseline:{base:number;bear:number;bull:number;unit:string;quoteAt:string;inputHash:string;outputHash:string},revisionId:string,projection:CurrentActionTerms){
 const current=validateCurrentActionTerms(projection);
 if(!uuid.test(revisionId)||!['TWD','TWD_per_share','TWD/share'].includes(baseline.unit)||!hash.test(baseline.inputHash)||!hash.test(baseline.outputHash)||!civil(baseline.quoteAt)||![baseline.bear,baseline.base,baseline.bull].every(n=>Number.isFinite(n)&&n>0)||!(baseline.bear<=baseline.base&&baseline.base<=baseline.bull))throw Error('vnext_action_original_baseline');
 const currentDay=taipeiDay(current.asOf);
 if(baseline.quoteAt>currentDay)throw Error('vnext_action_original_baseline_future');
 const actions=current.receipts.filter(r=>r.event.session>baseline.quoteAt&&r.event.session<=currentDay);
 if(current.gaps.length)return {status:'deferred' as const,reason:'target_current_action_terms_incomplete',gaps:current.gaps};
 if(actions.some(r=>r.event.kind!=='par_value_change'||r.terms.cashDividendPerOldShare!==0||r.terms.cashReturnPerOldShare!==0||r.terms.subscriptionCashPerOldShare!==0))return {status:'deferred' as const,reason:'target_cash_or_rights_intent_decision_required',gaps:['choose_price_only_or_total_return_before_cash_rights_rebasing']};
 const gcd=(a:bigint,b:bigint):bigint=>b===BigInt(0)?a:gcd(b,a%b);
 let numerator=BigInt(1),denominator=BigInt(1);
 for(const r of actions){numerator*=BigInt(r.terms.newShares);denominator*=BigInt(r.terms.oldShares);const d=gcd(numerator,denominator);numerator/=d;denominator/=d;if(numerator*BigInt(1000000)<denominator||numerator>denominator*BigInt(1000000))throw Error('vnext_action_ratio_bound');}
 // Supported exact decimal domain, never rounding an unapproved target. The
 // SQL candidate uses the same divisibility test before numeric division.
 const adjusted:Record<string,number>={};
 for(const key of ['base','bear','bull'] as const){
  const [whole,fraction='']=String(baseline[key]).split('.');
  if(!/^\d+$/u.test(whole)||fraction.length>6)return {status:'deferred' as const,reason:'target_exact_decimal_rebase_unavailable',gaps:['exact_per_share_result_exceeds_six_decimal_domain']};
  const scaled=BigInt(whole+fraction.padEnd(6,'0'))*denominator;
  if(scaled%numerator!==BigInt(0)||scaled/numerator<BigInt(1)||scaled/numerator>=BigInt(10)**BigInt(27))return {status:'deferred' as const,reason:'target_exact_decimal_rebase_unavailable',gaps:['exact_per_share_result_exceeds_six_decimal_domain']};
  adjusted[key]=Number(scaled/numerator)/1e6;
 }
 const original={base:baseline.base,bear:baseline.bear,bull:baseline.bull,quoteAt:baseline.quoteAt,unit:baseline.unit};
 const receipt={schemaVersion:'vnext-per-share-target-rebase-v1',symbol:current.symbol,revisionId,originalBaselineHash:inputHash({...original,inputHash:baseline.inputHash,outputHash:baseline.outputHash}),originalInputHash:baseline.inputHash,originalOutputHash:baseline.outputHash,original,shareRatio:{numerator:String(numerator),denominator:String(denominator)},rebased:{base:adjusted.base,bear:adjusted.bear,bull:adjusted.bull,unit:'TWD_per_share'},actionReceiptHashes:actions.map(r=>r.receiptHash)};
 return {status:'derived' as const,receipt:{...receipt,receiptHash:inputHash(receipt)},authority:'requires_current_server_terms_and_original_reviewed_baseline' as const};
}
