import { performance } from 'node:perf_hooks';

/** Test-only collector: exit is not proof that inherited pipes have drained. */
export function collectPipedChild(child, {
  timeoutMs = 30_000, maxBytes = 65_536, now = () => performance.now(),
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    throw new Error('piped_child_limits_invalid');
  const startedAt = now();
  if (!Number.isFinite(startedAt)) throw new Error('piped_child_clock_invalid');
  let settled = false, leaderExited = false, timer;
  let outBytes = 0, errBytes = 0;
  const out = [], err = [];
  let resolveResult, rejectResult;
  const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  const release = () => { if (timer !== undefined) clearTimer(timer); };
  const fail = error => {
    if (settled) return;
    settled = true;
    release();
    out.length = 0; err.length = 0;
    // Retain error listeners for late events. Never signal a leader after exit.
    if (!leaderExited && child.exitCode == null && child.signalCode == null) {
      try { child.kill('SIGKILL'); } catch { /* Original capture failure takes precedence. */ }
    }
    child.stdout?.destroy(); child.stderr?.destroy();
    rejectResult(error);
  };
  const read = (stream, chunks, isError) => {
    stream.on('error', error => fail(error));
    stream.on('data', chunk => {
      if (settled) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const size = (isError ? errBytes : outBytes) + bytes.length;
      if (size > maxBytes) { fail(new Error('piped_child_output_limit')); return; }
      if (isError) errBytes = size; else outBytes = size;
      chunks.push(bytes);
    });
  };
  if (!child.stdout || !child.stderr) {
    fail(new Error('piped_child_streams_required'));
    return { result, cancel: fail };
  }
  read(child.stdout, out, false); read(child.stderr, err, true);
  child.on('error', error => fail(error));
  child.on('exit', () => { leaderExited = true; });
  child.on('close', (code, signal) => {
    if (settled) return;
    const elapsed = now() - startedAt;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= timeoutMs) {
      fail(new Error('piped_child_deadline')); return;
    }
    settled = true; release();
    resolveResult({ code, signal, out: Buffer.concat(out).toString('utf8'), err: Buffer.concat(err).toString('utf8') });
    out.length = 0; err.length = 0;
  });
  timer = setTimer(() => fail(new Error('piped_child_deadline')), timeoutMs);
  return { result, cancel: (error = new Error('piped_child_cancelled')) => fail(error) };
}
