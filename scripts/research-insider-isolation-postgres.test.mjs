import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const { Client } = createRequire(import.meta.url)('pg');
const predecessor = fs.readFileSync('migrations/20261008_insider_snapshots_v1.sql', 'utf8');
const successor = fs.readFileSync('migrations/20261011_research_insider_isolation_v1.sql', 'utf8');
const names = ['insider_snapshot_run_v1','admit_insider_snapshot_v1','commit_insider_snapshot_page_v1'];
const guard = "\n IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'\n  THEN RAISE EXCEPTION 'insider_write_read_committed_required'; END IF;";

test('insider successor preserves semantics and rejects stale snapshots before capacity and CAS writes', { timeout: 45000 }, async t => {
  const bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-insider-isolation-'));
  const data = path.join(dir, 'pg'); const port = 55500 + process.pid % 1000;
  const run = (name,args) => execFileSync(path.join(bin,name),args,{stdio:'pipe'});
  let running = false; const clients = [];
  try {
    run('initdb',['-D',data,'-U','postgres','-A','trust','--no-instructions']);
    run('pg_ctl',['-D',data,'-l',path.join(dir,'pg.log'),'-o',`-h '' -k ${dir} -p ${port}`,'-w','start']); running = true;
    for (let i=0;i<2;i++) { const c = new Client({host:dir,port,user:'postgres',database:'postgres',statement_timeout:5000}); await c.connect(); clients.push(c); }
    const [a,b] = clients;
    await a.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role NOLOGIN;
      CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE TABLE source_raw_documents(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,platform text,document_url text,
        title text,summary text,content_text text,symbols jsonb,published_at timestamptz,collected_at timestamptz DEFAULT clock_timestamp(),
        metadata jsonb,sentiment_label text,content_semantics text,stance_semantics text,canonical_content_hash text,UNIQUE(platform,document_url));`);
    await a.query(predecessor);
    const definitions = async () => (await a.query(`SELECT proname,prosrc,pg_get_userbyid(proowner) AS owner,proacl::text,prosecdef,proconfig,
      provolatile,proisstrict,proleakproof,proparallel,prorettype::text,proargtypes::text,prolang::text,procost,prorows
      FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY($1) ORDER BY proname`,[names])).rows;
    await t.test('missing predecessor fails without manufacturing a routine', async () => {
      await a.query('BEGIN'); await a.query('DROP FUNCTION insider_snapshot_run_v1(uuid)');
      await assert.rejects(a.query(successor),/insider_write_predecessor_missing/); await a.query('ROLLBACK');
    });
    const before = await definitions();
    await a.query(successor);
    const after = await definitions();
    await t.test('only first-statement isolation guards change; owner ACLs and all attributes survive retry', async () => {
      assert.equal(after.length,3);
      for(let i=0;i<3;i++){assert.equal(after[i].prosrc.replace(guard,''),before[i].prosrc);
        const {prosrc:oldBody,...oldAttrs}=before[i];const {prosrc:newBody,...newAttrs}=after[i];assert.deepEqual(newAttrs,oldAttrs);assert.ok(oldBody&&newBody);}
      await a.query(successor);assert.deepEqual(await definitions(),after);
    });
    await t.test('independently changed body or execution semantics reject atomically', async () => {
      for(const change of [`DO $change$ BEGIN EXECUTE replace(pg_get_functiondef('insider_snapshot_run_v1(uuid)'::regprocedure),'insider_run_required','changed_run_required'); END $change$;`,
        "ALTER FUNCTION insider_snapshot_run_v1(uuid) IMMUTABLE", "ALTER FUNCTION insider_snapshot_run_v1(uuid) SECURITY INVOKER",
        "ALTER FUNCTION insider_snapshot_run_v1(uuid) STRICT", "ALTER FUNCTION insider_snapshot_run_v1(uuid) PARALLEL SAFE",
        "ALTER FUNCTION insider_snapshot_run_v1(uuid) COST 200", "ALTER FUNCTION insider_snapshot_run_v1(uuid) SET search_path TO public"]) {
        await a.query('BEGIN');await a.query(change);await assert.rejects(a.query(successor),/insider_write_predecessor_changed/);await a.query('ROLLBACK');assert.deepEqual(await definitions(),after);
      }
    });
    const counts = async () => (await a.query(`SELECT (SELECT count(*) FROM insider_acquisition_runs_v1) AS runs,
      (SELECT count(*) FROM insider_run_members_v1) AS members,(SELECT count(*) FROM insider_acquisitions_v1) AS tokens`)).rows[0];
    await t.test('RR and serializable reject all three write RPCs before argument checks or writes', async () => {
      for(const isolation of ['REPEATABLE READ','SERIALIZABLE']) for(const query of [
        'SELECT insider_snapshot_run_v1(NULL)',
        'SELECT admit_insider_snapshot_v1(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)',
        'SELECT commit_insider_snapshot_page_v1(NULL,NULL,NULL,NULL,NULL,NULL)']) {
        const original = await counts();await b.query(`BEGIN ISOLATION LEVEL ${isolation}`);await b.query('SELECT count(*) FROM pg_class');await b.query('SET LOCAL ROLE service_role');
        await assert.rejects(b.query(query),/insider_write_read_committed_required/);await b.query('ROLLBACK');assert.deepEqual(await counts(),original);
      }
    });
    await t.test('real two-connection stale127 snapshot cannot admit129 after competing128; RC replay remains available', async () => {
      await a.query(`SET ROLE service_role; DO $fixture$ BEGIN FOR i IN 1..127 LOOP PERFORM insider_snapshot_run_v1(gen_random_uuid()); END LOOP; END $fixture$; RESET ROLE;`);
      assert.deepEqual(await counts(),{runs:'127',members:'635',tokens:'5'});
      await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await b.query('SELECT count(*) FROM pg_class');
      const runId=randomUUID();await a.query('SET ROLE service_role');await a.query('SELECT insider_snapshot_run_v1($1)',[runId]);
      await b.query('SET LOCAL ROLE service_role');await assert.rejects(b.query('SELECT insider_snapshot_run_v1($1)',[randomUUID()]),/insider_write_read_committed_required/);await b.query('ROLLBACK');
      await assert.rejects(a.query('SELECT insider_snapshot_run_v1($1)',[randomUUID()]),/insider_run_capacity/);
      const replay=await a.query('SELECT insider_snapshot_run_v1($1) AS run',[runId]);assert.equal(replay.rows[0].run.members.length,5);await a.query('RESET ROLE');
      assert.deepEqual(await counts(),{runs:'128',members:'640',tokens:'5'});
    });
  } finally {
    for(const c of clients){try{await c.query('ROLLBACK');}catch{}try{await c.end();}catch{}}
    if(running)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);fs.rmSync(dir,{recursive:true,force:true});
  }
});
