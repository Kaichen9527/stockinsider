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
