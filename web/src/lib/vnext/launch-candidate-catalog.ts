import {types} from 'node:util';
import {sha256Canonical} from '../opportunity-v3/canonical.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {candidateEpochFixturePage,type CandidateEpochEvent} from './candidate-epoch-journal.ts';

/** Synthetic projection only. No producer, public-metadata grant, DB or writer. */
export const LAUNCH_CANDIDATE_FIXTURE='launch-source-candidate-projection-fixture-v1';
const statuses=['recorded_active_epoch','recorded_exited_epoch','admission_history_unknown'] as const;
type Status=typeof statuses[number];
type Row=Record<string,unknown>;
export type LaunchCandidateQuery={catalogId:string|null;limit:number;cursor:string|null;filters:{date:string|null;source:string|null;industry:string|null;status:Status|null}};
type Industry={revisionId:string;code:string;label:string;knownAt:string};
type Visible={position:number;state:Status;rowId:string;symbol:string;eventAt:string;source:string;industrySnapshot:Industry|null;admission:{kind:'ever_observed_admitted'|'admission_history_unknown';recordedEpochId:string|null}};
function fail():never{throw Error('launch_candidate_projection_invalid');}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const text=(v:unknown,max=80):v is string=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/u.test(v);
const clock=(v:unknown):v is string=>typeof v==='string'&&v.length<=64&&evidenceInstant(v)!==null;
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(v)&&Number.isFinite(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
const exact=(v:unknown,keys:string):v is Row=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.split(' ').sort().join('|');
/** Refuse hooks/proxies before reading caller fields, including fixture inputs. */
function data(value:unknown){
 let nodes=0,characters=0;const seen=new Set<object>();
 function walk(v:unknown,depth:number):void{
  if(++nodes>12000||depth>20)fail();
  if(v===null||typeof v==='boolean')return;
  if(typeof v==='string'){characters+=v.length;if(characters>256*1024)fail();return;}
  if(typeof v==='number'){if(!Number.isFinite(v))fail();return;}
  if(typeof v!=='object'||types.isProxy(v)||seen.has(v))fail();
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v);
  if(proto!==(array?Array.prototype:Object.prototype)&&!(proto===null&&!array)||Object.getOwnPropertySymbols(v).length)fail();
  if(array&&v.length>200)fail();
  const descriptors=Object.getOwnPropertyDescriptors(v);
  if(array&&Object.keys(descriptors).length!==v.length+1)fail();
  seen.add(v);
  for(const [key,d] of Object.entries(descriptors)){
   if(array&&key==='length')continue;
   if(key.length>80||array&&(!/^(?:0|[1-9]\d*)$/u.test(key)||Number(key)>=v.length))fail();
   if(!d.enumerable||!Object.hasOwn(d,'value'))fail();walk(d.value,depth+1);
  }
  seen.delete(v);
 }
 walk(value,0);if(Buffer.byteLength(JSON.stringify(value))>512*1024)fail();
}
function parsedQuery(v:unknown):LaunchCandidateQuery{
 data(v);
 if(!exact(v,'catalogId limit cursor filters')||v.catalogId!==null&&!uuid(v.catalogId)||!Number.isInteger(v.limit)||Number(v.limit)<1||Number(v.limit)>20
  ||v.cursor!==null&&(!text(v.cursor,1000)||!/^[A-Za-z0-9_-]+$/u.test(v.cursor))||!exact(v.filters,'date source industry status'))fail();
 const f=v.filters;
 if(f.date!==null&&!date(f.date)||f.source!==null&&(!text(f.source,40)||!/^[a-z][a-z0-9_-]*$/u.test(f.source))||f.industry!==null&&!text(f.industry,60)
  ||f.status!==null&&!statuses.includes(f.status as Status))fail();
 return v as LaunchCandidateQuery;
}
export function launchCandidateQuery(params:URLSearchParams):LaunchCandidateQuery{
 if(params.size>7||params.toString().length>4096)fail();
 const allowed=['catalogId','limit','cursor','date','source','industry','status'];
 if([...params.keys()].some(key=>!allowed.includes(key)||params.getAll(key).length!==1))fail();
 const rawLimit=params.get('limit');if(rawLimit!==null&&!/^(?:[1-9]|1[0-9]|20)$/u.test(rawLimit))fail();
 const filter=(key:string)=>params.get(key)||null;
 return parsedQuery({catalogId:params.get('catalogId'),limit:rawLimit===null?10:Number(rawLimit),cursor:params.get('cursor'),
  filters:{date:filter('date'),source:filter('source'),industry:filter('industry'),status:filter('status')}});
}
/** Reuses the existing disabled journal fixture validator. An actual admission
 * observation is different from complete history; absence always stays unknown. */
export function launchCandidateFixturePage(value:unknown,query:LaunchCandidateQuery,current:unknown,readAt:string){
 data(value);data(current);const q=parsedQuery(query);
 if(!clock(readAt)||!exact(value,'schemaVersion scope catalogId cutoff coverage clues membership')||value.schemaVersion!==LAUNCH_CANDIDATE_FIXTURE||value.scope!=='synthetic_only'
  ||!uuid(value.catalogId)||!clock(value.cutoff)||evidenceInstant(value.cutoff)!>evidenceInstant(readAt)!
  ||!exact(value.coverage,'sourceComplete membershipComplete sourceFrom membershipFrom preActivationHistory')||value.coverage.sourceComplete!==false||value.coverage.membershipComplete!==false
  ||value.coverage.sourceFrom!==null||value.coverage.membershipFrom!==null||value.coverage.preActivationHistory!=='unavailable'||!Array.isArray(value.clues)||value.clues.length>200)fail();
 if(!exact(value.membership,'schemaVersion policyVersion cutoff events coverage activation')||value.membership.cutoff!==value.cutoff)fail();
 candidateEpochFixturePage(value.membership,{symbol:null,limit:20,cursor:null},readAt);
 const events=value.membership.events as CandidateEpochEvent[];
 const ids=new Set<string>();const rows:Omit<Visible,'position'>[]=[];const publicClues:Row[]=[];
 for(const clue of value.clues){
  if(!exact(clue,'id symbol eventAt availableAt source industrySnapshot publication')||!uuid(clue.id)||ids.has(clue.id)||typeof clue.symbol!=='string'||!/^\d{4}$/u.test(clue.symbol)
   ||!clock(clue.eventAt)||!clock(clue.availableAt)||evidenceInstant(clue.eventAt)!>evidenceInstant(clue.availableAt)!||evidenceInstant(clue.availableAt)!>evidenceInstant(value.cutoff)!
   ||!text(clue.source,40)||!/^[a-z][a-z0-9_-]*$/u.test(clue.source))fail();
  ids.add(clue.id);let industry:Industry|null=null;
  if(clue.industrySnapshot!==null){const i=clue.industrySnapshot;
   if(!exact(i,'revisionId code label knownAt')||!uuid(i.revisionId)||!text(i.code,60)||!text(i.label,80)||!clock(i.knownAt)||evidenceInstant(i.knownAt)!>evidenceInstant(value.cutoff)!)fail();
   industry={revisionId:i.revisionId,code:i.code,label:i.label,knownAt:i.knownAt};
  }
  // This record declares fixture intent, NEVER a permission accepted by runtime.
  // Null represents private/unknown scope, excluded before public materialization.
  if(clue.publication===null)continue;
  if(!exact(clue.publication,'kind bindingId')||clue.publication.kind!=='synthetic_public_metadata_fixture'||!uuid(clue.publication.bindingId))fail();
  publicClues.push(clue);
  const observed=events.filter(e=>e.symbol===clue.symbol).sort((a,b)=>BigInt(a.sequence)<BigInt(b.sequence)?-1:1);
  const admitted=observed.filter(e=>e.kind==='admitted').at(-1),tail=observed.at(-1);
  const state:Status=admitted?(tail?.state==='exited'?'recorded_exited_epoch':'recorded_active_epoch'):'admission_history_unknown';
  rows.push({rowId:clue.id,symbol:clue.symbol,eventAt:clue.eventAt,source:clue.source,industrySnapshot:industry,state,
   admission:{kind:admitted?'ever_observed_admitted':'admission_history_unknown',recordedEpochId:admitted?.epochId??null}});
 }
 rows.sort((a,b)=>evidenceInstant(a.eventAt)!>evidenceInstant(b.eventAt)!?-1:evidenceInstant(a.eventAt)!<evidenceInstant(b.eventAt)!?1:a.symbol.localeCompare(b.symbol)||a.rowId.localeCompare(b.rowId));
 const positioned:Visible[]=rows.map((row,index)=>({...row,position:index+1}));
 const visibleSymbols=new Set(rows.map(row=>row.symbol));
 const lineage=events.filter(event=>visibleSymbols.has(event.symbol)).sort((a,b)=>a.symbol.localeCompare(b.symbol)||(BigInt(a.sequence)<BigInt(b.sequence)?-1:1));
 const catalogHash=sha256Canonical({catalogId:value.catalogId,cutoff:value.cutoff,rows:positioned,coverage:value.coverage,
  provenance:{clues:publicClues.sort((a,b)=>String(a.id).localeCompare(String(b.id))),membershipEvents:lineage}});
 if(q.catalogId!==null&&q.catalogId!==value.catalogId)fail();
 if(!exact(current,'catalogId checkedAt withdrawnClueIds')||current.catalogId!==value.catalogId||!clock(current.checkedAt)||evidenceInstant(current.checkedAt)!<evidenceInstant(value.cutoff)!
  ||evidenceInstant(current.checkedAt)!>evidenceInstant(readAt)!||!Array.isArray(current.withdrawnClueIds)||current.withdrawnClueIds.length>200
  ||current.withdrawnClueIds.some(id=>!uuid(id)||!positioned.some(row=>row.rowId===id))||new Set(current.withdrawnClueIds).size!==current.withdrawnClueIds.length)fail();
 const withdrawn=new Set(current.withdrawnClueIds),filtersHash=sha256Canonical({filters:q.filters,limit:q.limit});let after=0;
 if(q.cursor!==null){let cursor:unknown;
  try{const bytes=Buffer.from(q.cursor,'base64url');if(bytes.toString('base64url')!==q.cursor)fail();cursor=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return fail();}
  if(!exact(cursor,'version catalogId catalogHash cutoff filtersHash after')||cursor.version!==1||cursor.catalogId!==value.catalogId||cursor.catalogHash!==catalogHash||cursor.cutoff!==value.cutoff
   ||cursor.filtersHash!==filtersHash||!Number.isInteger(cursor.after)||Number(cursor.after)<1||Number(cursor.after)>positioned.length)fail();after=Number(cursor.after);
 }
 const base={schemaVersion:'launch-source-candidate-fixture-page-v1' as const,scope:'synthetic_projection_only' as const,catalogId:value.catalogId,catalogHash,cutoff:value.cutoff,
  coverage:{sourceComplete:false,membershipComplete:false,sourceFrom:null,membershipFrom:null,preActivationHistory:'unavailable'},sourceAuthority:false,entryAuthority:false,publicationAuthority:false,
  gaps:['public_source_clue_producer_not_connected','production_mutation_hooks_not_connected','pre_activation_history_unavailable','full_candidate_history_not_proven','journal_other_cause_paths_not_supported']};
 if(withdrawn.size&&Object.values(q.filters).some(v=>v!==null))return {...base,availability:'filtered_projection_unavailable' as const,rows:[],nextCursor:null};
 const f=q.filters,filtered=positioned.filter(row=>(!f.date||new Date(Date.parse(row.eventAt)+8*3600000).toISOString().slice(0,10)===f.date)&&(!f.source||row.source===f.source)
  &&(!f.industry||row.industrySnapshot?.code===f.industry)&&(!f.status||row.state===f.status));
 if(after&&!filtered.some(row=>row.position===after))fail();
 const remaining=filtered.filter(row=>row.position>after),page=remaining.slice(0,q.limit),tail=page.at(-1);
 const nextCursor=tail&&remaining.length>page.length?Buffer.from(JSON.stringify({version:1,catalogId:value.catalogId,catalogHash,cutoff:value.cutoff,filtersHash,after:tail.position})).toString('base64url'):null;
 return {...base,availability:'ready' as const,rows:page.map(row=>withdrawn.has(row.rowId)?{position:row.position,state:'redacted' as const}:row),nextCursor};
}
/** Hard disabled, including when arbitrary environment flags are set. There is
 * no producer/RPC/client/fixture adapter and no public metadata grant here. */
export function readLaunchCandidateCatalog(_query:LaunchCandidateQuery){
 return {schemaVersion:'launch-source-candidate-read-v1' as const,availability:'producer_unavailable' as const,activation:'disabled_not_connected' as const,
  rows:[],nextCursor:null,coverage:{sourceComplete:false,membershipComplete:false,sourceFrom:null,membershipFrom:null,preActivationHistory:'unavailable'},
  sourceAuthority:false,entryAuthority:false,publicationAuthority:false,gaps:['public_metadata_publication_binding_producer_missing','production_mutation_hooks_not_connected','full_candidate_history_not_proven']};
}
