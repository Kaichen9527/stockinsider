import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {MIGRATIONS,applyReviewedMigrationPlanToClient} from './apply-reviewed-migrations.mjs';
import {migrationBodyInAtomicTransaction} from './atomic-migration-chain.mjs';
import {FINANCIAL_TAIL,selectFinancialHistoryChain,orderedHash,verifyFinancialHistoryPostconditions} from './financial-history-install-guard.mjs';
import {OWNERSHIP_PRELUDE,makeFinancialExistingSchemaProfile} from './financial-existing-schema-profile.mjs';
import {ensureVpsRuntimeRole,snapshotVpsRuntimeRole} from './financial-vps-operator-action.mjs';
import {financialOperatorActionIdentity} from './financial-vps-operator-binding.mjs';
import {readFinancialHistoryCatalog} from './financial-history-catalog.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {Client}=createRequire(import.meta.url)('pg');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const artifacts=process.env.FINANCIAL_EXISTING_SCHEMA_ARTIFACTS;
if(!artifacts||!path.isAbsolute(artifacts))throw Error('private_absolute_artifacts_required');
fs.mkdirSync(artifacts,{mode:0o700});
const save=(name,value)=>fs.writeFileSync(path.join(artifacts,name),JSON.stringify(value,null,2)+'\n');
const errorValue=e=>({name:e?.name,message:e?.message,code:e?.code,position:e?.position,detail:e?.detail,hint:e?.hint,schema:e?.schema,table:e?.table,routine:e?.routine});
const gz=fs.readFileSync(new URL('./fixtures/vps-schema-20261011.sql.gz',import.meta.url));
const captured=gunzipSync(gz);
assert.equal(sha(gz),'2e9fc2f8a795a13490c12a90a2d9c974e19c1e93f9593d443d834978e0a19c60');
assert.equal(sha(captured),'a82e3b089ee0523a9de3b1a84c0e799d878fa47bb6ec892a51af8c8e037c3731');
const load=relativePath=>{const bytes=fs.readFileSync(path.join(root,relativePath));return {relativePath,bytes,sha256:sha(bytes)};};
const migrations=selectFinancialHistoryChain(MIGRATIONS.map(load),load(FINANCIAL_TAIL),true);
const plan={migrations,chainSha256:orderedHash(migrations),financialExistingSchemaProfile:makeFinancialExistingSchemaProfile(migrations,load(OWNERSHIP_PRELUDE)),operatorPrerequisite:financialOperatorActionIdentity()};
assert.equal(plan.migrations.length,49);assert.equal(plan.chainSha256,'cec630ce83aea1f7bdcafae815990e2e964ebbf599a3441e08d978e4427f46cd');
const bodyPaths=new Map([...plan.financialExistingSchemaProfile.preludes,...migrations].map(m=>[sha(migrationBodyInAtomicTransaction(m.bytes.toString('utf8'))),m.relativePath]));
const options={privateVpsPeerOperator:true,bootstrapVpsRuntimeRole:true,financialExistingSchemaProfile:true,sourceCommit:null,attestationCommit:null};
const snapshotSql=`SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
  'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p')),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,
  'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'inherit',rolinherit,
  'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'bypassRls',rolbypassrls,'connectionLimit',rolconnlimit,'config',rolconfig,'validUntil',rolvaliduntil) ORDER BY rolname) FROM pg_roles),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),
  'grantor',pg_get_userbyid(grantor),'admin',admin_option,'inherit',inherit_option,'set',set_option) ORDER BY roleid,member) FROM pg_auth_members),
 'schemaAcl',(SELECT nspacl FROM pg_namespace WHERE nspname='public')) AS snapshot`;
const ownerSql=`SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,p.proconfig,
 encode(extensions.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex') AS body_sha256,
 p.prosecdef,p.proacl,p.prokind,p.proisstrict,p.proleakproof,p.proparallel,p.provolatile,p.proargnames,
 (SELECT lanname FROM pg_language WHERE oid=p.prolang) AS language,pg_get_function_result(p.oid) AS result_type,
 (SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) AS acl_rows
 FROM pg_proc p WHERE p.oid=ANY(ARRAY[
 to_regprocedure('public.read_legacy_release_checkpoints_v3_19()'),
 to_regprocedure('public.append_legacy_source_shard_v3_19(uuid,uuid,text,jsonb)'),
 to_regprocedure('public.schedule_legacy_source_shard_successor_v3_19(uuid,uuid,uuid,text,integer,uuid)'),
 to_regprocedure('public.append_legacy_expired_producer_diagnostic_v3_20(uuid,uuid,text,text,text,text,text,timestamptz)'),
 to_regprocedure('public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)')]) ORDER BY signature`;

test('financial installer corrected wrapper targets and writer-transaction authority audit',async t=>{
 const bin=execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'si-fin49-')),data=path.join(directory,'pg'),port=56000+process.pid%1000;
 let running=false;const clients=new Set();const trace=[];const pending=['successful first profile50 commit','apply twice','nonempty seed and full catalog/data','forced failure after genuine predecessor replacement','partial residue/changed config','disconnect','competing install lock'];
 const connect=async()=>{const c=new Client({host:directory,port,user:'postgres',database:'postgres',statement_timeout:30000,query_timeout:35000});clients.add(c);await c.connect();return c;};
 const lineage=[];
 const claimProfilesSql=`SELECT p.oid::text AS oid,p.oid::regprocedure::text AS signature,
 pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl,p.proargnames,pg_get_function_result(p.oid) AS result,
 encode(extensions.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex') AS body_sha256,
 (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantee,x.grantor,x.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x) AS acl
 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN (
 'claim_legacy_producer_job_v3_11','claim_legacy_producer_job_pre_handoff_v3_19_16','claim_legacy_producer_job_pre_kol_authority_v3_20','claim_legacy_producer_job_pre_kol_retention_bridge_v3_20_1',
 'claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2','claim_legacy_producer_job_full_candidate_authority_base_v3_19_11','claim_legacy_producer_job_candidate_authority_base_v3_19_10',
 'claim_legacy_producer_job_authoritative_v3_16','verify_legacy_claim_delegation_chain_v3_20') ORDER BY signature`;
 const collectWriterAudit=async(query,ctx)=>{
  const tx=(await query('SELECT pg_backend_pid() AS pid,txid_current()::text AS xid')).rows[0];
  const profiles=(await query(claimProfilesSql)).rows;
  const bodies=(await query("SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition,p.prosrc FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'claim_legacy_producer_job%' OR p.oid=to_regprocedure('public.verify_legacy_claim_delegation_chain_v3_20()') ORDER BY signature")).rows;
  save('failed-writer-final-profiles.json',{writerTransaction:tx,profiles,bodies,notCapturedOrRollbackConnection:true});
  const verifier=bodies.find(p=>p.signature==='verify_legacy_claim_delegation_chain_v3_20()');
  assert.ok(verifier);const verifyBody=verifier.prosrc.trim().replace(/;$/u,'');assert.ok(verifyBody.startsWith('SELECT'));const children=verifyBody.slice(6).split(/\s+AND\s+/iu);
  const childResults=[];for(let i=0;i<children.length;i++)childResults.push({index:i,expression:children[i].trim(),value:(await query(`SELECT (${children[i]}) AS value`)).rows[0].value});
  save('failed-writer-verifier-child-predicates.json',{writerTransaction:tx,bodySha256:sha(verifier.prosrc),source:verifier.prosrc,children:childResults,whole:(await query('SELECT public.verify_legacy_claim_delegation_chain_v3_20() AS value')).rows[0].value});
  const compaction=(await query(`SELECT jsonb_build_object('exists',to_regprocedure('public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)') IS NOT NULL,
   'delegation',public.verify_legacy_claim_delegation_chain_v3_20(),
   'ownerExpectedLegacy',(SELECT pg_get_userbyid(proowner)='legacy_correctness_rpc_owner' FROM pg_proc WHERE oid='public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)'::regprocedure),
   'securityDefiner',(SELECT prosecdef FROM pg_proc WHERE oid='public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)'::regprocedure),
   'sourceCutoff',(SELECT pg_get_functiondef(oid) LIKE '%sourceCutoff%' FROM pg_proc WHERE oid='public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)'::regprocedure),
   'noCoarseUniverse',(SELECT pg_get_functiondef(oid) NOT LIKE '%coarseUniverseRows%' FROM pg_proc WHERE oid='public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)'::regprocedure),
   'serviceCannotExecute',NOT has_function_privilege('service_role','public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)','EXECUTE'),
   'serviceCannotVerify',NOT has_function_privilege('service_role','public.verify_legacy_claim_delegation_chain_v3_20()','EXECUTE'),
   'runtimeCannotExecute',NOT has_function_privilege('stockinsider_runtime_v319','public.claim_legacy_producer_job_authoritative_v3_16(uuid,uuid,uuid,integer)','EXECUTE')) AS components`)).rows[0].components;
  save('failed-writer-compaction-components.json',{writerTransaction:tx,components:compaction});
  const acl=(await query(`SELECT p.oid::text AS oid,p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proargnames,p.proacl,pg_get_function_result(p.oid) AS result,
   encode(extensions.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex') AS body_sha256,
   (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantee,x.grantor) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x) AS acl,
   jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) AS effectiveExecute
   FROM pg_proc p WHERE p.oid='public.legacy_correctness_immutable_v3_11()'::regprocedure`)).rows[0];
  const columns=(await query(`SELECT a.attname,a.attacl,format_type(a.atttypid,a.atttypmod) AS type,
   has_column_privilege('anon',a.attrelid,a.attnum,'SELECT') AS anon_select,has_column_privilege('authenticated',a.attrelid,a.attnum,'SELECT') AS authenticated_select,
   has_column_privilege('service_role',a.attrelid,a.attnum,'SELECT') AS service_select,
   has_column_privilege('service_role',a.attrelid,a.attnum,'UPDATE') AS service_update FROM pg_attribute a WHERE a.attrelid='public.opportunity_financial_observations_v1'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`)).rows;
  save('failed-writer-immutable-acl-effective-audit.json',{writerTransaction:tx,function:acl,observationColumns:columns,permissionsModified:false});
  if(ctx){
   const source=fs.readFileSync(path.join(root,'scripts/opportunity-v3/apply-reviewed-migrations.mjs'),'utf8');const b=source.indexOf('const verified=(await client.query(`')+'const verified=(await client.query(`'.length;const sql=source.slice(b,source.indexOf(') result`)).rows[0]?.result;')+') result'.length);
   const leaseTarget='public.claim_legacy_producer_job_pre_kol_authority_v3_20(uuid,uuid,uuid,integer)';const retentionTarget='public.claim_legacy_producer_job_pre_source_terminal_projection_v3_20_2(uuid,uuid,uuid,integer)';
   const mutateBody=async(target,from,to)=>{const original=(await query('SELECT pg_get_functiondef($1::regprocedure) AS definition',[target])).rows[0].definition;assert.ok(original.includes(from));await query(original.replaceAll(from,to));};
   for(const [label,target,mutation,key] of [
    ['lease119',leaseTarget,()=>mutateBody(leaseTarget,'120 seconds','119 seconds'),'finalClaimHandoff'],
    ['retention-marker-removed',retentionTarget,()=>mutateBody(retentionTarget,'kolRetentionAuthorityContract','removedRetentionAuthority'),'v320KolRetentionBridge'],
    ['retention-owner',retentionTarget,()=>query(`ALTER FUNCTION ${retentionTarget} OWNER TO postgres`),'v320KolRetentionBridge'],
    ['retention-security-invoker',retentionTarget,()=>query(`ALTER FUNCTION ${retentionTarget} SECURITY INVOKER`),'v320KolRetentionBridge']
   ])await ctx.test(`correct wrapper rejects ${label} while public outer remains`,async()=>{
    await query('SAVEPOINT wrapper_negative');try{await mutation();const outer=(await query("SELECT to_regprocedure('public.claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)') IS NOT NULL AS present")).rows[0].present;assert.equal(outer,true);
     const value=(await query(sql)).rows[0].result;assert.equal(value[key],false);save(`wrapper-negative-${label}.json`,{writerTransaction:tx,target,outerPresent:outer,rejectedKey:key,value:value[key]});
    }finally{await query('ROLLBACK TO wrapper_negative');await query('RELEASE wrapper_negative');}
   });
   assert.deepEqual((await query(claimProfilesSql)).rows,profiles,'all negative mutations restore same writer profiles');
  }
 };
 const traced=(client,ctx)=>{const query=client.query.bind(client);client.query=async(...args)=>{const text=typeof args[0]==='string'?args[0]:args[0]?.text;const row={at:new Date().toISOString(),sha256:sha(text??''),migration:bodyPaths.get(sha(text??''))??null,kind:(text??'').slice(0,60)};trace.push(row);try{const result=await query(...args);
  if(row.migration){lineage.push({migration:row.migration,sqlSha256:row.sha256,queryTime:row.at,writerTransaction:(await query('SELECT pg_backend_pid() AS pid,txid_current()::text AS xid')).rows[0],profiles:(await query(claimProfilesSql)).rows});save('writer-lineage-after-each-migration.json',lineage);}
  if(text?.includes("'v314Diagnostics'")){save('full-postcondition-predicate-values.json',result.rows?.[0]?.result??null);save('financial-catalog-before-original-postcondition-rejection.json',await readFinancialHistoryCatalog({query}));save('role-before-original-postcondition-rejection.json',await snapshotVpsRuntimeRole({query}));await collectWriterAudit(query,ctx);}return result;
 }catch(e){row.error=errorValue(e);save('query-trace.json',trace);throw e;}};return client;};
 let stage='initdb';
 try {
  execFileSync(path.join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-instructions'],{stdio:'pipe'});
  execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(directory,'pg.log'),'-o',`-h '' -k ${directory} -p ${port}`,'-w','start'],{stdio:'pipe'});running=true;
  let a=await connect();stage='unchanged bootstrap/schema restore';
  const bootstrapBytes=fs.readFileSync(path.join(root,'deployment/vps/bootstrap-stockinsider-postgres.sql'));
  const bootstrap=bootstrapBytes.toString('utf8').replaceAll(/^\\set.*$/gm,'');
  await a.query(bootstrap);await a.query('ALTER SCHEMA public RENAME TO fixture_bootstrap_public');await a.query('ALTER SCHEMA extensions RENAME TO fixture_bootstrap_extensions');
  const schema=captured.toString('utf8').replaceAll(/^\\(?:restrict|unrestrict).*$/gm,'').replace('CREATE SCHEMA extensions;','ALTER SCHEMA fixture_bootstrap_extensions RENAME TO extensions;');
  save('restore-input.json',{gzipSha256:sha(gz),capturedSchemaSha256:sha(captured),bootstrapBytesSha256:sha(bootstrapBytes),executedBootstrapSha256:sha(bootstrap),executedSchemaSha256:sha(schema),onlyRestoreRebases:'original helper strips psql metacommands and moves existing pgcrypto schema; no schema stubs or role amendment',clusterBootstrapPrincipal:'synthetic postgres as original restoration; environment USER remains OS-derived'});
  await a.query(schema);await a.end();clients.delete(a);a=await connect();
  save('restored-owner-profile.json',(await a.query(ownerSql)).rows);
  save('restored-role-profile.json',(await a.query("SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolconnlimit,has_schema_privilege(oid,'public','CREATE') AS public_create FROM pg_roles WHERE rolname IN ('postgres','stockinsider_runtime_v319','opportunity_v3_rpc_owner','legacy_correctness_rpc_owner') ORDER BY rolname")).rows);
  const functionName='public.claim_legacy_producer_job_authoritative_v3_13(uuid,uuid,uuid,integer)';
  const installerSource=fs.readFileSync(path.join(root,'scripts/opportunity-v3/apply-reviewed-migrations.mjs'),'utf8');
  const queryStart=installerSource.indexOf('const verified=(await client.query(`')+'const verified=(await client.query(`'.length;
  const fullQuery=installerSource.slice(queryStart,installerSource.indexOf(') result`)).rows[0]?.result;')+') result'.length);
  const markerStart=fullQuery.indexOf(",'v320KolProjectionMarker',")+",'v320KolProjectionMarker',".length;
  const markerPredicate=fullQuery.slice(markerStart,fullQuery.indexOf(",'v320KolRetentionBridge',",markerStart)).trim();
  const originalFunction=(await a.query('SELECT pg_get_functiondef($1::regprocedure) AS definition,prosrc FROM pg_proc WHERE oid=$1::regprocedure',[functionName])).rows[0];
  for(const [count,hasExpression,expected] of [[0,false,false],[1,true,false],[2,true,true],[3,true,false],[2,false,false]])await t.test(`real PG marker predicate count${count} expression${hasExpression} -> ${expected}`,async()=>{
   const expr=hasExpression?"IF false THEN PERFORM v_source_result.result_json->'legacyRadarCompatibility'; END IF;":"";
   const comments='legacyRadarCompatibility '.repeat(count-(hasExpression?1:0));
   const body=`DECLARE v_source_result record; BEGIN /* ${comments} */ ${expr} RETURN '{}'::jsonb; END;`;
   assert.equal(originalFunction.definition.split(originalFunction.prosrc).length,2);
   await a.query('BEGIN');try{
    await a.query(originalFunction.definition.replace(originalFunction.prosrc,body));
    const actualCount=(await a.query("SELECT (length(pg_get_functiondef($1::regprocedure))-length(replace(pg_get_functiondef($1::regprocedure),'legacyRadarCompatibility','')))/length('legacyRadarCompatibility') AS count",[functionName])).rows[0].count;assert.equal(actualCount,count);
    const result=(await a.query(`SELECT ${markerPredicate} AS accepted`)).rows[0].accepted;assert.equal(result,expected);
    save(`marker-${count}-${hasExpression}.json`,{count,hasExpression,expected,result,predicateSha256:sha(markerPredicate)});
   }finally{await a.query('ROLLBACK');}
  });
  await a.query(`INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at)
   VALUES('a11d4e67-7d0a-4c44-8a9d-1d5c3b875003','opportunity_runner','2026-01-01',NULL,'active',repeat('9',64),clock_timestamp());
   INSERT INTO public.stocks(id,symbol,name,market) VALUES('71300000-0000-4000-8000-000000000083','9183','Synthetic financial installer fixture','TW');
   SELECT * FROM public.append_financial_fact_v3(ROW(
    '71300000-0000-4000-8000-000000000083','net_asset_value',NULL,'2025-01-01','instant',100,
    'TWD','twse','official_filing','reported','reported_period','2025-01-02T00:00:00Z',
    '2025-01-02T00:00:00Z','2025-01-02T01:00:00Z',NULL,'twse-openapi:synthetic-atomic-rollback')::public.financial_fact_input_v3,
    'a11d4e67-7d0a-4c44-8a9d-1d5c3b875003');`);
  const facts=async()=> (await a.query('SELECT jsonb_agg(to_jsonb(f) ORDER BY fact_id) AS facts FROM public.opportunity_financial_facts_v3 f')).rows[0].facts;
  const observations=async()=> (await a.query('SELECT jsonb_agg(to_jsonb(o) ORDER BY observation_id) AS observations FROM public.opportunity_financial_observations_v1 o')).rows[0].observations;
  const seededFacts=await facts();assert.equal(seededFacts.length,1);save('nonempty-real-rpc-seed.json',seededFacts);
  const before=(await a.query(snapshotSql)).rows[0].snapshot;save('before-first-apply.json',before);

  const operatorDeps={operatorPrerequisiteExecutor:async client=>({transport:{engineeringOnly:true,privatePeerTransportVerified:false,effectiveHbaVerified:false},role:await ensureVpsRuntimeRole(client)})};
  await t.test('actual nonempty membership rejects before operator role mutation and rolls back',async()=>{
   await a.query('BEGIN');try {
    await a.query('GRANT service_role TO stockinsider_runtime_v319');const withMember=await snapshotVpsRuntimeRole(a);assert.equal(withMember.memberships.length,1);
    await assert.rejects(ensureVpsRuntimeRole(a),/profile_unknown/u);assert.deepEqual(await snapshotVpsRuntimeRole(a),withMember);save('membership-rejection.json',withMember);
   }finally{await a.query('ROLLBACK');}
   assert.deepEqual((await a.query(snapshotSql)).rows[0].snapshot,before);
  });
  await t.test('actual original bootstrap and exact LOGIN6 replay preserve authority; outer rollback',async()=>{
   await a.query('BEGIN');try{
    const predecessor=await snapshotVpsRuntimeRole(a);const initial=await ensureVpsRuntimeRole(a);assert.equal(initial.noOpReplay,false);
    const changed=await snapshotVpsRuntimeRole(a);assert.deepEqual(changed,{...predecessor,login:true,connectionLimit:6});
    assert.equal((await ensureVpsRuntimeRole(a)).noOpReplay,true);assert.deepEqual(await snapshotVpsRuntimeRole(a),changed);save('runtime-bootstrap-replay.json',{predecessor,changed});
   }finally{await a.query('ROLLBACK');}
   assert.deepEqual((await a.query(snapshotSql)).rows[0].snapshot,before);
  });
  const replacementPath='migrations/20260816_financial_fact_recollection_idempotency_v3_16_16.sql';
  const replacementSql=migrationBodyInAtomicTransaction(load(replacementPath).bytes.toString('utf8'));
  const beforeReplacementDefinition=(await a.query("SELECT pg_get_functiondef('public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)'::regprocedure) AS body")).rows[0].body;
  await t.test('forced failure after genuine predecessor replacement rolls back role/catalog/ACL/nonempty facts',async()=>{
   const writer=traced(await connect());const realQuery=writer.query.bind(writer);let replacementReached=false;
   writer.query=async(...args)=>{const immediateBefore=args[0]===replacementSql?(await realQuery("SELECT pg_get_functiondef('public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)'::regprocedure) AS body")).rows[0].body:null;const result=await realQuery(...args);if(args[0]===replacementSql){
    replacementReached=true;const body=(await realQuery("SELECT pg_get_functiondef('public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)'::regprocedure) AS body")).rows[0].body;
    const role=await snapshotVpsRuntimeRole(writer);assert.equal(role.login,true);assert.equal(role.connectionLimit,6);assert.notEqual(body,immediateBefore);
    save('forced-replacement-witness.json',{replacementReached,bodyBeforeMigration:immediateBefore,bodyAfterMigration:body,capturedBaselineBody:beforeReplacementDefinition,role});throw Error('synthetic_forced_failure_after_genuine_replacement');}return result;};
   await assert.rejects(applyReviewedMigrationPlanToClient(writer,plan,options,operatorDeps),/synthetic_forced_failure_after_genuine_replacement/u);
   assert.equal(replacementReached,true);assert.deepEqual((await a.query(snapshotSql)).rows[0].snapshot,before);assert.deepEqual(await facts(),seededFacts);
   save('forced-rollback-snapshot.json',(await a.query(snapshotSql)).rows[0].snapshot);
  });
  await t.test('actual first apply through new opt-in profile and unchanged 49 chain',async child=>{
   stage='first financial profile50 apply';const writer=traced(await connect(),child);
   try{const result=await applyReviewedMigrationPlanToClient(writer,plan,options,operatorDeps);save('first-apply-result.json',result);pending.shift();}catch(e){
    save('first-apply-error.json',errorValue(e));const after=(await a.query(snapshotSql)).rows[0].snapshot;save('after-first-apply-failure.json',after);save('owner-profile-after-failure.json',(await a.query(ownerSql)).rows);
    assert.deepEqual(after,before,'failed first install must roll back full public functions/table ACL/roles/membership/schema state');
    throw e;
   }finally{clients.delete(writer);}
  });
  // Stop dependent stages on first genuine failure; no corrective role/prelude is applied here.
  if(fs.existsSync(path.join(artifacts,'first-apply-error.json')))throw Error('dependent_stages_blocked_by_first_apply');
  const firstCatalog=await readFinancialHistoryCatalog(a);await verifyFinancialHistoryPostconditions(a);save('first-installed-financial-catalog.json',firstCatalog);
  const installedFacts=await facts();assert.deepEqual(installedFacts,seededFacts);const installedObservations=await observations();assert.equal(installedObservations.length,1);
  save('after-first-install-data.json',{facts:installedFacts,observations:installedObservations});
  await t.test('full actual postcondition query parses/executes; every original predicate true',async()=>{
   const value=(await a.query(fullQuery)).rows[0].result;assert.ok(value);assert.ok(Object.values(value).every(v=>v===true));save('complete-original-postcondition-result.json',value);
  });
  await t.test('second actual operator+profile50 apply preserves full financial catalog and nonempty rows',async()=>{
   stage='second financial profile50 apply';const replayResult=await applyReviewedMigrationPlanToClient(traced(await connect()),plan,options,operatorDeps);save('second-apply-result.json',replayResult);
   await verifyFinancialHistoryPostconditions(a);assert.deepEqual(await readFinancialHistoryCatalog(a),firstCatalog);assert.equal(replayResult.operatorPrerequisite.result.role.noOpReplay,true);
   assert.deepEqual(await facts(),installedFacts);assert.deepEqual(await observations(),installedObservations);
  });
  const installedSnapshot=(await a.query(snapshotSql)).rows[0].snapshot;
  for(const [label,mutation,reason] of [
   ['partial',"DROP FUNCTION public.read_financial_history_page_v1(uuid,public.financial_fact_key_v3,public.financial_duration_kind_v3,public.financial_estimate_kind_v3,public.financial_estimate_horizon_v3,date,date,timestamptz,uuid,integer,uuid)",/partial_residue/u],
   ['config',"ALTER FUNCTION public.append_financial_fact_v3(public.financial_fact_input_v3,uuid) SET search_path=public",/postcondition_failed/u]
  ])await t.test(`installed ${label} rejects before operator/prelude/base mutations`,async()=>{
   const writer=traced(await connect());const query=writer.query.bind(writer);let beginSeen=false;let mutations=0;
   writer.query=async(...args)=>{const value=await query(...args);if(args[0]==='SET TRANSACTION ISOLATION LEVEL READ COMMITTED'){await query(mutation);beginSeen=true;}
    if(bodyPaths.has(sha(typeof args[0]==='string'?args[0]:''))||typeof args[0]==='string'&&args[0].startsWith('ALTER ROLE'))mutations++;return value;};
   await assert.rejects(applyReviewedMigrationPlanToClient(writer,plan,options,operatorDeps),reason);assert.equal(beginSeen,true);assert.equal(mutations,0);
   assert.deepEqual((await a.query(snapshotSql)).rows[0].snapshot,installedSnapshot);assert.deepEqual(await facts(),installedFacts);assert.deepEqual(await observations(),installedObservations);
  });
  await t.test('real writer disconnect after predecessor replacement makes server rollback',async()=>{
   const writer=traced(await connect());const query=writer.query.bind(writer);let reached=false;let pid;
   pid=(await query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   writer.query=async(...args)=>{const value=await query(...args);if(args[0]===replacementSql){reached=true;await writer.end();throw Error('synthetic_actual_writer_disconnect');}return value;};
   await assert.rejects(applyReviewedMigrationPlanToClient(writer,plan,options,operatorDeps),/synthetic_actual_writer_disconnect/u);assert.equal(reached,true);
   const deadline=Date.now()+5000;let gone=false;while(Date.now()<deadline&&!gone){gone=!(await a.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1) AS active',[pid])).rows[0].active;if(!gone)await new Promise(r=>setTimeout(r,10));}assert.equal(gone,true);
   assert.deepEqual((await a.query(snapshotSql)).rows[0].snapshot,installedSnapshot);assert.deepEqual(await facts(),installedFacts);assert.deepEqual(await observations(),installedObservations);save('disconnect-witness.json',{pid,reached,serverBackendGone:gone});
  });
  await t.test('competing actual shared lock rejects with no BEGIN or mutation',async()=>{
   await a.query("SELECT pg_advisory_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0))");
   try{const writer=traced(await connect());let began=false;const query=writer.query.bind(writer);writer.query=async(...args)=>{if(args[0]==='BEGIN')began=true;return query(...args);};
    await assert.rejects(applyReviewedMigrationPlanToClient(writer,plan,options,operatorDeps),/migration_install_busy/u);assert.equal(began,false);
   }finally{await a.query("SELECT pg_advisory_unlock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0))");}
   assert.deepEqual((await a.query(snapshotSql)).rows[0].snapshot,installedSnapshot);assert.deepEqual(await facts(),installedFacts);assert.deepEqual(await observations(),installedObservations);
  });
  pending.splice(0,pending.length);save('full-engineering-acceptance.json',{firstApplyCommitted:true,secondApplyCommitted:true,fullOriginalQueryExecuted:true,nonemptyRpcRowsPreserved:true,financialCatalogExact:true,forcedRollback:true,partialConfigRejectBeforeMutation:true,realDisconnectRollback:true,competingLockReject:true,formalPeerTransportVerified:false,productionAttestation:false});
 } catch(e) {save('failure-stage.json',{stage,error:errorValue(e),firstNativeFailure:fs.existsSync(path.join(artifacts,'first-apply-error.json'))?JSON.parse(fs.readFileSync(path.join(artifacts,'first-apply-error.json'),'utf8')):null,lastMigration:trace.findLast(x=>x.migration)?.migration??null});throw e;
 } finally {
  save('query-trace.json',trace);save('remaining-stages.json',{pending,productionAuthorityExercised:false,keychainRead:false,attestationCreated:false,roleAmendmentApplied:trace.some(x=>x.kind.startsWith('ALTER ROLE stockinsider_runtime')),formalPeerVerified:false,ownershipBridgeApplied:trace.some(x=>x.migration===OWNERSHIP_PRELUDE),full49Acceptance:false});
  for(const c of clients){try{await c.query('ROLLBACK');}catch{}try{await c.end();}catch{}}
  if(running){execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{stdio:'pipe'});if(fs.existsSync(path.join(directory,'pg.log')))fs.copyFileSync(path.join(directory,'pg.log'),path.join(artifacts,'postgres.log'));}
  fs.rmSync(directory,{recursive:true,force:true});save('cleanup.json',{directory,stopped:running,removed:!fs.existsSync(directory),ownedClientsClosed:true});
 }
});
