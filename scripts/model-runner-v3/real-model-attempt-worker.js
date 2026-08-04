'use strict';

const { runRealModelAttempt } = require('./real-model-attempt');

runRealModelAttempt().then(
  () => process.stdout.write('{"protocol":"model-runner-real-attempt-v1","status":"pass"}\n'),
  (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'real model attempt failed'}\n`);
    process.exitCode = 1;
  },
);
