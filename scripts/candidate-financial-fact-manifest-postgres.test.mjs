import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

test('v8 parser evidence and exact fact validation survive a real PostgreSQL boundary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-fact-v8-pg-'));
  const data = path.join(root, 'data'), socket = path.join(root, 'socket');
  fs.mkdirSync(socket);
  const user = os.userInfo().username, port = 56000 + (process.pid % 3000);
  const binary = (name) => process.env.OPPORTUNITY_V3_POSTGRES_BIN
    ? path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN, name)
    : spawnSync('/usr/bin/env', ['sh', '-c', 'command -v "$1"', 'pg-tool', name], { encoding: 'utf8' }).stdout.trim();
  const command = (name, args, input) => {
    const result = spawnSync(binary(name), args, { input, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  };
  const sql = (value) => command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket,
    '-p', String(port), '-U', user, '-d', 'postgres', '-At'], value);
  const sqlFails = (value) => {
    const result = spawnSync(binary('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket,
      '-p', String(port), '-U', user, '-d', 'postgres', '-At'],
    { input: value, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
    assert.notEqual(result.status, 0, result.stdout);
    return result.stderr;
  };
  let started = false;
  try {
    command('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', user]);
    command('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'),
      '-o', `-F -k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    sql(`CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE TABLE public.stocks(id uuid PRIMARY KEY,symbol text NOT NULL);
      CREATE TABLE public.candidate_issuer_document_domains_v6(stock_id uuid,host text,PRIMARY KEY(stock_id,host));
      CREATE TABLE public.candidate_financial_acquisition_jobs_v4(job_id uuid PRIMARY KEY,stock_id uuid,
        status text,terminal_reason text,terminal_detail text,lease_owner text,lease_expires_at timestamptz,
        collected_at timestamptz,next_attempt_at timestamptz,updated_at timestamptz);
      CREATE TABLE public.candidate_issuer_ir_document_queue_v4(document_id uuid PRIMARY KEY);
      CREATE TABLE public.candidate_financial_document_receipts_v6(
        receipt_id uuid PRIMARY KEY,stock_id uuid NOT NULL REFERENCES public.stocks(id),
        acquisition_job_id uuid REFERENCES public.candidate_financial_acquisition_jobs_v4(job_id),
        issuer_document_id uuid NOT NULL REFERENCES public.candidate_issuer_ir_document_queue_v4(document_id),
        source_url text NOT NULL,exchange text NOT NULL,period_end date NOT NULL,document_sha256 text NOT NULL,
        receipt_status text NOT NULL CONSTRAINT candidate_financial_document_receipts_v6_receipt_status_check
          CHECK(receipt_status IN ('accepted','partial','rejected')),
        parser_status text NOT NULL,parser_owner text,parser_lease_expires_at timestamptz,
        parser_locators jsonb NOT NULL DEFAULT '[]',added_fact_count integer NOT NULL DEFAULT 0,
        duplicate_fact_count integer NOT NULL DEFAULT 0,missing_requirements jsonb NOT NULL DEFAULT '[]',
        rejection_reasons jsonb NOT NULL DEFAULT '[]',accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        completed_at timestamptz);
      CREATE TYPE public.financial_fact_input_v3 AS (stock_id uuid,fact_key text,period_start date,period_end date,
        duration_kind text,value numeric,unit text,provider text,authority_tier text,estimate_kind text,
        estimate_horizon text,filing_published_at timestamptz,source_timestamp timestamptz,collected_at timestamptz,
        filing_restatement_id text,source_ref text);
      CREATE TABLE public.opportunity_financial_facts_v3(fact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        stock_id uuid,source_ref text,collected_at timestamptz,recorded_at timestamptz DEFAULT clock_timestamp(),
        provider text,authority_tier text,validation_status text DEFAULT 'pending',schema_valid boolean,
        unit_valid boolean,point_in_time_valid boolean,consistency_valid boolean,validation_recorded_at timestamptz);
      CREATE TABLE public.candidate_financial_fact_provenance_v4(fact_id uuid,issuer_document_id uuid,
        source_url text,source_sha256 text,locator jsonb,extracted_at timestamptz);
      CREATE TABLE public.official_financial_validation_receipts(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fact_id uuid,validator_version text,input_hash text,
        source_sha256 text,validation jsonb,validated_at timestamptz DEFAULT clock_timestamp(),
        receipt_sequence bigint GENERATED ALWAYS AS IDENTITY,prior_validation jsonb,effective_validation jsonb,
        UNIQUE(fact_id,validator_version,input_hash));
      CREATE FUNCTION public.internal_principal_role_is_exact_v3_internal(uuid,text,timestamptz) RETURNS boolean
        LANGUAGE sql AS 'SELECT $1=''55555555-5555-4555-8555-555555555555''::uuid AND $2=''opportunity_runner''';
      CREATE FUNCTION public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)
        RETURNS TABLE(fact_id uuid,recorded_at timestamptz) LANGUAGE plpgsql AS $$
        BEGIN RETURN QUERY INSERT INTO public.opportunity_financial_facts_v3(stock_id,source_ref,collected_at,provider,authority_tier)
          VALUES(($1).stock_id,($1).source_ref,($1).collected_at,($1).provider,($1).authority_tier) RETURNING opportunity_financial_facts_v3.fact_id,
          opportunity_financial_facts_v3.recorded_at; END $$;
      CREATE FUNCTION public.complete_candidate_financial_document_receipt_parser_v7(
        uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,timestamptz) RETURNS TABLE(receipt_status text,added_fact_count integer,duplicate_fact_count integer)
        LANGUAGE sql AS 'SELECT ''partial''::text,0,0';
      GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;`);
    const migration = fs.readFileSync(new URL('../migrations/20260911_candidate_financial_fact_manifest_v8.sql', import.meta.url), 'utf8');
    sql(migration); sql(migration);
    const stock = '11111111-1111-4111-8111-111111111111';
    const job = '22222222-2222-4222-8222-222222222222';
    const doc = '33333333-3333-4333-8333-333333333333';
    const receipt = '44444444-4444-4444-8444-444444444444';
    const principal = '55555555-5555-4555-8555-555555555555';
    const hash = 'a'.repeat(64);
    sql(`INSERT INTO public.stocks VALUES('${stock}','2330');
      INSERT INTO public.candidate_financial_acquisition_jobs_v4(job_id,stock_id,status) VALUES('${job}','${stock}','running');
      INSERT INTO public.candidate_issuer_ir_document_queue_v4 VALUES('${doc}');
      INSERT INTO public.candidate_financial_document_receipts_v6(receipt_id,stock_id,acquisition_job_id,issuer_document_id,
        source_url,exchange,period_end,document_sha256,receipt_status,parser_status,parser_owner,parser_lease_expires_at)
      VALUES('${receipt}','${stock}','${job}','${doc}','https://mops.twse.com.tw/filing','TWSE','2026-06-30',
        '${hash}','accepted','running','runner',clock_timestamp()+interval '5 minutes');`);
    const manifest = [{ xbrl_context:'D', xbrl_concept:'tifrs-full:Revenue', value:'100', unit:'TWD',
      entity_identifier:'2330', period_start:'2026-04-01', period_end:'2026-06-30', duration_kind:'quarterly', dimension_count:0 }];
    const evidence = { schema:'candidate-financial-parser-evidence-v8', documentSha256:hash, parser:'arelle',
      parserVersion:'arelle-2.44.7', taxonomySha256:'4e44e67647b1a5a575d416ef44614d9c5651bb0d895621e12f6b6ca64a457869',
      validation:{ errorCount:0,errorCodes:[],validFactCount:1,errorsTruncated:false }, validatedFacts:manifest };
    const fact = { input:{ stock_id:stock,fact_key:'quarterly_revenue',period_start:'2026-04-01',period_end:'2026-06-30',
      duration_kind:'quarterly',value:100,unit:'TWD',provider:'mops',authority_tier:'official_filing',estimate_kind:'reported',
      estimate_horizon:'reported_period',filing_published_at:'2026-08-01T00:00:00Z',source_timestamp:'2026-08-01T00:00:00Z',
      collected_at:'2026-08-01T01:00:00Z',filing_restatement_id:null,source_ref:`issuer-document:${hash}:one` },
      locator:{ xbrl_context:'D',xbrl_concept:'tifrs-full:Revenue' } };
    const complete = `SELECT * FROM public.complete_candidate_financial_document_receipt_parser_v8('${receipt}','runner','${principal}',
      '${JSON.stringify([fact])}'::jsonb,'${JSON.stringify([{xbrl_context:'D',xbrl_concept:'tifrs-full:Revenue'}])}'::jsonb,
      '${JSON.stringify(evidence)}'::jsonb,'[]','[]',clock_timestamp())`;
    assert.match(sql(`SET ROLE service_role; ${complete}`).split('\n').at(-1), /^validation_pending\|1\|0$/u);
    assert.equal(sql(`SELECT receipt_status||'|'||financial_validation_status FROM public.candidate_financial_document_receipts_v6 WHERE receipt_id='${receipt}'`), 'validation_pending|pending');
    assert.equal(sql(`SELECT count(*) FROM public.candidate_financial_parser_evidence_v8 WHERE receipt_id='${receipt}'`), '1');
    assert.equal(sql(`SELECT count(*) FROM public.candidate_financial_document_fact_links_v8 WHERE receipt_id='${receipt}'`), '1');
    assert.equal(sql(`SELECT status FROM public.candidate_financial_acquisition_jobs_v4 WHERE job_id='${job}'`), 'running');
    const pendingFinalize = `SET ROLE service_role; SELECT * FROM public.finalize_candidate_financial_document_validation_v8('${receipt}','${principal}',clock_timestamp())`;
    assert.match(sql(pendingFinalize).split('\n').at(-1), /^pending\|0\|0\|1$/u);
    sql(`UPDATE public.opportunity_financial_facts_v3 SET validation_status='validated',schema_valid=true,
      unit_valid=true,point_in_time_valid=true,consistency_valid=true;`);
    // Mutable flags without an immutable validation receipt still fail closed.
    assert.match(sql(pendingFinalize).split('\n').at(-1), /^pending\|0\|0\|1$/u);
    const validation = { version:'official-financial-v1',schemaValid:true,unitValid:true,
      pointInTimeValid:true,consistencyValid:true,reasons:[],checks:['source_identity'] };
    assert.equal(sql(`SET ROLE service_role; SELECT public.record_official_financial_validation(
      (SELECT fact_id FROM public.opportunity_financial_facts_v3 LIMIT 1),
      (SELECT recorded_at FROM public.opportunity_financial_facts_v3 LIMIT 1),'${hash}','${'c'.repeat(64)}',
      '${JSON.stringify(validation)}'::jsonb)`).split('\n').at(-1), 't');
    assert.match(sql(`SET ROLE service_role; SELECT * FROM public.finalize_candidate_financial_document_validation_v8('${receipt}','${principal}',clock_timestamp())`).split('\n').at(-1), /^validated\|1\|0\|0$/u);
    assert.equal(sql(`SELECT receipt_status||'|'||financial_validation_status FROM public.candidate_financial_document_receipts_v6 WHERE receipt_id='${receipt}'`), 'accepted|validated');
    assert.equal(sql(`SELECT status||'|'||terminal_reason FROM public.candidate_financial_acquisition_jobs_v4 WHERE job_id='${job}'`), 'terminal|complete');

    const pdfReceipt = '66666666-6666-4666-8666-666666666666';
    const pdfDoc = '77777777-7777-4777-8777-777777777777';
    sql(`INSERT INTO public.candidate_issuer_ir_document_queue_v4 VALUES('${pdfDoc}');
      INSERT INTO public.candidate_financial_document_receipts_v6(receipt_id,stock_id,issuer_document_id,source_url,exchange,
        period_end,document_sha256,receipt_status,parser_status,parser_owner,parser_lease_expires_at)
      VALUES('${pdfReceipt}','${stock}','${pdfDoc}','https://mops.twse.com.tw/pdf','TWSE','2026-06-30','${'b'.repeat(64)}',
        'accepted','running','runner',clock_timestamp()+interval '5 minutes');`);
    const pdfEvidence = { schema:'candidate-financial-parser-evidence-v8', documentSha256:'b'.repeat(64),
      parser:'pdfplumber', parserVersion:'pdfplumber-bounded-v1', taxonomySha256:null, validation:null, validatedFacts:[] };
    assert.match(sql(`SET ROLE service_role; SELECT * FROM public.complete_candidate_financial_document_receipt_parser_v8(
      '${pdfReceipt}','runner','${principal}','[]','[{"page":1,"table":1}]','${JSON.stringify(pdfEvidence)}',
      '["validated_pdf_manifest_required"]','[]',clock_timestamp())`).split('\n').at(-1), /^partial\|0\|0$/u);
    assert.equal(sql(`SELECT parser_status FROM public.candidate_financial_document_receipts_v6 WHERE receipt_id='${pdfReceipt}'`), 'complete');
    assert.equal(sql("SELECT has_function_privilege('authenticated','public.finalize_candidate_financial_document_validation_v8(uuid,uuid,timestamptz)','EXECUTE')"), 'f');
    for (const key of ['schema','documentSha256','parserVersion','taxonomySha256']) {
      const badReceipt = randomUUID();
      const badDoc = randomUUID();
      sql(`INSERT INTO public.candidate_issuer_ir_document_queue_v4 VALUES('${badDoc}');
        INSERT INTO public.candidate_financial_document_receipts_v6(receipt_id,stock_id,issuer_document_id,source_url,exchange,
          period_end,document_sha256,receipt_status,parser_status,parser_owner,parser_lease_expires_at)
        VALUES('${badReceipt}','${stock}','${badDoc}','https://mops.twse.com.tw/bad','TWSE','2026-06-30','${hash}',
          'accepted','running','runner',clock_timestamp()+interval '5 minutes');`);
      const invalidEvidence = { ...evidence };
      delete invalidEvidence[key];
      assert.match(sqlFails(`SET ROLE service_role; SELECT * FROM public.complete_candidate_financial_document_receipt_parser_v8(
        '${badReceipt}','runner','${principal}','[]','[]','${JSON.stringify(invalidEvidence)}','[]','[]',clock_timestamp())`),
      /candidate_financial/u);
      assert.equal(sql(`SELECT parser_status FROM public.candidate_financial_document_receipts_v6 WHERE receipt_id='${badReceipt}'`), 'running');
    }
  } finally {
    if (started) command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    fs.rmSync(root, { recursive:true, force:true });
  }
});
