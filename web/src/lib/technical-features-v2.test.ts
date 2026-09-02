import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTechnicalFeatures, normalizeInstitutionalFlows, technicalHistoryCoverageTerminalReason } from './technical-features-v2.ts';

test('technical research cannot mark a two-bar price fragment complete', () => {
  assert.equal(technicalHistoryCoverageTerminalReason(2), 'official_price_history_coverage_below_240');
  assert.equal(technicalHistoryCoverageTerminalReason(239), 'official_price_history_coverage_below_240');
  assert.equal(technicalHistoryCoverageTerminalReason(240), null);
});

test('golden fixture keeps MA5/20/60/120/240 identities explicit', () => {
  const bars = Array.from({ length: 240 }, (_, index) => {
    const close = index + 1;
    return { session: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`, high: close + 1, low: Math.max(0.01, close - 1), close, volume: 100 };
  }).sort((left, right) => left.session.localeCompare(right.session));
  const chronological = bars.map((bar, index) => ({ ...bar, session: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10), close: index + 1, high: index + 2, low: Math.max(0.01, index), volume: 100 }));
  const result = calculateTechnicalFeatures(chronological, { normalized5d: 0.4, normalized20d: 0.2 });
  assert.equal(result.ma5, 238);
  assert.equal(result.ma20, 230.5);
  assert.equal(result.ma60, 210.5);
  assert.equal(result.ma120, 180.5);
  assert.equal(result.ma240, 120.5);
  assert.equal(result.volumeRatio20Median, 1);
  assert.equal(result.ma60Slope, 1);
  assert.equal(result.obv, 23_900);
  assert.equal(result.institutionalFlow5dNorm, 0.4);
});

test('insufficient history remains null and cannot masquerade as long MA', () => {
  const bars = Array.from({ length: 20 }, (_, index) => ({
    session: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    high: index + 2, low: Math.max(0.01, index), close: index + 1, volume: 100,
  }));
  const result = calculateTechnicalFeatures(bars);
  assert.equal(result.ma5, 18);
  assert.equal(result.ma20, 10.5);
  assert.equal(result.ma60, null);
  assert.equal(result.ma120, null);
  assert.equal(result.ma240, null);
});

test('institutional 5/20 day flow is normalized by official traded volume and deduped by session', () => {
  const days = Array.from({ length: 20 }, (_, index) => ({
    session: `2026-08-${String(28 - index).padStart(2, '0')}`,
    net: 100,
    volume: 1_000,
  }));
  days.unshift({ session: '2026-08-28', net: 200, volume: 1_000 });
  const result = normalizeInstitutionalFlows(days);
  assert.equal(result.normalized5d, 0.12);
  assert.equal(result.normalized20d, 0.105);
});
