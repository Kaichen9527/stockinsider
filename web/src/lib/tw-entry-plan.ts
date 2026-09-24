import { createHash } from 'node:crypto';
import { wilderAtr } from './technical-indicator-adapter.ts';
import {
  TW_ENTRY_PLAN_RULESET, TW_ENTRY_PLAN_SCHEMA,
  type TwEntryBar, type TwEntryChartBar, type TwEntryEligibility, type TwEntryPlan,
  type TwEntryPlanBundle, type TwEntryPlanInput, type TwEntryStructure,
} from './tw-entry-plan-contract.ts';

export const TW_ENTRY_MINIMUM_BARS = 240;
const MAXIMUM_INPUT_BARS = 2000;
const unique = (values: string[]) => [...new Set(values)].sort();
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const finitePositive = (value: number) => Number.isFinite(value) && value > 0;

function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value));
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, member]) => `${JSON.stringify(key)}:${canonical(member)}`).join(',')}}`;
}
function hash(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function date(value: string): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function instant(value: string): number {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    && date(value.slice(0, 10)) ? Date.parse(value) : NaN;
}
function taipeiDate(value: string): string | null {
  const time = instant(value);
  return Number.isFinite(time) ? new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) : null;
}
function nonempty(value: string) { return typeof value === 'string' && value.trim().length > 0 && value.length <= 512; }

/** The price at a tier boundary uses the new tier. Adjusted historical prices
 * need not be ticks; every executable current-scale price must be. */
export function twEntryTick(price: number): number | null {
  if (!finitePositive(price)) return null;
  return price < 10 ? 0.01 : price < 50 ? 0.05 : price < 100 ? 0.1 : price < 500 ? 0.5 : price < 1000 ? 1 : 5;
}
export function roundTwEntryPrice(price: number, direction: 'up' | 'down'): number | null {
  const tick = twEntryTick(price);
  if (tick === null) return null;
  const quotient = price / tick;
  const rounded = Math.abs(quotient - Math.round(quotient)) <= 1e-8 ? Math.round(quotient)
    : direction === 'up' ? Math.ceil(quotient) : Math.floor(quotient);
  const value = Number((rounded * tick).toFixed(8));
  return finitePositive(value) ? value : null;
}
export function nextTwEntryPrice(price: number): number | null {
  const up = roundTwEntryPrice(price, 'up');
  if (up === null) return null;
  return up > price + 1e-8 ? up : Number((up + twEntryTick(up)!).toFixed(8));
}

function validate(input: TwEntryPlanInput): string[] {
  const missing: string[] = [...(input.missingData ?? [])];
  const computed = instant(input.computedAt); const available = instant(input.availableAt); const asOf = instant(input.dataAsOf);
  if (!/^\d{4}$/u.test(input.symbol) || !nonempty(input.candidateRevisionId) || !nonempty(input.sourceDatasetRevision)) missing.push('input_identity_missing');
  if (![computed, available, asOf].every(Number.isFinite) || asOf > available || available > computed) missing.push('invalid_knowledge_clock');
  const calendar = input.calendar;
  if (!calendar || !nonempty(calendar.version) || !date(calendar.signalSession)
    || !Number.isFinite(instant(calendar.knownAt)) || instant(calendar.knownAt) > available) missing.push('calendar_authority_missing');
  if (calendar) {
    const sessions = calendar.completedSessions;
    if (sessions.length < TW_ENTRY_MINIMUM_BARS || sessions.some((session, index) => !date(session)
      || (index > 0 && session <= sessions[index - 1])) || sessions.at(-1) !== calendar.signalSession) missing.push('official_session_sequence_invalid');
    if (!Number.isFinite(instant(calendar.signalCloseAt)) || taipeiDate(calendar.signalCloseAt) !== calendar.signalSession
      || instant(calendar.signalCloseAt) > asOf || instant(calendar.signalCloseAt) > available
      || instant(calendar.signalCloseAt) > computed) missing.push('signal_session_not_completed');
    if (!date(calendar.nextSession) || calendar.nextSession <= calendar.signalSession
      || taipeiDate(calendar.nextOpenAt) !== calendar.nextSession || taipeiDate(calendar.nextCloseAt) !== calendar.nextSession
      || instant(calendar.nextOpenAt) <= instant(calendar.signalCloseAt)
      || !(instant(calendar.nextCloseAt) > instant(calendar.nextOpenAt))) missing.push('next_session_authority_missing');
  }
  const basis = input.priceBasis;
  if (!basis || basis.status !== 'verified' || basis.kind !== 'adjusted_to_signal_session'
    || basis.anchorSession !== calendar?.signalSession || !nonempty(basis.adjustmentVersion)
    || !/^[a-f0-9]{64}$/u.test(basis.adjustmentEvidenceHash)) missing.push('corporate_action_basis_unverified');
  if (input.bars.length < TW_ENTRY_MINIMUM_BARS) missing.push('price_history_below_240');
  for (let index = 0; index < input.bars.length; index += 1) {
    const bar = input.bars[index];
    if (!date(bar.session) || (index > 0 && bar.session <= input.bars[index - 1].session)) missing.push('price_session_sequence_invalid');
    if (calendar && bar.session > calendar.signalSession) missing.push('future_price_observation');
    if (![bar.open, bar.high, bar.low, bar.close].every(finitePositive) || !Number.isFinite(bar.volume) || bar.volume < 0
      || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) missing.push('invalid_ohlcv');
    if (!nonempty(bar.sourceRef) || !Number.isFinite(instant(bar.availableAt))
      || instant(bar.availableAt) > available || instant(bar.availableAt) > computed
      || (taipeiDate(bar.availableAt) ?? '') < bar.session) missing.push('price_provenance_or_knowledge_time_invalid');
  }
  const bars = input.bars.slice(-TW_ENTRY_MINIMUM_BARS);
  if (calendar && (bars.at(-1)?.session !== calendar.signalSession
    || bars.some((bar, index) => bar.session !== calendar.completedSessions.slice(-TW_ENTRY_MINIMUM_BARS)[index]))) missing.push('official_price_session_gap');
  const last = bars.at(-1);
  if (last && calendar && instant(last.availableAt) < instant(calendar.signalCloseAt)) missing.push('latest_price_not_final');
  if (last && finitePositive(last.close) && Math.abs(last.close - (roundTwEntryPrice(last.close, 'down') ?? NaN)) > 1e-8) missing.push('current_price_not_on_tick');
  return unique(missing);
}

function eligibility(input: TwEntryPlanInput): TwEntryEligibility {
  const formal = input.formalEligibility;
  if (!formal || !['eligible', 'blocked', 'unavailable'].includes(formal.state) || !nonempty(formal.policyVersion)
    || !Array.isArray(formal.reasonCodes) || formal.reasonCodes.some((reason) => !nonempty(reason))) {
    return { state: 'unavailable', reasonCodes: ['formal_eligibility_missing'], policyVersion: 'unavailable' };
  }
  if (formal.state === 'eligible' && formal.reasonCodes.length) {
    return { ...formal, state: 'unavailable', reasonCodes: unique([...formal.reasonCodes, 'formal_eligibility_conflict']) };
  }
  if (!input.liquidityVerified) return { ...formal, state: formal.state === 'blocked' ? 'blocked' : 'unavailable',
    reasonCodes: unique([...formal.reasonCodes, 'liquidity_not_verified']) };
  return { ...formal, reasonCodes: unique(formal.reasonCodes) };
}

function chartBars(bars: TwEntryBar[]): TwEntryChartBar[] {
  return bars.map((bar, index) => ({ session: bar.session, open: bar.open, high: bar.high, low: bar.low,
    close: bar.close, volume: bar.volume,
    ma20: index < 19 ? null : mean(bars.slice(index - 19, index + 1).map((row) => row.close)),
    ma60: index < 59 ? null : mean(bars.slice(index - 59, index + 1).map((row) => row.close)),
  }));
}

/** Research-only deterministic publication. The producer validates the actual
 * hash-bound adjustment evidence before adapting it to this contract. The
 * pure engine never reads a clock, database, provider or user position. */
export function buildTwEntryPlans(input: TwEntryPlanInput): TwEntryPlanBundle {
  if (input.bars.length > MAXIMUM_INPUT_BARS || (input.calendar?.completedSessions.length ?? 0) > 5000
    || (input.supportingEvidenceIds?.length ?? 0) > 256 || (input.conflictingEvidenceIds?.length ?? 0) > 256
    || (input.missingData?.length ?? 0) > 256) throw new RangeError('tw_entry_plan_input_bound');
  // Publication binding and computation time are not another trading
  // opportunity. A retry under a new dossier revision keeps the same plan ID.
  const { candidateRevisionId: _binding, computedAt: _computation, ...semanticInput } = input;
  void _binding; void _computation;
  const inputHash = hash([TW_ENTRY_PLAN_RULESET, semanticInput]);
  const missingData = validate(input);
  const formal = eligibility(input);
  const bars = input.bars.slice(-TW_ENTRY_MINIMUM_BARS);
  const calendar = input.calendar;
  const structures: TwEntryStructure[] = [];
  const base = (strategyId: TwEntryPlan['strategyId']): TwEntryPlan => ({
    planId: `tw-entry-plan:${hash([TW_ENTRY_PLAN_RULESET, inputHash, strategyId])}`,
    candidateRevisionId: input.candidateRevisionId, symbol: input.symbol, strategyId,
    rulesetVersion: TW_ENTRY_PLAN_RULESET, policyVersion: formal.policyVersion, inputHash,
    signalSession: calendar?.signalSession ?? null, computedAt: input.computedAt, availableAt: input.availableAt, dataAsOf: input.dataAsOf,
    validFromSession: calendar?.nextSession ?? null, expiresAfterSession: calendar?.nextSession ?? null,
    expiresAt: calendar?.nextCloseAt ?? null, sourceDatasetRevision: input.sourceDatasetRevision,
    priceBasis: input.priceBasis ? { ...input.priceBasis } : null, calendarVersion: calendar?.version ?? null,
    rawSignalState: 'data_insufficient', eligibility: { ...formal, reasonCodes: [...formal.reasonCodes] },
    planState: 'data_insufficient', reasonCodes: [...missingData], missingData: [...missingData],
    entryLower: null, entryUpper: null, noChaseAbove: null, invalidationPrice: null, technicalTarget: null,
    exitPolicy: { initialRiskLine: null, closeBelowMa20: true, maximumHoldingSessions: 20,
      closeOrTimeExitExecution: 'next_tradable_time', context: 'if_entered_under_this_strategy' },
    horizon: 'daily_swing', validationStatus: 'research_only', supportingEvidenceIds: unique(input.supportingEvidenceIds ?? []),
    conflictingEvidenceIds: unique(input.conflictingEvidenceIds ?? []), structureIds: [],
  });
  const plans = [base('breakout'), base('pullback')];
  if (missingData.length) return { schemaVersion: TW_ENTRY_PLAN_SCHEMA, symbol: input.symbol,
    candidateRevisionId: input.candidateRevisionId, inputHash, plans, structures, ohlcv: [], missingData };

  const current = bars.at(-1)!; const previous = bars.at(-2)!; const prior20 = bars.slice(-21, -1);
  // A fixed 240-row seed window reuses the repository's Wilder adapter. Neither
  // extra older history nor today's high/volume enter the prior-20 baseline.
  const atr = wilderAtr(bars, 14);
  const volume20 = mean(prior20.map((bar) => bar.volume));
  if (!atr || !finitePositive(volume20)) {
    const reason = !atr ? 'atr_unavailable' : 'prior20_volume_unavailable';
    plans.forEach((plan) => { plan.reasonCodes = [reason]; plan.missingData = [reason]; });
    return { schemaVersion: TW_ENTRY_PLAN_SCHEMA, symbol: input.symbol, candidateRevisionId: input.candidateRevisionId,
      inputHash, plans, structures, ohlcv: chartBars(bars), missingData: [reason] };
  }
  const ma20 = mean(bars.slice(-20).map((bar) => bar.close));
  const ma60 = mean(bars.slice(-60).map((bar) => bar.close));
  const ma60Prior5 = mean(bars.slice(-65, -5).map((bar) => bar.close));
  const trend = current.close > ma20 && ma20 > ma60 && ma60 >= ma60Prior5;
  const resistance = Math.max(...prior20.map((bar) => bar.high));
  const support = Math.min(...prior20.map((bar) => bar.low));
  const knownAt = prior20.map((bar) => bar.availableAt).sort((a, b) => instant(a) - instant(b)).at(-1)!;
  for (const [kind, value] of [['prior20_resistance', resistance], ['prior20_support', support]] as const) {
    const anchor = prior20.filter((bar) => (kind === 'prior20_resistance' ? bar.high : bar.low) === value).at(-1)!;
    const material = { kind, anchorSession: anchor.session, anchorValue: value, confirmedAt: knownAt, knownAt,
      startSession: prior20[0].session, endSession: previous.session, rulesetVersion: TW_ENTRY_PLAN_RULESET };
    structures.push({ ...material, structureId: `tw-entry-structure:${hash([inputHash, material])}` });
  }
  const threshold = nextTwEntryPrice(resistance)!;
  const late = instant(input.availableAt) >= instant(calendar!.nextOpenAt);
  const expired = instant(input.availableAt) >= instant(calendar!.nextCloseAt);
  for (const plan of plans) {
    plan.structureIds = structures.map((structure) => structure.structureId);
    const breakout = plan.strategyId === 'breakout';
    const touch = current.low <= ma20 + 0.5 * atr && current.high >= ma20 - 0.5 * atr;
    const stabilized = current.close >= ma20 && current.close > previous.high;
    const priceConfirmed = breakout ? current.close >= threshold : touch && stabilized;
    const volumeConfirmed = !breakout || current.volume >= 1.5 * volume20;
    const confirmed = trend && priceConfirmed && volumeConfirmed;
    plan.rawSignalState = confirmed ? 'confirmed' : 'waiting';
    plan.reasonCodes = unique([
      ...(!trend ? ['uptrend_not_confirmed'] : []),
      ...(breakout && !priceConfirmed ? ['close_below_prior20_breakout'] : []),
      ...(breakout && !volumeConfirmed ? ['breakout_volume_below_1_5_prior20_mean'] : []),
      ...(!breakout && !touch ? ['pullback_did_not_touch_ma20_zone'] : []),
      ...(!breakout && !stabilized ? ['pullback_stabilization_not_confirmed'] : []),
    ]);
    plan.planState = confirmed ? 'conditional' : 'waiting_confirmation';
    if (confirmed) {
      const lower = breakout ? threshold : current.close;
      const upper = roundTwEntryPrice(Math.min(current.close + 0.25 * atr, breakout ? resistance + 0.75 * atr : ma20 + atr), 'down');
      const stop = roundTwEntryPrice(breakout ? resistance - atr : Math.min(current.low, ma20) - 0.5 * atr, 'down');
      plan.noChaseAbove = upper;
      if (upper === null || stop === null || !(stop < lower && lower <= upper)) {
        plan.planState = 'avoid_chase'; plan.reasonCodes.push('invalid_entry_geometry');
      } else if (current.close > upper) {
        plan.planState = 'avoid_chase'; plan.reasonCodes.push('signal_above_no_chase_limit');
      } else {
        plan.entryLower = lower; plan.entryUpper = upper; plan.invalidationPrice = stop; plan.exitPolicy.initialRiskLine = stop;
      }
    }
    if (formal.state !== 'eligible') {
      plan.reasonCodes.push(...formal.reasonCodes);
      if (plan.planState === 'conditional') plan.planState = 'blocked';
    }
    if (late) {
      plan.reasonCodes.push('plan_published_after_next_open');
      plan.eligibility = { ...formal, state: formal.state === 'unavailable' ? 'unavailable' : 'blocked',
        reasonCodes: unique([...formal.reasonCodes, 'plan_published_after_next_open']) };
      if (plan.planState === 'conditional') plan.planState = 'blocked';
    }
    if (expired) { plan.planState = 'expired'; plan.reasonCodes.push('next_session_plan_expired'); }
    plan.reasonCodes = unique(plan.reasonCodes);
  }
  return { schemaVersion: TW_ENTRY_PLAN_SCHEMA, symbol: input.symbol, candidateRevisionId: input.candidateRevisionId,
    inputHash, plans, structures, ohlcv: chartBars(bars), missingData: [] };
}
