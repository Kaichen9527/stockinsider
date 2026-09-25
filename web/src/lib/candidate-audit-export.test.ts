import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { exportCandidateAudit, projectCandidateAudit, type AuditRow, type CandidateAuditReader } from './candidate-audit-export.ts';

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const now = '2026-09-25T15:00:00Z';
function fixture(n = 1) {
  const run: AuditRow = { id: uuid(1), evaluation_at: '2026-09-25T10:00:00Z', started_at: '2026-09-25T10:00:00Z', finished_at: '2026-09-25T10:20:00Z',
    status: 'success', candidate_count: n, completed_count: n, partial_count: 0, failed_count: 0 };
  const items: AuditRow[] = []; const details: AuditRow[] = []; const instruments: AuditRow[] = [];
  for (let i = 0; i < n; i++) {
    const symbol = String(1000 + i); const stock = uuid(i + 10000); const detail = uuid(i + 20000);
    items.push({ id: uuid(i + 30000), run_id: run.id, stock_id: stock, symbol, status: 'success', finished_at: '2026-09-25T10:19:00Z', detail_revision_id: detail });
    details.push({ id: detail, stock_id: stock, research_run_id: run.id, session_date: '2026-09-24', as_of: '2026-09-25T10:10:00Z', available_at: '2026-09-25T10:11:00Z' });
    instruments.push({ instrument_authority_id: uuid(i + 40000), stock_id: stock, symbol, exchange: 'TWSE', instrument_type: 'common_stock', listing_status: 'active', official_name: '合成測試',
      provider: 'twse', source_timestamp: '2026-09-24T00:00:00Z', recorded_at: '2026-09-24T01:00:00Z', valid_from: '2026-09-24T00:00:00Z', valid_to: null });
  }
  const reader: CandidateAuditReader = { run: async () => structuredClone(run), items: async (_, from, size) => structuredClone(items.slice(from, from + size)),
    details: async (ids, from, size) => structuredClone(details.filter((row) => ids.includes(String(row.id))).slice(from, from + size)),
    instruments: async (ids, _, from, size) => structuredClone(instruments.filter((row) => ids.includes(String(row.stock_id))).slice(from, from + size)) };
  return { run, items, details, instruments, reader };
}
const project = (f: ReturnType<typeof fixture>) => projectCandidateAudit(f.run, f.items, f.details, f.instruments, now);

test('read-only audit binds run, per-stock revision and PIT identity without publication authority', async () => {
  const f = fixture(); const result = await exportCandidateAudit(f.reader, String(f.run.id), now);
  assert.equal(result.candidates.length, 1); assert.equal(result.candidates[0].security_type, 'common_stock');
  assert.deepEqual(result.candidates[0].reason_codes, []); assert.equal(result.complete, false);
  assert.equal(result.terminal_run_accounted_for, true); assert.equal(result.full_app_coverage_verified, false); assert.equal(result.publish_allowed, false);
});
test('pagination and batching retain every item beyond the first page', async () => {
  const f = fixture(501); const result = await exportCandidateAudit(f.reader, null, now);
  assert.equal(result.candidates.length, 501); assert.equal(result.expected_count, 501);
});
test('two reads detect changed per-stock rows even when run summary is unchanged', async () => {
  const f = fixture(); let reads = 0;
  f.reader.items = async () => (++reads === 1 ? structuredClone(f.items) : [{ ...f.items[0], detail_revision_id: uuid(555) }]);
  await assert.rejects(exportCandidateAudit(f.reader, null, now), /changed_during_read/);
});
test('run drift is rejected', async () => {
  const f = fixture(); let reads = 0; f.reader.run = async () => ({ ...f.run, status: ++reads === 1 ? 'success' : 'partial' });
  await assert.rejects(exportCandidateAudit(f.reader, null, now), /changed_during_read/);
});
test('partial and failed research stay visible but not complete', () => {
  const f = fixture(); f.run.status = 'partial'; f.run.completed_count = 0; f.run.partial_count = 1; f.items[0].status = 'partial';
  assert.ok(project(f).candidates[0].reason_codes.includes('terminal_research_not_complete'));
});
test('future, expired and non-common-stock authorities cannot supply verified name or type', () => {
  for (const change of [{ recorded_at: '2026-09-26T00:00:00Z' }, { valid_to: fdate() }, { instrument_type: 'etf' }, { provider: 'other' }]) {
    const f = fixture(); Object.assign(f.instruments[0], change); const result = project(f);
    assert.equal(result.candidates[0].security_type, null); assert.equal(result.candidates[0].name, null);
  }
  function fdate() { return '2026-09-25T10:00:00Z'; }
});
test('conflicting official names are not silently selected', () => {
  const f = fixture(); f.instruments.push({ ...f.instruments[0], instrument_authority_id: uuid(999), official_name: '另一名稱' });
  assert.equal(project(f).candidates[0].name, null);
});
test('missing or wrong-issuer revision is not a current revision', () => {
  const f = fixture(); f.details[0].stock_id = uuid(999); assert.equal(project(f).candidates[0].revision, null);
  f.details = []; assert.ok(project(f).candidates[0].reason_codes.includes('immutable_revision_missing'));
});
test('duplicate identities, missing rows and incorrect counts fail', () => {
  const duplicate = fixture(2); duplicate.items[1].symbol = duplicate.items[0].symbol; assert.throws(() => project(duplicate), /cardinality/);
  const missing = fixture(); missing.items = []; assert.throws(() => project(missing), /cardinality/);
  const counts = fixture(); counts.run.partial_count = 1; assert.throws(() => project(counts), /counts/);
  const status = fixture(); status.items[0].status = 'failed'; assert.throws(() => project(status), /status_counts/);
});
test('invalid run IDs are rejected before database access', async () => {
  const f = fixture(); f.reader.run = async () => { throw new Error('must not read'); };
  await assert.rejects(exportCandidateAudit(f.reader, 'bad', now), /run_id_invalid/);
});
test('missing, running, wrong-run and future runs are rejected', async () => {
  const f = fixture(); f.reader.run = async () => null; await assert.rejects(exportCandidateAudit(f.reader, null, now), /unavailable/);
  f.reader = fixture().reader; await assert.rejects(exportCandidateAudit(f.reader, uuid(88), now), /wrong_run/);
  const running = fixture(); running.run.status = 'running'; assert.throws(() => project(running), /terminal/);
  const future = fixture(); future.run.finished_at = '2027-01-01T00:00:00Z'; assert.throws(() => project(future), /time/);
});
test('oversized pages and repeated page identities are rejected', async () => {
  const f = fixture(251); f.reader.items = async () => f.items; await assert.rejects(exportCandidateAudit(f.reader, null, now), /page_shape/);
  const g = fixture(250); g.reader.items = async () => g.items; await assert.rejects(exportCandidateAudit(g.reader, null, now), /row_bound/);
});
test('raw private fields do not escape projection', () => {
  const f = fixture(); f.items[0].private_token = 'DO_NOT_EXPORT'; f.details[0].summary = 'PRIVATE_BODY';
  const result = JSON.stringify(project(f)); assert.equal(result.includes('DO_NOT_EXPORT'), false); assert.equal(result.includes('PRIVATE_BODY'), false);
});
test('order-independent audit identity and explicit stale label', () => {
  const f = fixture(3); const result = project(f); f.items.reverse(); f.details.reverse(); f.instruments.reverse();
  assert.equal(project(f).revision, result.revision);
  assert.equal(projectCandidateAudit(f.run, f.items, f.details, f.instruments, '2026-09-28T15:00:00Z').freshness, 'older_than_26h_audit_only');
});
test('route is exact-bearer GET only, bounded and performs no mutations', () => {
  const source = readFileSync(new URL('../app/api/internal/candidate-audit-export/route.ts', import.meta.url), 'utf8');
  assert.ok(source.indexOf('if (!requireExactInternalBearer(request))') < source.indexOf('const db = getSupabaseServerClient()'));
  assert.match(source, /private, no-store/); assert.match(source, /AbortController/);
  assert.doesNotMatch(source, /\.(?:insert|upsert|update|delete|rpc)\(/u); assert.doesNotMatch(source, /export async function POST/u);
  assert.doesNotMatch(source, /\.select\(['"]\*/u);
});

test('impossible or timezone-free dates do not acquire cutoff authority', () => {
  for (const value of ['2026-02-30T10:00:00Z', '2026-09-25T10:00:00', '2026-09-25T24:00:00Z']) {
    const f = fixture(); f.run.evaluation_at = value; assert.throws(() => project(f), /time/);
  }
});
