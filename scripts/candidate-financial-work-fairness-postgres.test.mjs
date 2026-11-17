import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

test('financial period claims are fair, receipt-aware, bounded and service-only in PostgreSQL', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-field-fair-pg-'));
  const data = path.join(root,'data'), socket = path.join(root,'socket');
  fs.mkdirSync(socket);
  const user = os.userInfo().username, port = 57000 + process.pid % 2000;
  const bin = (name) => process.env.OPPORTUNITY_V3_POSTGRES_BIN
    ? path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN,name) : name;
  const exec = (name,args,input) => {
    const result = spawnSync(bin(name),args,{input,encoding:'utf8',env:{...process.env,LC_ALL:'C'}});
    assert.equal(result.status,0,result.stderr || result.stdout); return result.stdout.trim();
  };
  const psqlArgs = ['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',String(port),'-U',user,'-d','postgres','-At'];
  const sql = (text) => exec('psql',psqlArgs,text);
  const rejectedSql = (input) => {
    const result = spawnSync(bin('psql'),psqlArgs,{input,encoding:'utf8'});
    assert.notEqual(result.status,0);
    return result.stderr;
  };
  let started = false;
  try {
    exec('initdb',['-D',data,'--auth=trust','--no-locale','--encoding=UTF8','-U',user]);
    exec('pg_ctl',['-D',data,'-l',path.join(root,'pg.log'),'-o',`-F -k ${socket} -p ${port} -c listen_addresses=''`,'-w','start']);
    started = true;
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE candidate_financial_acquisition_jobs_v4(job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        stock_id uuid,endpoint_key text,period_end date,cursor_key text,attempts integer DEFAULT 0,
        status text DEFAULT 'queued',next_attempt_at timestamptz,lease_owner text,lease_expires_at timestamptz,
        created_at timestamptz DEFAULT clock_timestamp(),updated_at timestamptz DEFAULT clock_timestamp(),
        CHECK(status='running' OR (lease_owner IS NULL AND lease_expires_at IS NULL)));
      CREATE TABLE candidate_financial_document_receipts_v6(acquisition_job_id uuid,parser_status text,
        receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),financial_validation_status text);
      CREATE TABLE candidate_financial_document_job_links_v9(job_id uuid,receipt_id uuid);
      CREATE TABLE candidate_financial_acquisition_cursors_v4(cursor_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        stock_id uuid,endpoint_key text,cursor_value jsonb NOT NULL,updated_at timestamptz DEFAULT clock_timestamp(),UNIQUE(stock_id,endpoint_key));`);
    const migration = fs.readFileSync(new URL('../migrations/20260911_02_financial_field_work_fairness.sql',import.meta.url),'utf8');
    sql(migration); sql(migration);
    const forward = fs.readFileSync(new URL('../migrations/20261118_51_financial_claim_cursor_lock_order_v1.sql',import.meta.url),'utf8');
    assert.match(rejectedSql(forward),/financial_claim_cursor_predecessor_mismatch/);

    // The document-link migration contains unrelated routines. Install its
    // exact claim definition in this focused fixture rather than reimplement it.
    const predecessor = fs.readFileSync(new URL('../migrations/20260911_03_financial_document_job_links.sql',import.meta.url),'utf8');
    const start = 'CREATE OR REPLACE FUNCTION public.claim_candidate_financial_acquisition_jobs_v4(';
    const end = 'END; $function$;';
    const claim = predecessor.slice(predecessor.indexOf(start));
    assert.ok(claim.startsWith(start) && claim.includes(end));
    sql(claim.slice(0,claim.indexOf(end)+end.length));
    const signature = 'public.claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)';
    const contract = () => sql(`SELECT jsonb_build_array(proowner,prosecdef,proconfig,proacl)::text FROM pg_proc WHERE oid='${signature}'::regprocedure`);
    const originalContract = contract();
    sql(forward); sql(forward);
    assert.equal(contract(),originalContract);

    const stocks = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
    for (const stock of stocks) sql(`INSERT INTO candidate_financial_acquisition_jobs_v4(stock_id,endpoint_key,period_end,cursor_key)
      SELECT '${stock}','mops_inline',date '2025-12-31' - n * interval '3 months',n::text FROM generate_series(0,7) n;`);
    sql(`INSERT INTO candidate_financial_document_receipts_v6(acquisition_job_id,parser_status)
      SELECT job_id,'queued' FROM candidate_financial_acquisition_jobs_v4 WHERE stock_id='${stocks[0]}' AND cursor_key='0';
      WITH pending_receipt AS (
        INSERT INTO candidate_financial_document_receipts_v6(parser_status,financial_validation_status)
        VALUES('complete','pending') RETURNING receipt_id
      )
      INSERT INTO candidate_financial_document_job_links_v9(job_id,receipt_id)
      SELECT job_id,receipt_id FROM candidate_financial_acquisition_jobs_v4 CROSS JOIN pending_receipt
      WHERE stock_id='${stocks[1]}' AND cursor_key='0';`);
    const call = (limit, issuerIds = stocks, owner = 'runner') => `SELECT * FROM claim_candidate_financial_acquisition_jobs_v4(
      ARRAY[${issuerIds.map((stock) => `'${stock}'::uuid`).join(',')}],'mops_inline',${limit},'${owner}',clock_timestamp(),clock_timestamp()+interval '5 minutes')`;
    sql(`CREATE TEMP TABLE claimed AS ${call(3)};`); // A psql connection owns this table only.
    const rows = sql(`SELECT stock_id||':'||cursor_key FROM candidate_financial_acquisition_jobs_v4 WHERE status='running' ORDER BY stock_id;`).split('\n');
    assert.equal(rows.length,3); assert.equal(new Set(rows.map((row) => row.split(':')[0])).size,3);
    assert.ok(!rows.includes(`${stocks[0]}:0`));
    assert.ok(!rows.includes(`${stocks[1]}:0`),'linked pending validation excludes the job');
    assert.equal(sql('SELECT count(*) FROM candidate_financial_acquisition_cursors_v4 WHERE last_attempted_at IS NOT NULL'),'3');
    const parallelClaim = (owner, limit = 6, issuerIds = stocks) => new Promise((resolve,reject) => {
      const child = spawn(bin('psql'),[...psqlArgs,'-q'], { env:process.env });
      let output='',error=''; child.stdout.on('data',(part) => { output+=part; }); child.stderr.on('data',(part) => { error+=part; });
      child.on('error',reject); child.on('exit',(code) => code===0 ? resolve(output.trim().split('\n').filter(Boolean)) : reject(new Error(error)));
      child.stdin.end(`SET statement_timeout='10s'; SET ROLE service_role; ${call(limit,issuerIds,owner)};`);
    });
    const parallel = (await Promise.all(['first','second','third','fourth'].map(owner => parallelClaim(owner)))).flat();
    const claimedIds = parallel.map((row) => row.split('|')[0]);
    assert.equal(new Set(claimedIds).size,claimedIds.length,'concurrent claims cannot overwrite a fresh lease');
    assert.equal(sql("SELECT count(*) FROM candidate_financial_acquisition_jobs_v4 WHERE lease_owner='runner'"),'3');
    assert.equal(sql(`SELECT count(*) FROM candidate_financial_acquisition_jobs_v4
      WHERE stock_id='${stocks[1]}' AND cursor_key='0' AND status='queued'`),'1');

    // Capture the actual cursor insertion order before PostgreSQL can wait on
    // the conflicting unique key. Each claim holds disjoint jobs but may
    // upsert exactly the same cursor keys as a concurrent claim.
    sql(`CREATE TABLE fixture_cursor_trace (
        sequence bigint GENERATED ALWAYS AS IDENTITY, transaction_id bigint, stock_id uuid
      );
      CREATE FUNCTION fixture_capture_cursor() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO fixture_cursor_trace(transaction_id,stock_id) VALUES(txid_current(),NEW.stock_id);
        RETURN NEW;
      END $$;
      CREATE TRIGGER fixture_capture_cursor BEFORE INSERT ON candidate_financial_acquisition_cursors_v4
        FOR EACH ROW EXECUTE FUNCTION fixture_capture_cursor();`);
    const largeIssuers = Array.from({length:24},(_,i) => `44444444-4444-4444-8444-${String(i+1).padStart(12,'0')}`);
    sql(`INSERT INTO candidate_financial_acquisition_jobs_v4(stock_id,endpoint_key,period_end,cursor_key)
      SELECT issuer::uuid,'mops_inline',date '2025-12-31' - n * interval '3 months',n::text
      FROM unnest(ARRAY[${largeIssuers.map(id=>`'${id}'`).join(',')}]) issuer CROSS JOIN generate_series(0,5) n;`);
    const four = await Promise.all(['large_a','large_b','large_c','large_d'].map(owner => parallelClaim(owner,24,largeIssuers)));
    const sizes = four.map(rows => rows.length);
    assert.ok(sizes.every(size => size > 1 && size <= 24), `concurrent batch sizes: ${sizes.join(', ')}`);
    const firstIds = four.flat().map(row => row.split('|')[0]);
    assert.equal(new Set(firstIds).size,firstIds.length);
    assert.ok(Number(sql(`SELECT count(*) FROM (
      SELECT stock_id FROM fixture_cursor_trace GROUP BY stock_id HAVING count(DISTINCT transaction_id)>1
    ) shared`))>=2,'concurrent claim transactions share at least two cursor keys');
    assert.equal(sql(`SELECT count(*) FROM (
      SELECT transaction_id FROM fixture_cursor_trace GROUP BY transaction_id
      HAVING count(DISTINCT stock_id)>1
         AND array_agg(stock_id ORDER BY sequence)=array_agg(stock_id ORDER BY stock_id)
    ) ordered`),'4','all four claims touch multiple shared cursor keys in stock-ID order');
    // SKIP LOCKED can leave capacity unused during a concurrent wave. The
    // next bounded claim must recover all remaining jobs without duplication.
    const remaining = await parallelClaim('large_retry',144,largeIssuers);
    const allIds = [...firstIds, ...remaining.map(row => row.split('|')[0])];
    assert.equal(allIds.length,144);
    assert.equal(new Set(allIds).size,144);
    assert.equal(sql(`SELECT count(*) FROM candidate_financial_acquisition_jobs_v4
      WHERE lease_owner IN ('large_a','large_b','large_c','large_d','large_retry')
        AND status='running' AND lease_expires_at IS NOT NULL`),'144');
    assert.equal(sql(`SELECT has_function_privilege('anon','claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)','EXECUTE')`),'f');
    assert.equal(sql(`SELECT has_function_privilege('service_role','claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)','EXECUTE')`),'t');
    const invalid = spawnSync(bin('psql'),['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',String(port),'-U',user,'-d','postgres','-At'],{input:call(241),encoding:'utf8'});
    assert.notEqual(invalid.status,0); assert.match(invalid.stderr,/invalid_candidate_financial_claim/);
  } finally {
    if (started) exec('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
    fs.rmSync(root,{recursive:true,force:true});
  }
});
