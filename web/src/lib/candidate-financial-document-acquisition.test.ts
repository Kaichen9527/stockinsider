import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { persistDownloadedFinancialDocument } from './candidate-financial-document-acquisition.ts';

const metadata = { stockId: '10000000-0000-4000-8000-000000000001', symbol: '2330', exchange: 'TWSE' as const,
  periodEnd: '2025-06-30', sourceUrl: 'https://mopsov.twse.com.tw/server-java/FileDownLoad?co_id=2330',
  publishedAt: null, acquisitionJobId: '20000000-0000-4000-8000-000000000001' };
const originalPrincipal = process.env.OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID;
before(() => { process.env.OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID = '30000000-0000-4000-8000-000000000001'; });
after(() => { if (originalPrincipal === undefined) delete process.env.OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID; else process.env.OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID = originalPrincipal; });
function client(duplicate = false) {
  const calls: Array<{ name: string; input?: unknown }> = [];
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { symbol: '2330' }, error: null }; } };
  const db = { from(name: string) { calls.push({ name }); return query; },
    storage: { from(name: string) { calls.push({ name }); return { async upload(key: string, body: Blob, options: unknown) {
      calls.push({ name: 'upload', input: { key, size: body.size, options } });
      return { error: duplicate ? { message: 'The resource already exists' } : null };
    } }; } },
    async rpc(name: string, input: unknown) { calls.push({ name, input }); return { data: [{ receipt_id: 'receipt', receipt_status: 'accepted', idempotent_replay: duplicate }], error: null }; },
  };
  return { db: db as unknown as Parameters<typeof persistDownloadedFinancialDocument>[0], calls };
}
const document = new TextEncoder().encode('<html><ix:header></ix:header><ix:nonFraction>1</ix:nonFraction></html>');
test('official download is stored immutably and queued for independent parsing, never appended as a fact', async () => {
  const { db, calls } = client();
  const result = await persistDownloadedFinancialDocument(db, { metadata, bytes: document, contentType: 'text/html', writerReleaseId: 'reviewed-release' });
  assert.equal(result.factWrites, 0);
  assert.equal(result.receiptId, 'receipt');
  assert.deepEqual(calls.filter((call) => call.name.startsWith('record_')).map((call) => call.name), ['record_candidate_financial_document_receipt_v6']);
  assert.ok(calls.every((call) => !call.name.includes('append_financial')));
  const uploaded = calls.find((call) => call.name === 'upload')!.input as { options: { upsert: boolean } };
  assert.equal(uploaded.options.upsert, false);
});
test('content-addressed retries do not overwrite private originals', async () => {
  const { db, calls } = client(true);
  const result = await persistDownloadedFinancialDocument(db, { metadata, bytes: document, contentType: 'text/html', writerReleaseId: 'release' });
  assert.equal(result.idempotentReplay, true);
  assert.ok(calls.some((call) => call.name === 'reconcile_candidate_financial_document_job_v9'));
  const receiptCall = calls.find((call) => call.name === 'record_candidate_financial_document_receipt_v6')!.input as Record<string,unknown>;
  assert.equal(receiptCall.p_published_at,null,'download time is not the official publication time');
});
test('invalid magic, missing writer and stock mismatch cannot create a receipt', async () => {
  const { db, calls } = client();
  await assert.rejects(persistDownloadedFinancialDocument(db, { metadata, bytes: document, contentType: 'application/pdf', writerReleaseId: 'release' }), /mime_magic_mismatch/);
  await assert.rejects(persistDownloadedFinancialDocument(db, { metadata, bytes: document, contentType: 'text/html', writerReleaseId: '' }), /writer_missing/);
  await assert.rejects(persistDownloadedFinancialDocument(db, { metadata: { ...metadata, symbol: '2408' }, bytes: document, contentType: 'text/html', writerReleaseId: 'release' }), /stock_mismatch/);
  assert.equal(calls.filter((call) => call.name.startsWith('record_')).length, 0);
});
