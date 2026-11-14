import { isHistoryDate } from '../candidate-price-history.ts';
import { wilderAtr } from '../technical-indicator-adapter.ts';
import type { TwEntryHistoricalAuthorityResult } from '../tw-entry-plan-authority.ts';
import { evidenceInstant } from './evidence-clock.ts';

/** Offline arithmetic only. No provider, calendar or publication authority is
 * established by the supplied fixture or by this module. */
export const LAUNCH_PATTERN_RULESET = 'launch-pattern-observations-v1';
type Market = 'TWSE' | 'TPEX';
type Bar = TwEntryHistoricalAuthorityResult['bars'][number];
type Revision = { revisionId: string; availableAt: string };
export type LaunchPatternFixture = {
  cutoff: string; market: Market; history: TwEntryHistoricalAuthorityResult;
  calendar: Revision & {
    completeness: 'complete_fixture' | 'unknown';
    sessions: Array<{ session: string; closeAt: string }>;
  };
  /** Price adjustments do not prove comparable share volumes. The current
   * historical loader only checks its recent21 window, less than prior50. */
  volumeBasis: (Revision & { status: 'comparable_fixture'; sourceDatasetRevision: string; fromSession: string; throughSession: string }) | null;
  benchmark?: Revision & { market: Market; points: Array<{ session: string; close: number; availableAt: string }> };
  officialLimit?: Revision & { market: Market; session: string; upperLimit: number; onePriceLocked: boolean };
  /** Frozen original event. A later action/correction cannot silently rebase
   * this level. Unchanged scale is an explicit fixture fact, not authority. */
  originalBreakout?: Revision & { session: string; level: number;
    priceScale: 'unchanged_fixture' | 'unknown'; comparedSourceDatasetRevision: string };
};

const positive = (value: number) => Number.isFinite(value) && value > 0;
const nonempty = (value: string) => typeof value === 'string' && value.trim().length > 0 && value.length <= 512;
const average = (values: number[]) => {
  const sum = values.reduce((total, item) => total + item, 0);
  const value = Number.isFinite(sum) ? sum / values.length : values.reduce((total, item) => total + item / values.length, 0);
  return Number.isFinite(value) ? value : null;
};
const ratio = (numerator: number | null, denominator: number | null) => {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
};

/** Consume the existing selected historical-price result. Revisions are never
 * selected, backfilled, adjusted or renewed here. Missing evidence stays null.
 * Ambiguous product formulas remain observations with explicit policy gaps. */
export function launchPatternFixture(input: LaunchPatternFixture) {
  if (input.history.bars.length > 2000 || input.history.completedSessions.length > 2000
    || input.calendar.sessions.length > 2000 || (input.benchmark?.points.length ?? 0) > 2000) {
    throw Error('launch_pattern_fixture_bound_exceeded');
  }
  const gaps = new Set<string>(['offline_fixture_not_authority', 'real_provider_and_ui_not_connected', 'original_signal_publication_not_verified']);
  const cutoff = evidenceInstant(input.cutoff);
  const known = (at: string) => {
    const time = evidenceInstant(at);
    return cutoff !== null && time !== null && time <= cutoff;
  };
  const revisionKnown = (value: Revision) => nonempty(value.revisionId) && known(value.availableAt);
  const history = input.history;
  const sessions = input.calendar.sessions;
  const bars = history.bars;
  const current = bars.at(-1);
  const calendarValid = cutoff !== null && input.calendar.completeness === 'complete_fixture'
    && revisionKnown(input.calendar) && sessions.length > 0
    && sessions.every((row, index) => isHistoryDate(row.session) && known(row.closeAt)
      && evidenceInstant(row.closeAt)! <= evidenceInstant(input.calendar.availableAt)!
      && new Date(Number(evidenceInstant(row.closeAt)! / BigInt(1000)) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) === row.session
      && (index === 0 || row.session > sessions[index - 1].session
        && evidenceInstant(row.closeAt)! > evidenceInstant(sessions[index - 1].closeAt)!));
  if (!calendarValid) gaps.add('official_completed_session_window_unproven');
  const basis = history.priceBasis;
  const provenanceValid = cutoff !== null && ['TWSE', 'TPEX'].includes(input.market)
    && history.notEntryAuthority === true && history.nextSessionAuthority === false
    && nonempty(history.sourceDatasetRevision) && !history.sourceDatasetRevision.endsWith(':unavailable')
    && known(history.availableAt) && history.missingData.length === 0
    && basis?.status === 'verified' && basis.kind === 'adjusted_to_signal_session'
    && basis.anchorSession === current?.session && nonempty(basis.adjustmentVersion)
    && /^[a-f0-9]{64}$/u.test(basis.adjustmentEvidenceHash);
  if (!provenanceValid) gaps.add('selected_price_revision_or_corporate_action_basis_unverified');
  for (const reason of history.missingData) gaps.add(reason);
  const barsValid = bars.length > 0 && bars.every((bar, index) => {
    const session = sessions[index];
    const source = evidenceInstant(bar.sourceTimestamp), recorded = evidenceInstant(bar.recordedAt), available = evidenceInstant(bar.availableAt);
    return isHistoryDate(bar.session) && (index === 0 || bar.session > bars[index - 1].session)
      && [bar.open, bar.high, bar.low, bar.close, bar.rawClose].every(positive)
      && bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close)
      && Number.isFinite(bar.volume) && bar.volume >= 0
      && nonempty(bar.sourceRef) && nonempty(bar.observationId)
      && known(bar.sourceTimestamp) && known(bar.recordedAt) && known(bar.availableAt)
      && source! <= recorded! && recorded! <= available! && available! <= evidenceInstant(history.availableAt)!
      && session?.session === bar.session && known(session.closeAt)
      && source! >= evidenceInstant(session.closeAt)!
      && (input.market === 'TWSE' ? bar.sourceUrl === 'https://www.twse.com.tw/' : bar.sourceUrl === 'https://www.tpex.org.tw/');
  });
  const sequenceValid = bars.length === sessions.length && bars.length === history.completedSessions.length
    && bars.every((bar, index) => bar.session === history.completedSessions[index]);
  if (!barsValid || !sequenceValid) gaps.add('official_price_session_gap_or_invalid_ohlcv');
  const valid = calendarValid && provenanceValid && barsValid && sequenceValid;
  const window = (length: number, end = bars.length): Bar[] | null => {
    if (!valid || end < length) return null;
    return bars.slice(end - length, end);
  };
  const meanClose = (length: number, end = bars.length) => {
    const selected = window(length, end);
    return selected ? average(selected.map(bar => bar.close)) : null;
  };
  const comparableVolume = (selected: Bar[] | null) => {
    const evidence = input.volumeBasis;
    const through = evidence === null ? undefined : sessions.find(row => row.session === evidence.throughSession);
    return selected !== null && evidence !== null && evidence.status === 'comparable_fixture'
      && revisionKnown(evidence) && evidence.sourceDatasetRevision === history.sourceDatasetRevision
      && isHistoryDate(evidence.fromSession) && isHistoryDate(evidence.throughSession)
      && sessions.some(row => row.session === evidence.fromSession) && through !== undefined
      && evidenceInstant(evidence.availableAt)! >= evidenceInstant(through.closeAt)!
      && evidence.fromSession <= selected[0].session && evidence.throughSession >= selected.at(-1)!.session;
  };
  const prior25 = window(25, bars.length - 1);
  const prior25High = prior25 ? Math.max(...prior25.map(bar => bar.high)) : null;
  const prior25Low = prior25 ? Math.min(...prior25.map(bar => bar.low)) : null;
  const rangeDepth = prior25High === null || prior25Low === null ? null : (prior25High - prior25Low) / prior25High;
  const distanceFromHigh = prior25High === null ? null : Math.abs(prior25High - current!.close) / prior25High;
  const consolidation = rangeDepth === null || distanceFromHigh === null ? null : rangeDepth <= 0.15 && distanceFromHigh <= 0.05;
  const prior50 = window(50, bars.length - 1);
  const volume51 = window(51);
  const prior50MeanVolume = comparableVolume(volume51) ? average(prior50!.map(bar => bar.volume)) : null;
  if (!prior25) gaps.add('prior25_official_prices_missing');
  if (!prior50) gaps.add('prior50_official_prices_missing');
  if (!comparableVolume(volume51)) gaps.add('prior50_and_current_share_volume_basis_unproven');
  const breakoutVolumeRatio = ratio(valid ? current!.volume : null, prior50MeanVolume);
  if (breakoutVolumeRatio === null) gaps.add('breakout_volume_ratio_unavailable');
  const breakout = prior25High === null || breakoutVolumeRatio === null ? null
    : current!.close > prior25High && breakoutVolumeRatio >= 1.4;
  // Disjoint volume windows: recent5[t-4..t], previous20[t-24..t-5].
  // Current belongs to the numerator only, never its comparison baseline.
  const recent25 = window(25);
  const recent5MeanVolume = comparableVolume(recent25) ? average(recent25!.slice(-5).map(bar => bar.volume)) : null;
  const previous20MeanVolume = comparableVolume(recent25) ? average(recent25!.slice(0, 20).map(bar => bar.volume)) : null;
  const volumeContractionRatio = ratio(recent5MeanVolume, previous20MeanVolume);
  if (volumeContractionRatio === null) gaps.add('volume_contraction_ratio_unavailable');
  if (!comparableVolume(recent25)) gaps.add('contraction_share_volume_basis_unproven');
  // All supplied contiguous history seeds the existing Wilder adapter; do not
  // silently switch to two separately truncated SMA true-range windows.
  // The prior-contraction ATR observation ends at t-1, excluding current.
  const atrBars = bars.slice(0, -1);
  const atr5 = valid ? wilderAtr(atrBars, 5) : null;
  const atr20 = valid ? wilderAtr(atrBars, 20) : null;
  const atrContractionRatio = ratio(atr5, atr20);
  if (atrContractionRatio === null) gaps.add('atr5_20_unavailable');
  const contraction = atrContractionRatio === null || volumeContractionRatio === null ? null
    : atrContractionRatio <= 0.8 && volumeContractionRatio <= 0.8;
  const ma20 = meanClose(20), ma50 = meanClose(50), ma200 = meanClose(200);
  if (ma20 === null) gaps.add('ma20_official_history_missing');
  if (ma50 === null) gaps.add('ma50_official_history_missing');
  if (ma200 === null) gaps.add('ma200_official_history_missing');

  const frozenBreakout = input.originalBreakout;
  const breakoutIndex = frozenBreakout === undefined ? -1 : bars.findIndex(bar => bar.session === frozenBreakout.session);
  let originalBreakout: { session: string; level: number; sessionsSince: number; closesAtOrAboveLevel: boolean | null; lowsAtOrAboveLevel: boolean | null } | null = null;
  if (valid && breakoutIndex >= 50 && frozenBreakout !== undefined && revisionKnown(frozenBreakout)
    && frozenBreakout.priceScale === 'unchanged_fixture' && frozenBreakout.comparedSourceDatasetRevision === history.sourceDatasetRevision
    && positive(frozenBreakout.level) && evidenceInstant(frozenBreakout.availableAt)! >= evidenceInstant(sessions[breakoutIndex].closeAt)!) {
    const original = bars[breakoutIndex];
    const level = Math.max(...bars.slice(breakoutIndex - 25, breakoutIndex).map(bar => bar.high));
    const originalWindow = window(51, breakoutIndex + 1);
    const mean = comparableVolume(originalWindow) ? average(bars.slice(breakoutIndex - 50, breakoutIndex).map(bar => bar.volume)) : null;
    if (frozenBreakout.level === level && original.close > level && mean !== null && ratio(original.volume, mean)! >= 1.4) {
      const after = bars.slice(breakoutIndex + 1);
      originalBreakout = { session: original.session, level: frozenBreakout.level, sessionsSince: after.length,
        closesAtOrAboveLevel: after.length >= 1 && after.length <= 5 ? after.every(bar => bar.close >= level) : null,
        lowsAtOrAboveLevel: after.length >= 1 && after.length <= 5 ? after.every(bar => bar.low >= level) : null };
    }
  }
  if (originalBreakout === null) gaps.add('original_breakout_not_proven');
  // Parent does not specify close/low hold semantics, long-MA slope horizon
  // or relative-strength normalization. Do not choose a
  // product rule here. Raw observations are retained for the eventual policy.
  gaps.add('hold_close_or_intraday_low_rule_unspecified');
  gaps.add('long_ma_slope_horizon_unspecified');
  gaps.add('relative_strength_normalization_unspecified');

  const returns = (length: number) => {
    const selected = window(length + 1);
    const benchmark = input.benchmark;
    const points = benchmark?.points;
    const stockReturn = selected ? ratio(current!.close, selected[0].close) : null;
    const benchmarkValid = selected !== null && benchmark !== undefined && benchmark.market === input.market
      && revisionKnown(benchmark) && points !== undefined && points.length <= 2000
      && points.every((point, index) => isHistoryDate(point.session) && positive(point.close) && known(point.availableAt)
        && (index === 0 || point.session > points[index - 1].session));
    const aligned = benchmarkValid ? selected!.map(bar => points!.find(point => point.session === bar.session)) : [];
    const benchmarkRatio = benchmarkValid && aligned.every((point, index) => point !== undefined
      && evidenceInstant(point.availableAt)! >= evidenceInstant(sessions[bars.length - selected!.length + index].closeAt)!
      && evidenceInstant(point.availableAt)! <= evidenceInstant(benchmark!.availableAt)!)
      ? ratio(aligned.at(-1)!.close, aligned[0]!.close) : null;
    if (stockReturn === null || benchmarkRatio === null) gaps.add(`same_market_${length}_session_returns_unavailable`);
    return { stockReturn: stockReturn === null ? null : stockReturn - 1,
      benchmarkReturn: benchmarkRatio === null ? null : benchmarkRatio - 1, relativeStrength: null };
  };
  const returns20 = returns(20), returns63 = returns(63);
  const aboveMa20 = ratio(valid ? current!.close : null, ma20);
  const aboveOriginal = ratio(valid ? current!.close : null, originalBreakout?.level ?? null);
  const ma20Overheated = aboveMa20 === null ? null : aboveMa20 > 1.15;
  const breakoutOverheated = aboveOriginal === null ? null : aboveOriginal > 1.10;
  const limit = input.officialLimit;
  const limitValid = valid && limit !== undefined && revisionKnown(limit)
    && limit.market === input.market && limit.session === current!.session && positive(limit.upperLimit) && typeof limit.onePriceLocked === 'boolean'
    && evidenceInstant(limit.availableAt)! >= evidenceInstant(sessions.at(-1)!.closeAt)!
    && (!limit.onePriceLocked || [current!.open, current!.high, current!.low, current!.close].every(value => value === limit.upperLimit));
  const onePriceLimitLocked = limitValid ? limit!.onePriceLocked : null;
  if (onePriceLimitLocked === null) gaps.add('official_daily_limit_and_lock_evidence_missing');
  const waitReasons = [ma20Overheated === true ? 'above_ma20_over_15_percent' : null,
    breakoutOverheated === true ? 'above_original_breakout_over_10_percent' : null,
    onePriceLimitLocked === true ? 'official_one_price_limit_locked' : null].filter((reason): reason is string => reason !== null);
  const previousKnown = valid && bars.length >= 2 ? Math.max(...bars.slice(0, -1).map(bar => bar.high)) : null;
  return {
    rulesetVersion: LAUNCH_PATTERN_RULESET, scope: 'offline_fixture_only' as const, activation: 'not_connected' as const,
    sourceAuthority: false as const, rankingAuthority: false as const, publicationAuthority: false as const, cutoff: input.cutoff,
    sourceDatasetRevision: history.sourceDatasetRevision, calendarRevision: input.calendar.revisionId,
    adjustmentEvidenceHash: basis?.adjustmentEvidenceHash ?? null,
    session: valid ? current!.session : null, close: valid ? current!.close : null,
    consolidation: { prior25High, prior25Low, rangeDepth, distanceFromHigh, matches: consolidation },
    contraction: { atr5, atr20, atrContractionRatio, atrThroughSession: valid ? atrBars.at(-1)?.session ?? null : null,
      recent5MeanVolume, previous20MeanVolume, volumeContractionRatio, matches: contraction },
    breakout: { prior25High, prior50MeanVolume, volumeRatio: breakoutVolumeRatio, matches: breakout },
    originalBreakout, holdsOriginalBreakout: null,
    trend: { ma20, ma50, ma200, longMaSlope: null, returns20, returns63 },
    waiting: { ma20Overheated, breakoutOverheated, onePriceLimitLocked, reasons: waitReasons,
      matches: waitReasons.length > 0 ? true : [ma20Overheated, breakoutOverheated, onePriceLimitLocked].includes(null) ? null : false,
      admissionEffect: 'none_this_module_has_no_admission_authority' as const },
    high: { scope: 'known_supplied_period_only' as const, fromSession: valid ? bars[0].session : null,
      throughSession: valid ? current!.session : null, previousHigh: previousKnown,
      makesNewKnownHigh: previousKnown === null ? null : current!.high > previousKnown,
      is52WeekHigh: null, isAllTimeHigh: null },
    gaps: [...gaps].sort(),
  };
}
