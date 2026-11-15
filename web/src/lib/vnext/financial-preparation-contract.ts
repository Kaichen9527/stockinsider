import {types} from 'node:util';
import {evidenceInstant} from './evidence-clock.ts';
import {candidateMopsDownloadUrl} from '../candidate-official-financials.ts';
import {TWSE_FINANCIAL_ENDPOINTS,TPEX_FINANCIAL_ENDPOINTS} from '../candidate-financial-acquisition.ts';
export const FINANCIAL_PREPARATION_RPC='vnext_financial_preparation_v1';
export const FINANCIAL_PREPARATION_SCHEMA='private-financial-preparation-v1';
export type PreparationOperation='acquire'|'parse';
export type PreparationMode='legacy_off'|'vnext_on';
export type PreparationContext={schemaVersion:'financial-preparation-context-v1';mode:PreparationMode;backendId:string;releaseId:string;runnerPrincipal:string};
export type PreparationAttempt={attemptId:string;operation:PreparationOperation;mode:PreparationMode;backendId:string;releaseId:string;runnerPrincipal:string;jobId:string|null;receiptId:string|null;
 stockId:string;symbol:string;exchange:'TWSE'|'TPEX';statementKind:'general'|'broker'|'financial';periodEnd:string;sourceUrl:string;profile:string;memberInputHash:string|null;rightsBindingHash:string;deadline:string;
 artifact:{hash:string;bytes:number;mediaType:string;objectKey:string}|null};
export function preparationInvalid():never{throw Error('financial_preparation_protocol_invalid');}
export const preparationUuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
export const preparationHash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-(?:03-31|06-30|09-30|12-31)$/u.test(v);
const clock=(v:unknown):v is string=>typeof v==='string'&&evidenceInstant(v)!==null;
export function preparationExact(v:unknown,keys:string):v is Record<string,unknown>{return v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.split(' ').sort().join('|');}
/** This validates a private protocol, not a caller-provided permission. */
export function preparationData(value:unknown){
 let nodes=0,chars=0;const path=new Set<object>();
 function visit(v:unknown,depth:number):void{
  if(++nodes>16000||depth>18)preparationInvalid();
  if(v===null||typeof v==='boolean')return;
  if(typeof v==='string'){chars+=v.length;if(v.length>2*1024*1024||chars>3*1024*1024)preparationInvalid();return;}
  if(typeof v==='number'){if(!Number.isFinite(v))preparationInvalid();return;}
  if(typeof v!=='object'||types.isProxy(v)||path.has(v))preparationInvalid();
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v),descriptors=Object.getOwnPropertyDescriptors(v);
  if(proto!==(array?Array.prototype:Object.prototype)&&proto!==null||Object.getOwnPropertySymbols(v).length||array&&(v.length>200||Object.keys(descriptors).length!==v.length+1))preparationInvalid();
  path.add(v);
  for(const [key,d] of Object.entries(descriptors)){if(array&&key==='length')continue;if(key.length>128||!d.enumerable||!Object.hasOwn(d,'value')||array&&(!/^(?:0|[1-9]\d*)$/u.test(key)||Number(key)>=v.length))preparationInvalid();visit(d.value,depth+1);}
  path.delete(v);
 }
 visit(value,0);if(Buffer.byteLength(JSON.stringify(value))>4*1024*1024)preparationInvalid();
}
export function parsePreparationContext(value:unknown):PreparationContext{
 preparationData(value);
 if(!preparationExact(value,'schemaVersion mode backendId releaseId runnerPrincipal')||value.schemaVersion!=='financial-preparation-context-v1'||!['legacy_off','vnext_on'].includes(String(value.mode))
  ||!preparationUuid(value.backendId)||typeof value.releaseId!=='string'||!/^[a-f0-9]{40}$/u.test(value.releaseId)||!preparationUuid(value.runnerPrincipal))preparationInvalid();
 return value as PreparationContext;
}
export function preparationProfile(a:Pick<PreparationAttempt,'profile'|'sourceUrl'|'symbol'|'periodEnd'|'exchange'|'statementKind'>){
 if(a.profile==='mops-attachment-v1'){
  const year=Number(a.periodEnd.slice(0,4)),quarter=['03-31','06-30','09-30','12-31'].indexOf(a.periodEnd.slice(5))+1;
  return a.sourceUrl===candidateMopsDownloadUrl(a.symbol,year,quarter)?{kind:'document' as const,provider:'mops' as const,endpoint:null}:null;
 }
 const endpoints=a.exchange==='TWSE'?TWSE_FINANCIAL_ENDPOINTS:TPEX_FINANCIAL_ENDPOINTS;
 for(const [endpoint,url] of Object.entries(endpoints))if(a.profile===`${a.exchange.toLowerCase()}-${endpoint}-v1`&&a.sourceUrl===url&&endpoint.startsWith(a.statementKind))
  return {kind:'json' as const,provider:a.exchange==='TWSE'?'twse' as const:'tpex' as const,endpoint:endpoint as keyof typeof TPEX_FINANCIAL_ENDPOINTS};
 return null;
}
export function parsePreparationAttempt(value:unknown,context:PreparationContext,operation:PreparationOperation):PreparationAttempt{
 preparationData(value);
 if(!preparationExact(value,'attemptId operation mode backendId releaseId runnerPrincipal jobId receiptId stockId symbol exchange statementKind periodEnd sourceUrl profile memberInputHash rightsBindingHash deadline artifact')
  ||!preparationUuid(value.attemptId)||value.operation!==operation||value.mode!==context.mode||value.backendId!==context.backendId||value.releaseId!==context.releaseId||value.runnerPrincipal!==context.runnerPrincipal
  ||!preparationUuid(value.stockId)||typeof value.symbol!=='string'||!/^\d{4,6}$/u.test(value.symbol)||!['TWSE','TPEX'].includes(String(value.exchange))||!['general','broker','financial'].includes(String(value.statementKind))
  ||!date(value.periodEnd)||typeof value.sourceUrl!=='string'||value.sourceUrl.length>2048||typeof value.profile!=='string'||value.profile.length>64||!clock(value.deadline)||!preparationHash(value.rightsBindingHash)
  ||!(value.memberInputHash===null||preparationHash(value.memberInputHash))||context.mode==='vnext_on'&&(!preparationHash(value.memberInputHash)||!/^\d{4}$/u.test(value.symbol))
  ||operation==='acquire'&&(!preparationUuid(value.jobId)||value.receiptId!==null||value.artifact!==null)||operation==='parse'&&(!preparationUuid(value.receiptId)||!(value.jobId===null||preparationUuid(value.jobId))))preparationInvalid();
 if(value.artifact!==null){const a=value.artifact;if(!preparationExact(a,'hash bytes mediaType objectKey')||!preparationHash(a.hash)||!Number.isInteger(a.bytes)||Number(a.bytes)<1||Number(a.bytes)>50*1024*1024
  ||typeof a.mediaType!=='string'||a.mediaType.length>128||a.objectKey!==`issuer/${value.stockId}/${value.periodEnd}/${a.hash}`)preparationInvalid();}
 const result=value as PreparationAttempt;if(!preparationProfile(result)||operation==='parse'&&result.artifact===null)preparationInvalid();
 return structuredClone(result);
}
