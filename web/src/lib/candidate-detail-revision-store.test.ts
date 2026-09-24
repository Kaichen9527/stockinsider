import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { appendCandidateDetailRevision } from './candidate-detail-revision-store.ts';

const revision = { id: 'new', stock_id: 'stock', session_date: '2026-09-22', model_version: 'model', revision_hash: 'exact-content' };
type Response = { data: { id: string } | null; error: { code?: string; message: string } | null };
function database(responses: Response[]) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['from', 'select', 'eq', 'order', 'limit', 'insert', 'single', 'maybeSingle']) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      if (method === 'single' || method === 'maybeSingle') {
        assert.ok(responses.length, 'no unexpected reads or writes');
        return Promise.resolve(responses.shift());
      }
      return query;
    };
  }
  return { client: query as unknown as Pick<SupabaseClient, 'from'>, calls };
}
const absent = { data: null, error: null };
test('P1-09: repeated revision reads reuse exact content without another insert', async () => {
  const db = database([{ data: { id: 'new' }, error: null }]);
  assert.deepEqual(await appendCandidateDetailRevision(db.client, revision), { id: 'new', appended: false });
  assert.equal(db.calls.some((call) => call.method === 'insert'), false);
  assert.ok(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'revision_hash' && call.args[1] === 'exact-content'));
});
test('P1-06: new revision appends with predecessor and never updates saved content', async () => {
  const db = database([absent, { data: { id: 'prior' }, error: null }, { data: { id: 'new' }, error: null }]);
  assert.deepEqual(await appendCandidateDetailRevision(db.client, revision), { id: 'new', appended: true });
  assert.deepEqual(db.calls.find((call) => call.method === 'insert')?.args, [{ ...revision, supersedes_revision_id: 'prior' }]);
});
test('P1-09: concurrent identical insert reuses winner only after exact hash lookup', async () => {
  const db = database([absent, absent, { data: null, error: { code: '23505', message: 'duplicate' } }, { data: { id: 'new' }, error: null }]);
  assert.deepEqual(await appendCandidateDetailRevision(db.client, revision), { id: 'new', appended: false });
  assert.equal(db.calls.filter((call) => call.method === 'eq' && call.args[0] === 'revision_hash').length, 2);
});
test('P1-09: an identity collision with different content fails and never overwrites', async () => {
  const db = database([absent, absent, { data: null, error: { code: '23505', message: 'duplicate' } }, absent]);
  await assert.rejects(appendCandidateDetailRevision(db.client, revision), /duplicate/);
});
