import assert from 'node:assert/strict';
import {createHash}from 'node:crypto';import {execFileSync}from 'node:child_process';import {createRequire}from 'node:module';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {gunzipSync}from 'node:zlib';import test from 'node:test';
import {MIGRATIONS,applyReviewedMigrationPlanToClient}from './apply-reviewed-migrations.mjs';import {migrationBodyInAtomicTransaction}from './atomic-migration-chain.mjs';import {FINANCIAL_TAIL,selectFinancialHistoryChain,orderedHash,verifyFinancialHistoryPostconditions}from './financial-history-install-guard.mjs';import {OWNERSHIP_PRELUDE,makeFinancialExistingSchemaProfile}from './financial-existing-schema-profile.mjs';import {ensureVpsRuntimeRole}from './financial-vps-operator-action.mjs';import {financialOperatorActionIdentity}from './financial-vps-operator-binding.mjs';import {readFinancialHistoryCatalog}from './financial-history-catalog.mjs';
import {loadPublicationTail,TAIL_ORDERED_SHA256}from './research-publication-tail-extraction.mjs';import {assertResearchPublicationFirstInstall}from './research-publication-install-guard.mjs';import {readResearchPublicationCatalog,assertResearchPublicationCatalog,fingerprintResearchPublicationCatalog}from './research-publication-catalog.mjs';
import {assertPublicationTailPredecessor,tailMetadataSha}from './research-publication-tail-entry-guard.mjs';
import {applyPublicationTailToEngineeringClient,TAIL_SHARED_LOCK}from './research-publication-tail-atomic-client.mjs';
import {readTailNamespace}from './research-publication-tail-entry-namespace.mjs';
const root=path.resolve(import.meta.dirname,'../..'),{Client}=createRequire(import.meta.url)('pg'),sha=b=>createHash('sha256').update(b).digest('hex');const artifacts=process.env.RESEARCH_TAIL_ARTIFACTS;if(!artifacts||!path.isAbsolute(artifacts))throw Error('private_absolute_artifacts_required');fs.mkdirSync(artifacts,{mode:0o700});
const save=(name,value)=>fs.writeFileSync(path.join(artifacts,name),JSON.stringify(value,null,2)+'\n');const errors=e=>({name:e?.name,message:e?.message,code:e?.code,position:e?.position,detail:e?.detail,hint:e?.hint,routine:e?.routine});
const load=relativePath=>{const bytes=fs.readFileSync(path.join(root,relativePath));return{relativePath,bytes,sha256:sha(bytes)};};const tail=loadPublicationTail(root);const migrations=selectFinancialHistoryChain(MIGRATIONS.map(load),load(FINANCIAL_TAIL),true);const plan={migrations,chainSha256:orderedHash(migrations),financialExistingSchemaProfile:makeFinancialExistingSchemaProfile(migrations,load(OWNERSHIP_PRELUDE)),operatorPrerequisite:financialOperatorActionIdentity()};const options={privateVpsPeerOperator:true,bootstrapVpsRuntimeRole:true,financialExistingSchemaProfile:true,sourceCommit:null,attestationCommit:null};
const profile=JSON.parse(fs.readFileSync(new URL('./research-publication-install-profile.json',import.meta.url)));const snapshotSql=`SELECT jsonb_build_object(
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
const lockSql="SELECT pg_try_advisory_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0)) AS locked";const unlockSql="SELECT pg_advisory_unlock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0))";

const inventory=JSON.parse(fs.readFileSync(new URL('./fixtures/research-publication-tail-fragments.json',import.meta.url)));
test('source-derived prerequisites2..5 isolated fragments and dependency-only controls',async t=>{
 const bin=execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();assert.match(execFileSync(path.join(bin,'postgres'),['--version'],{encoding:'utf8'}),/17\.11/);const directory=fs.mkdtempSync('/tmp/si-tail-pg-'),data=path.join(directory,'pg'),port=57000+process.pid%1000;let running=false,stage='initdb';const clients=new Set();const trace=[];const pending=inventory.fragments.filter(r=>r.selected).map(r=>r.id);
 const connect=async()=>{const c=new Client({host:directory,port,user:'postgres',database:'postgres',statement_timeout:30000,query_timeout:35000});c.on('error',e=>save(`client-error-${clients.size}.json`,errors(e)));clients.add(c);await c.connect();return c;};
 const close=async c=>{try{await c.end();}finally{clients.delete(c);}};
 const facts=async c=>(await c.query('SELECT jsonb_agg(to_jsonb(f) ORDER BY fact_id) AS facts FROM public.opportunity_financial_facts_v3 f')).rows[0].facts;
 const observations=async c=>(await c.query('SELECT jsonb_agg(to_jsonb(o) ORDER BY observation_id) AS observations FROM public.opportunity_financial_observations_v1 o')).rows[0].observations;
 const snapshot=async c=>({all:(await c.query(snapshotSql)).rows[0].snapshot,publication:await readResearchPublicationCatalog(c,profile.stages.installed.scope),financial:await readFinancialHistoryCatalog(c),facts:await facts(c),observations:await observations(c)});
 const begin=async c=>{assert.equal((await c.query(lockSql)).rows[0].locked,true);await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');await c.query("SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s'");};
 const end=async(c,commit=false)=>{await c.query(commit?'COMMIT':'ROLLBACK');await c.query(unlockSql);};
 try{
  execFileSync(path.join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-instructions'],{stdio:'pipe'});execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(directory,'pg.log'),'-o',`-h '' -k ${directory} -p ${port}`,'-w','start'],{stdio:'pipe'});running=true;
  let a=await connect();stage='unchanged captured schema restore';const gz=fs.readFileSync(path.join(root,'scripts/opportunity-v3/fixtures/vps-schema-20261011.sql.gz')),captured=gunzipSync(gz);assert.equal(sha(gz),'2e9fc2f8a795a13490c12a90a2d9c974e19c1e93f9593d443d834978e0a19c60');assert.equal(sha(captured),'a82e3b089ee0523a9de3b1a84c0e799d878fa47bb6ec892a51af8c8e037c3731');const bootstrapBytes=fs.readFileSync(path.join(root,'deployment/vps/bootstrap-stockinsider-postgres.sql'));const bootstrap=bootstrapBytes.toString().replaceAll(/^\\set.*$/gm,'');await a.query(bootstrap);await a.query('ALTER SCHEMA public RENAME TO fixture_bootstrap_public');await a.query('ALTER SCHEMA extensions RENAME TO fixture_bootstrap_extensions');const restored=captured.toString().replaceAll(/^\\(?:restrict|unrestrict).*$/gm,'').replace('CREATE SCHEMA extensions;','ALTER SCHEMA fixture_bootstrap_extensions RENAME TO extensions;');await a.query(restored);save('restore-input.json',{gzipSha256:sha(gz),capturedSchemaSha256:sha(captured),bootstrapBytesSha256:sha(bootstrapBytes),executedBootstrapSha256:sha(bootstrap),executedSchemaSha256:sha(restored),bootstrapRoles:'synthetic local bootstrap only, not formal peer/operator/role approval',fixture:'genuine captured VPS schema-only; no data or credentials'});
  stage='nonempty synthetic financial realRPC seed';await a.query(`INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at) VALUES('a11d4e67-7d0a-4c44-8a9d-1d5c3b875003','opportunity_runner','2026-01-01',NULL,'active',repeat('9',64),clock_timestamp()); INSERT INTO public.stocks(id,symbol,name,market) VALUES('71300000-0000-4000-8000-000000000083','9183','Synthetic local financial tail fixture','TW'); SELECT * FROM public.append_financial_fact_v3(ROW('71300000-0000-4000-8000-000000000083','net_asset_value',NULL,'2025-01-01','instant',100,'TWD','twse','official_filing','reported','reported_period','2025-01-02T00:00:00Z','2025-01-02T00:00:00Z','2025-01-02T01:00:00Z',NULL,'twse-openapi:synthetic-atomic-rollback')::public.financial_fact_input_v3,'a11d4e67-7d0a-4c44-8a9d-1d5c3b875003');`);const seed=await facts(a);assert.equal(seed.length,1);save('seed.json',{facts:seed,syntheticFinancialRpcPrincipal:true,formalResearchAuthorReviewerPublisherIdsCreated:false});await close(a);
  await t.test('main actual financial50 and original operator helper first COMMIT',async()=>{stage='financial50';a=await connect();const result=await applyReviewedMigrationPlanToClient(a,plan,options,{operatorPrerequisiteExecutor:async c=>({transport:{engineeringOnly:true,privatePeerTransportVerified:false,effectiveHbaVerified:false},role:await ensureVpsRuntimeRole(c)})});clients.delete(a);save('financial50-result.json',result);a=await connect();await verifyFinancialHistoryPostconditions(a);assert.deepEqual(await facts(a),seed);save('financial50-input-baseline-summary.json',{facts:await facts(a),observations:await observations(a),catalogSha256:tailMetadataSha(await snapshot(a))});});

  stage='source-derived fragment matrix';
  for(const source of inventory.sources){const b=fs.readFileSync(path.join(root,source.path));assert.equal(b.length,source.bytes);assert.equal(sha(b),source.sha256);}
  for(const r of inventory.fragments){const b=fs.readFileSync(path.join(root,r.path)).subarray(r.startByte,r.endByte);assert.equal(sha(b),r.sha256);assert.equal(b.toString(),r.sql);migrationBodyInAtomicTransaction(r.sql);}
  const compact=async c=>({namespace:tailMetadataSha(await readTailNamespace(c)),catalog:tailMetadataSha(await readResearchPublicationCatalog(c,profile.stages.installed.scope)),financial:tailMetadataSha(await readFinancialHistoryCatalog(c)),facts:await facts(c),observations:await observations(c)});
  const before=await compact(a);assert.equal(before.facts.length,1);assert.equal(before.observations.length,1);await assertPublicationTailPredecessor(a);save('post50-baseline-compact.json',before);
  const matrix=[];const tableRows=new Map(inventory.fragments.filter(r=>r.tableCreated).map(r=>[r.tableCreated,r]));
  const depsFor=r=>{const out=[],visited=new Set();const visit=name=>{if(visited.has(name))return;visited.add(name);const d=tableRows.get(name);assert.ok(d);for(const dep of d.newTableDependencies)visit(dep);out.push(d);};for(const dep of r.newTableDependencies)visit(dep);if(r.newColumnDependency)out.push(inventory.fragments.find(x=>x.id===r.newColumnDependency));return out;};
  const runnable=[];
  for(const row of inventory.fragments.filter(r=>r.selected))await t.test(`${row.id}: ${row.coverageIntent}`,async()=>{
   stage=row.id;const dependencies=depsFor(row);let inside,refusal,functionProfile;
   await a.query('BEGIN');try{
    if(dependencies.length){
     // Negative control contains exact parent creation only, never the target fragment or whole prefix.
     for(const d of dependencies)await a.query(migrationBodyInAtomicTransaction(d.sql));
     inside=await compact(a);assert.notDeepEqual(inside,before);await assert.rejects(assertPublicationTailPredecessor(a),e=>{refusal=errors(e);return /predecessor_/.test(e.message);});
     matrix.push({id:row.id,status:'not-causally-isolatable',dependencyOnly:dependencies.map(d=>({id:d.id,sha256:d.sha256})),targetFragmentExecuted:false,reason:'Exact parent/column dependency alone already violates post50 predecessor; target effect cannot be isolated on supported baseline.',refusal,inside});
    }else{
     await a.query(migrationBodyInAtomicTransaction(row.sql));inside=await compact(a);assert.notDeepEqual(inside,before);await assert.rejects(assertPublicationTailPredecessor(a),e=>{refusal=errors(e);return /predecessor_/.test(e.message);});
     if(row.functionCreated){functionProfile=(await a.query(`SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,p.proconfig AS config,p.prosecdef AS security_definer,p.proacl AS acl,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS body_sha256 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1 ORDER BY p.oid::regprocedure::text`,[row.functionCreated])).rows;assert.equal(functionProfile.length,1);}
     matrix.push({id:row.id,status:'covered-independent-original-fragment',targetFragmentExecuted:true,refusal,inside,functionProfile});runnable.push(row);
    }
   }finally{await a.query('ROLLBACK');}
   const after=await compact(a);assert.deepEqual(after,before);matrix.at(-1).rollbackBaselineUnchanged=true;matrix.at(-1).tailStatementsExecuted=0;
   pending.splice(pending.indexOf(row.id),1);save('matrix.json',matrix);
  });
  // At least one independently executable original fragment per prerequisite with such a fragment
  // is committed in a genuine clone, then refused by the actual atomic helper before any tail body.
  const helperRows=[];for(const p of [2,3,4,5]){const row=runnable.find(r=>r.prerequisite===p&&r.functionCreated)||runnable.find(r=>r.prerequisite===p);if(row)helperRows.push(row);}
  await close(a);
  for(const [i,row]of helperRows.entries())await t.test(`${row.id}: actual helper refuses committed isolated fragment`,async()=>{
   const db=`fragment_${i}`,admin=await connect();await admin.query(`CREATE DATABASE ${db} TEMPLATE postgres`);await close(admin);
   const connectDb=async()=>{const c=new Client({host:directory,port,user:'postgres',database:db,statement_timeout:30000,query_timeout:35000});c.on('error',e=>save(`helper-error-${i}.json`,errors(e)));clients.add(c);await c.connect();return c;};
   const observer=await connectDb();try{
    await observer.query(migrationBodyInAtomicTransaction(row.sql));const partial=await compact(observer),writer=await connectDb(),query=writer.query.bind(writer),calls=[];
    writer.query=async(...args)=>{const sql=typeof args[0]==='string'?args[0]:args[0].text;calls.push({sha256:sha(sql),header:sql.slice(0,100)});return query(...args);};
    let refusal;await assert.rejects(applyPublicationTailToEngineeringClient(writer,tail),e=>{refusal=errors(e);return /predecessor_/.test(e.message);});clients.delete(writer);
    const tailHashes=new Set(tail.map(r=>sha(migrationBodyInAtomicTransaction(r.bytes.toString()))));assert.equal(calls.filter(c=>tailHashes.has(c.sha256)).length,0);assert.deepEqual(await compact(observer),partial);
    save(`helper-${row.id}.json`,{id:row.id,refusal,calls,tailBodiesExecuted:0,committedPartialBefore:partial,after:await compact(observer),engineeringClone:true});
   }finally{await close(observer);const admin=await connect();try{await admin.query(`DROP DATABASE ${db}`);}finally{await close(admin);}}
  });
  const ancillary=inventory.fragments.filter(r=>!r.selected).map(r=>({id:r.id,status:'source-proof-only-ancillary',header:r.header,sha256:r.sha256,reason:'Not a selected table/column/index/function creation fragment; no additional ACL/bootstrap/trigger or data-write injection in this slice.'}));
  save('coverage-summary.json',{matrix,ancillary,actualHelperFragments:helperRows.map(r=>r.id),pending,formalPeer:false,productionAuthorized:false,scope:'Prerequisites2..5 original DDL fragment isolation on genuine captured post-financial50. Parent-only controls are not target execution.'});
  return;
 }catch(e){save('outer-error.json',{stage,error:errors(e)});throw e;}finally{
  save('pending.json',{stage,pending,tailOrderedSha256:TAIL_ORDERED_SHA256,formalPeerOrAttestationVerified:false,productionInstalled:false});for(const c of clients)try{await close(c);}catch{};if(running)execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{stdio:'pipe'});const log=path.join(directory,'pg.log');if(fs.existsSync(log))fs.copyFileSync(log,path.join(artifacts,'postgres.log'));fs.rmSync(directory,{recursive:true,force:true});save('cleanup.json',{ownedClusterStopped:true,clusterPath:directory,removedRebuildableOwnedPgData:true,rawEvidencePreserved:true});
 }
});
