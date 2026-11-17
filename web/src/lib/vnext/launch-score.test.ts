import assert from 'node:assert/strict';
import test from 'node:test';
import type { TwEntryAuthorityClient } from '../tw-entry-plan-authority.ts';
import { readLaunchPatterns } from './launch-pattern-read.ts';
import { launchRuleScorePage } from './launch-score-rules.ts';
import { assembleLaunchScore, launchScorePage, LAUNCH_SCORE_POLICY, LAUNCH_SCORE_WEIGHTS,
  scoreLaunchReadEvidence, type LaunchScoreAssemblyInput } from './launch-score.ts';

/** Explicitly invented unverified component numbers, never a point rubric. */
function input(symbol = '2330'): LaunchScoreAssemblyInput {
  const revisions = { price: 'price-1', calendar: 'calendar-1', actions: 'actions-1', shareVolume: 'volume-1', chips: 'chips-1', market: 'market-1' };
  const cutoff = '2026-09-24T12:00:00Z';
  return { policyVersion: LAUNCH_SCORE_POLICY, symbol, cutoff, revisions,
    components: Object.fromEntries(Object.entries(LAUNCH_SCORE_WEIGHTS).map(([name, weight]) => [name,
      { ruleId: `UNVERIFIED-fixture-${name}`, ruleVersion: 'fixture-v1', cutoff, availableAt: '2026-09-24T11:00:00Z',
        operandRevisionIds: Object.values(revisions), points: weight, signalIds: [`fixture-${name}`] }])) as LaunchScoreAssemblyInput['components'],
    relativeStrength63: { ruleId: 'UNVERIFIED-fixture-rs', ruleVersion: 'fixture-v1', cutoff,
      availableAt: '2026-09-24T11:00:00Z', operandRevisionIds: ['price-1'], value: .1 } };
}
const points = (value: LaunchScoreAssemblyInput, name: keyof LaunchScoreAssemblyInput['components'], amount: number | null) => { value.components[name]!.points = amount; };

test('approved25/25/20 technical plus20 chips and10 market sums100 without deriving or approving any points', () => {
  const result = assembleLaunchScore(input());
  assert.equal(result.technicalScore, 70);
  assert.equal(result.totalScore, 100);
  assert.equal(result.availableWeight, 100);
  assert.equal(result.policyVersion, LAUNCH_SCORE_POLICY);
  assert.equal(result.scope, 'unverified_component_arithmetic');
  assert.equal(result.derivationsVerified, false);
  assert.equal(result.rankable, false);
  assert.equal(result.rankingAuthority, false);
  assert.equal(result.publicationAuthority, false);
  assert.equal(result.probability, false);
});

test('known zero retains full available weight and is distinct from missing/null', () => {
  const value = input();
  for (const name of Object.keys(value.components) as Array<keyof typeof value.components>) points(value, name, 0);
  const zero = assembleLaunchScore(value);
  assert.equal(zero.totalScore, 0);
  assert.equal(zero.availableWeight, 100);
  value.components.chips = null;
  const missing = assembleLaunchScore(value);
  assert.equal(missing.totalScore, null);
  assert.equal(missing.confirmedPoints, 0);
  assert.equal(missing.availableWeight, 80);
  assert.equal(missing.components.chips.points, null);
});

test('partial component sums never renormalize and missing technical operands leave technical score unknown', () => {
  const value = input(); value.components.trendRelativeStrength = null;
  const result = assembleLaunchScore(value);
  assert.equal(result.availableWeight, 75);
  assert.equal(result.confirmedPoints, 75);
  assert.equal(result.confirmedTechnicalPoints, 45);
  assert.equal(result.technicalScore, null);
  assert.equal(result.totalScore, null);
});

test('component provenance is copied and exact cutoff/source references are mandatory', () => {
  const value = input(), before = structuredClone(value);
  const result = assembleLaunchScore(value);
  value.components.chips!.operandRevisionIds[0] = 'changed';
  assert.deepEqual(result.assemblyInput, before);
  for (const mode of ['cutoff', 'source', 'rule'] as const) {
    const altered = input();
    if (mode === 'cutoff') altered.components.chips!.cutoff = '2026-09-24T11:59:59Z';
    if (mode === 'source') altered.components.chips!.operandRevisionIds = ['unbound-source'];
    if (mode === 'rule') altered.components.chips!.ruleId = '';
    assert.throws(() => assembleLaunchScore(altered), /contract_invalid/u, mode);
  }
});

test('microsecond-late derivation remains null with missing weight and explicit knowledge gap', () => {
  const value = input(); value.components.market!.availableAt = '2026-09-24T12:00:00.000001Z';
  const result = assembleLaunchScore(value);
  assert.equal(result.components.market.points, null);
  assert.equal(result.availableWeight, 90);
  assert.equal(result.totalScore, null);
  assert.ok(result.gaps.includes('market_derivation_unavailable_at_cutoff'));
});

test('overpoints, nonfinite values, negative points and declared overlapping signals fail closed', () => {
  for (const amount of [20.01, -1, NaN, Infinity]) {
    const value = input(); points(value, 'chips', amount);
    assert.throws(() => assembleLaunchScore(value), /contract_invalid/u);
  }
  const overlap = input(); overlap.components.breakoutHold!.signalIds = ['fixture-consolidation'];
  assert.throws(() => assembleLaunchScore(overlap), /contract_invalid/u);
  const callerApproval = input(); Object.assign(callerApproval.components.chips!, { reviewed: true });
  assert.throws(() => assembleLaunchScore(callerApproval), /contract_invalid/u);
  const numericSymbol = input(); Object.assign(numericSymbol, { symbol: 2330 });
  assert.throws(() => assembleLaunchScore(numericSymbol), /contract_invalid/u);
});

test('bounded presentation handles0/1/10/>10 records with stable pages and no official ranks', () => {
  assert.equal(launchScorePage([]).items.length, 0);
  assert.equal(launchScorePage([input()]).items.length, 1);
  const ten = Array.from({ length: 10 }, (_, i) => input(String(2000 + i)));
  assert.equal(launchScorePage(ten).items.length, 10);
  const eleven = [...ten, input('2010')].reverse();
  const first = launchScorePage(eleven), second = launchScorePage([...eleven].reverse(), { cursor: first.nextCursor! });
  assert.equal(first.items.length, 10); assert.equal(second.items.length, 1);
  assert.equal(first.snapshotHash, second.snapshotHash);
  assert.equal(new Set([...first.items, ...second.items].map(row => row.symbol)).size, 11);
  assert.equal(first.rankingAuthority, false);
});

test('known sort operands use total, then technical, then63RS, then symbol', () => {
  const overall = input('3000'), technical = input('3001'), rs = input('3002'), symbol = input('3003');
  points(overall, 'market', 9); //99 total, first regardless of other tie keys.
  points(technical, 'market', 8); //98 total, technical70 beats technical68.
  points(rs, 'breakoutHold', 18); //98 total, technical68.
  points(symbol, 'breakoutHold', 18);
  rs.relativeStrength63!.value = .2;
  symbol.relativeStrength63!.value = .1;
  assert.deepEqual(launchScorePage([symbol, rs, technical, overall]).items.map(row => row.symbol), ['3000', '3001', '3002', '3003']);
  symbol.relativeStrength63!.value = .2;
  assert.deepEqual(launchScorePage([symbol, rs]).items.map(row => row.symbol), ['3002', '3003']);
});

test('unknown requiredRS tie key is explicitly unresolved, never zero or a ranked symbol fallback', () => {
  const known = input('3002'), unknown = input('3001'), third = input('3000');
  unknown.relativeStrength63 = null; third.relativeStrength63!.value = -.1;
  const result = launchScorePage([known, unknown, third]);
  assert.equal(result.orderingStatus, 'unknown_relative_strength_tie_presentation_only');
  assert.deepEqual(result.unresolvedTieSymbols, ['3000', '3001', '3002']);
  assert.deepEqual(result.items.map(row => row.symbol), ['3000', '3001', '3002']);
  assert.equal(result.items[1].relativeStrength63, null);
  assert.deepEqual(launchScorePage([third, known, unknown]).items, result.items);
});

test('unknown totals retain explicit incomplete ordering and missingRS need not resolve a nontie', () => {
  const a = input('3000'), b = input('3001');
  a.components.market = null; b.relativeStrength63 = null;
  const result = launchScorePage([a, b]);
  assert.equal(result.orderingStatus, 'incomplete_scores_presentation_only');
  assert.equal(result.items[0].symbol, '3001');
  assert.equal(result.items[1].totalScore, null);
  assert.deepEqual(result.unresolvedTieSymbols, []);
});

test('duplicate/oversized/mixed-policy/mixed-cutoff pages and stale cursors are rejected', () => {
  assert.throws(() => launchScorePage([input(), input()]), /contract_invalid/u);
  assert.throws(() => launchScorePage(Array.from({ length: 21 }, (_, i) => input(String(2000 + i)))), /contract_invalid/u);
  const mixed = input('2331'); mixed.policyVersion = 'old-policy' as typeof LAUNCH_SCORE_POLICY;
  assert.throws(() => launchScorePage([input(), mixed]), /contract_invalid/u);
  const late = input('2331'); late.cutoff = '2026-09-25T12:00:00Z';
  assert.throws(() => launchScorePage([input(), late]), /contract_invalid/u);
  const values = [input('2330'), input('2331')], first = launchScorePage(values, { limit: 1 });
  points(values[1], 'market', 0);
  assert.throws(() => launchScorePage(values, { cursor: first.nextCursor! }), /contract_invalid/u);
  assert.throws(() => launchScorePage([], { limit: 11 }), /contract_invalid/u);
});

test('actual selected-read failure still composes into score and stable presentation without fabricating chips or points', async () => {
  const reads: string[] = [];
  const query = { select() { return this; }, eq() { return this; }, gte() { return this; }, lte() { return this; },
    order() { return this; }, range() { return Promise.resolve({ data: [], error: null }); } };
  const client = { from(table: string) { reads.push(table); return query; } } as unknown as TwEntryAuthorityClient;
  const result = await readLaunchPatterns(client, { stockId: '00000000-0000-4000-8000-000000009999', symbol: '2330', exchange: 'TWSE',
    signalSession: '2026-09-24', cutoff: '2026-09-24T12:00:00Z' });
  assert.deepEqual(reads, ['tw_trading_sessions_v3']);
  assert.equal(result.launchScore.totalScore, null);
  assert.equal(result.launchScore.availableWeight, 0);
  assert.equal(result.launchScore.confirmedPoints, 0);
  assert.equal(result.launchScore.observations?.chips, null);
  assert.equal(result.launchScore.observations?.market, null);
  assert.equal(result.launchScore.rankable, false);
  assert.ok(result.launchScore.gaps.includes('official_calendar_history_missing'));
  const page = launchRuleScorePage([result.launchScore]);
  assert.equal(page.items[0].totalScore, null);
  assert.equal(page.orderingStatus, 'incomplete_scores_presentation_only');
  const mismatched = scoreLaunchReadEvidence({ symbol: '2330', exchange: 'TWSE', signalSession: '2026-09-24', cutoff: '2026-09-24T12:00:00Z' },
    { evidence: result.evidence, arithmetic: { ...result.arithmetic, sourceDatasetRevision: 'different-price-revision' } });
  assert.equal(mismatched.bindingValid, false);
  assert.equal(mismatched.observations, null);
  assert.ok(mismatched.gaps.includes('selected_read_score_revision_or_cutoff_mismatch'));
});
