import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchLaunchQueue } from './launch-research-dispatch.ts';

const session = '2026-11-16';
const job = (id: number) => ({ job_id: '00000000-0000-4000-8000-' + String(id).padStart(12, '0') });
const queue = (queued = [job(1)], transientFailures = [job(2)]) =>
  ({ session, reason: null, queued, transientFailures });
const closed = { session: null, reason: 'launch_research_window_closed' };
const ready = {
  expected: 3, completed: 2, failed: 1, failedCandidate: 1, failedCritical: 0,
  queued: 0, running: 0, missing: 0, retrying: 0, settled: true, researchReady: true,
};

function fixture(contexts: unknown[], progress = ready) {
  const writes: string[] = [];
  const checked: string[] = [];
  let modelChecks = 0;
  const deps = {
    async context() { return contexts.length === 1 ? contexts[0] : contexts.shift(); },
    async progress(day: string) { checked.push(day); return progress; },
    async workerReady() { modelChecks++; },
    async retry(id: string) { writes.push('retry ' + id); return { jobId: job(9).job_id }; },
    async run(id: string) { writes.push('run ' + id); return { status: 'published', replay: id === job(9).job_id }; },
  };
  return { deps, writes, checked, modelChecks: () => modelChecks };
}

test('defers failed authority and final data without checking or using models', async () => {
  for (const reason of ['launch_research_mode_unavailable', 'launch_research_window_closed',
    'launch_research_official_session_missing', 'launch_research_both_venue_calendar_missing']) {
    const f = fixture([{ session: null, reason }]);
    assert.deepEqual(await dispatchLaunchQueue(f.deps), { status: 'deferred', reason });
    assert.deepEqual(f.checked, []);
    assert.equal(f.modelChecks(), 0);
    assert.deepEqual(f.writes, []);
  }
  const f = fixture([queue()], { ...ready, failedCritical: 1 });
  assert.deepEqual(await dispatchLaunchQueue(f.deps), { status: 'deferred', reason: 'launch_research_final_data_unready' });
  assert.equal(f.modelChecks(), 0);
  assert.deepEqual(f.writes, []);
});

test('no model preflight on empty work and no queue mutation before pair verification', async () => {
  const empty = fixture([queue([], [])]);
  assert.deepEqual(await dispatchLaunchQueue(empty.deps), { status: 'processed', session, attempted: 0, published: 0, stopped: false });
  assert.equal(empty.modelChecks(), 0);
  const refused = fixture([queue()]);
  refused.deps.workerReady = async () => { throw Error('synthetic_worker_binding'); };
  await assert.rejects(dispatchLaunchQueue(refused.deps), /synthetic_worker_binding/u);
  assert.deepEqual(refused.writes, []);
});

test('uses existing queue first, retries only definite current work and excludes a replay from publication count', async () => {
  const f = fixture([queue([job(1), job(1)], [job(2)])]);
  assert.deepEqual(await dispatchLaunchQueue(f.deps), { status: 'processed', session, attempted: 2, published: 1, stopped: false });
  assert.deepEqual(f.writes, ['run ' + job(1).job_id, 'retry ' + job(2).job_id, 'run ' + job(9).job_id]);
  assert.deepEqual(f.checked, [session, session, session]);
});

test('stops at four and rechecks current eligibility and the closed window between starts', async () => {
  const full = fixture([queue([job(1),job(2),job(3),job(4)], [job(5)])]);
  assert.equal((await dispatchLaunchQueue(full.deps) as {attempted:number}).attempted, 4);
  assert.equal(full.writes.length, 4);
  const f = fixture([queue(), queue(), closed]);
  assert.deepEqual(await dispatchLaunchQueue(f.deps), { status: 'processed', session, attempted: 1, published: 1, stopped: true });
  assert.deepEqual(f.writes, ['run ' + job(1).job_id]);
  const stale = fixture([queue(), queue([], [job(2)])]);
  assert.deepEqual(await dispatchLaunchQueue(stale.deps), { status: 'processed', session, attempted: 1, published: 0, stopped: false });
  assert.deepEqual(stale.writes, ['retry ' + job(2).job_id, 'run ' + job(9).job_id]);
});

test('rejects malformed context and operator-controlled dates', async () => {
  for (const context of [null, { ...queue(), session: '2026-02-31' }, queue([{job_id: '../bad'}])]) {
    const f = fixture([context]);
    await assert.rejects(dispatchLaunchQueue(f.deps), /launch_research_dispatch_context_unavailable/u);
    assert.deepEqual(f.writes, []);
  }
});


test('scheduled industry collection runs for a confirmed session even on an empty research queue', async () => {
  const empty = fixture([queue([], [])]);
  const days: string[] = [];
  const result = await dispatchLaunchQueue({
    ...empty.deps,
    async captureIndustry(day) {
      days.push(day);
      return { status: 'processed', written: 1, replayed: 0, deferred: 1 };
    },
  });
  assert.deepEqual(days, [session]);
  assert.deepEqual(result.industryCapture, { status: 'processed', written: 1, replayed: 0, deferred: 1 });
  assert.equal(empty.modelChecks(), 0);
});
