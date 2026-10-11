import { execFile } from 'node:child_process';

// Test-only transport. SQL is never an argv member; retain the PG test's
// original six-second child deadline and one-MiB stdout/stderr limits.
export const MAX_SQL_INPUT_BYTES = 4 * 1048576;
export function reviewerResultSqlStdin(executable, args, sql, { timeout = 6000, maxBuffer = 1048576 } = {}) {
  if (typeof sql !== 'string' || Buffer.byteLength(sql, 'utf8') > MAX_SQL_INPUT_BYTES) {
    return Promise.reject(new Error('reviewer_result_sql_input_limit'));
  }
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 6000 ||
      !Number.isInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > 1048576) {
    return Promise.reject(new Error('reviewer_result_sql_transport_limits'));
  }
  return new Promise((resolve, reject) => {
    let inputError;
    const child = execFile(executable, args, { encoding: 'utf8', timeout, maxBuffer }, (error, stdout, stderr) => {
      // Wait for execFile's exit/pipe-drain callback even after a stdin error.
      // Its original timeout still bounds a child that stops consuming input.
      const failure = error || inputError;
      if (failure) {
        failure.stdout = stdout;
        failure.stderr = stderr;
        reject(failure);
      } else resolve({ stdout, stderr });
    });
    if (!child.stdin) {
      inputError = new Error('reviewer_result_sql_stdin_unavailable');
      child.kill();
      return;
    }
    child.stdin.on('error', error => { inputError ||= error; });
    child.stdin.end(sql, 'utf8', error => { if (error) inputError ||= error; });
  });
}
