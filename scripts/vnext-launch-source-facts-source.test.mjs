import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/20261115_vnext_launch_source_facts_v1.sql',import.meta.url),'utf8');
// Source contract only: SQL grammar/catalog/ACL/RLS/concurrency/COMMIT are NOT
// exercised by these checks and remain under the native HOLD.
test('licensed fact candidate preserves old bodies/ACLs and isolates immutable private lineage',()=>{
  assert.ok(!/CREATE OR REPLACE|ALTER\s+POLICY/iu.test(sql));
  assert.ok(!/GRANT\s+(?:ALL|SELECT|UPDATE|INSERT).*ON\s+(?:TABLE\s+)?public\.(?:taiwan_data_|private_artifact_receipts|vnext_(?:publications|jobs|members)_)/iu.test(sql));
  for(const name of ['bindings','attempts','captures','facts','outcomes','ready_acks'])assert.ok(sql.includes(`CREATE TABLE public.vnext_launch_csv_${name}_v1`));
  assert.ok(sql.includes('REFERENCES public.taiwan_data_refresh_queue_v5(job_id)'));
  assert.ok(sql.includes('REFERENCES public.private_artifact_receipts_v1(artifact_hash)'));
  assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));assert.ok(sql.includes('FROM PUBLIC,anon,authenticated,service_role'));
  assert.ok(sql.includes('BEFORE TRUNCATE'));assert.ok(sql.includes('capture_generation date NOT NULL'));
});
test('source bytes are independently derived with closed resource/coverage/header/units and original clocks',()=>{
  assert.ok(sql.includes('encode(sha256(p_body)'));
  assert.ok(sql.includes("decoded:=convert_from(body,'UTF8')"));
  assert.ok(sql.includes("records->0 IS DISTINCT FROM profile->'header'"));
  assert.ok(sql.includes('vnext_launch_csv_rows_v1(body bytea,maximum_rows integer)'));
  assert.ok(sql.includes('3145728'));assert.ok(sql.includes('16001'));assert.ok(sql.includes('9007199254740991'));
  for(const scope of ['tpex_11370_all_sessions_v1','tpex_11371_report_excluding_fixed_price_v1','tpex_11856_combined_sessions_v1'])assert.ok(sql.includes(scope));
  assert.ok(sql.includes('publisher_published_at IS NULL'));assert.ok(sql.includes('available_at>=recorded_at'));
  assert.ok(sql.includes('pool_revision text NOT NULL'));assert.ok(sql.includes("jsonb_array_elements(pool->'targets')"));
  assert.ok(sql.includes('created_xid=txid_current()'));assert.ok(sql.includes("p_operation='ready'"));
  assert.ok(!sql.includes('normalized_payload'));assert.ok(!sql.includes("p_request->'points'"));
});
test('disabled backend or another lease cannot authorize facts and old canonical/completion cannot relabel bound jobs',()=>{
  assert.ok(sql.includes('IF backend IS NULL OR lease_owner IS NULL'));
  assert.ok(sql.includes('owner_id::text=lease_owner::text'));assert.ok(sql.includes('FOR SHARE'));
  assert.ok(sql.includes('attempt.queue_owner<>queue_owner OR attempt.lease_owner<>p_lease_owner'));
  assert.ok(sql.includes('launch_csv_legacy_canonical_guard'));assert.ok(sql.includes('launch_csv_legacy_terminal_guard'));
  assert.ok(sql.includes("TG_TABLE_NAME='taiwan_data_canonical_results_v5'"));
  assert.ok(sql.includes('outcome.capture_id::text'));assert.ok(sql.includes("'legacyCanonical','not_applicable'"));
  assert.ok(sql.includes("'actionEligible',false"));assert.ok(!sql.includes("'actionEligible',true"));
  const derive=sql.indexOf('derived:=public.vnext_launch_csv_derive_v1');
  assert.ok(sql.indexOf('backend:=public.vnext_launch_csv_backend_v1',derive)>derive);
  const locks=sql.indexOf('PERFORM pg_advisory_xact_lock(610091002)'),clock=sql.indexOf('at:=clock_timestamp();',locks);
  assert.ok(clock>locks&&clock<sql.indexOf('policy:=public.vnext_launch_csv_policy_v1',locks));
  const ready=sql.slice(sql.indexOf("p_operation='ready'"),sql.indexOf("p_operation='receipt'"));
  assert.ok(ready.indexOf('created_xid=txid_current()')<ready.indexOf('backend:=public.vnext_launch_csv_backend_v1'));
  assert.ok(ready.indexOf('at:=clock_timestamp();')>ready.indexOf('backend:=public.vnext_launch_csv_backend_v1'));
  assert.ok(ready.indexOf('INSERT INTO public.vnext_launch_csv_ready_acks_v1')>ready.indexOf('at:=clock_timestamp();'));
});
