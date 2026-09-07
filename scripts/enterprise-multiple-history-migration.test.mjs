import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/20260907_04_enterprise_multiple_history_v6.sql', import.meta.url), 'utf8');
const research = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');

test('enterprise multiples are append-only point-in-time observations instead of fabricated historical facts', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public[.]candidate_enterprise_multiple_snapshots_v6/u);
  assert.match(migration, /PRIMARY KEY\(stock_id,session_date,model_version,calculation_input_hash\)/u);
  assert.match(migration, /append_candidate_enterprise_multiple_snapshot_v6/u);
  assert.match(migration, /p_session_date>p_available_at::date/u);
  assert.match(migration, /enterprise_multiple_snapshot_conflict/u);
  assert.match(migration, /REVOKE ALL ON public[.]candidate_enterprise_multiple_snapshots_v6 FROM PUBLIC,anon,authenticated,service_role/u);
  assert.doesNotMatch(migration, /generate_series|historical_backfill/iu);
  assert.match(research, /append_candidate_enterprise_multiple_snapshot_v6/u);
  assert.match(research, /ENTERPRISE_MULTIPLE_MODEL_VERSION/u);
  assert.match(research, /ttm_ebitda/u);
  assert.match(research, /ttm_revenue/u);
});
