'use strict';

const { runRealModelAttempt } = require('./real-model-attempt');

runRealModelAttempt().then(
  (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
  (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'real model attempt failed'}\n`);
    process.exitCode = 1;
  },
);
