export type FinancialFieldGap = { factKey: string; periodEnd: string };
export type FinancialWorkIssuer = { stockId: string; symbol: string; sector?: string; gaps?: FinancialFieldGap[] };

/** Financial summaries are current-period feeds. Historical periods must use
 * issuer filings, not a current feed multiplied by twenty pretend queries. */
export function candidateStatementKind(name: string, sector: string) {
  const identity = `${name} ${sector}`;
  if (/證券|期貨|securities|futures/iu.test(identity)) return 'broker' as const;
  if (/銀行|金控|保險|金融|bank|financial|insurance/iu.test(identity)) return 'financial' as const;
  return 'general' as const;
}

export function requiredAcquisitionPeriods(issuer: FinancialWorkIssuer, fallback: string[]) {
  const required = issuer.gaps ? issuer.gaps.map((gap) => gap.periodEnd) : fallback;
  const periods = new Set(required.filter((period) => /^\d{4}-(03-31|06-30|09-30|12-31)$/u.test(period)));
  // YTD monetary disclosures need all earlier quarters in that fiscal year.
  for (const period of [...periods]) {
    const quarter = ['03-31','06-30','09-30','12-31'].indexOf(period.slice(5));
    for (let prior = 0; prior < quarter; prior++) periods.add(`${period.slice(0,4)}-${['03-31','06-30','09-30'][prior]}`);
  }
  return [...periods].sort().reverse();
}

export function financialWorkCompleteness(requiredGaps: FinancialFieldGap[], remainingGaps: FinancialFieldGap[]) {
  const identity = (gap: FinancialFieldGap) => `${gap.factKey}:${gap.periodEnd}`;
  const required = new Set(requiredGaps.map(identity));
  const missing = [...new Set(remainingGaps.map(identity))].sort();
  return { requiredFieldPeriods: required.size, missingFieldPeriods: missing.length,
    // Newer requirements are not silently counted as progress against an older run.
    completedFieldPeriods: [...required].filter((key) => !missing.includes(key)).length,
    status: missing.length === 0 ? 'complete' as const : 'incomplete' as const, missing };
}

/** Rotate issuers by the latest actual attempt across every connector. A
 * document awaiting validation must not monopolize the next batch merely
 * because it has not yet produced a successful financial cursor. */
export function financialLastAttemptByStock(rows: Array<Record<string, unknown>>) {
  const result = new Map<string, number>();
  for (const row of rows) {
    const latest = Math.max(...['last_attempted_at','last_collected_at'].map((key) => Date.parse(String(row[key] || '')) || 0));
    const stockId = String(row.stock_id || '');
    if (stockId) result.set(stockId, Math.max(result.get(stockId) || 0, latest));
  }
  return result;
}
