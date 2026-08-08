import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runControlledProjectionPerformanceOracle } from './performance-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { publishCompactRadarProjection } = require(path.join(root, 'scripts/runtime/compact-radar-projection.js'));

test('compact radar projection is bounded and has deterministic cache identity', () => {
  const decisions = Array.from({ length: 60 }, (_, index) => ({
    symbol: String(7000 + index), claimId: `claim-${index}`, action: 'valuation_review', researchMaturity: 'source_signal',
    technical: { technicalState: 'unavailable' }, valuation: { status: 'valuation_review' },
    changedBecause: [`source-${index}`], lastEvaluatedAt: '2026-08-01T00:00:00Z', analysisGeneratedAt: '2026-08-01T00:00:00Z',
  }));
  const legacyPayload = { generatedAt: '2026-08-01T00:00:00Z', opportunities: [] };
  const first = publishCompactRadarProjection({ decisions, legacyPayload, window: 'daily', asOf: '2026-08-01T00:00:00Z', producerIdentity: { runId: 'r' } });
  const second = publishCompactRadarProjection({ decisions, legacyPayload, window: 'daily', asOf: '2026-08-01T00:00:00Z', producerIdentity: { runId: 'r' } });
  assert.ok(Buffer.byteLength(JSON.stringify(first.payload)) <= 150000);
  assert.equal(first.etag, second.etag);
  assert.equal(first.payload.opportunities.length, 0);
  assert.equal(first.payload.sourceSignals.length, 30);
  assert.equal(first.storageWindow, 'daily');
  assert.equal(first.projectionKey, `legacy-radar-v3.11:daily:2026-08-01T00:00:00Z:${first.payloadChecksum}`);
});

test('compact radar reader remains a projection-only indexed LIMIT 2 read', () => {
  const source = readFileSync(path.join(root, 'web/src/lib/opportunity-v3/compact-radar-read.ts'), 'utf8');
  assert.match(source, /legacy_radar_projections_v3_11/u);
  assert.match(source, /\.limit\(2\)/u);
  assert.doesNotMatch(source, /runAuthSourceWorker|executeSourceRunTransaction|provider|deepResearch/u);
});

test('controlled performance oracle reserves its PostgreSQL port and short socket directory', () => {
  const source = readFileSync(path.join(root, 'scripts/opportunity-v3/performance-harness.mjs'), 'utf8');
  assert.match(source, /const port = await reservePort\(\);/u);
  assert.doesNotMatch(source, /57000 \+ \(process\.pid % 5000\)/u);
  assert.match(source, /mkdtempSync\('\/tmp\/stockinsider-pcr022-'\)/u);
  assert.doesNotMatch(source, /mkdtempSync\(path\.join\(os\.tmpdir\(\), 'stockinsider-pcr022-'\)\)/u);
});

test('PCR-022 runs the controlled production/PostgreSQL projection performance oracle', async () => {
  await runControlledProjectionPerformanceOracle({ root });
});
