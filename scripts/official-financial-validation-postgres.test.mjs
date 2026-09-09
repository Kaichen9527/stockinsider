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
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
      CREATE TABLE public.opportunity_financial_facts_v3(fact_id uuid PRIMARY KEY,recorded_at timestamptz,
        authority_tier text,provider text,validation_status text,schema_valid boolean,unit_valid boolean,
        point_in_time_valid boolean,consistency_valid boolean);
      CREATE TABLE public.candidate_financial_fact_provenance_v4(fact_id uuid,source_url text,source_sha256 text);
      CREATE TABLE public.candidate_financial_document_receipts_v6(receipt_id uuid PRIMARY KEY,
        parser_status text,receipt_status text,added_fact_count integer,duplicate_fact_count integer,
        missing_requirements jsonb,rejection_reasons jsonb,parser_owner text,parser_lease_expires_at timestamptz,completed_at timestamptz);
      CREATE TYPE public.internal_principal_role_v3 AS ENUM('opportunity_runner');
      CREATE FUNCTION public.internal_principal_role_is_exact_v3_internal(uuid,public.internal_principal_role_v3,timestamptz) RETURNS boolean LANGUAGE sql
        AS 'SELECT $1=''55555555-5555-4555-8555-555555555555''::uuid AND $2=''opportunity_runner''';`);
    const migration=fs.readFileSync(new URL('../migrations/20260909_official_financial_validation_receipts.sql',import.meta.url),'utf8');
    sql(migration);sql(migration);
    const fact='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64),inputHash='b'.repeat(64);
    sql(`INSERT INTO public.opportunity_financial_facts_v3 VALUES ('${fact}','2026-08-01','official_filing','mops','pending',false,false,false,false,NULL);
      INSERT INTO public.candidate_financial_fact_provenance_v4 VALUES ('${fact}','https://mopsov.twse.com.tw/server-java/FileDownLoad','${hash}');`);
    const receipt=JSON.stringify({version:'official-financial-v1',reasons:[],checks:['source_identity'],schemaValid:true,unitValid:true,pointInTimeValid:true,consistencyValid:true});
    const call=`SELECT public.record_official_financial_validation('${fact}','2026-08-01','${hash}','${inputHash}','${receipt}'::jsonb);`;
    assert.equal(sql(`SET ROLE service_role; ${call}`).split('\n').at(-1),'t');
    const first=sql(`SELECT validation_recorded_at FROM public.opportunity_financial_facts_v3 WHERE fact_id='${fact}'`);
    assert.equal(sql(`SET ROLE service_role; ${call}`).split('\n').at(-1),'t');
    assert.equal(sql(`SELECT validation_recorded_at FROM public.opportunity_financial_facts_v3 WHERE fact_id='${fact}'`),first);
    assert.equal(sql('SELECT count(*) FROM public.official_financial_validation_receipts'),'1');
    assert.equal(sql("SELECT has_function_privilege('authenticated','public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb)','EXECUTE')"),'f');
    assert.equal(sql("SELECT has_table_privilege('anon','public.official_financial_validation_receipts','SELECT')"),'f');
    for(const permission of ['UPDATE','DELETE','TRUNCATE']) {
      assert.equal(sql(`SELECT has_table_privilege('service_role','public.official_financial_validation_receipts','${permission}')`),'f');
    }
    sql(`DO $$ BEGIN
      PERFORM public.record_official_financial_validation('${fact}','2026-08-01','${'c'.repeat(64)}','${inputHash}','${receipt}'::jsonb);
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
