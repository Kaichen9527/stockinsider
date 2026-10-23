import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchCandidateMopsFiling, refreshCandidateOfficialFinancials } from '../candidate-official-financials.ts';
import { processCandidateFinancialDocumentReceipts } from '../candidate-financial-document-worker.ts';
import { persistDownloadedFinancialDocument } from '../candidate-financial-document-acquisition.ts';
import { runCandidateFinancialLocalParser } from '../candidate-financial-local-parser.ts';
import { fetchTwStockQuote } from '../tw-market.ts';

test('VN01 actual financial coverage/download/parser/document boundaries reject before any DB or network IO', async () => {
  const prior = process.env.STOCKINSIDER_VNEXT_ENABLED; process.env.STOCKINSIDER_VNEXT_ENABLED = 'true';
  const originalFetch = globalThis.fetch; let externalCalls = 0; let dbCalls = 0;
  globalThis.fetch = (async () => { externalCalls++; throw new Error('unexpected_network'); }) as typeof fetch;
  const client = new Proxy({}, { get() { dbCalls++; throw new Error('unexpected_database'); } });
  try {
    const candidate = { stockId: '00000000-0000-4000-8000-000000000001', symbol: '2330', exchange: 'TWSE' as const };
    await assert.rejects(fetchCandidateMopsFiling(candidate, 2026, 2), /not_admitted/);
    await assert.rejects(fetchTwStockQuote('2330'), /not_admitted/);
    await assert.rejects(refreshCandidateOfficialFinancials([candidate], new Date().toISOString()), /not_admitted/);
    await assert.rejects(processCandidateFinancialDocumentReceipts(1), /shared_authority/);
    await assert.rejects(processCandidateFinancialDocumentReceipts(1, { stockId: candidate.stockId, symbol: candidate.symbol }), /not_admitted/);
    await assert.rejects(runCandidateFinancialLocalParser({ bytes: new Uint8Array([1]), documentSha256: '0'.repeat(64), format: 'xbrl', expectedEntity: '2330' }), /not_admitted/);
    const empty = await refreshCandidateOfficialFinancials([], new Date().toISOString());
    assert.equal(empty.candidateCount, 0);
    await assert.rejects(persistDownloadedFinancialDocument(client as Parameters<typeof persistDownloadedFinancialDocument>[0], {
      metadata: { symbol: '2330' } as Parameters<typeof persistDownloadedFinancialDocument>[1]['metadata'], bytes: new Uint8Array([1]), contentType: 'text/html', writerReleaseId: 'fixture' }), /not_admitted/);
    assert.equal(externalCalls, 0); assert.equal(dbCalls, 0);
  } finally { globalThis.fetch = originalFetch; if (prior === undefined) delete process.env.STOCKINSIDER_VNEXT_ENABLED; else process.env.STOCKINSIDER_VNEXT_ENABLED = prior; }
});
