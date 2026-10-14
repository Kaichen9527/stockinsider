import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {readResearchPublicationCatalog} from './research-publication-catalog.mjs';
import {readTailNamespace} from './research-publication-tail-entry-namespace.mjs';
export const TARGETS=Object.freeze(['research_input_preparation_owner_v2','research_source_fence_owner_v2']);
export const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
export async function readPrerequisiteState(client){
 const scope=(await client.query(`SELECT jsonb_build_object('tables',(SELECT jsonb_agg(relname ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace),'functions',(SELECT jsonb_agg(DISTINCT proname ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace),'types',(SELECT jsonb_agg(typname ORDER BY typname) FROM pg_type WHERE typnamespace='public'::regnamespace),'roles',(SELECT jsonb_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_')) s`)).rows[0].s;
 const namespace=await readTailNamespace(client),catalog=await readResearchPublicationCatalog(client,scope);
 const details=(await client.query(`SELECT jsonb_build_object('schemaOid','public'::regnamespace::oid,'schemaOwner',(SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE oid='public'::regnamespace),'roles',(SELECT jsonb_agg(jsonb_build_object('oid',r.oid,'name',r.rolname,'login',r.rolcanlogin,'inherit',r.rolinherit,'super',r.rolsuper,'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,'limit',r.rolconnlimit,'config',r.rolconfig,'validUntil',r.rolvaliduntil::text,'passwordNull',a.rolpassword IS NULL) ORDER BY r.rolname) FROM pg_roles r JOIN pg_authid a USING(oid) WHERE r.rolname=ANY($1::text[])),'memberships',(SELECT coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(m.roleid),pg_get_userbyid(m.member),pg_get_userbyid(m.grantor),m.admin_option,m.inherit_option,m.set_option) ORDER BY m.roleid,m.member),'[]') FROM pg_auth_members m WHERE m.roleid IN (SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[])) OR m.member IN (SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))),'objects',(SELECT jsonb_agg(jsonb_build_array(class,oid,name) ORDER BY class,name) FROM (SELECT 'relation' class,c.oid,n.nspname||'.'||c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','extensions') UNION ALL SELECT 'function',p.oid,p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','extensions') UNION ALL SELECT 'type',t.oid,n.nspname||'.'||t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','extensions')) o)) d`,[TARGETS])).rows[0].d;
 return {scope,namespace,catalog,details};
}
export function stateDescriptor(state){
 return {schema:state.catalog.schemas.find(x=>x.name==='public'),roles:state.details.roles.map(({oid,...r})=>r),memberships:state.details.memberships,namespaceHash:digest(state.namespace),catalogHash:digest(state.catalog),schemaOwner:state.details.schemaOwner};
}
const descriptorUrl=new URL('./research-versioned-prerequisite-profile.json',import.meta.url);
export function prerequisiteDescriptor(){const b=fs.readFileSync(descriptorUrl);if(createHash('sha256').update(b).digest('hex')!=='3d6cf36330519a9382f2cce8fa1a6cc9484843a594d0df312ecc2ab60a0436db')throw Error('versioned_prerequisite_descriptor_bytes_changed');return JSON.parse(b.toString('utf8'));}
export function assertPrerequisiteDescriptor(actual){
 const expected=prerequisiteDescriptor();
 if(canonical(actual)===canonical(expected.predecessor))return 'predecessor';
 if(canonical(actual)===canonical(expected.successor))return 'successor';
 throw Error('versioned_prerequisite_profile_mismatch');
}
export const PREREQUISITE_LOCK="SELECT pg_try_advisory_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0)) AS locked";
export const PREREQUISITE_GRANT='GRANT USAGE ON SCHEMA public TO research_input_preparation_owner_v2,research_source_fence_owner_v2';
/** LOCAL engineering only. Caller injects a fresh, exclusive client, outside any transaction. No CLI/connection/authority. */
export async function applyVersionedPrerequisiteEngineering(client){
 let locked=false,open=false,primary;
 try{
  if((await client.query(PREREQUISITE_LOCK)).rows?.[0]?.locked!==true)throw Error('versioned_prerequisite_busy');locked=true;
  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');open=true;
  await client.query("SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='2s'");
  const before=await readPrerequisiteState(client),kind=assertPrerequisiteDescriptor(stateDescriptor(before));
  if(kind==='predecessor')await client.query(PREREQUISITE_GRANT);
  const after=await readPrerequisiteState(client);
  if(assertPrerequisiteDescriptor(stateDescriptor(after))!=='successor')throw Error('versioned_prerequisite_postcondition');
  if(canonical(before.details)!==canonical(after.details))throw Error('versioned_prerequisite_identity_changed');
  await client.query('COMMIT');open=false;
  return Object.freeze({status:kind==='successor'?'exact_noop':'committed',engineeringOnly:true,productionAuthorized:false,profileHash:digest(prerequisiteDescriptor()),before:digest(stateDescriptor(before)),after:digest(stateDescriptor(after))});
 }catch(e){primary=e;throw e;}finally{
  if(open)try{await client.query('ROLLBACK');}catch{if(primary)primary.cleanupIncomplete=true;}
  if(locked)try{await client.query("SELECT pg_advisory_unlock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0))");}catch{if(primary)primary.cleanupIncomplete=true;}
  try{await client.end();}catch(e){if(primary)primary.cleanupIncomplete=true;else throw e;}
 }
}
