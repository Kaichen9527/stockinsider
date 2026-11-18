import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { workerFixture } from './vnext-worker-fixture.mjs';
import { installRoutineSourcePrefix } from './vnext-routine-source-prefix-fixture.mjs';
import { rosterHeadFixtureSql } from './vnext-launch-roster-head-fixture.mjs';
import { extractContentBatch } from '../web/src/lib/vnext/permitted-content.ts';

const principal = 'synthetic-candidate-source-operator';
const rights = 'synthetic-creator-authority';
const license = 'synthetic-existing-analysis-scope';
const release = 'c'.repeat(40);
const lease = '00000000-0000-4000-8000-000000000291';

async function withWriter(fixture, action) {
  const client = await fixture.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE service_role');
    await client.query(
      "SELECT set_config('request.headers',$1,true), set_config('request.jwt.claims',$2,true)",
      [JSON.stringify({'x-stockinsider-writer-release': release}), JSON.stringify({ role: 'service_role' })],
    );
    const { rows: [taken] } = await client.query(
      "SELECT public.acquire_production_write_lease('production-data-plane',$1::uuid,300) AS acquired", [lease]);
    assert.equal(taken.acquired, true);
    const result = await action(client);
    const { rows: [released] } = await client.query(
      "SELECT public.release_production_write_lease('production-data-plane',$1::uuid) AS released", [lease]);
    assert.equal(released.released, true);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await fixture.close(client);
  }
}

async function verifySavedClueProjection(fixture) {
  const ranking = readFileSync(new URL('../migrations/20261115_vnext_launch_ranking_v1.sql', import.meta.url), 'utf8');
  const modeTable = ranking.indexOf('CREATE TABLE public.vnext_launch_ranking_mode_v1(');
  const snapshotTable = ranking.indexOf('CREATE TABLE public.vnext_launch_ranking_snapshots_v1(');
  for (const from of [modeTable, snapshotTable]) {
    assert.ok(from >= 0);
    await fixture.writer.query(ranking.slice(from, ranking.indexOf('\n);', from) + 3));
  }
  await fixture.writer.query(`
    ALTER TABLE public.vnext_launch_ranking_snapshots_v1 OWNER TO stockinsider_vnext_owner;
    ALTER TABLE public.vnext_launch_ranking_mode_v1 OWNER TO stockinsider_vnext_owner;
    INSERT INTO public.vnext_launch_ranking_mode_v1(enabled,required_writer_release) VALUES(true,'${release}');
    CREATE FUNCTION public.vnext_launch_candidate_industry_resolved_v1(text,timestamptz) RETURNS jsonb
    LANGUAGE sql STABLE AS $$ SELECT CASE WHEN $1='2330' THEN jsonb_build_object(
      'revisionId','00000000-0000-4000-8000-000000000290','code','24','knownAt',$2 - interval '1 minute') END $$;
  `);
  await fixture.writer.query(readFileSync(new URL('../migrations/20261117_38_vnext_launch_candidate_pool_history_v1.sql', import.meta.url), 'utf8'));
  for (const path of ['20261117_39_vnext_launch_candidate_industry_v1.sql', '20261118_57_vnext_launch_candidate_pool_day_v1.sql']) {
    await fixture.writer.query(readFileSync(new URL('../migrations/'+path, import.meta.url), 'utf8'));
  }
  const cutoffDate = '2026-11-15';
  const oldId = '00000000-0000-4000-8000-000000000281';
  const currentId = '00000000-0000-4000-8000-000000000282';
  const nextId = '00000000-0000-4000-8000-000000000283';
  async function snapshot(id, previous, date, candidates) {
    // Actual predecessor table and read contract, with controlled historical
    // rows. This fixture exercises the new insert hook, never a ranked run.
    await withWriter(fixture, async client => {
      await client.query('RESET ROLE');
      const cutoff = date + 'T21:30:00+08:00';
      await client.query(`
        INSERT INTO public.vnext_launch_ranking_snapshots_v1
        (ranking_run_id,previous_ranking_run_id,request_hash,input_hash,input_cutoff,session_date,published_at,snapshot)
        VALUES($1,$2,repeat('1',64),repeat('2',64),$3::timestamptz,$4::date,$3::timestamptz,$5::jsonb)`,
        [id,previous,cutoff,date,JSON.stringify({policyVersion:'stockinsider-launch-radar-v1',candidates})]);
      await client.query('SET LOCAL ROLE service_role');
    });
  }
  const get = async (id, after = null, filter = {}) => {
    const reader = await fixture.connect();
    try {
      await reader.query('SET ROLE service_role');
      const { rows: [{ result }] } = await reader.query(
        'SELECT public.vnext_launch_candidate_clue_history_v1($1,$2,$3,$4,$5,$6,$7) AS result',
        [id,after,filter.limit ?? 1,filter.date ?? null,filter.source ?? null,filter.industry ?? null,filter.status ?? null]);
      return result;
    } finally { await fixture.close(reader); }
  };

  await snapshot(oldId,null,cutoffDate,[{symbol:'2330',state:'waiting'}]);
  await fixture.writer.query(readFileSync(new URL('../migrations/20261117_50_vnext_launch_candidate_clue_history_v1.sql', import.meta.url), 'utf8'));
  assert.equal(await get(oldId), null, 'pre-activation snapshot has no fabricated source catalog');
  const { rows: [{ clearance_id: clearance }] } = await fixture.writer.query(`
    INSERT INTO public.vnext_candidate_clue_clearance_v1
      (source,scope,rights_subject,license_basis,authorization_sha256,recorded_at,valid_until)
    VALUES ('official','official_original',$1,$2,repeat('b',64),'2026-11-01T00:00:00Z',clock_timestamp()+interval '1 hour')
    RETURNING clearance_id`, [rights,license]);
  const { rows: completed } = await fixture.writer.query(
    "SELECT content_hash FROM public.vnext_extractions_v1 WHERE source='official' AND state='completed' ORDER BY completed_at");
  assert.ok(completed.length>=3);
  const evidenceAt='2026-11-16T01:00:00Z';
  const recordedAt='2026-11-16T02:00:00Z';
  const insert = (hash, symbol) => withWriter(fixture, async client => {
    await client.query('RESET ROLE');
    await client.query(`
      INSERT INTO public.vnext_candidate_public_clues_v1(content_hash,clearance_id,symbol,source,event_at,recorded_at)
      VALUES($1,$2,$3,'official',$4,$5)`, [hash,clearance,symbol,evidenceAt,recordedAt]);
    await client.query('SET LOCAL ROLE service_role');
  });
  await insert(completed[0].content_hash,'2330');
  await insert(completed[1].content_hash,'2308');
  await snapshot(currentId,oldId,'2026-11-16',[{symbol:'2454',state:'eligible'}]);
  const first = await get(currentId);
  assert.deepEqual(first.rows.map(r=>[r.symbol,r.state]), [['2308','not_in_saved_pool']]);
  assert.deepEqual(Object.keys(first.rows[0]).sort(), ['clueId','eventAt','industrySnapshot','source','state','symbol']);
  assert.equal(first.nextAfter,first.rows[0].clueId);

  await insert(completed[2].content_hash,'2454'); // Inserted later with an older synthetic record clock.
  await snapshot(nextId,currentId,'2026-11-17',[{symbol:'2454',state:'eligible'}]);
  const datedReader = await fixture.connect();
  try {
    await datedReader.query('SET ROLE service_role');
    const byDay = async day => (await datedReader.query(
      'SELECT public.vnext_launch_candidate_pool_day_v1($1::date) AS result', [day])).rows[0].result;
    assert.equal((await byDay('2026-11-15')).current.id, oldId);
    assert.equal((await byDay('2026-11-17')).current.id, nextId);
    assert.equal(await byDay('2026-11-14'), null);
    const selected = await byDay('2026-11-16');
    const pinned = (await datedReader.query(
      'SELECT public.vnext_launch_candidate_pool_history_v2($1::uuid) AS result', [currentId])).rows[0].result;
    assert.deepEqual(selected, pinned);
    assert.equal(selected.previous.id, oldId);
    assert.equal(selected.next.id, nextId);
  } finally { await fixture.close(datedReader); }
  const second = await get(currentId,first.nextAfter);
  assert.deepEqual(second.rows.map(r=>[r.symbol,r.state]), [['2330','absent_from_successor']]);
  assert.equal(second.nextAfter,null);
  assert.deepEqual(second.nextSnapshot.id,nextId);
  assert.deepEqual((await get(nextId)).rows.map(r=>[r.symbol,r.state]), [['2454','snapshot_eligible']]);
  assert.equal((await get(currentId,null,{date:'2026-11-15'})).rows.length,0);
  assert.equal((await get(currentId,null,{source:'ptt'})).rows.length,0);
  assert.equal((await get(currentId,null,{status:'snapshot_eligible'})).rows.length,0);
  assert.deepEqual((await get(currentId,null,{date:'2026-11-16',source:'official',industry:'24',status:'absent_from_successor'})).rows.map(r=>r.symbol),['2330']);

  await fixture.writer.query('UPDATE public.vnext_candidate_clue_clearance_v1 SET withdrawn_at=clock_timestamp() WHERE clearance_id=$1', [clearance]);
  assert.deepEqual((await get(currentId,first.nextAfter)).rows,[]);
  await assert.rejects(fixture.writer.query(
    'UPDATE public.vnext_candidate_clue_clearance_v1 SET withdrawn_at=NULL WHERE clearance_id=$1',[clearance]),
    { message:'candidate_clue_clearance_revocation_only' });
  for(const role of ['anon','authenticated']) {
    const reader = await fixture.connect();
    try {
      await reader.query('SET ROLE '+role);
      await assert.rejects(reader.query(
        'SELECT public.vnext_launch_candidate_clue_history_v1(NULL,NULL,10,NULL,NULL,NULL,NULL)'), {code:'42501'});
      await assert.rejects(reader.query(
        "SELECT public.vnext_launch_candidate_pool_day_v1('2026-11-16')"), {code:'42501'});
    } finally { await fixture.close(reader); }
  }
  fixture.save('saved-candidate-clue-history-safe', {
    exactPoolReaderUsed:true, controlledRankingRows:true, controlledIndustryFixture:true,
    excludedLateInsertFromOldCatalog:true, olderCatalogUnavailable:true,
    pinnedWithdrawalAndFourFiltersVerified:true, savedDaySelectsExistingVersion:true, directBrowserRpcDenials:4,
    noSourceOrEntryAuthority:true, realRankingVerified:false,
  });
}

test('the owned extraction writer derives a private, immutable catalog clue only under explicit disclosure clearance', async t => {
  const fixture = await workerFixture();
  try {
    await fixture.install();
    await installRoutineSourcePrefix(fixture);
    const roster = rosterHeadFixtureSql();
    await fixture.writer.query(roster.predecessor);
    await fixture.writer.query(roster.migration);
    await fixture.writer.query(readFileSync(new URL('../migrations/20261117_49_vnext_launch_candidate_clue_journal_v1.sql', import.meta.url), 'utf8'));
    await fixture.writer.query("INSERT INTO public.vnext_principals_v1(principal,role,enabled) VALUES($1,'operator',true)", [principal]);
    await fixture.writer.query(
      "INSERT INTO public.vnext_source_policies_v1(source,scope,license_basis,rights_subject,valid_until,enabled) VALUES('official','official_original',$1,$2,clock_timestamp()+interval '1 hour',true),('ptt','metadata',$1,$2,clock_timestamp()+interval '1 hour',true)",
      [license, rights],
    );
    for (const [symbol, instrument] of [['2330','common_stock'], ['9998','etf']]) {
      const { rows: [stock] } = await fixture.writer.query(
        "INSERT INTO public.stocks(symbol,name,market) VALUES($1,$1,'TW') RETURNING id", [symbol]);
      await fixture.writer.query(`
        INSERT INTO public.stock_instruments_v3(stock_id,symbol,exchange,instrument_type,listing_status,
          official_legal_name,provider,source_timestamp,valid_from,recorded_at,roster_version)
        VALUES($1,$2,'TWSE',$3,'active','Synthetic verified instrument','twse',
          clock_timestamp()-interval '3 hours',clock_timestamp()-interval '3 hours',
          clock_timestamp()-interval '2 hours','tw-instrument-roster-v3.0')`, [stock.id,symbol,instrument]);
    }

    await fixture.writer.query(
      "INSERT INTO public.production_writer_releases(release_id,writer_kind,active,activated_at) VALUES($1,'vps',true,clock_timestamp())", [release]);

    const eventAt = new Date(Date.now() - 3600_000).toISOString();
    const syntheticBody = 'Synthetic private original which the candidate clue must never carry.';
    const make = token => {
      const url = 'https://www.twse.com.tw/synthetic-clue-test-' + token;
      return { id: 'synthetic-clue-test-' + token, source: 'official', scope: 'official_original', url,
        eventAt, publishedAt: eventAt, availableAt: eventAt, eventBasis: 'original_event',
        symbols: ['2330','9998','9999'], authorRoot: 'official-fixture', originalRoot: url, body: syntheticBody };
    };
    const deliver = item => withWriter(fixture, client => extractContentBatch([item], new Date().toISOString(), async (command, body) => {
      const { rows: [{ result }] } = await client.query(
        'SELECT public.vnext_analysis_command_v1($1,$2,$3::jsonb) AS result', [principal,command,JSON.stringify(body)]);
      return result;
    }));
    const rows = async () => (await fixture.observer.query(
      'SELECT to_jsonb(p) AS row FROM public.vnext_candidate_public_clues_v1 p ORDER BY recorded_at,clue_id')).rows.map(row => row.row);

    await t.test('analysis clearance alone admits no catalog metadata', async () => {
      assert.equal((await deliver(make('analysis-scope'))).selected, 1);
      assert.deepEqual(await rows(), []);
    });
    await fixture.writer.query(`
      INSERT INTO public.vnext_candidate_clue_clearance_v1(source,scope,rights_subject,license_basis,valid_until,authorization_sha256)
      VALUES ('official','official_original','different-entity',$1,clock_timestamp()+interval '1 hour',repeat('1',64))`, [license]);
    await t.test('a clearance bound to another rights subject cannot authorize the clue', async () => {
      assert.equal((await deliver(make('foreign-clearance'))).selected, 1);
      assert.deepEqual(await rows(), []);
    });
    await fixture.writer.query(`
      INSERT INTO public.vnext_candidate_clue_clearance_v1(source,scope,rights_subject,license_basis,valid_until,authorization_sha256)
      VALUES ('official','official_original',$1,$2,clock_timestamp()+interval '1 hour',repeat('2',64))`, [rights,license]);

    await t.test('the normal reserve and complete calls store only the original known common share', async () => {
      const item = make('authorized-clearance');
      const done = await deliver(item);
      assert.equal(done.selected, 1);
      const [clue, ...others] = await rows();
      assert.deepEqual(others, []);
      assert.equal(clue.symbol, '2330');
      assert.equal(clue.source, 'official');
      assert.equal(new Date(clue.event_at).toISOString(), eventAt);
      assert.ok(!JSON.stringify(clue).includes(syntheticBody));
      assert.deepEqual(Object.keys(clue).sort(),
        ['clearance_id','clue_id','content_hash','event_at','recorded_at','source','symbol']);
      assert.equal((await deliver(item)).replayed, 1);
      assert.equal((await deliver(make('analysis-scope'))).replayed, 1);
      assert.deepEqual(await rows(), [clue]);
    });
    await t.test('an unresolved PTT repost does not derive an original event after disclosure clearance', async () => {
      await fixture.writer.query(`
        INSERT INTO public.vnext_candidate_clue_clearance_v1(source,scope,rights_subject,license_basis,valid_until,authorization_sha256)
        VALUES('ptt','metadata',$1,$2,clock_timestamp()+interval '1 hour',repeat('3',64))`, [rights,license]);
      const before = await rows();
      const post = { id: 'synthetic-ptt-repost', source: 'ptt', scope: 'metadata',
        url: 'https://www.ptt.cc/bbs/Stock/M.synthetic.html', title: 'Synthetic old post reference',
        eventAt, publishedAt: eventAt, availableAt: eventAt, eventBasis: 'source_publication',
        symbols: ['2330'], originalRoot: '', authorRoot: '' };
      const result = await deliver(post);
      assert.equal(result.selected, 1);
      assert.equal(result.results[0].clues, 0);
      assert.deepEqual(await rows(), before);
    });
    await t.test('withdrawal blocks future emissions and browser roles cannot read or write the tables', async () => {
      await fixture.writer.query('UPDATE public.vnext_candidate_clue_clearance_v1 SET withdrawn_at=clock_timestamp() WHERE rights_subject=$1', [rights]);
      assert.equal((await deliver(make('after-withdrawal'))).selected, 1);
      assert.equal((await rows()).length, 1);
      for (const role of ['anon','authenticated','service_role']) {
        const client = await fixture.connect();
        try {
          await client.query('SET ROLE ' + role);
          await assert.rejects(client.query('SELECT * FROM public.vnext_candidate_public_clues_v1'), { code: '42501' });
          await assert.rejects(client.query('UPDATE public.vnext_candidate_clue_clearance_v1 SET withdrawn_at=NULL'), { code: '42501' });
        } finally {
          await fixture.close(client);
        }
      }
      await assert.rejects(fixture.writer.query('DELETE FROM public.vnext_candidate_public_clues_v1'),
        { message: 'vnext_source_withdrawal_append_only' });
    });
    await t.test('saved clue history pins the cutoff and rechecks current clearances', () => verifySavedClueProjection(fixture));
    fixture.save('candidate-clue-journal-safe', {
      mainEntry: 'vnext_analysis_command_v1 source-reserve and source-complete',
      exactRightsBindingRequired: true, rosterUnresolvedAndEtfExcluded: true, unresolvedPttOriginalExcluded: true,
      replayAndWithdrawalBound: true, directRoleDenials: 6, historicClueKeptPrivately: true,
      exposesRawContentsOrPrivateIdentifiers: false,
      publicCatalogConnected: false, realSourceProcessed: false,
    });
  } finally {
    await fixture.finish();
  }
});
