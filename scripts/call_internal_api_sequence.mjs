#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { parseInternalApiSequence } from './internal-api-sequence-policy.mjs';

const raw = process.argv[2];
let steps;
try {
  steps = parseInternalApiSequence(raw);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(2);
}
for (const step of steps) {
  const result = spawnSync(process.execPath, ['scripts/call_internal_api.mjs', step.endpoint, JSON.stringify(step.payload || {})], {
    stdio: 'inherit',
    env: { ...process.env, INTERNAL_API_TIMEOUT_MS: String(step.timeoutMs) },
  });
  if (result.error || result.signal || result.status !== 0) process.exit(result.status || 1);
}
