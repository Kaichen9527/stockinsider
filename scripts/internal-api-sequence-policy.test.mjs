import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseInternalApiSequence } from './internal-api-sequence-policy.mjs';

test('the scheduled 5,520,000 ms research request is valid while unbounded sequences are rejected', () => {
  const steps = [{ endpoint: '/api/internal/taiwan-data-queue-drain', payload: { limit: 100 }, timeoutMs: 2700000 },
    { endpoint: '/api/internal/pipeline-run', timeoutMs: 5520000 }];
  assert.equal(parseInternalApiSequence(JSON.stringify(steps))[1].timeoutMs, 5520000);
  assert.throws(() => parseInternalApiSequence(JSON.stringify([{ ...steps[1], timeoutMs: 5520001 }])), /timeout/);
  assert.throws(() => parseInternalApiSequence(JSON.stringify([steps[1], steps[1]])), /systemd time budget/);
  assert.equal(parseInternalApiSequence(JSON.stringify([{ ...steps[0], continueOnError: true }]))[0].continueOnError, true);
  assert.throws(() => parseInternalApiSequence(JSON.stringify([{ ...steps[0], continueOnError: 'yes' }])), /continueOnError/);
});

test('the financial queue drain continues to the document worker but still reports a failed unit', () => {
  const unit = fs.readFileSync(new URL('../deployment/vps/systemd/stockinsider-taiwan-data-queue-drain.service', import.meta.url), 'utf8');
  const steps = parseInternalApiSequence(unit.match(/call_internal_api_sequence\.mjs '([^']+)'/u)[1]);
  const financial = steps.find((step) => step.endpoint.endsWith('/candidate-financial-queue-drain'));
  const documents = steps.findIndex((step) => step.endpoint.endsWith('/candidate-financial-documents/worker'));
  assert.equal(financial?.continueOnError, true);
  assert.ok(documents > steps.indexOf(financial));
  const resume = steps.find((step) => step.endpoint.endsWith('/pipeline-run'));
  assert.equal(resume?.payload.skipIfResearchSessionComplete, true);
  assert.equal(resume?.continueOnError, true);
});

test('hourly research resume ignores symbol-scoped canary receipts', () => {
  const route = fs.readFileSync(new URL('../web/src/app/api/internal/pipeline-run/route.ts', import.meta.url), 'utf8');
  assert.match(route, /[.]not\('pipeline_run_id', 'is', null\)/u);
  assert.match(route, /select\('id,status,failed_count'\)/u);
  assert.match(route, /[.]eq\('status', 'success'\)[.]eq\('failed_count', 0\)/u);
  assert.doesNotMatch(route, /[.]in\('status', \['success', 'partial'\]\)/u);
});

test('symbol-scoped research resolves official symbols without draining the global document queue', () => {
  const research = fs.readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
  assert.match(research, /for \(const symbol of requestedSymbols\)[\s\S]*stockMaster[.]get\(symbol\)[\s\S]*candidates[.]set\(official[.]stockId/u);
  assert.match(research, /requestedSymbols[.]length === 0[\s\S]*processCandidateFinancialDocumentReceipts\(20\)[\s\S]*: \[\]/u);
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
