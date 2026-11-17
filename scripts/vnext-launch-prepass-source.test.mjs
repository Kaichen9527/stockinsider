/** Static source contract only: no SQL, session/calendar or native proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/20261115_vnext_launch_source_facts_v1.sql',import.meta.url),'utf8');
test('fresh planning defers before enqueue and only after original policy/owned lease/pool checks',()=>{
 const start=sql.indexOf("ELSIF p_operation='enqueue-current' THEN"),end=sql.indexOf("ELSIF p_operation='enqueue' THEN",start);
 const plan=sql.slice(start,end),defer=plan.indexOf("'status','deferred'");assert.ok(start>0&&end>start&&defer>0);
 for(const guard of ['vnext_launch_csv_policy_v1(p_principal)','vnext_launch_csv_backend_v1(p_lease_owner)']){const at=sql.indexOf(guard);assert.ok(at>=0&&at<start);}
 assert.ok(plan.indexOf('launch_csv_active_pool_bound')>=0&&plan.indexOf('launch_csv_active_pool_bound')<defer);
 assert.ok(plan.indexOf('WHERE completed AND close_at<=at')>=0&&plan.indexOf('WHERE completed AND close_at<=at')<defer);
 assert.match(plan,/session_day<>\(at AT TIME ZONE 'Asia\/Taipei'\)::date/u);
 assert.ok(defer<plan.indexOf("'enqueue',jsonb_build_object"));
 assert.match(plan,/'status','deferred','reason','awaiting_current_completed_session',[\s\S]*?'jobs',0,'session',NULL,'sourceAuthority',false/u);
 assert.match(plan,/'status','no_active_pool','reason',NULL/u);
 assert.match(plan,/IF planned=0 THEN RAISE EXCEPTION 'launch_csv_current_plan_empty'/u);
 assert.doesNotMatch(plan,/licensed-launch-csv-plan-v1|launch_csv_completed_current_session_required/u);
});
