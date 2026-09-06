#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const raw = process.argv[2];
let steps;
try {
  steps = JSON.parse(raw || '[]');
} catch {
  process.stderr.write('sequence must be valid JSON\n');
  process.exit(2);
}
if (!Array.isArray(steps) || steps.length < 1 || steps.length > 5) {
  process.stderr.write('sequence must contain between one and five steps\n');
  process.exit(2);
}
for (const step of steps) {
  if (!step || typeof step !== 'object' || typeof step.endpoint !== 'string' || !step.endpoint.startsWith('/api/internal/')) {
    process.stderr.write('invalid internal API sequence step\n');
    process.exit(2);
  }
  const timeoutMs = Number(step.timeoutMs || 120_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 900_000) {
    process.stderr.write('invalid internal API sequence timeout\n');
    process.exit(2);
  }
  const result = spawnSync(process.execPath, ['scripts/call_internal_api.mjs', step.endpoint, JSON.stringify(step.payload || {})], {
    stdio: 'inherit',
    env: { ...process.env, INTERNAL_API_TIMEOUT_MS: String(timeoutMs) },
  });
  if (result.error || result.signal || result.status !== 0) process.exit(result.status || 1);
}
