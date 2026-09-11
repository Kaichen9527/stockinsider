import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

// Ephemeral local PostgreSQL only. Never accepts a connection URL or reads a
// credentials file; all connections use the freshly-created private socket.
test('validation receipt RPC enforces permissions, exact provenance, and idempotent availability',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'official-validation-pg-'));
  const data=path.join(directory,'data'),socket=path.join(directory,'socket');
  fs.mkdirSync(socket);
  const user=os.userInfo().username,port=55000+(process.pid%5000);
  const binary=(name)=>{
    if(process.env.OPPORTUNITY_V3_POSTGRES_BIN)return path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN,name);
    const found=spawnSync('/usr/bin/env',['sh','-c','command -v "$1"','pg-tool',name],{encoding:'utf8'}).stdout.trim();
    assert.ok(found,`${name} must be installed for migration verification`);return found;
  };
  const command=(name,args,input)=>{
    const r=spawnSync(binary(name),args,{input,encoding:'utf8',env:{...process.env,LC_ALL:'C'}});
    assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();
  };
  const sql=(value)=>command('psql',['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',String(port),'-U',user,'-d','postgres','-At'],value);
  let started=false;
  try{
    command('initdb',['-D',data,'--auth=trust','--no-locale','--encoding=UTF8','-U',user]);
    command('pg_ctl',['-D',data,'-l',path.join(directory,'postgres.log'),'-o',`-F -k ${socket} -p ${port} -c listen_addresses=''`,'-w','start']);
    started=true;
    sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE opportunity_v3_rpc_owner NOLOGIN NOBYPASSRLS;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
      CREATE TYPE public.financial_validation_status_v3 AS ENUM('pending','validated','rejected','conflict','stale');
      CREATE TABLE public.opportunity_financial_facts_v3(fact_id uuid PRIMARY KEY,recorded_at timestamptz,
        authority_tier text,provider text,validation_status public.financial_validation_status_v3,schema_valid boolean,unit_valid boolean,
        point_in_time_valid boolean,consistency_valid boolean);
      ALTER TABLE public.opportunity_financial_facts_v3 OWNER TO opportunity_v3_rpc_owner;
      CREATE TABLE public.candidate_financial_fact_provenance_v4(fact_id uuid,source_url text,source_sha256 text);
      CREATE TABLE public.candidate_financial_document_receipts_v6(receipt_id uuid PRIMARY KEY,
        parser_status text,receipt_status text,added_fact_count integer,duplicate_fact_count integer,
        missing_requirements jsonb,rejection_reasons jsonb,parser_owner text,parser_lease_expires_at timestamptz,completed_at timestamptz);
      ALTER TABLE public.candidate_financial_fact_provenance_v4 ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.candidate_financial_document_receipts_v6 ENABLE ROW LEVEL SECURITY;
      CREATE TYPE public.internal_principal_role_v3 AS ENUM('opportunity_runner');
      CREATE FUNCTION public.internal_principal_role_is_exact_v3_internal(uuid,public.internal_principal_role_v3,timestamptz) RETURNS boolean LANGUAGE sql
        AS 'SELECT $1=''55555555-5555-4555-8555-555555555555''::uuid AND $2=''opportunity_runner''';`);
    const migration=fs.readFileSync(new URL('../migrations/20260909_official_financial_validation_receipts.sql',import.meta.url),'utf8');
    sql(migration);sql(migration);
    const fact='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64),inputHash='b'.repeat(64);
    sql(`INSERT INTO public.opportunity_financial_facts_v3 VALUES ('${fact}','2026-08-01','official_filing','mops','pending',false,false,false,false,NULL);
      INSERT INTO public.candidate_financial_fact_provenance_v4 VALUES ('${fact}','https://mopsov.twse.com.tw/server-java/FileDownLoad','${hash}');`);
    const receipt=JSON.stringify({version:'official-financial-v2',reasons:[],checks:['source_identity'],schemaValid:true,unitValid:true,pointInTimeValid:true,consistencyValid:true});
    assert.equal(sql("SELECT has_table_privilege('service_role','public.official_financial_validation_receipts','INSERT')"),'f');
    assert.equal(sql("SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.official_financial_validation_receipts'::regclass"),'opportunity_v3_rpc_owner');
    assert.equal(sql("SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb,uuid)'::regprocedure"),'opportunity_v3_rpc_owner');
    assert.equal(sql("SELECT position('search_path=\"\"' IN array_to_string(proconfig,','))>0 FROM pg_proc WHERE oid='public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb,uuid)'::regprocedure"),'t');
    assert.equal(sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='record_official_financial_validation'"),'1');
    const counterfeit=spawnSync(binary('psql'),['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',String(port),'-U',user,'-d','postgres','-At'],{
      input:`SET ROLE service_role; INSERT INTO public.official_financial_validation_receipts(fact_id,validator_version,input_hash,source_sha256,validation,effective_validation) VALUES('${fact}','official-financial-v2','${'c'.repeat(64)}','${hash}','${receipt}'::jsonb,'{"validation_status":"validated"}'::jsonb);`,encoding:'utf8',env:{...process.env,LC_ALL:'C'}});
    assert.notEqual(counterfeit.status,0,'service_role direct counterfeit receipt must be denied');
    // Mutable predecessor columns are untrusted even when no receipt exists.
    for (const predecessorState of ['validated','rejected','conflict','stale']) {
      sql(`UPDATE public.opportunity_financial_facts_v3 SET validation_status='${predecessorState}',schema_valid=true,
        unit_valid=true,point_in_time_valid=true,consistency_valid=true,validation_recorded_at=clock_timestamp()
        WHERE fact_id='${fact}'`);
      assert.equal(sql(`SELECT validation_status||':'||schema_valid::text FROM public.read_financial_facts_as_of(clock_timestamp()) WHERE fact_id='${fact}'`),'pending:false');
    }
    // Reproduce an upgrade from the predecessor five-argument writer: it left
    // an unbound V1 receipt and mutated the shared fact row.  The successor
    // reader must reconstruct the prior image on both sides of that event.
    const legacyAt='2026-08-02T00:00:00Z';
    sql(`INSERT INTO public.official_financial_validation_receipts(
        fact_id,validator_version,input_hash,source_sha256,validation,validated_at,prior_validation,effective_validation
      ) VALUES('${fact}','official-financial-v1','${'9'.repeat(64)}','${hash}',
        '{"version":"official-financial-v1"}'::jsonb,'${legacyAt}',
        '{"validation_status":"validated","schema_valid":true,"unit_valid":true,"point_in_time_valid":true,"consistency_valid":true,"validation_recorded_at":"${legacyAt}"}'::jsonb,
        '{"validation_status":"validated","schema_valid":true,"unit_valid":true,"point_in_time_valid":true,"consistency_valid":true,"validation_recorded_at":"${legacyAt}"}'::jsonb);
      UPDATE public.opportunity_financial_facts_v3 SET validation_status='validated',schema_valid=true,
        unit_valid=true,point_in_time_valid=true,consistency_valid=true,validation_recorded_at='${legacyAt}' WHERE fact_id='${fact}';`);
    assert.equal(sql(`SELECT validation_status FROM public.read_financial_facts_as_of('${legacyAt}'::timestamptz-interval '1 microsecond') WHERE fact_id='${fact}'`),'pending');
    assert.equal(sql(`SELECT validation_status FROM public.read_financial_facts_as_of('${legacyAt}'::timestamptz+interval '1 microsecond') WHERE fact_id='${fact}'`),'pending');
    const principal='55555555-5555-4555-8555-555555555555';
    const call=`SELECT public.record_official_financial_validation('${fact}','2026-08-01','${hash}','${inputHash}','${receipt}'::jsonb,'${principal}');`;
    sql(`DO $$ BEGIN
      PERFORM public.record_official_financial_validation('${fact}','2026-08-01','${hash}','${inputHash}','${receipt}'::jsonb,'66666666-6666-4666-8666-666666666666');
      RAISE EXCEPTION 'unbound validator accepted';
      EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'principal_role_unavailable' THEN RAISE; END IF;
    END $$;`);
    assert.equal(sql('SELECT count(*) FROM public.official_financial_validation_receipts WHERE validator_principal IS NOT NULL'),'0');
    assert.equal(sql(`SET ROLE service_role; ${call}`).split('\n').at(-1),'t');
    const first=sql(`SELECT validation_recorded_at FROM public.opportunity_financial_facts_v3 WHERE fact_id='${fact}'`);
    assert.equal(sql(`SET ROLE service_role; ${call}`).split('\n').at(-1),'t');
    assert.equal(sql(`SELECT validation_recorded_at FROM public.opportunity_financial_facts_v3 WHERE fact_id='${fact}'`),first);
    assert.equal(sql('SELECT count(*) FROM public.official_financial_validation_receipts WHERE validator_principal IS NOT NULL'),'1');
    const rejected=JSON.stringify({version:'official-financial-v2',reasons:['accounting_or_duplicate_conflict'],checks:['duplicate_consistency'],schemaValid:true,unitValid:true,pointInTimeValid:true,consistencyValid:false});
    const rejectCall=`SELECT public.record_official_financial_validation('${fact}','2026-08-01','${hash}','${'d'.repeat(64)}','${rejected}'::jsonb,'${principal}');`;
    assert.equal(sql(`SET ROLE service_role; ${rejectCall}`).split('\n').at(-1),'f');
    assert.equal(sql(`SELECT validation_status FROM public.opportunity_financial_facts_v3 WHERE fact_id='${fact}'`),'rejected');
    assert.equal(sql(`SELECT validation_status FROM public.read_financial_facts_as_of('${first}'::timestamptz-interval '1 microsecond') WHERE fact_id='${fact}'`),'pending');
    assert.equal(sql(`SELECT validation_status FROM public.read_financial_facts_as_of('${first}') WHERE fact_id='${fact}'`),'validated');
    assert.equal(sql(`SELECT validation_status FROM public.read_financial_facts_as_of(clock_timestamp()) WHERE fact_id='${fact}'`),'rejected');
    assert.equal(sql('SELECT count(*) FROM public.official_financial_validation_receipts WHERE validator_principal IS NOT NULL'),'2');
    assert.equal(sql(`SELECT validation->>'consistencyValid' FROM public.official_financial_validation_receipts WHERE input_hash='${inputHash}'`),'true');
    assert.equal(sql(`SET ROLE service_role; ${call}`).split('\n').at(-1),'f');
    assert.equal(sql(`SELECT validation_status FROM public.opportunity_financial_facts_v3 WHERE fact_id='${fact}'`),'rejected');
    const newPassingCall=call.replace(inputHash,'e'.repeat(64));
    assert.equal(sql(`SET ROLE service_role; ${newPassingCall}`).split('\n').at(-1),'f');
    assert.equal(sql(`SET ROLE service_role; SELECT validation_status FROM public.read_financial_facts_as_of(clock_timestamp()) WHERE fact_id='${fact}'`).split('\n').at(-1),'rejected');
    assert.equal(sql(`SELECT validation_status FROM public.read_financial_facts_as_of('${first}') WHERE fact_id='${fact}'`),'validated');
    assert.equal(sql("SELECT has_function_privilege('authenticated','public.read_financial_facts_as_of(timestamptz)','EXECUTE')"),'f');
    assert.equal(sql("SELECT has_function_privilege('authenticated','public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb,uuid)','EXECUTE')"),'f');
    assert.equal(sql("SELECT has_table_privilege('anon','public.official_financial_validation_receipts','SELECT')"),'f');
    assert.equal(sql("SELECT count(*) FROM pg_policy WHERE polrelid='public.candidate_financial_fact_provenance_v4'::regclass AND polname='official_validation_rpc_owner_provenance_select' AND polcmd='r'"),'1');
    assert.equal(sql("SELECT count(*) FROM pg_policy WHERE polrelid='public.candidate_financial_document_receipts_v6'::regclass AND polname IN ('official_validation_rpc_owner_receipt_select','official_validation_rpc_owner_receipt_update')"),'2');
    for(const permission of ['INSERT','UPDATE','DELETE','TRUNCATE']) {
      assert.equal(sql(`SELECT has_table_privilege('service_role','public.official_financial_validation_receipts','${permission}')`),'f');
    }
    sql(`DO $$ BEGIN
      PERFORM public.record_official_financial_validation('${fact}','2026-08-01','${'c'.repeat(64)}','${inputHash}','${receipt}'::jsonb,'${principal}');
      RAISE EXCEPTION 'mismatched provenance accepted';
      EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'official_validation_provenance_missing' THEN RAISE; END IF;
    END $$;`);
    const receiptId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333';
    sql(`INSERT INTO public.candidate_financial_document_receipts_v6 VALUES('${receiptId}','complete','rejected',0,0,
      '[]','["candidate_financial_local_parser_socket_unavailable"]',NULL,NULL,clock_timestamp())`);
    const retry=`SELECT public.retry_candidate_financial_document_runtime('${receiptId}','${requestId}','55555555-5555-4555-8555-555555555555')`;
    assert.equal(sql(`SET ROLE service_role; ${retry}`).split('\n').at(-1),'t');
    assert.equal(sql(`SET ROLE service_role; ${retry}`).split('\n').at(-1),'f');
    assert.equal(sql(`SELECT parser_status FROM public.candidate_financial_document_receipts_v6 WHERE receipt_id='${receiptId}'`),'queued');
    assert.equal(sql(`SELECT prior_receipt->>'receipt_status' FROM public.candidate_financial_document_retry_audit WHERE request_id='${requestId}'`),'rejected');
    assert.equal(sql("SELECT has_table_privilege('service_role','public.candidate_financial_document_retry_audit','UPDATE')"),'f');
    sql(`UPDATE public.candidate_financial_document_receipts_v6 SET parser_status='complete',receipt_status='rejected',
      rejection_reasons='["stored_document_hash_mismatch"]',completed_at=clock_timestamp() WHERE receipt_id='${receiptId}';
      DO $$ BEGIN
        PERFORM public.retry_candidate_financial_document_runtime('${receiptId}','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555');
        RAISE EXCEPTION 'integrity failure retried';
        EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'receipt_not_runtime_retryable' THEN RAISE; END IF;
      END $$;`);
  } finally {
    if(started)command('pg_ctl',['-D',data,'-m','fast','-w','stop']);
    // Only the explicitly-created, isolated test cluster is removed.
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
