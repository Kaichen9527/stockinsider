'use strict';

const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { RunnerError, assert } = require('./artifacts');

const ownershipLostErrors = new WeakSet();
function isOwnershipLost(error) { return ownershipLostErrors.has(error); }

// This helper owns the spawn: callers cannot nominate an existing process group.
function runModelProcess({ executable, args, cwd, env, input, timeout,
  verifyHost, onStart = () => {}, onExit = () => {}, spawnFn = spawn,
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
  signalGroup = process.kill }) {
  return new Promise((resolve, reject) => {
    assert(Number.isSafeInteger(timeout) && timeout > 0 && Number.isSafeInteger(timeout * 1000), 12);
    verifyHost();
    const startedAt = now();
    assert(Number.isFinite(startedAt), 12);
    let lastNow = startedAt;
    let idleAt = startedAt + 300_000;
    const wallAt = startedAt + timeout * 1000;
    let cleanupAt = null;
    let timer;
    let settled = false;
    let failure = null;
    let exited = false;
    let exitCode;
    let exitSignal;
    let spawned = false;
    let stdinFinished = false;
    const eof = { stdout: false, stderr: false };
    const counts = { stdout: 0, stderr: 0 };
    const chunks = [];
    const child = spawnFn(executable, args, {
      cwd, env, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const ownedPid = Number.isSafeInteger(child.pid) && child.pid > 1 && child.pid !== process.pid ? child.pid : null;

    function clock() {
      const value = now();
      if (!Number.isFinite(value) || value < lastNow) throw new RunnerError(12);
      lastNow = value;
      return value;
    }
    function signalOwned(signal) {
      // After exit, the numeric PID/PGID is no longer an ownership proof.
      if (exited || !ownedPid) return;
      try { signalGroup(-ownedPid, signal); } catch { /* Failure remains terminal; no PID fallback. */ }
    }
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      for (const stream of [child.stdin, child.stdout, child.stderr]) stream.destroy();
      try { verifyHost(); } catch (caught) { error = caught instanceof RunnerError ? caught : new RunnerError(5); }
      if (error && ownedPid && (!exited || !eof.stdout || !eof.stderr)) {
        const blocked = new RunnerError(11);
        blocked.primaryFailureCode = error.code;
        blocked.primaryExit = error.exit;
        ownershipLostErrors.add(blocked);
        error = blocked;
      }
      if (error) reject(error);
      else resolve(Buffer.concat(chunks));
    }
    function arm() {
      clearTimer(timer);
      if (settled) return;
      const due = failure ? cleanupAt : Math.min(cleanupAt ?? Infinity, wallAt, idleAt);
      timer = setTimer(check, Math.max(1, due - lastNow));
    }
    function fail(error = new RunnerError(10)) {
      if (settled || failure) return;
      failure = error;
      chunks.length = 0;
      cleanupAt = Math.min(cleanupAt ?? Infinity, lastNow + 5000);
      signalOwned('SIGTERM');
      arm();
    }
    function check() {
      if (settled) return false;
      try { clock(); } catch (error) { fail(error); signalOwned('SIGKILL'); finish(failure); return false; }
      if (cleanupAt !== null && lastNow >= cleanupAt) {
        // A live leader still anchors this invocation's detached group. Once it
        // exits, only bounded pipe disposal is safe; never signal its old number.
        signalOwned('SIGKILL');
        finish(failure ?? new RunnerError(10));
        return false;
      }
      if (!failure && (lastNow >= wallAt || lastNow >= idleAt)) fail();
      arm();
      return !failure;
    }
    child.once('spawn', () => {
      if (settled) return;
      spawned = true;
      if (!ownedPid) { fail(); return; }
      try {
        if (!check()) return;
        onStart(ownedPid, ownedPid);
        child.stdin.end(input);
      } catch (error) { fail(error instanceof RunnerError ? error : new RunnerError(12)); }
    });
    child.stdin.once('finish', () => { stdinFinished = true; });
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      stream.on('error', () => { if (!settled) { check(); fail(); } });
    }
    for (const name of ['stdout', 'stderr']) {
      child[name].on('data', chunk => {
        if (!check()) return;
        if (eof[name] || !Buffer.isBuffer(chunk)) { fail(); return; }
        counts[name] += chunk.length;
        if (counts[name] > (name === 'stdout' ? 16_777_216 : 8_388_608)) { fail(); return; }
        if (name === 'stdout') {
          chunks.push(chunk);
          if (chunk.includes(10)) { idleAt = lastNow + 300_000; arm(); }
        }
      });
      child[name].once('end', () => { eof[name] = true; });
      child[name].once('close', () => { if (!eof[name] && !settled) fail(); });
    }
    child.once('error', () => {
      fail();
      if (!ownedPid) finish(failure);
    });
    child.once('exit', (code, signal) => {
      exited = true; // Revoke group signalling before any user callback.
      exitCode = code; exitSignal = signal;
      if (settled) return;
      check();
      try { onExit(code, signal); } catch (error) { fail(error instanceof RunnerError ? error : new RunnerError(12)); }
      if (code !== 0 || signal !== null) fail();
      // Normal EOF/close may follow exit. Give pipes a bounded drain interval;
      // absent close is never converted into success, even for exit code zero.
      if (cleanupAt === null) cleanupAt = lastNow + 5000;
      arm();
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      check();
      if (settled) return;
      if (!spawned || !exited || !stdinFinished || !eof.stdout || !eof.stderr
        || code !== exitCode || signal !== exitSignal || code !== 0 || signal !== null) fail();
      finish(failure);
    });
    try { verifyHost(); } catch (error) { fail(error instanceof RunnerError ? error : new RunnerError(5)); }
    arm();
  });
}

module.exports = { runModelProcess, isOwnershipLost };
