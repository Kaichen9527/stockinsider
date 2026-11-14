import type { TwEntryAuthorityRequest, TwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';
import { launchPatternFixture, type LaunchPatternFixture } from './launch-patterns.ts';
import { evidenceInstant } from './evidence-clock.ts';
import { sha256Canonical } from '../opportunity-v3/canonical.ts';

export const LAUNCH_RULE_POLICY = 'stockinsider-launch-radar-v1';
export const LAUNCH_RULE_VERSION = 'launch-radar-comparisons-v2';
type Market = 'TWSE' | 'TPEX';
type Source = { revisionId: string; market: Market; provider: 'twse' | 'tpex'; sourceUrl: string; sourceRef: string; availableAt: string; cutoff: string };
export type LaunchIndexEvidence = Source & { rows: Array<{ session: string; close: number; sourceTimestamp: string; availableAt: string }> };
export type LaunchChipEvidence = Source & { symbol: string; unit: 'shares'; volumeUnit: 'shares';
  priceRevision: string; calendarRevision: string; shareVolumeRevision: string;
  rows: Array<{ session: string; foreignNetShares: number | null; trustNetShares: number | null; sourceTimestamp: string; availableAt: string }> };
export type LaunchExternalEvidence = { index?: LaunchIndexEvidence | null; chips?: LaunchChipEvidence | null;
  frozenOriginal?: LaunchPatternFixture['originalBreakout'] };
type Selected = { evidence: TwLaunchPatternReadEvidence; arithmetic: ReturnType<typeof launchPatternFixture> };
type Request = Pick<TwEntryAuthorityRequest, 'symbol' | 'exchange' | 'cutoff' | 'signalSession'>;
type Group = 'trendRelativeStrength' | 'consolidation' | 'breakoutHold' | 'chips' | 'market';
const groupWeights: Record<Group, number> = { trendRelativeStrength: 25, consolidation: 25, breakoutHold: 20, chips: 20, market: 10 };
const canonicalRules = {
  trend_close_above_ma50: ['trendRelativeStrength', 5], trend_ma50_above_ma200: ['trendRelativeStrength', 5],
  trend_ma200_rising_5sessions: ['trendRelativeStrength', 5], trend_excess_return20_positive: ['trendRelativeStrength', 5],
  trend_excess_return63_positive: ['trendRelativeStrength', 5], consolidation_depth_within15pct: ['consolidation', 10],
  consolidation_distance_within5pct: ['consolidation', 5], consolidation_prior_atr_ratio_within08: ['consolidation', 5],
  consolidation_volume_ratio_within08: ['consolidation', 5], breakout_or_fixed_closing_hold: ['breakoutHold', 20],
  chips_foreign5_positive: ['chips', 5], chips_foreign20_positive: ['chips', 5],
  chips_trust5_positive: ['chips', 5], chips_trust20_positive: ['chips', 5],
  market_close_above_ma50: ['market', 5], market_close_above_ma200: ['market', 5],
} as const;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 512;
const sum = (values: number[]) => { const value = values.reduce((total, member) => total + member, 0); return values.length && values.every(finite) && finite(value) ? value : null; };
const mean = (values: number[]) => { const total = sum(values); return total === null ? null : total / values.length; };
const priceRatioReturn = (last: number, first: number) => { const value = last / first - 1; return finite(value) ? value : null; };
const compare = (a: number | null, b: number | null) => a !== null && b !== null && finite(a) && finite(b) ? a > b : null;
const within = (value: number | null, threshold: number) => value !== null && finite(value) ? value <= threshold : null;
const or = (a: boolean | null, b: boolean | null) => a === true || b === true ? true : a === false && b === false ? false : null;

/** Versioned engineering rubric. Raw source protocols do not establish actual
 * acquisition, formal review, entry, ranking or publication authority. */
export function evaluateLaunchRules(request: Request, selected: Selected, external: LaunchExternalEvidence = {}) {
  if (typeof request.symbol !== 'string' || !/^\d{4}$/u.test(request.symbol) || !['TWSE', 'TPEX'].includes(request.exchange)
    || evidenceInstant(request.cutoff) === null) throw Error('launch_rule_request_invalid');
  const { evidence } = selected;
  const history = evidence.history, bars = history.bars, calendar = evidence.calendar;
  if (bars.length > 2000 || (external.index?.rows.length ?? 0) > 512 || (external.chips?.rows.length ?? 0) > 512) throw Error('launch_rule_bound_exceeded');
  const known = (at: string) => evidenceInstant(at) !== null && evidenceInstant(at)! <= evidenceInstant(request.cutoff)!;
  // Matching metadata does not validate caller-supplied pattern flags. Reuse
  // the actual deterministic core on selected operands before awarding points.
  const shareEvidence = evidence.shareVolume;
  const arithmetic = launchPatternFixture({ cutoff: request.cutoff, market: request.exchange, history,
    calendar: { completeness: calendar?.status === 'validated_selected_window' ? 'complete_fixture' : 'unknown',
      revisionId: calendar?.revisionId ?? '', availableAt: calendar?.availableAt ?? request.cutoff,
      sessions: calendar?.sessions.map(row => ({ session: row.session, closeAt: row.closeAt })) ?? [] },
    volumeBasis: shareEvidence ? { status: 'comparable_fixture', revisionId: shareEvidence.revisionId,
      sourceDatasetRevision: shareEvidence.sourceDatasetRevision, availableAt: shareEvidence.availableAt,
      fromSession: shareEvidence.fromSession, throughSession: shareEvidence.throughSession } : null,
    originalBreakout: external.frozenOriginal });
  const bindingValid = sha256Canonical(selected.arithmetic) === sha256Canonical(arithmetic);
  const valid = bindingValid && arithmetic.close !== null && history.missingData.length === 0
    && history.priceBasis?.status === 'verified' && history.priceBasis.anchorSession === request.signalSession
    && known(history.availableAt) && calendar?.status === 'validated_selected_window' && known(calendar.availableAt)
    && evidence.corporateActions !== null && known(evidence.corporateActions.availableAt)
    && bars.length >= 240 && bars.length === calendar.sessions.length && bars.length === history.completedSessions.length
    && bars.every((bar, i) => bar.session === calendar.sessions[i].session && bar.session === history.completedSessions[i]
      && finite(bar.close) && bar.close > 0 && known(bar.availableAt) && known(bar.recordedAt) && known(bar.sourceTimestamp) && known(calendar.sessions[i].closeAt)
      && evidenceInstant(bar.sourceTimestamp)! >= evidenceInstant(calendar.sessions[i].closeAt)!
      && (i === 0 || bar.session > bars[i - 1].session));
  const closes = (period: number, offset = 0) => valid && bars.length >= period + offset
    ? mean(bars.slice(bars.length - period - offset, bars.length - offset).map(bar => bar.close)) : null;
  const currentClose = valid ? bars.at(-1)!.close : null;
  const ma50 = closes(50), ma200 = closes(200), priorMa200 = closes(200, 5);
  const priceReturn = (period: number) => valid && bars.length >= period + 1 ? priceRatioReturn(bars.at(-1)!.close, bars[bars.length - period - 1].close) : null;
  const sourceValid = (source: Source | null | undefined) => {
    if (!source || !valid || source.market !== request.exchange || source.provider !== request.exchange.toLowerCase()
      || source.cutoff !== request.cutoff || !text(source.revisionId) || !text(source.sourceRef) || !known(source.availableAt)) return false;
    try {
      const url = new URL(source.sourceUrl);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port
        && (request.exchange === 'TWSE' ? ['www.twse.com.tw', 'openapi.twse.com.tw', 'twse.com.tw']
          : ['www.tpex.org.tw', 'openapi.tpex.org.tw', 'tpex.org.tw']).includes(url.hostname);
    } catch { return false; }
  };
  const aligned = <T extends { session: string; sourceTimestamp: string; availableAt: string }>(rows: T[], period: number, source: Source) => {
    if (!sourceValid(source) || rows.some((row, i) => !text(row.session) || i > 0 && row.session <= rows[i - 1].session)) return null;
    const expected = calendar!.sessions.slice(-period);
    if (expected.length !== period) return null;
    const result = expected.map(day => rows.find(row => row.session === day.session));
    return result.every((row, i) => row !== undefined && known(row.sourceTimestamp) && known(row.availableAt)
      && evidenceInstant(row.sourceTimestamp)! >= evidenceInstant(expected[i].closeAt)!
      && evidenceInstant(row.sourceTimestamp)! <= evidenceInstant(row.availableAt)!
      && evidenceInstant(row.availableAt)! <= evidenceInstant(source.availableAt)!) ? result as T[] : null;
  };
  const index = external.index;
  const indexRows = (period: number) => {
    const rows = index ? aligned(index.rows, period, index) : null;
    return rows && rows.every(row => finite(row.close) && row.close > 0) ? rows : null;
  };
  const marketMean = (period: number) => { const rows = indexRows(period); return rows ? mean(rows.map(row => row.close)) : null; };
  const marketReturn = (period: number) => { const rows = indexRows(period + 1); return rows ? priceRatioReturn(rows.at(-1)!.close, rows[0].close) : null; };
  const stock20 = priceReturn(20), stock63 = priceReturn(63), market20 = marketReturn(20), market63 = marketReturn(63);
  const excess20 = stock20 !== null && market20 !== null ? stock20 - market20 : null;
  const excess63 = stock63 !== null && market63 !== null ? stock63 - market63 : null;
  const share = evidence.shareVolume;
  const shareValid = valid && share !== null && share.status === 'no_candidate_events_in_selected_51'
    && share.snapshotIds.length === 51 && share.sourceDatasetRevision === history.sourceDatasetRevision && known(share.availableAt)
    && evidenceInstant(share.availableAt)! >= evidenceInstant(calendar!.sessions.at(-1)!.closeAt)!
    && share.fromSession <= bars[bars.length - 51].session && share.throughSession === request.signalSession;
  const chip = external.chips;
  const chipRows = chip && chip.rows.length === 20 && chip.symbol === request.symbol && chip.unit === 'shares' && chip.volumeUnit === 'shares'
    && chip.priceRevision === history.sourceDatasetRevision && chip.calendarRevision === calendar?.revisionId
    && chip.shareVolumeRevision === share?.revisionId && shareValid ? aligned(chip.rows, 20, chip) : null;
  const flow = (owner: 'foreignNetShares' | 'trustNetShares', period: 5 | 20) => {
    const rows = chipRows?.slice(-period), volumes = valid ? bars.slice(-period).map(bar => bar.volume) : [];
    const volume = volumes.length === period && volumes.every(value => Number.isSafeInteger(value) && value >= 0) ? sum(volumes) : null;
    const net = rows && rows.every((row, i) => Number.isSafeInteger(row[owner]) && Math.abs(row[owner] as number) <= volumes[i])
      ? sum(rows.map(row => row[owner] as number)) : null;
    const ratio = net !== null && volume !== null && volume > 0 ? net / volume : null;
    const comparable = ratio !== null && finite(ratio) && Number.isSafeInteger(net) && Number.isSafeInteger(volume);
    return { netShares: comparable ? net : null, volumeShares: comparable ? volume : null, netVolumeRatio: comparable ? ratio : null };
  };
  const chipObservations = { foreign5: flow('foreignNetShares', 5), foreign20: flow('foreignNetShares', 20),
    trust5: flow('trustNetShares', 5), trust20: flow('trustNetShares', 20) };
  const frozen = external.frozenOriginal, original = arithmetic.originalBreakout;
  const originalValid = valid && frozen !== undefined && original !== null && frozen.session === original.session && frozen.level === original.level
    && frozen.priceScale === 'unchanged_fixture' && frozen.comparedSourceDatasetRevision === history.sourceDatasetRevision
    && text(frozen.revisionId) && known(frozen.availableAt) && shareValid && share!.fromSession <= original.session;
  const closingHold = !originalValid ? null : original!.sessionsSince >= 1 && original!.sessionsSince <= 5
    ? original!.closesAtOrAboveLevel : false;
  const breakout = shareValid ? arithmetic.breakout.matches : null;
  const breakoutOrHold = or(breakout, closingHold);
  const revisions = { price: history.sourceDatasetRevision, calendar: calendar?.revisionId ?? null,
    actions: evidence.corporateActions?.revisionId ?? null, shareVolume: share?.revisionId ?? null,
    chips: chipRows ? chip!.revisionId : null, market: sourceValid(index) ? index!.revisionId : null, original: originalValid ? frozen!.revisionId : null };
  const rule = (id: string, group: Group, weight: number, matches: boolean | null, operands: Record<string, unknown>) => {
    const definition = canonicalRules[id as keyof typeof canonicalRules];
    if (!definition || group !== definition[0] || weight !== definition[1]) throw Error('launch_rule_definition_invalid');
    return { id, group, weight, matches, points: matches === null ? null : matches ? weight : 0,
      operands, cutoff: request.cutoff, throughSession: request.signalSession, revisions: { ...revisions } };
  };
  const rules = [
    rule('trend_close_above_ma50', 'trendRelativeStrength', 5, compare(currentClose, ma50), { close: currentClose, ma50 }),
    rule('trend_ma50_above_ma200', 'trendRelativeStrength', 5, compare(ma50, ma200), { ma50, ma200 }),
    rule('trend_ma200_rising_5sessions', 'trendRelativeStrength', 5, compare(ma200, priorMa200), { ma200, priorMa200, priorEndpoint: valid ? bars.at(-6)!.session : null }),
    rule('trend_excess_return20_positive', 'trendRelativeStrength', 5, compare(excess20, 0), { stockReturn: stock20, marketReturn: market20, excessReturn: excess20 }),
    rule('trend_excess_return63_positive', 'trendRelativeStrength', 5, compare(excess63, 0), { stockReturn: stock63, marketReturn: market63, excessReturn: excess63 }),
    rule('consolidation_depth_within15pct', 'consolidation', 10, valid ? within(arithmetic.consolidation.rangeDepth, .15) : null, { depth: valid ? arithmetic.consolidation.rangeDepth : null }),
    rule('consolidation_distance_within5pct', 'consolidation', 5, valid ? within(arithmetic.consolidation.distanceFromHigh, .05) : null, { distance: valid ? arithmetic.consolidation.distanceFromHigh : null }),
    rule('consolidation_prior_atr_ratio_within08', 'consolidation', 5, valid ? within(arithmetic.contraction.atrContractionRatio, .8) : null,
      { ratio: valid ? arithmetic.contraction.atrContractionRatio : null, throughSession: arithmetic.contraction.atrThroughSession }),
    rule('consolidation_volume_ratio_within08', 'consolidation', 5, shareValid ? within(arithmetic.contraction.volumeContractionRatio, .8) : null,
      { ratio: shareValid ? arithmetic.contraction.volumeContractionRatio : null }),
    rule('breakout_or_fixed_closing_hold', 'breakoutHold', 20, breakoutOrHold, { breakout, closingHold,
      originalSession: originalValid ? original!.session : null, originalLevel: originalValid ? original!.level : null }),
    ...Object.entries(chipObservations).map(([name, values]) => rule(`chips_${name}_positive`, 'chips', 5, compare(values.netShares, 0), values)),
    rule('market_close_above_ma50', 'market', 5, compare(indexRows(1)?.[0].close ?? null, marketMean(50)), { close: indexRows(1)?.[0].close ?? null, ma50: marketMean(50) }),
    rule('market_close_above_ma200', 'market', 5, compare(indexRows(1)?.[0].close ?? null, marketMean(200)), { close: indexRows(1)?.[0].close ?? null, ma200: marketMean(200) }),
  ];
  const components = Object.fromEntries((Object.keys(groupWeights) as Group[]).map(group => {
    const selectedRules = rules.filter(item => item.group === group);
    const availableWeight = selectedRules.reduce((sum, item) => sum + (item.points === null ? 0 : item.weight), 0);
    const confirmedPoints = selectedRules.reduce((sum, item) => sum + (item.points ?? 0), 0);
    return [group, { maxPoints: groupWeights[group], availableWeight, confirmedPoints, score: availableWeight === groupWeights[group] ? confirmedPoints : null }];
  })) as Record<Group, { maxPoints: number; availableWeight: number; confirmedPoints: number; score: number | null }>;
  const availableWeight = rules.reduce((sum, item) => sum + (item.points === null ? 0 : item.weight), 0);
  const confirmedPoints = rules.reduce((sum, item) => sum + (item.points ?? 0), 0);
  const tech = ['trendRelativeStrength', 'consolidation', 'breakoutHold'] as Group[];
  const technicalWeight = tech.reduce((sum, group) => sum + components[group].availableWeight, 0);
  const confirmedTechnicalPoints = tech.reduce((sum, group) => sum + components[group].confirmedPoints, 0);
  const superseded = new Set(['long_ma_slope_horizon_unspecified', 'relative_strength_normalization_unspecified', 'hold_close_or_intraday_low_rule_unspecified']);
  const gaps = [...new Set([...evidence.missingData, ...arithmetic.gaps.filter(gap => !superseded.has(gap)),
    ...rules.filter(item => item.points === null).map(item => `${item.id}_input_unavailable`),
    ...(closingHold === null ? ['fixed_closing_hold_original_window_share_evidence_not_connected'] : []),
    'formal_review_and_publication_not_connected', ...(bindingValid ? [] : ['selected_read_score_revision_or_cutoff_mismatch'])])].sort();
  return { schemaVersion: LAUNCH_RULE_VERSION, derivationVersion: LAUNCH_RULE_VERSION, policyVersion: LAUNCH_RULE_POLICY,
    scope: 'selected_read_deterministic_launch_rules' as const, symbol: request.symbol, cutoff: request.cutoff, session: request.signalSession,
    revisions, bindingValid, rules, components, availableWeight, confirmedPoints, totalScore: availableWeight === 100 ? confirmedPoints : null,
    confirmedTechnicalPoints, technicalScore: technicalWeight === 70 ? confirmedTechnicalPoints : null, relativeStrength63: excess63,
    observations: bindingValid ? { trend: { ...arithmetic.trend, ma200Prior5: priorMa200, excessReturn20: excess20, excessReturn63: excess63 },
      consolidation: arithmetic.consolidation, contraction: arithmetic.contraction, breakout: arithmetic.breakout,
      originalBreakout: arithmetic.originalBreakout, closingHold, waiting: arithmetic.waiting,
      chips: chipRows ? chipObservations : null, market: sourceValid(index) ? { ma50: marketMean(50), ma200: marketMean(200), return20: market20, return63: market63 } : null } : null,
    rankable: false as const, rankingAuthority: false as const, publicationAuthority: false as const,
    sourceAuthority: false as const, entryAuthority: false as const, probability: false as const, gaps };
}

export function launchRuleScorePage(scores: ReturnType<typeof evaluateLaunchRules>[], options: { limit?: number; cursor?: { snapshotHash: string; afterSymbol: string } } = {}) {
  const limit = options.limit ?? 10;
  const validTotals = (row: typeof scores[number]) => {
    if (row.rules.length !== 16 || new Set(row.rules.map(rule => rule.id)).size !== 16
      || row.rules.some(rule => {
        const definition = canonicalRules[rule.id as keyof typeof canonicalRules];
        return !definition || rule.group !== definition[0] || rule.weight !== definition[1]
          || ![null, false, true].includes(rule.matches) || rule.points !== (rule.matches === null ? null : rule.matches ? definition[1] : 0)
          || rule.cutoff !== row.cutoff || rule.throughSession !== row.session;
      })) return false;
    const available = row.rules.reduce((total, rule) => total + (rule.points === null ? 0 : rule.weight), 0);
    const points = row.rules.reduce((total, rule) => total + (rule.points ?? 0), 0);
    const technicalRules = row.rules.filter(rule => ['trendRelativeStrength', 'consolidation', 'breakoutHold'].includes(rule.group));
    const technicalWeight = technicalRules.reduce((total, rule) => total + (rule.points === null ? 0 : rule.weight), 0);
    const technicalPoints = technicalRules.reduce((total, rule) => total + (rule.points ?? 0), 0);
    const rsRule = row.rules.find(rule => rule.id === 'trend_excess_return63_positive')!;
    const stockReturn = rsRule.operands.stockReturn, marketReturn = rsRule.operands.marketReturn;
    if (stockReturn !== null && !finite(stockReturn) || marketReturn !== null && !finite(marketReturn)) return false;
    const excessReturn = stockReturn === null || marketReturn === null ? null : (stockReturn as number) - (marketReturn as number);
    if (excessReturn !== null && !finite(excessReturn) || rsRule.operands.excessReturn !== excessReturn
      || row.relativeStrength63 !== excessReturn || rsRule.matches !== (excessReturn === null ? null : excessReturn > 0)) return false;
    if (row.availableWeight !== available || row.confirmedPoints !== points || row.totalScore !== (available === 100 ? points : null)
      || row.confirmedTechnicalPoints !== technicalPoints || row.technicalScore !== (technicalWeight === 70 ? technicalPoints : null)) return false;
    return Object.keys(row.components).sort().join(' ') === Object.keys(groupWeights).sort().join(' ')
      && (Object.keys(groupWeights) as Group[]).every(group => {
        const rules = row.rules.filter(rule => rule.group === group), component = row.components[group];
        const weight = rules.reduce((total, rule) => total + (rule.points === null ? 0 : rule.weight), 0);
        const confirmed = rules.reduce((total, rule) => total + (rule.points ?? 0), 0);
        return component.maxPoints === groupWeights[group] && component.availableWeight === weight
          && component.confirmedPoints === confirmed && component.score === (weight === groupWeights[group] ? confirmed : null);
      });
  };
  if (scores.length > 20 || !Number.isInteger(limit) || limit < 1 || limit > 10 || new Set(scores.map(row => row.symbol)).size !== scores.length
    || new Set(scores.map(row => row.cutoff)).size > 1 || scores.some(row => row.policyVersion !== LAUNCH_RULE_POLICY || row.derivationVersion !== LAUNCH_RULE_VERSION
      || typeof row.symbol !== 'string' || !/^\d{4}$/u.test(row.symbol) || evidenceInstant(row.cutoff) === null
      || !validTotals(row)
      || row.relativeStrength63 !== null && !finite(row.relativeStrength63))) throw Error('launch_rule_page_invalid');
  const rows = [...scores], unresolved = new Set<string>(), group = (row: typeof rows[number]) => JSON.stringify([row.totalScore, row.technicalScore]);
  for (const row of rows) {
    const tied = rows.filter(other => group(other) === group(row));
    if (tied.length > 1 && tied.some(other => other.relativeStrength63 === null)) for (const other of tied) unresolved.add(other.symbol);
  }
  const descending = (a: number | null, b: number | null) => a === null ? b === null ? 0 : 1 : b === null ? -1 : b - a;
  rows.sort((a, b) => descending(a.totalScore, b.totalScore) || descending(a.technicalScore, b.technicalScore)
    || (unresolved.has(a.symbol) ? a.symbol.localeCompare(b.symbol) : descending(a.relativeStrength63, b.relativeStrength63) || a.symbol.localeCompare(b.symbol)));
  const snapshotHash = sha256Canonical([...scores].sort((a, b) => a.symbol.localeCompare(b.symbol)));
  if (options.cursor && (options.cursor.snapshotHash !== snapshotHash || !rows.some(row => row.symbol === options.cursor!.afterSymbol))) throw Error('launch_rule_page_invalid');
  const start = options.cursor ? rows.findIndex(row => row.symbol === options.cursor!.afterSymbol) + 1 : 0, items = rows.slice(start, start + limit);
  return { scope: 'deterministic_launch_score_presentation_only' as const, policyVersion: LAUNCH_RULE_POLICY, derivationVersion: LAUNCH_RULE_VERSION,
    snapshotHash, items, total: rows.length, unresolvedTieSymbols: [...unresolved].sort(),
    orderingStatus: rows.some(row => row.totalScore === null) ? 'incomplete_scores_presentation_only' : unresolved.size ? 'unknown_relative_strength_tie_presentation_only' : 'numeric_tie_order_only',
    rankable: false as const, rankingAuthority: false as const, publicationAuthority: false as const,
    nextCursor: start + items.length < rows.length ? { snapshotHash, afterSymbol: items.at(-1)!.symbol } : null };
}
