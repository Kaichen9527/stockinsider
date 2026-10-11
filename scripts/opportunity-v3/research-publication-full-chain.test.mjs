import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bootstrapVpsRuntimeRole } from './vps-migration-peer.mjs';
import { migrationBodyInAtomicTransaction } from './atomic-migration-chain.mjs';
import { assertResearchPublicationFirstInstall } from './research-publication-install-guard.mjs';
import { assertResearchPublicationCatalog, fingerprintResearchPublicationCatalog } from './research-publication-catalog.mjs';
import { reviewedMigrationIsSuperseded, assertExistingRuntimeRoleContract,
  verifyReviewedMigrationPostconditions } from './apply-reviewed-migrations.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {Client}=createRequire(import.meta.url)('pg');
const snapshot=gunzipSync(fs.readFileSync(new URL('./fixtures/vps-schema-20261011.sql.gz',import.meta.url)));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const lock="SELECT pg_advisory_xact_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0))";
const profile=JSON.parse(fs.readFileSync(new URL('./research-publication-install-profile.json',import.meta.url)));
const plan=JSON.parse(execFileSync(process.execPath,['scripts/opportunity-v3/migration-plan.mjs'],{cwd:root,encoding:'utf8'}));
const migrations=[...plan.researchAgentExtension.preludeMigrations,...plan.migrations,...plan.researchAgentExtension.migrations];
const obsolete='migrations/20260827_decision_revision_dossier_projection_v3_19_2.sql';

// No synthetic prerequisite definitions and no credentials/rows. This captured
// deployment schema is the explicitly reviewed existing-install baseline, not a
// claim that vanilla PostgreSQL + supabase_schema.sql is a fresh installer.
test('complete reviewed existing-schema installation is atomic and verifies actual PostgreSQL postconditions', async t=>{
  assert.equal(digest(snapshot),profile.baselineSchemaSha256);
  assert.deepEqual(migrations.map(x=>[x.migration,x.sha256]),profile.migrations);
  const rawCatalog=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/publication-catalog-20261011.json.gz',import.meta.url))));
  for(const [stage,value] of Object.entries(rawCatalog.stages))
    assert.deepEqual(fingerprintResearchPublicationCatalog(value.catalog),profile.stages[stage].catalog);
  const bin=execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
  const directory=fs.mkdtempSync('/tmp/si-full-chain-'),data=path.join(directory,'pg'),port=56000+process.pid%1000;
  let running=false; const clients=new Set();
  const connect=async()=>{const client=new Client({host:directory,port,user:'postgres',database:'postgres',statement_timeout:30000});
    clients.add(client);await client.connect();return client;};
  try{
    execFileSync(path.join(bin,'initdb'),['-D',data,'-U','postgres','-A','trust','--no-instructions'],{stdio:'pipe'});
    execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(directory,'pg.log'),'-o',`-h '' -k ${directory} -p ${port}`,'-w','start'],{stdio:'pipe'});running=true;
    let a=await connect();
    const bootstrap=fs.readFileSync(path.join(root,'deployment/vps/bootstrap-stockinsider-postgres.sql'),'utf8').replaceAll(/^\\set.*$/gm,'');
    await a.query(bootstrap);
    await a.query('ALTER SCHEMA public RENAME TO fixture_bootstrap_public');
    await a.query('ALTER SCHEMA extensions RENAME TO fixture_bootstrap_extensions');
    const schema=snapshot.toString('utf8').replaceAll(/^\\(?:restrict|unrestrict).*$/gm,'')
      .replace('CREATE SCHEMA extensions;','ALTER SCHEMA fixture_bootstrap_extensions RENAME TO extensions;');
    await a.query(schema);await a.end();clients.delete(a);a=await connect();
    await assert.rejects(assertExistingRuntimeRoleContract(a),/runtime_role_bootstrap_required/u);
    // Explicit test-only operator prerequisite. The production installer never
    // makes this alteration; the separate operator bootstrap remains reviewed.
    await a.query('BEGIN');
    const bootstrapReceipt=await bootstrapVpsRuntimeRole(a);
    assert.equal(bootstrapReceipt.ownerAclAndMembershipUnchanged,true);
    await a.query('ROLLBACK');
    await assert.rejects(assertExistingRuntimeRoleContract(a),/runtime_role_bootstrap_required/u);
    await a.query('BEGIN');await bootstrapVpsRuntimeRole(a);await a.query('COMMIT');
    await assert.rejects(bootstrapVpsRuntimeRole(a),/unknown_predecessor/u);
    await t.test('missing prerequisites, composite attributes and reachable role changes reject before mutation',async()=>{
      const rejected=async sql=>{await a.query('BEGIN');try{await a.query(sql);await assert.rejects(assertResearchPublicationCatalog(a,'beforeBase'),/catalog_mismatch/u);}finally{await a.query('ROLLBACK');}};
      await rejected('ALTER TYPE financial_fact_input_v3 ADD ATTRIBUTE unexpected_field text');
      await rejected('ALTER ROLE authenticator SUPERUSER');
      await rejected('CREATE ROLE outside_schema_grantee NOLOGIN;GRANT CREATE ON SCHEMA public TO outside_schema_grantee');
      await rejected('CREATE ROLE unexpected_parent NOLOGIN;GRANT unexpected_parent TO authenticator');
      await rejected('ALTER TABLE source_entities RENAME TO source_entities_missing');
      await assertResearchPublicationFirstInstall(a);
    });
    const install=async client=>{
      await assertResearchPublicationFirstInstall(client);
      await assertExistingRuntimeRoleContract(client);
      await assertResearchPublicationCatalog(client,'beforeBase');
      const superseded=await reviewedMigrationIsSuperseded(client,obsolete);
      const applied=[];
      for(const item of migrations){
        if(item.migration==='migrations/20261008_insider_snapshots_v1.sql')
          await assertResearchPublicationCatalog(client,'beforePublication');
        if(superseded&&item.migration===obsolete)continue;
        await client.query(migrationBodyInAtomicTransaction(fs.readFileSync(path.join(root,item.migration),'utf8')));
        applied.push(item.migration);
      }
      assert.equal(applied.length,73);assert.equal(superseded,true);
      return verifyReviewedMigrationPostconditions(client,{researchAgentExtension:true});
    };
    await t.test('full chain and semantic mutations are verified before rollback',async()=>{
      await a.query('BEGIN');await a.query(lock);
      try { await install(a);
      const mutation=async sql=>{await a.query('SAVEPOINT mutation');try{await a.query(sql);
        await assert.rejects(assertResearchPublicationCatalog(a,'installed'),/catalog_mismatch/u);
      }finally{await a.query('ROLLBACK TO mutation');await a.query('RELEASE mutation');}};
      await mutation('ALTER TABLE research_author_results_v2 DISABLE ROW LEVEL SECURITY');
      await mutation('GRANT INSERT(payload) ON research_author_results_v2 TO service_role');
      await mutation('ALTER TABLE source_raw_documents DISABLE TRIGGER research_source_fence_truncate_v2');
      await mutation('ALTER FUNCTION read_research_company_publication_v2(uuid) SECURITY INVOKER');
      await mutation('ALTER ROLE research_observed_rpc_owner INHERIT');
      await mutation('CREATE FUNCTION read_research_company_publication_v2(integer) RETURNS integer LANGUAGE sql AS $$SELECT 1$$');
      } finally { await a.query('ROLLBACK'); }
      await assertResearchPublicationFirstInstall(a);
      await assertResearchPublicationCatalog(a,'beforeBase');
    });
    await t.test('disconnect rolls back every schema/role/function change',async()=>{
      const disconnected=await connect();await disconnected.query('BEGIN');await disconnected.query(lock);
      await install(disconnected);await disconnected.end();clients.delete(disconnected);
      await a.query(lock);await assertResearchPublicationFirstInstall(a);await assertResearchPublicationCatalog(a,'beforeBase');
    });
    await t.test('two full clients serialize; committed installation prevents second replay',async()=>{
      const b=await connect();await a.query('BEGIN');await a.query(lock);await install(a);
      await b.query('BEGIN');let done=false;const waiting=b.query(lock).then(()=>{done=true;});
      let blocked=false;for(let i=0;i<100&&!blocked;i++){
        blocked=(await a.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked',[b.processID])).rows[0].blocked;
        if(!blocked)await new Promise(resolve=>setTimeout(resolve,10));
      }assert.equal(blocked,true);assert.equal(done,false);
      await a.query('COMMIT');await waiting;
      await assert.rejects(assertResearchPublicationFirstInstall(b),/existing_profile_requires_reviewed_successor/u);
      await b.query('ROLLBACK');await verifyReviewedMigrationPostconditions(a,{researchAgentExtension:true});
    });
  }finally{
    for(const client of clients){try{await client.query('ROLLBACK');}catch{}try{await client.end();}catch{}}
    if(running)execFileSync(path.join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'],{stdio:'pipe'});
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
