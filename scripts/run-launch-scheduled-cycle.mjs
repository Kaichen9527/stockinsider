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
  const slot = time >= '21:30' ? 'postclose' : time >= '08:15' && time < '09:00' ? 'morning' : null;
  return { sessionDate, slot };
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
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
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
  if (slot === 'morning') {
    const { policyVersion, result } = request(
      researchEndpoint, { action: 'market-background' }, 120_000, 'launch_market_background_failed',
    );
    if (policyVersion !== launchPolicy || !['published', 'deferred'].includes(result?.status)
      || (result.status === 'published' && result.session !== sessionDate)) {
      throw new Error('launch_market_background_wrong_scope');
    }
    return { slot, sessionDate, status: result.status === 'published' ? 'published' : 'retained' };
  }

  const weekly = call(researchEndpoint, { action: 'launch-weekly-audit' }, 120_000, env);
  const weeklyState = weekly?.result?.status;
  const weeklyAudit = weekly?.ok === true && weekly.policyVersion === launchPolicy
    && ['recorded', 'empty', 'current', 'deferred'].includes(weeklyState) ? weeklyState : 'failed';
  const beforeDrain = launchScheduledSlot(clock());
  if (beforeDrain.slot !== slot || beforeDrain.sessionDate !== sessionDate) {
    return { slot, sessionDate, weeklyAudit, status: 'deferred', reason: 'launch_schedule_window_changed' };
  }

  const { result: drain } = request(
    drainEndpoint, { ...drainScope, phase: 'final', sessionDate }, 2_700_000, 'launch_final_drain_failed',
  );
  if (drain?.researchReady !== true || drain?.sessionDate !== sessionDate) {
    throw new Error('launch_final_drain_wrong_scope');
  }
  const current = launchScheduledSlot(clock());
  if (current.slot !== slot || current.sessionDate !== sessionDate) {
    return { slot, sessionDate, weeklyAudit, status: 'deferred', reason: 'launch_schedule_window_changed' };
  }
  const { policyVersion, result } = request(
    researchEndpoint, { action: 'launch-cycle' }, 1_500_000, 'launch_cycle_failed',
  );
  if (policyVersion !== launchPolicy || (result?.status !== 'deferred'
    && (result?.status !== 'existing_reviewed_cache_only' || typeof result?.ranking?.published !== 'boolean'))) {
    throw new Error('launch_cycle_wrong_policy');
  }
  return { slot, sessionDate, weeklyAudit, status: result.ranking?.published === true ? 'published' : 'retained' };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const result = runLaunchScheduledCycle({ mode: process.argv[2] });
    console.log(JSON.stringify(result));
    if (result.weeklyAudit === 'failed') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', reason: error.message }));
    process.exitCode = 1;
  }
}
