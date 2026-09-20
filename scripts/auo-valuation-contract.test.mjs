import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/20260920_auo_forward_bvps_pb_contract_v1.sql', import.meta.url), 'utf8');
const types = readFileSync(new URL('../web/src/lib/evidence-valuation-contract.ts', import.meta.url), 'utf8');

test('forward_bvps_pb is admitted by every persisted valuation enum', () => {
  assert.match(types, /CANDIDATE_VALUATION_METHODS[\s\S]*'forward_bvps_pb'/u);
  for (const constraint of [
    'valuation_snapshots_primary_method_check',
    'valuation_snapshots_valuation_basis_check',
    'candidate_research_run_items_valuation_method_check',
  ]) {
    const start = migration.indexOf(`ADD CONSTRAINT ${constraint}`);
    assert.ok(start >= 0, `${constraint} must be replaced`);
    assert.match(migration.slice(start, start + 700), /'forward_bvps_pb'/u);
  }
});
