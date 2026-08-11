'use strict';

const policy = require('../../config/runtime/projection-freshness-policy.json');

const RUN_HOUR_UTC = policy.runHourAsiaTaipei - 8;

function validDate(value) {
  const date = typeof value === 'string' || value instanceof Date ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function expectedRun(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), RUN_HOUR_UTC,
    policy.runMinuteAsiaTaipei)) : null;
}

function assessProjectionFreshness({ contentAsOf, evaluatedAt, publishedAt, now = new Date(), tradingSessions = [] }) {
  const content = validDate(contentAsOf); const evaluated = validDate(evaluatedAt); const published = validDate(publishedAt);
  const baseline = evaluated ?? published ?? content;
  if (!baseline) return Object.freeze({ status: 'unavailable', reason: 'evaluation_timestamp_missing',
    missedExpectedRuns: policy.staleReadonlyMaximumMissedRuns + 1, actionsEnabled: false,
    integrityStatus: 'valid', freshnessStatus: 'unavailable', researchVisibility: 'last_good_readonly',
    actionAuthority: 'disabled',
    nextExpectedAt: null, calendarAuthority: policy.calendarTable });
  const authoritativeDays = [...new Set(tradingSessions.filter((row) => ['completed', 'scheduled'].includes(row.status))
    .map((row) => String(row.session_id ?? row.close_at ?? '').slice(0, 10)).filter(Boolean))].sort();
  if (authoritativeDays.length === 0) return Object.freeze({ status: 'unavailable',
    reason: 'calendar_authority_unavailable', missedExpectedRuns: policy.staleReadonlyMaximumMissedRuns + 1,
    integrityStatus: 'valid', freshnessStatus: 'unavailable', researchVisibility: 'last_good_readonly',
    actionAuthority: 'disabled',
    contentAsOf: content?.toISOString() ?? null, evaluatedAt: evaluated?.toISOString() ?? baseline.toISOString(),
    publishedAt: published?.toISOString() ?? null, nextExpectedAt: null, actionsEnabled: false,
    calendarAuthority: policy.calendarTable });
  const scheduledRuns = authoritativeDays.map(expectedRun).filter(Boolean);
  const missedExpectedRuns = scheduledRuns.filter((run) => run.getTime() > baseline.getTime()
    && run.getTime() + policy.graceHours * 60 * 60 * 1000 <= now.getTime()).length;
  const status = missedExpectedRuns === 0 ? 'fresh'
    : missedExpectedRuns <= policy.staleReadonlyMaximumMissedRuns ? 'stale_readonly' : 'unavailable';
  const nextExpectedAt = scheduledRuns.find((run) => run.getTime() > now.getTime())?.toISOString() ?? null;
  return Object.freeze({ status, reason: missedExpectedRuns ? 'missed_scheduled_runs'
    : 'on_schedule', missedExpectedRuns,
  integrityStatus: 'valid', freshnessStatus: status,
  researchVisibility: status === 'fresh' ? 'live' : 'last_good_readonly',
  actionAuthority: status === 'fresh' ? 'enabled' : 'disabled',
  contentAsOf: content?.toISOString() ?? null, evaluatedAt: evaluated?.toISOString() ?? baseline.toISOString(),
  publishedAt: published?.toISOString() ?? null, nextExpectedAt, actionsEnabled: status === 'fresh',
  calendarAuthority: policy.calendarTable });
}

module.exports = { assessProjectionFreshness, policy };
