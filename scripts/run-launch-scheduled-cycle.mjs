#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const taipei = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const launchPolicy = 'stockinsider-launch-radar-v1';
const researchEndpoint = '/api/internal/vnext-research';
const drainEndpoint = '/api/internal/taiwan-data-queue-drain';
const drainScope = { limit: 100, maxBatches: 30, requireComplete: true };

export function launchScheduledSlot(now) {
  const [sessionDate, time] = taipei.format(now).split(' ');
  const slot = time >= '21:30' ? 'postclose'
    : time >= '20:55' && time < '21:10' ? 'research'
    : time >= '08:15' && time < '09:00' ? 'morning' : null;
  return { sessionDate, slot };
}

function isIncompleteFinalDrain(response, sessionDate) {
  const { result } = response ?? {};
  return response?.ok === false && response.error === 'taiwan_refresh_scope_incomplete'
    && result?.phase === 'final' && result.sessionDate === sessionDate
    && result.status === 'incomplete' && result.scopeComplete === false && result.researchReady === false
    && Array.isArray(result.errors) && result.errors.length === 0;
}

function callInternalApi(endpoint, payload, timeoutMs, env) {
  const result = spawnSync(process.execPath, [
    'scripts/call_internal_api.mjs', endpoint, JSON.stringify(payload),
  ], {
    env: { ...env, INTERNAL_API_TIMEOUT_MS: String(timeoutMs) },
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    timeout: timeoutMs + 5_000,
  });
  if (result.status !== 0 && (result.status !== 1 || endpoint !== drainEndpoint || payload.phase !== 'final')) return null;
  try {
    // The transport exits nonzero for HTTP 503. Only the typed final-data gap
    // can survive a failed child process; all other failure payloads stay closed.
    const response = JSON.parse(result.stdout);
    return result.status === 0 || isIncompleteFinalDrain(response, payload.sessionDate) ? response : null;
  } catch {
    return null;
  }
}

export function runLaunchScheduledCycle({
  mode, env = process.env, clock = () => new Date(), call = callInternalApi,
}) {
  if (mode !== 'schedule' && mode !== 'preliminary') throw new Error('invalid_launch_schedule_mode');
  if (env.STOCKINSIDER_VNEXT_ENABLED !== 'true' || env.STOCKINSIDER_LAUNCH_RANKING_ENABLED !== 'true') {
    return { status: 'deferred', reason: 'launch_schedule_disabled' };
  }

  function request(endpoint, payload, timeoutMs, failure) {
    const response = call(endpoint, payload, timeoutMs, env);
    if (response?.ok !== true) throw new Error(failure);
    return response;
  }

  if (mode === 'preliminary') {
    request('/api/internal/taiwan-data-refresh', {
      datasets: ['daily_price', 'daily_valuation', 'market_index', 'institutional_flow', 'margin_short'],
      phase: 'preliminary',
      symbols: [],
    }, 120_000, 'launch_preliminary_refresh_failed');
    request(drainEndpoint, { ...drainScope, phase: 'preliminary' }, 2_700_000, 'launch_preliminary_drain_failed');
    return { status: 'preliminary_complete' };
  }

  const { slot, sessionDate } = launchScheduledSlot(clock());
  if (slot === null) return { status: 'deferred', reason: 'outside_launch_schedule_window' };
  const noticeEnabled = env.STOCKINSIDER_VNEXT_INVESTANCHORS_GMAIL_ENABLED === 'true';
  const noticeTimeoutMs = 115_000;
  const readNoticeStatus = (payload, timeoutMs, completed) => {
    try {
      const notice = call(researchEndpoint, payload, timeoutMs, env);
      const result = notice?.result;
      if (notice?.ok !== true || notice.policyVersion !== launchPolicy || result?.articleAuthority !== false) return 'failed';
      if (result.scanStatus === completed) {
        return completed === 'open_day' && result.checkpointDay !== null ? 'failed' : completed;
      }
      return ['deferred', 'disabled', 'blocked', 'retry_required'].includes(result.scanStatus) ? result.scanStatus : 'failed';
    } catch {
      return 'failed';
    }
  };

  const readCurrentNotice = () => readNoticeStatus(
    { action: 'investanchors-gmail-notices', scope: 'current' }, noticeTimeoutMs, 'open_day',
  );

  if (slot === 'morning') {
    let status, noticeScan, currentNoticeScan;
    try {
      const { policyVersion, result } = request(
        researchEndpoint, { action: 'market-background' }, 120_000, 'launch_market_background_failed',
      );
      if (policyVersion !== launchPolicy || !['published', 'deferred'].includes(result?.status)
        || (result.status === 'published' && result.session !== sessionDate)) {
        throw new Error('launch_market_background_wrong_scope');
      }
      status = result.status === 'published' ? 'published' : 'retained';
    } finally {
      if (noticeEnabled) {
        noticeScan = readNoticeStatus({ action: 'investanchors-gmail-notices' }, 225_000, 'scanned');
        currentNoticeScan = readCurrentNotice();
      }
    }
    return { slot, sessionDate, status, ...(noticeScan ? { noticeScan, currentNoticeScan } : {}) };
  }

  if (slot === 'research') {
    if (env.STOCKINSIDER_LAUNCH_RESEARCH_DISPATCH_ENABLED !== 'true') {
      return { slot, sessionDate, status: 'deferred', reason: 'launch_research_dispatch_disabled' };
    }
    const { policyVersion, result } = request(
      researchEndpoint, { action: 'launch-research-dispatch' }, 720_000, 'launch_research_dispatch_failed',
    );
    if (policyVersion !== launchPolicy) throw new Error('launch_research_dispatch_wrong_scope');
    if (result?.status === 'deferred' && [
      'launch_research_dispatch_disabled', 'launch_research_writer_unavailable',
      'launch_research_mode_unavailable', 'launch_research_window_closed',
      'launch_research_official_session_missing', 'launch_research_both_venue_calendar_missing',
      'launch_research_final_data_unready',
    ].includes(result.reason)) {
      return { slot, sessionDate, status: result.status, reason: result.reason };
    }
    if (result?.status !== 'processed' || result.session !== sessionDate || !Number.isInteger(result.attempted)
      || result.attempted < 0 || result.attempted > 4 || !Number.isInteger(result.published)
      || result.published < 0 || result.published > result.attempted || typeof result.stopped !== 'boolean') {
      throw new Error('launch_research_dispatch_wrong_scope');
    }
    return { slot, sessionDate, status: result.status, attempted: result.attempted, published: result.published, stopped: result.stopped };
  }

  function runPostclose() {
    const weekly = call(researchEndpoint, { action: 'launch-weekly-audit' }, 120_000, env);
    const weeklyState = weekly?.result?.status;
    const weeklyAudit = weekly?.ok === true && weekly.policyVersion === launchPolicy
      && ['recorded', 'empty', 'current', 'deferred'].includes(weeklyState) ? weeklyState : 'failed';
    const base = { slot, sessionDate, weeklyAudit };
    const beforeDrain = launchScheduledSlot(clock());
    if (beforeDrain.slot !== slot || beforeDrain.sessionDate !== sessionDate) {
      return { ...base, status: 'deferred', reason: 'launch_schedule_window_changed' };
    }

    const response = call(
      drainEndpoint, { ...drainScope, phase: 'final', sessionDate }, 2_700_000, env,
    );
    if (isIncompleteFinalDrain(response, sessionDate)) {
      return { ...base, status: 'retained', reason: 'launch_final_data_unready' };
    }
    if (response?.ok !== true) throw new Error('launch_final_drain_failed');
    if (response.result?.researchReady !== true || response.result.sessionDate !== sessionDate) {
      throw new Error('launch_final_drain_wrong_scope');
    }
    const current = launchScheduledSlot(clock());
    if (current.slot !== slot || current.sessionDate !== sessionDate) {
      return { ...base, status: 'deferred', reason: 'launch_schedule_window_changed' };
    }
    const { policyVersion, result } = request(
      researchEndpoint, { action: 'launch-cycle' }, 1_500_000, 'launch_cycle_failed',
    );
    if (policyVersion !== launchPolicy || (result?.status !== 'deferred'
      && (result?.status !== 'existing_reviewed_cache_only' || typeof result?.ranking?.published !== 'boolean'))) {
      throw new Error('launch_cycle_wrong_policy');
    }
    return { ...base, status: result.ranking?.published === true ? 'published' : 'retained' };
  }

  let outcome, currentNoticeScan;
  try {
    outcome = runPostclose();
  } finally {
    if (noticeEnabled) {
      // Notice receipts serve the next cycle even if this publication attempt
      // fails. Already elapsed Taipei days are left to the morning catch-up.
      const now = clock();
      const current = launchScheduledSlot(now);
      const endsAt = Date.parse(sessionDate + 'T00:00:00+08:00') + 86_400_000;
      currentNoticeScan = current.slot === slot && current.sessionDate === sessionDate
        && endsAt - now.getTime() >= noticeTimeoutMs + 5_000 ? readCurrentNotice() : 'deferred';
    }
  }
  return noticeEnabled ? { ...outcome, currentNoticeScan } : outcome;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = runLaunchScheduledCycle({ mode: process.argv[2] });
    console.log(JSON.stringify(result));
    if (result.weeklyAudit === 'failed' || [result.noticeScan, result.currentNoticeScan].some(
      state => ['failed', 'blocked', 'retry_required'].includes(state),
    )) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', reason: error.message }));
    process.exitCode = 1;
  }
}
