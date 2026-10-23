/** Unwired, review-required LOCAL fixture candidate. No CLI, connection, production authority,
 * test registration, role creation, public RPC or arbitrary SQL/path input. */
import assert from 'node:assert/strict';
import {readResearchPublicationCatalog} from './opportunity-v3/research-publication-catalog.mjs';
import {readTailNamespace} from './opportunity-v3/research-publication-tail-entry-namespace.mjs';
import {canonicalTailMetadata,tailMetadataSha} from './opportunity-v3/research-publication-tail-entry-guard.mjs';

export const SOURCE_NAMESPACE_PROFILE=Object.freeze({
 schema:'vnext-local-source-namespace-candidate-v1',nativeVerified:false,productionAuthorized:false,
 observedSource:'ccc127179d881dfce2afe9edefb1c131c8aa1851',observedRuntime:'4204ce5e158a78411cfbfe01d7940b25c2fdeb19',
 observedRun:39959307306,observedJob:120432957199,
 scopeHash:'530bc6a701e824f06071c37850801a2b5a0dedd4f66affd94477e2382aae6185',
 namespaceHash:'16054f4e6542fa1adc697eda2a8429e356feb7798e50495fd23f10867117b842',
 catalogHash:'e11aa5072518b8590c416d1d76f64c093d0632c75dbddaf17d3c8d40f0dd8b2d',
 target:'research_source_fence_owner_v2',schemaOwner:'pg_database_owner',
});
export const SOURCE_NAMESPACE_GRANT='GRANT USAGE ON SCHEMA public TO research_source_fence_owner_v2';
// Exact current ccc readonly scope query, not the historical candidate36 profile.
export const SOURCE_SCOPE_SQL="SELECT jsonb_build_object('tables',(SELECT jsonb_agg(relname ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace),'functions',(SELECT jsonb_agg(DISTINCT proname ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace),'types',(SELECT jsonb_agg(typname ORDER BY typname) FROM pg_type WHERE typnamespace='public'::regnamespace),'roles',(SELECT jsonb_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_')) AS scope";
const clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>assert.equal(canonicalTailMetadata(a),canonicalTailMetadata(b),'vnext_source_namespace_unexpected_delta');
/** Empty simple Query -> actual backend ReadyForQuery I/T/E. An empty Query
 * does not COMMIT/ROLLBACK the caller's transaction, even when it is aborted.
 * Driver queue checks supplement, never replace, the actual protocol status.
 * Pinned pg8.18 internals are intentional: unknown driver state fails closed. */
export async function assertSourceNamespaceIdleClient(client){
 assert.ok(client&&client._connected===true&&client._queryable===true&&client._ending===false&&client._ended===false&&client.readyForQuery===true&&typeof client._getActiveQuery==='function'&&client._getActiveQuery()===null&&Array.isArray(client._queryQueue)&&client._queryQueue.length===0,'vnext_source_namespace_exclusive_client');
 let onReady,onError,onEnd,rejectReady;
 const ready=new Promise((resolve,reject)=>{
  rejectReady=reject;
  onReady=message=>resolve(message.status);onError=reject;onEnd=()=>reject(Error('vnext_source_namespace_connection_ended'));
  client.connection.once('readyForQuery',onReady);client.once('error',onError);client.once('end',onEnd);
 });
 try{
  const query=client.query('');query.catch(rejectReady);
  const [queried,protocol]=await Promise.allSettled([query,ready]);
  if(queried.status==='rejected')throw queried.reason;
  if(protocol.status==='rejected')throw protocol.reason;
  const result=queried.value,status=protocol.value;
  assert.equal(result.command,null,'vnext_source_namespace_empty_query');
  if(status!=='I'){const error=Error('vnext_source_namespace_existing_transaction');error.transactionStatus=status;throw error;}
  return {actualProtocolStatus:status,emptyQueryObserved:true};
 }finally{client.connection.removeListener('readyForQuery',onReady);client.removeListener('error',onError);client.removeListener('end',onEnd);}
}
// Extra actual OID/default/role-setting inventory is compared within the same
// transaction. Stable-name profiles above are never passed off as actual OIDs.
const rawSql=`SELECT jsonb_build_object(
 'namespaces',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.oid) FROM pg_namespace n WHERE n.nspname IN('public','auth','extensions')),
 'routines',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace IN('public'::regnamespace,'auth'::regnamespace,'extensions'::regnamespace)),
 'relations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace IN('public'::regnamespace,'auth'::regnamespace,'extensions'::regnamespace)),
 'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a WHERE a.attrelid IN(SELECT oid FROM pg_class WHERE relnamespace IN('public'::regnamespace,'auth'::regnamespace,'extensions'::regnamespace))),
 'types',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_type t WHERE t.typnamespace IN('public'::regnamespace,'auth'::regnamespace,'extensions'::regnamespace)),
 'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_constraint c WHERE c.connamespace IN('public'::regnamespace,'auth'::regnamespace,'extensions'::regnamespace)),
 'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_attrdef d),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p),
 'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t),
 'rules',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_rewrite r),
 'sequences',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.seqrelid) FROM pg_sequence s),
 'defaultAcls',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d),
 'roleSettings',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.setdatabase,s.setrole) FROM pg_db_role_setting s),
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor) FROM pg_auth_members m),
 'extensions',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) FROM pg_extension e)
 ) AS raw`;
// Same PG ordering/ACL codec as the existing catalog reader, with one fixed
// hypothetical row. This SELECT does not grant anything or invent a post hash.
const aclSql=`SELECT jsonb_agg(jsonb_build_array(grantor,grantee,privilege,is_grantable) ORDER BY grantor,grantee,privilege) AS acl FROM (
 SELECT pg_get_userbyid(x.grantor) AS grantor,CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,x.privilege_type AS privilege,x.is_grantable
 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.nspname='public'
 UNION ALL SELECT 'pg_database_owner','research_source_fence_owner_v2','USAGE',false) a`;

export function deriveSourceNamespacePost(before,proposedAcl){
 assert.equal(tailMetadataSha(before.scope),SOURCE_NAMESPACE_PROFILE.scopeHash,'vnext_source_namespace_scope');
 assert.equal(tailMetadataSha(before.namespace),SOURCE_NAMESPACE_PROFILE.namespaceHash,'vnext_source_namespace_predecessor');
 assert.equal(tailMetadataSha(before.catalog),SOURCE_NAMESPACE_PROFILE.catalogHash,'vnext_source_namespace_catalog');
 const post=projectSourceNamespaceCatalog(before.catalog,proposedAcl);
 return {catalog:post,catalogHash:tailMetadataSha(post),namespaceHash:tailMetadataSha(before.namespace)};
}
// Pure projection for focused contracts; it cannot establish the predecessor
// or apply a grant. The only apply path checks all three actual hashes first.
export function projectSourceNamespaceCatalog(catalog,proposedAcl){
 const target=SOURCE_NAMESPACE_PROFILE.target,role=catalog.roles.find(r=>r.name===target);
 assert.ok(role&&!role.login&&!role.super&&!role.createDb&&!role.createRole&&!role.replication&&!role.bypassRls&&role.config===null,'vnext_source_namespace_owner');
 assert.deepEqual(role.membership,[],'vnext_source_namespace_membership');
 const post=clone(catalog),schema=post.schemas.find(s=>s.name==='public');
 assert.equal(schema.owner,SOURCE_NAMESPACE_PROFILE.schemaOwner);
 const effective=schema.effectiveAcl.filter(row=>row[0]===target);assert.deepEqual(effective,[[target,false,false]]);
 assert.ok(!schema.acl.some(row=>row[1]===target),'vnext_source_namespace_existing_acl');
 const addition=['pg_database_owner',target,'USAGE',false];
 assert.equal(proposedAcl.length,schema.acl.length+1);assert.equal(proposedAcl.filter(row=>canonicalTailMetadata(row)===canonicalTailMetadata(addition)).length,1);
 same(proposedAcl.filter(row=>canonicalTailMetadata(row)!==canonicalTailMetadata(addition)),schema.acl);
 schema.acl=clone(proposedAcl);effective[0][1]=true;
 return post;
}
async function read(client){
 const scope=(await client.query(SOURCE_SCOPE_SQL)).rows[0].scope;
 const namespace=await readTailNamespace(client),catalog=await readResearchPublicationCatalog(client,scope);
 return {scope,namespace,catalog,raw:(await client.query(rawSql)).rows[0].raw};
}
export async function inspectSourceNamespaceCandidate(client){
 // Caller owns the transaction; this entry is SELECT-only and requires an
 // actual read-only transaction, not an untrusted validated/engineering flag.
 const state=(await client.query("SELECT current_setting('transaction_read_only') AS ro")).rows[0];assert.equal(state.ro,'on');
 const before=await read(client),post=deriveSourceNamespacePost(before,(await client.query(aclSql)).rows[0].acl);
 return {before,derivedPost:post,profile:SOURCE_NAMESPACE_PROFILE,grant:SOURCE_NAMESPACE_GRANT,applied:false};
}
/** Direct existing privileges only. This is an inspection list, not authority
 * or a proof of transitive SECURITY DEFINER safety. No SQL bodies/row values. */
export function sourceNamespaceReachability(before){
 for(const [part,key] of [['scope','scopeHash'],['namespace','namespaceHash'],['catalog','catalogHash']])assert.equal(tailMetadataSha(before[part]),SOURCE_NAMESPACE_PROFILE[key],'vnext_source_namespace_reachability_predecessor');
 return projectSourceNamespaceReachability(before.catalog);
}
export function projectSourceNamespaceReachability(catalog){
 const target=SOURCE_NAMESPACE_PROFILE.target,role=catalog.roles.find(r=>r.name===target),schema=catalog.schemas.find(s=>s.name==='public');
 const digest=value=>value===null?null:tailMetadataSha(value);
 const tables=catalog.tables.flatMap(table=>{
  const effective=[...table.effectiveAcl,...table.effectiveOtherAcl].filter(row=>row[0]===target&&row.slice(2).some(value=>value===true));
  return effective.length?[{name:table.name,owner:table.owner,rls:table.rls,forceRls:table.forceRls,ownerRlsBypass:table.owner===target&&!table.forceRls,effective,grantSources:table.acl.filter(row=>row[1]===target||row[1]==='PUBLIC'),columnGrants:table.columns.filter(c=>c.acl.some(row=>row[1]===target||row[1]==='PUBLIC')).map(c=>({name:c.name,acl:c.acl.filter(row=>row[1]===target||row[1]==='PUBLIC')})),policies:table.policies.map(p=>({name:p.name,command:p.command,permissive:p.permissive,roles:p.roles,usingSha256:digest(p.using),checkSha256:digest(p.check)}))}]:[];
 });
 const routines=catalog.functions.filter(fn=>fn.effectiveAcl.some(row=>row[0]===target&&row[1]===true)).map(fn=>({signature:fn.signature,owner:fn.owner,securityDefiner:fn.securityDefiner,definitionSha256:fn.definitionSha256,grantSources:fn.acl.filter(row=>row[1]===target||row[1]==='PUBLIC'),configSha256:digest(fn.config),searchPath:(fn.config||[]).filter(value=>value.startsWith('search_path='))}));
 return {schema:'vnext-source-namespace-direct-reachability-v1',target,role:{name:role.name,login:role.login,inherit:role.inherit,super:role.super,createRole:role.createRole,createDb:role.createDb,replication:role.replication,bypassRls:role.bypassRls,membership:role.membership,configSha256:digest(role.config)},publicSchema:{owner:schema.owner,currentEffective:schema.effectiveAcl.filter(row=>row[0]===target),proposedUsageOnly:true},tables,routines,directOnly:true,transitiveDefinerBodyReview:'REQUIRED_NOT_APPROVED',rowsOrBodiesPublished:false,grantExecuted:false};
}
/** SOURCE ONLY until independent review; deliberately not imported by any test
 * entry, worker, route, migration runner or workflow. Fresh LOCAL caller only. */
export async function applySourceNamespaceEngineeringCandidate(client){
 // Reject pre-existing T/E/unknown before the try/finally that owns any lock
 // or transaction. Do not roll back, commit, unlock or close caller's work.
 await assertSourceNamespaceIdleClient(client);
 let locked=false,open=false,primary;
 try{
  assert.equal((await client.query("SELECT pg_try_advisory_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0)) AS locked")).rows[0].locked,true,'vnext_source_namespace_busy');locked=true;
  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');open=true;
  await client.query("SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s'");
  await client.query('SELECT pg_advisory_xact_lock(610091002::bigint)');
  await client.query('SELECT pg_advisory_xact_lock(2409,6002)');
  await client.query('SELECT pg_advisory_xact_lock(64221022)');
  const before=await read(client),expected=deriveSourceNamespacePost(before,(await client.query(aclSql)).rows[0].acl);
  await client.query(SOURCE_NAMESPACE_GRANT);
  const after=await read(client);same(after.scope,before.scope);same(after.namespace,before.namespace);same(after.catalog,expected.catalog);
  const rawBefore=clone(before.raw),rawAfter=clone(after.raw);
  const nBefore=rawBefore.namespaces.find(n=>n.nspname==='public'),nAfter=rawAfter.namespaces.find(n=>n.nspname==='public');
  // Exact full raw OID/nonbody/default ACL inventory, excluding only the one
  // already independently checked schema ACL field. No pg_catalog UPDATE.
  delete nBefore.nspacl;delete nAfter.nspacl;same(rawAfter,rawBefore);
  await client.query('COMMIT');open=false;
  return {status:'committed',engineeringOnly:true,productionAuthorized:false,profile:SOURCE_NAMESPACE_PROFILE,before,after,derivedPost:expected};
 }catch(error){primary=error;throw error;}finally{
  if(open)try{await client.query('ROLLBACK');}catch(error){if(primary)primary.rollbackError=error;else throw error;}
  if(locked)try{assert.equal((await client.query("SELECT pg_advisory_unlock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0)) AS unlocked")).rows[0].unlocked,true);}catch(error){if(primary)primary.unlockError=error;else throw error;}
 }
}
