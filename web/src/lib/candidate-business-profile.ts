export type CandidateBusinessProfile = {
  symbol: string;
  version: string;
  effectiveFrom: string;
  businessModel: 'cyclical_asset';
  primaryValuationMethod: 'forward_bvps_pb';
  forecastHorizonMonths: 12;
  reportedQuarterCount: number;
  normalizedCycleQuarterCount: number;
  requiredFlowFacts: readonly [
    'quarterly_revenue',
    'quarterly_gross_profit',
    'quarterly_operating_income',
    'quarterly_net_income_attributable_to_common',
  ];
  requiredInstantFacts: readonly ['common_equity_attributable_to_owners', 'common_shares_outstanding'];
  operatingSegments: readonly string[];
  sourceRefs: readonly string[];
};

const AUO_PROFILE: CandidateBusinessProfile = Object.freeze({
  symbol: '2409',
  version: 'auo-cyclical-asset-v1',
  effectiveFrom: '2026-09-19',
  businessModel: 'cyclical_asset',
  primaryValuationMethod: 'forward_bvps_pb',
  forecastHorizonMonths: 12,
  reportedQuarterCount: 8,
  normalizedCycleQuarterCount: 20,
  requiredFlowFacts: [
    'quarterly_revenue',
    'quarterly_gross_profit',
    'quarterly_operating_income',
    'quarterly_net_income_attributable_to_common',
  ] as const,
  requiredInstantFacts: ['common_equity_attributable_to_owners', 'common_shares_outstanding'] as const,
  operatingSegments: ['Display', 'Mobility Solutions', 'Vertical Solutions'],
  sourceRefs: [
    'https://www.auo.com/en-global/financial_results/index/investor_conference_presentation/',
    'https://www.auo.com/upload/media/ir/Financial_Information/2Q26_Finance_Statement_English.pdf',
    'https://www.auo.com/upload/media/ir/Financial_Information/2Q26_Handout_English.pdf',
    'https://www.auo.com/en-global/New_Archive/detail/news_IR_20260730',
    'https://www.auo.com/upload/media/ir/2026_Consolidated.pdf',
  ],
});

/** Issuer-specific research methods are opt-in and versioned. A sector label
 * alone must never silently apply AUO's model to another company. */
export function getCandidateBusinessProfile(symbol: string): CandidateBusinessProfile | null {
  return String(symbol).trim() === AUO_PROFILE.symbol ? AUO_PROFILE : null;
}
