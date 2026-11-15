/** Licensed11371 raw-price observations, NOT qualified/adjusted breadth. No
 * acquisition, DB mutation, calendar/roster approval or chip denominator. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { breadthForRoster } from '../market-breadth.ts';
import { decodeLicensedCsvRecords } from './licensed-csv-decoder.ts';
import { NATIVE_SHARE_HEADERS, NATIVE_SHARE_ATTRIBUTION, NATIVE_TECHNICAL_COVERAGE, tpexNativeShareCsvUrl } from './launch-native-volume.ts';
import { evidenceInstant } from './evidence-clock.ts';
import { sha256Canonical } from '../opportunity-v3/canonical.ts';

export const BREADTH_REPLAY_SCHEMA='launch-tpex-11371-breadth-observations-v1';
export const BREADTH_REPLAY_PARSER='sfb-11371-raw-price-presence-v1';
const PAGE_MAX=500000,TOTAL_MAX=15000000,SHA=/^[a-f0-9]{64}$/u;
type Row=Record<string,unknown>;
function fail():never{throw Error('breadth_replay_invalid');}
function exact(value:unknown,keys:string):asserts value is Row{
 if(!value||typeof value!=='object'||Array.isArray(value)||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
 const descriptors=Object.getOwnPropertyDescriptors(value);
 if(Reflect.ownKeys(descriptors).length!==keys.split(' ').length||!keys.split(' ').every(key=>Object.hasOwn(descriptors,key)
  &&Object.hasOwn(descriptors[key],'value')&&descriptors[key].enumerable))fail();
}
function list(value:unknown,maximum:number):asserts value is unknown[]{
 if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maximum
  ||Reflect.ownKeys(value).length!==value.length+1)fail();
 for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!d.enumerable||!Object.hasOwn(d,'value'))fail();}
}
function day(value:unknown):asserts value is string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))
  ||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail();
}
function clock(value:unknown):asserts value is string{if(evidenceInstant(value)===null)fail();}
const known=(value:string,cutoff:string)=>evidenceInstant(value)!<=evidenceInstant(cutoff)!;
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function sourceDate(value:string){
 if(/^\d{4}-\d{2}-\d{2}$/u.test(value)){day(value);return value;}
 const match=/^(\d{3,4})[/-]?(\d{2})[/-]?(\d{2})$/u.exec(value.trim());if(!match)fail();
 const result=`${Number(match[1])<1911?Number(match[1])+1911:Number(match[1])}-${match[2]}-${match[3]}`;day(result);return result;
}
const missing=(value:string)=>['','-','--','---'].includes(value.trim());
function integer(value:string){
 if(missing(value))return null;
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/u.test(value.trim()))fail();
 const n=Number(value.replaceAll(',','').trim());if(!Number.isSafeInteger(n)||n<0)fail();return n;
}
function price(value:string){
 if(missing(value))return null;
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,6})?$/u.test(value.trim()))return null;
 const n=Number(value.replaceAll(',','').trim());return Number.isFinite(n)&&n>0?n:null;
}
/** Unverified roster metadata cannot mint a DB brand or publication grant.
 * Output is bounded aggregate diagnostics; no issuer names/raw CSV/price cells. */
export function parseTpexBreadthReplay(value:unknown,files:ReadonlyMap<string,Uint8Array>=new Map()){
 exact(value,'schema datasetId throughSession cutoff capture sessions roster responses');
 if(value.schema!==BREADTH_REPLAY_SCHEMA||value.datasetId!==11371)fail();day(value.throughSession);clock(value.cutoff);
 const throughSession=value.throughSession,cutoff=value.cutoff;
 if(throughSession>new Date(Number(evidenceInstant(cutoff)!/BigInt(1000))+28800000).toISOString().slice(0,10))fail();
 exact(value.capture,'repository sourceCommit workflowPath runId runAttempt startedAt completedAt');const capture=value.capture;
 if(typeof capture.repository!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(capture.repository)
  ||typeof capture.sourceCommit!=='string'||!/^[a-f0-9]{40}$/u.test(capture.sourceCommit))fail();
 clock(capture.completedAt);const completedAt=capture.completedAt;if(evidenceInstant(completedAt)!>=evidenceInstant(cutoff)!)fail();
 let startedAt:string|null=null;
 if(capture.startedAt!==null){clock(capture.startedAt);startedAt=capture.startedAt;if(!known(startedAt,completedAt))fail();}
 const noWorkflow=capture.workflowPath===null&&capture.runId===null&&capture.runAttempt===null;
 if(!noWorkflow&&!(typeof capture.workflowPath==='string'&&/^\.github\/workflows\/[A-Za-z0-9_-]+\.ya?ml$/u.test(capture.workflowPath)
  &&typeof capture.runId==='string'&&/^\d{1,20}$/u.test(capture.runId)&&Number.isSafeInteger(capture.runAttempt)&&Number(capture.runAttempt)>=1))fail();
 list(value.sessions,30);if(!value.sessions.length)fail();const sessions:string[]=[];
 for(const session of value.sessions){day(session);if(session>throughSession||sessions.length&&session<=sessions.at(-1)!)fail();sessions.push(session);}
 if(sessions.at(-1)!==throughSession)fail();
 exact(value.roster,'revision availableAt symbols');const roster=value.roster;clock(roster.availableAt);
 if(typeof roster.revision!=='string'||!SHA.test(roster.revision)||!known(roster.availableAt,cutoff))fail();list(roster.symbols,5000);
 const symbols:string[]=[];for(const symbol of roster.symbols){if(typeof symbol!=='string'||!/^\d{4}$/u.test(symbol)||symbols.length&&symbol<=symbols.at(-1)!)fail();symbols.push(symbol);}
 if(!symbols.length)fail();const selectedSymbols=new Set(symbols);list(value.responses,30);
 const histories=new Map<string,Array<{date:string;close:number}>>(),seen=new Set<string>(),paths=new Set<string>();
 const receipts:Array<{session:string;rawSha256:string;csvRowsSha256:string;observedAt:string;reportedRows:number;rosterRows:number;positiveCloseRows:number}>=[];
 let declaredBytes=0,decodedBytes=0,nullableCloseRows=0,nativeUnitGaps=0;
 for(const page of value.responses){
  exact(page,'session sourceUrl observedAt publisherPublishedAt httpStatus redirectCount contentType bytes rawSha256 body');day(page.session);clock(page.observedAt);
  if(!sessions.includes(page.session)||seen.has(page.session)||page.sourceUrl!==tpexNativeShareCsvUrl(page.session)||page.publisherPublishedAt!==null
   ||page.httpStatus!==200&&page.httpStatus!==null||page.redirectCount!==0&&page.redirectCount!==null
   ||page.contentType!==null&&(typeof page.contentType!=='string'||!/^(?:text|application)\/csv(?:;[^\r\n]{0,100})?$/iu.test(page.contentType))
   ||!known(page.observedAt,completedAt)||startedAt!==null&&!known(startedAt,page.observedAt)
   ||typeof page.rawSha256!=='string'||!SHA.test(page.rawSha256)||!Number.isSafeInteger(page.bytes)||Number(page.bytes)<2||Number(page.bytes)>PAGE_MAX)fail();
  seen.add(page.session);declaredBytes+=Number(page.bytes);if(declaredBytes>TOTAL_MAX)fail();
  const closeAt=page.session+'T05:30:00Z';if(!known(closeAt,page.observedAt))fail();
  if(!page.body||typeof page.body!=='object'||types.isProxy(page.body))fail();const body=page.body as Row;
  const encoding=Object.getOwnPropertyDescriptor(body,'encoding');if(!encoding||!Object.hasOwn(encoding,'value')||!encoding.enumerable)fail();
  if(encoding.value==='absent'){exact(body,'encoding');continue;}
  let bytes:Uint8Array;
  if(encoding.value==='base64'){
   exact(body,'encoding data');if(typeof body.data!=='string'||body.data.length>Math.ceil(PAGE_MAX/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(body.data))fail();
   bytes=Buffer.from(body.data,'base64');if(Buffer.from(bytes).toString('base64')!==body.data)fail();
  }else if(encoding.value==='file'){
   exact(body,'encoding path');if(typeof body.path!=='string'||!/^bodies\/[A-Za-z0-9_./-]+$/u.test(body.path)||body.path.split('/').some(part=>!part||part==='.'||part==='..')||paths.has(body.path))fail();
   paths.add(body.path);const read=files.get(body.path);if(!read)fail();bytes=new Uint8Array(read);
  }else fail();
  if(bytes.byteLength!==page.bytes||sha(bytes)!==page.rawSha256||page.httpStatus!==200||page.redirectCount!==0||page.contentType===null)fail();
  decodedBytes+=bytes.byteLength;if(decodedBytes>TOTAL_MAX)fail();
  const records=decodeLicensedCsvRecords(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),5001);
  if(records.length<2||JSON.stringify(records[0])!==JSON.stringify(NATIVE_SHARE_HEADERS)||records.some(row=>row.length!==16))fail();
  const identities=new Set<string>();let rosterRows=0,positiveCloseRows=0;
  for(const row of records.slice(1)){
   if(sourceDate(row[0])!==page.session||!/^[0-9A-Za-z]{2,12}$/u.test(row[1])||identities.has(row[1]))fail();identities.add(row[1]);
   if(!selectedSymbols.has(row[1]))continue;rosterRows++;
   const close=price(row[3]),shares=integer(row[8]),ntd=integer(row[9]),trades=integer(row[10]),issued=integer(row[13]);
   if(issued===0)fail();if([shares,ntd,trades,issued].some(n=>n===null))nativeUnitGaps++;
   if(close===null){nullableCloseRows++;continue;}positiveCloseRows++;
   histories.set(row[1],[...(histories.get(row[1])||[]),{date:page.session,close}]);
  }
  receipts.push({session:page.session,rawSha256:page.rawSha256,csvRowsSha256:sha256Canonical(records),observedAt:page.observedAt,reportedRows:records.length-1,rosterRows,positiveCloseRows});
 }
 const raw=breadthForRoster(histories,new Set(symbols),throughSession,sessions);
 const gaps=['breadth_roster_and_calendar_metadata_unverified','breadth_ca_comparability_not_proven','breadth_purpose_receipt_bridge_not_connected',
  'twse_historical_breadth_producer_not_connected','market_foreign_twd_source_rights_unverified'];
 if(noWorkflow)gaps.push('breadth_capture_workflow_identity_unverified');
 if(sessions.length<30)gaps.push('breadth_30_session_warmup_incomplete');
 if(seen.size!==sessions.length||receipts.length!==sessions.length)gaps.push('breadth_raw_body_or_planned_response_missing');
 if(nullableCloseRows)gaps.push('breadth_reported_close_missing_or_unparseable');if(nativeUnitGaps)gaps.push('breadth_native_integer_field_missing');
 const revision=sha256Canonical([BREADTH_REPLAY_PARSER,NATIVE_SHARE_ATTRIBUTION,NATIVE_TECHNICAL_COVERAGE,throughSession,cutoff,capture,
  {revision:roster.revision,availableAt:roster.availableAt,symbols},sessions,receipts,raw]);
 return Object.freeze({schema:BREADTH_REPLAY_SCHEMA,parserVersion:BREADTH_REPLAY_PARSER,datasetId:11371,market:'TPEX',
  attribution:NATIVE_SHARE_ATTRIBUTION,coverage:NATIVE_TECHNICAL_COVERAGE,purpose:'raw_market_breadth_price_observation',priceBasis:'raw_unadjusted',
  throughSession,cutoff,rosterRevision:roster.revision,revisionId:'breadth-11371:'+revision,
  declaredBytes,decodedBytes,parsedSessions:receipts.length,plannedSessions:sessions.length,nullableCloseRows,nativeUnitGaps,
  rawPricePresence:Object.freeze({eligible:raw.eligible,observed:raw.observed,rawAboveMa20:raw.numerator,...raw.diagnostics}),
  caComparableCoverage:null,qualifiedBreadth:null,aggregateMarketGate:null,institutionalDenominatorAuthority:false,
  sourceAuthority:false,publicationAuthority:false,marketAuthority:false,rosterAuthority:false,calendarAuthority:false,
  responseReceipts:Object.freeze(receipts.map(row=>Object.freeze(row))),gaps:Object.freeze(gaps)});
}
