import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { candidateDossierBundleId, candidateDossierInputHash } from '../web/src/lib/candidate-dossier-contract.ts';
import { validateResearchDeepAuthorInput } from '../web/src/lib/research-deep-author-input.ts';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';
import ts from '../web/node_modules/typescript/lib/typescript.js';

// Acceptance criteria: DCC-RT-01 auth first; 02 durable claim context; 03 read-only
// recovery; 04 exact owner/identity; 05 clock/deadline fences; 06 uncertain claim;
// 07 duplicate/invalid durable state; 08 preserve existing mutation contracts.
// All credentials and rows in this file are synthetic. No live client is loaded.
const NOW = '2026-10-05T00:10:00.000Z';
const START = '2026-10-05T00:00:00.000Z';
const DEADLINE = '2026-10-05T00:30:00.000Z';
const OWNER = 'fixture-author';
const JOB = '10000000-0000-4000-8000-000000000001';
const PRIORITY = '10000000-0000-4000-8000-000000000002';
const RESERVATION = '10000000-0000-4000-8000-000000000003';
const REVISION = '10000000-0000-4000-8000-000000000004';
const RECEIPT = '10000000-0000-4000-8000-000000000005';
const OTHER_JOB = '10000000-0000-4000-8000-000000000006';
const OTHER_RESERVATION = '10000000-0000-4000-8000-000000000007';
const HASH = 'a'.repeat(64);
const TABLE = {
  jobs: 'research_deep_jobs_v1', attempts: 'research_deep_job_attempts_v1',
  reservations: 'research_model_reservations_v1', completions: 'research_model_completions_v1',
  priority: 'research_priority_runs_v1', bundles: 'candidate_dossier_bundles', documents: 'source_raw_documents',
  stocks: 'stocks', published: 'candidate_daily_stage_snapshots',
};
const ENV = {
  INTERNAL_API_KEY: 'fixture-internal-only', CRON_SECRET: 'fixture-cron-only',
  RESEARCH_REVIEW_KEY: 'fixture-review-only', RESEARCH_TEST_KEY: 'fixture-test-only',
};

function fixture() {
  return {
    [TABLE.jobs]: [{ job_id: JOB, symbol: '2330', priority_run_id: PRIORITY, research_scope:'formal_v1',
      status: 'running', attempts: 1, lease_owner: OWNER, lease_expires_at: DEADLINE }],
    [TABLE.attempts]: [{ id: '10000000-0000-4000-8000-000000000008', job_id: JOB,
      attempt: 1, owner: OWNER, claimed_at: START, lease_expires_at: DEADLINE }],
    [TABLE.reservations]: [{ reservation_id: RESERVATION, role: 'company_research', owner: OWNER,
      work_key: `deep:${JOB}:1`, taipei_day: '2026-10-05', started_at: START,
      lease_expires_at: DEADLINE, reserved_seconds: 1800 }],
    [TABLE.completions]: [],
  };
}

function expectedContext({ completion = null, observedAt = NOW } = {}) {
  return { schemaVersion: 'research-deep-claim-context-v1', observedAt,
    job: { jobId: JOB, symbol: '2330', priorityRunId: PRIORITY, attempt: 1,
      owner: OWNER, leaseExpiresAt: DEADLINE },
    modelReservation: { reservationId: RESERVATION, role: 'company_research', owner: OWNER,
      workKey: `deep:${JOB}:1`, startedAt: START, leaseExpiresAt: DEADLINE },
    modelCompletion: completion };
}

function claimRow() {
  return { job_id: JOB, symbol: '2330', priority_run_id: PRIORITY, attempt: 1,
    lease_expires_at: DEADLINE };
}

function database(rows, options = {}) {
  const calls = { rpc: [], selects: [], client: 0, body: 0 };
  const db = {
    from(table) {
      assert.ok(Object.values(TABLE).includes(table), `unexpected table ${table}`);
      const filters = [];
      let limit = Infinity;
      let columns;
      let result;
      function execute(single = false) {
        if (result) return result;
        calls.selects.push({ table, columns, filters: [...filters], limit });
        if (options.hangTable === table) return new Promise(() => {});
        if (options.throwTable === table) throw new Error('fixture-private-database-diagnostic');
        if (options.errorTable === table) {
          result = { data: null, error: { message: 'fixture-private-database-diagnostic' } };
          return result;
        }
        const data = (rows[table] || []).filter((row) => filters.every(([op, key, value]) => {
          if (op === 'eq') return row[key] === value;
          if (op === 'gt') return row[key] > value;
          if (op === 'gte') return row[key] >= value;
          if (op === 'lt') return row[key] < value;
          if (op === 'lte') return row[key] <= value;
          if (op === 'in') return value.includes(row[key]);
          if (op === 'or') {
            value = key;
            const root = JSON.parse(value.slice('metadata->>canonical_url.eq.'.length, value.indexOf(',and(')));
            const pattern = JSON.parse(value.slice(value.indexOf('document_url.match.') + 'document_url.match.'.length, -1));
            return row.metadata?.canonical_url === root || row.metadata?.canonical_url == null && new RegExp(pattern).test(row.document_url);
          }
          if (op === 'contains') return Object.entries(value).every(([name, item]) => row[key]?.[name] === item);
          throw new Error(`unsupported query operator ${op}`);
        })).slice(0, limit).map((row) => {
          assert.equal(typeof columns, 'string', 'SELECT columns are required');
          const fields = columns === '*' ? Object.keys(row) : columns.split(',');
          assert.ok(fields.every((field) => /^[a-z_]+$/u.test(field)), 'simple explicit column projection');
          return structuredClone(Object.fromEntries(fields.map((field) => [field, row[field]])));
        });
        result = single && data.length > 1
          ? { data: null, error: { message: 'multiple fixture rows' } }
          : { data: single ? data[0] || null : data, error: null };
        options.afterSelect?.({ table, rows, calls });
        return result;
      }
      const query = {
        select(value) { columns = value; return query; },
        limit(value) { limit = value; return query; },
        order() { return query; }, abortSignal() { return query; },
        maybeSingle: async () => execute(true), single: async () => execute(true),
        then(resolve, reject) { return Promise.resolve().then(() => execute()).then(resolve, reject); },
      };
      for (const op of ['eq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'or']) {
        query[op] = (key, value) => { filters.push([op, key, value]); return query; };
      }
      return query;
    },
    rpc(name, args) {
      const result = (async () => {
      calls.rpc.push({ name, args: structuredClone(args) });
      if (options.rpcThrows) throw new Error('fixture-private-database-diagnostic');
      if (options.rpcError) return { data: null, error: { message: options.rpcError } };
      if (name === 'prepare_research_input_v2') return {data: {preparation_id: RECEIPT, dispatchReady: false}, error: null};
      if (name === 'research_evidence_heads_v1') return { data: options.heads || args.p_ids.map(id => ({ id, headId: id, retracted: false, superseded: false })), error: null };
      if (name === 'claim_research_deep_job_v1') {
        return { data: options.claimData === undefined ? [claimRow()] : options.claimData, error: null };
      }
      return { data: name === 'claim_candidate_deep_outbox_v1'
        ? [{ job_id: RECEIPT, lease_expires_at: DEADLINE }] : true, error: null };
      })();
      return Object.assign(result, { abortSignal: () => result });
    },
  };
  return { db, calls };
}

async function run({ body = { action: 'status', owner: OWNER }, rows = fixture(),
  headers = { authorization: `Bearer ${ENV.INTERNAL_API_KEY}` }, env = ENV, now = NOW,
  invalidBody = false, afterSelect, timerMax, ...dbOptions } = {}) {
  let currentTime = now;
  const { db, calls } = database(rows, { ...dbOptions,
    afterSelect: (state) => afterSelect?.({ ...state, setTime: (value) => { currentTime = value; } }),
  });
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [currentTime])); }
    static now() { return Date.parse(currentTime); }
  }
  const cache = new Map();
  const adapters = {
    'node:crypto': crypto,
    'next/server': { NextResponse: { json: (responseBody, init) => ({
      body: JSON.parse(JSON.stringify(responseBody)), status: init?.status ?? 200,
    }) } },
    '@/lib/supabase-server': { getSupabaseServerClient() { calls.client++; return db; } },
  };
  function load(name) {
    if (name === 'crypto') return crypto;
    if (name.startsWith('./')) name = '@/lib/' + name.slice(2).replace(/\.ts$/u, '');
    if (name in adapters) return adapters[name];
    assert.ok(name.startsWith('@/lib/'), `unexpected dependency ${name}`);
    if (cache.has(name)) return cache.get(name);
    const exports = {};
    cache.set(name, exports);
    const url = new URL(`../web/src/lib/${name.slice('@/lib/'.length)}.ts`, import.meta.url);
    evaluate(fs.readFileSync(url, 'utf8'), exports);
    return exports;
  }
  function evaluate(source, exports) {
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    vm.runInNewContext(compiled, { exports, require: load, Date: Clock,
      process: { env: { ...env } }, Buffer, JSON, URL, Request, Headers, AbortController, setTimeout: timerMax ? (callback, delay) => setTimeout(callback, Math.min(delay, timerMax)) : setTimeout, clearTimeout });
  }
  const route = {};
  evaluate(fs.readFileSync(new URL('../web/src/app/api/internal/research-deep-job/route.ts', import.meta.url), 'utf8'), route);
  const request = { headers: new Headers(headers), async json() {
    calls.body++;
    if (invalidBody) throw new Error('fixture malformed JSON');
    return structuredClone(body);
  } };
  const response = await route.POST(request);
  return { response, calls };
}

function assertReadOnly(calls) {
  assert.deepEqual(calls.rpc, [], 'status must never claim, reserve, renew, finish, or publish');
  for (const query of calls.selects) {
    assert.equal(typeof query.columns, 'string');
    assert.notEqual(query.columns, '*', 'context reads use an explicit bounded projection');
    assert.ok(Number.isInteger(query.limit) && query.limit > 0 && query.limit <= 2,
      'context reads are bounded and can detect duplicate rows');
  }
}

function assertUnavailable(response, action = 'status') {
  assert.equal(response.status, 409);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, `research_deep_${action}_context_unavailable`);
  assert.equal(response.body.context, null);
  assert.equal(JSON.stringify(response.body).includes('fixture-private'), false);
}

test('DCC-RT-01 exact internal bearer is checked before body parsing or database access', async () => {
  for (const headers of [ {}, { 'x-internal-key': ENV.INTERNAL_API_KEY },
    { authorization: ENV.INTERNAL_API_KEY }, { authorization: `bearer ${ENV.INTERNAL_API_KEY}` },
    { authorization: `Bearer ${ENV.CRON_SECRET}` }, { authorization: `Bearer ${ENV.RESEARCH_REVIEW_KEY}` },
    { authorization: `Bearer ${ENV.RESEARCH_TEST_KEY}` }, { authorization: 'Bearer invalid' },
    { authorization: `Bearer ${ENV.INTERNAL_API_KEY}`, 'x-internal-key': ENV.INTERNAL_API_KEY } ]) {
    const { response, calls } = await run({ headers, invalidBody: true });
    assert.equal(response.status, 401);
    assert.equal(response.body.error, 'exact_internal_bearer_required');
    assert.equal(calls.body, 0); assert.equal(calls.client, 0); assertReadOnly(calls);
  }
  const missing = await run({ env: {}, invalidBody: true });
  assert.equal(missing.response.status, 401); assert.equal(missing.calls.body, 0);
  assert.equal(missing.calls.client, 0);
});

test('DCC-RT-02 claim returns the actual durable reservation and immutable deadlines', async () => {
  const { response, calls } = await run({ body: { action: 'claim', owner: OWNER,
    reservationId: OTHER_RESERVATION, startedAt: '2099-01-01T00:00:00.000Z' },
    claimData: [{ ...claimRow(), unexpected_private_field: 'fixture-unpublished-material' }] });
  assert.equal(response.status, 200);
  assert.equal(response.body.gap, null);
  assert.deepEqual(response.body.context, expectedContext());
  assert.deepEqual(response.body.job, claimRow(), 'existing claim job response remains compatible');
  assert.deepEqual(calls.rpc, [{ name: 'claim_research_deep_job_v1', args: { p_owner: OWNER } }]);
  assert.ok(calls.selects.some(({ table }) => table === TABLE.attempts), 'verify original attempt deadline');
  assert.ok(calls.selects.some(({ table }) => table === TABLE.reservations));
  assert.equal(response.body.policy.maxMinutesPerJob, 30);
  assert.equal(response.body.policy.maxModelMinutesPerTaipeiDay, 120);
});

test('DCC-RT-03 independent SQL timestamps preserve both original deadlines without inventing equality', async () => {
  const rows = fixture();
  const jobDeadline = '2026-10-05T00:30:00.010Z';
  rows[TABLE.jobs][0].lease_expires_at = jobDeadline;
  rows[TABLE.attempts][0].lease_expires_at = jobDeadline;
  rows[TABLE.attempts][0].claimed_at = '2026-10-05T00:00:00.020Z';
  const { response, calls } = await run({ rows, body: { action: 'claim', owner: OWNER },
    claimData: [{ ...claimRow(), lease_expires_at: jobDeadline }] });
  const expected = expectedContext(); expected.job.leaseExpiresAt = jobDeadline;
  assert.equal(response.status, 200); assert.deepEqual(response.body.context, expected);
  assert.equal(calls.rpc.length, 1);
});

test('DCC-RT-04 status recovers the same active claim using only bounded SELECTs', async () => {
  const first = await run();
  const exact = await run({ body: { action: 'status', owner: OWNER, jobId: JOB, attempt: 1 } });
  for (const result of [first, exact]) {
    assert.equal(result.response.status, 200);
    assert.equal(result.response.body.gap, null);
    assert.deepEqual(result.response.body.context, expectedContext());
    assertReadOnly(result.calls);
    const jobs = result.calls.selects.filter(({ table }) => table === TABLE.jobs);
    assert.ok(jobs.length > 0);
    assert.ok(jobs.every(({ filters }) => filters.some(([op, field, value]) =>
      op === 'eq' && field === 'lease_owner' && value === OWNER)));
  }
});

test('DCC-RT-05 author handoff completion is returned as accounting, without claiming another job', async () => {
  const rows = fixture();
  const completion = { outcome: 'completed', resultHash: HASH, completedAt: '2026-10-05T00:05:00.000Z' };
  rows[TABLE.completions].push({ reservation_id: RESERVATION, owner: OWNER,
    outcome: completion.outcome, result_hash: HASH, finished_at: completion.completedAt });
  const { response, calls } = await run({ rows });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.context, expectedContext({ completion }));
  assertReadOnly(calls);
});

test('DCC-RT-06 a finished model remains observable until the distinct job deadline', async () => {
  for (const outcome of ['completed', 'failed']) {
    const rows = fixture();
    const jobDeadline = '2026-10-05T00:30:00.010Z';
    rows[TABLE.jobs][0].lease_expires_at = jobDeadline;
    rows[TABLE.attempts][0].lease_expires_at = jobDeadline;
    rows[TABLE.attempts][0].claimed_at = '2026-10-05T00:00:00.020Z';
    const completion = { outcome, resultHash: HASH, completedAt: '2026-10-05T00:05:00.000Z' };
    rows[TABLE.completions].push({ reservation_id: RESERVATION, owner: OWNER, outcome,
      result_hash: HASH, finished_at: completion.completedAt });
    const { response, calls } = await run({ rows, now: DEADLINE });
    const expected = expectedContext({ completion, observedAt: DEADLINE }); expected.job.leaseExpiresAt = jobDeadline;
    assert.equal(response.status, 200); assert.deepEqual(response.body.context, expected);
    assertReadOnly(calls);
  }
});

test('DCC-RT-07 foreign owner and absent or non-running jobs return no context and never mutate', async () => {
  for (const change of [
    (rows) => { rows[TABLE.jobs] = []; },
    (rows) => { rows[TABLE.jobs][0].lease_owner = 'other-author'; },
    (rows) => { rows[TABLE.jobs][0].status = 'completed'; },
    (rows) => { rows[TABLE.jobs][0].lease_expires_at = NOW; },
  ]) {
    const rows = fixture(); change(rows);
    const { response, calls } = await run({ rows });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true, context: null, gap: 'no_active_owned_job' });
    assertReadOnly(calls);
  }
  for (const selector of [{ jobId: OTHER_JOB, attempt: 1 }, { jobId: JOB, attempt: 2 }]) {
    const { response, calls } = await run({ body: { action: 'status', owner: OWNER, ...selector } });
    assert.equal(response.status, 200); assert.equal(response.body.context, null); assertReadOnly(calls);
  }
});

test('DCC-RT-08 status requires an exact paired job/attempt selector and a valid owner', async () => {
  for (const invalid of [{ jobId: JOB }, { attempt: 1 }, { jobId: 'not-a-uuid', attempt: 1 },
    { jobId: JOB, attempt: 0 }, { jobId: JOB, attempt: 4 }, { jobId: JOB, attempt: 1.5 },
    { jobId: JOB, attempt: '1' }, { owner: 'x' }, { owner: 'owner with spaces' }, { owner: 'a'.repeat(121) }]) {
    const { response, calls } = await run({ body: { action: 'status', owner: OWNER, ...invalid } });
    assert.equal(response.status, 400, JSON.stringify(invalid)); assertReadOnly(calls);
    assert.equal(calls.selects.length, 0);
  }
});

test('DCC-RT-09 original attempt deadline cannot be extended by mutable job state', async () => {
  const rows = fixture(); rows[TABLE.jobs][0].lease_expires_at = '2026-10-05T00:40:00.000Z';
  const { response, calls } = await run({ rows });
  assertUnavailable(response); assertReadOnly(calls);
});

test('DCC-RT-10 invalid reservation clocks fail closed', async () => {
  for (const patch of [
    { started_at: 'not-a-time' }, { started_at: '2026-10-05T00:11:00.000Z' },
    { lease_expires_at: '2026-10-05T00:31:00.000Z' },
  ]) {
    const rows = fixture(); Object.assign(rows[TABLE.reservations][0], patch);
    const { response, calls } = await run({ rows });
    assertUnavailable(response); assertReadOnly(calls);
  }
});

test('DCC-RT-11 an otherwise valid active reservation may not cross Taipei midnight', async () => {
  const rows = fixture();
  const startedAt = '2026-10-05T15:45:00.000Z';
  const deadlineAt = '2026-10-05T16:15:00.000Z';
  rows[TABLE.jobs][0].lease_expires_at = deadlineAt;
  Object.assign(rows[TABLE.attempts][0], { claimed_at: startedAt, lease_expires_at: deadlineAt });
  Object.assign(rows[TABLE.reservations][0], { started_at: startedAt, lease_expires_at: deadlineAt });
  const { response, calls } = await run({ rows, now: '2026-10-05T15:50:00.000Z' });
  assertUnavailable(response); assertReadOnly(calls);
});

test('DCC-RT-12 expired model reservation cannot be recovered as runnable work', async () => {
  const rows = fixture();
  rows[TABLE.jobs][0].lease_expires_at = '2026-10-05T00:30:01.000Z';
  rows[TABLE.attempts][0].lease_expires_at = '2026-10-05T00:30:01.000Z';
  const { response, calls } = await run({ rows, now: DEADLINE });
  assertUnavailable(response); assertReadOnly(calls);
});

test('DCC-RT-13 expiry during database reads never returns an active claim context', async () => {
  const { response, calls } = await run({ afterSelect({ table, setTime }) {
    if (table === TABLE.reservations) setTime(DEADLINE);
  } });
  assertUnavailable(response); assertReadOnly(calls);
});

test('DCC-RT-14 changed live job fence during reads is rejected without modifying the new state', async () => {
  for (const patch of [{ lease_owner: 'new-owner' }, { attempts: 2 }, { status: 'completed' },
    { lease_expires_at: '2026-10-05T00:40:00.000Z' }]) {
    const rows = fixture();
    const { response, calls } = await run({ rows, afterSelect({ table }) {
      if (table === TABLE.reservations) Object.assign(rows[TABLE.jobs][0], patch);
    } });
    assertUnavailable(response); assertReadOnly(calls);
    for (const [key, value] of Object.entries(patch)) assert.equal(rows[TABLE.jobs][0][key], value);
  }
});

test('DCC-RT-15 a claim with no selected job returns null without inventing a reservation', async () => {
  const { response, calls } = await run({ body: { action: 'claim', owner: OWNER }, claimData: [] });
  assert.equal(response.status, 200); assert.equal(response.body.job, null);
  assert.equal(response.body.context, null); assert.equal(calls.rpc.length, 1);
  assert.equal(response.body.gap, 'no_claimable_job');
  assert.equal(calls.selects.length, 0);
});

test('DCC-RT-16 successful claim followed by missing or failed context is uncertain and never retried', async () => {
  for (const option of [
    { errorTable: TABLE.reservations }, { throwTable: TABLE.attempts },
    { rows: { ...fixture(), [TABLE.reservations]: [] } },
    { rows: { ...fixture(), [TABLE.jobs]: [] } },
  ]) {
    const { response, calls } = await run({ body: { action: 'claim', owner: OWNER }, ...option });
    assertUnavailable(response, 'claim');
    assert.equal(response.body.outcome, 'uncertain'); assert.equal(response.body.retryClaim, false);
    assert.deepEqual(calls.rpc.map(({ name }) => name), ['claim_research_deep_job_v1']);
  }
});

test('DCC-RT-17 RPC claim identity must match the reloaded durable job in every field', async () => {
  for (const patch of [{ job_id: OTHER_JOB }, { attempt: 2 }, { symbol: '2454' },
    { priority_run_id: OTHER_JOB }, { lease_expires_at: '2026-10-05T00:31:00.000Z' }]) {
    const { response, calls } = await run({ body: { action: 'claim', owner: OWNER },
      claimData: [{ ...claimRow(), ...patch }] });
    assertUnavailable(response, 'claim');
    assert.equal(response.body.outcome, 'uncertain'); assert.equal(response.body.retryClaim, false);
    assert.deepEqual(calls.rpc.map(({ name }) => name), ['claim_research_deep_job_v1']);
  }
});

test('DCC-RT-18 lost or malformed claim RPC replies are sanitized and never retried automatically', async () => {
  for (const option of [{ rpcThrows: true }, { rpcError: 'fixture-private-database-diagnostic' },
    { claimData: null }, { claimData: claimRow() }, { claimData: [claimRow(), claimRow()] },
    { claimData: [null] }, { claimData: [{ ...claimRow(), attempt: '1' }] }]) {
    const { response, calls } = await run({ body: { action: 'claim', owner: OWNER }, ...option });
    assertUnavailable(response, 'claim');
    assert.equal(response.body.outcome, 'uncertain'); assert.equal(response.body.retryClaim, false);
    assert.deepEqual(calls.rpc.map(({ name }) => name), ['claim_research_deep_job_v1']);
    assert.equal(calls.selects.length, 0);
  }
});

test('DCC-RT-19 status rejects missing, mismatched, duplicate, or unreadable durable context', async () => {
  const changes = [
    (rows) => { rows[TABLE.attempts] = []; },
    (rows) => { rows[TABLE.attempts][0].owner = 'other-author'; },
    (rows) => { rows[TABLE.attempts][0].attempt = 2; },
    (rows) => { rows[TABLE.reservations] = []; },
    (rows) => { rows[TABLE.reservations][0].owner = 'other-author'; },
    (rows) => { rows[TABLE.reservations][0].work_key = `deep:${OTHER_JOB}:1`; },
    (rows) => { rows[TABLE.reservations][0].role = 'counter_review'; },
    (rows) => { rows[TABLE.reservations][0].reservation_id = 'not-a-uuid'; },
    (rows) => { rows[TABLE.reservations].push({ ...rows[TABLE.reservations][0], reservation_id: OTHER_RESERVATION }); },
    (rows) => { rows[TABLE.jobs].push({ ...rows[TABLE.jobs][0], job_id: OTHER_JOB }); },
    (rows) => { rows[TABLE.jobs][0].symbol = '2330<script>'; },
  ];
  for (const change of changes) {
    const rows = fixture(); change(rows);
    const { response, calls } = await run({ rows });
    assertUnavailable(response); assertReadOnly(calls);
  }
  for (const table of [TABLE.jobs, TABLE.attempts, TABLE.reservations, TABLE.completions]) {
    const { response, calls } = await run({ errorTable: table });
    assertUnavailable(response); assertReadOnly(calls);
  }
});

test('DCC-RT-20 completion identity, outcome, hash, and clocks remain bound to the reservation', async () => {
  const valid = { reservation_id: RESERVATION, owner: OWNER, outcome: 'completed', result_hash: HASH,
    finished_at: '2026-10-05T00:05:00.000Z' };
  for (const patch of [{ owner: 'other-author' }, { outcome: 'accepted' }, { result_hash: 'broken' },
    { finished_at: 'invalid-clock' }, { finished_at: '2026-10-04T23:59:59.000Z' },
    { finished_at: '2026-10-05T00:11:00.000Z' }]) {
    const rows = fixture(); rows[TABLE.completions].push({ ...valid, ...patch });
    const { response, calls } = await run({ rows });
    assertUnavailable(response); assertReadOnly(calls);
  }
  const duplicates = fixture(); duplicates[TABLE.completions].push(valid, { ...valid });
  const result = await run({ rows: duplicates });
  assertUnavailable(result.response); assertReadOnly(result.calls);
});

test('DCC-RT-21 existing handoff, finish, and publication retain their authenticated RPC contracts', async () => {
  const scenarios = [
    [{ action: 'handoffModel', owner: OWNER, jobId: JOB, attempt: 1, articleHash: HASH },
      'handoff_research_deep_model_v1', { p_job_id: JOB, p_owner: OWNER, p_attempt: 1, p_article_hash: HASH }],
    [{ action: 'finish', owner: OWNER, jobId: JOB, attempt: 1, success: false, receiptId: null, reason: 'fixture failure' },
      'finish_research_deep_job_v2', { p_job_id: JOB, p_owner: OWNER, p_attempt: 1,
        p_success: false, p_receipt_id: null, p_reason: 'fixture failure' }],
    [{ action: 'finish', owner: OWNER, jobId: JOB, attempt: 1, success: true, receiptId: RECEIPT },
      'finish_research_deep_job_v2', { p_job_id: JOB, p_owner: OWNER, p_attempt: 1,
        p_success: true, p_receipt_id: RECEIPT, p_reason: null }],
    [{ action: 'claimPublication', owner: OWNER, jobId: JOB, attempt: 1,
      revisionId: REVISION, inputHash: HASH, outboxOwner: 'fixture-outbox' },
      'claim_candidate_deep_outbox_v1', { p_deep_job_id: JOB, p_deep_owner: OWNER, p_deep_attempt: 1,
        p_revision_id: REVISION, p_input_hash: HASH, p_outbox_owner: 'fixture-outbox' }],
  ];
  for (const [body, name, args] of scenarios) {
    const { response, calls } = await run({ body });
    assert.equal(response.status, 200); assert.equal(response.body.ok, true);
    assert.deepEqual(calls.rpc, [{ name, args }]); assert.equal(calls.selects.length, 0);
  }
});

const SOURCE_ID = '20000000-0000-4000-8000-000000000001';
const FACT_ID = '20000000-0000-4000-8000-000000000002';
const ROOT_URL = 'https://example.com/company-outlook';
function inputFixture() {
  const rows = fixture();
  rows[TABLE.priority] = [{ run_id: PRIORITY, as_of: START, input_hash: HASH }];
  rows[TABLE.stocks] = [{ id: OTHER_JOB, symbol: '2330' }];
  rows[TABLE.published] = [{ stock_id: OTHER_JOB, detail_revision_id: REVISION, created_at: START }];
  const detail = { id: REVISION, stock_id: OTHER_JOB, stocks: { symbol: '2330', name: 'fixture' },
    as_of: START, available_at: START, fact_ids: [FACT_ID], sections: [{ text: 'DO_NOT_EXPORT_DOSSIER_PROSE' }] };
  const facts = [{ fact_id: FACT_ID, stock_id: OTHER_JOB, fact_key: 'revenue', period_end: '2026-06-30',
    value: 100, unit: 'TWD million', as_of: START, available_at: START, source_url: 'https://example.com/financial',
    provenance: { private_payload: 'DO_NOT_EXPORT_PROVENANCE' } }];
  const hash = candidateDossierInputHash(detail, facts), bundle = candidateDossierBundleId(hash);
  rows[TABLE.bundles] = [{ bundle_id: bundle, revision_id: REVISION, published_revision_id: REVISION,
    input_hash: hash, symbol: '2330', payload: { detail, facts }, queued_at: START }];
  rows[TABLE.documents] = [{ id: SOURCE_ID, platform: 'research_inbox_ptt', document_url: ROOT_URL,
    published_at: START, collected_at: START, symbols: ['2330'], canonical_content_hash: HASH,
    content_semantics: 'editorial_discussion', summary: 'A bounded synthetic outlook summary.',
    content_text: 'DO_NOT_EXPORT_FULL_SOURCE', metadata: { canonical_url: ROOT_URL, content_hash: HASH,
      acquisition_mode: 'local_codex_research_inbox', first_observed_at: START, revision_observed_at: START,
      content_form: 'research_summary', acquisition_method: 'public_document', claim_status: 'rumor',
      visibility: 'public', rights_boundary: 'public_citation', subject_scope: 'company_mentions' } }];
  return { rows, body: { action: 'input', owner: OWNER, jobId: JOB, attempt: 1,
    reservationId: RESERVATION, bundleId: bundle, sourceDocumentIds: [SOURCE_ID] } };
}

test('DAI-01 real input route exports only bounded facts/summary with live reservation and separate cutoffs', async () => {
  const { response, calls } = await run(inputFixture());
  assert.equal(response.status, 200);
  const packet = response.body.packet;
  assert.equal(validateResearchDeepAuthorInput(packet, expectedContext(), NOW), packet);
  assert.equal(packet.dataCutoff, NOW);
  assert.equal(packet.discovery.asOf, START);
  assert.equal(packet.financial.facts[0].value, 100);
  assert.equal(packet.sources[0].claimStatus, 'rumor');
  assert.equal(packet.sources[0].publishable, true);
  assert.deepEqual(packet.gaps, []);
  assert.equal(packet.modelDispatched, false);
  assert.equal(packet.financialForecastComplete, false);
  assert.equal(packet.sourceSelectionComplete, false);
  const { inputHash, ...material } = packet;
  assert.equal(inputHash, researchCanonicalHash(material));
  assert.ok(!JSON.stringify(packet).includes('DO_NOT_EXPORT'));
  assert.ok(calls.selects.every(q => q.columns !== '*' && !q.columns.includes('content_text') && q.limit <= 50));
  assert.deepEqual(calls.rpc.map(c => c.name), ['research_evidence_heads_v1']);
});

test('DAI-02 auth and exact input validation happen before all database access', async () => {
  for (const mutate of [f => f.body.extra = 'bad', f => f.body.sourceDocumentIds = Array(31).fill(SOURCE_ID),
    f => f.body.owner = [OWNER], f => f.body.attempt = '1', f => f.body.bundleId = undefined]) {
    const f = inputFixture(); mutate(f);
    const { response, calls } = await run(f);
    assert.equal(response.status, 400); assert.equal(calls.client, 0);
  }
  const { response, calls } = await run({ ...inputFixture(), headers: {} });
  assert.equal(response.status, 401); assert.equal(calls.client, 0); assert.equal(calls.body, 0);
});

test('DAI-03 wrong reservation and a completed model cannot prepare another dispatch input', async () => {
  for (const change of [f => f.body.reservationId = OTHER_RESERVATION,
    f => f.rows[TABLE.completions].push({ reservation_id: RESERVATION, owner: OWNER,
      outcome: 'completed', result_hash: HASH, finished_at: '2026-10-05T00:05:00.000Z' })]) {
    const f = inputFixture(); change(f);
    const { response, calls } = await run(f);
    assert.equal(response.status, 409);
    assert.ok(!calls.selects.some(q => q.table === TABLE.bundles));
    assert.deepEqual(calls.rpc, []);
  }
});

test('DAI-04 denied, withdrawn, malformed rights, future microsecond and unrelated company stay explicit gaps', async () => {
  const cases = [
    ['denied', d => d.metadata.claim_status = 'denied'],
    ['retracted', d => d.metadata.retracted_at = START],
    ['rights_invalid', d => d.metadata.acquisition_method = ['public_document']],
    ['claim_status_invalid', d => d.metadata.claim_status = ['rumor']],
    ['clock_invalid', d => { d.collected_at = '2026-10-05T00:10:00.000001Z'; d.metadata.revision_observed_at = d.collected_at; }],
    ['company_mismatch', d => d.symbols = ['2409']],
    ['bounded_inbox_summary_required', d => d.summary = 'x'.repeat(601)],
    ['bounded_inbox_summary_required', d => d.summary = 'api_key=synthetic-secret'],
    ['parent_unresolved', d => d.metadata.parent_source_url = 'https://example.com/unread-parent'],
  ];
  for (const [reason, change] of cases) {
    const f = inputFixture(); change(f.rows[TABLE.documents][0]);
    const { response } = await run(f);
    assert.equal(response.status, 200, reason);
    assert.deepEqual(response.body.packet.sources, [], reason);
    assert.ok(response.body.packet.gaps.some(g => g.reason === reason), reason);
  }
});

test('DAI-05 authenticated summary remains internal; industry is context without company/order attribution', async () => {
  const f = inputFixture(); const doc = f.rows[TABLE.documents][0];
  Object.assign(doc.metadata, { visibility: 'authenticated_summary', rights_boundary: 'bounded_summary_only',
    acquisition_method: 'authenticated_browser_summary', timed_excerpts: [], subject_scope: 'industry_context' });
  doc.symbols = [];
  const { response } = await run(f);
  assert.equal(response.status, 200);
  assert.equal(response.body.packet.sources[0].publishable, false);
  assert.equal(response.body.packet.sources[0].companyEvidence, false);
});

test('DAI-06 stale RPC head and equal-clock conflicting sibling cannot slip into author input', async () => {
  const f = inputFixture();
  let result = await run({ ...f, heads: [{ id: SOURCE_ID, headId: OTHER_JOB, superseded: false, retracted: false }] });
  assert.equal(result.response.body.packet.gaps[0].reason, 'source_head_changed');
  f.rows[TABLE.documents].push({ ...structuredClone(f.rows[TABLE.documents][0]), id: OTHER_JOB,
    summary: 'A different summary at the same observation clock.' });
  result = await run(f);
  assert.equal(result.response.body.packet.gaps[0].reason, 'source_conflicting_head');
  assert.deepEqual(result.response.body.packet.sources, []);
});

test('DAI-07 immutable dossier hash, issuer, published identity and clocks are verified', async () => {
  for (const change of [f => f.rows[TABLE.bundles][0].payload.facts[0].value = 900,
    f => f.rows[TABLE.bundles][0].published_revision_id = OTHER_JOB,
    f => f.rows[TABLE.bundles][0].queued_at = '2026-10-05T00:10:00.000001Z',
    f => f.rows[TABLE.priority][0].as_of = DEADLINE,
    f => f.rows[TABLE.stocks][0].symbol = '2409', f => f.rows[TABLE.published] = []]) {
    const f = inputFixture(); change(f);
    const { response } = await run(f); assert.equal(response.status, 409);
    assert.equal(response.body.error, 'research_deep_input_unavailable');
  }
});

test('DAI-08 absent selections are explicit gaps, never a complete financial forecast', async () => {
  const f = inputFixture(); f.body.bundleId = null; f.body.sourceDocumentIds = [];
  const { response } = await run(f);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.packet.gaps.map(g => g.reason), ['dossier_not_selected', 'sources_not_selected']);
  assert.equal(response.body.packet.financial, null);
});

test('DAI-09 ownership changes during preparation invalidate the entire packet', async () => {
  const f = inputFixture();
  const { response } = await run({ ...f, afterSelect: ({ table, rows }) => {
    if (table === TABLE.documents) rows[TABLE.jobs][0].lease_owner = 'fixture-new-owner';
  } });
  assert.equal(response.status, 409); assert.equal(response.body.packet, undefined);
});

test('DAI-10 source read failure cannot be reported as no new sources', async () => {
  const { response } = await run({ ...inputFixture(), errorTable: TABLE.documents });
  assert.equal(response.status, 409); assert.equal(response.body.packet, undefined);
});


test('DAI-11 deadline rejects a stalled source read even when transport ignores cancellation', async () => {
  const began = Date.now();
  const { response } = await run({ ...inputFixture(), timerMax: 20, hangTable: TABLE.documents });
  assert.equal(response.status, 409); assert.equal(response.body.packet, undefined);
  assert.ok(Date.now() - began < 1000);
});


test('DAI-12 fallback revision URLs cannot hide a contradictory same-clock sibling', async () => {
  const f = inputFixture(); const original = f.rows[TABLE.documents][0];
  const sibling = structuredClone(original); sibling.id = OTHER_JOB;
  delete sibling.metadata.canonical_url;
  sibling.document_url = `${ROOT_URL}#si-revision-${HASH.slice(0, 16)}`;
  sibling.summary = 'Conflicting legacy revision summary.';
  f.rows[TABLE.documents].push(sibling);
  const { response } = await run(f);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.packet.sources, []);
  assert.equal(response.body.packet.gaps[0].reason, 'source_conflicting_head');
});

test('DCC-RT observed-only jobs cannot enter the legacy formal context', async () => {
  const rows = fixture();
  rows[TABLE.jobs][0].research_scope = 'research_observed_v1';
  const result = await run({ rows });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.response.body, { ok: true, context: null, gap: 'no_active_owned_job' });
  assertReadOnly(result.calls);
  const claimed = await run({ rows, body: { action: 'claim', owner: OWNER }, claimData: [claimRow()] });
  assertUnavailable(claimed.response, 'claim');
});

test('DAI-13 precise clocks survive packet serialization and reject invalid microsecond sibling ordering', async () => {
  const f = inputFixture(); const original = f.rows[TABLE.documents][0];
  original.published_at = '2026-10-05T00:00:00.000001Z';
  original.metadata.first_observed_at = '2026-10-05T00:00:00.000002Z';
  original.metadata.revision_observed_at = '2026-10-05T00:00:00.000005Z';
  original.collected_at = '2026-10-05T00:00:00.000006Z';
  let result = await run(f);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.body.packet.sources[0].publishedAt, original.published_at);
  assert.equal(result.response.body.packet.sources[0].revisionObservedAt, original.metadata.revision_observed_at);
  validateResearchDeepAuthorInput(result.response.body.packet, expectedContext(), NOW);
  const sibling = structuredClone(original); sibling.id = OTHER_JOB;
  sibling.metadata.first_observed_at = '2026-10-05T00:00:00.000007Z';
  f.rows[TABLE.documents].push(sibling);
  result = await run(f);
  assert.deepEqual(result.response.body.packet.sources, []);
  assert.equal(result.response.body.packet.gaps[0].reason, 'source_conflicting_head');
});

// Input preparation is incomplete, never a model or publication receipt.
test('RIP-HTTP authentication precedes body/client for preparation',async()=>{
 const r=await run({body:{action:'prepareResearchInput'},headers:{authorization:'Bearer wrong'}});
 assert.equal(r.response.status,401);assert.equal(r.calls.body,0);assert.equal(r.calls.client,0);
});
test('RIP-HTTP closed observed preparation delegates to one atomic RPC without claim/reserve',async()=>{
 const body={action:'prepareResearchInput',owner:OWNER,jobId:JOB,attempt:1,reservationId:RESERVATION,bundleId:null,sourceDocumentIds:[],scope:'research_observed_v1',snapshotHash:HASH};
 const r=await run({body});assert.equal(r.response.status,200);assert.equal(r.response.body.dispatchReady,false);assert.deepEqual(r.calls.rpc.map(x=>x.name),['prepare_research_input_v2']);assert.deepEqual(r.calls.selects,[]);
 for(const patch of [{authorId:'self'},{reviewerId:'other'},{verified:true},{scope:'formal_v1'},{bundleId:REVISION},{researchCutoff:NOW},{calculator:'arbitrary'}]){
  const bad=await run({body:{...body,...patch}});assert.equal(bad.response.status,400);assert.equal(bad.calls.client,0);
 }
 const failed=await run({body,rpcError:'private-synthetic-db-error'});assert.equal(failed.response.status,409);assert.equal(failed.response.body.error,'research_input_preparation_unavailable');
});

test('financial supplement auth rejects before body or database construction', async()=>{const {response,calls}=await run({body:{action:'financialSupplement',owner:OWNER},headers:{}});assert.equal(response.status,401);assert.equal(calls.body,0);assert.equal(calls.client,0);});
