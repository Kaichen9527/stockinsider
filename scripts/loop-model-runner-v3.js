#!/usr/bin/env node
'use strict';

const { diagnostic, RunnerError } = require('./model-runner-v3/artifacts');
const { canonicalJson } = require('./model-runner-v3/canonicalJson');
const { execute } = require('./model-runner-v3/runner');

async function main() {
  try {
    process.stdout.write(canonicalJson(await execute(process.argv.slice(2))) + '\n');
  } catch (error) {
    const normalized = error instanceof RunnerError ? error : new RunnerError(12);
    process.stderr.write(diagnostic(normalized));
    process.exitCode = normalized.exit;
  }
}

void main();
