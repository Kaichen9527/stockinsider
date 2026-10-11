import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
const root = fileURLToPath(new URL('..', import.meta.url));
const { Client } = createRequire(import.meta.url)('pg');
const configured = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const bin = configured.status === 0 ? configured.stdout.trim() : '';
const available = bin && ['initdb', 'pg_ctl', 'psql'].every(name => fs.existsSync(path.join(bin, name)));

test('successor installs exact RC admission guards; real PG connections conserve global and weekly quotas',
  { skip: !available && 'PostgreSQL unavailable; actual admission isolation unverified', timeout: 45000 }, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-admission-'));
    const cluster = path.join(dir, 'pg'); const port = 55000 + process.pid % 1000;
    const run = (name, args) => execFileSync(path.join(bin, name), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const sql = text => run('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', String(port), '-d', 'postgres', '-c', text]);
    let started = false; const clients = [];
    try {
      run('initdb', ['-D', cluster, '-A', 'trust', '--no-instructions']);
      run('pg_ctl', ['-D', cluster, '-l', path.join(dir, 'postgres.log'), '-o', `-h '' -k ${dir} -p ${port}`, '-w', 'start']); started = true;
      // Reuse only the existing partial prerequisite fixture. All four migration
      // files are applied whole; this does not claim production bootstrap coverage.
      const fixture = fs.readFileSync(path.join(root, 'scripts/research-source-budget-postgres.test.mjs'), 'utf8')
        .match(/sql\(`(CREATE ROLE anon NOLOGIN;[\s\S]*?)`\);/u)?.[1];
      assert.ok(fixture, 'existing partial prerequisite fixture must remain explicit'); sql(fixture);
      for (const migration of ['20260907_candidate_dossier_outbox_v5.sql', '20260929_candidate_dossier_outbox_v6.sql',
        '20260929_research_agent_state_v1.sql', '20260929_research_deep_jobs_v1.sql'])
        run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', String(port), '-d', 'postgres', '-f', path.join(root, 'migrations', migration)]);
      const successor = '20261011_research_admission_isolation_v1.sql';
      const install = name => run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', String(port), '-d', 'postgres', '-f', path.join(root, 'migrations', name)]);
      await t.test('missing predecessor rejects atomically instead of manufacturing functions', () => {
        const before = sql("SELECT pg_get_functiondef('public.reserve_research_model_v1(text,text,text)'::regprocedure)");
        assert.throws(() => install(successor), /research_admission_predecessor_missing/);
        assert.equal(sql("SELECT pg_get_functiondef('public.reserve_research_model_v1(text,text,text)'::regprocedure)"), before);
      });
      for (const migration of ['20261008_research_observed_roster_v1.sql', '20261008_research_observed_priority_v1.sql', '20261008_research_observed_claim_v2.sql']) install(migration);
      const names = ['reserve_research_model_v1', 'validate_research_deep_scope_v1', 'charge_research_deep_admission_v1',
        'reconcile_research_deep_admissions_v1', 'enqueue_research_deep_jobs_v1', 'store_observed_research_priority_v1',
        'reap_expired_research_deep_jobs_v2', 'claim_research_deep_job_v1', 'claim_research_observed_job_v2'];
      const definitions = () => JSON.parse(sql(`SELECT json_agg(x ORDER BY name) FROM (SELECT p.proname AS name,
        pg_get_functiondef(p.oid) AS definition,p.prosrc AS body,pg_get_userbyid(p.proowner) AS owner,
        p.proacl::text AS acl,p.prosecdef,p.proconfig,p.provolatile,p.proleakproof,p.proparallel,
        p.prorettype::text,p.proargtypes::text,p.prolang::text,p.procost,p.prorows
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND
        p.proname IN (${names.map(name => "'" + name + "'").join(',')})) x`));
      const guard = "\n  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'\n    THEN RAISE EXCEPTION 'research_admission_read_committed_required'; END IF;";
      await t.test('nine installed bodies change only by first-statement guard; owner ACL and attributes survive retry', () => {
        const before = definitions(); assert.equal(before.length, 9); install(successor);
        const after = definitions(); assert.equal(after.length, 9);
        for (let i=0;i<after.length;i++) {
          assert.match(after[i].body, /BEGIN\n  IF current_setting/);
          assert.deepEqual({ ...after[i], body: after[i].body.replace(guard,''), definition: after[i].definition.replace(guard,'') }, before[i]);
        }
        install(successor); assert.deepEqual(definitions(), after);
      });
      const connect = async () => { const client = new Client({ host: dir, port, database: 'postgres' }); clients.push(client); await client.connect(); return client; };
      const a = await connect(); const b = await connect();
      const reserve = (client, role, owner, key) => client.query('SELECT reservation_id FROM reserve_research_model_v1($1,$2,$3)', [role, owner, key]);
      await t.test('actual stale RR snapshot cannot add a second lease; RC replay, exclusion and release remain', async () => {
        await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        assert.equal((await b.query('SELECT count(*)::int AS n FROM research_model_reservations_v1')).rows[0].n, 0);
        const first = await reserve(a, 'discovery', 'isolation-a', 'isolation-a'); assert.equal(first.rows.length, 1);
        await assert.rejects(reserve(b, 'technical', 'isolation-b', 'isolation-b'), { message: 'research_admission_read_committed_required' });
        await b.query('ROLLBACK');
        assert.equal((await a.query('SELECT count(*)::int AS n FROM research_model_reservations_v1')).rows[0].n, 1);
        assert.equal((await reserve(a, 'technical', 'isolation-c', 'isolation-c')).rows.length, 0);
        assert.deepEqual((await reserve(a, 'discovery', 'isolation-a', 'isolation-a')).rows, first.rows);
        await a.query('SELECT finish_research_model_v1($1,$2,$3,$4)', [first.rows[0].reservation_id, 'isolation-a', 'failed', 'a'.repeat(64)]);
        const second = await reserve(a, 'technical', 'isolation-c', 'isolation-c'); assert.equal(second.rows.length, 1);
        await a.query('SELECT finish_research_model_v1($1,$2,$3,$4)', [second.rows[0].reservation_id, 'isolation-c', 'failed', 'a'.repeat(64)]);
      });
      await t.test('concurrent RC callers serialize before counting and retain 1800/7200 shared budget', async () => {
        await a.query('BEGIN');
        const third=await reserve(a,'company_research','concurrent-a','concurrent-a');assert.equal(third.rows.length,1);
        await b.query('BEGIN');let resolved=false;
        const blocked=reserve(b,'independent_test','concurrent-b','concurrent-b').then(value=>{resolved=true;return value;});
        for(let i=0;i<100;i++) {
          if((await a.query('SELECT cardinality(pg_blocking_pids($1)) AS n',[b.processID])).rows[0].n>0) break;
          await new Promise(resolve=>setTimeout(resolve,5));
        }
        assert.equal(resolved,false);assert.ok((await a.query('SELECT cardinality(pg_blocking_pids($1)) AS n',[b.processID])).rows[0].n>0);
        await a.query('COMMIT');assert.equal((await blocked).rows.length,0);await b.query('COMMIT');
        assert.equal(sql('SELECT count(*) FROM research_model_reservations_v1 r WHERE NOT EXISTS(SELECT 1 FROM research_model_completions_v1 c WHERE c.reservation_id=r.reservation_id)'),'1');
        await a.query('SELECT finish_research_model_v1($1,$2,$3,$4)',[third.rows[0].reservation_id,'concurrent-a','failed','a'.repeat(64)]);
        const fourth=await reserve(a,'independent_test','concurrent-b','concurrent-b');assert.equal(fourth.rows.length,1);
        await a.query('SELECT finish_research_model_v1($1,$2,$3,$4)',[fourth.rows[0].reservation_id,'concurrent-b','failed','a'.repeat(64)]);
        assert.equal((await reserve(b,'strategy_research','fifth-owner','fifth-task')).rows.length,0);
        assert.equal(sql('SELECT sum(reserved_seconds) FROM research_model_reservations_v1'),'7200');
        assert.equal(sql('SELECT min(reserved_seconds) FROM research_model_reservations_v1'),'1800');
      });
      const calls = [
        "SELECT * FROM reserve_research_model_v1('discovery','isolation-a','isolation-a')",
        'SELECT reconcile_research_deep_admissions_v1()',
        'SELECT enqueue_research_deep_jobs_v1(NULL)',
        'SELECT store_observed_research_priority_v1(NULL,NULL,NULL,NULL,NULL,NULL,NULL)',
        'SELECT reap_expired_research_deep_jobs_v2()',
        "SELECT * FROM claim_research_deep_job_v1('isolation-owner')",
        `SELECT claim_research_observed_job_v2('isolation-owner','${'a'.repeat(64)}')`,
      ];
      for (const isolation of ['REPEATABLE READ', 'SERIALIZABLE']) await t.test(`${isolation} rejects every admission RPC including replay and empty queues without writes`, async () => {
        const before = sql('SELECT row_to_json(x) FROM (SELECT (SELECT count(*) FROM research_model_reservations_v1) leases,(SELECT count(*) FROM research_model_completions_v1) completions,(SELECT count(*) FROM research_deep_jobs_v1) jobs,(SELECT count(*) FROM research_deep_admission_charges_v1) charges) x');
        for (const [i,query] of calls.entries()) {
          await b.query(`BEGIN ISOLATION LEVEL ${isolation}`);
          // Reconciliation is owner-only, not a newly granted service endpoint.
          if (i!==1) await b.query('SET LOCAL ROLE service_role');
          await assert.rejects(b.query(query), { message: 'research_admission_read_committed_required' });
          await b.query('ROLLBACK');
        }
        assert.equal(sql('SELECT row_to_json(x) FROM (SELECT (SELECT count(*) FROM research_model_reservations_v1) leases,(SELECT count(*) FROM research_model_completions_v1) completions,(SELECT count(*) FROM research_deep_jobs_v1) jobs,(SELECT count(*) FROM research_deep_admission_charges_v1) charges) x'), before);
      });
      const items=[];
      for(let i=0;i<7;i++) {
        const stock=randomUUID(), runId=randomUUID(), symbol=String(3100+i);
        await a.query('INSERT INTO stocks VALUES($1,$2,$3)',[stock,symbol,'TW']);
        await a.query(`INSERT INTO research_priority_runs_v1(run_id,as_of,policy_version,input_hash,expected_count,accounted_count,source_attempts,rows,research_queue)
          VALUES($1,clock_timestamp(),'research-priority-v1',$2,1,1,'[]','[]','[]')`,[runId,createHash('sha256').update(runId).digest('hex')]);
        items.push([runId,stock,symbol]);
      }
      const insert = (client,item) => client.query(`INSERT INTO research_deep_jobs_v1(priority_run_id,stock_id,symbol,week_start,queue_rank)
        VALUES($1,$2,$3,CURRENT_DATE,1) RETURNING job_id`,item);
      for(const isolation of ['REPEATABLE READ','SERIALIZABLE']) await t.test(`${isolation} actual job INSERT rejects in both independent triggers`,async()=>{
        for(const disableBefore of [false,true]) {
          await b.query(`BEGIN ISOLATION LEVEL ${isolation}`);
          // Disposable DB only: isolate the AFTER trigger so the BEFORE guard
          // cannot mask a missing charge guard. ROLLBACK restores trigger state.
          if(disableBefore) await b.query('ALTER TABLE research_deep_jobs_v1 DISABLE TRIGGER research_deep_scope_binding_v1');
          await assert.rejects(insert(b,items[6]),{message:'research_admission_read_committed_required'});
          await b.query('ROLLBACK');
          assert.equal(sql("SELECT tgenabled FROM pg_trigger WHERE tgname='research_deep_scope_binding_v1'"),'O');
          assert.equal(sql('SELECT count(*) FROM research_deep_jobs_v1'),'0');
          assert.equal(sql('SELECT count(*) FROM research_deep_admission_charges_v1'),'0');
        }
      });
      await t.test('two RC connections competing for fifth weekly slot cannot charge a sixth issuer',async()=>{
        for(const item of items.slice(0,4)) await insert(a,item);
        assert.equal(sql('SELECT count(*) FROM research_deep_admission_charges_v1'),'4');
        await a.query('BEGIN'); await insert(a,items[4]);
        await b.query('BEGIN');
        let resolved=false;
        const blocked=insert(b,items[5]).then(value=>{resolved=true;return{value};},error=>{resolved=true;return{error};});
        for(let i=0;i<100;i++) {
          if((await a.query('SELECT cardinality(pg_blocking_pids($1)) AS n',[b.processID])).rows[0].n>0) break;
          await new Promise(resolve=>setTimeout(resolve,5));
        }
        assert.equal(resolved,false);assert.ok((await a.query('SELECT cardinality(pg_blocking_pids($1)) AS n',[b.processID])).rows[0].n>0);
        await a.query('COMMIT');
        const outcome=await blocked; assert.equal(outcome.error?.message,'deep_admission_week_capacity');
        await b.query('ROLLBACK');
        assert.equal(sql('SELECT count(*) FROM research_deep_admission_charges_v1'),'5');
        assert.equal(sql('SELECT count(*) FROM research_deep_jobs_v1'),'5');
      });
      await t.test('changed predecessor rejects before replacing any of the other eight routines',()=>{
        const before=definitions(); const last=before.find(r=>r.name==='claim_research_observed_job_v2');
        sql(last.definition.replace(last.body,()=>last.body+'\n-- simulated independently modified implementation\n'));
        const changed=definitions();
        assert.throws(()=>install(successor),/research_admission_predecessor_changed/);
        assert.deepEqual(definitions(),changed);
        sql(last.definition);install(successor);assert.deepEqual(definitions(),before);
      });
    } finally {
      await Promise.allSettled(clients.map(async client => { await client.query('ROLLBACK').catch(()=>{}); await client.end(); }));
      if (started) run('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
