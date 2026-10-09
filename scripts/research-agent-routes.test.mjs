import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import { researchCanonicalHash, createTechnicalDecisionSnapshot } from '../web/src/lib/research-agent-qualification.ts';
import { loadMonitorBenchmarkContext, MONITOR_BENCHMARK_VERSION } from '../web/src/lib/research-monitor-benchmark-context.ts';
import { loadResearchExecutionContext } from '../web/src/lib/research-execution-context.ts';
import { RESEARCH_STRATEGY_RELEASE } from '../web/src/lib/research-strategy-release.generated.ts';
import { PAPER_RISK_POLICY_HASH } from '../web/src/lib/research-paper-books.ts';

// Run the actual route up to its authority boundary, with deterministic clock
// and acquisition completion. This catches ordering regressions across awaits.
async function captureTechnicalCutoff(historical) {
  let now = Date.parse('2026-09-30T10:00:00.000Z');
  let acquiredAt;
  let captured;
  const source = fs.readFileSync(new URL('../web/src/app/api/internal/research-technical-snapshot/route.ts', import.meta.url), 'utf8');
  const rows = {
    stocks: { id: 'stock', symbol: '2409' },
    stock_instruments_v3: [{ exchange: 'TWSE' }],
    tw_trading_sessions_v3: [{ session_id: '2026-09-30', close_at: '2026-09-30T05:30:00Z' }],
    candidate_thesis_qualifications_v1: { payload: { symbol: '2409', status: 'qualified', articleHash: 'hash',
      reviewReceiptHash: 'review', articleRevisionId: 'article' }, status: 'qualified', article_hash: 'hash', review_receipt_hash: 'review' },
    candidate_research_dossiers: { content: { deepResearch: { sourceDocumentIds: ['source'] } } },
  };
  const db = { rpc: async () => ({ data: [{ exchange: 'TWSE', symbol: '2409', instrument_type: 'common_stock',
    listing_status: 'active' }], error: null }), from(table) {
    const result = { data: rows[table], error: null };
    const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject), maybeSingle: async () => result };
    for (const method of ['select', 'eq', 'lte', 'or', 'order', 'limit']) query[method] = () => query;
    return query;
  } };
  const deps = {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/internal-auth': { requireExactInternalBearer: () => true },
    '@/lib/supabase-server': { getSupabaseServerClient: () => db },
    '@/lib/tw-entry-plan-authority': {
      acquireTwEntryForwardCalendar: async () => { now += 100; acquiredAt = new Date(now).toISOString(); return { availableAt: acquiredAt }; },
      loadTwEntryPlanAuthority: async (_db, input) => { captured = input; throw new Error('test_stop_after_authority_boundary'); },
    },
    '@/lib/research-agent-qualification': { researchCanonicalHash: () => 'hash' },
    '@/lib/research-deep-evidence': { loadDeepArticleEvidence: async () => [{ publicCitation: true, retracted: false }] },
    '@/lib/tw-entry-plan': {}, '@/lib/technical-features-v2': {}, '@/lib/tw-entry-plan-contract': {}, '@/lib/research-weekly-bars': {},
    '@/lib/research-execution-context': {},
    '@/lib/research-monitor-benchmark-context': {},
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: (name) => { assert.ok(name in deps, name); return deps[name]; }, Date: Clock });
  await exports.POST({ json: async () => ({ symbol: '2409', ...(historical ? { observedAt: historical } : {}) }) });
  assert.ok(captured, 'actual route must reach the authority boundary');
  return { captured, acquiredAt };
}

test('live technical snapshot freezes cutoff after the official calendar acquisition', async () => {
  const { captured, acquiredAt } = await captureTechnicalCutoff();
  assert.ok(Date.parse(captured.cutoff) >= Date.parse(acquiredAt));
});
test('historical cutoff is not moved to admit calendar evidence first observed later', async () => {
  const historical = '2026-09-29T10:00:00Z';
  const { captured, acquiredAt } = await captureTechnicalCutoff(historical);
  assert.equal(captured.cutoff, historical);
  assert.ok(Date.parse(captured.cutoff) < Date.parse(acquiredAt));
});

// The actual route, benchmark adapter, execution approval reader and decision
// qualification run together. Only transport/storage and unrelated price-plan
// calculations are fixtures; this is not a PostgreSQL/HTTP acceptance claim.
function technicalSnapshotFixture() {
  const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const sessions = [];
  for (let day = Date.parse('2025-10-01T00:00:00Z'); sessions.length < 240; day += 86400000) {
    const date = new Date(day);
    if (![0, 6].includes(date.getUTCDay())) sessions.push(date.toISOString().slice(0, 10));
  }
  const signalSession = sessions.at(-1), cutoff = `${signalSession}T10:00:00.000Z`;
  const bars = sessions.map((session, i) => ({ session, open: 100 + i, high: 101 + i, low: 99 + i,
    close: 100 + i, volume: 1000000, availableAt: `${session}T06:02:00Z`, sourceRef: 'a'.repeat(64) }));
  const authority = { bars, missingData: [], sourceDatasetRevision: 'synthetic-adjusted240', availableAt: cutoff,
    priceBasis: { kind: 'adjusted_to_signal_session', anchorSession: signalSession,
      adjustmentVersion: 'synthetic-v1', adjustmentEvidenceHash: 'b'.repeat(64), status: 'verified' },
    calendar: { version: 'synthetic-calendar', knownAt: cutoff, completedSessions: sessions, signalSession,
      signalCloseAt: `${signalSession}T05:30:00Z`, nextSession: '2026-12-01',
      nextOpenAt: '2026-12-01T01:00:00Z', nextCloseAt: '2026-12-01T05:30:00Z' } };
  const calendar = sessions.slice(-61).map((session, i) => ({ session_authority_id: uuid(i + 1),
    session_id: session, market: 'TWSE', provider: 'twse', status: 'completed', open_at: `${session}T01:00:00Z`,
    close_at: `${session}T05:30:00Z`, source_timestamp: `${session}T06:00:00Z`,
    collected_at: `${session}T06:01:00Z`, recorded_at: `${session}T06:02:00Z`, source_ref: 'synthetic-calendar' }));
  const market = calendar.map((row, i) => ({ observation_id: uuid(1000 + i), fact_key: 'taiex_close',
    scope_key: 'TAIEX', session_id: row.session_id, session_authority_id: row.session_authority_id,
    value: 500 + i, unit: 'index_points', provider: 'twse', provider_identity: null,
    authority_date: row.session_id, provider_session_date: null, observed_at: `${row.session_id}T06:00:00Z`,
    collected_at: `${row.session_id}T06:01:00Z`, recorded_at: `${row.session_id}T06:02:00Z`,
    source_ref: 'synthetic-index', provider_revision: 'synthetic-v1' }));
  const content = { deepResearch: { sourceDocumentIds: ['source'] } };
  const thesis = { symbol: '2409', thesisRevisionId: 'thesis', articleRevisionId: 'article',
    articleHash: researchCanonicalHash(content), evidenceSnapshotHash: 'c'.repeat(64), reviewReceiptHash: 'd'.repeat(64),
    policyVersion: 'thesis-qualification-v1', status: 'qualified', horizon: '1-3m', support: ['synthetic'],
    counterEvidence: [], invalidationConditions: ['synthetic'], materialEventIds: [],
    qualifiedAt: `${signalSession}T09:00:00Z`, nextReviewAt: '2026-12-01T00:00:00Z' };
  // A structurally valid synthetic approval for the exact pre-increment code.
  // It is never installed in a real database or presented as user approval.
  const oldCodeHash = '4ff97130999ee66808e05d1a253cece453141bc704c8050a581b955f4205e664';
  const oldMaterial = { schemaVersion: 'strategy-user-approval-v1', proposalHash: 'e'.repeat(64),
    assessmentHash: 'f'.repeat(64), independentValidationHash: 'a'.repeat(64), codeHash: oldCodeHash,
    parameterHashes: [RESEARCH_STRATEGY_RELEASE.parameterHash], riskPolicyHash: PAPER_RISK_POLICY_HASH,
    approvedBy: 'synthetic-fixture-only', approvedAt: `${signalSession}T00:00:00Z`, effectiveFrom: `${signalSession}T01:00:00Z` };
  const approval = { ...oldMaterial, receiptHash: researchCanonicalHash(oldMaterial) };
  const saved = [], reads = [], queriedApprovalHashes = [];
  const tables = {
    stocks: [{ id: 'stock', symbol: '2409', market: 'TW' }], tw_trading_sessions_v3: calendar,
    opportunity_market_observations_v3: market,
    candidate_thesis_qualifications_v1: [{ id: 'qualification', stock_id: 'stock', payload: thesis,
      status: thesis.status, article_hash: thesis.articleHash, review_receipt_hash: thesis.reviewReceiptHash,
      qualified_at: thesis.qualifiedAt, created_at: thesis.qualifiedAt }],
    candidate_research_dossiers: [{ id: 'article', content }],
    research_paper_book_revisions_v1: ['conservative', 'growth'].map((book_id) => ({ book_id,
      revision_hash: researchCanonicalHash(book_id), available_at: `${signalSession}T00:00:00Z`,
      state: { positions: book_id === 'conservative' ? [{ symbol: '2409', strategyVersion: 'original-held-version' }] : [] } })),
    research_strategy_records_v1: [{ kind: 'approval', record_hash: approval.receiptHash, payload: approval,
      available_at: `${signalSession}T01:00:00Z` }],
    opportunity_price_observations_v3: bars.slice(-20).map((bar, i) => ({ observation_id: uuid(2000 + i),
      stock_id: 'stock', exchange: 'TWSE', session_id: bar.session, raw_low: bar.low, volume: bar.volume, provider: 'twse',
      source_timestamp: `${bar.session}T06:00:00Z`, collected_at: `${bar.session}T06:01:00Z`, recorded_at: `${bar.session}T06:02:00Z` })),
    candidate_technical_decisions_v1: saved,
  };
  const db = { async rpc(name) {
    reads.push(name);
    return { error: null, data: name === 'research_execution_policy_matches_v1' ? true
      : [{ exchange: 'TWSE', symbol: '2409', instrument_type: 'common_stock', listing_status: 'active' }] };
  }, from(table) {
    reads.push(table);
    const filters = [], orders = []; let start = 0, end = Infinity, inserted;
    const value = (row, key) => key === 'payload->>codeHash' ? row.payload.codeHash : row[key];
    const result = (single = false) => {
      if (inserted) {
        if (saved.some((row) => row.decision_input_hash === inserted.decision_input_hash))
          return { error: { code: '23505' }, data: null };
        const row = { ...inserted, id: uuid(10000 + saved.length) }; saved.push(row);
        return { error: null, data: row };
      }
      const rows = tables[table].filter((row) => filters.every((filter) => filter(row))).sort((a, b) => {
        for (const [key, asc] of orders) if (value(a, key) !== value(b, key))
          return (value(a, key) < value(b, key) ? -1 : 1) * (asc ? 1 : -1);
        return 0;
      });
      const data = rows.slice(start, end + 1);
      return { error: null, data: single ? data[0] || null : data, count: rows.length };
    };
    const query = { select() { return query; }, insert(row) { inserted = row; return query; },
      eq(key, expected) {
        if (table === 'research_strategy_records_v1' && key === 'payload->>codeHash') queriedApprovalHashes.push(expected);
        filters.push((row) => value(row, key) === expected); return query;
      }, in(key, values) { filters.push((row) => values.includes(value(row, key))); return query; },
      lte(key, cutoff) { filters.push((row) => Date.parse(value(row, key)) <= Date.parse(cutoff)); return query; },
      order(key, config) { orders.push([key, config?.ascending !== false]); return query; },
      limit(count) { end = count - 1; return query; }, range(from, to) { start = from; end = to; return query; },
      abortSignal() { return query; }, single: async () => result(true), maybeSingle: async () => result(true),
      then: (yes, no) => Promise.resolve(result()).then(yes, no) };
    return query;
  } };
  const deps = {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/internal-auth': { requireExactInternalBearer: (request) => request.headers.get('authorization') === 'Bearer fixture-only' },
    '@/lib/supabase-server': { getSupabaseServerClient: () => db },
    '@/lib/tw-entry-plan-authority': { acquireTwEntryForwardCalendar: async () => null,
      loadTwEntryPlanAuthority: async () => authority },
    '@/lib/research-agent-qualification': { researchCanonicalHash, createTechnicalDecisionSnapshot },
    '@/lib/research-deep-evidence': { loadDeepArticleEvidence: async () => [{ publicCitation: true, retracted: false }] },
    '@/lib/tw-entry-plan': { buildTwEntryPlans: () => ({ missingData: [], plans: [{ rawSignalState: 'confirmed' }] }) },
    '@/lib/technical-features-v2': { calculateTechnicalFeatures: () => ({ close: 339, atr14: 1 }), TECHNICAL_FEATURE_RULESET_VERSION: 'synthetic-feature' },
    '@/lib/tw-entry-plan-contract': { TW_ENTRY_PLAN_RULESET: 'synthetic-plan' },
    '@/lib/research-weekly-bars': { aggregateOfficialWeeklyBars: () => [], WEEKLY_AGGREGATION_VERSION: 'synthetic-weekly' },
    '@/lib/research-execution-context': { loadResearchExecutionContext },
    '@/lib/research-monitor-benchmark-context': { loadMonitorBenchmarkContext, MONITOR_BENCHMARK_VERSION },
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [cutoff])); } static now() { return Date.parse(cutoff); } }
  const exports = {};
  const source = fs.readFileSync(new URL('../web/src/app/api/internal/research-technical-snapshot/route.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Date: Clock,
    require: (name) => { assert.ok(name in deps, name); return deps[name]; } });
  const call = (authorized = true) => exports.POST({ headers: new Headers(authorized ? { authorization: 'Bearer fixture-only' } : {}),
    json: async () => ({ symbol: '2409', observedAt: cutoff }) });
  return { call, saved, reads, market, calendar, queriedApprovalHashes, oldCodeHash };
}

test('actual snapshot saves benchmark and correction hash; prior approval cannot authorize new code', async () => {
  const fixture = technicalSnapshotFixture(), first = await fixture.call();
  assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.body.benchmarkContext.available, true);
  assert.deepEqual(fixture.saved[0].snapshot.benchmarkContext, first.body.benchmarkContext);
  assert.equal(fixture.saved[0].snapshot.execution.approval, null);
  assert.notEqual(RESEARCH_STRATEGY_RELEASE.codeHash, fixture.oldCodeHash);
  assert.ok(fixture.queriedApprovalHashes.every((hash) => hash === RESEARCH_STRATEGY_RELEASE.codeHash));
  assert.equal(first.body.decision.entryResearchEligible, false);
  assert.ok(first.body.decision.blockers.includes('strategy_version_not_approved'));
  assert.equal(first.body.decision.monitorExistingPosition, true);
  assert.equal(first.body.decision.signalState, 'confirmed', 'raw fixture signal does not become executable');
  const replay = await fixture.call();
  assert.equal(replay.status, 200); assert.equal(replay.body.idempotentReplay, true);
  assert.equal(replay.body.snapshotId, first.body.snapshotId); assert.equal(fixture.saved.length, 1);
  fixture.market.push({ ...fixture.market[0], observation_id: '00000000-0000-4000-8000-000000099999',
    value: 550, recorded_at: `${fixture.market[0].session_id}T07:00:00Z`, provider_revision: 'synthetic-correction' });
  const corrected = await fixture.call(); assert.equal(corrected.status, 200);
  assert.notEqual(corrected.body.benchmarkContext.contextHash, first.body.benchmarkContext.contextHash);
  assert.notEqual(fixture.saved[0].decision_input_hash, fixture.saved[1].decision_input_hash);
  assert.equal(corrected.body.decision.entryResearchEligible, false);
});

test('missing benchmark is persisted explicitly without altering price-only or held monitoring semantics', async () => {
  const fixture = technicalSnapshotFixture(); fixture.market.shift();
  const result = await fixture.call(); assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.benchmarkContext.available, false);
  assert.equal(result.body.benchmarkContext.returns[5], null);
  assert.ok(result.body.benchmarkContext.missingData.includes('benchmark_market_incomplete'));
  assert.equal(fixture.saved[0].snapshot.benchmarkContext.contextHash, result.body.benchmarkContext.contextHash);
  assert.equal(result.body.decision.signalState, 'confirmed');
  assert.equal(result.body.decision.monitorExistingPosition, true);
  assert.equal(result.body.decision.entryResearchEligible, false);
});

test('actual snapshot refuses missing exact auth before any fixture database access', async () => {
  const fixture = technicalSnapshotFixture(), result = await fixture.call(false);
  assert.equal(result.status, 401); assert.equal(fixture.reads.length, 0); assert.equal(fixture.saved.length, 0);
});
