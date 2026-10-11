import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../web/node_modules/typescript/lib/typescript.js';

// Real route execution with synthetic document/database/lease boundaries.
// No live request, credential, document, artifact or database is used.
const OWNER = '10000000-0000-4000-8000-000000000001';
const STOCK = '10000000-0000-4000-8000-000000000002';
const JOB = '10000000-0000-4000-8000-000000000003';
const RECEIPT = '10000000-0000-4000-8000-000000000004';
function metadata() { return { stockId: STOCK, symbol: '2409', acquisitionJobId: JOB,
  sourceUrl: 'https://mops.twse.com.tw/fixture', exchange: 'TWSE', periodEnd: '2026-06-30', publishedAt: '2026-08-01' }; }
async function run(options = {}) {
  const calls = []; let held = null;
  const result = options.workerResult || { reconciliationErrors: [], results: [] };
  const db = {
    from(table) { calls.push(`read:${table}`); return { select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: table === 'stocks' ? { id: STOCK, symbol: '2409' }
        : table === 'candidate_financial_document_receipts_v6' ? { receipt_id: RECEIPT } : { host: 'example.com' }, error: null }; } }; },
    async rpc(name) {
      calls.push(`rpc:${name}`); assert.equal(held, OWNER, 'every mutation requires this acquired lease');
      if (options.throwRpc) throw new Error('synthetic_rpc_failure');
      if (name === 'record_candidate_financial_document_receipt_v6') return {
        data: options.receiptError ? null : [{ receipt_id: RECEIPT, receipt_status: 'received', idempotent_replay: true }],
        error: options.receiptError ? { message: 'synthetic_receipt_failure' } : null };
      return { data: true, error: options.linkError ? { message: 'synthetic_link_failure' } : null };
    },
  };
  const adapters = {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/internal-auth': { requireExactInternalBearer() { calls.push('auth'); return !options.unauthorized; } },
    '@/lib/taiwan-data-runtime': { async requireActiveVpsWriter() {
      calls.push('writer'); return options.inactive ? { ok: false, error: 'writer_release_not_active' }
        : { ok: true, releaseId: 'a'.repeat(40), supabase: db }; } },
    '@/lib/opportunity-v3/internal': { fixedRunnerPrincipal: () => 'synthetic-principal' },
    '@/lib/candidate-financial-documents': {
      MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES: 1000,
      parseCandidateFinancialDocumentMetadata() { calls.push('metadata'); return options.invalidMetadata ? null : metadata(); },
      isOfficialDocumentHost: () => true,
      async readBoundedCandidateFinancialDocument() { calls.push('body'); return { bytes: Buffer.from('fixture'), byteLength: 7, sha256: 'b'.repeat(64) }; },
      validateCandidateFinancialDocument() { calls.push('validate'); return options.invalidDocument ? { error: 'invalid_document' }
        : { normalizedContentType: 'application/xhtml+xml', format: 'ixbrl' }; },
      candidateFinancialDocumentObjectKey: () => 'fixture-key',
    },
    '@/lib/candidate-financial-artifact': { async putCandidateFinancialArtifact() {
      calls.push('artifact'); assert.equal(held, OWNER); if (options.artifactError) throw new Error('synthetic_artifact_failure'); } },
    '@/lib/production-write-lease': {
      async acquireProductionWriteLease(ttl) { calls.push(`acquire:${ttl}`); if (options.acquireError) throw new Error('synthetic_acquire_failure');
        if (options.busy) return null; held = OWNER; return OWNER; },
      async releaseProductionWriteLease(owner) { calls.push(`release:${owner}`); assert.equal(owner, OWNER); assert.equal(held, OWNER);
        held = null; if (options.releaseError) throw new Error('synthetic_release_failure'); },
    },
    '@/lib/candidate-financial-document-worker': { async processCandidateFinancialDocumentReceipts(limit) {
      calls.push(`process:${limit}`); assert.equal(held, OWNER); if (options.workerThrows) throw new Error('synthetic_worker_failure'); return result; } },
  };
  const exports = {};
  const route = options.worker ? 'worker/route.ts' : 'route.ts';
  const source = fs.readFileSync(new URL(`../web/src/app/api/internal/candidate-financial-documents/${route}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports, require: name => { assert.ok(name in adapters, `unexpected dependency ${name}`); return adapters[name]; }, URL });
  const request = { body: 'fixture', url: `https://example.com/api/internal/candidate-financial-documents?receiptId=${RECEIPT}`,
    headers: new Headers({ 'content-type': 'application/xhtml+xml', ...(options.headers || {}) }),
    async json() { calls.push('json'); return options.body ?? { limit: 5 }; } };
  let response, error;
  try { response = await exports[options.get ? 'GET' : 'POST'](request); } catch (cause) { error = cause; }
  return { response, error, calls, held };
}
function released(state) {
  assert.equal(state.calls.filter(c => c.startsWith('release:')).length, 1);
  assert.equal(state.calls.at(-1), `release:${OWNER}`); assert.equal(state.held, null);
}

test('FDL-01 exact auth and active writer precede any lease/artifact operation', async () => {
  for (const worker of [false, true]) {
    let state = await run({ worker, unauthorized: true });
    assert.equal(state.response.status, 401); assert.deepEqual(state.calls, ['auth']);
    state = await run({ worker, inactive: true });
    assert.equal(state.response.status, 409); assert.deepEqual(state.calls, ['auth', 'writer']);
  }
});
test('FDL-02 invalid or oversized documents and invalid worker requests never acquire', async () => {
  for (const input of [{ invalidMetadata: true }, { invalidDocument: true }, { headers: { 'content-length': '1001' } },
    { worker: true, body: { limit: 21 } }, { worker: true, body: { unexpected: true } }]) {
    const state = await run(input); assert.ok([413, 422].includes(state.response.status));
    assert.ok(!state.calls.some(c => c.startsWith('acquire:') || c === 'artifact'));
  }
});
test('FDL-03 contention and acquisition failure return explicit errors without writes or release', async () => {
  for (const worker of [false, true]) for (const [option, status] of [['busy', 409], ['acquireError', 503]]) {
    const state = await run({ worker, [option]: true });
    assert.equal(state.response.status, status); assert.ok(!state.error);
    assert.ok(!state.calls.some(c => c.startsWith('release:') || c.startsWith('rpc:') || c.startsWith('process:') || c === 'artifact'));
  }
});
test('FDL-04 upload lease encloses private artifact, receipt and idempotent linked-job reconciliation', async () => {
  const state = await run(); assert.equal(state.response.status, 202); assert.equal(state.response.body.receiptId, RECEIPT);
  assert.equal(state.response.body.idempotentReplay, true);
  assert.deepEqual(state.calls.slice(state.calls.indexOf('acquire:300')), ['acquire:300', 'artifact',
    'rpc:record_candidate_financial_document_receipt_v6', 'rpc:reconcile_candidate_financial_document_job_v9', `release:${OWNER}`]);
  assert.ok(state.calls.indexOf('validate') < state.calls.indexOf('acquire:300')); released(state);
});
test('FDL-05 storage, receipt, job-link errors and thrown mutations all release only their own lease', async () => {
  for (const option of ['artifactError', 'receiptError', 'linkError', 'throwRpc']) {
    const state = await run({ [option]: true }); released(state);
    if (option === 'throwRpc') assert.equal(state.error.message, 'synthetic_rpc_failure');
    else assert.equal(state.response.status, 500);
  }
});
test('FDL-06 bounded worker acquires its lease before processing and releases success/partial/error/throw', async () => {
  for (const options of [{}, { workerResult: { reconciliationErrors: ['fixture'], results: [] } },
    { workerResult: { reconciliationErrors: [], results: [{ status: 'partial' }] } }, { workerThrows: true }]) {
    const state = await run({ worker: true, ...options }); released(state);
    assert.deepEqual(state.calls.slice(state.calls.indexOf('acquire:3600')), ['acquire:3600', 'process:5', `release:${OWNER}`]);
    if (options.workerThrows) assert.equal(state.error.message, 'synthetic_worker_failure');
    else assert.equal(state.response.status, options.workerResult ? 500 : 200);
  }
});
test('FDL-07 read-only receipt GET never acquires or releases a write lease', async () => {
  const state = await run({ get: true }); assert.equal(state.response.status, 200);
  assert.ok(!state.calls.some(c => c.startsWith('acquire:') || c.startsWith('release:') || c.startsWith('rpc:')));
});
test('FDL-08 a release failure cannot report a successful upload or worker response', async () => {
  for (const worker of [false, true]) {
    const state = await run({ worker, releaseError: true });
    assert.equal(state.response, undefined); assert.equal(state.error.message, 'synthetic_release_failure'); released(state);
  }
});
