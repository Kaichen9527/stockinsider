import { sha256Canonical } from './canonical.ts';

type JsonRecord = Record<string, unknown>;
type ReferenceBundle = { manifestId: string; manifestHash: string; sections: Map<string, unknown[][]> };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function quantile(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = (ordered.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? ordered[lower] : ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower);
}

function rounded(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const VOLATILE_MATERIAL_KEYS = new Set([
  'asOf','lastEvaluatedAt','analysisGeneratedAt','manifestRef','referenceManifestRef',
  'verificationRef','financialManifestRef','factorManifestRef',
]);

function semanticMaterial(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticMaterial);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as JsonRecord)
    .filter(([key]) => !VOLATILE_MATERIAL_KEYS.has(key))
    .map(([key, nested]) => [key, semanticMaterial(nested)]));
}

function wilder(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let current = mean(values.slice(0, period));
  for (const value of values.slice(period)) current = (current * (period - 1) + value) / period;
  return current;
}

function emaSeries(values: number[], period: number): Array<number | null> {
  if (values.length < period) return [];
  const output: Array<number | null> = Array(period - 1).fill(null);
  let current = mean(values.slice(0, period)); output.push(current);
  const alpha = 2 / (period + 1);
  for (const value of values.slice(period)) { current = (value - current) * alpha + current; output.push(current); }
  return output;
}

function taiwanTick(price: number) {
  return price < 10 ? .01 : price < 50 ? .05 : price < 100 ? .1 : price < 500 ? .5 : price < 1000 ? 1 : 5;
}

function tickRound(price: number, direction: 'up' | 'down') {
  const tick = taiwanTick(price); const quotient = price / tick;
  const units = Math.abs(quotient - Math.round(quotient)) <= 1e-9 ? Math.round(quotient)
    : direction === 'up' ? Math.ceil(quotient) : Math.floor(quotient);
  return Number((units * tick).toFixed(8));
}

export function parseReferenceBundle(value: unknown, label: string): ReferenceBundle {
  if (!Array.isArray(value) || value.length !== 3 || typeof value[0] !== 'string' ||
    typeof value[1] !== 'string' || !/^[0-9a-f]{64}$/.test(value[1]) || !Array.isArray(value[2])) {
    throw new TypeError(`invalid ${label} manifest bundle`);
  }
  const sections = new Map<string, unknown[][]>();
  for (const item of value[2]) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || !Array.isArray(item[1])) {
      throw new TypeError(`invalid ${label} manifest row`);
    }
    const selected = sections.get(item[0]) ?? [];
    selected.push(item[1]);
    sections.set(item[0], selected);
  }
  return { manifestId: value[0], manifestHash: value[1], sections };
}

function qualityAxes(financialRows: unknown[][], manifestRef: string) {
  const byKey = new Map<string, Array<{ value: number; period: string }>>();
  for (const row of financialRows) {
    if (typeof row[1] !== 'string' || typeof row[3] !== 'string' || !finite(row[5]) || row[14] !== 'reported') continue;
    const selected = byKey.get(row[1]) ?? [];
    selected.push({ value: row[5], period: row[3] });
    selected.sort((left, right) => right.period.localeCompare(left.period));
    byKey.set(row[1], selected);
  }
  const latest = (key: string) => byKey.get(key)?.[0]?.value ?? null;
  const change = (key: string, periods = 4) => {
    const series = byKey.get(key) ?? [];
    return series.length > periods && series[periods].value !== 0
      ? series[0].value / Math.abs(series[periods].value) - 1 : null;
  };
  const operating = latest('quarterly_operating_income');
  const invested = latest('invested_capital');
  const roe = latest('roe');
  const revenueGrowth = change('quarterly_revenue');
  const priorGrowth = (() => {
    const series = byKey.get('quarterly_revenue') ?? [];
    return series.length > 5 && series[5].value !== 0 ? series[1].value / Math.abs(series[5].value) - 1 : null;
  })();
  const revenue = latest('quarterly_revenue');
  const margin = operating !== null && revenue ? operating / revenue : null;
  const marginPrior = (() => {
    const income = byKey.get('quarterly_operating_income') ?? [];
    const sales = byKey.get('quarterly_revenue') ?? [];
    return income.length > 4 && sales.length > 4 && sales[4].value !== 0 ? income[4].value / sales[4].value : null;
  })();
  const ocf = latest('operating_cash_flow');
  const capex = latest('capital_expenditure');
  const commonIncome = latest('quarterly_net_income_attributable_to_common') ?? latest('quarterly_net_income');
  const debt = latest('total_debt');
  const cash = latest('cash_and_equivalents');
  const ebitda = latest('quarterly_ebitda');
  const interest = latest('interest_expense');
  const components: Record<string, number | null> = {
    roicOrRoe: operating !== null && invested && invested > 0 ? clamp(50 + 500 * operating / invested)
      : roe !== null ? clamp(roe <= 1 ? 400 * roe : roe) : null,
    growthAcceleration: revenueGrowth !== null ? clamp(50 + 200 * (revenueGrowth - (priorGrowth ?? revenueGrowth))) : null,
    marginTrend: margin !== null ? clamp(50 + 300 * (margin - (marginPrior ?? margin))) : null,
    cashConversionAccruals: ocf !== null && capex !== null && commonIncome && commonIncome !== 0
      ? clamp(50 + 25 * ((ocf - Math.abs(capex)) / Math.abs(commonIncome) - 1)) : null,
    leverageInterestCover: debt !== null && ebitda && ebitda > 0
      ? clamp(75 - 12.5 * Math.max(0, (debt - (cash ?? 0)) / ebitda) + (interest && interest > 0 && operating !== null ? Math.min(25, 2.5 * operating / interest) : 0)) : null,
    revisions: change('quarterly_diluted_eps', 1) !== null ? clamp(50 + 100 * (change('quarterly_diluted_eps', 1) ?? 0)) : null,
  };
  const weights: Record<string, number> = { roicOrRoe: .25, growthAcceleration: .25, marginTrend: .15,
    cashConversionAccruals: .15, leverageInterestCover: .10, revisions: .10 };
  const available = Object.entries(components).filter((entry): entry is [string, number] => entry[1] !== null);
  const availableWeight = available.reduce((sum, [key]) => sum + weights[key], 0);
  const score = availableWeight > 0
    ? available.reduce((sum, [key, value]) => sum + weights[key] * value, 0) / availableWeight : null;
  const normalized = Object.fromEntries(Object.entries(components).map(([key, value]) => [key, value === null ? null : rounded(value)]));
  return availableWeight >= .65 && score !== null
    ? { status: 'available', reason: null, score: rounded(score), availableWeight: rounded(availableWeight),
      components: normalized, referenceManifestRef: manifestRef }
    : { status: 'unavailable', reason: 'insufficient_quality_inputs', score: null,
      availableWeight: rounded(availableWeight), components: normalized, referenceManifestRef: manifestRef || null };
}

function maDeviation(symbol: string, sector: string, technical: ReferenceBundle, bias: ReferenceBundle) {
  const history = (technical.sections.get('history_rows') ?? []).filter((row) => row[0] === symbol);
  const current = history.at(-1);
  const biasCurrent = (bias.sections.get('current_rows') ?? []).find((row) => row[1] === symbol);
  const sectorRow = (bias.sections.get('sector_rows') ?? []).find((row) => row[0] === sector);
  const unavailableOwn = { status: 'unavailable', reason: 'insufficient_own_history', count: history.length,
    p10: null, p25: null, p50: null, p75: null, p90: null, label: null, asOf: null, manifestRef: technical.manifestHash };
  const unavailableSector = { status: 'unavailable', reason: 'sector_reference_insufficient', count: Number(sectorRow?.[2] ?? 0),
    p10: null, p25: null, p50: null, p75: null, p90: null, asOf: null, manifestRef: bias.manifestHash };
  if (!current || !biasCurrent || ![3, 4, 5, 6].every((index) => finite(current[index]))) {
    return { availability: 'unavailable', reason: 'insufficient_own_history', bias20Pct: null, bias60Pct: null,
      bias120Pct: null, bias20Atr: null, ownHistory: unavailableOwn, sector: unavailableSector };
  }
  const ownValues = history.map((row) => row[3]).filter(finite);
  const ownReady = ownValues.length >= 252;
  const ownQuantiles = [0.1, .25, .5, .75, .9].map((value) => quantile(ownValues, value));
  const currentBias = Number(current[3]);
  const label = !ownReady || ownQuantiles.some((value) => value === null) ? null
    : currentBias <= ownQuantiles[0]! ? 'extreme_low' : currentBias <= ownQuantiles[1]! ? 'low'
      : currentBias <= ownQuantiles[3]! ? 'normal' : currentBias < ownQuantiles[4]! ? 'high' : 'extended';
  const ownHistory = ownReady ? { status: 'available', reason: null, count: ownValues.length,
    p10: rounded(ownQuantiles[0]!), p25: rounded(ownQuantiles[1]!), p50: rounded(ownQuantiles[2]!),
    p75: rounded(ownQuantiles[3]!), p90: rounded(ownQuantiles[4]!), label, asOf: String(current[2]),
    manifestRef: technical.manifestHash } : unavailableOwn;
  const sectorReference = sectorRow && Number(sectorRow[2]) >= 8 && [3, 4, 5, 6, 7].every((index) => finite(sectorRow[index]))
    ? { status: 'available', reason: null, count: Number(sectorRow[2]), p10: rounded(Number(sectorRow[3])),
      p25: rounded(Number(sectorRow[4])), p50: rounded(Number(sectorRow[5])), p75: rounded(Number(sectorRow[6])),
      p90: rounded(Number(sectorRow[7])), asOf: String(sectorRow[1]), manifestRef: bias.manifestHash }
    : unavailableSector;
  return { availability: 'available', reason: null, bias20Pct: rounded(Number(current[3])),
    bias60Pct: rounded(Number(current[4])), bias120Pct: rounded(Number(current[5])), bias20Atr: rounded(Number(current[6])),
    ownHistory, sector: sectorReference };
}

function relativeMultiple(symbol: string, sector: string, reportedPe: ReferenceBundle, model: JsonRecord) {
  const own = (reportedPe.sections.get('own_history_rows') ?? []).filter((row) => row[1] === symbol && finite(row[5]) && row[5] > 0);
  const current = own[0];
  const ownValues = own.map((row) => Number(row[5]));
  const sectorRow = (reportedPe.sections.get('sector_rows') ?? []).find((row) => row[0] === sector);
  const missingCurrent = { status: 'unavailable', reason: 'missing_official_pe', value: null, asOf: null,
    sourceRef: null, manifestRef: reportedPe.manifestHash };
  const currentValue = current ? { status: 'available', reason: null, value: Number(current[5]), asOf: String(current[3]),
    sourceRef: String(current[7]), manifestRef: reportedPe.manifestHash } : missingCurrent;
  const q = [0.1, .25, .5, .75, .9].map((value) => quantile(ownValues, value));
  const ownHistory = own.length >= 252 && q.every((value) => value !== null) && current
    ? { status: 'available', reason: null, count: own.length, p10: rounded(q[0]!), p25: rounded(q[1]!),
      p50: rounded(q[2]!), p75: rounded(q[3]!), p90: rounded(q[4]!),
      currentPercentile: rounded(ownValues.filter((value) => value <= Number(current[5])).length / own.length),
      asOf: String(current[3]), manifestRef: reportedPe.manifestHash }
    : { status: 'unavailable', reason: 'insufficient_own_history', count: own.length,
      p10: null, p25: null, p50: null, p75: null, p90: null, currentPercentile: null,
      asOf: null, manifestRef: reportedPe.manifestHash };
  const sectorValue = sectorRow && Number(sectorRow[2]) >= 8 && [3, 4, 5, 6].every((index) => finite(sectorRow[index]))
    ? { status: 'available', reason: null, count: Number(sectorRow[2]), p25: rounded(Number(sectorRow[3])),
      p50: rounded(Number(sectorRow[4])), p75: rounded(Number(sectorRow[5])), capWeightedAggregate: rounded(Number(sectorRow[6])),
      asOf: String(sectorRow[1]), manifestRef: reportedPe.manifestHash }
    : { status: 'unavailable', reason: 'sector_reference_insufficient', count: Number(sectorRow?.[2] ?? 0),
      p25: null, p50: null, p75: null, capWeightedAggregate: null, asOf: null, manifestRef: reportedPe.manifestHash };
  const historical = model.historicalReferenceQuantiles as JsonRecord | null;
  const peers = model.peerReferenceQuantiles as JsonRecord | null;
  const selectedModelMultiple = finite(historical?.p50) && finite(peers?.p50)
    ? 0.6 * Number(historical?.p50) + 0.4 * Number(peers?.p50)
    : finite(historical?.p50) ? Number(historical?.p50)
      : finite(peers?.p50) ? Number(peers?.p50) : null;
  const modelMethod = model.method === 'pe' || model.method === 'normalized_pe' ? model.method : null;
  const modelPe = model.status === 'normal' && modelMethod !== null && finite(selectedModelMultiple) && selectedModelMultiple > 0
    ? { value: rounded(selectedModelMultiple), method: modelMethod, asOf: String(model.asOf),
      sourceRefs: Array.isArray(model.evidenceRefs) ? model.evidenceRefs.filter((value): value is string => typeof value === 'string') : [], reason: null }
    : { value: null, method: null, asOf: null, sourceRefs: [], reason: modelMethod !== null ? 'valuation_review' : 'method_not_pe' };
  return { exchangeReportedPe: currentValue, ownHistory, sector: sectorValue, modelComparablePe: modelPe };
}

function technicalDecision(symbol: string, sourceCutoff: string, technical: ReferenceBundle, deviation: ReturnType<typeof maDeviation>) {
  const unavailable = (reason: string, asOf = sourceCutoff) => ({
    contractVersion: 'opportunity-technical-decision-v3.11.1', availability: 'unavailable', state: null, reason,
    asOf, trigger: null, entryZone: null, invalidation: null, indicators: null, maDeviation: deviation,
  });
  const sourceCutoffMs = Date.parse(sourceCutoff);
  const raw = (technical.sections.get('raw_adjusted_rows') ?? []).filter((row) => row[0] === symbol);
  if (raw.some((row) => typeof row[4] === 'string' && Date.parse(row[4]) > sourceCutoffMs)) return unavailable('future_observation');
  const blockOrdinals = raw.map((row) => row[1]).filter(finite);
  if (!blockOrdinals.length) return unavailable('insufficient_adjusted_history');
  const latestBlock = Math.max(...blockOrdinals);
  const selected = raw.filter((row) => row[1] === latestBlock).sort((left, right) => String(left[4]).localeCompare(String(right[4]))).slice(-122);
  if (selected.length < 122) return unavailable('insufficient_adjusted_history');
  if (selected.some((row) => row.length !== 11 || typeof row[4] !== 'string' || ![5, 6, 7, 8, 10].every((index) => finite(row[index]))
      || Number(row[5]) <= 0 || Number(row[6]) < Math.max(Number(row[5]), Number(row[8]))
      || Number(row[7]) > Math.min(Number(row[5]), Number(row[8])) || Number(row[10]) < 0)) return unavailable('invalid_ohlcv');
  if (selected.some((row, index) => index > 0 && String(row[4]) <= String(selected[index - 1][4]))) return unavailable('nonconsecutive_sessions');
  const benchmarkRows = (technical.sections.get('market_benchmark_rows') ?? []).slice(-122);
  if (benchmarkRows.length !== 122 || benchmarkRows.some((row, index) => row[0] !== selected[index][4] || !finite(row[1]) || row[1] <= 0)) {
    return unavailable('taiex_reference_unavailable', String(selected.at(-1)?.[4] ?? sourceCutoff));
  }
  const closes = selected.map((row) => Number(row[8])); const current = closes.at(-1)!; const previous = closes.at(-2)!;
  const ma20 = mean(closes.slice(-20)); const ma60 = mean(closes.slice(-60)); const ma120 = mean(closes.slice(-120));
  const changes = closes.slice(1).map((close, index) => close - closes[index]);
  const gain = wilder(changes.map((value) => Math.max(0, value)), 14)!;
  const loss = wilder(changes.map((value) => Math.max(0, -value)), 14)!;
  const rsi14 = gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  const trueRanges = selected.slice(1).map((row, index) => Math.max(Number(row[6]) - Number(row[7]),
    Math.abs(Number(row[6]) - closes[index]), Math.abs(Number(row[7]) - closes[index])));
  const atr14 = wilder(trueRanges, 14)!;
  const priorVolumeMean = mean(selected.slice(-21, -1).map((row) => Number(row[10])));
  if (!finite(priorVolumeMean) || priorVolumeMean <= 0) return unavailable('volume_reference_unavailable', String(selected.at(-1)![4]));
  const volumeRatio20 = Number(selected.at(-1)![10]) / priorVolumeMean;
  const ema12 = emaSeries(closes, 12); const ema26 = emaSeries(closes, 26);
  const macdSeries = closes.map((_, index) => finite(ema12[index]) && finite(ema26[index]) ? Number(ema12[index]) - Number(ema26[index]) : null).filter(finite);
  const macdSignal = emaSeries(macdSeries, 9).at(-1);
  if (!finite(macdSignal)) return unavailable('insufficient_adjusted_history', String(selected.at(-1)![4]));
  const macd = macdSeries.at(-1)!; const macdHistogram = macd - macdSignal;
  const pivots = (kind: 'low' | 'high', floor: number | null = null) => {
    const found: Array<{ index: number; value: number; session: string }> = [];
    for (let index = Math.max(2, selected.length - 60); index <= selected.length - 3; index += 1) {
      const value = Number(selected[index][kind === 'low' ? 7 : 6]);
      const neighbors = [index - 2, index - 1, index + 1, index + 2].map((candidate) => Number(selected[candidate][kind === 'low' ? 7 : 6]));
      if ((kind === 'low' ? neighbors.every((candidate) => value <= candidate) && value <= previous
        : neighbors.every((candidate) => value >= candidate) && (floor === null || value > floor))) {
        found.push({ index, value, session: String(selected[index][4]) });
      }
    }
    return found.sort((left, right) => right.index - left.index || (kind === 'low' ? left.value - right.value : right.value - left.value)
      || left.session.localeCompare(right.session))[0]?.value ?? null;
  };
  const support = pivots('low'); const resistance = support === null ? null : pivots('high', support);
  if (!finite(support) || !finite(resistance) || resistance <= support) return unavailable('insufficient_support_structure', String(selected.at(-1)![4]));
  const benchmarkCloses = benchmarkRows.map((row) => Number(row[1]));
  const relativeStrengthTaiex20 = 100 * ((current / closes.at(-21)!) - (benchmarkCloses.at(-1)! / benchmarkCloses.at(-21)!));
  const brokeSupportPrior20 = selected.slice(-21, -1).some((row) => Number(row[8]) < support);
  let state: 'below_support' | 'reclaim_required' | 'at_support' | 'breakout_pending' | 'breakout_confirmed' | 'extended' | 'invalidated';
  const resistanceTick = taiwanTick(resistance);
  if (current < support - atr14) state = 'invalidated';
  else if (previous >= support && current < support) state = 'below_support';
  else if (brokeSupportPrior20 && (current < support + .25 * atr14 || volumeRatio20 < 1.2)) state = 'reclaim_required';
  else if (current / ma20 - 1 > .12 || rsi14 >= 75) state = 'extended';
  else if (current >= resistance + resistanceTick && volumeRatio20 >= 1.2 && macdHistogram > 0 && relativeStrengthTaiex20 > 0) state = 'breakout_confirmed';
  else if (current >= support && current <= support + .5 * atr14) state = 'at_support';
  else state = 'breakout_pending';
  let trigger: JsonRecord | null = null; let entryZone: JsonRecord | null = null; let invalidation: JsonRecord | null = null;
  if (state === 'below_support' || state === 'reclaim_required') {
    trigger = { kind: 'reclaim', threshold: tickRound(support + .25 * atr14, 'up'), volumeRatioMinimum: 1.2 };
  } else if (state === 'extended') {
    trigger = { kind: 'pullback', threshold: tickRound(ma20 * 1.08, 'down'), volumeRatioMinimum: null };
  } else if (state !== 'invalidated') {
    if (state === 'breakout_pending') {
      const lower = tickRound(resistance + resistanceTick, 'up'); trigger = { kind: 'breakout', threshold: lower, volumeRatioMinimum: 1.2 };
      entryZone = { kind: 'trigger_zone', lower, upper: tickRound(resistance + .5 * atr14, 'up') };
    } else if (state === 'at_support') {
      entryZone = { kind: 'market_zone', lower: tickRound(support, 'down'), upper: tickRound(Math.max(current, support + .25 * atr14), 'up') };
    } else entryZone = { kind: 'market_zone', lower: current, upper: tickRound(current + .25 * atr14, 'up') };
    const lower = Number(entryZone.lower); const stop = tickRound(Math.min(support - .5 * atr14, lower - taiwanTick(lower)), 'down');
    invalidation = { stop, thesisLevel: support };
    if (!(lower > 0 && lower <= Number(entryZone.upper) && stop < lower
      && (entryZone.kind === 'market_zone' ? lower <= current && current <= Number(entryZone.upper) : current < lower))) {
      return unavailable('invalid_entry_geometry', String(selected.at(-1)![4]));
    }
  }
  return { contractVersion: 'opportunity-technical-decision-v3.11.1', availability: 'available', state, reason: null,
    asOf: String(selected.at(-1)![4]), currentPrice: current, support, resistance, trigger, entryZone, invalidation,
    indicators: { ma20, ma60, ma120, rsi14, macd, macdSignal, macdHistogram, atr14, volumeRatio20,
      relativeStrengthTaiex20, relativeStrengthSector20: null }, maDeviation: deviation };
}

export function buildFactorCorrectnessV311(input: {
  symbol: string; stockId: string; sector: string; sourceCutoff: string; sourcePriority: number;
  financialRows: unknown[][]; valuation: JsonRecord; technical: ReferenceBundle; bias: ReferenceBundle;
  reportedPe: ReferenceBundle; factorManifestRef: string; financialManifestRef: string;
  priorMaterialChangeHash?: string | null; priorAnalysisGeneratedAt?: string | null;
}) {
  const quality = qualityAxes(input.financialRows, input.financialManifestRef);
  const deviation = maDeviation(input.symbol, input.sector, input.technical, input.bias);
  const relative = relativeMultiple(input.symbol, input.sector, input.reportedPe, input.valuation);
  const method = String(input.valuation.method ?? '');
  const peMethod = method === 'pe' || method === 'normalized_pe';
  const peReady = relative.exchangeReportedPe.status === 'available' && relative.ownHistory.status === 'available' && relative.sector.status === 'available';
  const valuationReady = input.valuation.status === 'normal' && (!peMethod || peReady);
  const valuationScore = peMethod
    ? rounded(100 * (1 - Number(relative.ownHistory.currentPercentile)))
    : rounded(clamp(100 * Number(input.valuation.confidence ?? 0)));
  const valuationReason = input.valuation.status !== 'normal' ? 'valuation_review'
    : peMethod && relative.exchangeReportedPe.status !== 'available' ? 'missing_official_pe'
      : peMethod && relative.ownHistory.status !== 'available' ? 'insufficient_own_history'
        : peMethod && relative.sector.status !== 'available' ? 'sector_reference_insufficient' : 'valuation_review';
  const decision = technicalDecision(input.symbol, input.sourceCutoff, input.technical, deviation);
  const hardBlocked = decision.availability === 'available' &&
    ['below_support', 'reclaim_required', 'invalidated'].includes(String(decision.state));
  const biasObserveOnly = decision.availability === 'available' && !hardBlocked &&
    finite(deviation.bias20Atr) && deviation.bias20Atr <= -3;
  const timingRisk = decision.availability !== 'available'
    ? { status: 'unavailable', score: null, reason: 'technical_unavailable',
      shadowBiasPoints: { momentum_5_20d: null, swing_20_60d: null, thesis_120_250d: null } }
    : hardBlocked
      ? { status: 'blocked', score: null, reason: String(decision.state),
        shadowBiasPoints: { momentum_5_20d: 0, swing_20_60d: 0, thesis_120_250d: 0 } }
      : biasObserveOnly
        ? { status: 'observe_only', score: null, reason: 'bias_observe_only',
          shadowBiasPoints: { momentum_5_20d: 0, swing_20_60d: 0, thesis_120_250d: 0 } }
        : ['breakout_pending','extended'].includes(String(decision.state))
          ? { status: 'wait_trigger', score: decision.state === 'breakout_pending' ? 40 : 20, reason: null,
            shadowBiasPoints: { momentum_5_20d: 0, swing_20_60d: 0, thesis_120_250d: 0 } }
          : { status: 'buy_eligible', score: decision.state === 'breakout_confirmed' ? 90 : 75, reason: null,
            shadowBiasPoints: { momentum_5_20d: 0, swing_20_60d: 0, thesis_120_250d: 0 } };
  const factorAxes = {
    discovery: { status: 'continued', reason: null, score: rounded(clamp(input.sourcePriority)) },
    quality,
    valuation: valuationReady ? { status: 'normal', score: valuationScore, reason: null }
      : { status: 'valuation_review', score: null, reason: valuationReason },
    timingRisk,
  };
  const materialChangeHash = sha256Canonical(['factor-correctness-v3.11.6', input.stockId,
    semanticMaterial(input.financialRows), semanticMaterial(input.valuation), semanticMaterial(quality),
    semanticMaterial(relative), semanticMaterial(deviation), semanticMaterial(decision),
    semanticMaterial([...input.bias.sections]), semanticMaterial([...input.technical.sections]),
    semanticMaterial([...input.reportedPe.sections])]);
  const unchanged = input.priorMaterialChangeHash === materialChangeHash;
  const researchMaturity = valuationReady && quality.status === 'available' &&
    !['blocked','observe_only','unavailable'].includes(timingRisk.status)
    ? 'decision_ready' : quality.status === 'available' ? 'fundamental_review' : 'source_signal';
  const financialAsOf = input.financialRows.map((row) => row[9]).filter((value): value is string =>
    typeof value === 'string' && Date.parse(value) <= Date.parse(input.sourceCutoff))
    .sort().at(-1) ?? input.sourceCutoff;
  const risks = [
    quality.status !== 'available' ? '基本面品質輸入不足。' : null,
    input.valuation.status !== 'normal' ? '估值資料尚待覆核。' : null,
    decision.availability !== 'available' ? '技術面資料不足，無法形成進場時點。' : null,
    hardBlocked ? `技術狀態為 ${String(decision.state)}，目前不符合多頭進場條件。` : null,
    biasObserveOnly ? '乖離率風險觸發僅觀察限制。' : null,
  ].filter((risk): risk is string => risk !== null).slice(0, 4);
  return {
    researchMaturity,
    fundamental: { thesis: quality.status === 'available'
      ? `${input.symbol} 的 point-in-time 基本面品質分數為 ${String(quality.score)}，研究成熟度為 ${researchMaturity}。`
      : `${input.symbol} 已有來源訊號，但 point-in-time 基本面輸入尚不足。`,
      latestChange: unchanged ? '本次檢查未發現會改變研究判斷的重大輸入。'
        : `本次依財務、估值與技術狀態重新形成 ${researchMaturity} 判斷。`,
      risks: risks.length ? risks : ['未偵測到資料完整性或技術阻擋，但仍須持續追蹤財務與價格風險。'],
      evidenceRefs: input.financialRows.map((row) => row[12]).filter((value): value is string => typeof value === 'string').slice(0, 8),
      asOf: financialAsOf },
    technicalDecision: decision,
    relativeMultiple: relative,
    factorAxes,
    lastEvaluatedAt: input.sourceCutoff,
    analysisGeneratedAt: unchanged ? input.priorAnalysisGeneratedAt ?? input.sourceCutoff : input.sourceCutoff,
    materialChangeHash,
    materialChangedBecause: unchanged ? [] : ['factor_correctness_changed'],
    noChangeMessage: unchanged ? `已於 ${input.sourceCutoff} 檢查，無重大變化` : null,
  };
}

export function applyProductionBiasPrecedence(input: { action: string; bias20Atr: number | null; technicalState: string | null }) {
  if (finite(input.bias20Atr) && input.bias20Atr <= -3
    && !['below_support', 'reclaim_required'].includes(input.technicalState ?? '')) return 'avoid';
  return input.action;
}
