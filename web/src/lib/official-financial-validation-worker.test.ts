import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isLegacyUnprovedFinancialFact, validatePendingOfficialFinancials } from './official-financial-validation-worker.ts';
import { validateOfficialFinancialFact } from './official-financial-validation.ts';

const stockId = '11111111-1111-1111-1111-111111111111';
const sha = 'a'.repeat(64);
const recordedAt = '2026-09-08T00:00:01Z';
const now = () => new Date('2026-09-11T10:00:00Z');
const runnerPrincipal = () => '55555555-5555-4555-8555-555555555555';
const base = { stock_id: stockId, fact_key: 'quarterly_revenue', period_start: '2026-01-01',
  period_end: '2026-03-31', duration_kind: 'quarterly', value: 1_000_000, unit: 'TWD',
  estimate_kind: 'reported', provider: 'mops', authority_tier: 'official_filing',
  source_ref: `issuer-document:${sha}:revenue`, filing_restatement_id: 'v1',
  filing_published_at: '2026-05-15T00:00:00Z', source_timestamp: '2026-05-15T00:00:00Z',
  collected_at: '2026-09-08T00:00:00Z', recorded_at: recordedAt, validation_status: 'pending' };
type Row = Record<string, unknown>;
type DbError = { message: string; code: string };

function fixture(options: {
  facts?: Row[]; rpcError?: DbError | null; errorFactId?: string; failTable?: string;
  omitProvenance?: boolean; receiptAccepted?: boolean; unlinkedFactIds?: string[]; priorReceipts?: Row[];
} = {}) {
  const facts = options.facts ?? [{ ...base, fact_id: 'legacy' }, { ...base, fact_id: 'linked' }];
  const calls: Array<{ name: string; args: Row }> = [];
  const client = {
    from(table: string) {
      let selectedIds: string[] | null = null;
      let selectedStock: string | null = null;
      const result = (from = 0, to = 9999) => {
        if (options.failTable === table) return { data: null, error: { message: 'fixture database unavailable', code: '08006' } };
        const rows = table === 'opportunity_financial_facts_v3'
          ? facts.filter((row) => !selectedStock || row.stock_id === selectedStock)
          : table === 'candidate_financial_fact_provenance_v4' && !options.omitProvenance
            ? facts.filter((row) => selectedIds?.includes(String(row.fact_id))).map((row) => ({
              fact_id: row.fact_id, source_url: 'https://mops.twse.com.tw/report.xhtml', source_sha256: sha,
              locator: { parser_evidence_id: `${row.fact_id}-evidence` },
            }))
          : table === 'official_financial_validation_receipts'
            ? (options.priorReceipts ?? []).filter((row) => selectedIds?.includes(String(row.fact_id)))
          : table === 'candidate_financial_document_fact_links_v8'
              ? facts.filter((row) => selectedIds?.includes(String(row.fact_id))
                && !(options.unlinkedFactIds ?? ['legacy']).includes(String(row.fact_id)))
                .map((row) => ({ fact_id: row.fact_id }))
              : [];
        return { data: rows.slice(from, to + 1), error: null };
      };
      return {
        select() { return this; },
        eq(key: string, value: string) { if (key === 'stock_id') selectedStock = value; return this; },
        lte() { return this; }, order() { return this; },
        in(_key: string, ids: string[]) { selectedIds = ids; return this; },
        async range(from: number, to: number) { return result(from, to); },
        then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
      };
    },
    async rpc(name: string, args: Row) {
      calls.push({ name, args });
      if (args.p_fact_id === (options.errorFactId ?? 'legacy') && options.rpcError !== null) {
        return { data: null, error: options.rpcError ?? { message: 'official_validation_structural_proof_missing', code: 'P0001' } };
      }
      return { data: options.receiptAccepted ?? true, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test('an unproved legacy fact is explicitly partial and does not cancel a valid fact in the same batch', async () => {
  const { client, calls } = fixture({ facts: [
    { ...base, fact_id: 'legacy', value: 999_999 },
    { ...base, fact_id: 'linked' },
  ] });
  const result = await validatePendingOfficialFinancials([stockId, stockId], { client, now, runnerPrincipal });
  assert.equal(result.status, 'partial');
  assert.equal(result.checked, 2); assert.equal(result.failed, 1); assert.equal(result.validated, 1);
  assert.equal(result.rejected, 0); assert.equal(result.unchanged, 0);
  assert.deepEqual(result.failedItems, [{ stockId, factId: 'legacy', recordedAt, status: 'failed',
    terminalReason: 'official_validation_structural_proof_missing' }]);
  assert.deepEqual(calls.map((call) => call.args.p_fact_id), ['legacy', 'linked']);
  assert.equal(calls[1].args.p_source_sha256, sha);
});

test('a local proof failure does not prevent validation of a different stock', async () => {
  const otherStock = '22222222-2222-2222-2222-222222222222';
  const { client, calls } = fixture({ facts: [{ ...base, fact_id: 'legacy' },
    { ...base, stock_id: otherStock, fact_id: 'other' }] });
  const result = await validatePendingOfficialFinancials([stockId, otherStock], { client, now, runnerPrincipal });
  assert.equal(result.failed, 1); assert.equal(result.validated, 1); assert.equal(result.status, 'partial');
  assert.deepEqual(calls.map((call) => call.args.p_fact_id), ['legacy', 'other']);
});

test('auth, database, unknown proof and other guard failures remain critical', async () => {
  for (const rpcError of [
    { code: '42501', message: 'permission denied' },
    { code: '08006', message: 'database unavailable' },
    { code: 'P0001', message: 'official_validation_subject_mismatch' },
    { code: 'P0001', message: 'official_validation_provenance_missing' },
    { code: '08006', message: 'official_validation_structural_proof_missing' },
    { code: 'P0001', message: 'official_validation_structural_proof_missing:unexpected' },
  ]) {
    const { client, calls } = fixture({ rpcError });
    await assert.rejects(validatePendingOfficialFinancials([stockId], { client, now, runnerPrincipal }),
      { message: `official_validation_write_failed:${rpcError.message}` });
    assert.deepEqual(calls.map((call) => call.args.p_fact_id), ['legacy']);
  }
});

test('a structural-proof guard for a non-document row is unexpected and remains critical', async () => {
  const { client } = fixture({ facts: [{ ...base, source_ref: 'twse-openapi:generalIncome', fact_id: 'legacy' }] });
  await assert.rejects(validatePendingOfficialFinancials([stockId], { client, now, runnerPrincipal }), /official_validation_write_failed/u);
});

test('database read failures are not turned into a successful empty validation', async () => {
  for (const failTable of ['candidate_issuer_document_domains_v6', 'opportunity_financial_facts_v3',
    'candidate_financial_fact_provenance_v4', 'official_financial_validation_receipts',
    'candidate_financial_document_fact_links_v8']) {
    const { client, calls } = fixture({ failTable });
    await assert.rejects(validatePendingOfficialFinancials([stockId], { client, now, runnerPrincipal }), /fixture database unavailable/u);
    assert.equal(calls.length, 0);
  }
});

test('missing provenance and rejected receipts remain partial; valid receipts alone can succeed', async () => {
  const noSource = fixture({ omitProvenance: true });
  const missing = await validatePendingOfficialFinancials([stockId], { client: noSource.client, now, runnerPrincipal });
  assert.equal(missing.status, 'partial'); assert.equal(missing.missingProvenance, 2);
  assert.equal(missing.validated, 0); assert.equal(noSource.calls.length, 0);
  const rejected = await validatePendingOfficialFinancials([stockId], { client: fixture({ rpcError: null, receiptAccepted: false }).client, now, runnerPrincipal });
  assert.equal(rejected.status, 'partial'); assert.equal(rejected.rejected, 2); assert.equal(rejected.validated, 0);
  const complete = await validatePendingOfficialFinancials([stockId], { client: fixture({ rpcError: null }).client, now, runnerPrincipal });
  assert.equal(complete.status, 'success'); assert.equal(complete.validated, 2);
  assert.deepEqual(complete.failedItems, []); assert.equal(complete.failed, 0);
});

test('only predecessor collector rows before the proof cutover are quarantined as non-authority', async () => {
  const legacy = { ...base, fact_id: 'legacy', source_ref: 'twse-openapi:legacy',
    recorded_at: '2026-08-27T00:00:00Z' };
  const current = { ...legacy, fact_id: 'current', recorded_at: '2026-09-01T00:00:00Z' };
  const unrelated = { ...legacy, fact_id: 'other', source_ref: 'issuer-document:'.concat(sha, ':legacy') };
  assert.equal(isLegacyUnprovedFinancialFact(legacy), true);
  assert.equal(isLegacyUnprovedFinancialFact(current), false);
  assert.equal(isLegacyUnprovedFinancialFact(unrelated), false);
  const run = await validatePendingOfficialFinancials([stockId], {
    client: fixture({ facts: [legacy], omitProvenance: true }).client, now, runnerPrincipal,
  });
  assert.equal(run.status, 'success'); assert.equal(run.legacyUnproved, 1);
  assert.equal(run.missingProvenance, 0); assert.equal(run.validated, 0);
});

test('an unchanged trusted rejection stays auditable without re-failing every drain', async () => {
  const rejectedFact = { ...base, fact_id: 'rejected', validation_status: 'rejected', unit: 'USD' };
  const source = { fact_id: 'rejected', source_url: 'https://mops.twse.com.tw/report.xhtml', source_sha256: sha,
    locator: { parser_evidence_id: 'rejected-evidence' }, issuer_host_approved: false };
  const receipt = validateOfficialFinancialFact(rejectedFact, [rejectedFact], source, now().toISOString());
  assert.equal(receipt.status, 'rejected');
  const priorReceipts = [{ fact_id: 'rejected', input_hash: receipt.inputHash,
    validator_version: 'official-financial-v2', validator_principal: runnerPrincipal(),
    effective_validation: { ...receipt, validation_status: receipt.status }, receipt_sequence: 1 }];
  const fx = fixture({ facts: [rejectedFact], priorReceipts });
  const run = await validatePendingOfficialFinancials([stockId], { client: fx.client, now, runnerPrincipal });
  assert.equal(run.status, 'success'); assert.equal(run.unchangedRejected, 1);
  assert.equal(run.rejected, 0); assert.equal(fx.calls.length, 0);
});

test('an unchanged SQL-effective rejection remains terminal when the local validator is permissive', async () => {
  const fact = { ...base, fact_id: 'sql-rejected', validation_status: 'rejected' };
  const source = { fact_id: fact.fact_id, source_url: 'https://mops.twse.com.tw/report.xhtml', source_sha256: sha,
    locator: { parser_evidence_id: 'sql-rejected-evidence' }, issuer_host_approved: false };
  const localReceipt = validateOfficialFinancialFact(fact, [fact], source, now().toISOString());
  assert.equal(localReceipt.status, 'validated');
  const priorReceipts = [{ fact_id: fact.fact_id, input_hash: localReceipt.inputHash,
    validator_version: 'official-financial-v2', validator_principal: runnerPrincipal(),
    effective_validation: { validation_status: 'rejected' }, receipt_sequence: 1 }];
  const fx = fixture({ facts: [fact], priorReceipts });
  const run = await validatePendingOfficialFinancials([stockId], { client: fx.client, now, runnerPrincipal });
  assert.equal(run.status, 'success'); assert.equal(run.unchangedRejected, 1);
  assert.equal(run.validated, 0); assert.equal(run.rejected, 0); assert.equal(fx.calls.length, 0);
});
