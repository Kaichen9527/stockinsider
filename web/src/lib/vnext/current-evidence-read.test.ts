/** Synthetic cache transports only; no acquisition/PG/publication authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readCurrentFinancialCache, currentEvidenceRead } from './current-evidence-read.ts';
import { inputHash } from './policy.ts';
import type { TwEntryHistoricalAuthorityResult } from '../tw-entry-plan-authority.ts';
type Row = Record<string, unknown>;
const at = '2026-10-23T06:00:00.000000Z', id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fact(n = 1, value = 3.2, recordedAt = '2026-10-22T01:00:00.000001Z'): Row {
  return { stock_id: id(99), fact_id: id(n), fact_key: 'quarterly_diluted_eps', period_start: '2026-07-01', period_end: '2026-09-30', duration_kind: 'quarter',
    value, unit: 'TWD_per_share', estimate_kind: 'reported', estimate_horizon: 'reported_period', source_ref: `twse-openapi:${n}`, provider: 'twse', authority_tier: 'official_primary',
    source_timestamp: '2026-10-21T01:00:00Z', collected_at: '2026-10-21T02:00:00Z', recorded_at: recordedAt, validation_recorded_at: at,
    filing_restatement_id: `restatement-${n}`, validation_status: 'validated', schema_valid: true, unit_valid: true, point_in_time_valid: true, consistency_valid: true };
}
function cache(rows: Row[], options: { error?: boolean; sourceError?: boolean } = {}) {
  const calls: Row[] = [];
  const client = {
    rpc(name: string, args: Row) { calls.push({ rpc: name, args }); return { limit: async (limit: number) => { calls.push({ limit }); return { data: rows, error: options.error ? { message: 'sensitive internal context' } : null }; } }; },
    from(table: string) {
      calls.push({ table }); let selected: unknown[] = [];
      const data = () => table === 'candidate_financial_fact_provenance_v4' ? rows.filter(r => selected.includes(r.fact_id)).map(r => ({ provenance_id: id(50), fact_id: r.fact_id, acquisition_job_id: r.fact_id,
        source_url: 'https://www.twse.com.tw/openapi/financial', source_sha256: 'b'.repeat(64), locator: { source_ref: r.source_ref, period_end: r.period_end, fact_key: r.fact_key }, extracted_at: at, recorded_at: at }))
        : table === 'candidate_financial_acquisition_jobs_v4' ? rows.filter(r => selected.includes(r.fact_id)).map(r => ({ job_id: r.fact_id, stock_id: r.stock_id, period_end: r.period_end, status: 'terminal', terminal_reason: 'complete', response_sha256: 'b'.repeat(64), source_url: 'https://www.twse.com.tw/openapi/financial', collected_at: at, created_at: at, updated_at: at })) : [];
      const chain = { select() { return chain; }, in(_key: string, values: unknown[]) { selected = values; return chain; }, lte() { return chain; }, order() { return chain; }, async limit() { return { data: data(), error: options.sourceError ? { message: 'source failure' } : null }; } };
      return chain;
    },
  } as unknown as Parameters<typeof readCurrentFinancialCache>[0];
  return { client, calls };
}
function history(): TwEntryHistoricalAuthorityResult {
  const sessions = Array.from({ length: 240 }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10));
  return { notEntryAuthority: true, nextSessionAuthority: false, completedSessions: sessions, bars: sessions.map((session, i) => ({ session, open: 90, high: 110, low: 80, close: 100, rawClose: 100, volume: 1000, observationId: id(i + 100), availableAt: at, sourceRef: 'b'.repeat(64), sourceTimestamp: at, recordedAt: at, sourceUrl: 'https://www.twse.com.tw/' })),
    priceBasis: { kind: 'adjusted_to_signal_session', anchorSession: sessions.at(-1)!, adjustmentVersion: 'tw-corporate-action-v3.1', adjustmentEvidenceHash: 'a'.repeat(64), status: 'verified' },
    sourceDatasetRevision: `tw-entry-authority-v0.1:historical:${'c'.repeat(64)}`, availableAt: at, missingData: [] };
}
test('actual as-of RPC plus existing source receipt joins retain original fact and source revisions at one exact cutoff', async () => {
  const row = fact(), f = cache([row]); const result = await readCurrentFinancialCache(f.client, [id(99)], at);
  assert.deepEqual(f.calls.slice(0, 2), [{ rpc: 'read_financial_facts_for_stocks_as_of', args: { p_cutoff: at, p_stock_ids: [id(99)] } }, { limit: 2001 }]);
  assert.equal(result.evidence[0].value, 3.2); assert.equal(result.evidence[0].contentHash, inputHash(row));
  assert.deepEqual(result.revisions[0], { stockId: id(99), factId: id(1), recordedAt: row.recorded_at, validationRecordedAt: at, restatementId: 'restatement-1', contentHash: inputHash(row) });
  assert.equal(result.receipts[0].sourceSha256, 'b'.repeat(64)); assert.equal(result.receipts[0].factRecordedAt, row.recorded_at);
  assert.equal(f.calls.some(c => 'table' in c && /queue|outbox|invocations/u.test(String(c.table))), false);
});
test('newest microsecond correction replaces older value before validation; invalid newest never falls back', async () => {
  for (const rows of [[fact(1), fact(2, 2.1, '2026-10-22T01:00:00.000002Z')], [fact(2, 2.1, '2026-10-22T01:00:00.000002Z'), fact(1)]]) {
    const f = cache(rows), result = await readCurrentFinancialCache(f.client, [id(99)], at);
    assert.deepEqual(result.evidence.map(e => [e.id, e.value]), [[id(2), 2.1]]);
  }
  const f = cache([fact(1), { ...fact(2, 2.1, '2026-10-22T01:00:00.000002Z'), validation_status: 'failed' }]);
  const rejected = await readCurrentFinancialCache(f.client, [id(99)], at); assert.deepEqual(rejected.evidence, []); assert.ok(rejected.gaps.some(g => g.includes('validated_original_fact_required')));
  const changedUnit = cache([fact(1), { ...fact(2, 2.1, '2026-10-22T01:00:00.000002Z'), unit: 'TWD_million', validation_status: 'failed' }]);
  assert.deepEqual((await readCurrentFinancialCache(changedUnit.client, [id(99)], at)).evidence, []);
});
test('bounds, outage, future microsecond, cross-stock and same-clock conflict reject without fallback or leaked context', async () => {
  for (const [rows, options, reason] of [
    [[fact()], { error: true }, 'financial_cache_unavailable'], [[fact()], { sourceError: true }, 'financial_source_cache_unavailable'],
    [Array.from({ length: 2001 }, () => fact()), {}, 'financial_cache_bound_exceeded'],
    [[fact(1, 3.2, '2026-10-23T06:00:00.000001Z')], {}, 'financial_cache_binding_invalid'],
    [[{ ...fact(), stock_id: id(98) }], {}, 'financial_cache_binding_invalid'], [[fact(), fact(2)], {}, 'financial_revision_conflict'],
  ] as const) { const f = cache([...rows], options), result = await readCurrentFinancialCache(f.client, [id(99)], at); assert.deepEqual(result.evidence, []); assert.deepEqual(result.gaps, [reason]); assert.equal(JSON.stringify(result).includes('sensitive'), false); }
  const f = cache([]); assert.deepEqual((await readCurrentFinancialCache(f.client, [], at)).evidence, []); assert.deepEqual(f.calls, []);
});
test('real cache envelope retains comparison quote/action lineage and refuses published qualification instead of minting proof', async () => {
  const f = cache([fact()]), financial = await readCurrentFinancialCache(f.client, [id(99)], at), h = history();
  const input = { symbol: '2330', stockId: id(99), inputHash: 'a'.repeat(64), revisionId: id(7), publishedInputHash: 'd'.repeat(64), cutoff: at, signalSession: h.completedSessions.at(-1)!, financial, history: h, original: [] };
  const result = currentEvidenceRead(input); assert.equal(result.qualification, 'unavailable'); assert.equal(result.comparisonOnly, true);
  assert.equal(result.price?.sourceDatasetRevision, h.sourceDatasetRevision); assert.equal(result.price?.adjustmentEvidenceHash, h.priceBasis!.adjustmentEvidenceHash); assert.equal(result.comparisonPriceEvidence[0].value, 100);
  assert.equal(result.evidence.some(e => e.key === 'current_price'), false); assert.equal('proofHash' in result, false); assert.equal('expiresAt' in result, false);
  assert.ok(result.refusalReasons.includes('published_action_target_authority_missing')); assert.ok(result.refusalReasons.includes('financial_structural_hidden_newer_revision_unknown'));
  for (const mutate of [(v: typeof input) => { v.financial.cutoff = '2026-10-23T06:00:00.000001Z'; }, (v: typeof input) => { v.revisionId = 'unknown'; }, (v: typeof input) => { v.history.availableAt = '2026-10-23T06:00:00.000001Z'; }, (v: typeof input) => { v.history.sourceDatasetRevision = 'wrong-version'; }, (v: typeof input) => { v.history.priceBasis!.adjustmentVersion = 'unknown'; }, (v: typeof input) => { v.history.missingData = ['corporate_action_authority_missing']; }, (v: typeof input) => { v.signalSession = '2026-10-23'; }]) {
    const changed = structuredClone(input); mutate(changed); const rejected = currentEvidenceRead(changed); assert.equal(rejected.price, null); assert.deepEqual(rejected.comparisonPriceEvidence, []); assert.equal(rejected.qualification, 'unavailable');
  }
});
