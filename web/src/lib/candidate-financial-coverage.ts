import { isPromotionEligibleEvidence } from './evidence-valuation-contract.ts';
import { financialFactAvailableAt } from './candidate-research-policy.ts';
import { discreteReportedQuarters, preferOfficialReportedFinancialFacts, type ReportedFinancialFact } from './forward-earnings-bridge.ts';

type Fact = Record<string, unknown>;
const FLOW_KEYS = ['quarterly_revenue', 'quarterly_gross_profit', 'quarterly_operating_income', 'quarterly_net_income_attributable_to_common', 'quarterly_diluted_eps', 'diluted_weighted_average_shares'];

/** Requirements match the valuation readers, not the number of rows fetched. */
export function candidateFinancialRequirements(sector: string) {
  if (/金融|保險|銀行|證券|financial|insurance|bank/iu.test(sector)) {
    return { quarters: 8, keys: ['quarterly_net_income_attributable_to_common', 'common_equity_attributable_to_owners', 'common_shares_outstanding'] };
  }
  if (/塑化|鋼鐵|水泥|航運|記憶體|面板|cement|steel|shipping|chemical|memory|panel/iu.test(sector)) {
    return { quarters: 20, keys: FLOW_KEYS };
  }
  return { quarters: 8, keys: FLOW_KEYS };
}

export function financialCoverageGaps(facts: Fact[], sector: string, cutoff: string) {
  const required = candidateFinancialRequirements(sector);
  // Allow only quarters whose normal reporting window has ended. More recent
  // early reports are admitted by the reader but must not starve normal issuers.
  const asOf = new Date(cutoff);
  if (!Number.isFinite(asOf.getTime())) throw new Error('invalid_financial_coverage_cutoff');
  const quarterEnds: string[] = [];
  const current = asOf.getUTCFullYear() * 4 + Math.floor(asOf.getUTCMonth() / 3);
  for (let ordinal = current - 1; quarterEnds.length < required.quarters + 1; ordinal--) {
    const year = Math.floor(ordinal / 4), quarter = ordinal % 4;
    const end = `${year}-${['03-31','06-30','09-30','12-31'][quarter]}`;
    const normalDeadline = Date.parse(`${year + (quarter === 3 ? 1 : 0)}-${['05-15','08-14','11-14','03-31'][quarter]}T23:59:59+08:00`);
    if (normalDeadline <= asOf.getTime()) quarterEnds.push(end);
  }
  const eligible = preferOfficialReportedFinancialFacts(facts.filter((fact) => fact.estimate_kind === 'reported'
    && typeof fact.value === 'number' && Number.isFinite(fact.value)
    && fact.unit === (['quarterly_diluted_eps', 'book_value_per_share'].includes(String(fact.fact_key)) ? 'TWD_per_share'
      : ['diluted_weighted_average_shares', 'common_shares_outstanding'].includes(String(fact.fact_key)) ? 'share' : 'TWD')
    && financialFactAvailableAt(fact, cutoff) && isPromotionEligibleEvidence({
    provider: String(fact.provider || ''), authorityTier: String(fact.authority_tier || ''),
    validationStatus: fact.validation_status == null ? null : String(fact.validation_status),
    schemaValid: fact.schema_valid === true, unitValid: fact.unit_valid === true,
    pointInTimeValid: fact.point_in_time_valid === true, consistencyValid: fact.consistency_valid === true,
  })).map((fact): ReportedFinancialFact => ({
    factId: String(fact.fact_id), factKey: String(fact.fact_key), value: Number(fact.value),
    periodStart: fact.period_start == null ? null : String(fact.period_start), periodEnd: String(fact.period_end),
    durationKind: fact.duration_kind as ReportedFinancialFact['durationKind'], unit: String(fact.unit),
    sourceRef: String(fact.source_ref || ''), provider: String(fact.provider), authorityTier: String(fact.authority_tier),
    filingRestatementId: fact.filing_restatement_id == null ? null : String(fact.filing_restatement_id),
  })));
  return required.keys.flatMap((key) => {
    const expected = quarterEnds.slice(0, required.quarters + (key === 'common_equity_attributable_to_owners' ? 1 : 0));
    const instant = key === 'common_equity_attributable_to_owners' || key === 'common_shares_outstanding';
    // Use the valuation reader's conflict and monetary-flow decumulation rules.
    // EPS and weighted shares remain discrete-only in that shared consumer.
    const have = instant ? new Set(expected.filter((periodEnd) => {
      const rows = eligible.filter((fact) => fact.factKey === key && fact.periodEnd === periodEnd
        && ['instant', 'quarter_end'].includes(String(fact.durationKind)) && fact.periodStart === null);
      if (rows.length > 0) return new Set(rows.map((fact) => fact.value)).size === 1;
      if (key !== 'common_shares_outstanding') return false;
      // The PB/ROE consumer can derive shares from common equity / reported BVPS.
      return ['common_equity_attributable_to_owners', 'book_value_per_share'].every((denominator) => {
        const alternatives = eligible.filter((fact) => fact.factKey === denominator && fact.periodEnd === periodEnd
          && ['instant', 'quarter_end'].includes(String(fact.durationKind)) && fact.periodStart === null);
        return alternatives.length > 0 && new Set(alternatives.map((fact) => fact.value)).size === 1
          && (denominator !== 'book_value_per_share' || alternatives[0].value > 0);
      });
    })) : new Set(discreteReportedQuarters(eligible.filter((fact) => fact.durationKind === 'quarterly'), key)
      .map((point) => point.periodEnd));
    return expected.filter((periodEnd) => !have.has(periodEnd)).map((periodEnd) => ({ factKey: key, periodEnd }));
  });
}
