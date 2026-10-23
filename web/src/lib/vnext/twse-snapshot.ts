import {createHash} from 'node:crypto';
import {inputHash} from './policy.ts';
type Row=Record<string,unknown>;
export const TWSE_SNAPSHOT_PROFILE=Object.freeze({version:'twse-insider-snapshot-v1',maximumBytes:8*1024*1024,timeoutMs:20000,maximumManifest:500,
 byteBasis:'fetch_response_body_after_http_content_decoding',rowHashBasis:'sha256_json_stringify_parsed_row_v1',eventTimeBasis:'report_date_not_original_event',exhaustion:'not_exposed_by_snapshot_api',rootResolution:'unresolved'});
export const TWSE_SNAPSHOT_ENDPOINTS={holding_listed:'https://openapi.twse.com.tw/v1/opendata/t187ap11_L',holding_public:'https://openapi.twse.com.tw/v1/opendata/t187ap11_P',transfer_listed:'https://openapi.twse.com.tw/v1/opendata/t187ap12_L'} as const;
export type TwseSnapshotContext={connectorRunId:string;endpointKey:keyof typeof TWSE_SNAPSHOT_ENDPOINTS;querySymbol:string|null;requestedAt:string};
export type TwseSnapshotSink={response(response:Response,context:TwseSnapshotContext):Promise<Row[]>;failure(context:TwseSnapshotContext,error:unknown):Promise<void>};
export type TwseSnapshotObservation=TwseSnapshotContext & {profileVersion:string;availableAt:string;status:string;httpStatus:number|null;responseSha256:string|null;responseBytes:number|null;observedBytesAtLeast:number|null;returnedRows:number|null;matchedRows:number|null;selectedRows:number|null;deferredRows:number|null;selectionCap:number;manifest:Array<{ordinal:number;rowHash:string;symbol:string|null;reportDateToken:string|null;unknownDateHash:string|null}>;byteBasis:string;rowHashBasis:string;eventTimeBasis:string;eventWindow:null;exhaustion:string;rootResolution:string;eventVolume:null};
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const compact=(value:unknown)=>String(value||'').replace(/\s+/gu,' ').trim();
export function snapshotContext(context:TwseSnapshotContext){
 if(typeof context.connectorRunId!=='string' || typeof context.endpointKey!=='string' || typeof context.requestedAt!=='string' || context.querySymbol!==null && typeof context.querySymbol!=='string' || Object.keys(context).sort().join('|')!==['connectorRunId','endpointKey','querySymbol','requestedAt'].sort().join('|') || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(context.connectorRunId) || !Object.hasOwn(TWSE_SNAPSHOT_ENDPOINTS,context.endpointKey) || context.querySymbol!==null && !/^\d{4}$/u.test(context.querySymbol) || !Number.isFinite(Date.parse(context.requestedAt)))throw Error('vnext_twse_snapshot_context_invalid');
 return context;
}
function base(context:TwseSnapshotContext,availableAt:string):TwseSnapshotObservation{
 snapshotContext(context);if(!Number.isFinite(Date.parse(availableAt)) || Date.parse(availableAt)<Date.parse(context.requestedAt))throw Error('vnext_twse_snapshot_clock_invalid');
 return {...context,profileVersion:TWSE_SNAPSHOT_PROFILE.version,availableAt,status:'transport_error',httpStatus:null,responseSha256:null,responseBytes:null,observedBytesAtLeast:null,returnedRows:null,matchedRows:null,selectedRows:null,deferredRows:null,selectionCap:context.querySymbol?60:500,manifest:[],byteBasis:TWSE_SNAPSHOT_PROFILE.byteBasis,rowHashBasis:TWSE_SNAPSHOT_PROFILE.rowHashBasis,eventTimeBasis:TWSE_SNAPSHOT_PROFILE.eventTimeBasis,eventWindow:null,exhaustion:TWSE_SNAPSHOT_PROFILE.exhaustion,rootResolution:TWSE_SNAPSHOT_PROFILE.rootResolution,eventVolume:null};
}
/** This profile hashes parsed JSON rows, never row wire slices. It accepts
 * Chinese provider keys, but rejects unrepresentable/deep/non-finite values
 * rather than allowing JSON.stringify to turn Infinity into null. */
function supportedJson(value:unknown,depth=0):void{
 if(depth>12)throw Error('twse_snapshot_json_depth');
 if(value===null || typeof value==='boolean')return;
 if(typeof value==='number'){if(!Number.isFinite(value) || Object.is(value,-0))throw Error('twse_snapshot_json_number');return;}
 if(typeof value==='string'){for(let i=0;i<value.length;i++){const n=value.charCodeAt(i);if(n>=0xd800 && n<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00 && next<=0xdfff))throw Error('twse_snapshot_json_unicode');}else if(n>=0xdc00 && n<=0xdfff)throw Error('twse_snapshot_json_unicode');}return;}
 if(Array.isArray(value)){for(const item of value)supportedJson(item,depth+1);return;}
 if(typeof value==='object' && Object.getPrototypeOf(value)===Object.prototype){for(const [key,item]of Object.entries(value)){supportedJson(key,depth+1);supportedJson(item,depth+1);}return;}
 throw Error('twse_snapshot_json_unsupported');
}
export function snapshotTransportFailure(context:TwseSnapshotContext,error:unknown,now=()=>new Date().toISOString()){
 const observation=base(context,now());const name=error instanceof Error?error.name:'';
 observation.status=['TimeoutError','AbortError'].includes(name)?'transport_timeout':'transport_error';return observation;
}
/** Consumes the EXISTING response once. No fetch/retry, content storage,
 * extraction, model or external-day completeness authority is introduced. */
export async function captureTwseSnapshot(response:Response,context:TwseSnapshotContext,now=()=>new Date().toISOString()){
 const observation=base(context,now());observation.httpStatus=response.status;
 const failure=(status:string)=>({observation:{...observation,availableAt:now(),status},rows:null,error:Error(`vnext_twse_snapshot_${status}`)});
 if(response.url!==TWSE_SNAPSHOT_ENDPOINTS[context.endpointKey]){try{await response.body?.cancel();}catch{/* no retry */}return failure('response_url_mismatch');}
 const reader=response.body?.getReader();if(!reader)return failure('body_unavailable');
 const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const next=await reader.read();if(next.done)break;
   if(length+next.value.byteLength>TWSE_SNAPSHOT_PROFILE.maximumBytes){observation.observedBytesAtLeast=TWSE_SNAPSHOT_PROFILE.maximumBytes+1;await reader.cancel();return failure('body_bound');}
   chunks.push(next.value);length+=next.value.byteLength;observation.observedBytesAtLeast=length;
  }}catch{return failure('body_read_uncertain');}finally{reader.releaseLock();}
 const bytes=Buffer.concat(chunks,length);observation.responseSha256=sha(bytes);observation.responseBytes=length;observation.observedBytesAtLeast=length;
 if(!response.ok)return failure('http_error');
 let rows:unknown;
 try{rows=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));supportedJson(rows);}catch{return failure('json_unsupported');}
 if(!Array.isArray(rows) || rows.some(row=>!row || typeof row!=='object' || Array.isArray(row)) || rows.length>0 && !rows.some(row=>Object.hasOwn(row,'公司代號')))return failure('schema_error');
 const selected=rows.map((row,ordinal)=>({row:row as Row,ordinal})).filter(({row})=>context.querySymbol===null || compact(row['公司代號'])===context.querySymbol);
 observation.returnedRows=rows.length;observation.matchedRows=selected.length;observation.selectedRows=Math.min(selected.length,observation.selectionCap);observation.deferredRows=selected.length-observation.selectedRows;
 observation.manifest=selected.slice(0,observation.selectionCap).map(({row,ordinal})=>{const token=compact(row['出表日期'])||compact(row['申報日期']);const date=/^\d{6,8}$/u.test(token)?token:null;const symbol=compact(row['公司代號']);
  return {ordinal,rowHash:sha(JSON.stringify(row)),symbol:/^[1-9]\d{3}$/u.test(symbol)?symbol:null,reportDateToken:date,unknownDateHash:token && !date?sha(token):null};});
 observation.status='response_observed';observation.availableAt=now();return {observation,rows:rows as Row[],error:null};
}
const observationKeys=['connectorRunId','endpointKey','querySymbol','requestedAt','profileVersion','availableAt','status','httpStatus','responseSha256','responseBytes','observedBytesAtLeast','returnedRows','matchedRows','selectedRows','deferredRows','selectionCap','manifest','byteBasis','rowHashBasis','eventTimeBasis','eventWindow','exhaustion','rootResolution','eventVolume'];
const exactKeys=(value:object,keys:string[])=>Object.keys(value).sort().join('|')===keys.slice().sort().join('|');
const integer=(value:unknown,maximum:number)=>typeof value==='number' && Number.isSafeInteger(value) && !Object.is(value,-0) && value>=0 && value<=maximum;
const hash=(value:unknown)=>typeof value==='string' && /^[a-f0-9]{64}$/u.test(value);
const uuid=(value:unknown)=>typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value);
/** Closed transport profile only, never event/financial evidence validation. */
export function validateSnapshotObservation(value:unknown):TwseSnapshotObservation{
 const observed=value as TwseSnapshotObservation|null;const invalid=()=>{throw Error('vnext_twse_snapshot_read_invalid');};
 if(!observed || typeof observed!=='object' || Array.isArray(observed) || !exactKeys(observed,observationKeys))return invalid();
 snapshotContext({connectorRunId:observed.connectorRunId,endpointKey:observed.endpointKey,querySymbol:observed.querySymbol,requestedAt:observed.requestedAt});
 if(observed.profileVersion!==TWSE_SNAPSHOT_PROFILE.version || observed.byteBasis!==TWSE_SNAPSHOT_PROFILE.byteBasis || observed.rowHashBasis!==TWSE_SNAPSHOT_PROFILE.rowHashBasis || observed.eventTimeBasis!==TWSE_SNAPSHOT_PROFILE.eventTimeBasis || observed.eventWindow!==null || observed.eventVolume!==null || observed.exhaustion!==TWSE_SNAPSHOT_PROFILE.exhaustion || observed.rootResolution!==TWSE_SNAPSHOT_PROFILE.rootResolution || typeof observed.availableAt!=='string' || !Number.isFinite(Date.parse(observed.availableAt)) || Date.parse(observed.availableAt)<Date.parse(observed.requestedAt) || observed.selectionCap!==(observed.querySymbol?60:500))return invalid();
 if(!['response_observed','http_error','body_unavailable','body_bound','body_read_uncertain','json_unsupported','schema_error','response_url_mismatch','transport_error','transport_timeout'].includes(observed.status) || observed.httpStatus!==null && !integer(observed.httpStatus,599) || !Array.isArray(observed.manifest) || observed.manifest.length>observed.selectionCap)return invalid();
 if((observed.responseSha256===null)!==(observed.responseBytes===null) || observed.responseSha256!==null && !hash(observed.responseSha256))return invalid();
 for(const key of ['responseBytes','observedBytesAtLeast','returnedRows','matchedRows','selectedRows','deferredRows'] as const)if(observed[key]!==null && !integer(observed[key],TWSE_SNAPSHOT_PROFILE.maximumBytes+1))return invalid();
 if(observed.responseBytes!==null && (observed.responseBytes>TWSE_SNAPSHOT_PROFILE.maximumBytes || observed.responseBytes!==observed.observedBytesAtLeast))return invalid();
 const counts=[observed.returnedRows,observed.matchedRows,observed.selectedRows,observed.deferredRows];
 if(observed.status==='response_observed'){
  if(!hash(observed.responseSha256) || observed.httpStatus===null || observed.httpStatus<200 || observed.httpStatus>299 || counts.some(count=>count===null) || observed.matchedRows!>observed.returnedRows! || observed.selectedRows!==Math.min(observed.matchedRows!,observed.selectionCap) || observed.deferredRows!==observed.matchedRows!-observed.selectedRows || observed.manifest.length!==observed.selectedRows)return invalid();
 }else if(counts.some(count=>count!==null) || observed.manifest.length)return invalid();
 let prior=-1;
 for(const item of observed.manifest){
  if(!item || typeof item!=='object' || !exactKeys(item,['ordinal','rowHash','symbol','reportDateToken','unknownDateHash']) || !integer(item.ordinal,observed.returnedRows!-1) || item.ordinal<=prior || !hash(item.rowHash) || item.symbol!==null && (typeof item.symbol!=='string' || !/^[1-9]\d{3}$/u.test(item.symbol)) || item.reportDateToken!==null && (typeof item.reportDateToken!=='string' || !/^\d{6,8}$/u.test(item.reportDateToken)) || item.unknownDateHash!==null && !hash(item.unknownDateHash) || item.reportDateToken!==null && item.unknownDateHash!==null)return invalid();
  prior=item.ordinal;
 }
 return observed;
}
export function validateSnapshotReceipt(value:unknown){
 const receipt=value as {receiptId:string;receiptHash:string;observation:TwseSnapshotObservation;recordedAt:string}|null;
 if(!receipt || typeof receipt!=='object' || Array.isArray(receipt) || !exactKeys(receipt,['receiptId','receiptHash','observation','recordedAt']) || !uuid(receipt.receiptId) || typeof receipt.recordedAt!=='string' || !Number.isFinite(Date.parse(receipt.recordedAt)))throw Error('vnext_twse_snapshot_read_invalid');
 const observed=validateSnapshotObservation(receipt.observation);
 if(receipt.receiptHash!==inputHash(observed) || Date.parse(receipt.recordedAt)<Date.parse(observed.availableAt))throw Error('vnext_twse_snapshot_read_invalid');
 return receipt;
}
export function snapshotCoverage(value:unknown,now=new Date().toISOString()){
 const row=value as {observations?:unknown[];eventCoverage?:string;eventVolume?:null}|null;
 if(!row || typeof row!=='object' || !exactKeys(row,['observations','eventCoverage','eventVolume']) || row.eventCoverage!=='unknown' || row.eventVolume!==null || !Array.isArray(row.observations) || row.observations.length>3)throw Error('vnext_twse_snapshot_read_invalid');
 const endpoints=new Set<string>();
 return {profileVersion:TWSE_SNAPSHOT_PROFILE.version,eventCoverage:'unknown',eventVolume:null,reason:row.observations.length?'snapshot_response_is_not_complete_original_event_window':'snapshot_transport_receipts_missing',observations:row.observations.map(value=>{
  const item=validateSnapshotReceipt(value);const observed=item.observation;
  if(endpoints.has(observed.endpointKey))throw Error('vnext_twse_snapshot_read_invalid');endpoints.add(observed.endpointKey);
  const age=Date.parse(now)-Date.parse(observed.availableAt);return {...item,asOf:observed.availableAt,stale:!Number.isFinite(age)||age<0||age>86400000,health:'transport_observation_only',eventCoverage:'unknown',eventVolume:null};})};
}
