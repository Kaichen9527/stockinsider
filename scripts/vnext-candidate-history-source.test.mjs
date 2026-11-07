import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../migrations/20261107_vnext_candidate_history_read_v1.sql', import.meta.url), 'utf8');
const reader = sql.split('AS $read$')[1].split('$read$;')[0];
test('source-only additive history reader changes no existing authority, table, pin or RLS', () => {
  assert.ok(sql.includes('NOT applied')); assert.ok(sql.includes('native HOLD'));
  assert.equal(/CREATE OR REPLACE|ALTER TABLE|CREATE TABLE|ALTER ROLE|ALTER POLICY|advisory|INSERT INTO|UPDATE public\.|DELETE FROM/iu.test(sql), false);
  assert.ok(sql.includes('vnext_candidate_history_first_install_required'));
  assert.equal([...sql.matchAll(/CREATE FUNCTION /gu)].length, 1);
});
test('bounded immutable history read uses exact run/latest and unique predecessor/successor chain', () => {
  assert.ok(reader.includes('ranking_run_id=p_ranking_run_id ORDER BY ordinal DESC LIMIT 1'));
  assert.ok(reader.includes('previous.ranking_run_id=selected.previous_ranking_run_id'));
  assert.ok(reader.includes('successor.previous_ranking_run_id=selected.ranking_run_id LIMIT 1'));
  assert.equal(/vnext_members_v1|vnext_audit_v1|vnext_content_v1|vnext_read_v1|clock_timestamp|enqueue|prepare|provider|command_v1/iu.test(reader), false);
});
test('read keeps original feature fence and private RLS owner with service-only execute', () => {
  assert.ok(sql.includes("relrowsecurity AND pg_get_userbyid(relowner)='stockinsider_vnext_owner'"));
  assert.ok(sql.includes('LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public'));
  assert.ok(sql.includes("SET statement_timeout='5s'"));
  assert.ok(reader.includes('WHERE enabled AND legacy_fenced'));
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.vnext_candidate_history_read_v1(uuid) FROM PUBLIC,anon,authenticated'));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.vnext_candidate_history_read_v1(uuid) TO service_role'));
  assert.equal(/GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL|USAGE) /u.test(sql), false);
});
test('SQL projection exposes only frozen candidate fields and navigational identities', () => {
  for (const field of ['symbol', 'state', 'date', 'revisionId', 'entryEligible']) assert.ok(reader.includes("'" + field + "',candidate->'" + field + "'"));
  assert.ok(reader.includes("'source',NULL,'industry',NULL"));
  assert.equal(/input_hash|request_hash|principal|->'reasons'|->'evidence'|->'inputHash'|to_jsonb/iu.test(reader), false);
});
