import { scenarioValuationMetrics, selectValuationMethods, type ValuationMethod } from './valuation-engine-v2.ts';

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function buildConservativeOfficialScenario(input: {
  price: number;
  epsTtm: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  revenueYoyPct: number | null;
  sector: string | null;
  historicalPeRatios: number[];
  historicalPbRatios: number[];
}) {
  const sector = String(input.sector || '').toLowerCase();
  const financial = /financial|bank|insurance|證券|銀行|金控|保險/u.test(sector);
  const cyclical = /memory|dram|nand|nor|steel|shipping|panel|cyclical|記憶體|鋼鐵|航運|面板/u.test(sector);
  const methods = selectValuationMethods({
    profitable: (input.epsTtm || 0) > 0,
    cyclicalOrAssetIntensive: cyclical,
    financialInstitution: financial,
    lossMaking: (input.epsTtm || 0) <= 0,
    verifiedTurnaroundPath: false,
    stableCashFlow: false,
  });
  let primaryMethod: ValuationMethod | null = methods.primary;
  let operatingDriver: number | null = null;
  let baseMultiple: number | null = null;
  let growthFactor = 1;
  let historicalPercentile: number | null = null;
  let multiples: [number, number, number] | null = null;
  const distribution = (values: number[]): [number, number, number] | null => {
    const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    if (sorted.length < 8) return null;
    const at = (percentile: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * percentile)))];
    return [at(0.25), at(0.5), at(0.75)];
  };
  const percentileOf = (values: number[], current: number | null) => {
    const valid = values.filter((value) => Number.isFinite(value) && value > 0);
    if (!current || valid.length < 8) return null;
    return round(valid.filter((value) => value <= current).length / valid.length * 100, 2);
  };
  if (financial && input.pbRatio && input.pbRatio > 0 && (multiples = distribution(input.historicalPbRatios))) {
    primaryMethod = 'forward_pb';
    operatingDriver = input.price / input.pbRatio;
    baseMultiple = multiples[1];
    historicalPercentile = percentileOf(input.historicalPbRatios, input.pbRatio);
  } else if (input.epsTtm && input.epsTtm > 0 && input.peRatio && input.peRatio > 0 && (multiples = distribution(input.historicalPeRatios))) {
    primaryMethod = cyclical ? 'normalized_pe' : 'forward_pe';
    const revenuePassThrough = input.revenueYoyPct == null ? 0 : Math.max(-0.15, Math.min(0.15, input.revenueYoyPct / 100 * 0.5));
    growthFactor = 1 + revenuePassThrough;
    // Use the lower of reported EPS and the exchange-implied earnings driver so
    // mismatched publication dates cannot manufacture upside.
    operatingDriver = Math.min(input.epsTtm, input.price / input.peRatio);
    baseMultiple = multiples[1];
    historicalPercentile = percentileOf(input.historicalPeRatios, input.peRatio);
  }
  if (!primaryMethod || !operatingDriver || !baseMultiple || !multiples || operatingDriver <= 0 || baseMultiple <= 0) return null;
  const bear = operatingDriver * Math.max(0.7, growthFactor - 0.1) * multiples[0];
  const base = operatingDriver * growthFactor * multiples[1];
  const bull = operatingDriver * (growthFactor + 0.1) * multiples[2];
  const metrics = scenarioValuationMetrics({ currentPrice: input.price, bear, base, bull });
  return { ...metrics, primaryMethod, growthFactor, operatingDriver: round(operatingDriver, 4), baseMultiple: round(baseMultiple, 3), historicalPercentile, historicalSampleCount: primaryMethod === 'forward_pb' ? input.historicalPbRatios.length : input.historicalPeRatios.length };
}
