import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../migrations/20260907_evidence_valuation_contract_v6.sql', import.meta.url), 'utf8');

test('evidence and valuation migration is additive and accepts every runtime contract value', () => {
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;\s*$/u);
  assert.doesNotMatch(migration, /\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(migration, /'reported_numeric','official_numeric'/u);
  assert.doesNotMatch(migration, /'fallback_numeric'/u);
  for (const method of ['financial_pb_roe', 'pb_reference', 'ev_ebitda']) {
    assert.match(migration, new RegExp(`'${method}'`, 'u'));
  }
  assert.match(migration, /validation_status IN \('validated','pending','rejected','stale','conflict'\)/u);
  assert.match(migration, /validate_finmind_financial_fact_v6/u);
  assert.match(migration, /p_schema_valid AND p_unit_valid AND p_point_in_time_valid AND p_consistency_valid/u);
  assert.match(migration, /partial_count INTEGER NOT NULL DEFAULT 0/u);
});

test('migration keeps the old fact kind for read compatibility while new writers use reported numeric', () => {
  const research = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
  assert.match(research, /fact_kind: 'reported_numeric'/u);
  assert.doesNotMatch(research, /fact_kind: 'fallback_numeric'/u);
  assert.match(research, /isPromotionEligibleEvidence\(/u);
  assert.match(research, /candidateResearchItemStatus\(/u);
  assert.match(research, /partial_count: partialCount/u);
});
