import { isPromotionEligibleEvidence } from './evidence-valuation-contract.ts';
import { financialFactAvailableAt } from './candidate-research-policy.ts';

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
  const eligible = facts.filter((fact) => financialFactAvailableAt(fact, cutoff) && isPromotionEligibleEvidence({
    provider: String(fact.provider || ''), authorityTier: String(fact.authority_tier || ''),
    validationStatus: fact.validation_status == null ? null : String(fact.validation_status),
    schemaValid: fact.schema_valid === true, unitValid: fact.unit_valid === true,
    pointInTimeValid: fact.point_in_time_valid === true, consistencyValid: fact.consistency_valid === true,
  }));
  return required.keys.flatMap((key) => {
    const expected = quarterEnds.slice(0, required.quarters + (key === 'common_equity_attributable_to_owners' ? 1 : 0));
    const instant = key === 'common_equity_attributable_to_owners' || key === 'common_shares_outstanding';
    const have = new Set(eligible.filter((fact) => {
      if (fact.fact_key !== key) return false;
      if (instant) return ['instant', 'quarter_end'].includes(String(fact.duration_kind)) && fact.period_start == null;
      const end = String(fact.period_end);
      const startMonth = ({ '03': '01', '06': '04', '09': '07', '12': '10' } as Record<string, string>)[end.slice(5, 7)];
      // YTD EPS/weighted shares cannot stand in for a discrete quarter. Amount
      // decumulation, when defensible, must produce its own validated lineage.
      return fact.duration_kind === 'quarterly' && startMonth != null
        && fact.period_start === `${end.slice(0, 4)}-${startMonth}-01`;
    }).map((fact) => String(fact.period_end)));
    return expected.filter((periodEnd) => !have.has(periodEnd)).map((periodEnd) => ({ factKey: key, periodEnd }));
  });
}
