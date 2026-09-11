import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseInternalApiSequence } from './internal-api-sequence-policy.mjs';

test('the scheduled 3,700,000 ms research request is valid while unbounded sequences are rejected', () => {
  const steps = [{ endpoint: '/api/internal/taiwan-data-queue-drain', payload: { limit: 100 }, timeoutMs: 2700000 },
    { endpoint: '/api/internal/pipeline-run', timeoutMs: 3700000 }];
  assert.equal(parseInternalApiSequence(JSON.stringify(steps))[1].timeoutMs, 3700000);
  assert.throws(() => parseInternalApiSequence(JSON.stringify([{ ...steps[1], timeoutMs: 3700001 }])), /timeout/);
  assert.throws(() => parseInternalApiSequence(JSON.stringify([steps[1], steps[1]])), /two-hour/);
});

test('both scheduled research publications drain their full phase before invoking the pipeline', () => {
  for (const service of ['stockinsider-taiwan-data-preliminary', 'stockinsider-research-cycle']) {
    const unit = fs.readFileSync(new URL(`../deployment/vps/systemd/${service}.service`, import.meta.url), 'utf8');
    const raw = unit.match(/call_internal_api_sequence\.mjs '([^']+)'/u)?.[1];
    assert.ok(raw);
    const steps = parseInternalApiSequence(raw);
    const drain = steps.findIndex((step) => step.endpoint.endsWith('/taiwan-data-queue-drain'));
    const pipeline = steps.findIndex((step) => step.endpoint.endsWith('/pipeline-run'));
    assert.ok(drain >= 0 && pipeline > drain);
    assert.equal(steps[drain].payload.requireComplete, true);
    assert.equal(steps[drain].payload.maxBatches, 30);
    assert.equal(steps[drain].payload.phase, service.includes('preliminary') ? 'preliminary' : 'final');
  }
});

test('close and final refresh units use bounded full-scope drains instead of three fixed batches', () => {
  for (const service of ['close-preliminary', 'final-freeze', 'final-reconcile']) {
    const unit = fs.readFileSync(new URL(`../deployment/vps/systemd/stockinsider-taiwan-data-${service}.service`, import.meta.url), 'utf8');
    const steps = parseInternalApiSequence(unit.match(/call_internal_api_sequence\.mjs '([^']+)'/u)[1]);
    assert.equal(steps.filter((step) => step.endpoint.endsWith('/taiwan-data-queue-drain')).length, 1);
    assert.equal(steps.at(-1).payload.requireComplete, true);
  }
});
