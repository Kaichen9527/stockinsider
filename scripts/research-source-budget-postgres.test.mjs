import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const binaries = pgConfig.status === 0 ? pgConfig.stdout.trim() : '';
const available = Boolean(binaries && ['initdb', 'pg_ctl', 'psql']
  .every((name) => fs.existsSync(path.join(binaries, name))));
const digest = 'a'.repeat(64);

test('cross-role budget, revision heads and first-discovery gaps survive real PostgreSQL',
  { skip: !available && 'local PostgreSQL tools unavailable' }, () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stockinsider-source-budget-'));
    const cluster = path.join(temporary, 'cluster'); const port = 54000 + process.pid % 10000;
    const run = (binary, args) => execFileSync(path.join(binaries, binary), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const sql = (query) => run('psql', ['-X','-A','-t','-v','ON_ERROR_STOP=1','-h',temporary,'-p',String(port),'-d','postgres','-c',query]);
    let started = false;
    try {
      run('initdb',['-D',cluster,'-A','trust','--no-instructions']);
      run('pg_ctl',['-D',cluster,'-l',path.join(temporary,'postgres.log'),'-o',`-h '' -k ${temporary} -p ${port}`,'-w','start']); started=true;
      sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
        CREATE SCHEMA extensions;
        CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
        CREATE TABLE public.stocks(id uuid PRIMARY KEY, symbol text, market text);
        CREATE TABLE public.candidate_detail_snapshots(id uuid PRIMARY KEY,stock_id uuid);
        CREATE TABLE public.candidate_dossier_bundles(bundle_id uuid PRIMARY KEY,revision_id uuid,published_revision_id uuid,input_hash text);
        CREATE TABLE public.candidate_daily_stage_snapshots(detail_revision_id uuid);
        CREATE TABLE public.candidate_research_dossiers(id uuid PRIMARY KEY,content jsonb,validation_status text, detail_snapshot_id uuid,narrative_kind text,input_hash text);
        CREATE TABLE public.candidate_dossier_submission_receipts(
          submission_id uuid PRIMARY KEY,revision_id uuid,input_hash text,dossier_id uuid,status text,submission_hash text,bundle_id uuid,rejection_reasons jsonb);
        CREATE FUNCTION public.reject_candidate_dossier_revision_mutation_v4()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable_revision'; END $$;
        CREATE FUNCTION public.record_candidate_dossier_submission_v4(
          uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)
          RETURNS TABLE(submission_id uuid,dossier_id uuid,status text,rejection_reasons jsonb,idempotent_replay boolean)
          LANGUAGE sql AS $$ SELECT NULL::uuid,NULL::uuid,'rejected'::text,'[]'::jsonb,false $$;`);
      for (const name of ['20260907_candidate_dossier_outbox_v5.sql',
        '20260929_candidate_dossier_outbox_v6.sql',
        '20260929_research_agent_state_v1.sql', '20260929_research_deep_jobs_v1.sql']) {
        run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', temporary, '-p', String(port), '-d', 'postgres',
          '-f', path.join(root, 'migrations', name)]);
      }

      sql(`CREATE TABLE source_raw_documents(id uuid PRIMARY KEY,platform text,document_url text,published_at timestamptz,
        collected_at timestamptz,symbols jsonb,metadata jsonb,canonical_content_hash text,content_semantics text);
        CREATE TABLE tw_trading_sessions_v3(session_id text,status text,close_at timestamptz,source_timestamp timestamptz,collected_at timestamptz,recorded_at timestamptz);
        CREATE TABLE official_price_history(stock_id uuid,session_date date,close numeric,volume numeric,source_url text,available_at timestamptz,as_of timestamptz,provenance jsonb);
        INSERT INTO stocks VALUES('11111111-1111-4111-8111-111111111111','2409','TW');`);
      const prior='2026-09-01T00:00:00Z'; const later='2026-10-03T00:00:00Z';
      const add=(id,at,metadata,symbol='2409')=>sql(`INSERT INTO source_raw_documents VALUES(
        '${id}','research_inbox_threads','https://example.com/original#si-revision-${id}','${prior}','${at}',
        '["${symbol}"]','${JSON.stringify({canonical_url:'https://example.com/original',...metadata})}','${digest}','editorial_discussion')`);
      const original='22222222-2222-4222-8222-222222222222'; const revision='33333333-3333-4333-8333-333333333333';
      add(original,prior,{first_observed_at:prior,claim_status:'rumor'});
      add(revision,later,{first_observed_at:prior,revision_observed_at:later,retracted_at:later},'2330');
      const heads=(at)=>JSON.parse(sql(`SELECT * FROM research_source_heads_page_v1('${at}',0,500)`));
      assert.equal(heads('2026-09-02T00:00:00Z').id,original);
      const current=heads('2026-10-04T00:00:00Z'); assert.equal(current.id,revision);
      assert.deepEqual(current.symbols,['2330','2409']);
      assert.equal(Date.parse(current.metadata.first_observed_at),Date.parse(prior));
      assert.equal(JSON.parse(sql(`SELECT * FROM research_evidence_heads_v1(ARRAY['${original}']::uuid[],'2026-09-02T00:00:00Z')`)).superseded,false);
      const changed=JSON.parse(sql(`SELECT * FROM research_evidence_heads_v1(ARRAY['${original}']::uuid[],'2026-10-04T00:00:00Z')`));
      assert.equal(changed.retracted,true); assert.equal(changed.superseded,true);
      const echo='88888888-8888-4888-8888-888888888888';
      add(echo,'2026-10-04T00:00:00Z',{canonical_url:'https://example.com/repost',
        parent_source_url:'https://example.com/original',claim_status:'rumor'});
      assert.equal(heads('2026-10-04T00:00:00Z').id,revision);
      assert.equal(JSON.parse(sql(`SELECT * FROM research_evidence_heads_v1(ARRAY['${echo}']::uuid[],'2026-10-04T00:00:00Z')`)).retracted,true);
      add('44444444-4444-4444-8444-444444444444',later,{insider_evidence:{identity:'person-one'}});
      add('55555555-5555-4555-8555-555555555555',later,{insider_evidence:{identity:'person-two'}});
      assert.equal(sql("SELECT count(*) FROM research_source_heads_page_v1('2026-10-04T00:00:00Z',0,500)"),'3');
      const runId=sql(`INSERT INTO research_priority_runs_v1(as_of,policy_version,input_hash,expected_count,accounted_count,source_attempts,rows,research_queue)
        VALUES(clock_timestamp(),'research-priority-v1','${digest}',1,1,'[]','[{"symbol":"2409","hasDiscoveryEvidence":true,"firstSeenAt":"${prior}"}]','[]') RETURNING run_id`).split('\n')[0];
      assert.equal(sql(`SELECT capture_research_first_discoveries_v1('${runId}')`),'1');
      assert.equal(sql(`SELECT capture_research_first_discoveries_v1('${runId}')`),'0');
      assert.equal(sql("SELECT snapshot->>'priceStatus' FROM research_first_discoveries_v1"),'missing_at_discovery');
      assert.throws(()=>sql("UPDATE research_first_discoveries_v1 SET first_seen_at=clock_timestamp()"),/immutable_revision/u);
      let first;
      for(const [index,role] of ['discovery','counter_review','strategy_research','independent_test'].entries()) {
        const reservation=sql(`SELECT reservation_id FROM reserve_research_model_v1('${role}','mac-controller','task-${index}')`);
        assert.ok(reservation); first ||= reservation;
        assert.equal(sql("SELECT count(*) FROM reserve_research_model_v1('technical','other-worker','must-wait')"),'0');
        assert.throws(()=>sql(`SELECT finish_research_model_v1('${reservation}','other-worker','failed','${digest}')`),/lease_lost/u);
        assert.equal(sql(`SELECT finish_research_model_v1('${reservation}','mac-controller','failed','${digest}')`),'t');
        assert.equal(sql(`SELECT finish_research_model_v1('${reservation}','mac-controller','failed','${digest}')`),'t');
      }
      assert.equal(sql("SELECT count(*) FROM reserve_research_model_v1('discovery','mac-controller','fifth-attempt')"),'0');
      assert.throws(()=>sql(`SELECT finish_research_model_v1('${first}','mac-controller','completed','${digest}')`),/replay_mismatch/u);
      assert.throws(()=>sql("UPDATE research_model_reservations_v1 SET reserved_seconds=0"),/immutable_revision/u);
      assert.equal(sql("SELECT research_model_lease_fits_day_v1('2026-10-04T23:29:00+08:00')"),'t');
      assert.equal(sql("SELECT research_model_lease_fits_day_v1('2026-10-04T23:50:00+08:00')"),'f');
      assert.equal(sql("SELECT research_model_lease_fits_day_v1('2026-10-05T00:00:00+08:00')"),'t');
      assert.equal(sql("SELECT has_table_privilege('service_role','research_model_reservations_v1','INSERT')"),'f');
      assert.equal(sql("SELECT has_table_privilege('service_role','research_model_completions_v1','INSERT')"),'f');

      // A predecessor-applied installation already has immutable technical
      // rows. The additive upgrade must retain their complete payload.
      const detail='66666666-6666-4666-8666-666666666666';
      const dossier='77777777-7777-4777-8777-777777777777';
      sql(`INSERT INTO candidate_detail_snapshots VALUES('${detail}','11111111-1111-4111-8111-111111111111');
        INSERT INTO candidate_research_dossiers(id,content) VALUES('${dossier}','{}');
        INSERT INTO candidate_thesis_qualifications_v1(id,stock_id,detail_revision_id,dossier_id,article_hash,
          evidence_snapshot_hash,review_receipt_hash,status,horizon,payload,qualified_at,next_review_at)
        VALUES('${dossier}','11111111-1111-4111-8111-111111111111','${detail}','${dossier}','${digest}',
          '${digest}','${digest}','needs_evidence','1-3m',
          '{"reviewReceiptHash":"${digest}","articleHash":"${digest}","status":"needs_evidence",
            "materialEventIds":[],"qualifiedAt":"2026-09-01T00:00:00Z","nextReviewAt":"2026-09-02T00:00:00Z"}',
          '2026-09-01T00:00:00Z','2026-09-02T00:00:00Z');
        INSERT INTO candidate_technical_decisions_v1(stock_id,thesis_qualification_id,session_date,
          market_dataset_hash,calendar_hash,feature_version,strategy_version,snapshot,observed_at)
        VALUES('11111111-1111-4111-8111-111111111111','${dossier}','2026-09-01',
          '${digest}','${digest}','fixture-feature','fixture-strategy','{"retained":true}','2026-09-01T00:00:00Z');`);
      const old=sql("SELECT row_to_json(d)::text FROM candidate_technical_decisions_v1 d");
      const upgrade=()=>run('psql',['-X','-v','ON_ERROR_STOP=1','-h',temporary,'-p',String(port),'-d','postgres',
        '-f',path.join(root,'migrations/20261004_research_technical_identity_v2.sql')]);
      upgrade(); upgrade();
      assert.equal(sql("SELECT row_to_json(d)::jsonb - 'decision_input_hash' FROM candidate_technical_decisions_v1 d"),
        sql(`SELECT '${old}'::jsonb`));
      assert.equal(sql("SELECT length(decision_input_hash) FROM candidate_technical_decisions_v1"),'64');
      assert.throws(()=>sql("UPDATE candidate_technical_decisions_v1 SET snapshot='{}'"),/immutable_revision/u);
      sql(`INSERT INTO candidate_technical_decisions_v1(stock_id,thesis_qualification_id,session_date,
        market_dataset_hash,calendar_hash,feature_version,strategy_version,snapshot,observed_at,decision_input_hash)
        VALUES('11111111-1111-4111-8111-111111111111','${dossier}','2026-09-01',
          '${digest}','${digest}','fixture-feature','fixture-strategy','{"sourceRetracted":true}',
          '2026-09-02T00:00:00Z','${'b'.repeat(64)}')`);
      assert.equal(sql("SELECT count(*) FROM candidate_technical_decisions_v1"),'2');
      const policy = JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('name',proname,
        'bodySha256',encode(sha256(convert_to(prosrc,'UTF8')),'hex'),'securityDefiner',prosecdef,
        'volatility',provolatile::text,'argumentCount',pronargs,
        'argumentTypes',oidvectortypes(proargtypes),
        'configuration',(SELECT coalesce(jsonb_agg(regexp_replace(setting,'[[:space:]"]','','g') ORDER BY setting),'[]'::jsonb)
          FROM unnest(proconfig) setting))) FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
        WHERE n.nspname='public' AND proname IN ('research_evidence_heads_v1','fence_candidate_thesis_append_v1',
        'fence_research_strategy_record_v1','fence_research_paper_book_append_v1','reject_candidate_dossier_revision_mutation_v4',
        'research_source_heads_page_v1','reserve_research_model_v1','research_execution_policy_matches_v1')`));
      const matches=()=>sql(`SELECT research_execution_policy_matches_v1('${JSON.stringify(policy)}')`);
      const releaseText=fs.readFileSync(path.join(root,'web/src/lib/research-strategy-release.generated.ts'),'utf8');
      const release=JSON.parse(releaseText.slice(releaseText.indexOf('= ')+2,releaseText.lastIndexOf(' as const;')));
      const verified=release.databasePolicy.filter((expected)=>policy.some((actual)=>actual.name===expected.name)
        && expected.name!=='reject_candidate_dossier_revision_mutation_v4');
      assert.ok(verified.length>=5,'actual installed routines must match the source-generated release profile');
      for(const expected of verified) assert.deepEqual(policy.find((actual)=>actual.name===expected.name),expected);
      assert.equal(matches(),'t');
      sql('ALTER FUNCTION fence_research_paper_book_append_v1() STABLE');
      assert.equal(matches(),'f');
      sql('ALTER FUNCTION fence_research_paper_book_append_v1() VOLATILE');
      assert.equal(matches(),'t');
      sql('ALTER FUNCTION fence_research_paper_book_append_v1() SET search_path=pg_temp,public');
      assert.equal(matches(),'f');
      sql('ALTER FUNCTION fence_research_paper_book_append_v1() SET search_path=public,pg_temp');
      assert.equal(matches(),'t');
      sql('ALTER TABLE research_paper_book_revisions_v1 DISABLE TRIGGER trg_research_paper_book_append_v1');
      assert.equal(matches(),'f');
      sql('ALTER TABLE research_paper_book_revisions_v1 ENABLE TRIGGER trg_research_paper_book_append_v1');
      assert.equal(matches(),'t');

      // Durable proposals and paper books preserve losing/failed records and
      // fence stale appends across process restarts.
      const record=(key,kind,parent,proposalHash=digest)=>sql(`INSERT INTO research_strategy_records_v1
        (record_hash,kind,proposal_hash,parent_hash,payload,input_hash,input_payload)
        VALUES('${key}','${kind}','${proposalHash}',${parent ? "'"+parent+"'" : 'NULL'},'{}','${digest}','{}')`);
      record(digest,'proposal',null);
      assert.throws(()=>record('c'.repeat(64),'proposal',null,'c'.repeat(64)),/weekly_hypothesis_cap/u);
      assert.throws(()=>record('d'.repeat(64),'approval',digest),/parent_binding_invalid/u);
      record('b'.repeat(64),'assessment',digest);
      record('c'.repeat(64),'validation','b'.repeat(64));
      record('d'.repeat(64),'approval','c'.repeat(64));
      assert.throws(()=>sql("DELETE FROM research_strategy_records_v1"),/immutable_revision/u);
      let activationAt=null;
      const append=(key,parent,operation,activation=activationAt)=>sql(`INSERT INTO research_paper_book_revisions_v1
        (revision_hash,book_id,parent_hash,operation_key,input_hash,state,result)
        VALUES('${key}','growth',${parent ? "'"+parent+"'" : 'NULL'},'${operation}','${digest}',
          '${JSON.stringify({bookId:'growth',cash:1000000,inceptionAt:'2026-09-30T00:00:00Z',activationAt:activation})}',
          '{"actualOrders":false}')`);
      append(digest,null,'initialize-v5');
      activationAt=sql(`SELECT available_at FROM research_paper_book_revisions_v1 WHERE revision_hash='${digest}'`);
      assert.throws(()=>append('e'.repeat(64),digest,'session:2026-09-01',null),/activation_invalid/u);
      append('b'.repeat(64),digest,'session:2026-09-01');
      assert.throws(()=>append('c'.repeat(64),digest,'session:2026-09-02'),/head_changed/u);
      append('c'.repeat(64),'b'.repeat(64),'session:2026-09-02');
      assert.throws(()=>append('e'.repeat(64),'c'.repeat(64),'session:2026-09-03','2026-09-30T00:00:00Z'),/activation_changed/u);
      assert.equal(sql("SELECT count(*) FROM research_paper_book_revisions_v1"),'3');
      assert.throws(()=>sql("UPDATE research_paper_book_revisions_v1 SET state='{}'"),/immutable_revision/u);
    } finally {
      if(started) { try { run('pg_ctl',['-D',cluster,'-m','immediate','-w','stop']); } catch { /* Keep the primary failure. */ } }
      fs.rmSync(temporary,{recursive:true,force:true});
    }
  });
