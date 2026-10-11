import type { TechnicalBar } from './technical-features-v2.ts';

export const WEEKLY_AGGREGATION_VERSION = 'taiwan-calendar-week-v1' as const;
type WeeklyBar = TechnicalBar & { weekStart: string; weekEnd: string; sessionCount: number; status: 'complete' | 'partial' };
function civil(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== value) throw new Error('weekly_session_invalid');
  return date;
}
function weekRange(session: string) {
  const date = civil(session);
  const start = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86_400_000);
  return {
    start: start.toISOString().slice(0, 10),
    end: new Date(start.getTime() + 6 * 86_400_000).toISOString().slice(0, 10),
  };
}

/** Calendar weeks, including two-day holiday weeks; never chunks of five bars. */
export function aggregateOfficialWeeklyBars(input: {
  bars: TechnicalBar[]; officialCompletedSessions: string[]; asOfSession: string;
  nextOfficialSession?: string;
}): WeeklyBar[] {
  civil(input.asOfSession);
  if (input.nextOfficialSession) {
    civil(input.nextOfficialSession);
    if (input.nextOfficialSession <= input.asOfSession) throw new Error('weekly_next_session_invalid');
  }
  const sessions = new Set(input.officialCompletedSessions);
  if (sessions.size !== input.officialCompletedSessions.length
    || input.officialCompletedSessions.some((session) => {
      civil(session); return session > input.asOfSession;
    })) throw new Error('weekly_official_calendar_invalid');
  const groups = new Map<string, TechnicalBar[]>();
  let prior = '';
  for (const bar of input.bars) {
    civil(bar.session);
    if (bar.session <= prior || bar.session > input.asOfSession || !sessions.has(bar.session)
      || ![bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite)
      || bar.high < Math.max(bar.low, bar.close) || bar.low > bar.close || bar.volume < 0) {
      throw new Error('weekly_bar_invalid');
    }
    prior = bar.session;
    const { start } = weekRange(bar.session);
    groups.set(start, [...(groups.get(start) || []), bar]);
  }
  return [...groups].map(([weekStart, rows]) => {
    const { end: weekEnd } = weekRange(weekStart);
    const official = input.officialCompletedSessions.filter((session) => session >= weekStart && session <= weekEnd);
    const knownWeekClosed = input.asOfSession >= weekEnd
      || (input.nextOfficialSession != null && input.nextOfficialSession > weekEnd
        && rows.at(-1)!.session <= input.asOfSession);
    const complete = knownWeekClosed && official.length === rows.length
      && rows.every((row, index) => row.session === official[index]);
    return {
      weekStart, weekEnd, session: rows.at(-1)!.session,
      high: Math.max(...rows.map((row) => row.high)), low: Math.min(...rows.map((row) => row.low)),
      close: rows.at(-1)!.close, volume: rows.reduce((total, row) => total + row.volume, 0),
      sessionCount: rows.length, status: complete ? 'complete' as const : 'partial' as const,
    };
  });
}
