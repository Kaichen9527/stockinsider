export type SegmentKey = 'mobility' | 'vertical' | 'display' | 'other';

export type SegmentInput = {
  revenue: number;
  operatingMargin: number;
};

export type ForecastQuarterInput = {
  period: string;
  year: number;
  segments: Record<SegmentKey, SegmentInput>;
  corporateAndOtherOperatingIncome: number;
  recurringNonOperatingIncome: number;
  taxRate: number;
  nonControllingInterest: number;
  oneOffAfterTax: number;
};

export type ScenarioAdjustment = {
  label: string;
  revenueMultiplier: Record<SegmentKey, number>;
  marginDelta: Record<SegmentKey, number>;
  fairPe: number | null;
  fairPb: number;
};

export type ForecastQuarter = ForecastQuarterInput & {
  revenue: number;
  segmentOperatingIncome: number;
  operatingIncome: number;
  pretaxIncome: number;
  normalizedNetIncome: number;
  reportedNetIncome: number;
  normalizedEps: number;
  reportedEps: number;
};

export type ForecastScenario = {
  id: string;
  label: string;
  quarters: ForecastQuarter[];
  annual: Array<{
    year: number;
    revenue: number;
    operatingIncome: number;
    normalizedNetIncome: number;
    normalizedEps: number;
    reportedEps: number;
  }>;
  valuation: {
    fairPe: number | null;
    peValue: number | null;
    fairPb: number;
    pbValue: number;
    referenceValue: number;
  };
};

export type PriceBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type TechnicalSnapshot = {
  asOf: string;
  close: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
  ma240: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  rsi14: number | null;
  atr14: number | null;
  averageVolume20: number | null;
  volumeRatio20: number | null;
  priorHigh20: number | null;
  priorHigh60: number | null;
  stale: boolean;
};

export type EntryPlan = {
  status: 'wait' | 'active' | 'invalid';
  pullback: {
    lower: number | null;
    upper: number | null;
    invalidation: number | null;
    firstTarget: number | null;
    secondTarget: number | null;
    rewardRisk: number | null;
  };
  breakout: {
    trigger: number | null;
    minimumVolume: number | null;
    invalidation: number | null;
    firstTarget: number | null;
    secondTarget: number | null;
    rewardRisk: number | null;
  };
};

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const roundNullable = (value: number | null, digits = 2) => value === null ? null : round(value, digits);

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateForwardPe(price: number, eps: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(eps) || eps <= 0.1) return null;
  return round(price / eps, 1);
}

export function requiredEarningsAtMultiple(
  price: number,
  multiple: number,
  dilutedSharesMillion: number,
  revenueMillion: number,
) {
  const eps = price / multiple;
  const netIncome = eps * dilutedSharesMillion;
  return {
    eps: round(eps, 2),
    netIncome: round(netIncome, 0),
    netMargin: round(netIncome / revenueMillion, 4),
  };
}

export function combineActualAndForecastYear(args: {
  actual: { revenue: number; operatingIncome: number; normalizedNetIncome: number; reportedNetIncome: number };
  forecast: { revenue: number; operatingIncome: number; normalizedNetIncome: number; reportedNetIncome: number };
  dilutedSharesMillion: number;
}) {
  const revenue = args.actual.revenue + args.forecast.revenue;
  const operatingIncome = args.actual.operatingIncome + args.forecast.operatingIncome;
  const normalizedNetIncome = args.actual.normalizedNetIncome + args.forecast.normalizedNetIncome;
  const reportedNetIncome = args.actual.reportedNetIncome + args.forecast.reportedNetIncome;
  return {
    revenue: round(revenue, 0),
    operatingIncome: round(operatingIncome, 0),
    normalizedNetIncome: round(normalizedNetIncome, 0),
    reportedNetIncome: round(reportedNetIncome, 0),
    normalizedEps: round(normalizedNetIncome / args.dilutedSharesMillion, 2),
    reportedEps: round(reportedNetIncome / args.dilutedSharesMillion, 2),
  };
}

function applyAdjustment(
  quarter: ForecastQuarterInput,
  adjustment: ScenarioAdjustment,
): ForecastQuarterInput {
  const segments = Object.fromEntries(
    (Object.entries(quarter.segments) as Array<[SegmentKey, SegmentInput]>).map(([key, segment]) => [
      key,
      {
        revenue: segment.revenue * adjustment.revenueMultiplier[key],
        operatingMargin: segment.operatingMargin + adjustment.marginDelta[key],
      },
    ]),
  ) as Record<SegmentKey, SegmentInput>;
  return { ...quarter, segments };
}

export function calculateQuarter(
  input: ForecastQuarterInput,
  dilutedSharesMillion: number,
): ForecastQuarter {
  const segmentRows = Object.values(input.segments);
  const revenue = segmentRows.reduce((sum, segment) => sum + segment.revenue, 0);
  const segmentOperatingIncome = segmentRows.reduce(
    (sum, segment) => sum + segment.revenue * segment.operatingMargin,
    0,
  );
  const operatingIncome = segmentOperatingIncome + input.corporateAndOtherOperatingIncome;
  const pretaxIncome = operatingIncome + input.recurringNonOperatingIncome;
  const tax = pretaxIncome > 0 ? pretaxIncome * input.taxRate : 0;
  const normalizedNetIncome = pretaxIncome - tax - input.nonControllingInterest;
  const reportedNetIncome = normalizedNetIncome + input.oneOffAfterTax;
  return {
    ...input,
    revenue: round(revenue, 0),
    segmentOperatingIncome: round(segmentOperatingIncome, 0),
    operatingIncome: round(operatingIncome, 0),
    pretaxIncome: round(pretaxIncome, 0),
    normalizedNetIncome: round(normalizedNetIncome, 0),
    reportedNetIncome: round(reportedNetIncome, 0),
    normalizedEps: round(normalizedNetIncome / dilutedSharesMillion, 2),
    reportedEps: round(reportedNetIncome / dilutedSharesMillion, 2),
  };
}

export function buildForecastScenario(args: {
  id: string;
  baseQuarters: ForecastQuarterInput[];
  adjustment: ScenarioAdjustment;
  dilutedSharesMillion: number;
  bookValuePerShare: number;
  valuationYear: number;
}): ForecastScenario {
  const quarters = args.baseQuarters.map((quarter) => calculateQuarter(
    applyAdjustment(quarter, args.adjustment),
    args.dilutedSharesMillion,
  ));
  const years = [...new Set(quarters.map((quarter) => quarter.year))];
  const annual = years.map((year) => {
    const rows = quarters.filter((quarter) => quarter.year === year);
    const normalizedNetIncome = rows.reduce((sum, row) => sum + row.normalizedNetIncome, 0);
    const reportedNetIncome = rows.reduce((sum, row) => sum + row.reportedNetIncome, 0);
    return {
      year,
      revenue: round(rows.reduce((sum, row) => sum + row.revenue, 0), 0),
      operatingIncome: round(rows.reduce((sum, row) => sum + row.operatingIncome, 0), 0),
      normalizedNetIncome: round(normalizedNetIncome, 0),
      normalizedEps: round(normalizedNetIncome / args.dilutedSharesMillion, 2),
      reportedEps: round(reportedNetIncome / args.dilutedSharesMillion, 2),
    };
  });
  const valuationYear = annual.find((row) => row.year === args.valuationYear);
  const peValue = valuationYear && args.adjustment.fairPe && valuationYear.normalizedEps > 0.1
    ? round(valuationYear.normalizedEps * args.adjustment.fairPe, 1)
    : null;
  const pbValue = round(args.bookValuePerShare * args.adjustment.fairPb, 1);
  const referenceValue = peValue === null
    ? pbValue
    : round(peValue * 0.35 + pbValue * 0.65, 1);
  return {
    id: args.id,
    label: args.adjustment.label,
    quarters,
    annual,
    valuation: {
      fairPe: args.adjustment.fairPe,
      peValue,
      fairPb: args.adjustment.fairPb,
      pbValue,
      referenceValue,
    },
  };
}

function ema(values: number[], periods: number): number[] {
  if (!values.length) return [];
  const multiplier = 2 / (periods + 1);
  let current = values[0];
  return values.map((value, index) => {
    if (index === 0) return current;
    current = value * multiplier + current * (1 - multiplier);
    return current;
  });
}

function wilderRsi(values: number[], periods: number): number | null {
  if (values.length <= periods) return null;
  const changes = values.slice(1).map((value, index) => value - values[index]);
  let averageGain = changes.slice(0, periods).reduce((sum, value) => sum + Math.max(value, 0), 0) / periods;
  let averageLoss = changes.slice(0, periods).reduce((sum, value) => sum + Math.max(-value, 0), 0) / periods;
  for (const change of changes.slice(periods)) {
    averageGain = (averageGain * (periods - 1) + Math.max(change, 0)) / periods;
    averageLoss = (averageLoss * (periods - 1) + Math.max(-change, 0)) / periods;
  }
  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

function wilderAtr(rows: PriceBar[], periods: number): number | null {
  if (rows.length <= periods) return null;
  const trueRanges = rows.map((row, index) => {
    if (index === 0) return row.high - row.low;
    const previousClose = rows[index - 1].close;
    return Math.max(row.high - row.low, Math.abs(row.high - previousClose), Math.abs(row.low - previousClose));
  });
  let value = trueRanges.slice(1, periods + 1).reduce((sum, item) => sum + item, 0) / periods;
  for (const range of trueRanges.slice(periods + 1)) value = (value * (periods - 1) + range) / periods;
  return value;
}

function movingAverage(values: number[], periods: number): number | null {
  if (values.length < periods) return null;
  return average(values.slice(-periods));
}

export function calculateTechnicalSnapshot(
  bars: PriceBar[],
  asOfDate: Date,
  staleAfterDays = 7,
): TechnicalSnapshot | null {
  if (!bars.length) return null;
  const closes = bars.map((bar) => bar.close);
  const macdFast = ema(closes, 12);
  const macdSlow = ema(closes, 26);
  const macdLine = closes.map((_, index) => macdFast[index] - macdSlow[index]);
  const signal = ema(macdLine, 9);
  const last = bars.at(-1)!;
  const parseRocDate = (value: string) => {
    const [rocYear, month, day] = value.split('/').map(Number);
    return new Date(Date.UTC(rocYear + 1911, month - 1, day));
  };
  const lastDate = parseRocDate(last.date);
  const ageDays = Math.floor((asOfDate.getTime() - lastDate.getTime()) / 86_400_000);
  const avgVolume20 = average(bars.slice(-20).map((bar) => bar.volume));
  return {
    asOf: last.date,
    close: last.close,
    ma5: roundNullable(movingAverage(closes, 5), 2),
    ma20: roundNullable(movingAverage(closes, 20), 2),
    ma60: roundNullable(movingAverage(closes, 60), 2),
    ma120: roundNullable(movingAverage(closes, 120), 2),
    ma240: roundNullable(movingAverage(closes, 240), 2),
    macd: macdLine.length ? round(macdLine.at(-1)!, 2) : null,
    macdSignal: signal.length ? round(signal.at(-1)!, 2) : null,
    macdHistogram: round((macdLine.at(-1) ?? 0) - (signal.at(-1) ?? 0), 2),
    rsi14: round(wilderRsi(closes, 14) ?? Number.NaN, 1),
    atr14: round(wilderAtr(bars, 14) ?? Number.NaN, 2),
    averageVolume20: avgVolume20 === null ? null : round(avgVolume20, 0),
    volumeRatio20: avgVolume20 === null ? null : round(last.volume / avgVolume20, 2),
    priorHigh20: round(Math.max(...bars.slice(-21, -1).map((bar) => bar.high)), 2),
    priorHigh60: round(Math.max(...bars.slice(-61, -1).map((bar) => bar.high)), 2),
    stale: ageDays > staleAfterDays || ageDays < 0,
  };
}

export function classifyResearchVerdict(args: {
  price: number;
  baseReferenceValue: number;
  technical: TechnicalSnapshot | null;
}) {
  const mediumTerm = args.price > args.baseReferenceValue * 1.15
    ? 'low_attractiveness'
    : args.price < args.baseReferenceValue * 0.9 ? 'attractive' : 'fair';
  const shortTerm = !args.technical || args.technical.stale
    ? 'unavailable'
    : args.technical.ma20 !== null && args.technical.ma60 !== null
      && args.technical.close > args.technical.ma20 && args.technical.ma20 > args.technical.ma60
      && (args.technical.macdHistogram ?? -1) > 0
      ? 'bullish_wait_for_trigger'
      : 'neutral_or_weak';
  return { mediumTerm, shortTerm } as const;
}

export function buildEntryPlan(snapshot: TechnicalSnapshot | null): EntryPlan {
  if (!snapshot || snapshot.stale || snapshot.ma5 === null || snapshot.ma20 === null || snapshot.atr14 === null
    || snapshot.priorHigh20 === null || snapshot.priorHigh60 === null || snapshot.averageVolume20 === null) {
    return {
      status: 'invalid',
      pullback: { lower: null, upper: null, invalidation: null, firstTarget: null, secondTarget: null, rewardRisk: null },
      breakout: { trigger: null, minimumVolume: null, invalidation: null, firstTarget: null, secondTarget: null, rewardRisk: null },
    };
  }
  const lower = Math.min(snapshot.ma20, snapshot.ma5);
  const upper = Math.max(snapshot.ma20, snapshot.ma5);
  const invalidation = round(snapshot.ma20 - snapshot.atr14 * 1.5, 1);
  const pullbackEntry = (lower + upper) / 2;
  const secondTarget = snapshot.priorHigh60;
  const breakoutTrigger = snapshot.priorHigh20;
  const breakoutInvalidation = round(Math.max(snapshot.ma5, breakoutTrigger - snapshot.atr14 * 1.65), 1);
  const measuredMove = round(breakoutTrigger + (breakoutTrigger - snapshot.ma20), 1);
  return {
    status: 'wait',
    pullback: {
      lower: round(lower, 1),
      upper: round(upper, 1),
      invalidation,
      firstTarget: breakoutTrigger,
      secondTarget,
      rewardRisk: round((secondTarget - pullbackEntry) / (pullbackEntry - invalidation), 1),
    },
    breakout: {
      trigger: round(breakoutTrigger, 1),
      minimumVolume: round(snapshot.averageVolume20 * 1.5, 0),
      invalidation: breakoutInvalidation,
      firstTarget: secondTarget,
      secondTarget: measuredMove,
      rewardRisk: round((measuredMove - breakoutTrigger) / (breakoutTrigger - breakoutInvalidation), 1),
    },
  };
}

export function validateResearchInputs(args: {
  segmentDataAvailable: boolean;
  sourceConflictCount: number;
  technical: TechnicalSnapshot | null;
}) {
  const warnings: string[] = [];
  if (!args.segmentDataAvailable) warnings.push('segment_data_missing');
  if (args.sourceConflictCount > 0) warnings.push('source_conflicts_require_review');
  if (!args.technical || args.technical.stale) warnings.push('technical_data_stale');
  return { complete: warnings.length === 0, warnings };
}
