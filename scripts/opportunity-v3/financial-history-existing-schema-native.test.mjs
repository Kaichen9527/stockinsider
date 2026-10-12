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
import {readFinancialHistoryCatalog} from './financial-history-catalog.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {Client}=createRequire(import.meta.url)('pg');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const artifacts=process.env.FINANCIAL_EXISTING_SCHEMA_ARTIFACTS;
if(!artifacts||!path.isAbsolute(artifacts))throw Error('private_absolute_artifacts_required');
fs.mkdirSync(artifacts,{mode:0o700});
const diagnosticOnly=process.env.FINANCIAL_EXISTING_SCHEMA_DIAGNOSTIC_ONLY==='1';
if(process.env.FINANCIAL_EXISTING_SCHEMA_DIAGNOSTIC_ONLY && !diagnosticOnly)throw Error('invalid_diagnostic_mode');
const save=(name,value)=>fs.writeFileSync(path.join(artifacts,name),JSON.stringify(value,null,2)+'\n');
const errorValue=e=>({name:e?.name,message:e?.message,code:e?.code,detail:e?.detail,hint:e?.hint,schema:e?.schema,table:e?.table,routine:e?.routine});
const gz=fs.readFileSync(new URL('./fixtures/vps-schema-20261011.sql.gz',import.meta.url));
const captured=gunzipSync(gz);
assert.equal(sha(gz),'2e9fc2f8a795a13490c12a90a2d9c974e19c1e93f9593d443d834978e0a19c60');
assert.equal(sha(captured),'a82e3b089ee0523a9de3b1a84c0e799d878fa47bb6ec892a51af8c8e037c3731');
const load=relativePath=>{const bytes=fs.readFileSync(path.join(root,relativePath));return {relativePath,bytes,sha256:sha(bytes)};};
const migrations=selectFinancialHistoryChain(MIGRATIONS.map(load),load(FINANCIAL_TAIL),true);
const plan={migrations,chainSha256:orderedHash(migrations)};
assert.equal(plan.migrations.length,49);assert.equal(plan.chainSha256,'cec630ce83aea1f7bdcafae815990e2e964ebbf599a3441e08d978e4427f46cd');
const bodyPaths=new Map(migrations.map(m=>[sha(migrationBodyInAtomicTransaction(m.bytes.toString('utf8'))),m.relativePath]));
const options={financialHistoryExtension:true,sourceCommit:'0dd1f36dfe80660b073aa5102f42671cec577e3a',attestationCommit:null};
const snapshotSql=`SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
  'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p')),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,
  'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'inherit',rolinherit,
  'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'bypassRls',rolbypassrls) ORDER BY rolname) FROM pg_roles),
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

test(diagnosticOnly?'captured existing-schema owner profile read-only diagnosis (no install)':'financial-only exact49 first/replay attempt on original captured schema (later stages pending)',async t=>{
 const bin=execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'si-fin49-')),data=path.join(directory,'pg'),port=56000+process.pid%1000;
 let running=false;const clients=new Set();const trace=[];const pending=['apply twice','nonempty seed and full catalog/data','forced failure after genuine predecessor replacement','partial residue/changed config','disconnect','competing install lock'];
 const connect=async()=>{const c=new Client({host:directory,port,user:'postgres',database:'postgres',statement_timeout:30000,query_timeout:35000});clients.add(c);await c.connect();return c;};
 const traced=client=>{const query=client.query.bind(client);client.query=async(...args)=>{const text=typeof args[0]==='string'?args[0]:args[0]?.text;const row={at:new Date().toISOString(),sha256:sha(text??''),migration:bodyPaths.get(sha(text??''))??null,kind:(text??'').slice(0,60)};trace.push(row);try{return await query(...args);}catch(e){row.error=errorValue(e);save('query-trace.json',trace);throw e;}};return client;};
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
  save('restored-role-profile.json',(await a.query("SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,has_schema_privilege(oid,'public','CREATE') AS public_create FROM pg_roles WHERE rolname IN ('postgres','stockinsider_runtime_v319','opportunity_v3_rpc_owner','legacy_correctness_rpc_owner') ORDER BY rolname")).rows);
  const before=(await a.query(snapshotSql)).rows[0].snapshot;save('before-first-apply.json',before);
  if(diagnosticOnly){save('diagnostic-mode.json',{readOnlyAfterRestore:true,installerCalled:false,ownershipBridgeApplied:false,roleAmendmentApplied:false});return;}
  await t.test('actual first apply through unchanged helper and pinned financial49',async()=>{
   stage='first financial49 apply';const writer=traced(await connect());
   try{const result=await applyReviewedMigrationPlanToClient(writer,plan,options);save('first-apply-result.json',result);pending.shift();}catch(e){
    save('first-apply-error.json',errorValue(e));const after=(await a.query(snapshotSql)).rows[0].snapshot;save('after-first-apply-failure.json',after);save('owner-profile-after-failure.json',(await a.query(ownerSql)).rows);
    assert.deepEqual(after,before,'failed first install must roll back full public functions/table ACL/roles/membership/schema state');
    throw e;
   }finally{clients.delete(writer);}
  });
  // Stop dependent stages on first genuine failure; no corrective role/prelude is applied here.
  if(fs.existsSync(path.join(artifacts,'first-apply-error.json')))throw Error('dependent_stages_blocked_by_first_apply');
  const firstCatalog=await readFinancialHistoryCatalog(a);await verifyFinancialHistoryPostconditions(a);save('first-installed-financial-catalog.json',firstCatalog);
  stage='second financial49 apply';await applyReviewedMigrationPlanToClient(traced(await connect()),plan,options);await verifyFinancialHistoryPostconditions(a);assert.deepEqual(await readFinancialHistoryCatalog(a),firstCatalog);
  pending[0]='nonempty seed/data and negative stages pending';
 } catch(e) {save('failure-stage.json',{stage,error:errorValue(e),firstNativeFailure:fs.existsSync(path.join(artifacts,'first-apply-error.json'))?JSON.parse(fs.readFileSync(path.join(artifacts,'first-apply-error.json'),'utf8')):null,lastMigration:trace.findLast(x=>x.migration)?.migration??null});throw e;
 } finally {
  save('query-trace.json',trace);save('remaining-stages.json',{pending,productionAuthorityExercised:false,keychainRead:false,attestationCreated:false,roleAmendmentApplied:false,ownershipBridgeApplied:false,full49Acceptance:false});
  for(const c of clients){try{await c.query('ROLLBACK');}catch{}try{await c.end();}catch{}}
  if(running){execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{stdio:'pipe'});if(fs.existsSync(path.join(directory,'pg.log')))fs.copyFileSync(path.join(directory,'pg.log'),path.join(artifacts,'postgres.log'));}
  fs.rmSync(directory,{recursive:true,force:true});save('cleanup.json',{directory,stopped:running,removed:!fs.existsSync(directory),ownedClientsClosed:true});
 }
});
