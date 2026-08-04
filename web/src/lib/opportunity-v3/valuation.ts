import { roundHalfAwayFromZero } from './canonical.ts';
import { type7Quantile } from './scoring.ts';
import type { ValuationDistributionV3 } from './contracts.ts';

export type ValuationMethodInputV3 = {
  sector: string;
  bookValuePerShare?: number | null;
  roe?: number | null;
  ttmNetIncome?: number | null;
  dilutedEps?: number | null;
  depreciationAmortizationPctRevenue?: number | null;
  ttmEbitda?: number | null;
  ttmRevenue?: number | null;
  revenueYoyMedian3m?: number | null;
  grossMarginPct?: number | null;
  netDebt?: number | null;
  dilutedShares?: number | null;
  cycleNetIncome?: number[];
  evEbitdaCrossCheckAvailable?: boolean;
  roeSeries?: number[];
  pbRoeCrossCheckAvailable?: boolean;
  netAssetValue?: number | null;
};

const CYCLICAL_SECTORS = new Set(['semiconductor','steel','shipping_transport','plastics','chemical','cement',
  'paper_pulp','glass_ceramic','rubber','oil_gas_electricity']);

export type VerifiedResearchObservationV3 = {
  institutionId: string;
  metric:
    | 'diluted_eps'
    | 'ebitda'
    | 'revenue'
    | 'book_value_per_share'
    | 'target_price';
  value: number;
  unit: 'TWD' | 'TWD_per_share';
  periodEnd: string;
  sourceTimestamp: string;
  recordedAt: string;
  evidenceRef: string;
  publisherVerified: boolean;
  estimateKind: 'analyst_estimate' | 'broker_consensus';
  estimateHorizon: 'next_twelve_months' | 'target_12m';
  selectionDisposition: 'eligible_verified_estimate';
};

export type VerifiedResearchSelectionV3 = {
  retained: VerifiedResearchObservationV3[];
  excluded: Array<VerifiedResearchObservationV3 & {
    reason: 'wrong_metric' | 'invalid_unit' | 'unverified_publication' | 'stale' | 'superseded' | 'top_eight_cap';
  }>;
  distribution: { p10: number; p50: number; p90: number } | null;
};

export function selectVerifiedResearchDistribution(input: {
  observations: VerifiedResearchObservationV3[];
  metric: VerifiedResearchObservationV3['metric'];
  sourceCutoff: string;
}): VerifiedResearchSelectionV3 {
  if (input.observations.length > 100) throw new RangeError('verified research bound exceeded');
  const cutoff = new Date(input.sourceCutoff).getTime();
  if (!Number.isFinite(cutoff)) throw new TypeError('invalid source cutoff');
  const earliest = cutoff - 90 * 24 * 60 * 60 * 1000;
  const excluded: VerifiedResearchSelectionV3['excluded'] = [];
  const eligible: VerifiedResearchObservationV3[] = [];
  for (const observation of input.observations) {
    const observedAt = new Date(observation.sourceTimestamp).getTime();
    const recordedAt = new Date(observation.recordedAt).getTime();
    const expectedUnit = input.metric === 'diluted_eps' ||
      input.metric === 'book_value_per_share' ||
      input.metric === 'target_price'
      ? 'TWD_per_share'
      : 'TWD';
    const expectedEstimate =
      input.metric === 'target_price'
        ? observation.estimateKind === 'broker_consensus' &&
          observation.estimateHorizon === 'target_12m'
        : observation.estimateKind === 'analyst_estimate' &&
          observation.estimateHorizon === 'next_twelve_months';
    const reason =
      observation.metric !== input.metric ? 'wrong_metric' :
      observation.unit !== expectedUnit || !positive(observation.value) ? 'invalid_unit' :
      !observation.publisherVerified ||
        observation.institutionId.length === 0 ||
        observation.selectionDisposition !== 'eligible_verified_estimate' ||
        !expectedEstimate
        ? 'unverified_publication' :
      !Number.isFinite(observedAt) || !Number.isFinite(recordedAt) ||
        observedAt < earliest || observedAt > cutoff || recordedAt > cutoff
        ? 'stale' :
      null;
    if (reason) excluded.push({ ...observation, reason });
    else eligible.push(observation);
  }
  eligible.sort((left, right) =>
    left.institutionId.localeCompare(right.institutionId) ||
    new Date(right.sourceTimestamp).getTime() - new Date(left.sourceTimestamp).getTime() ||
    left.evidenceRef.localeCompare(right.evidenceRef));
  const latest: VerifiedResearchObservationV3[] = [];
  for (const observation of eligible) {
    if (latest.some((row) => row.institutionId === observation.institutionId)) {
      excluded.push({ ...observation, reason: 'superseded' });
    } else {
      latest.push(observation);
    }
  }
  latest.sort((left, right) =>
    new Date(right.sourceTimestamp).getTime() - new Date(left.sourceTimestamp).getTime() ||
    left.institutionId.localeCompare(right.institutionId) ||
    left.evidenceRef.localeCompare(right.evidenceRef));
  const retained = latest.slice(0, 8);
  excluded.push(...latest.slice(8).map((observation) => ({
    ...observation,
    reason: 'top_eight_cap' as const,
  })));
  const distribution = retained.length < 3 ? null : {
    p10: type7Quantile(retained.map((row) => row.value), 0.1)!,
    p50: type7Quantile(retained.map((row) => row.value), 0.5)!,
    p90: type7Quantile(retained.map((row) => row.value), 0.9)!,
  };
  return { retained, excluded, distribution };
}

export function selectValuationMethod(input: ValuationMethodInputV3): ValuationDistributionV3['method'] {
  if (input.sector === 'finance_insurance' && positive(input.bookValuePerShare) && positive(input.roe)) {
    return input.roeSeries?.length === 8 && input.roeSeries.every(finite) && input.pbRoeCrossCheckAvailable === true
      ? 'residual_income' : 'pb_roe';
  }
  if (input.sector === 'construction' && positive(input.netAssetValue) && positive(input.dilutedShares)) return 'nav';
  if (CYCLICAL_SECTORS.has(input.sector) && (input.cycleNetIncome?.length ?? 0) > 0) {
    const normalized = input.cycleNetIncome?.length === 12 && input.cycleNetIncome.every(finite)
      ? (type7Quantile(input.cycleNetIncome, 0.5) ?? 0) * 4 : 0;
    return normalized > 0
      && input.evEbitdaCrossCheckAvailable === true ? 'normalized_pe' : null;
  }
  if (
    positive(input.ttmNetIncome) &&
    positive(input.dilutedEps) &&
    finite(input.depreciationAmortizationPctRevenue) &&
    (input.depreciationAmortizationPctRevenue ?? 100) < 8
  ) return 'pe';
  if (positive(input.ttmEbitda)) return 'ev_ebitda';
  if (
    !positive(input.ttmNetIncome) &&
    !positive(input.ttmEbitda) &&
    positive(input.ttmRevenue) &&
    (input.revenueYoyMedian3m ?? -Infinity) >= 20 &&
    positive(input.grossMarginPct) &&
    finite(input.netDebt) &&
    positive(input.dilutedShares)
  ) return 'ev_sales';
  return null;
}

function finite(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function positive(value: number | null | undefined): boolean {
  return finite(value) && (value ?? 0) > 0;
}

function winsorizedQuantiles(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!finiteValues.length) return null;
  const low = type7Quantile(finiteValues, 0.1) ?? 0;
  const high = type7Quantile(finiteValues, 0.9) ?? 0;
  const prepared = finiteValues.map((value) => Math.min(high, Math.max(low, value)));
  return {
    p10: type7Quantile(prepared, 0.1) ?? 0,
    p50: type7Quantile(prepared, 0.5) ?? 0,
    p90: type7Quantile(prepared, 0.9) ?? 0,
  };
}

export function buildValuationDistribution(input: {
  method: NonNullable<ValuationDistributionV3['method']>;
  fundamentals: [number, number, number];
  historicalMultiples: number[];
  peerMultiples: number[];
  currentPrice: number;
  netDebt?: number;
  dilutedShares?: number;
  consensusP50?: number | null;
  asOf?: string;
  evidenceRefs?: string[];
  referenceManifestRef?: string | null;
  historicalReference?: { count: number; p10: number; p50: number; p90: number } | null;
  peerReference?: { count: number; p10: number; p50: number; p90: number } | null;
  crossChecks?: Array<{ method: NonNullable<ValuationDistributionV3['method']>; bear: number; base: number; bull: number;
    asOf: string; evidenceRefs: string[] }>;
  formulaSourceRef?: string;
  formulaFundamentalKey?: string;
  formulaFundamentalUnit?: string;
  methodOperands?: {
    nav?: { netAssetValue: number; dilutedShares: number; discounts: [number,number,number]; sourceRef: string; asOf: string };
    residualIncome?: { bookValuePerShare: number; roes: [number,number,number]; costs: [number,number,number];
      growth: [number,number,number]; sourceRef: string; asOf: string };
  };
}): ValuationDistributionV3 {
  if (typeof input.formulaSourceRef !== 'string' ||
    !/^(?:official|mops|twse|tpex|company):/u.test(input.formulaSourceRef) ||
    !(input.evidenceRefs ?? []).includes(input.formulaSourceRef)) {
    return {
      status: 'missing', method: null, p10: null, p50: null, p90: null, bear: null, base: null, bull: null,
      crossChecks: [], confidence: null, reasons: ['missing_formula_source'],
      ...valuationLineage(input.asOf, null, input.referenceManifestRef ?? null, 0, 0, null, null),
    };
  }
  const directFairValueMethod = input.method === 'residual_income' || input.method === 'nav';
  const historicalCount = input.historicalReference?.count ??
    Math.min(20, input.historicalMultiples.length);
  const peerCount = input.peerReference?.count ??
    Math.min(20_000, input.peerMultiples.length);
  const historical = input.historicalReference && input.historicalReference.count >= 8
    ? {
      p10: input.historicalReference.p10,
      p50: input.historicalReference.p50,
      p90: input.historicalReference.p90,
    }
    : input.historicalMultiples.length >= 8
      ? winsorizedQuantiles(input.historicalMultiples.slice(0, 20))
      : null;
  const peers = input.peerReference && input.peerReference.count >= 5
    ? {
      p10: input.peerReference.p10,
      p50: input.peerReference.p50,
      p90: input.peerReference.p90,
    }
    : input.peerMultiples.length >= 5
      ? winsorizedQuantiles(input.peerMultiples.slice(0, 20_000))
      : null;
  if (!directFairValueMethod && !historical && !peers) {
    return {
      status: 'missing', method: null, p10: null, p50: null, p90: null, bear: null, base: null, bull: null,
      crossChecks: [], confidence: null,
      reasons: ['insufficient_multiple_reference'], ...valuationLineage(input.asOf, null, null, 0, 0, null, null),
    };
  }
  const multiple = ([0.1, 0.5, 0.9] as const).map((_, index) => {
    const key = (['p10', 'p50', 'p90'] as const)[index];
    if (historical && peers) return 0.6 * historical[key] + 0.4 * peers[key];
    return (historical ?? peers)?.[key] ?? 1;
  }) as [number, number, number];
  const residualValue = (index: number) => {
    const operand = input.methodOperands?.residualIncome;
    if (!operand) return Number.NaN;
    const residual = ((operand.roes[index] - operand.costs[index]) * operand.bookValuePerShare) /
      (operand.costs[index] - operand.growth[index]);
    return operand.bookValuePerShare + Math.max(-operand.bookValuePerShare, residual);
  };
  const navValue = (index: number) => {
    const operand = input.methodOperands?.nav;
    return operand ? operand.netAssetValue / operand.dilutedShares * operand.discounts[index] : Number.NaN;
  };
  const values = input.fundamentals.map((fundamental, index) => {
    if (input.method === 'residual_income') return residualValue(index);
    if (input.method === 'nav') return navValue(index);
    const enterpriseOrEquity = directFairValueMethod ? fundamental : fundamental * multiple[index];
    if (input.method === 'ev_ebitda' || input.method === 'ev_sales') {
      if (!positive(input.dilutedShares) || !finite(input.netDebt)) return Number.NaN;
      return (enterpriseOrEquity - (input.netDebt ?? 0)) / (input.dilutedShares ?? 0);
    }
    return enterpriseOrEquity;
  });
  const reasons: string[] = [];
  if (values.some((value) => !Number.isFinite(value))) reasons.push('non_finite_distribution');
  else if (values.some((value) => value < 0)) reasons.push('negative_equity_value');
  else if (!(values[0] <= values[1] && values[1] <= values[2])) reasons.push('distribution_ordering');
  if (Number.isFinite(values[1]) && 100 * (values[1] / input.currentPrice - 1) > 80) reasons.push('unverified_base_upside');
  if (Number.isFinite(values[2]) && 100 * (values[2] / input.currentPrice - 1) > 150) reasons.push('unverified_scenario_upside');
  if (
    finite(input.consensusP50) &&
    Math.abs(100 * (values[1] / input.currentPrice - 1) - 100 * ((input.consensusP50 ?? 0) / input.currentPrice - 1)) > 35
  ) reasons.push('consensus_divergence');
  const crossChecks = (input.crossChecks ?? []).slice(0, 2);
  if (['normalized_pe','residual_income'].includes(input.method) && crossChecks.length !== 1) reasons.push('cross_check_unavailable');
  if (crossChecks.some((crossCheck) => Math.abs(values[1] - crossCheck.base) / Math.max(Math.abs(values[1]), 0.01) > 0.35)) {
    reasons.push('method_divergence');
  }
  const invalid = reasons.some((reason) => ['negative_equity_value', 'non_finite_distribution'].includes(reason));
  const sampleConfidence = Math.min(1,
    (Math.min(20, historicalCount) / 20) * 0.6 +
    (Math.min(10, peerCount) / 10) * 0.4);
  const dispersionConfidence = Number.isFinite(values[0]) && Number.isFinite(values[2])
    ? Math.min(1, Math.max(0, 1 - (values[2] - values[0]) / Math.max(Math.abs(values[1]), 0.01)))
    : 0;
  const publicEvidenceRefs = [
    input.formulaSourceRef,
    ...(input.evidenceRefs ?? []).filter((ref) => ref !== input.formulaSourceRef),
  ].filter((ref, index, refs): ref is string => typeof ref === 'string' && refs.indexOf(ref) === index).slice(0, 8);
  return {
    status: reasons.length ? 'outlier_review' : 'normal',
    method: input.method,
    p10: invalid ? null : roundHalfAwayFromZero(values[0], 2),
    p50: invalid ? null : roundHalfAwayFromZero(values[1], 2),
    p90: invalid ? null : roundHalfAwayFromZero(values[2], 2),
    bear: invalid ? null : valuationScenario('bear', values[0], multiple[0], input),
    base: invalid ? null : valuationScenario('base', values[1], multiple[1], input),
    bull: invalid ? null : valuationScenario('bull', values[2], multiple[2], input),
    crossChecks,
    confidence: invalid ? null : roundHalfAwayFromZero(0.5 + 0.3 * sampleConfidence + 0.2 * dispersionConfidence, 4),
    reasons,
    ...valuationLineage(
      input.asOf,
      null,
      input.referenceManifestRef ?? null,
      historicalCount,
      peerCount,
      historical,
      peers,
    ),
    evidenceRefs: publicEvidenceRefs,
  };
}

function valuationScenario(caseName: 'bear'|'base'|'bull', value: number, multiple: number, input: {
  method: NonNullable<ValuationDistributionV3['method']>; fundamentals: [number,number,number];
  asOf?: string; evidenceRefs?: string[]; referenceManifestRef?: string | null;
  formulaSourceRef?: string; formulaFundamentalKey?: string; formulaFundamentalUnit?: string;
  netDebt?: number; dilutedShares?: number;
  methodOperands?: {
    nav?: { netAssetValue: number; dilutedShares: number; discounts: [number,number,number]; sourceRef: string; asOf: string };
    residualIncome?: { bookValuePerShare: number; roes: [number,number,number]; costs: [number,number,number];
      growth: [number,number,number]; sourceRef: string; asOf: string };
  };
}) {
  const index = caseName === 'bear' ? 0 : caseName === 'base' ? 1 : 2;
  const asOf = input.asOf ?? '1970-01-01T00:00:00Z';
  const fundamental = input.fundamentals[index];
  const direct = input.method === 'residual_income' || input.method === 'nav';
  const factor = direct ? 1 : multiple;
  const enterprise = input.method === 'ev_ebitda' || input.method === 'ev_sales';
  const recompute = (nextFundamental: number, nextFactor: number) => {
    const grossValue = nextFundamental * nextFactor;
    return enterprise
      ? (grossValue - Number(input.netDebt)) / Number(input.dilutedShares)
      : grossValue;
  };
  const sourceRef = input.formulaSourceRef!;
  const referenceRef = input.referenceManifestRef ?? sourceRef;
  let formulaInputs = [
    { key: input.formulaFundamentalKey ?? 'primary_fundamental', value: fundamental,
      unit: input.formulaFundamentalUnit ?? 'method_native', sourceRef, asOf },
    { key: direct ? 'discount_factor' : 'selected_multiple', value: factor,
      unit: 'ratio', sourceRef: referenceRef, asOf },
  ];
  if (enterprise) formulaInputs.push(
    { key: 'net_debt', value: Number(input.netDebt), unit: 'TWD', sourceRef, asOf },
    { key: 'diluted_weighted_shares', value: Number(input.dilutedShares), unit: 'shares', sourceRef, asOf },
  );
  let sensitivity = [
    { key: 'fundamental', delta: -0.1, result: roundHalfAwayFromZero(recompute(fundamental * 0.9, factor), 2) },
    { key: 'fundamental', delta: 0.1, result: roundHalfAwayFromZero(recompute(fundamental * 1.1, factor), 2) },
    { key: 'multiple_or_discount', delta: -0.1, result: roundHalfAwayFromZero(recompute(fundamental, factor * 0.9), 2) },
    { key: 'multiple_or_discount', delta: 0.1, result: roundHalfAwayFromZero(recompute(fundamental, factor * 1.1), 2) },
  ];
  if (input.method === 'nav' && input.methodOperands?.nav) {
    const operand = input.methodOperands.nav; const discount = operand.discounts[index];
    const nav = (asset: number, nextDiscount: number) => asset / operand.dilutedShares * nextDiscount;
    formulaInputs = [
      { key: 'net_asset_value', value: operand.netAssetValue, unit: 'TWD', sourceRef: operand.sourceRef, asOf: operand.asOf },
      { key: 'diluted_weighted_shares', value: operand.dilutedShares, unit: 'shares', sourceRef: operand.sourceRef, asOf: operand.asOf },
      { key: 'nav_discount', value: discount, unit: 'ratio', sourceRef: referenceRef, asOf: operand.asOf },
    ];
    sensitivity = [
      { key: 'fundamental', delta: -0.1, result: roundHalfAwayFromZero(nav(operand.netAssetValue * 0.9, discount), 2) },
      { key: 'fundamental', delta: 0.1, result: roundHalfAwayFromZero(nav(operand.netAssetValue * 1.1, discount), 2) },
      { key: 'multiple_or_discount', delta: -0.1, result: roundHalfAwayFromZero(nav(operand.netAssetValue, discount * 0.9), 2) },
      { key: 'multiple_or_discount', delta: 0.1, result: roundHalfAwayFromZero(nav(operand.netAssetValue, discount * 1.1), 2) },
    ];
  } else if (input.method === 'residual_income' && input.methodOperands?.residualIncome) {
    const operand = input.methodOperands.residualIncome; const roe = operand.roes[index];
    const cost = operand.costs[index]; const growth = operand.growth[index];
    const residual = (book: number, nextCost: number) => book + Math.max(-book,
      ((roe - nextCost) * book) / (nextCost - growth));
    formulaInputs = [
      { key: 'book_value_per_share', value: operand.bookValuePerShare, unit: 'TWD_per_share', sourceRef: operand.sourceRef, asOf: operand.asOf },
      { key: 'scenario_roe', value: roe, unit: 'ratio', sourceRef: operand.sourceRef, asOf: operand.asOf },
      { key: 'cost_of_equity', value: cost, unit: 'ratio', sourceRef: referenceRef, asOf: operand.asOf },
      { key: 'terminal_growth', value: growth, unit: 'ratio', sourceRef: referenceRef, asOf: operand.asOf },
    ];
    sensitivity = [
      { key: 'fundamental', delta: -0.1, result: roundHalfAwayFromZero(residual(operand.bookValuePerShare * 0.9, cost), 2) },
      { key: 'fundamental', delta: 0.1, result: roundHalfAwayFromZero(residual(operand.bookValuePerShare * 1.1, cost), 2) },
      { key: 'multiple_or_discount', delta: -0.1, result: roundHalfAwayFromZero(residual(operand.bookValuePerShare, cost * 0.9), 2) },
      { key: 'multiple_or_discount', delta: 0.1, result: roundHalfAwayFromZero(residual(operand.bookValuePerShare, cost * 1.1), 2) },
    ];
  }
  return {
    case: caseName, value: roundHalfAwayFromZero(value, 2), asOf,
    inputs: formulaInputs,
    sensitivity,
  };
}

function valuationLineage(
  asOf: string | undefined,
  verificationRef: string | null,
  referenceManifestRef: string | null,
  historicalSampleCount: number,
  peerSampleCount: number,
  historicalReferenceQuantiles: { p10: number; p50: number; p90: number } | null,
  peerReferenceQuantiles: { p10: number; p50: number; p90: number } | null,
) {
  return {
    asOf: asOf ?? '1970-01-01T00:00:00Z',
    evidenceRefs: [] as string[],
    verificationRef,
    referenceManifestRef,
    historicalSampleCount,
    peerSampleCount,
    historicalReferenceQuantiles,
    peerReferenceQuantiles,
  };
}

export function verificationFresh(reviewTimestamp: string, sourceCutoff: string): boolean {
  const expiry = new Date(reviewTimestamp).getTime() + 30 * 24 * 60 * 60 * 1000;
  return new Date(sourceCutoff).getTime() < expiry;
}
