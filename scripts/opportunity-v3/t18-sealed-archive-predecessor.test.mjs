import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import test from 'node:test';
import {applyPublicationTailToEngineeringClient, TAIL_SHARED_LOCK} from './research-publication-tail-atomic-client.mjs';
import {loadPublicationTail} from './research-publication-tail-extraction.mjs';

const tail = loadPublicationTail(resolve(import.meta.dirname, '../..'));
const identity = sql => sql.includes("SYSTEM_USER='peer:si-t18-db'");
const namespace = sql => sql.includes('AS namespace');
const emptyNamespace = {relations: [], routines: [], roles: [], types: []};

function recordingClient(handler) {
  const calls = [];
  return {
    calls,
    async query(sql) {
      calls.push(sql);
      return handler(sql);
    },
    async end() {
      calls.push('END');
    }
  };
}

test('sealed archive and portable valuation options cannot be combined', async () => {
  const client = recordingClient(() => { throw Error('unexpected_query'); });
  await assert.rejects(applyPublicationTailToEngineeringClient(client, tail, {
    contaboHistoricalValuation: true,
    contaboSealedArchive: true
  }), /publication_tail_staging_profiles_conflict/);
  assert.deepEqual(client.calls, ['END']);
});

test('sealed path refuses a connection without the fixed authenticated peer', async () => {
  const client = recordingClient(sql => {
    assert.ok(identity(sql));
    return {rows: [{isolated: false}]};
  });
  await assert.rejects(applyPublicationTailToEngineeringClient(client, tail, {contaboSealedArchive: true}),
    /contabo_valuation_bridge_stage_required/);
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls.at(-1), 'END');
});

test('sealed path rolls back an unrelated namespace before any corrective DDL', async () => {
  const client = recordingClient(sql => {
    if (identity(sql)) return {rows: [{isolated: true}]};
    if (sql === TAIL_SHARED_LOCK) return {rows: [{locked: true}]};
    if (namespace(sql)) return {rows: [{namespace: emptyNamespace}]};
    if (['BEGIN ISOLATION LEVEL READ COMMITTED', "SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s'", 'ROLLBACK'].includes(sql)
      || sql.includes('pg_advisory_unlock')) return {rows: []};
    throw Error('unexpected_query');
  });
  await assert.rejects(applyPublicationTailToEngineeringClient(client, tail, {contaboSealedArchive: true}),
    /t18_archive_namespace_mismatch/);
  assert.equal(client.calls.filter(identity).length, 2);
  assert.equal(client.calls.filter(namespace).length, 1);
  assert.equal(client.calls.at(-3), 'ROLLBACK');
  assert.match(client.calls.at(-2), /pg_advisory_unlock/);
  assert.equal(client.calls.at(-1), 'END');
  assert.equal(client.calls.some(sql => /^\s*(REVOKE|ALTER|CREATE)\b/u.test(sql)), false);
});
