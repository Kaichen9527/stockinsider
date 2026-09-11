export type MonthlyCandidatePrice = {
  date: string; month: string; frequency: 'monthly'; close: number;
};

export function isHistoryDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** Last observed official session in each month, never a synthetic calendar end. */
export function monthlyCandidatePrices(bars: readonly { time: string; close: number }[]): MonthlyCandidatePrice[] {
  const months = new Map<string, MonthlyCandidatePrice>();
  for (const bar of bars) {
    if (!isHistoryDate(bar.time) || !Number.isFinite(bar.close) || bar.close <= 0) continue;
    const month = bar.time.slice(0, 7);
    const previous = months.get(month);
    if (!previous || previous.date < bar.time) {
      months.set(month, { date: bar.time, month, frequency: 'monthly', close: bar.close });
    } else if (previous.date === bar.time && previous.close !== bar.close) {
      throw new Error('candidate_history_conflicting_session');
    }
  }
  return [...months.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
}
