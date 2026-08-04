'use strict';

const ERROR_ROWS = Object.freeze({
  2: ['USAGE', 'invalid command usage'],
  3: ['MANIFEST_INVALID', 'manifest validation failed'],
  4: ['GIT_STATE_INVALID', 'trusted Git state validation failed'],
  5: ['ROUTING_BLOCKED', 'routing or host preflight blocked'],
  6: ['MODEL_PROTOCOL_ERROR', 'model protocol validation failed'],
  8: ['REVIEW_BLOCKED', 'task state or lock blocked'],
  10: ['TASK_FAILED', 'task interrupted before terminal result'],
  11: ['IO_ERROR', 'trusted runner I/O failed'],
  12: ['INTERNAL_ERROR', 'trusted runner invariant failed'],
});

class RunnerError extends Error {
  constructor(exit, detail) {
    const row = ERROR_ROWS[exit];
    if (!row) throw new Error('unknown runner exit');
    super(detail || row[1]);
    this.exit = exit;
    this.code = row[0];
  }
}

function diagnostic(error) {
  const row = ERROR_ROWS[error.exit];
  if (!row) throw error;
  return JSON.stringify({
    code: row[0],
    exit: error.exit,
    message: row[1],
    protocol: 'loop-model-error-v3.5',
  }) + '\n';
}

function assert(condition, exit, detail) {
  if (!condition) throw new RunnerError(exit, detail);
}

module.exports = { ERROR_ROWS, RunnerError, diagnostic, assert };
