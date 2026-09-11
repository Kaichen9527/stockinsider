import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

// Private local cluster only: no application environment or production URL.
test('Taiwan candidate scope, paging, publication and concurrent fair claims in PostgreSQL', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taiwan-scope-pg-'));
  const data = path.join(root, 'data'), socket = path.join(root, 'socket');
  fs.mkdirSync(socket);
  const user = os.userInfo().username, port = 58000 + process.pid % 1500;
  const bin = (name) => process.env.OPPORTUNITY_V3_POSTGRES_BIN ? path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN, name) : name;
  const exec = (name, args, input) => {
    const result = spawnSync(bin(name), args, { input, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
    assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout.trim();
  };
  const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port), '-U', user, '-d', 'postgres', '-At'];
  const sql = (input) => exec('psql', args, input);
  const json = (input) => JSON.parse(sql(input));
  const parallelSql = (input) => new Promise((resolve, reject) => {
    const child = spawn(bin('psql'), args, { env: { ...process.env, LC_ALL: 'C' } });
    let output = '', error = '';
    child.stdout.on('data', (part) => { output += part; }); child.stderr.on('data', (part) => { error += part; });
    child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
    child.stdin.end(input);
  });
  const invalid = (input, pattern) => {
    const result = spawnSync(bin('psql'), args, { input, encoding: 'utf8' });
    assert.notEqual(result.status, 0); assert.match(result.stderr, pattern);
  };
  const cutoff = new Date().toISOString();
  const at = `'${cutoff}'::timestamptz`;
  const session = sqlDate => `'${sqlDate}'::date`;
  const day = cutoff.slice(0, 10);
  let started = false;
  try {
    exec('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', user]);
    exec('pg_ctl', ['-D', data, '-l', path.join(root, 'pg.log'), '-o', `-F -k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA extensions;
      CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
      CREATE TABLE stocks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),symbol text,market text);
      CREATE TABLE stock_instruments_v3(instrument_authority_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),stock_id uuid,
        symbol text,exchange text,instrument_type text,listing_status text,recorded_at timestamptz,source_timestamp timestamptz,
        valid_from timestamptz,valid_to timestamptz);
      CREATE TABLE candidate_source_mentions(stock_id uuid,platform text,content_semantics text,provenance jsonb,
        available_at timestamptz,created_at timestamptz);
      CREATE TABLE candidate_daily_stage_snapshots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),stock_id uuid,
        lifecycle_stage text,session_date date,available_at timestamptz,created_at timestamptz);`);
    const baseline = fs.readFileSync(new URL('../migrations/20260906_taiwan_data_provider_v5.sql', import.meta.url), 'utf8');
    sql(baseline.slice(baseline.indexOf('CREATE TABLE IF NOT EXISTS public.taiwan_data_refresh_queue_v5'), baseline.indexOf('CREATE INDEX IF NOT EXISTS taiwan_data_refresh_queue_v5_claim_idx')));
    sql(baseline.slice(baseline.indexOf('CREATE OR REPLACE FUNCTION public.enqueue_taiwan_data_refresh_v5'), baseline.indexOf('END $enqueue$;') + 'END $enqueue$;'.length));
    const migration = fs.readFileSync(new URL('../migrations/20260911_04_taiwan_candidate_refresh_queue.sql', import.meta.url), 'utf8');
    sql(migration); sql(migration);
    sql(`INSERT INTO stocks(symbol,market) SELECT n::text,'TW' FROM generate_series(1000,1699) n;
      INSERT INTO stocks(symbol,market) SELECT n::text,'TW' FROM generate_series(9000,9019) n;
      INSERT INTO stock_instruments_v3(stock_id,symbol,exchange,instrument_type,listing_status,recorded_at,source_timestamp,valid_from)
        SELECT id,symbol,'TWSE','common_stock','active',${at}-interval '2 days',${at}-interval '2 days',${at}-interval '2 days' FROM stocks;
      INSERT INTO candidate_source_mentions SELECT id,'ptt','editorial_discussion','{}',${at}-interval '1 hour',${at}-interval '1 hour'
        FROM stocks WHERE symbol BETWEEN '1000' AND '1699';
      INSERT INTO candidate_daily_stage_snapshots(stock_id,lifecycle_stage,session_date,available_at,created_at)
        SELECT id,'found',(${at} AT TIME ZONE 'Asia/Taipei')::date-20,${at}-interval '20 days',${at}-interval '20 days'
        FROM stocks WHERE symbol='9000';
      INSERT INTO candidate_daily_stage_snapshots(stock_id,lifecycle_stage,session_date,available_at,created_at)
        SELECT id,'waiting',(${at} AT TIME ZONE 'Asia/Taipei')::date-2,${at}-interval '2 days',${at}-interval '2 days'
        FROM stocks WHERE symbol IN ('9001','9010','9013');
      INSERT INTO candidate_daily_stage_snapshots(stock_id,lifecycle_stage,session_date,available_at,created_at)
        SELECT id,'found',(${at} AT TIME ZONE 'Asia/Taipei')::date-1,${at}-interval '1 day',${at}-interval '1 day'
        FROM stocks WHERE symbol='9001';
      INSERT INTO candidate_daily_stage_snapshots(stock_id,lifecycle_stage,session_date,available_at,created_at)
        SELECT id,'actionable',(${at} AT TIME ZONE 'Asia/Taipei')::date-1,${at}-interval '1 day',${at}-interval '1 day'
        FROM stocks WHERE symbol='9011';
      INSERT INTO candidate_daily_stage_snapshots(stock_id,lifecycle_stage,session_date,available_at,created_at)
        SELECT id,'found',(${at} AT TIME ZONE 'Asia/Taipei')::date+1,${at}+interval '1 day',${at}+interval '1 day'
        FROM stocks WHERE symbol='9013';
      INSERT INTO candidate_source_mentions SELECT id,'ptt','editorial_discussion',
        CASE symbol WHEN '9002' THEN '{"discovery_eligible":false}'::jsonb WHEN '9003' THEN '{"invalidated":true}'::jsonb ELSE '{}'::jsonb END,
        ${at}-interval '1 hour',${at}-interval '1 hour' FROM stocks WHERE symbol IN ('9002','9003','9006','9007','9008','9009','9014','9015','9016','9017','9018','9019');
      INSERT INTO candidate_source_mentions SELECT id,'gdelt','editorial_discussion',
        CASE symbol WHEN '9004' THEN '{"discovery_eligible":true,"matcher_version":"old"}'::jsonb
          WHEN '9005' THEN '{"matcher_version":"gdelt-tw-context-v2"}'::jsonb
          ELSE '{"discovery_eligible":true,"matcher_version":"gdelt-tw-context-v2"}'::jsonb END,
        ${at}-interval '1 hour',${at}-interval '1 hour' FROM stocks WHERE symbol IN ('9004','9005','9012');
      UPDATE candidate_source_mentions SET content_semantics='bulk_institutional_ranking' WHERE stock_id=(SELECT id FROM stocks WHERE symbol='9006');
      UPDATE candidate_source_mentions SET available_at=${at}-interval '8 days' WHERE stock_id=(SELECT id FROM stocks WHERE symbol='9014');
      UPDATE candidate_source_mentions SET created_at=${at}+interval '1 day' WHERE stock_id=(SELECT id FROM stocks WHERE symbol='9015');
      UPDATE stocks SET market='US' WHERE symbol='9016';
      INSERT INTO stock_instruments_v3(stock_id,symbol,exchange,instrument_type,listing_status,recorded_at,source_timestamp,valid_from,valid_to)
        SELECT id,symbol,'TWSE',CASE WHEN symbol='9008' THEN 'etf' ELSE 'common_stock' END,
          CASE WHEN symbol='9007' THEN 'delisted' ELSE 'active' END,
          ${at}-interval '1 day',${at}-interval '1 day',${at}-interval '1 day',
          CASE WHEN symbol='9009' THEN ${at}-interval '1 hour' END FROM stocks WHERE symbol IN ('9007','9008','9009');
      UPDATE stock_instruments_v3 SET recorded_at=${at}+interval '1 day' WHERE symbol='9017';
      UPDATE stock_instruments_v3 SET source_timestamp=${at}+interval '1 day' WHERE symbol='9018';
      UPDATE stock_instruments_v3 SET valid_from=${at}+interval '1 day' WHERE symbol='9019';`);
    const universe = [], pageLengths = [];
    let after = '';
    for (;;) {
      const page = json(`SET ROLE service_role; SELECT COALESCE(jsonb_agg(page),'[]') FROM read_taiwan_data_candidate_universe_v6(${at},'${after}',200) page;`);
      pageLengths.push(page.length); universe.push(...page);
      if (page.length < 200) break;
      after = page.at(-1).symbol;
    }
    assert.deepEqual(pageLengths, [200, 200, 200, 104]);
    assert.equal(new Set(universe.map(row => row.symbol)).size, 704);
    assert.deepEqual(universe.filter(row => row.symbol >= '9000').map(row => row.symbol), ['9010', '9011', '9012', '9013']);
    assert.equal(sql('SET ROLE service_role; SELECT count(*) FROM read_taiwan_data_candidate_universe_v5(5000)'), '704');
    invalid(`SELECT * FROM read_taiwan_data_candidate_universe_v6(${at},'',501)`, /invalid_taiwan_candidate_page/);

    const keys = Array.from({ length: 700 }, (_, index) => (index + 1).toString(16).padStart(64, '0'));
    const quote = value => `'${value.replaceAll("'", "''")}'`;
    const keyArray = items => `ARRAY[${items.map(quote).join(',')}]::text[]`;
    const register = items => `SELECT register_taiwan_data_refresh_scope_v6(${session(day)},'final',${keyArray(items)},${at});`;
    await Promise.all([parallelSql(register(keys.slice(0, 400))), parallelSql(register(keys.slice(300)))]);
    const progress = () => json(`SET ROLE service_role; SELECT read_taiwan_data_refresh_progress_v6(${session(day)},'final');`);
    assert.equal(progress().expected, 700); assert.equal(progress().missing, 700); assert.equal(progress().ready, false);
    assert.equal(progress().settled, false); assert.equal(progress().researchReady, false);
    const entries = keys.map((queueKey, index) => ({ queueKey, dataset: 'daily_price', symbol: String(1000 + index), exchange: 'TWSE' }));
    const enqueue = items => `SELECT enqueue_taiwan_data_refresh_batch_v6(${quote(JSON.stringify(items))}::jsonb,'final',${session(day)},${at});`;
    assert.equal(json(`SET ROLE service_role; ${enqueue(entries.slice(0, 100))}`).queued, 100);
    assert.equal(progress().queued, 100); assert.equal(progress().missing, 600);
    const unregistered = { ...entries[100], queueKey: 'f'.repeat(64) };
    invalid(enqueue([entries[100], unregistered]), /taiwan_refresh_batch_scope_mismatch/);
    assert.equal(progress().missing, 600, 'invalid batch rolls back the preceding enqueue');
    const markComplete = where => sql(`INSERT INTO taiwan_data_canonical_results_v5(job_id,dataset,symbol,exchange,requested_session_date,
        provider,authority_tier,canonical_schema,record_count,records,records_sha256)
      SELECT job_id,dataset,symbol,exchange,requested_session_date,'twse','official_primary','taiwan-data-canonical-v1',1,'[{}]',repeat('a',64)
      FROM taiwan_data_refresh_queue_v5 WHERE ${where} ON CONFLICT(job_id) DO NOTHING;
      UPDATE taiwan_data_refresh_queue_v5 SET status='terminal',terminal_status='complete',terminal_result='{}',
        completed_at=clock_timestamp(),lease_owner=NULL,lease_expires_at=NULL WHERE ${where};`);
    markComplete("refresh_phase='final'");
    const publication = () => json(`SET ROLE service_role; SELECT record_taiwan_data_publication_metadata_v5(${session(day)},'final',${at},
      '{"daily_price:1000":{"terminal":"complete","persistence":"persisted"}}');`);
    assert.equal(progress().completed, 100); assert.equal(publication().datasetCompletenessPct, 14.29);
    assert.equal(publication().shadowEligible, false);
    for (let offset = 100; offset < 700; offset += 100) json(enqueue(entries.slice(offset, offset + 100)));
    sql(`UPDATE taiwan_data_refresh_queue_v5 SET next_attempt_at=clock_timestamp()+interval '1 hour' WHERE symbol='1100';
      UPDATE taiwan_data_refresh_queue_v5 SET status='running',lease_owner='test-owner-123456',lease_expires_at=clock_timestamp()+interval '1 hour' WHERE symbol='1101';
      UPDATE taiwan_data_refresh_queue_v5 SET status='terminal',terminal_status='schema_invalid',terminal_result='{}',completed_at=clock_timestamp() WHERE symbol='1102';
      UPDATE taiwan_data_refresh_queue_v5 SET status='terminal',terminal_status='complete',terminal_result='{}',completed_at=clock_timestamp() WHERE symbol='1103';`);
    assert.equal(progress().retrying, 1); assert.equal(progress().running, 1); assert.equal(progress().failed, 2);
    assert.equal(progress().ready, false); assert.equal(publication().datasetCompletenessPct, 14.29);
    assert.equal(progress().settled, false); assert.equal(progress().researchReady, false);
    markComplete("refresh_phase='final' AND symbol<>'1699'");
    sql(`UPDATE taiwan_data_refresh_queue_v5 SET status='terminal',terminal_status='empty',terminal_result='{}',
      completed_at=clock_timestamp() WHERE symbol='1699';`);
    assert.equal(progress().completed, 699); assert.equal(progress().failedCandidate, 1); assert.equal(progress().failedCritical, 0);
    assert.equal(progress().settled, true); assert.equal(progress().researchReady, true); assert.equal(progress().ready, false);
    assert.equal(publication().datasetCompletenessPct, 99.86, 'isolated price failure allows research but never claims all data complete');
    sql(`UPDATE taiwan_data_refresh_queue_v5 SET dataset='market_index',symbol=NULL WHERE queue_key='${keys[699]}';`);
    assert.equal(progress().failedCandidate, 0); assert.equal(progress().failedCritical, 1);
    assert.equal(progress().settled, true); assert.equal(progress().researchReady, false); assert.equal(progress().ready, false);
    sql(`UPDATE taiwan_data_refresh_queue_v5 SET dataset='daily_price',symbol='1699' WHERE queue_key='${keys[699]}';`);
    markComplete("refresh_phase='final'");
    assert.equal(progress().ready, true); assert.equal(progress().completed, 700); assert.equal(publication().datasetCompletenessPct, 100);
    assert.equal(progress().settled, true); assert.equal(progress().researchReady, true);
    assert.equal(sql(`SELECT dataset_completeness->'_refresh_scope_v6'->>'scopeSource' FROM taiwan_data_publication_metadata_v5 WHERE session_date=${session(day)} AND publication_phase='final'`), 'registered_scope');
    json(register(['a'.repeat(64)]));
    assert.equal(progress().expected, 701); assert.equal(progress().missing, 1); assert.equal(progress().ready, false);
    assert.equal(progress().settled, false); assert.equal(progress().researchReady, false);
    assert.equal(Number(sql(`SELECT dataset_completeness_pct FROM taiwan_data_publication_metadata_v5 WHERE session_date=${session(day)} AND publication_phase='final'`)), 99.86,
      'scope growth invalidates stored complete metadata before any new enqueue');

    // A legacy writer without a registered scope still counts its whole phase.
    sql(`INSERT INTO taiwan_data_refresh_queue_v5(queue_key,dataset,symbol,exchange,refresh_phase,requested_session_date)
      VALUES(repeat('b',64),'daily_price','9990','TWSE','preliminary',${session(day)}),
        (repeat('c',64),'daily_price','9991','TWSE','preliminary',${session(day)});`);
    markComplete("symbol='9990'");
    const legacy = json(`SELECT record_taiwan_data_publication_metadata_v5(${session(day)},'preliminary',${at},'{"daily_price:9990":{"terminal":"complete","persistence":"persisted"}}')`);
    assert.equal(legacy.datasetCompletenessPct, 50); assert.equal(legacy.refreshProgress.expected, 2);

    // New sessions precede backlog; all never-attempted jobs precede due retries.
    sql(`INSERT INTO taiwan_data_refresh_queue_v5(queue_key,dataset,symbol,exchange,refresh_phase,requested_session_date,attempts,queued_at)
      SELECT lpad(to_hex(10000+n),64,'0'),'daily_price',(2000+n)::text,'TWSE','final',${session(day)}+1,
        CASE WHEN n<=100 THEN 1 ELSE 0 END,${at}-interval '3 days' FROM generate_series(1,300) n;
      INSERT INTO taiwan_data_refresh_queue_v5(queue_key,dataset,symbol,exchange,refresh_phase,requested_session_date,attempts,queued_at)
        VALUES(repeat('d',64),'daily_price','8888','TWSE','final',${session(day)}-1,0,${at}-interval '30 days'),
          (repeat('e',64),'daily_price','8889','TWSE','final',${session(day)}+2,20,${at}-interval '30 days');`);
    const claim = (owner, scoped = true, limit = 100) => `SELECT job_id||'|'||symbol||'|'||attempts FROM claim_taiwan_data_refresh_jobs_v6(${limit},'${owner}',clock_timestamp(),clock_timestamp()+interval '5 minutes',${scoped ? `${session(day)}+1,'final'` : 'NULL,NULL'});`;
    const first = sql(claim('first-owner-123456', false)).split('\n');
    assert.equal(first.length, 100); assert.ok(first.every(row => Number(row.split('|')[1]) > 2100));
    assert.ok(first.every(row => row.endsWith('|1')));
    const parallel = (await Promise.all(['second-owner-12345', 'third-owner-123456', 'fourth-owner-12345'].map(owner => parallelSql(claim(owner)))))
      .flatMap(output => output.split('\n').filter(Boolean));
    assert.equal(parallel.length, 200);
    assert.equal(new Set([...first, ...parallel].map(row => row.split('|')[0])).size, 300);
    assert.equal(sql("SELECT attempts FROM taiwan_data_refresh_queue_v5 WHERE symbol='8889'"), '20');
    assert.equal(sql(`SELECT count(*) FROM claim_taiwan_data_refresh_jobs_v6(100,'empty-owner-123456',clock_timestamp(),clock_timestamp()+interval '5 minutes',${session(day)}+1,'final')`), '0');
    assert.equal(sql(`SELECT count(*) FROM claim_taiwan_data_refresh_jobs_v5(100,'legacy-owner-12345',clock_timestamp(),clock_timestamp()+interval '5 minutes')`), '2');
    invalid(claim('short'), /invalid_taiwan_data_claim/);

    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(sql(`SELECT has_table_privilege('${role}','taiwan_data_refresh_scopes_v6','SELECT')`), 'f');
      assert.equal(sql(`SELECT has_table_privilege('${role}','taiwan_data_refresh_scopes_v6','INSERT,UPDATE,DELETE')`), 'f');
    }
    const signatures = [
      'read_taiwan_data_candidate_universe_v6(timestamptz,text,integer)', 'read_taiwan_data_candidate_universe_v5(integer)',
      'register_taiwan_data_refresh_scope_v6(date,text,text[],timestamptz)', 'enqueue_taiwan_data_refresh_batch_v6(jsonb,text,date,timestamptz)',
      'read_taiwan_data_refresh_progress_v6(date,text)', 'record_taiwan_data_publication_metadata_v5(date,text,timestamptz,jsonb)',
      'claim_taiwan_data_refresh_jobs_v6(integer,text,timestamptz,timestamptz,date,text)', 'claim_taiwan_data_refresh_jobs_v5(integer,text,timestamptz,timestamptz)',
    ];
    for (const signature of signatures) {
      assert.equal(sql(`SELECT has_function_privilege('anon','${signature}','EXECUTE')`), 'f');
      assert.equal(sql(`SELECT has_function_privilege('authenticated','${signature}','EXECUTE')`), 'f');
      assert.equal(sql(`SELECT has_function_privilege('service_role','${signature}','EXECUTE')`), 't');
    }
    assert.equal(sql("SELECT relrowsecurity FROM pg_class WHERE oid='taiwan_data_refresh_scopes_v6'::regclass"), 't');
  } finally {
    if (started) exec('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
