import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

test('replayed financial receipts complete only exact validated current field work, without mutating provenance', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-job-link-pg-'));
  const data = path.join(root, 'data'), socket = path.join(root, 'socket');
  fs.mkdirSync(socket);
  const user = os.userInfo().username, port = 55000 + process.pid % 2000;
  const bin = (name) => process.env.OPPORTUNITY_V3_POSTGRES_BIN ? path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN, name) : name;
  const command = (name, args, input, success = true) => {
    const result = spawnSync(bin(name), args, { input, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
    if (success) assert.equal(result.status, 0, result.stderr || result.stdout);
    else assert.notEqual(result.status, 0, result.stdout);
    return success ? result.stdout.trim() : result.stderr;
  };
  const sql = (input, success = true) => command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket,
    '-p', String(port), '-U', user, '-d', 'postgres', '-At'], input, success);
  const stock = randomUUID(), principal = '55555555-5555-4555-8555-555555555555', receipt = randomUUID(), hash = 'a'.repeat(64);
  let started = false;
  try {
    command('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', user]);
    command('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-F -k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TYPE financial_acquisition_terminal_reason_v4 AS ENUM ('complete','schema_unrecognized');
      CREATE TABLE candidate_financial_acquisition_jobs_v4(job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),stock_id uuid,
        period_end date DEFAULT '2026-06-30',endpoint_key text DEFAULT 'mops_inline',cursor_key text DEFAULT 'new',
        status text DEFAULT 'queued',terminal_reason financial_acquisition_terminal_reason_v4,terminal_detail text,
        attempts integer DEFAULT 0,next_attempt_at timestamptz,lease_owner text,lease_expires_at timestamptz,
        created_at timestamptz DEFAULT clock_timestamp(),updated_at timestamptz DEFAULT clock_timestamp(),collected_at timestamptz,
        required_fact_keys jsonb DEFAULT '[]',
        CHECK((status='terminal')=(terminal_reason IS NOT NULL)),
        CHECK(status<>'terminal' OR (collected_at IS NOT NULL AND lease_expires_at IS NULL)),
        CHECK(status='running' OR (lease_owner IS NULL AND lease_expires_at IS NULL)),
        CHECK(status<>'running' OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)));
      CREATE TABLE candidate_financial_acquisition_cursors_v4(stock_id uuid,endpoint_key text,cursor_value jsonb,
        last_attempted_at timestamptz,updated_at timestamptz,PRIMARY KEY(stock_id,endpoint_key));
      CREATE TABLE candidate_financial_document_receipts_v6(receipt_id uuid PRIMARY KEY,stock_id uuid,acquisition_job_id uuid,
        period_end date DEFAULT '2026-06-30',document_sha256 text,source_url text DEFAULT 'https://mopsov.twse.com.tw/report',
        parser_status text DEFAULT 'complete',receipt_status text DEFAULT 'accepted',financial_validation_status text DEFAULT 'validated',
        missing_requirements jsonb DEFAULT '[]',rejection_reasons jsonb DEFAULT '[]');
      CREATE TABLE opportunity_financial_facts_v3(fact_id uuid PRIMARY KEY,stock_id uuid,fact_key text,period_end date DEFAULT '2026-06-30',
        recorded_at timestamptz DEFAULT clock_timestamp(),collected_at timestamptz DEFAULT clock_timestamp(),
        provider text DEFAULT 'mops',authority_tier text DEFAULT 'official_filing',validation_status text DEFAULT 'validated',
        schema_valid boolean DEFAULT true,unit_valid boolean DEFAULT true,point_in_time_valid boolean DEFAULT true,consistency_valid boolean DEFAULT true);
      CREATE TABLE candidate_financial_document_fact_links_v8(receipt_id uuid,fact_id uuid,fact_recorded_at timestamptz);
      CREATE TABLE official_financial_validation_receipts(fact_id uuid,source_sha256 text,validated_at timestamptz DEFAULT clock_timestamp(),effective_validation jsonb);
      CREATE TABLE candidate_financial_fact_provenance_v4(fact_id uuid,source_sha256 text);
      CREATE FUNCTION internal_principal_role_is_exact_v3_internal(uuid,text,timestamptz) RETURNS boolean LANGUAGE sql
        AS 'SELECT $1=''${principal}''::uuid AND $2=''opportunity_runner''';
      INSERT INTO candidate_financial_document_receipts_v6(receipt_id,stock_id,document_sha256) VALUES('${receipt}','${stock}','${hash}');`);
    const migration = fs.readFileSync(new URL('../migrations/20260911_03_financial_document_job_links.sql', import.meta.url), 'utf8');
    sql(migration); sql(migration);
    const originalReceipt = sql(`SELECT row_to_json(receipt)::text FROM candidate_financial_document_receipts_v6 receipt WHERE receipt_id='${receipt}'`);
    const job = (keys = ['quarterly_revenue'], extra = '') => {
      const id = randomUUID();
      sql(`INSERT INTO candidate_financial_acquisition_jobs_v4(job_id,stock_id,required_fact_keys) VALUES('${id}','${stock}','${JSON.stringify(keys)}'); ${extra}`);
      return id;
    };
    const reconcile = (id, receiptId = receipt) => sql(`SET ROLE service_role; SELECT job_status||'|'||COALESCE(terminal_reason,'pending')||'|'||missing_fact_keys::text
      FROM reconcile_candidate_financial_document_job_v9('${receiptId}','${id}','${principal}')`).split('\n').at(-1);
    const addFact = (key, documentReceipt = receipt, documentHash = hash, withValidation = true) => {
      const id = randomUUID();
      sql(`INSERT INTO opportunity_financial_facts_v3(fact_id,stock_id,fact_key) VALUES('${id}','${stock}','${key}');
        INSERT INTO candidate_financial_document_fact_links_v8 SELECT '${documentReceipt}',fact_id,recorded_at FROM opportunity_financial_facts_v3 WHERE fact_id='${id}';
        INSERT INTO candidate_financial_fact_provenance_v4 VALUES('${id}','${documentHash}');`);
      if (withValidation) validateFact(id, documentHash);
      return id;
    };
    const validateFact = (id, sourceHash = hash) => sql(`INSERT INTO official_financial_validation_receipts(fact_id,source_sha256,effective_validation)
      VALUES('${id}','${sourceHash}','{"validation_status":"validated","schema_valid":true,"unit_valid":true,"point_in_time_valid":true,"consistency_valid":true}');`);
    const newJob = job(['quarterly_revenue','cash_and_equivalents']);
    const revenue = addFact('quarterly_revenue', receipt, hash, false);
    assert.match(reconcile(newJob), /^queued\|pending\|.*quarterly_revenue/);
    validateFact(revenue);
    assert.equal(reconcile(newJob), 'queued|pending|["cash_and_equivalents"]');
    // Even an older finalizer cannot publish terminal/complete over missing fields.
    sql(`UPDATE candidate_financial_acquisition_jobs_v4 SET status='terminal',terminal_reason='complete',collected_at=clock_timestamp() WHERE job_id='${newJob}';`);
    assert.equal(sql(`SELECT status FROM candidate_financial_acquisition_jobs_v4 WHERE job_id='${newJob}'`), 'queued');
    // A later shrink of the mutable requirement list does not erase the link's original contract.
    sql(`UPDATE candidate_financial_acquisition_jobs_v4 SET required_fact_keys='[]' WHERE job_id='${newJob}';`);
    assert.equal(reconcile(newJob), 'queued|pending|["cash_and_equivalents"]');
    const alternativeReceipt = randomUUID();
    sql(`INSERT INTO candidate_financial_document_receipts_v6(receipt_id,stock_id,document_sha256)
      VALUES('${alternativeReceipt}','${stock}','${'d'.repeat(64)}');`);
    addFact('quarterly_revenue', alternativeReceipt, 'd'.repeat(64));
    assert.equal(reconcile(newJob, alternativeReceipt), 'queued|pending|["cash_and_equivalents"]',
      'a new link after mutable requirements shrink cannot erase the original immutable contract');
    const cash = addFact('cash_and_equivalents', receipt, hash, false);
    validateFact(cash, 'b'.repeat(64));
    assert.equal(reconcile(newJob), 'queued|pending|["cash_and_equivalents"]');
    validateFact(cash);
    assert.equal(reconcile(newJob), 'terminal|complete|[]');
    assert.equal(reconcile(newJob, alternativeReceipt), 'terminal|complete|[]',
      'a partial alternative does not erase a still-valid complete document');
    const anotherJob = job();
    assert.equal(reconcile(anotherJob), 'terminal|complete|[]', 'already parsed manual receipt can complete a new job');
    assert.equal(reconcile(anotherJob), 'terminal|complete|[]', 'replay is idempotent');
    assert.equal(sql(`SELECT count(*) FROM candidate_financial_document_job_links_v9 WHERE job_id='${anotherJob}'`), '1');
    assert.equal(sql(`SELECT row_to_json(receipt)::text FROM candidate_financial_document_receipts_v6 receipt WHERE receipt_id='${receipt}'`), originalReceipt);
    assert.match(sql(`UPDATE candidate_financial_document_job_links_v9 SET linked_at=clock_timestamp() WHERE job_id='${anotherJob}'`, false), /job_link_immutable/);
    const wrongPeriod = job();
    sql(`UPDATE candidate_financial_acquisition_jobs_v4 SET period_end='2025-12-31' WHERE job_id='${wrongPeriod}'`);
    assert.match(sql(`SET ROLE service_role; SELECT * FROM reconcile_candidate_financial_document_job_v9('${receipt}','${wrongPeriod}','${principal}')`, false), /job_mismatch/);

    const pendingReceipt = randomUUID(), pendingJob = job();
    sql(`INSERT INTO candidate_financial_document_receipts_v6(receipt_id,stock_id,document_sha256,parser_status,financial_validation_status)
      VALUES('${pendingReceipt}','${stock}','${'c'.repeat(64)}','queued','not_applicable');`);
    assert.match(reconcile(pendingJob, pendingReceipt), /^queued\|pending/);
    sql(`UPDATE candidate_financial_acquisition_jobs_v4 SET next_attempt_at=NULL WHERE job_id='${pendingJob}';`);
    const claim = sql(`SELECT job_id FROM claim_candidate_financial_acquisition_jobs_v4(ARRAY['${stock}'::uuid],'mops_inline',20,'runner',clock_timestamp(),clock_timestamp()+interval '5 minutes')`);
    assert.ok(!claim.includes(pendingJob), 'a replay-linked queued document is not downloaded again');
    sql(`UPDATE candidate_financial_document_receipts_v6 SET parser_status='complete',financial_validation_status='validated' WHERE receipt_id='${pendingReceipt}';`);
    addFact('quarterly_revenue', pendingReceipt, 'c'.repeat(64));
    assert.equal(sql(`SET ROLE service_role; SELECT job_status FROM reconcile_pending_financial_document_jobs_v9('${principal}',40,'${pendingReceipt}')`).split('\n').at(-1), 'terminal');
    assert.equal(sql(`SELECT terminal_reason FROM candidate_financial_acquisition_jobs_v4 WHERE job_id='${pendingJob}'`), 'complete');
    for (const role of ['anon','authenticated']) assert.equal(sql(`SELECT has_function_privilege('${role}','reconcile_candidate_financial_document_job_v9(uuid,uuid,uuid)','EXECUTE')`), 'f');
    assert.equal(sql(`SELECT has_table_privilege('service_role','candidate_financial_document_job_links_v9','UPDATE')`), 'f');
    assert.match(sql(`SET ROLE service_role; SELECT * FROM reconcile_candidate_financial_document_job_v9('${receipt}','${anotherJob}','${randomUUID()}')`, false), /principal_role_unavailable/);

    const originalJob = job(['missing_required_field']), originalDocument = randomUUID();
    sql(`INSERT INTO candidate_financial_document_receipts_v6(receipt_id,stock_id,acquisition_job_id,document_sha256)
      VALUES('${originalDocument}','${stock}','${originalJob}','${'e'.repeat(64)}');`);
    assert.equal(sql(`SELECT count(*) FROM candidate_financial_document_job_links_v9 WHERE job_id='${originalJob}'`), '1',
      'all ingress paths receive an original link before a legacy finalizer can complete');
    sql(`UPDATE candidate_financial_acquisition_jobs_v4 SET status='terminal',terminal_reason='complete',collected_at=clock_timestamp() WHERE job_id='${originalJob}';`);
    assert.equal(sql(`SELECT status FROM candidate_financial_acquisition_jobs_v4 WHERE job_id='${originalJob}'`), 'queued');

    // Reproduce the finalizer's receipt -> job lock order in one session while
    // the replay RPC creates a fresh link in another. Job -> receipt ordering
    // in the replay would deadlock as soon as the holder updates the job.
    const raceJob = job(), raceReceipt = randomUUID();
    sql(`INSERT INTO candidate_financial_document_receipts_v6(receipt_id,stock_id,document_sha256)
      VALUES('${raceReceipt}','${stock}','${'f'.repeat(64)}');`);
    let signalLocked;
    const locked = new Promise((resolve) => { signalLocked = resolve; });
    const asyncSql = (input, onOutput = () => {}) => new Promise((resolve, reject) => {
      const child = spawn(bin('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port), '-U', user, '-d', 'postgres', '-At'],
        { env: { ...process.env, LC_ALL: 'C' }, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', errors = '';
      child.stdout.on('data', (data) => { output += data.toString(); onOutput(output); });
      child.stderr.on('data', (data) => { errors += data.toString(); });
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(errors || `psql:${code}`)));
      child.stdin.end(input);
    });
    const holder = asyncSql(`SET statement_timeout='4s'; BEGIN;
      SELECT receipt_id FROM candidate_financial_document_receipts_v6 WHERE receipt_id='${raceReceipt}' FOR UPDATE;
      SELECT 'receipt-lock-ready'; SELECT pg_sleep(0.4);
      UPDATE candidate_financial_acquisition_jobs_v4 SET updated_at=clock_timestamp() WHERE job_id='${raceJob}'; COMMIT;`,
    (output) => { if (output.includes('receipt-lock-ready')) signalLocked(); });
    await Promise.race([locked, holder]);
    const replay = asyncSql(`SET statement_timeout='4s'; SET ROLE service_role;
      SELECT * FROM reconcile_candidate_financial_document_job_v9('${raceReceipt}','${raceJob}','${principal}');`);
    await Promise.all([holder, replay]);
  } finally {
    if (started) command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
