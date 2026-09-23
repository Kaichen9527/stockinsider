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
export function getCandidateBusinessProfile(symbol: string, evaluationAt?: string): CandidateBusinessProfile | null {
  if (String(symbol).trim() !== AUO_PROFILE.symbol) return null;
  if (evaluationAt !== undefined) {
    const cutoff = Date.parse(evaluationAt);
    if (!Number.isFinite(cutoff) || cutoff < Date.parse(`${AUO_PROFILE.effectiveFrom}T00:00:00+08:00`)) return null;
  }
  return AUO_PROFILE;
}

type SegmentEvidenceRow = {
  event_type?: unknown;
  source_url?: unknown;
  event_timestamp?: unknown;
  created_at?: unknown;
  extracted_signals?: unknown;
};

function officialAuoUrl(value: unknown) {
  try {
    const host = new URL(String(value || '')).hostname.toLowerCase();
    return host === 'auo.com' || host === 'www.auo.com';
  } catch { return false; }
}

/** The general candidate model cannot infer AUO's segment economics from
 * consolidated statements. Only an official, point-in-time event with all
 * three reported segment rows may authorize its issuer-specific target. */
export function hasCompleteCandidateSegmentBridge(
  symbol: string,
  rows: SegmentEvidenceRow[],
  options: { cutoff: string; periodEnd: string | null },
) {
  if (symbol !== AUO_PROFILE.symbol || !options.periodEnd) return symbol !== AUO_PROFILE.symbol;
  const required = new Set(AUO_PROFILE.operatingSegments.map((name) => name.toLowerCase()));
  return rows.some((row) => {
    const eventAt = String(row.event_timestamp || '');
    const createdAt = String(row.created_at || '');
    const cutoffMs = Date.parse(options.cutoff);
    const eventMs = Date.parse(eventAt);
    const createdMs = Date.parse(createdAt);
    const sourceUrl = String(row.source_url || '');
    if (!['earnings', 'conference'].includes(String(row.event_type || ''))
      || !officialAuoUrl(sourceUrl) || !Number.isFinite(cutoffMs) || !Number.isFinite(eventMs)
      || !Number.isFinite(createdMs) || eventMs > cutoffMs || createdMs > cutoffMs) return false;
    const signals = row.extracted_signals;
    if (!signals || typeof signals !== 'object' || Array.isArray(signals)) return false;
    const signalRow = signals as Record<string, unknown>;
    if (signalRow.schema !== 'official-segment-financials-v1'
      || signalRow.periodEnd !== options.periodEnd || signalRow.status !== 'reported'
      || !Array.isArray(signalRow.segments)) return false;
    const admitted = new Set<string>();
    for (const item of signalRow.segments) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const segment = item as Record<string, unknown>;
      const name = String(segment.name || '').toLowerCase();
      const revenue = Number(segment.revenue);
      const operatingIncome = Number(segment.operatingIncome);
      if (!required.has(name) || admitted.has(name) || !(revenue > 0) || !Number.isFinite(operatingIncome)
        || typeof segment.sourceRef !== 'string' || !segment.sourceRef.startsWith(sourceUrl)) return false;
      admitted.add(name);
    }
    return admitted.size === required.size;
  });
}
