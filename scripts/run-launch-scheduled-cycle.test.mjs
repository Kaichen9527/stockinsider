import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { launchScheduledSlot, runLaunchScheduledCycle } from './run-launch-scheduled-cycle.mjs';

const day = '2026-11-16';
const policyVersion = 'stockinsider-launch-radar-v1';
const active = { STOCKINSIDER_VNEXT_ENABLED: 'true', STOCKINSIDER_LAUNCH_RANKING_ENABLED: 'true' };
const morning = { ok: true, policyVersion, result: { session: day, status: 'published' } };
const evening = { ok: true, policyVersion, result: { status: 'existing_reviewed_cache_only', ranking: { published: true } } };
const currentWeek = { ok: true, policyVersion, result: { status: 'current', reviewed: 0 } };
const complete = { ok: true, result: { sessionDate: day, researchReady: true } };

function plan(at, responses = [], options = {}) {
  const calls = [];
  const { weekly = currentWeek, ...runOptions } = options;
  const clock = Array.isArray(at)
    ? () => new Date(at.shift())
    : () => new Date(at);
  const run = () => runLaunchScheduledCycle({
    clock,
    env: active,
    mode: 'schedule',
    call: (endpoint, payload, timeoutMs) => {
      calls.push({ endpoint, payload, timeoutMs });
      return payload.action === 'launch-weekly-audit' ? weekly : responses.shift();
    },
    ...runOptions,
  });
  return { calls, run };
}

test('Taipei boundaries remain fixed across European DST', () => {
  for (const date of ['2026-11-16', '2026-07-13']) {
    for (const [utc, slot] of [
      ['00:14:59', null], ['00:15:00', 'morning'], ['00:25:00', 'morning'],
      ['00:59:59', 'morning'], ['01:00:00', null], ['13:29:59', null],
      ['13:30:00', 'postclose'], ['13:40:39', 'postclose'], ['15:59:59', 'postclose'],
    ]) {
      assert.deepEqual(launchScheduledSlot(new Date(date + 'T' + utc + 'Z')), { sessionDate: date, slot });
    }
    const tomorrow = new Date(date + 'T16:00:00Z');
    assert.equal(launchScheduledSlot(tomorrow).slot, null);
    assert.notEqual(launchScheduledSlot(tomorrow).sessionDate, date);
  }
});

test('disabled or stale morning starts have no HTTP effects', () => {
  for (const env of [{}, { ...active, STOCKINSIDER_VNEXT_ENABLED: 'false' }, { ...active, STOCKINSIDER_LAUNCH_RANKING_ENABLED: 'false' }]) {
    const disabled = plan(day + 'T13:30:00Z', [], { env });
    assert.equal(disabled.run().reason, 'launch_schedule_disabled');
    assert.deepEqual(disabled.calls, []);
  }
  const missed = plan(day + 'T02:01:00Z');
  assert.equal(missed.run().reason, 'outside_launch_schedule_window');
  assert.deepEqual(missed.calls, []);
});

test('morning uses only the closed market-background action', () => {
  for (const [response, status] of [
    [morning, 'published'],
    [{ ...morning, result: { status: 'deferred', retainedSession: '2026-11-13' } }, 'retained'],
  ]) {
    const { calls, run } = plan(day + 'T00:15:29Z', [response]);
    assert.deepEqual(run(), { slot: 'morning', sessionDate: day, status });
    assert.deepEqual(calls, [{
      endpoint: '/api/internal/vnext-research', payload: { action: 'market-background' }, timeoutMs: 120_000,
    }]);
  }
});

test('existing Taipei morning slot adds the private notice scan only when configured', () => {
  const env = { ...active, STOCKINSIDER_VNEXT_INVESTANCHORS_GMAIL_ENABLED: 'true' };
  const response = { ok: true, policyVersion, result: { scanStatus: 'scanned', articleAuthority: false } };
  const normal = plan(day + 'T00:15:00Z', [morning, response], { env });
  assert.equal(normal.run().noticeScan, 'scanned');
  assert.equal(normal.calls.at(-1).timeoutMs, 225_000);
  assert.deepEqual(normal.calls.map(row => row.payload.action), ['market-background', 'investanchors-gmail-notices']);
  const unavailable = plan(day + 'T00:15:00Z', [morning, null], { env });
  assert.equal(unavailable.run().status, 'published');
  const marketFailed = plan(day + 'T00:15:00Z', [null, response], { env });
  assert.throws(marketFailed.run, /launch_market_background_failed/u);
  assert.deepEqual(marketFailed.calls.map(row => row.payload.action), ['market-background', 'investanchors-gmail-notices']);
});
test('private notice request is an operator-only internal action with a closed request', async () => {
  const http = await readFile(new URL('../web/src/lib/vnext/http.ts', import.meta.url), 'utf8');
  const block = http.slice(http.indexOf("if(action==='investanchors-gmail-notices')"), http.indexOf("if(action==='market-background')"));
  assert.match(block, /identity.role!=='operator'.*requireExactInternalBearer/u);
  assert.match(block, /key!=='action'&&key!=='day'/u);
  assert.match(block, /runConfiguredInvestAnchorsNotices\(identity,body.day\)/u);
  assert.match(block, /'cache-control':'no-store'/u);
});
test('morning refuses a publication receipt for a different session', () => {
  const { run } = plan(day + 'T00:15:00Z', [{ ...morning, result: { ...morning.result, session: '2026-11-13' } }]);
  assert.throws(run, { message: 'launch_market_background_wrong_scope' });
});

test('evening drains only the current Taipei date before calling the launch-only cycle', () => {
  const { calls, run } = plan(day + 'T13:40:39Z', [complete, evening]);
  assert.deepEqual(run(), { slot: 'postclose', sessionDate: day, weeklyAudit: 'current', status: 'published' });
  assert.deepEqual(calls, [{
    endpoint: '/api/internal/vnext-research', payload: { action: 'launch-weekly-audit' }, timeoutMs: 120_000,
  }, {
    endpoint: '/api/internal/taiwan-data-queue-drain',
    payload: { limit: 100, maxBatches: 30, requireComplete: true, phase: 'final', sessionDate: day },
    timeoutMs: 2_700_000,
  }, {
    endpoint: '/api/internal/vnext-research', payload: { action: 'launch-cycle' }, timeoutMs: 1_500_000,
  }]);
});

test('evening deferral or rank refusal retains the prior publication', () => {
  for (const result of [
    { status: 'deferred', reason: 'calendar_unavailable' },
    { status: 'existing_reviewed_cache_only', ranking: { published: false, retained: true } },
  ]) {
    const { run } = plan(day + 'T13:30:00Z', [complete, { ...evening, result }]);
    assert.deepEqual(run(), { slot: 'postclose', sessionDate: day, weeklyAudit: 'current', status: 'retained' });
  }
});

test('incomplete or wrong-date drain never calls the cycle', () => {
  for (const [reply, message] of [
    [{ ok: false }, 'launch_final_drain_failed'],
    [null, 'launch_final_drain_failed'],
    [{ ok: true, result: { ...complete.result, researchReady: false } }, 'launch_final_drain_wrong_scope'],
    [{ ok: true, result: { ...complete.result, sessionDate: '2026-11-13' } }, 'launch_final_drain_wrong_scope'],
  ]) {
    const { calls, run } = plan(day + 'T13:30:00Z', [reply]);
    assert.throws(run, { message });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].payload.action, 'launch-weekly-audit');
  }
});

test('a date rollover while draining does not publish a different session', () => {
  const { calls, run } = plan([day + 'T15:56:00Z', day + 'T15:58:00Z', day + 'T16:02:00Z'], [complete]);
  assert.equal(run().reason, 'launch_schedule_window_changed');
  assert.equal(calls.length, 2);
});

test('an unrelated reply is not a successful cycle', () => {
  const { run } = plan(day + 'T13:30:00Z', [complete, { ...evening, policyVersion: 'stockinsider-vnext-20-v1' }]);
  assert.throws(run, { message: 'launch_cycle_wrong_policy' });
});

test('preliminary mode keeps existing five datasets and queue scope without a publication call', () => {
  const { calls, run } = plan(day + 'T11:00:00Z', [{ ok: true }, { ok: true }], { mode: 'preliminary' });
  assert.equal(run().status, 'preliminary_complete');
  assert.deepEqual(calls.map(item => item.endpoint), ['/api/internal/taiwan-data-refresh', '/api/internal/taiwan-data-queue-drain']);
  assert.deepEqual(calls[0].payload, {
    datasets: ['daily_price', 'daily_valuation', 'market_index', 'institutional_flow', 'margin_short'],
    phase: 'preliminary',
    symbols: [],
  });
  assert.deepEqual(calls[1].payload, { limit: 100, maxBatches: 30, requireComplete: true, phase: 'preliminary' });
});

test('the one candidate timer owns both Taipei slots and neither service calls the legacy publisher', async () => {
  const dir = new URL('../deployment/vps/launch-radar-schedule/', import.meta.url);
  const [timer, service, prep] = await Promise.all([
    readFile(new URL('stockinsider-research-cycle.timer', dir), 'utf8'),
    readFile(new URL('stockinsider-research-cycle.service', dir), 'utf8'),
    readFile(new URL('stockinsider-taiwan-data-preliminary.service', dir), 'utf8'),
  ]);
  assert.deepEqual(timer.match(/^OnCalendar=.*$/gm), [
    'OnCalendar=*-*-* 08:15:00 Asia/Taipei',
    'OnCalendar=*-*-* 21:30:00 Asia/Taipei',
  ]);
  assert.match(timer, /^Unit=stockinsider-research-cycle.service$/m);
  for (const [unit, mode] of [[service, 'schedule'], [prep, 'preliminary']]) {
    assert.match(unit, /^ExecStart=\/usr\/bin\/flock -w 1800 \/run\/lock\/stockinsider-production-write.lock /m);
    assert.ok(unit.trim().split('\n').some(line => line.endsWith('scripts/run-launch-scheduled-cycle.mjs ' + mode)));
    assert.doesNotMatch(unit, /\/pipeline-run/);
  }
});

test('the protected launch-only endpoint refuses fallback before invoking the cycle', async () => {
  const source = await readFile(new URL('../web/src/lib/vnext/http.ts', import.meta.url), 'utf8');
  const action = source.slice(source.indexOf("if(action==='launch-cycle'||action==='launch-weekly-audit')"), source.indexOf("if(action==='capture-opening-halts')"));
  assert.match(action, /identity.role!=='operator'.*requireExactInternalBearer/);
  assert.match(action, /Object.keys\(body\).some\(key=>key!=='action'\)/);
  assert.match(action, /if\(!launchRankingEnabled\(\)\)[\s\S]*status:503[\s\S]*runLaunchWeeklyThesisAudit\(identity\)[\s\S]*runPostcloseResearchCycle\(identity\)/);
});

test('weekly error neither promotes an audit nor blocks a separate eligible publication', () => {
  const { calls, run } = plan(day + 'T13:30:00Z', [complete, evening], { weekly: { ok: false } });
  assert.deepEqual(run(), { slot: 'postclose', sessionDate: day, weeklyAudit: 'failed', status: 'published' });
  assert.equal(calls.length, 3);
  assert.equal(calls.at(-1).payload.action, 'launch-cycle');
});

test('a date rollover during the weekly audit does not start a final drain', () => {
  const { calls, run } = plan([day + 'T15:59:00Z', day + 'T16:00:00Z']);
  assert.equal(run().reason, 'launch_schedule_window_changed');
  assert.deepEqual(calls.map(item => item.payload.action), ['launch-weekly-audit']);
});
