import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { workerFixture } from './vnext-worker-fixture.mjs';

const releaseId = 'a'.repeat(40);
const rightA = 'fixture-owner-a';
const rightB = 'fixture-owner-b';
const publishedAt = '2026-11-17T03:00:00Z';
const published = (source, statement) => ({ source, statement, publishedAt });

async function readAs(fixture, role, rightsSubject) {
  assert.ok(['service_role', 'anon', 'authenticated'].includes(role));
  const client = await fixture.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL ROLE ' + role);
    const { rows: [{ notes }] } = await client.query(
      'SELECT public.vnext_owner_research_notes_v1($1) AS notes', [rightsSubject],
    );
    return notes;
  } finally {
    await client.query('ROLLBACK');
    await fixture.close(client);
  }
}

async function writeFixture(writer, callback) {
  const lease = randomUUID();
  await writer.query('BEGIN');
  try {
    await writer.query("SELECT set_config('request.headers',$1,true)", [JSON.stringify({ 'x-stockinsider-writer-release': releaseId })]);
    const acquired = await writer.query("SELECT public.acquire_production_write_lease('production-data-plane',$1,300) AS acquired", [lease]);
    assert.equal(acquired.rows[0].acquired, true);
    await callback(writer);
    await writer.query("SELECT public.release_production_write_lease('production-data-plane',$1)", [lease]);
    await writer.query('COMMIT');
  } catch (error) {
    await writer.query('ROLLBACK');
    throw error;
  }
}

test('owner view projects only the mapped, active, nonwithdrawn operator notes', async t => {
  const fixture = await workerFixture();
  try {
    await fixture.install();
    for (const file of [
      '20261022_vnext_analysis_sources_v1.sql', '20261022_vnext_source_withdrawals_v1.sql',
      '20261117_43_vnext_owner_research_notes_v1.sql',
    ]) {
      await fixture.writer.query(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
    }
    await fixture.writer.query("INSERT INTO public.production_writer_releases(release_id,writer_kind,active,activated_at) VALUES($1,'vps',true,clock_timestamp())", [releaseId]);
    await writeFixture(fixture.writer, async writer => {
      await writer.query(`INSERT INTO public.vnext_source_policies_v1
        VALUES('investanchors','operator_claim','fixture-policy',$1,clock_timestamp() + interval '1 hour',true),
          ('telegram','operator_claim','fixture-policy',$2,clock_timestamp() + interval '1 hour',true)`, [rightA, rightB]);
      const valid = { statement: 'Synthetic owner A note', publishedAt, rightsAttested: true, operatorAuthored: true };
      for (const row of [
        ['1', 'investanchors', rightA, valid, 'completed'],
        ['2', 'telegram', rightB, { ...valid, statement: 'Synthetic owner B note' }, 'completed'],
        ['3', 'investanchors', rightA, { ...valid, body: 'SYNTHETIC_RAW_SENTINEL' }, 'completed'],
        ['4', 'investanchors', rightA, { ...valid, rightsAttested: false }, 'completed'],
        ['5', 'investanchors', rightB, valid, 'completed'],
        ['6', 'investanchors', rightA, valid, 'reserved'],
      ]) {
        const [tag, source, subject, original, state] = row;
        await writer.query(`INSERT INTO public.vnext_extractions_v1
          (content_hash,source,scope,original,state,principal,rights_subject,license_basis,completed_at)
          VALUES($1,$2,'operator_claim',$3::jsonb,$4,'fixture-operator',$5,'fixture-policy',clock_timestamp())`,
        [tag.repeat(64), source, JSON.stringify(original), state, subject]);
      }
    });

    await t.test('browser roles cannot execute the projection and each trusted read is subject bound', async () => {
      for (const role of ['anon', 'authenticated']) await assert.rejects(readAs(fixture, role, rightA), { code: '42501' });
      assert.deepEqual(await readAs(fixture, 'service_role', rightA), [published('investanchors', 'Synthetic owner A note')]);
      assert.deepEqual(await readAs(fixture, 'service_role', rightB), [published('telegram', 'Synthetic owner B note')]);
      assert.deepEqual(await readAs(fixture, 'service_role', 'unmapped-fixture'), []);
    });

    await t.test('withdrawal and policy expiry suppress reads while retaining the historical originals', async () => {
      await writeFixture(fixture.writer, async writer => {
        await writer.query("INSERT INTO public.vnext_source_withdrawals_v1 VALUES($1,'{}',$2,2)", ['1'.repeat(64), 'f'.repeat(64)]);
        await writer.query("UPDATE public.vnext_source_policies_v1 SET valid_until=clock_timestamp() WHERE source='telegram'");
      });
      assert.deepEqual(await readAs(fixture, 'service_role', rightA), []);
      assert.deepEqual(await readAs(fixture, 'service_role', rightB), []);
      assert.equal((await fixture.snapshot()).vnext_extractions_v1.count, 6);
    });
  } finally {
    await fixture.finish();
  }
});
