import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/20260909_official_financial_validation_receipts.sql',import.meta.url),'utf8');
test('official validation migration is additive, guarded, receipt-backed and PIT-stamped',()=>{
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM/u);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/u);
  assert.match(sql,/FROM PUBLIC,anon,authenticated/u);
  assert.match(sql,/GRANT EXECUTE[\s\S]*TO service_role/u);
  assert.match(sql,/WHERE fact_id=p_fact_id AND recorded_at=p_recorded_at/u);
  assert.match(sql,/source_sha256=p_source_sha256/u);
  assert.match(sql,/INSERT INTO public.official_financial_validation_receipts/u);
  assert.match(sql,/v_at := clock_timestamp\(\)/u);
  assert.match(sql,/validation_recorded_at=v_at/u);
  assert.match(sql,/prior_validation,effective_validation/u);
  assert.match(sql,/r.validated_at<=p_cutoff/u);
  assert.match(sql,/FUNCTION public.read_financial_facts_as_of\(p_cutoff timestamptz\)/u);
  assert.match(sql,/v_fact.validation_status IN \('rejected','conflict','stale'\)/u);
});
