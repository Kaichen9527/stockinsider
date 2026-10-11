import type {SupabaseClient} from '@supabase/supabase-js';
import {sourceControllerInstant} from './research-source-attempt-controller.ts';
const HASH=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const RECEIPT_KEYS=['snapshotHash','mappingDigest','classifierHash','classificationHash','schemaVersion','receivedAt','latestObservedAt','includedCount'];
const MEMBER_KEYS=['research_company_id','symbol','exchange','isin','name','sector','cfi','observed_at'];
export type ResearchPriorityScope={kind:'formal_v1'}|{kind:'research_observed_v1';snapshotHash:string};
export function parseResearchPriorityScope(body:Record<string,unknown>):ResearchPriorityScope {
 if(body.scope===undefined||body.scope==='formal_v1'){
  if(body.snapshotHash!==undefined)throw Error('research_priority_scope_invalid');return {kind:'formal_v1'};
 }
 if(body.scope!=='research_observed_v1'||typeof body.snapshotHash!=='string'||!HASH.test(body.snapshotHash))throw Error('research_priority_scope_invalid');
 return {kind:'research_observed_v1',snapshotHash:body.snapshotHash};
}
export async function readObservedPriorityRoster(db:Pick<SupabaseClient,'rpc'>,snapshotHash:string,asOf:string){
 const rows:Record<string,unknown>[]=[];let receipt:Record<string,unknown>|null=null;let size=0;
 for(let offset=0;offset<=5000;offset+=500){
  const {data,error}=await db.rpc('read_research_observed_roster_v1',{p_snapshot_hash:snapshotHash,p_as_of:asOf,p_offset:offset,p_limit:500});
  if(error||!data||typeof data!=='object'||Array.isArray(data))throw Error('research_observed_roster_read_failed');
  const {members,...r}=data as Record<string,unknown>;
  if(Object.keys(r).some(k=>!RECEIPT_KEYS.includes(k))||r.schemaVersion!=='research-observed-roster-admission-v1'||!HASH.test(String(r.classifierHash))||!HASH.test(String(r.classificationHash))||r.snapshotHash!==snapshotHash||typeof r.mappingDigest!=='string'||!HASH.test(r.mappingDigest)||!Number.isInteger(r.includedCount)||Number(r.includedCount)<1||Number(r.includedCount)>5000||!Array.isArray(members)||members.length>500||sourceControllerInstant(String(r.receivedAt))>sourceControllerInstant(asOf)||sourceControllerInstant(String(r.latestObservedAt))>sourceControllerInstant(asOf))throw Error('research_observed_roster_read_failed');
  if(receipt&&JSON.stringify(receipt)!==JSON.stringify(r))throw Error('research_observed_roster_receipt_changed');receipt=r;
  rows.push(...members);size+=Buffer.byteLength(JSON.stringify(data));if(rows.length>5000||size>2_000_000)throw Error('research_priority_source_bound_exceeded');
  if(members.length<500)break;
 }
 if(!receipt||rows.length!==receipt.includedCount||new Set(rows.map(r=>r.symbol)).size!==rows.length||rows.some(r=>!/^\d{4}$/u.test(String(r.symbol))||!UUID.test(String(r.research_company_id))||!['TWSE','TPEX'].includes(String(r.exchange))||Object.keys(r).some(k=>!MEMBER_KEYS.includes(k))||!['symbol','exchange','isin','name','sector','cfi','observed_at'].every(k=>typeof r[k]==='string')||!String(r.name).trim()||!/^[A-Z0-9]{12}$/u.test(String(r.isin))||!/^ES[A-Z]{4}$/u.test(String(r.cfi))||sourceControllerInstant(String(r.observed_at))>sourceControllerInstant(asOf)))throw Error('research_observed_roster_read_failed');
 return {rows,receipt};
}
