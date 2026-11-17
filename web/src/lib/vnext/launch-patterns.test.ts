import assert from 'node:assert/strict';
import test from 'node:test';
import { wilderAtr } from '../technical-indicator-adapter.ts';
import { launchPatternFixture, type LaunchPatternFixture } from './launch-patterns.ts';

/** Invented ledger and prices; date arithmetic creates fixture labels only.
 * These rows never establish any actual exchange session/source authority. */
function fixture(count = 240): LaunchPatternFixture {
  const dates = Array.from({ length: count }, (_, index) => new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10));
  const latest = dates.at(-1)!;
  const sourceDatasetRevision = 'offline-selected-price-revision-1';
  return {
    cutoff: `${latest}T21:30:00+08:00`, market: 'TWSE',
    history: {
      notEntryAuthority: true, nextSessionAuthority: false, completedSessions: dates,
      bars: dates.map((session, index) => ({ session, open: 95, high: 100, low: 90, close: 95, volume: 100,
        sourceRef: `fixture-price-${index}`, observationId: `fixture-observation-${index}`, rawClose: 95,
        sourceTimestamp: `${session}T14:00:00+08:00`, recordedAt: `${session}T14:01:00+08:00`,
        availableAt: `${session}T14:02:00+08:00`, sourceUrl: 'https://www.twse.com.tw/' })),
      priceBasis: { status: 'verified', kind: 'adjusted_to_signal_session', anchorSession: latest,
        adjustmentVersion: 'offline-adjustment-1', adjustmentEvidenceHash: 'a'.repeat(64) },
      sourceDatasetRevision, availableAt: `${latest}T14:02:00+08:00`, missingData: [],
    },
    calendar: { completeness: 'complete_fixture', revisionId: 'offline-calendar-revision-1',
      availableAt: `${latest}T14:00:00+08:00`, sessions: dates.map(session => ({ session, closeAt: `${session}T13:30:00+08:00` })) },
    volumeBasis: { status: 'comparable_fixture', revisionId: 'offline-share-volume-1',
      sourceDatasetRevision, availableAt: `${latest}T14:02:00+08:00`, fromSession: dates[0], throughSession: latest },
    benchmark: { market: 'TWSE', revisionId: 'offline-benchmark-1', availableAt: `${latest}T14:02:00+08:00`,
      points: dates.map((session, index) => ({ session, close: 1000 + index, availableAt: `${session}T14:00:00+08:00` })) },
    officialLimit: { market: 'TWSE', session: latest, revisionId: 'offline-official-limit-1',
      availableAt: `${latest}T14:02:00+08:00`, upperLimit: 104.5, onePriceLocked: false },
  };
}
function price(input: LaunchPatternFixture, index: number, close: number, extra: Partial<LaunchPatternFixture['history']['bars'][number]> = {}) {
  Object.assign(input.history.bars[index], { open: close, high: close, low: close, close, rawClose: close }, extra);
}
function breakoutFixture(after = 5) {
  const input = fixture(240);
  const index = input.history.bars.length - 1 - after;
  price(input, index, 105, { volume: 140 });
  for (let i = index + 1; i < input.history.bars.length; i++) price(input, i, 102, { low: 99 });
  input.originalBreakout = { session: input.history.bars[index].session, level: 100,
    revisionId: 'offline-original-breakout-1', availableAt: input.history.bars[index].availableAt,
    priceScale: 'unchanged_fixture', comparedSourceDatasetRevision: input.history.sourceDatasetRevision };
  return input;
}

test('offline observations remain disconnected and never claim 52-week/all-time authority or resolved scoring rules', () => {
  const result = launchPatternFixture(fixture());
  assert.equal(result.scope, 'offline_fixture_only');
  assert.equal(result.activation, 'not_connected');
  assert.equal(result.rankingAuthority, false);
  assert.equal(result.sourceAuthority, false);
  assert.equal(result.publicationAuthority, false);
  assert.equal(result.high.scope, 'known_supplied_period_only');
  assert.equal(result.high.is52WeekHigh, null);
  assert.equal(result.high.isAllTimeHigh, null);
  assert.equal(result.trend.longMaSlope, null);
  assert.equal(result.trend.returns63.relativeStrength, null);
  assert.equal(result.holdsOriginalBreakout, null);
});

test('consolidation depth15% and distance5% are inclusive and exclude the current range', () => {
  const input = fixture();
  for (const bar of input.history.bars.slice(-26, -1)) Object.assign(bar, { low: 85 });
  price(input, 239, 95, { high: 150, low: 10 });
  const result = launchPatternFixture(input);
  assert.deepEqual(result.consolidation, { prior25High: 100, prior25Low: 85, rangeDepth: 0.15, distanceFromHigh: 0.05, matches: true });
  input.history.bars[238].low = 84.99;
  assert.equal(launchPatternFixture(input).consolidation.matches, false);
  input.history.bars[238].low = 85;
  price(input, 239, 94.99);
  assert.equal(launchPatternFixture(input).consolidation.matches, false);
  price(input, 239, 105);
  assert.equal(launchPatternFixture(input).consolidation.matches, true);
  price(input, 239, 105.01);
  assert.equal(launchPatternFixture(input).consolidation.matches, false);
  price(input, 239, 200);
  assert.equal(launchPatternFixture(input).consolidation.matches, false);
});

test('breakout close is strict, volume1.4 inclusive, and current volume/high never enter prior25/50 baselines', () => {
  const input = fixture();
  price(input, 239, 101, { high: 130, volume: 140 });
  assert.deepEqual(launchPatternFixture(input).breakout, { prior25High: 100, prior50MeanVolume: 100, volumeRatio: 1.4, matches: true });
  price(input, 239, 100, { volume: 140 });
  assert.equal(launchPatternFixture(input).breakout.matches, false);
  price(input, 239, 101, { volume: 139.99 });
  assert.equal(launchPatternFixture(input).breakout.matches, false);
});

test('volume contraction uses disjoint recent5 including current and preceding20 excluding recent5', () => {
  const input = fixture();
  for (const bar of input.history.bars.slice(-5)) bar.volume = 80;
  let result = launchPatternFixture(input);
  assert.equal(result.contraction.recent5MeanVolume, 80);
  assert.equal(result.contraction.previous20MeanVolume, 100);
  assert.equal(result.contraction.volumeContractionRatio, 0.8);
  input.history.bars[239].volume = 85;
  result = launchPatternFixture(input);
  assert.equal(result.contraction.previous20MeanVolume, 100);
  assert.equal(result.contraction.volumeContractionRatio, 0.81);
});

test('prior ATR5/20 reuses Wilder seed/recurrence and excludes a current-day range spike', () => {
  const input = fixture();
  for (let i = 234; i <= 238; i++) price(input, i, 95, { high: 96, low: 94 });
  const expected = input.history.bars.slice(0, -1);
  price(input, 239, 95, { high: 200, low: 1 });
  const result = launchPatternFixture(input);
  assert.equal(result.contraction.atr5, wilderAtr(expected, 5));
  assert.equal(result.contraction.atr20, wilderAtr(expected, 20));
  assert.equal(result.contraction.atrThroughSession, input.history.bars[238].session);
  assert.equal(result.contraction.matches, false); // volume ratio is1, above0.8
});

test('all required contraction components must satisfy0.8 together', () => {
  const input = fixture();
  for (let i = 229; i <= 238; i++) price(input, i, 95, { high: 96, low: 94 });
  for (const bar of input.history.bars.slice(-5)) bar.volume = 80;
  assert.equal(launchPatternFixture(input).contraction.matches, true);
  input.history.bars[239].volume = 81;
  assert.equal(launchPatternFixture(input).contraction.matches, false);
});

test('fixed original breakout reports distinct close/low observations through official session5', () => {
  const input = breakoutFixture(5);
  const result = launchPatternFixture(input);
  assert.deepEqual(result.originalBreakout, { session: input.originalBreakout!.session, level: 100,
    sessionsSince: 5, closesAtOrAboveLevel: true, lowsAtOrAboveLevel: false });
  assert.equal(result.holdsOriginalBreakout, null);
  assert.equal(launchPatternFixture(breakoutFixture(1)).originalBreakout?.sessionsSince, 1);
  assert.equal(launchPatternFixture(breakoutFixture(0)).originalBreakout?.closesAtOrAboveLevel, null);
  assert.equal(launchPatternFixture(breakoutFixture(6)).originalBreakout?.closesAtOrAboveLevel, null);
});

test('a failed follow-up cannot reset its fixed level to a later high or a later breakout', () => {
  const input = breakoutFixture(5);
  price(input, 236, 99);
  price(input, 239, 120, { volume: 200 });
  const result = launchPatternFixture(input);
  assert.equal(result.originalBreakout?.level, 100);
  assert.equal(result.originalBreakout?.session, input.originalBreakout!.session);
  assert.equal(result.originalBreakout?.closesAtOrAboveLevel, false);
  assert.equal(result.waiting.breakoutOverheated, true);
});

test('unproven original event, changed scale or revised source cannot manufacture a held breakout', () => {
  for (const change of ['level', 'scale', 'revision', 'volume', 'time'] as const) {
    const input = breakoutFixture();
    if (change === 'level') input.originalBreakout!.level = 99;
    if (change === 'scale') input.originalBreakout!.priceScale = 'unknown';
    if (change === 'revision') input.originalBreakout!.comparedSourceDatasetRevision = 'later-revision';
    if (change === 'volume') input.history.bars[234].volume = 139;
    if (change === 'time') input.originalBreakout!.availableAt = '2026-01-01T00:00:00Z';
    assert.equal(launchPatternFixture(input).originalBreakout, null, change);
  }
});

test('waiting is strict at10%, preserves fixed original level, and grants no exclusion authority', () => {
  const input = breakoutFixture();
  price(input, 239, 110);
  let result = launchPatternFixture(input);
  assert.equal(result.waiting.breakoutOverheated, false);
  price(input, 239, 110.01);
  result = launchPatternFixture(input);
  assert.equal(result.waiting.breakoutOverheated, true);
  assert.equal(result.waiting.matches, true);
  assert.equal(result.waiting.admissionEffect, 'none_this_module_has_no_admission_authority');
});

test('MA20 waiting threshold compares current close to the complete20-session MA, strictly over15%', () => {
  const input = fixture();
  for (let i = 220; i < 240; i++) price(input, i, 100);
  price(input, 220, 85);
  //18*100+85+115=2000, so exactly15% above MA20 must not wait.
  price(input, 239, 115);
  assert.equal(launchPatternFixture(input).trend.ma20, 100);
  assert.equal(launchPatternFixture(input).waiting.ma20Overheated, false);
  price(input, 239, 115.01);
  assert.equal(launchPatternFixture(input).waiting.ma20Overheated, true);
});

test('one-price limit waiting uses current official fixture evidence, never a guessed10% daily cap', () => {
  const input = fixture();
  price(input, 239, 104.5);
  input.officialLimit!.onePriceLocked = true;
  let result = launchPatternFixture(input);
  assert.equal(result.waiting.onePriceLimitLocked, true);
  assert.equal(result.waiting.matches, true);
  input.officialLimit!.upperLimit = 104.6;
  result = launchPatternFixture(input);
  assert.equal(result.waiting.onePriceLimitLocked, null);
  input.officialLimit!.upperLimit = 104.5;
  input.officialLimit!.availableAt = `${input.history.bars[239].session}T13:29:59+08:00`;
  assert.equal(launchPatternFixture(input).waiting.onePriceLimitLocked, null);
  input.officialLimit = undefined;
  assert.equal(launchPatternFixture(input).waiting.onePriceLimitLocked, null);
});

test('calendar unknown, incomplete prices, duplicate sessions and invalid OHLC fail closed without day inference', () => {
  for (const change of ['unknown', 'missing', 'duplicate', 'ohlc', 'unclosed'] as const) {
    const input = fixture();
    if (change === 'unknown') input.calendar.completeness = 'unknown';
    if (change === 'missing') input.history.bars.splice(235, 1);
    if (change === 'duplicate') input.calendar.sessions[239].session = input.calendar.sessions[238].session;
    if (change === 'ohlc') input.history.bars[239].high = 94;
    if (change === 'unclosed') input.calendar.sessions[239].closeAt = `${input.history.bars[239].session}T22:00:00+08:00`;
    const result = launchPatternFixture(input);
    assert.equal(result.close, null, change);
    assert.equal(result.breakout.matches, null, change);
    assert.equal(result.trend.ma200, null, change);
  }
});

test('microsecond cutoff, future action basis and missing source revision never use later knowledge', () => {
  for (const change of ['clock', 'basis', 'revision', 'upstream'] as const) {
    const input = fixture();
    if (change === 'clock') input.history.bars[239].availableAt = input.cutoff.replace('+08:00', '.000001+08:00');
    if (change === 'basis') input.history.priceBasis!.status = 'missing';
    if (change === 'revision') input.history.sourceDatasetRevision = '';
    if (change === 'upstream') input.history.missingData = ['corporate_action_snapshot_incomplete'];
    const result = launchPatternFixture(input);
    assert.equal(result.close, null, change);
    assert.equal(result.consolidation.matches, null, change);
  }
});

test('volume comparisons require current selected revision and full51-session comparable share basis', () => {
  for (const change of ['short', 'revision', 'future', 'future_through', 'before_ledger', 'preclose', 'missing'] as const) {
    const input = fixture();
    if (change === 'short') input.volumeBasis!.fromSession = input.history.bars[219].session;
    if (change === 'revision') input.volumeBasis!.sourceDatasetRevision = 'another-selected-revision';
    if (change === 'future') input.volumeBasis!.availableAt = '2026-01-01T00:00:00Z';
    if (change === 'future_through') input.volumeBasis!.throughSession = '2026-01-01';
    if (change === 'before_ledger') input.volumeBasis!.fromSession = '2024-12-31';
    if (change === 'preclose') input.volumeBasis!.availableAt = `${input.history.bars[239].session}T13:29:59+08:00`;
    if (change === 'missing') input.volumeBasis = null;
    const result = launchPatternFixture(input);
    assert.equal(result.breakout.matches, null, change);
    assert.equal(result.breakout.prior50MeanVolume, null, change);
    assert.equal(result.trend.ma50, 95, change); // price evidence remains separate
  }
});

test('zero volume denominator and short history remain null rather than zero/false/infinity', () => {
  const input = fixture();
  for (const bar of input.history.bars) bar.volume = 0;
  assert.equal(launchPatternFixture(input).breakout.volumeRatio, null);
  assert.equal(launchPatternFixture(input).contraction.matches, null);
  const short = launchPatternFixture(fixture(20));
  assert.equal(short.breakout.matches, null);
  assert.equal(short.trend.ma50, null);
  assert.equal(short.trend.ma200, null);
  assert.equal(short.high.isAllTimeHigh, null);
});

test('20/63-session endpoint returns require same-market final complete benchmark windows; resolvedRS stays null', () => {
  const input = fixture();
  const result = launchPatternFixture(input);
  assert.equal(result.trend.returns20.stockReturn, 0);
  assert.equal(result.trend.returns20.benchmarkReturn, 1239 / 1219 - 1);
  assert.equal(result.trend.returns63.benchmarkReturn, 1239 / 1176 - 1);
  for (const change of ['market', 'missing', 'preclose', 'duplicate'] as const) {
    const altered = fixture();
    if (change === 'market') altered.benchmark!.market = 'TPEX';
    if (change === 'missing') altered.benchmark!.points.splice(230, 1);
    if (change === 'preclose') altered.benchmark!.points[239].availableAt = `${altered.history.bars[239].session}T13:29:59+08:00`;
    if (change === 'duplicate') altered.benchmark!.points[239].session = altered.benchmark!.points[238].session;
    const value = launchPatternFixture(altered);
    assert.equal(value.trend.returns20.benchmarkReturn, null, change);
    assert.equal(value.trend.returns63.relativeStrength, null, change);
  }
});

test('bounded deterministic fixture arithmetic does not mutate the input or accept an oversized ledger', () => {
  const input = fixture();
  const before = structuredClone(input);
  assert.deepEqual(launchPatternFixture(input), launchPatternFixture(input));
  assert.deepEqual(input, before);
  input.calendar.sessions = Array.from({ length: 2001 }, () => input.calendar.sessions[0]);
  assert.throws(() => launchPatternFixture(input), /fixture_bound_exceeded/u);
});
