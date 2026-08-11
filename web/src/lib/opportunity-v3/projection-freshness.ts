// This server-only mirror is verified byte-for-value against the tracked runtime
// JSON by the V3.13 acceptance gate. Next's filesystem root is /web, so importing
// the runtime file directly would make production builds depend on files outside
// the deploy root.
export const PROJECTION_FRESHNESS_POLICY = Object.freeze({
  calendarTable: 'tw_trading_sessions_v3', graceHours: 2, runHourAsiaTaipei: 18,
  runMinuteAsiaTaipei: 20, staleReadonlyMaximumMissedRuns: 2,
  version: 'projection-freshness-v3.13.0',
});
const policy = PROJECTION_FRESHNESS_POLICY;

export type ProjectionHealth = {
  status: 'fresh' | 'stale_readonly' | 'unavailable';
  integrityStatus: 'valid' | 'conflict' | 'missing';
  freshnessStatus: 'fresh' | 'stale_readonly' | 'unavailable';
  researchVisibility: 'live' | 'last_good_readonly' | 'none';
  actionAuthority: 'enabled' | 'disabled';
  reason: 'on_schedule' | 'missed_scheduled_runs' | 'calendar_authority_unavailable' | 'evaluation_timestamp_missing' | 'release_identity_incompatible';
  missedExpectedRuns: number;
  contentAsOf: string | null;
  evaluatedAt: string | null;
  publishedAt: string | null;
  nextExpectedAt: string | null;
  calendarAuthority: 'tw_trading_sessions_v3';
  actionsEnabled: boolean;
};

export type TradingSessionRow = {
  session_id?: string | null;
  close_at?: string | null;
  status?: string | null;
};

const RUN_HOUR_UTC = policy.runHourAsiaTaipei - 8;
const RUN_MINUTE_UTC = policy.runMinuteAsiaTaipei;
const GRACE_HOURS = policy.graceHours;

function validDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function expectedRun(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), RUN_HOUR_UTC, RUN_MINUTE_UTC));
}

export function assessProjectionFreshness({
  contentAsOf, evaluatedAt, publishedAt, now = new Date(), tradingSessions = [],
}: {
  contentAsOf?: string | null;
  evaluatedAt?: string | null;
  publishedAt?: string | null;
  now?: Date;
  tradingSessions?: TradingSessionRow[];
}): ProjectionHealth {
  const evaluated = validDate(evaluatedAt);
  const content = validDate(contentAsOf);
  const published = validDate(publishedAt);
  const baseline = evaluated ?? published ?? content;
  if (!baseline) {
    return {
      status: 'unavailable', reason: 'evaluation_timestamp_missing', missedExpectedRuns: 3,
      integrityStatus: 'valid', freshnessStatus: 'unavailable', researchVisibility: 'last_good_readonly',
      actionAuthority: 'disabled',
      contentAsOf: content?.toISOString() ?? null, evaluatedAt: null, publishedAt: published?.toISOString() ?? null,
      nextExpectedAt: null, calendarAuthority: 'tw_trading_sessions_v3', actionsEnabled: false,
    };
  }

  const authoritativeDays = [...new Set(tradingSessions
    .filter((row) => row.status === 'completed' || row.status === 'scheduled')
    .map((row) => row.session_id?.slice(0, 10) ?? (validDate(row.close_at)?.toISOString().slice(0, 10) ?? null))
    .filter((value): value is string => Boolean(value)))]
    .sort();
  if (authoritativeDays.length === 0) return {
    status: 'unavailable', reason: 'calendar_authority_unavailable', missedExpectedRuns: 3,
    integrityStatus: 'valid', freshnessStatus: 'unavailable', researchVisibility: 'last_good_readonly',
    actionAuthority: 'disabled',
    contentAsOf: content?.toISOString() ?? null, evaluatedAt: evaluated?.toISOString() ?? baseline.toISOString(),
    publishedAt: published?.toISOString() ?? null, nextExpectedAt: null,
    calendarAuthority: 'tw_trading_sessions_v3', actionsEnabled: false,
  };
  const scheduledRuns = authoritativeDays
    .map(expectedRun)
    .filter((run): run is Date => Boolean(run));
  const dueRuns = scheduledRuns.filter((run) => run.getTime() > baseline.getTime()
    && run.getTime() + GRACE_HOURS * 60 * 60 * 1000 <= now.getTime());
  const missedExpectedRuns = dueRuns.length;
  const status = missedExpectedRuns === 0 ? 'fresh'
    : missedExpectedRuns <= policy.staleReadonlyMaximumMissedRuns ? 'stale_readonly' : 'unavailable';
  const nextExpectedAt = scheduledRuns.find((run) => run > now)?.toISOString() ?? null;

  return {
    status,
    integrityStatus: 'valid', freshnessStatus: status,
    researchVisibility: status === 'fresh' ? 'live' : 'last_good_readonly',
    actionAuthority: status === 'fresh' ? 'enabled' : 'disabled',
    reason: missedExpectedRuns === 0 ? 'on_schedule' : 'missed_scheduled_runs',
    missedExpectedRuns,
    contentAsOf: content?.toISOString() ?? null,
    evaluatedAt: evaluated?.toISOString() ?? baseline.toISOString(),
    publishedAt: published?.toISOString() ?? null,
    nextExpectedAt,
    calendarAuthority: 'tw_trading_sessions_v3',
    actionsEnabled: status === 'fresh',
  };
}
