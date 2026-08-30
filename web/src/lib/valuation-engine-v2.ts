export const VALUATION_MODEL_VERSION = 'valuation-engine-v2.0.0';

export type ValuationMethod = 'forward_pe' | 'normalized_pe' | 'ev_ebitda' | 'forward_pb'
  | 'ev_sales' | 'ev_gross_profit' | 'dcf';

export type CompanyValuationProfile = {
  profitable: boolean;
  cyclicalOrAssetIntensive: boolean;
  financialInstitution: boolean;
  lossMaking: boolean;
  verifiedTurnaroundPath: boolean;
  stableCashFlow: boolean;
};

export type InvestAnchorsResearchFrame = {
  productAndRevenueMix: string[];
  demandDrivers: string[];
  customerCertificationShipmentTimeline: string[];
  capacityYieldAsp: string[];
  revenueGrossMarginEpsFcfBridge: string[];
  catalysts: string[];
  risks: string[];
  invalidationConditions: string[];
  sourceRefs: string[];
};

export type MultipleValuationInput = {
  method: Exclude<ValuationMethod, 'dcf'>;
  operatingDriverPerShare?: number | null;
  operatingDriverTotal?: number | null;
  multiple: number;
  netDebt?: number | null;
  dilutedShares?: number | null;
};

export type ScenarioTargets = {
  currentPrice: number;
  bear: number;
  base: number;
  bull: number;
  probabilities?: { bear: number; base: number; bull: number };
};

export function selectValuationMethods(profile: CompanyValuationProfile): { primary: ValuationMethod | null; crossCheck: ValuationMethod | null; blockedReason?: string } {
  if (profile.financialInstitution) return { primary: 'forward_pb', crossCheck: profile.profitable ? 'forward_pe' : null };
  if (profile.lossMaking) {
    return profile.verifiedTurnaroundPath
      ? { primary: 'ev_sales', crossCheck: 'ev_gross_profit' }
      : { primary: null, crossCheck: null, blockedReason: 'unverified_turnaround_path' };
  }
  if (profile.cyclicalOrAssetIntensive) return { primary: 'normalized_pe', crossCheck: 'ev_ebitda' };
  return { primary: 'forward_pe', crossCheck: profile.stableCashFlow ? 'dcf' : null };
}

function positive(value: number | null | undefined, label: string): number {
  if (value == null || !Number.isFinite(value) || value <= 0) throw new Error(`invalid_${label}`);
  return value;
}

export function impliedPriceFromMultiple(input: MultipleValuationInput): number {
  const multiple = positive(input.multiple, 'multiple');
  if (['forward_pe', 'normalized_pe', 'forward_pb'].includes(input.method)) {
    return positive(input.operatingDriverPerShare, 'per_share_driver') * multiple;
  }
  const enterpriseValue = positive(input.operatingDriverTotal, 'total_driver') * multiple;
  const dilutedShares = positive(input.dilutedShares, 'diluted_shares');
  const equityValue = enterpriseValue - Number(input.netDebt || 0);
  if (equityValue <= 0) throw new Error('non_positive_equity_value');
  return equityValue / dilutedShares;
}

export function scenarioValuationMetrics(input: ScenarioTargets) {
  const currentPrice = positive(input.currentPrice, 'current_price');
  const bear = positive(input.bear, 'bear_target');
  const base = positive(input.base, 'base_target');
  const bull = positive(input.bull, 'bull_target');
  if (!(bear <= base && base <= bull)) throw new Error('scenario_targets_not_ordered');
  const probabilities = input.probabilities ?? { bear: 0.25, base: 0.5, bull: 0.25 };
  const probabilitySum = probabilities.bear + probabilities.base + probabilities.bull;
  if ([probabilities.bear, probabilities.base, probabilities.bull].some((value) => value < 0 || value > 1)
    || Math.abs(probabilitySum - 1) > 1e-9) throw new Error('invalid_scenario_probabilities');
  const round = (value: number) => Math.round((value + Number.EPSILON) * 10_000) / 10_000;
  const weightedTarget = round(bear * probabilities.bear + base * probabilities.base + bull * probabilities.bull);
  const baseUpsidePct = round(100 * (base / currentPrice - 1));
  const bearDownsidePct = round(100 * (bear / currentPrice - 1));
  const rewardRiskRatio = bearDownsidePct < 0 ? round(baseUpsidePct / Math.abs(bearDownsidePct)) : null;
  return {
    currentPrice,
    bearTarget: bear,
    baseTarget: base,
    bullTarget: bull,
    probabilities,
    probabilityWeightedTarget: weightedTarget,
    baseUpsidePct,
    bearDownsidePct,
    rewardRiskRatio,
    promotionTarget: base,
    modelVersion: VALUATION_MODEL_VERSION,
  };
}

export function validateResearchFrame(frame: InvestAnchorsResearchFrame): string[] {
  const missing: string[] = [];
  const required: Array<[keyof InvestAnchorsResearchFrame, string]> = [
    ['productAndRevenueMix', 'product_and_revenue_mix'],
    ['demandDrivers', 'demand_drivers'],
    ['customerCertificationShipmentTimeline', 'customer_certification_shipment_timeline'],
    ['capacityYieldAsp', 'capacity_yield_asp'],
    ['revenueGrossMarginEpsFcfBridge', 'revenue_to_eps_fcf_bridge'],
    ['catalysts', 'catalysts'],
    ['risks', 'risks'],
    ['invalidationConditions', 'invalidation_conditions'],
    ['sourceRefs', 'source_refs'],
  ];
  for (const [key, label] of required) {
    if (!Array.isArray(frame[key]) || frame[key].filter((value) => value.trim().length > 0).length === 0) missing.push(label);
  }
  return missing;
}
