'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { runModelProcess } = require('./processLifecycle');

function fixture(options = {}) {
  let time = 0; let sequence = 0;
  const timers = new Map(); const signals = [];
  const child = new EventEmitter(); child.pid = 54123;
  for (const key of ['stdin', 'stdout', 'stderr']) {
    child[key] = new EventEmitter();
    child[key].destroy = () => { child[key].destroyed = true; };
  }
  child.stdin.end = () => child.stdin.emit('finish');
  child.kill = signal => signals.push(['child', signal]);
  const promise = runModelProcess({ executable: '/fixture/node', args: [], cwd: '/', env: {}, input: 'request', timeout: 600, verifyHost: () => {},
    spawnFn: (_command, _args, opts) => { assert.equal(opts.detached, true); assert.equal(opts.shell, false); return child; },
    now: () => time,
    setTimer: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, due: time + delay }); return id; },
    clearTimer: id => timers.delete(id), signalGroup: (pid, signal) => signals.push([pid, signal]), ...options });
  const outcome = promise.then(value => ({ value }), error => ({ error }));
  child.emit('spawn');
  function tick(value, dispatch = true) {
    time = value;
    if (!dispatch) return;
    for (let count = 0; count < 100; count++) {
      const next = [...timers].find(([, timer]) => timer.due <= time);
      if (!next) return;
      timers.delete(next[0]); next[1].fn();
    }
    throw new Error('timer did not converge');
  }
  function close(code = 0, signal = null) {
    child.emit('exit', code, signal);
    child.stdout.emit('end'); child.stderr.emit('end');
    child.emit('close', code, signal);
  }
  return { child, promise, outcome, signals, tick, close, timers };
}
const fail = async f => assert.ok([10, 11].includes((await f.outcome).error?.exit));

test('separate stdout 16 MiB and stderr 8 MiB bounds permit combined >17 MiB', async () => {
  const f = fixture();
  for (let i = 0; i < 16; i++) f.child.stdout.emit('data', Buffer.alloc(1_048_576, 32));
  f.child.stderr.emit('data', Buffer.alloc(8_388_608, 120));
  f.close();
  assert.equal((await f.outcome).value?.length, 16_777_216);
  assert.deepEqual(f.signals, []);
});
test('stderr between old 1 MiB and approved 8 MiB is accepted', async () => {
  const f = fixture(); f.child.stdout.emit('data', Buffer.from('ok\n'));
  f.child.stderr.emit('data', Buffer.alloc(2_000_000, 120)); f.close();
  assert.equal((await f.outcome).value?.toString(), 'ok\n');
});
for (const [stream, limit] of [['stdout', 16_777_216], ['stderr', 8_388_608]]) {
  test(`${stream} over-limit terminates TERM then bounded KILL`, async () => {
    const f = fixture(); f.child[stream].emit('data', Buffer.alloc(limit + 1, 120));
    assert.deepEqual(f.signals, [[-54123, 'SIGTERM']]);
    f.tick(4999); assert.equal(f.signals.length, 1);
    f.tick(5000); assert.deepEqual(f.signals, [[-54123, 'SIGTERM'], [-54123, 'SIGKILL']]);
    await fail(f); assert.equal(f.child.stdout.destroyed, true);
  });
}
test('idle deadline is 300 seconds, not 30', async () => {
  const f = fixture(); f.tick(30_000); assert.deepEqual(f.signals, []);
  f.tick(299_999); assert.deepEqual(f.signals, []);
  f.tick(300_000); assert.deepEqual(f.signals, [[-54123, 'SIGTERM']]);
  f.tick(305_000); await fail(f);
});
test('partial stdout and complete stderr lines cannot reset stdout idle-line deadline', async () => {
  const f = fixture(); f.tick(299_000, false);
  f.child.stdout.emit('data', Buffer.from('partial')); f.child.stderr.emit('data', Buffer.from('diagnostic\n'));
  f.tick(300_000); assert.deepEqual(f.signals, [[-54123, 'SIGTERM']]); f.tick(305_000); await fail(f);
});
test('a complete stdout line resets only the idle deadline', async () => {
  const f = fixture(); f.tick(299_000, false); f.child.stdout.emit('data', Buffer.from('progress\n'));
  f.tick(300_000); assert.deepEqual(f.signals, []);
  f.tick(599_000); assert.deepEqual(f.signals, [[-54123, 'SIGTERM']]); f.tick(604_000); await fail(f);
});
test('manifest wall deadline is checked at events even when timer callback is delayed', async () => {
  const f = fixture({ timeout: 10 }); f.tick(10_000, false);
  f.child.stdout.emit('data', Buffer.from('late\n')); f.close(); await fail(f);
});
test('successful close cannot outrun delayed monotonic wall check', async () => {
  const f = fixture({ timeout: 10 }); f.tick(10_000, false); f.close(); await fail(f);
});
test('prompt and stdout/stderr pipe errors fail closed without uncaught errors', async () => {
  for (const stream of ['stdin', 'stdout', 'stderr']) {
    const f = fixture(); assert.doesNotThrow(() => f.child[stream].emit('error', new Error('fixture')));
    f.tick(5000); await fail(f);
  }
});
test('close without successful pipe EOF is rejected', async () => {
  const f = fixture(); f.child.emit('exit', 0, null); f.child.emit('close', 0, null); await fail(f);
});
test('exit with descendant-retained pipe is bounded and cannot pass', async () => {
  const f = fixture(); f.child.emit('exit', 0, null); f.tick(5000); await fail(f);
  assert.equal(f.child.stdout.destroyed, true);
});
test('nonzero exit and signal never produce stdout result', async () => {
  for (const [code, signal] of [[2, null], [null, 'SIGTERM']]) {
    const f = fixture(); f.close(code, signal); await fail(f);
  }
});
test('identity recheck failure cannot become success and preserves routing failure', async () => {
  let calls = 0;
  const f = fixture({ verifyHost: () => { if (++calls === 3) { const error = new Error('identity'); error.exit = 5; throw error; } } });
  f.close(); assert.equal((await f.outcome).error?.exit, 5);
});

test('TERM followed by leader exit revokes all later group signalling', async () => {
  const f = fixture(); f.tick(300_000);
  f.child.emit('exit', null, 'SIGTERM'); f.tick(305_000);
  await fail(f); assert.deepEqual(f.signals, [[-54123, 'SIGTERM']]);
});
test('normal leader exit with retained pipes never signals a potentially recycled PGID', async () => {
  const f = fixture(); f.child.emit('exit', 0, null); f.tick(5000); await fail(f);
  assert.deepEqual(f.signals, []);
});
test('late events after bounded rejection cannot invoke journal callbacks', async () => {
  let calls = 0; const f = fixture({ onExit: () => { calls++; } });
  f.tick(300_000); f.tick(305_000); await fail(f);
  f.close(); assert.equal(calls, 0); assert.equal(f.timers.size, 0);
});
test('failed spawn has no PID fallback or ambient group signals', async () => {
  const child = new EventEmitter();
  for (const key of ['stdin', 'stdout', 'stderr']) { child[key] = new EventEmitter(); child[key].destroy = () => {}; }
  const signals = [];
  const pending = runModelProcess({ executable: '/none', args: [], input: '', timeout: 1,
    verifyHost: () => {}, spawnFn: () => child, signalGroup: (...args) => signals.push(args) });
  child.emit('error', new Error('not found'));
  await assert.rejects(pending, error => error.exit === 10); assert.deepEqual(signals, []);
});
test('monotonic clock regression is a terminal invariant failure', async () => {
  const f = fixture(); f.tick(10, false); f.child.stdout.emit('data', Buffer.from('line\n'));
  f.tick(5, false); f.child.stdout.emit('data', Buffer.from('later\n'));
  assert.equal((await f.outcome).error?.primaryExit, 12);
  assert.deepEqual(f.signals, [[-54123, 'SIGTERM'], [-54123, 'SIGKILL']]);
});
test('wall deadline remains fixed despite frequent complete lines', async () => {
  const f = fixture({ timeout: 2 });
  f.tick(1000, false); f.child.stdout.emit('data', Buffer.from('line\n'));
  f.tick(1999, false); f.child.stdout.emit('data', Buffer.from('line\n'));
  f.tick(2000); assert.deepEqual(f.signals, [[-54123, 'SIGTERM']]); f.tick(7000); await fail(f);
});
test('identity failure immediately after spawn return follows owned-group teardown', async () => {
  let count = 0;
  const f = fixture({ verifyHost: () => { if (++count === 2) throw new Error('changed'); } });
  assert.deepEqual(f.signals, [[-54123, 'SIGTERM']]); f.tick(5000);
  assert.equal((await f.outcome).error?.primaryExit, 5);
});
test('actual controlled Node child concurrently drains >17 MiB valid JSONL plus diagnostics', async () => {
  const { terminalResultFromJsonl } = require('./jsonlParser');
  const source = `
    const { once } = require('node:events');
    async function write(stream, bytes) { if (!stream.write(bytes)) await once(stream, 'drain'); }
    async function output() {
      await write(process.stdout, JSON.stringify({type:'thread.started',thread_id:'123e4567-e89b-42d3-a456-426614174000'})+'\\n');
      await write(process.stdout, '{"type":"turn.started"}\\n');
      for(let i=0;i<48;i++) await write(process.stdout, JSON.stringify({type:'item.completed',item:{id:'r'+i,type:'reasoning',text:'x'.repeat(262144)}})+'\\n');
      const result={protocol:'loop-model-result-v3.5',operation:'make',requestSha256:'1'.repeat(64),sourceViewSha256:'2'.repeat(64),status:'proposal',patch:'patch',findings:[],evidence:[],summary:'done'};
      await write(process.stdout, JSON.stringify({type:'item.completed',item:{id:'final',type:'agent_message',text:JSON.stringify(result)}})+'\\n');
      await write(process.stdout, JSON.stringify({type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,cache_write_input_tokens:0,output_tokens:1,reasoning_output_tokens:0}})+'\\n');
    }
    Promise.all([output(),write(process.stderr,Buffer.alloc(8_388_608,120))]).catch(()=>process.exitCode=2);
  `;
  const output = await runModelProcess({ executable: process.execPath, args: ['-e', source], cwd: '/', env: {}, input: '',
    timeout: 20, verifyHost: () => {} });
  assert.ok(output.length > 12 * 1_048_576 && output.length < 16_777_216);
  assert.equal(terminalResultFromJsonl(output).summary, 'done');
});
test('actual controlled Node child timeout is terminated without waiting for provider', async () => {
  const signals = [];
  await assert.rejects(runModelProcess({ executable: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'],
    cwd: '/', env: {}, input: '', timeout: 1, verifyHost: () => {},
    signalGroup: (pid, signal) => { signals.push(signal); return process.kill(pid, signal); } }), error => error.exit === 10);
  assert.deepEqual(signals, ['SIGTERM']);
});

for (const ownershipPhase of ['leader_exited', 'kill_unconfirmed']) test(`ownership loss (${ownershipPhase}) retains caller resources and round across persisted retry`, async () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const { executeOperation, readState, statePath } = require('./execution');
  const { parseManifest } = require('./manifest');
  const { canonicalJson, sha256 } = require('./canonicalJson');
  const { runtimePaths } = require('./journalStore');
  const { isOwnershipLost } = require('./processLifecycle');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-process-loss-'));
  try {
    const changeDirectory = path.join(directory, '.loop-engineering/state/changes/source-led-opportunity-engine-v3');
    fs.mkdirSync(changeDirectory, { recursive: true });
    fs.mkdirSync(path.join(directory, 'scripts/model-runner-v3'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'scripts/model-runner-v3/source.js'), 'fixture\n');
    fs.writeFileSync(path.join(changeDirectory, 'model-runner-contract.md'), '# fixture\n');
    const git = args => {
      const result = spawnSync('/usr/bin/git', ['-C', directory, ...args], { encoding: 'utf8', env: {
        PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@localhost',
        GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@localhost' } });
      assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
    };
    git(['init', '-q']); git(['add', '.']); git(['commit', '-q', '-m', 'fixture']);
    const head = git(['rev-parse', 'HEAD']);
    const manifest = { protocol: 'loop-model-manifest-v3.7', checkpoint: 'model_runner_v3',
      changeId: 'source-led-opportunity-engine-v3', base: head, inputHead: head,
      defaultStrategy: 'sol61-make-astra-review', tasks: [{ id: 'process-test', sequence: 0, assurance: 'critical', dependsOn: [],
        task: 'Test process ownership.', acceptanceCriteria: ['Retain unresolved resource.'],
        allowedPaths: ['scripts/model-runner-v3/**'], inspectionPaths: ['scripts/**'],
        promptFiles: ['.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-contract.md'],
        timeLimits: { makeSeconds: 60, reviewSeconds: 60, verifySeconds: 60 } }] };
    const manifestPath = path.join(changeDirectory, 'manifest.json');
    fs.writeFileSync(manifestPath, canonicalJson(manifest) + '\n');
    const parsed = parseManifest(fs.readFileSync(manifestPath)); const task = parsed.manifest.tasks[0];
    let spawns = 0; let cleanup = 0;
    const args = { parsed, task, manifestPath, operation: 'make',
      pins: { executables: [{ name: 'codex', version: 'fixture' }] },
      prepareTransportFn: ({ transport }) => { fs.mkdirSync(transport, { mode: 0o700 }); return { profileSha256: '1'.repeat(64), authMaterialSha256: '2'.repeat(64) }; },
      removeOwnedResourceFn: () => { cleanup++; },
      executeModelFn: async ({ onStart, onExit }) => {
        spawns++;
        const f = fixture({ onStart, onExit });
        if (ownershipPhase === 'leader_exited') { f.child.emit('exit', 0, null); f.tick(5000); }
        else { f.tick(300_000); f.tick(305_000); }
        const { error } = await f.outcome; assert.equal(isOwnershipLost(error), true); throw error;
      } };
    await assert.rejects(executeOperation(args), error => error.exit === 11);
    const status = readState(statePath(directory, parsed, task), parsed, task);
    assert.equal(status.state, 'recovery_required'); assert.equal(status.integrity, 'recovery_required');
    assert.equal(status.makeRound, 1); assert.equal(status.lastExit, 11);
    const paths = runtimePaths(directory, parsed.manifestSha256, sha256(task.id));
    const live = fs.readdirSync(paths.liveDirectory); assert.equal(live.length, 1);
    const attempt = JSON.parse(fs.readFileSync(path.join(paths.attemptDirectory, fs.readdirSync(paths.attemptDirectory)[0]), 'utf8'));
    assert.equal(attempt.processClassification, 'ownership_lost'); assert.equal(attempt.finalExit, 11);
    const journalFiles = fs.readdirSync(paths.resourceJournalDirectory);
    const journal = fs.readFileSync(path.join(paths.resourceJournalDirectory, journalFiles[0]), 'utf8');
    assert.equal(journal.includes('child_exited'), ownershipPhase === 'leader_exited'); assert.ok(!journal.includes('cleanup_'));
    const reservations = fs.readdirSync(paths.reservationDirectory);
    for (let retry = 0; retry < 2; retry++) await assert.rejects(executeOperation({ ...args }), error => error.exit === 11);
    await assert.rejects(executeOperation({ ...args, operation: 'review' }), error => error.exit === 8);
    assert.equal(spawns, 1); assert.equal(cleanup, 0);
    assert.deepEqual(fs.readdirSync(paths.liveDirectory), live);
    assert.deepEqual(fs.readdirSync(paths.reservationDirectory), reservations);
    assert.equal(fs.readFileSync(path.join(paths.resourceJournalDirectory, journalFiles[0]), 'utf8'), journal);
    assert.equal(readState(paths.status, parsed, task).makeRound, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('natural EOF and exit may arrive in either order, but close requires both', async () => {
  for (const order of ['eof-first', 'exit-first', 'split']) {
    const f = fixture(); f.child.stdout.emit('data', Buffer.from('ok\n'));
    if (order === 'eof-first') { f.child.stdout.emit('end'); f.child.stderr.emit('end'); f.child.emit('exit', 0, null); }
    if (order === 'exit-first') { f.child.emit('exit', 0, null); f.child.stderr.emit('end'); f.child.stdout.emit('end'); }
    if (order === 'split') { f.child.stdout.emit('end'); f.child.emit('exit', 0, null); f.child.stderr.emit('end'); }
    f.child.emit('close', 0, null); assert.equal((await f.outcome).value.toString(), 'ok\n');
  }
});
test('late valid exit/EOF cannot reverse a locked timeout failure', async () => {
  const f = fixture({ timeout: 1 }); f.tick(1000);
  f.child.stdout.emit('data', Buffer.from('late valid result\n')); f.close(); await fail(f);
  assert.deepEqual(f.signals, [[-54123, 'SIGTERM']]);
});
test('child exit and pending KILL at the same time cannot signal the expired anchor', async () => {
  const f = fixture(); f.tick(300_000); f.tick(305_000, false);
  f.child.emit('exit', null, 'SIGTERM'); f.tick(305_000); await fail(f);
  assert.deepEqual(f.signals, [[-54123, 'SIGTERM']]);
});
test('raw UTF-8 split across stdout chunks is preserved losslessly', async () => {
  const f = fixture(); const bytes = Buffer.from('繁體\n');
  for (const byte of bytes) f.child.stdout.emit('data', Buffer.from([byte]));
  f.close(); assert.deepEqual((await f.outcome).value, bytes);
});
test('drain deadline is fixed and further data cannot prolong or recover it', async () => {
  const f = fixture(); f.child.emit('exit', 0, null); f.tick(4999, false);
  f.child.stdout.emit('data', Buffer.from('late line\n')); f.tick(5000); await fail(f);
  f.close(); assert.deepEqual(f.signals, []);
});
test('pipe data after EOF rejects rather than becoming accepted result bytes', async () => {
  const f = fixture(); f.child.stdout.emit('end'); f.child.stdout.emit('data', Buffer.from('late\n'));
  f.close(); await fail(f);
});
