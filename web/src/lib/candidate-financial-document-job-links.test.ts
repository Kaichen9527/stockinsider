import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { reconcileCandidateFinancialDocumentJobs } from './candidate-financial-document-worker.ts';

test('document worker reconciles all replay job links through the bounded authenticated RPC', async () => {
  const calls: unknown[] = [];
  const client = { async rpc(name: string, input: unknown) { calls.push({ name, input }); return { error: null, data: [] }; } };
  const typed = client as unknown as Parameters<typeof reconcileCandidateFinancialDocumentJobs>[0];
  assert.deepEqual(await reconcileCandidateFinancialDocumentJobs(typed, 'principal', 'receipt'), []);
  assert.deepEqual(await reconcileCandidateFinancialDocumentJobs(typed, 'principal'), []);
  assert.deepEqual(calls, [
    { name: 'reconcile_pending_financial_document_jobs_v9', input: { p_caller_principal: 'principal', p_limit: 40, p_receipt_id: 'receipt' } },
    { name: 'reconcile_pending_financial_document_jobs_v9', input: { p_caller_principal: 'principal', p_limit: 40, p_receipt_id: null } },
  ]);
});

test('job-link reconciliation failure is not swallowed or reported as completion', async () => {
  const client = { async rpc() { return { error: { message: 'missing migration' }, data: null }; } };
  const typed = client as unknown as Parameters<typeof reconcileCandidateFinancialDocumentJobs>[0];
  assert.deepEqual(await reconcileCandidateFinancialDocumentJobs(typed, 'principal', 'receipt'), [{
    receiptId: 'receipt', error: 'candidate_financial_document_job_reconciliation_failed:missing migration',
  }]);
});

test('manual ingress reconciles both new and replayed jobs after guarded immutable receipt creation', async () => {
  const source = await readFile(new URL('../app/api/internal/candidate-financial-documents/route.ts', import.meta.url), 'utf8');
  assert.match(source, /requireExactInternalBearer/u);
  assert.match(source, /requireActiveVpsWriter/u);
  assert.match(source, /upsert: false/u);
  assert.match(source, /p_job_id: metadata\.acquisitionJobId, p_caller_principal: runnerPrincipal/u);
  assert.ok(source.indexOf("rpc('reconcile_candidate_financial_document_job_v9'")
    > source.indexOf("rpc('record_candidate_financial_document_receipt_v6'"));
  assert.match(source, /if \(linked\.error\) return error\(500/u);
  assert.doesNotMatch(source, /if \([^)]*idempotent_replay/u);
});
