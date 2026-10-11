import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../web/node_modules/typescript/lib/typescript.js';

// Executes the real route; only external boundaries are synthetic.
// Does not claim real PostgreSQL/artifact acceptance or perform live writes.
const OWNER = '10000000-0000-4000-8000-000000000001';
const STOCK = '10000000-0000-4000-8000-000000000002';
const workerError = new Error('synthetic_worker_failure');
const releaseError = new Error('synthetic_release_failure');
async function run(options = {}) {
  const calls = []; const logs = []; let held = null;
  const result = { claimedJobs: 1, writtenFacts: 12, failures: [], ...(options.result || {}) };
  const db = { from(table) {
    calls.push(`read:${table}`);
    const query = { select() { return this; }, eq() { return this; }, neq() { return this; },
      or() { return this; }, order() { return this; }, range() { return this; },
      in() { return this; }, lte() { return this; }, limit() { return this; },
      then(resolve, reject) {
        const data = table === 'candidate_financial_acquisition_jobs_v4'
          ? options.empty ? [] : [{ stock_id: STOCK, exchange: 'TWSE', created_at: '2026-10-08T01:00:00Z' }]
          : table === 'stocks' ? [{ id: STOCK, symbol: '2409', name: '友達', sector: '光電' }]
            : [{ stock_id: STOCK, valid_from: '2000-01-01', recorded_at: '2026-10-01T00:00:00Z', source_timestamp: '2026-10-01T00:00:00Z' }];
        return Promise.resolve({ data, error: options.readError === table ? { message: 'synthetic_read_failure' } : null }).then(resolve, reject);
      } };
    return query;
  } };
  const adapters = {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/internal-auth': { requireExactInternalBearer() { calls.push('auth'); return !options.unauthorized; } },
    '@/lib/taiwan-data-runtime': {
      async requireActiveVpsWriter() { calls.push('writer'); return options.inactive
        ? { ok: false, error: 'writer_release_not_active' } : { ok: true, supabase: db, releaseId: 'a'.repeat(40) }; },
      async resolveLatestCompletedTaiwanSession() { calls.push('session'); return '2026-10-08'; },
    },
    '@/lib/production-write-lease': {
      async acquireProductionWriteLease(ttl) { calls.push(`acquire:${ttl}`);
        if (options.acquireError) throw new Error('synthetic_acquire_failure');
        if (options.busy) return null; held = OWNER; return OWNER; },
      async releaseProductionWriteLease(owner) { calls.push(`release:${owner}`); assert.equal(owner, OWNER);
        assert.equal(held, OWNER); held = null; if (options.releaseError) throw releaseError; },
    },
    '@/lib/candidate-official-financials': { async refreshCandidateOfficialFinancials(candidates, cutoff, input) {
      calls.push('refresh'); assert.equal(held, OWNER, 'refresh must hold the acquired production lease');
      assert.deepEqual(JSON.parse(JSON.stringify(candidates)), [{ stockId: STOCK, symbol: '2409', exchange: 'TWSE', listedOn: '2000-01-01', statementKind: 'general' }]);
      assert.equal(cutoff, '2026-10-08T13:30:00+08:00');
      assert.deepEqual(JSON.parse(JSON.stringify(input)), { enqueueMissing: false, maxJobs: 7 });
      if (options.refreshThrows) throw workerError; return result;
    } },
    '@/lib/official-financial-validation-worker': { async validatePendingOfficialFinancials(stocks) {
      calls.push('validate'); assert.equal(held, OWNER, 'validation must hold the same acquired production lease');
      assert.deepEqual(Array.from(stocks), [STOCK]);
      if (options.validationThrows) throw workerError;
      return { status: options.validationIncomplete ? 'partial' : 'success' };
    } },
  };
  const exports = {};
  const source = fs.readFileSync(new URL('../web/src/app/api/internal/candidate-financial-queue-drain/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports, Buffer, console: { error: (...args) => logs.push(args) },
    require: name => { assert.ok(name in adapters, `unexpected dependency ${name}`); return adapters[name]; } });
  let response, error;
  try { response = await exports.POST({ async text() { calls.push('body'); return options.raw ?? JSON.stringify(options.body ?? { limit: 7 }); } }); }
  catch (cause) { error = cause; }
  return { calls, logs, held, response, error };
}
function noMutation(state) {
  assert.ok(!state.calls.some(c => /^(?:acquire:|release:|refresh$|validate$)/u.test(c)));
  assert.equal(state.held, null);
}
function released(state) {
  assert.equal(state.calls.filter(c => c.startsWith('release:')).length, 1);
  assert.equal(state.calls.at(-1), `release:${OWNER}`); assert.equal(state.held, null);
}

test('FQL-01 invalid input/auth/writer cannot acquire or mutate', async () => {
  for (const [options, status] of [[{ unauthorized: true }, 401], [{ raw: '{' }, 422],
    [{ raw: 'a'.repeat(10_001) }, 413], [{ body: { limit: 241 } }, 422],
    [{ body: { limit: 7, extra: true } }, 422], [{ inactive: true }, 409]]) {
    const state = await run(options); assert.equal(state.response?.status, status); noMutation(state);
    if (options.unauthorized) assert.deepEqual(state.calls, ['auth']);
  }
});
test('FQL-02 no due jobs retains read-only empty result', async () => {
  const state = await run({ empty: true }); assert.equal(state.response.status, 200); noMutation(state);
  assert.equal(state.response.body.result.claimed, 0); assert.equal(state.response.body.result.writtenFacts, 0);
  assert.equal(state.response.body.result.releaseId, 'a'.repeat(40));
});
test('FQL-03 read failures return failure before lease acquisition', async () => {
  for (const table of ['candidate_financial_acquisition_jobs_v4', 'stocks', 'stock_instruments_v3']) {
    const state = await run({ readError: table }); assert.equal(state.response.status, 500); noMutation(state);
    assert.match(state.response.body.error, /synthetic_read_failure/u);
  }
});
test('FQL-04 busy/unavailable lease distinguish failures without mutation or release', async () => {
  for (const [option, status, error] of [['busy', 409, 'production_write_cycle_already_running'],
    ['acquireError', 503, 'production_write_lease_unavailable']]) {
    const state = await run({ [option]: true }); assert.equal(state.response?.status, status);
    assert.equal(state.response.body.error, error);
    assert.ok(state.calls.includes('acquire:3600'));
    assert.ok(!state.calls.some(c => c.startsWith('release:') || c === 'refresh' || c === 'validate'));
  }
});
test('FQL-05 acquired owner encloses refresh/validation with original inputs and output', async () => {
  const state = await run(); assert.equal(state.error, undefined); assert.equal(state.response?.status, 200); released(state);
  assert.deepEqual(state.calls.slice(state.calls.indexOf('acquire:3600')), ['acquire:3600', 'refresh', 'validate', `release:${OWNER}`]);
  assert.equal(state.response.body.result.claimed, 1); assert.equal(state.response.body.result.writtenFacts, 12);
  assert.equal(state.response.body.result.sessionDate, '2026-10-08');
});
test('FQL-06 financial failure/incomplete validation retain original error semantics and release', async () => {
  for (const [options, expected] of [[{ result: { failures: ['synthetic_receipt_failure'] } }, 'candidate_financial_acquisition_failures'],
    [{ validationIncomplete: true }, 'official_validation_incomplete']]) {
    const state = await run(options); assert.equal(state.response?.status, 500); released(state);
    assert.equal(state.response.body.error, expected);
  }
});
test('FQL-07 thrown refresh/validation retain original exception even if release also fails', async () => {
  for (const option of ['refreshThrows', 'validationThrows']) for (const alsoReleaseFails of [false, true]) {
    const state = await run({ [option]: true, releaseError: alsoReleaseFails }); released(state);
    assert.equal(state.response, undefined); assert.equal(state.error, workerError);
    if (option === 'refreshThrows') assert.ok(!state.calls.includes('validate'));
    assert.equal(state.logs.length, alsoReleaseFails ? 1 : 0);
    if (alsoReleaseFails) assert.deepEqual(state.logs[0], ['candidate_financial_queue_write_lease_release_failed_after_worker_error']);
  }
});
test('FQL-08 release failure after successful workers cannot report success', async () => {
  const state = await run({ releaseError: true }); released(state);
  assert.equal(state.response, undefined); assert.equal(state.error, releaseError);
});
