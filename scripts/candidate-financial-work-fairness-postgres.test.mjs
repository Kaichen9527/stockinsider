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
  const sql = (text) => exec('psql',['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',String(port),'-U',user,'-d','postgres','-At'],text);
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
      CREATE TABLE candidate_financial_document_receipts_v6(acquisition_job_id uuid,parser_status text);
      CREATE TABLE candidate_financial_acquisition_cursors_v4(cursor_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        stock_id uuid,endpoint_key text,cursor_value jsonb NOT NULL,updated_at timestamptz DEFAULT clock_timestamp(),UNIQUE(stock_id,endpoint_key));`);
    const migration = fs.readFileSync(new URL('../migrations/20260911_02_financial_field_work_fairness.sql',import.meta.url),'utf8');
    sql(migration); sql(migration);
    const stocks = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
    for (const stock of stocks) sql(`INSERT INTO candidate_financial_acquisition_jobs_v4(stock_id,endpoint_key,period_end,cursor_key)
      SELECT '${stock}','mops_inline',date '2025-12-31' - n * interval '3 months',n::text FROM generate_series(0,7) n;`);
    sql(`INSERT INTO candidate_financial_document_receipts_v6
      SELECT job_id,'queued' FROM candidate_financial_acquisition_jobs_v4 WHERE stock_id='${stocks[0]}' AND cursor_key='0';`);
    const call = (limit) => `SELECT * FROM claim_candidate_financial_acquisition_jobs_v4(
      ARRAY[${stocks.map((stock) => `'${stock}'::uuid`).join(',')}],'mops_inline',${limit},'runner',clock_timestamp(),clock_timestamp()+interval '5 minutes')`;
    sql(`CREATE TEMP TABLE claimed AS ${call(3)};`); // A psql connection owns this table only.
    const rows = sql(`SELECT stock_id||':'||cursor_key FROM candidate_financial_acquisition_jobs_v4 WHERE status='running' ORDER BY stock_id;`).split('\n');
    assert.equal(rows.length,3); assert.equal(new Set(rows.map((row) => row.split(':')[0])).size,3);
    assert.ok(!rows.includes(`${stocks[0]}:0`));
    assert.equal(sql('SELECT count(*) FROM candidate_financial_acquisition_cursors_v4 WHERE last_attempted_at IS NOT NULL'),'3');
    const parallelClaim = (owner) => new Promise((resolve,reject) => {
      const child = spawn(bin('psql'),['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',String(port),'-U',user,'-d','postgres','-At'], { env:process.env });
      let output='',error=''; child.stdout.on('data',(part) => { output+=part; }); child.stderr.on('data',(part) => { error+=part; });
      child.on('error',reject); child.on('exit',(code) => code===0 ? resolve(output.trim().split('\n').filter(Boolean)) : reject(new Error(error)));
      child.stdin.end(call(6).replace("'runner'",`'${owner}'`));
    });
    const parallel = (await Promise.all(['first','second','third','fourth'].map(parallelClaim))).flat();
    const claimedIds = parallel.map((row) => row.split('|')[0]);
    assert.equal(new Set(claimedIds).size,claimedIds.length,'concurrent claims cannot overwrite a fresh lease');
    assert.equal(sql("SELECT count(*) FROM candidate_financial_acquisition_jobs_v4 WHERE lease_owner='runner'"),'3');
    assert.equal(sql(`SELECT has_function_privilege('anon','claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)','EXECUTE')`),'f');
    assert.equal(sql(`SELECT has_function_privilege('service_role','claim_candidate_financial_acquisition_jobs_v4(uuid[],text,integer,text,timestamptz,timestamptz)','EXECUTE')`),'t');
    const invalid = spawnSync(bin('psql'),['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p',String(port),'-U',user,'-d','postgres','-At'],{input:call(241),encoding:'utf8'});
    assert.notEqual(invalid.status,0); assert.match(invalid.stderr,/invalid_candidate_financial_claim/);
  } finally {
    if (started) exec('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
    fs.rmSync(root,{recursive:true,force:true});
  }
});
