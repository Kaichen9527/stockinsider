/** Shared by acquisition requirements and valuation routing. Sector labels are
 * authority metadata, never a hard-coded list of favoured stock symbols. */
export type CandidateBusinessClass = 'financial' | 'cyclical' | 'general';

export function classifyCandidateBusiness(sector: string): CandidateBusinessClass {
  if (/金融|保險|銀行|證券|金控|期貨|\b(?:financials?|banks?|banking|insurance|securities|brokerage|futures)\b/iu.test(sector)) return 'financial';
  if (/塑化|塑膠|石化|化工|鋼鐵|水泥|航運|記憶體|面板|造紙|紙漿|原物料|\b(?:cement|steel|shipping|chemicals?|memory|panels?|paper|pulp|raw materials?|plastics?|petrochemicals?)\b/iu.test(sector)) return 'cyclical';
  return 'general';
}

export type DueFinancialQuarter = {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  periodEnd: string;
  normalDeadlineAt: string;
};

/** Normal reporting deadlines, not simply the most recently closed quarter.
 * This is the existing coverage policy; it is not proof a particular issuer
 * has published. An early filing remains admissible independently through PIT
 * evidence, while normal issuers are not forced to have an un-due quarter. */
export function latestDueFinancialQuarters(cutoff: string, count: number): DueFinancialQuarter[] {
  const timestamp = Date.parse(cutoff);
  if (!Number.isFinite(timestamp)) throw new Error('invalid_financial_coverage_cutoff');
  if (!Number.isInteger(count) || count < 1 || count > 120) throw new Error('invalid_financial_quarter_count');
  const taipei = new Date(timestamp + 8 * 60 * 60 * 1000);
  if (!Number.isFinite(taipei.getTime())) throw new Error('invalid_financial_coverage_cutoff');
  const current = taipei.getUTCFullYear() * 4 + Math.floor(taipei.getUTCMonth() / 3);
  const result: DueFinancialQuarter[] = [];
  for (let ordinal = current - 1; result.length < count && ordinal >= current - count - 8; ordinal--) {
    const year = Math.floor(ordinal / 4);
    const index = ordinal - year * 4;
    const periodEnd = `${year}-${['03-31', '06-30', '09-30', '12-31'][index]}`;
    const deadline = Date.parse(`${year + (index === 3 ? 1 : 0)}-${['05-15', '08-14', '11-14', '03-31'][index]}T23:59:59+08:00`);
    if (deadline <= timestamp) result.push({ year, quarter: (index + 1) as DueFinancialQuarter['quarter'],
      periodEnd, normalDeadlineAt: new Date(deadline).toISOString() });
  }
  if (result.length !== count) throw new Error('invalid_financial_coverage_cutoff');
  return result;
}

export function latestDueFinancialQuarter(cutoff: string): DueFinancialQuarter {
  return latestDueFinancialQuarters(cutoff, 1)[0];
}
