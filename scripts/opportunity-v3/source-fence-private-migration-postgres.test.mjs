import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const {Client}=createRequire(import.meta.url)('pg');
function pgTool(tool,args,input) {
  const result=spawnSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',process.env.VNEXT_TEST_CONTAINER,tool,...args],{
    input,timeout:30000,maxBuffer:16*1024**2,
  });
  if (result.error) throw result.error;
  assert.equal(result.status,0,'isolated database '+tool+' failed');
  return result.stdout;
}
import {workerFixture} from '../vnext-worker-fixture.mjs';
import {installRoutineSourcePrefix} from '../vnext-routine-source-prefix-fixture.mjs';
import {rosterHeadFixtureSql} from '../vnext-launch-roster-head-fixture.mjs';
import {inspectHardenedSourceNamespaceReview} from '../vnext-source-namespace-candidate.mjs';

const owner='research_source_fence_owner_v2';
const prep='research_input_preparation_owner_v2';
const release='a'.repeat(40);
const lease='00000000-0000-4000-8000-000000000260';
const root='https://www.twse.com.tw/synthetic-source-fence-private-migration';
const names=['research_source_fence_events_v2','research_source_seals_v2','research_source_seal_invalidations_v2'];
const refs=names.map(name=>'public.'+name);
const fn=['research_source_fence_record_v2()','seal_research_sources_v2(jsonb,timestamptz)',
  'assert_research_source_seal_v2(uuid)','research_publication_source_state_v2(uuid)'].map(name=>'public.'+name);
const files=[
  '20261117_42_vnext_internal_candidate_plan_acl_v1.sql','20261117_44_vnext_legacy_subscription_acl_v1.sql',
  '20261117_46_vnext_auth_profile_trigger_acl_v1.sql','20261117_47_vnext_source_guard_trigger_acl_v1.sql',
];
const readFile=(location)=>fs.readFileSync(new URL(location,import.meta.url),'utf8');
const roleSql=role=>'SET LOCAL ROLE '+role;
const counts=async c=>(await c.query(
  'SELECT (SELECT count(*)::int FROM public.source_raw_documents) AS documents,'
  +' (SELECT count(*)::int FROM public.research_source_fence_events_v2) AS events,'
  +' (SELECT count(*)::int FROM public.research_source_seal_invalidations_v2) AS invalidations')).rows[0];
const catalog=async (c,region)=>{
  const {rows:[result]}=await c.query([
   'SELECT jsonb_build_object(',
   "'relations',(SELECT jsonb_agg(to_jsonb(p)-'relnamespace' ORDER BY p.oid)",
   ' FROM pg_class p WHERE p.oid=ANY($1::regclass[])),',
   "'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid)",
   ' FROM pg_trigger t WHERE t.tgrelid=ANY($1::regclass[]) OR t.tgconstrrelid=ANY($1::regclass[])),',
   "'constraints',(SELECT jsonb_agg(to_jsonb(k)-'connamespace' ORDER BY k.oid)",
   ' FROM pg_constraint k WHERE k.conrelid=ANY($1::regclass[]) OR k.confrelid=ANY($1::regclass[])),',
   "'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid=ANY($1::regclass[])),",
   "'functions',(SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) FROM pg_proc p WHERE p.oid=ANY($2::regprocedure[]))) AS data",
  ].join('\n'),[names.map(name=>region+'.'+name),fn]);
  return result.data;
};
const proof={scope:'isolated PostgreSQL 17.11 full published predecessor, synthetic originals',
  candidateAppliedInProduction:false, protectedGateChanged:false, publicUsageGranted:false};

async function guardedSourceWrites(x, handle) {
  const c=await x.connect();
  try{
    await c.query('BEGIN');
    await c.query(
      "INSERT INTO public.production_writer_releases(release_id,writer_kind,active,activated_at)"
      +" VALUES($1,'vps',true,clock_timestamp()) ON CONFLICT DO NOTHING",[release]);
    await c.query(roleSql('service_role'));
    await c.query("SELECT set_config('request.headers',$1,true), set_config('request.jwt.claims',$2,true)",[
      JSON.stringify({'x-stockinsider-writer-release':release}),JSON.stringify({role:'service_role'}),
    ]);
    assert.equal((await c.query(
      "SELECT public.acquire_production_write_lease('production-data-plane',$1::uuid,300) AS acquired",[lease])).rows[0].acquired,true);
    await handle(c);
    assert.equal((await c.query(
      "SELECT public.release_production_write_lease('production-data-plane',$1::uuid) AS released",[lease])).rows[0].released,true);
    await c.query('COMMIT');
  }catch(error){
    await c.query('ROLLBACK');
    throw error;
  }finally{await x.close(c);}
}

async function insert(c, url) {
  return (await c.query([
   'INSERT INTO public.source_raw_documents(platform,document_url,title,content_text,published_at,collected_at,symbols,metadata)',
   " VALUES('twse_insider',$1,'Synthetic namespace fixture','Synthetic original',clock_timestamp(),clock_timestamp(),",
   " '[\"2409\"]'::jsonb,jsonb_build_object('original_event_at',clock_timestamp(),'rights_boundary','public_citation'))",
   ' RETURNING id',
  ].join('\n'),[url])).rows[0].id;
}
async function serviceStatus(x, sealId) {
  const c=await x.connect();
  try{
    await c.query('BEGIN READ ONLY');
    await c.query(roleSql('research_observed_rpc_owner'));
    const result=await c.query('SELECT public.research_publication_source_state_v2($1) AS state',[sealId]);
    return result.rows[0].state;
  }finally{await c.query('ROLLBACK');await x.close(c);}
}

async function probeConsumers(x) {
  const readers=[
    ['inputPreparation','prepare_research_input_v2(jsonb)',"SELECT public.prepare_research_input_v2('{}'::jsonb)"],
    ['author','read_research_author_packet_v2(jsonb,uuid,text,text)',"SELECT public.read_research_author_packet_v2('{}'::jsonb,NULL,NULL,NULL)"],
    ['reviewer','read_research_reviewer_sources_v2(jsonb,uuid,text,text,text,uuid,text)',"SELECT public.read_research_reviewer_sources_v2('{}'::jsonb,NULL,NULL,NULL,NULL,NULL,NULL)"],
  ];
  const results={};
  for(const [label,signature,query] of readers){
    const {rows:[expected]}=await x.observer.query("SELECT has_function_privilege('service_role',$1::regprocedure,'EXECUTE') AS can",[signature]);
    assert.equal(expected.can,true);
    const c=await x.connect();
    try{
      await c.query('BEGIN READ ONLY');
      await c.query(roleSql('service_role'));
      try { await c.query(query); assert.fail('empty input must fail'); }
      catch(error) {
        if(error.code==='42501') {
          assert.match(error.message,/permission denied for (schema public|function)/u);
          results[label]={result:'permission_denied',schemaPublic:error.message==='permission denied for schema public',
            compilingType:/compilation of PL\/pgSQL function/u.test(error.where??''),
            context:(error.where??'').split('\n').find(line=>/^PL\/pgSQL function [a-z0-9_.,() ]{1,240}$/iu.test(line))??null};
        } else {
          assert.equal(error.code,'P0001');
          results[label]={result:'application_guard_rejected',
            diagnostic:/^[a-z0-9_]{1,120}$/u.test(error.message)?error.message:null};
        }
      }
    }finally{await c.query('ROLLBACK');await x.close(c);}
  }
  return results;
}

const x=await workerFixture();
let stage='original installations';
try{
  await x.install();
  await installRoutineSourcePrefix(x);
  const roster=rosterHeadFixtureSql();
  await x.writer.query(roster.predecessor);
  await x.writer.query(roster.migration);
  for(const file of files)await x.writer.query(readFile('../../migrations/'+file));
  await x.observer.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const audited=await inspectHardenedSourceNamespaceReview(x.observer);
    assert.equal(audited.grantExecuted,false);
    proof.actualPredecessor=audited.predecessor;
  }finally{await x.observer.query('ROLLBACK');}

  await x.writer.query(readFile('../../migrations/20261117_48_vnext_podcast_private_acl_v1.sql'));
  stage='original authorized writer denial';
  const beforeCounts=await counts(x.observer);
  assert.deepEqual(beforeCounts,{documents:0,events:0,invalidations:0});
  await assert.rejects(guardedSourceWrites(x,c=>insert(c,root)),{code:'42501',message:'permission denied for schema public'});
  assert.deepEqual(await counts(x.observer),beforeCounts);

  const consumerBefore=await probeConsumers(x);
  stage='finite relocation candidate and structural guard';
  const prior=await catalog(x.observer,'public');
  const grantees=(await x.observer.query([
   "SELECT table_.relname AS name,pg_get_userbyid(a.grantee) AS grantee,a.privilege_type AS privilege,a.is_grantable AS grantable",
   "FROM pg_class table_ CROSS JOIN LATERAL aclexplode(COALESCE(table_.relacl,acldefault('r',table_.relowner))) a",
   "WHERE table_.oid=ANY($1::regclass[]) AND a.grantee<>table_.relowner ORDER BY name,grantee,privilege",
  ].join('\n'),[refs])).rows;
  assert.deepEqual(grantees,[{name:'research_source_seals_v2',grantee:prep,privilege:'SELECT',grantable:false}]);
  const atomicSql=readFile('../../migrations/20261118_56_vnext_source_fence_private_schema_v1.sql');
  const rollbackSql=readFile('../../deployment/vps/rollback-vnext-source-fence-private-schema-v1.sql');
  const hold=await x.connect();
  try {
    await hold.query('BEGIN');
    await hold.query('LOCK TABLE public.research_source_fence_events_v2 IN ACCESS SHARE MODE');
    await assert.rejects(x.writer.query(atomicSql),{code:'55P03'});
    await x.writer.query('ROLLBACK');
    const {rows:[restored]}=await x.observer.query("SELECT to_regnamespace('stockinsider_source_fence') IS NULL AS clean");
    assert.equal(restored.clean,true);
    assert.deepEqual(await catalog(x.observer,'public'),prior);
    assert.deepEqual(await counts(x.observer),beforeCounts);
    proof.lockTimeoutRolledBackAllDdl=true;
  }finally{await hold.query('ROLLBACK');await x.close(hold);}
  await x.writer.query(atomicSql);
  await x.writer.query('RESET stockinsider.source_fence_probe');
  assert.deepEqual(await catalog(x.observer,'stockinsider_source_fence'),prior,
    'physical relations, ACLs, RLS, foreign-key OIDs and trigger bindings remain unchanged');
  const {rows:[privilege]}=await x.observer.query([
    "SELECT has_schema_privilege($1,'public','USAGE') AS source_public,",
    "has_schema_privilege($2,'public','USAGE') AS input_public,",
    "has_schema_privilege('service_role','stockinsider_source_fence','USAGE') AS service_private,",
    "has_table_privilege('service_role','public.research_source_seals_v2','SELECT') AS service_view",
  ].join('\n'),[owner,prep]);
  assert.deepEqual(privilege,{source_public:false,input_public:false,service_private:false,service_view:false});
  proof.foreignKeysPreserved=prior.constraints.filter(constraint=>constraint.contype==='f').length;
  proof.triggerBindingsPreserved=prior.triggers.length;

  stage='authorized source write and seal';
  let seal;
  await guardedSourceWrites(x,async c=>{
    const id=await insert(c,root);
    const {rows:[digest]}=await c.query(
      "SELECT encode(sha256(convert_to(to_jsonb(d)::text,'UTF8')),'hex') AS value FROM public.source_raw_documents d WHERE id=$1",[id]);
    seal=(await c.query('SELECT public.seal_research_sources_v2($1::jsonb,clock_timestamp()) AS seal',
      [JSON.stringify([{id,rowHash:digest.value}])])).rows[0].seal;
    assert.equal(seal.documents[0].id,id);
    assert.equal(seal.documents[0].rowHash,digest.value);
    assert.equal(seal.publicationAuthorized,false);
  });
  assert.deepEqual(await counts(x.observer),{documents:1,events:1,invalidations:0});

  stage='source publication status and withdrawal';
  assert.equal((await x.observer.query('SELECT public.assert_research_source_seal_v2($1) AS seal',[seal.seal_id])).rows[0].seal.seal_id,seal.seal_id);
  let directStatus=null, callerStatus=null;
  try { callerStatus=await serviceStatus(x,seal.seal_id); }
  catch(error) { assert.equal(error.code,'42501'); assert.equal(error.message,'permission denied for schema public'); }
  directStatus=(await x.observer.query('SELECT public.research_publication_source_state_v2($1) AS state',[seal.seal_id])).rows[0].state;
  assert.equal(directStatus,'published');
  await guardedSourceWrites(x,async c=>{await insert(c,root+'#si-revision-second');});
  assert.deepEqual(await counts(x.observer),{documents:2,events:2,invalidations:1});
  assert.equal((await x.observer.query('SELECT public.research_publication_source_state_v2($1) AS state',[seal.seal_id])).rows[0].state,'withdrawn');
  await assert.rejects(x.observer.query('SELECT public.assert_research_source_seal_v2($1)',[seal.seal_id]),/source_seal_invalidated_or_missing/u);
  stage='rollback preserves receipts, bindings and visible public names';
  const withdrawnCounts=await counts(x.observer);
  const rollbackHold=await x.connect();
  try {
    await rollbackHold.query('BEGIN');
    await rollbackHold.query('LOCK TABLE stockinsider_source_fence.research_source_fence_events_v2 IN ACCESS SHARE MODE');
    await assert.rejects(x.writer.query(rollbackSql),{code:'55P03'});
    await x.writer.query('ROLLBACK');
    assert.deepEqual(await catalog(x.observer,'stockinsider_source_fence'),prior);
    assert.deepEqual(await counts(x.observer),withdrawnCounts);
  }finally{await rollbackHold.query('ROLLBACK');await x.close(rollbackHold);}
  await x.writer.query(rollbackSql);
  assert.equal((await x.observer.query("SELECT to_regnamespace('stockinsider_source_fence') IS NULL AS removed")).rows[0].removed,true);
  assert.deepEqual(await catalog(x.observer,'public'),prior);
  assert.deepEqual(await counts(x.observer),withdrawnCounts);
  assert.equal((await x.observer.query('SELECT count(*)::int AS count FROM public.research_source_seals_v2')).rows[0].count,1);
  await assert.rejects(guardedSourceWrites(x,c=>insert(c,root+'#si-revision-rollback')),{
    code:'42501',message:'permission denied for schema public',
  });
  assert.deepEqual(await counts(x.observer),withdrawnCounts);
  proof.rollbackRestoredOldFailureAndPreservedReceipts=true;

  stage='real SQL reapplies cleanly after rollback';
  await x.writer.query(atomicSql);
  assert.deepEqual(await catalog(x.observer,'stockinsider_source_fence'),prior);
  assert.deepEqual(await counts(x.observer),withdrawnCounts);
  assert.equal((await x.observer.query('SELECT public.research_publication_source_state_v2($1) AS state',[seal.seal_id])).rows[0].state,'withdrawn');
  proof.reapplyRetainedWithdrawal=true;
  proof.sourceWriteSealWithdrawal=true;
  assert.equal(callerStatus,'published');
  assert.equal(await serviceStatus(x,seal.seal_id),'withdrawn');
  proof.observedRoleStatus={beforeWithdrawal:callerStatus,afterWithdrawal:'withdrawn'};
  await assert.rejects(x.writer.query(atomicSql),/source_fence_namespace_profile_mismatch/u);
  await x.writer.query('ROLLBACK');
  assert.deepEqual(await catalog(x.observer,'stockinsider_source_fence'),prior);
  assert.deepEqual(await counts(x.observer),withdrawnCounts);
  proof.secondApplyFailedClosedWithoutChanges=true;


  stage='isolated logical backup and clean database restore';
  const backupCreate=pgTool('pg_dump',[
    '--username=postgres','--format=custom','--dbname=vnext_worker',
  ]);
  assert.ok(backupCreate.length>0 && backupCreate.length<=16*1024**2);
  assert.equal(backupCreate.subarray(0,5).toString('ascii'),'PGDMP');
  const restoredName='vnext_source_fence_restored';
  pgTool('createdb',['--username=postgres','--template=template0',restoredName]);
  pgTool('pg_restore',[
    '--username=postgres','--exit-on-error','--single-transaction','--dbname='+restoredName,
  ],backupCreate);
  const restoreConnect=async()=>{
    const client=new Client({
      host:path.join(process.env.VNEXT_WORKER_SOCKET_PARENT,'socket'),
      user:'postgres',database:restoredName,ssl:false,connectionTimeoutMillis:3000,statement_timeout:30000,
    });
    await client.connect();
    return client;
  };
  const restoreFixture={connect:restoreConnect,close:client=>client.end()};
  const restored=await restoreConnect();
  try {
    // pg_dump can recreate owner-only ACLs as implicit defaults. Compare
    // their effective grants while still checking every grant and grant option.
    const dbSummary=async client=>{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        await client.query('SET LOCAL search_path=pg_catalog');
        const sourceRows=(await client.query(`
          SELECT jsonb_build_object(
            'raw',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.source_raw_documents t),
            'events',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.event_id) FROM stockinsider_source_fence.research_source_fence_events_v2 t),
            'seals',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.seal_id) FROM stockinsider_source_fence.research_source_seals_v2 t),
            'invalidations',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.seal_id,t.event_id) FROM stockinsider_source_fence.research_source_seal_invalidations_v2 t)
          ) evidence
        `)).rows[0].evidence;
        const dependencies=(await client.query(`
          SELECT jsonb_build_object(
            'tables',(SELECT jsonb_agg(jsonb_build_array(c.relname,
              (SELECT jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
                ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable)
                FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a),
              pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity)
              ORDER BY c.relname) FROM pg_class c WHERE c.oid=ANY($1::regclass[])),
            'foreignKeys',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid),convalidated) ORDER BY conname)
              FROM pg_constraint WHERE contype='f' AND (conrelid=ANY($1::regclass[]) OR confrelid=ANY($1::regclass[]))),
            'triggers',(SELECT jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY t.tgname)
              FROM pg_trigger t WHERE NOT t.tgisinternal AND (t.tgrelid=ANY($1::regclass[]) OR t.tgrelid='public.source_raw_documents'::regclass)),
            'viewReadConstraints',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.reloptions,has_table_privilege('service_role',c.oid,'SELECT'),
                has_table_privilege('research_input_preparation_owner_v2',c.oid,'SELECT')) ORDER BY c.relname)
              FROM pg_class c WHERE c.oid=ANY($2::regclass[])),
            'namespace',jsonb_build_array(
              has_schema_privilege('research_source_fence_owner_v2','public','USAGE'),
              has_schema_privilege('research_source_fence_owner_v2','stockinsider_source_fence','USAGE'),
              has_schema_privilege('service_role','stockinsider_source_fence','USAGE')),
            'helpers',(SELECT jsonb_agg(jsonb_build_array(p.proname,p.prosecdef,pg_get_functiondef(p.oid),
                has_function_privilege('service_role',p.oid,'EXECUTE')) ORDER BY p.proname)
              FROM pg_proc p WHERE p.pronamespace='stockinsider_source_fence'::regnamespace)
          ) metadata
        `,[names.map(name=>'stockinsider_source_fence.'+name),refs])).rows[0].metadata;
        for (const [key,value] of Object.entries(sourceRows)) assert.ok(Array.isArray(value),key);
        return {sourceRows,dependencies};
      }finally{await client.query('ROLLBACK');}
    };
    const sourceBefore=await dbSummary(x.observer);
    const restoredBefore=await dbSummary(restored);
    assert.deepEqual(restoredBefore,sourceBefore,'restore must retain receipt rows and semantic catalog');
    assert.equal(sourceBefore.dependencies.foreignKeys.length,6);
    assert.equal(sourceBefore.dependencies.helpers.length,3);
    assert.deepEqual(sourceBefore.dependencies.namespace,[false,true,false]);
    assert.equal(await serviceStatus(restoreFixture,seal.seal_id),'withdrawn');
    const backupDigest=createHash('sha256').update(backupCreate).digest('hex');
    const countsBefore=await counts(restored);
    await guardedSourceWrites(restoreFixture,async c=>{
      const newId=await insert(c,root+'-restored-only');
      const digest=(await c.query(
        "SELECT encode(sha256(convert_to(to_jsonb(d)::text,'UTF8')),'hex') AS value FROM public.source_raw_documents d WHERE id=$1",
        [newId])).rows[0].value;
      const newSeal=(await c.query('SELECT public.seal_research_sources_v2($1::jsonb,clock_timestamp()) AS seal',
        [JSON.stringify([{id:newId,rowHash:digest}])])).rows[0].seal;
      assert.equal(newSeal.documents[0].id,newId);
      assert.equal(newSeal.publicationAuthorized,false);
    });
    const afterWrite=await counts(restored);
    assert.deepEqual(afterWrite,{documents:countsBefore.documents+1,events:countsBefore.events+1,invalidations:countsBefore.invalidations});
    assert.deepEqual(await dbSummary(x.observer),sourceBefore,'original staging database remains untouched');
    const restoredWritten=await dbSummary(restored);
    assert.equal(restoredWritten.sourceRows.seals.length,sourceBefore.sourceRows.seals.length+1);
    const restoredLegacy=await restoreConnect();
    try {
      await restoredLegacy.query(rollbackSql);
      assert.equal((await restoredLegacy.query("SELECT to_regnamespace('stockinsider_source_fence') IS NULL AS absent")).rows[0].absent,true);
      assert.deepEqual(await counts(restoredLegacy),afterWrite);
      await restoredLegacy.query(atomicSql);
      assert.deepEqual(await dbSummary(restoredLegacy),restoredWritten);
    }finally{await restoredLegacy.end();}
    proof.logicalBackupRestore={
      scope:'synthetic staging only',format:'custom',bytes:backupCreate.length,sha256:backupDigest,
      rowCounts:Object.fromEntries(Object.entries(sourceBefore.sourceRows).map(([key,value])=>[key,value.length])),
      privateTablesAndAclPreserved:true,foreignKeys:sourceBefore.dependencies.foreignKeys.length,
      invokerHelpers:sourceBefore.dependencies.helpers.length,withdrawnReadStatus:'withdrawn',
      newWriteAndSeal:true,rollbackAndReapplyPreservedRestoredRows:true,sourceDatabaseUnmodified:true,
      backupStreamInMemory:true,originalProductionBackupUsed:false,
    };
  }finally{backupCreate.fill(0);await restored.end();}

  stage='installed consumer controls retained';
  const consumerAfter=await probeConsumers(x);
  assert.deepEqual(consumerAfter,consumerBefore);
  proof.consumerNegativeControls=consumerAfter;
  const {rows: capabilities}=await x.observer.query([
    "SELECT role_.rolname AS role, has_schema_privilege(role_.oid,'public','USAGE') AS public_usage,",
    " (SELECT count(*)::int FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosecdef",
    " AND p.proowner<>role_.oid AND has_function_privilege(role_.oid,p.oid,'EXECUTE')) AS nonowned_definers",
    " FROM pg_roles role_ WHERE role_.rolname=ANY($1::text[]) ORDER BY role_.rolname",
  ].join('\n'),[[owner,prep]]);
  assert.equal(capabilities.find(item=>item.role===owner).public_usage,false);
  assert.equal(capabilities.find(item=>item.role===prep).public_usage,false);
  proof.capabilities=capabilities;
  proof.fullConsumerPositiveAcceptance=false;
  console.log(JSON.stringify(proof));
}catch(error){
  console.log(JSON.stringify({stage,code:error.code??'assertion',diagnostic:/^[a-z0-9_ :.-]{1,160}$/iu.test(error.message)?error.message:'omitted',
    functionContext:error.where?.split('\n').find(line=>line.startsWith('PL/pgSQL function'))??null}));
  throw error;
}finally{await x.finish();}
