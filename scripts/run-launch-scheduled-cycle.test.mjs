import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { launchScheduledSlot, runLaunchScheduledCycle } from './run-launch-scheduled-cycle.mjs';

const day = '2026-11-16';
const policyVersion = 'stockinsider-launch-radar-v1';
const active = { STOCKINSIDER_VNEXT_ENABLED: 'true', STOCKINSIDER_LAUNCH_RANKING_ENABLED: 'true' };
const morning = { ok: true, policyVersion, result: { session: day, status: 'published' } };
const evening = { ok: true, policyVersion, result: { status: 'existing_reviewed_cache_only', ranking: { published: true } } };
const currentWeek = { ok: true, policyVersion, result: { status: 'current', reviewed: 0 } };
const complete = { ok: true, result: {
  sessionDate: day, phase: 'final', status: 'complete', scopeComplete: true, dataComplete: true,
  researchReady: true, errors: [],
} };

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
      ['00:59:59', 'morning'], ['01:00:00', null], ['12:54:59', null], ['12:55:00', 'research'],
      ['13:09:59', 'research'], ['13:10:00', null], ['13:29:59', null],
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

test('existing Taipei morning slot checks both closed days and new mail with separate bounded requests', () => {
  const env = { ...active, STOCKINSIDER_VNEXT_INVESTANCHORS_GMAIL_ENABLED: 'true' };
  const response = { ok: true, policyVersion, result: { scanStatus: 'scanned', articleAuthority: false } };
  const current = { ok: true, policyVersion, result: { scanStatus: 'open_day', checkpointDay: null, articleAuthority: false } };
  const normal = plan(day + 'T00:15:00Z', [morning, response, current], { env });
  assert.deepEqual(normal.run(), { slot: 'morning', sessionDate: day, status: 'published', noticeScan: 'scanned', currentNoticeScan: 'open_day' });
  assert.deepEqual(normal.calls.slice(1).map(row => [row.payload, row.timeoutMs]), [
    [{ action: 'investanchors-gmail-notices' }, 225_000],
    [{ action: 'investanchors-gmail-notices', scope: 'current' }, 115_000],
  ]);
  const unavailable = plan(day + 'T00:15:00Z', [morning, null, current], { env });
  assert.deepEqual(unavailable.run(), { slot: 'morning', sessionDate: day, status: 'published', noticeScan: 'failed', currentNoticeScan: 'open_day' });
  const erroneousCheckpoint = { ...current, result: { ...current.result, checkpointDay: day } };
  assert.equal(plan(day + 'T00:15:00Z', [morning, response, erroneousCheckpoint], { env }).run().currentNoticeScan, 'failed');
  const marketFailed = plan(day + 'T00:15:00Z', [null, response, current], { env });
  assert.throws(marketFailed.run, /launch_market_background_failed/u);
  assert.deepEqual(marketFailed.calls.map(row => row.payload.action), ['market-background', 'investanchors-gmail-notices', 'investanchors-gmail-notices']);
});
test('private notice request is an operator-only internal action with a closed request', async () => {
  const http = await readFile(new URL('../web/src/lib/vnext/http.ts', import.meta.url), 'utf8');
  const block = http.slice(http.indexOf("if(action==='investanchors-gmail-notices')"), http.indexOf("if(action==='market-background')"));
  assert.match(block, /identity.role!=='operator'.*requireExactInternalBearer/u);
  assert.match(block, /key!=='action'&&key!=='day'&&key!=='scope'/u);
  assert.match(block, /body\.scope!==undefined&&\(body\.scope!=='current'\|\|body\.day!==undefined\)/u);
  assert.match(block, /runConfiguredInvestAnchorsNotices\(identity,body\.day,body\.scope==='current'\?'current':undefined\)/u);
  assert.match(block, /'cache-control':'no-store'/u);
});
test('morning refuses a publication receipt for a different session', () => {
  const { run } = plan(day + 'T00:15:00Z', [{ ...morning, result: { ...morning.result, session: '2026-11-13' } }]);
  assert.throws(run, { message: 'launch_market_background_wrong_scope' });
});

test('20:55 uses only protected dispatch and keeps the 21:30 publication separate', () => {
  const result = { status: 'processed', session: day, attempted: 2, published: 1, stopped: false };
  const enabled = { env: { ...active, STOCKINSIDER_LAUNCH_RESEARCH_DISPATCH_ENABLED: 'true' } };
  const at = day + 'T12:55:00Z';
  const normal = plan(at, [{ ok: true, policyVersion, result }], enabled);
  assert.deepEqual(normal.run(), { slot: 'research', sessionDate: day, status: 'processed', attempted: 2, published: 1, stopped: false });
  assert.deepEqual(normal.calls, [{
    endpoint: '/api/internal/vnext-research', payload: { action: 'launch-research-dispatch' }, timeoutMs: 720_000,
  }]);
  const disabled = plan(at);
  assert.equal(disabled.run().reason, 'launch_research_dispatch_disabled');
  assert.deepEqual(disabled.calls, []);
  const gap = { status: 'deferred', reason: 'launch_research_final_data_unready' };
  assert.equal(plan(at, [{ ok: true, policyVersion, result: gap }], enabled).run().reason, gap.reason);
  for (const changed of [{ ...result, session: '2026-11-13' }, { ...result, attempted: 5 }]) {
    assert.throws(plan(at, [{ ok: true, policyVersion, result: changed }], enabled).run,
      { message: 'launch_research_dispatch_wrong_scope' });
  }
});

test('scheduled dispatch is exact internal operator POST with no caller dates, jobs or model', async () => {
  const source = await readFile(new URL('../web/src/lib/vnext/http.ts', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf("if(action==='launch-research-dispatch')"), source.indexOf("if(action==='launch-cycle'"));
  assert.match(block, /entrypoint!=='vnext-research'\|\|identity.role!=='operator'.*requireExactInternalBearer/u);
  assert.match(block, /Object.keys\(body\).some\(key=>key!=='action'\)/u);
  assert.match(block, /runScheduledLaunchResearch\(identity\)/u);
  assert.match(block, /'cache-control':'no-store'/u);
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

test('evening uses the existing private open-day notice scan after publication or retention', () => {
  const env = { ...active, STOCKINSIDER_VNEXT_INVESTANCHORS_GMAIL_ENABLED: 'true' };
  const current = { ok: true, policyVersion, result: { scanStatus: 'open_day', checkpointDay: null, articleAuthority: false } };
  for (const [published, status] of [[true, 'published'], [false, 'retained']]) {
    const ranking = { ...evening, result: { ...evening.result, ranking: { published } } };
    const { calls, run } = plan(day + 'T13:30:00Z', [complete, ranking, current], { env });
    assert.deepEqual(run(), { slot: 'postclose', sessionDate: day, weeklyAudit: 'current', status, currentNoticeScan: 'open_day' });
    assert.deepEqual(calls.slice(2).map(row => [row.payload, row.timeoutMs]), [
      [{ action: 'launch-cycle' }, 1_500_000],
      [{ action: 'investanchors-gmail-notices', scope: 'current' }, 115_000],
    ]);
  }
  for (const response of [null, { ...current, result: { ...current.result, articleAuthority: true } },
    { ...current, result: { ...current.result, checkpointDay: day } }]) {
    const { run } = plan(day + 'T13:30:00Z', [complete, evening, response], { env });
    assert.deepEqual(run(), { slot: 'postclose', sessionDate: day, weeklyAudit: 'current', status: 'published', currentNoticeScan: 'failed' });
  }
});

test('evening uses the next morning to recover a notice scan that cannot fit before midnight', () => {
  const env = { ...active, STOCKINSIDER_VNEXT_INVESTANCHORS_GMAIL_ENABLED: 'true' };
  for (const finishedAt of [day + 'T15:58:00.001Z', day + 'T16:03:00Z']) {
    const { calls, run } = plan([day + 'T13:30:00Z', day + 'T13:31:00Z', day + 'T13:32:00Z', finishedAt],
      [complete, evening], { env });
    assert.deepEqual(run(), { slot: 'postclose', sessionDate: day, weeklyAudit: 'current', status: 'published', currentNoticeScan: 'deferred' });
    assert.equal(calls.length, 3);
  }
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

test('final readiness requires the final phase and consistent, error-free queue state', () => {
  for (const change of [
    { phase: 'preliminary' },
    { phase: undefined },
    { status: 'incomplete' },
    { scopeComplete: false },
    { status: 'partial_candidate_data', scopeComplete: false },
    { errors: undefined },
    { errors: [{ error: 'stock_data_write_failed' }] },
  ]) {
    const reply = { ...complete, result: { ...complete.result, ...change } };
    const { calls, run } = plan(day + 'T13:30:00Z', [reply, evening]);
    assert.throws(run, { message: 'launch_final_drain_wrong_scope' });
    assert.equal(calls.some(item => item.payload.action === 'launch-cycle'), false);
  }
});

test('final partial candidate readiness still delegates cohort publication to the writer', () => {
  const partial = { ...complete, result: { ...complete.result, status: 'partial_candidate_data',
    scopeComplete: false, dataComplete: false } };
  const { calls, run } = plan(day + 'T13:30:00Z', [partial, evening]);
  assert.equal(run().status, 'published');
  assert.equal(calls.at(-1).payload.action, 'launch-cycle');
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

test('the one candidate timer owns all three Taipei slots and neither service calls the legacy publisher', async () => {
  const dir = new URL('../deployment/vps/launch-radar-schedule/', import.meta.url);
  const [timer, service, prep] = await Promise.all([
    readFile(new URL('stockinsider-research-cycle.timer', dir), 'utf8'),
    readFile(new URL('stockinsider-research-cycle.service', dir), 'utf8'),
    readFile(new URL('stockinsider-taiwan-data-preliminary.service', dir), 'utf8'),
  ]);
  assert.deepEqual(timer.match(/^OnCalendar=.*$/gm), [
    'OnCalendar=*-*-* 08:15:00 Asia/Taipei',
    'OnCalendar=*-*-* 20:55:00 Asia/Taipei',
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


const incompleteFinal = {
  ok: false, error: 'taiwan_refresh_scope_incomplete',
  result: { status: 'incomplete', phase: 'final', sessionDate: day, researchReady: false, scopeComplete: false, dataComplete: false, errors: [] },
};
const outcomeRefresh = { ok: true, policyVersion,
  result: { status: 'evaluated', session: day, asOf: day + 'T13:30:00Z' } };
const gmailEnabled = { ...active, STOCKINSIDER_VNEXT_INVESTANCHORS_GMAIL_ENABLED: 'true' };
const openDayNotice = { ok: true, policyVersion, result: { scanStatus: 'open_day', checkpointDay: null, articleAuthority: false } };

test('a same-session final data gap retains ranking, refreshes prior outcomes and scans current-day notices', () => {
  const { calls, run } = plan(day + 'T13:30:00Z', [incompleteFinal, outcomeRefresh, openDayNotice], { env: gmailEnabled });
  assert.deepEqual(run(), {
    slot: 'postclose', sessionDate: day, status: 'retained', weeklyAudit: 'current',
    reason: 'launch_final_data_unready', outcomeRefresh: 'evaluated', currentNoticeScan: 'open_day',
  });
  assert.deepEqual(calls.map(item => item.payload.action ?? item.payload.phase),
    ['launch-weekly-audit', 'final', 'launch-outcome-refresh', 'investanchors-gmail-notices']);
  assert.deepEqual(calls[2].payload, { action: 'launch-outcome-refresh' });
});

test('retained-cycle outcome receipts are bound to the same session and cutoff', () => {
  for (const reply of [
    null,
    { ...outcomeRefresh, policyVersion: 'unrelated' },
    { ...outcomeRefresh, result: { ...outcomeRefresh.result, session: '2026-11-13' } },
    { ...outcomeRefresh, result: { ...outcomeRefresh.result, asOf: day + 'T13:31:00Z' } },
  ]) {
    const { calls, run } = plan(day + 'T13:30:00Z', [incompleteFinal, reply]);
    const result = run();
    assert.equal(result.status, 'retained');
    assert.equal(result.outcomeRefresh, 'failed');
    assert.equal(calls.some(item => item.payload.action === 'launch-cycle'), false);
  }
  const deferred = { ok: true, policyVersion, result: { status: 'deferred' } };
  const deferredReply = plan(day + 'T13:30:00Z', [incompleteFinal, deferred]);
  assert.equal(deferredReply.run().outcomeRefresh, 'deferred');
  const rollover = plan([day + 'T15:57:00Z', day + 'T15:58:00Z', day + 'T16:02:00Z'], [incompleteFinal]);
  assert.equal(rollover.run().outcomeRefresh, 'deferred');
  assert.equal(rollover.calls.length, 2);
});

test('evening transport or policy errors remain failures and still run the separate notice scan', () => {
  for (const [replies, failure] of [
    [[null, openDayNotice], 'launch_final_drain_failed'],
    [[{ ...incompleteFinal, result: { ...incompleteFinal.result, sessionDate: '2026-11-13' } }, openDayNotice], 'launch_final_drain_failed'],
    [[{ ...incompleteFinal, result: { ...incompleteFinal.result, dataComplete: true } }, openDayNotice], 'launch_final_drain_failed'],
    [[complete, { ...evening, policyVersion: 'unrelated' }, openDayNotice], 'launch_cycle_wrong_policy'],
  ]) {
    const { calls, run } = plan(day + 'T13:30:00Z', replies, { env: gmailEnabled });
    assert.throws(run, { message: failure });
    assert.deepEqual(calls.at(-1).payload, { action: 'investanchors-gmail-notices', scope: 'current' });
  }
  const rollover = plan([day + 'T15:57:00Z', day + 'T15:58:00Z', day + 'T16:02:00Z'],
    [null], { env: gmailEnabled });
  assert.throws(rollover.run, { message: 'launch_final_drain_failed' });
  assert.equal(rollover.calls.length, 2);
});

test('actual internal-API child keeps a bounded HTTP 503 incomplete-final response', async () => {
  const server = spawn(process.execPath, ['--input-type=module', '-e', `
    import { createServer } from 'node:http';
    const weekly = ${JSON.stringify(currentWeek)};
    const incomplete = ${JSON.stringify(incompleteFinal)};
    const outcomes = ${JSON.stringify(outcomeRefresh)};
    const current = ${JSON.stringify(openDayNotice)};
    let stage = 0;
    const listener = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const valid = req.method === 'POST' && req.headers.authorization === 'Bearer test-operator';
      let answer = { ok: false, error: 'unexpected_test_request' }, status = 409;
      if (valid && stage === 0 && req.url === '/api/internal/vnext-research' && input.action === 'launch-weekly-audit') {
        ++stage; answer = weekly; status = 200;
      } else if (valid && stage === 1 && req.url === '/api/internal/taiwan-data-queue-drain'
        && input.phase === 'final' && input.sessionDate === incomplete.result.sessionDate && input.requireComplete === true) {
        ++stage; answer = incomplete; status = 503;
      } else if (valid && stage === 2 && req.url === '/api/internal/vnext-research'
        && input.action === 'launch-outcome-refresh' && Object.keys(input).length === 1) {
        ++stage; answer = outcomes; status = 200;
      } else if (valid && stage === 3 && req.url === '/api/internal/vnext-research'
        && input.action === 'investanchors-gmail-notices' && input.scope === 'current') {
        ++stage; answer = current; status = 200;
      }
      res.writeHead(status, { 'content-type':'application/json' });
      res.end(JSON.stringify(answer));
    });
    listener.listen(0, '127.0.0.1', () => console.log(listener.address().port));
  `], { stdio: ['ignore', 'pipe', 'ignore'] });
  const exited = once(server, 'exit');
  try {
    const [chunk] = await once(server.stdout, 'data', { signal: AbortSignal.timeout(5000) });
    const port = Number(chunk.toString().trim());
    assert.ok(Number.isInteger(port) && port > 0);
    const origin = 'http://127.0.0.1:' + port;
    const observation = runLaunchScheduledCycle({
      mode: 'schedule', clock: () => new Date(day + 'T13:30:00Z'),
      env: { ...process.env, ...gmailEnabled, APP_URL: origin, EXPECTED_APP_URL: origin, INTERNAL_API_KEY: 'test-operator' },
    });
    assert.equal(observation.status, 'retained');
    assert.equal(observation.reason, 'launch_final_data_unready');
    assert.equal(observation.outcomeRefresh, 'evaluated');
    assert.equal(observation.currentNoticeScan, 'open_day');
  } finally {
    server.kill();
    await exited;
  }
});
