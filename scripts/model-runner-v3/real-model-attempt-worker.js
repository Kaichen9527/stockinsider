'use strict';

const { RunnerError, diagnostic } = require('./artifacts');
const { runRealModelAttempt } = require('./real-model-attempt');

runRealModelAttempt().then(
  (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
  (error) => {
    const normalized = error instanceof RunnerError ? error : new RunnerError(12);
    process.stderr.write(diagnostic(normalized));
    process.exitCode = normalized.exit;
  },
);
