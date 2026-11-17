/** STATIC source contracts only; never SQL/native/source acquisition evidence. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8');
const sql=read('migrations/20261115_vnext_launch_index_backfill_v1.sql');
const source=read('web/src/lib/vnext/launch-source-store.ts');
test('old producer, selection and original source command remain byte-identical',()=>{
 for(const [file,expected] of [
  ['scripts/runtime/official-calendar-v314.js','220147e99e54ecda8fdaad10f6bee026591f88dc144c3a19f886ab78dc2b668a'],
  ['web/src/lib/tw-entry-plan-authority.ts','290afa255217e8a8a191a9a24b3dbbe73417585e587cab6546322bc6a5461a3c'],
  ['migrations/20261115_vnext_launch_source_facts_v1.sql','c53482beea3af5cfeb553f664d91464372c38cb667a184f52292bbc223dd6005']])
  assert.equal(createHash('sha256').update(read(file)).digest('hex'),expected,file);
});
test('new RPC reuses exact existing owner/policy/backend/lease/queue and grants only its new function',()=>{
 for(const required of ['p.proowner=q.relowner','vnext_launch_csv_policy_v1(p_principal)','vnext_launch_csv_backend_v1(p_lease_owner)',
  "backend->>'writerRelease' IS DISTINCT FROM policy->>'requiredWriterRelease'",'vnext_launch_csv_command_v1(p_principal,p_lease_owner,\'enqueue-current\'',
  "vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue'",'ALTER FUNCTION public.vnext_launch_csv_backfill_plan_v1'])assert.ok(sql.includes(required),required);
 assert.equal(/CREATE OR REPLACE|ALTER TABLE|INSERT INTO public\./u.test(sql),false);
 assert.equal((sql.match(/GRANT EXECUTE/gu)||[]).length,1);assert.ok(sql.includes('TO service_role'));
 assert.ok(sql.includes('count(*) FROM public.vnext_members_v1'));assert.ok(sql.includes('NOT BETWEEN 1 AND 20'));
});
test('36 including through month uses unique UNION and bound200; olddeferred never subtracts hypothetical old240 keys',()=>{
 assert.match(sql,/generate_series\(0,35\)/u);assert.match(sql,/SELECT unnest\(old_keys\) key UNION/u);
 assert.match(sql,/daily_count\+index_count>200/u);assert.match(sql,/attempted>200/u);
 const start=sql.indexOf("IF old_plan->>'status'='planned' THEN"),assign=sql.indexOf('old_keys:=array_append');
 assert.ok(start>=0&&assign>start);assert.ok(sql.indexOf("ELSIF old_plan->>'status'<>'deferred'",assign)>assign);
 assert.match(sql,/resource_key=ANY\(old_keys\)/u);assert.match(sql,/through_day IS NULL/u);
 for(const status of ['no_active_pool','deferred','already_acquired','history_only','current_and_history'])assert.ok(sql.includes(status));
});
test('latest resource head precedes ready/rights/coverage filters with committed ACK and exact index facts',()=>{
 const pick=sql.indexOf('SELECT b.job_id'),head=sql.indexOf('ORDER BY b.capture_generation DESC',pick),validate=sql.indexOf('compatible:=',head);
 assert.ok(pick>0&&head>pick&&validate>head);
 assert.match(sql,/LEFT JOIN public\.vnext_launch_csv_ready_acks_v1/u);
 for(const required of ['head.header_hash=public.vnext_launch_csv_hash_v1','head.rights_binding_hash=policy',
  'greatest(head.available_at,head.ack_at)<=at','head.parser_version=\'licensed-launch-csv-sql-v1\'',
  'expected.session_id','head.capture_generation=(at AT TIME ZONE','head.terminal_result'])assert.ok(sql.includes(required),required);
 assert.match(sql,/rights_row\.valid_until>checked_at/u);assert.match(sql,/to_jsonb\(rights_row\)/u);
 assert.match(sql,/launch_index_backfill_resource_head_conflict/u);
 assert.match(sql,/NOT EXISTS\(SELECT FROM\(SELECT DISTINCT ON\(session_id\)/u);
});
test('actual existing prepare caller uses newRPC with existing defaultOFF fence and no oldplan failure fallback',()=>{
 const prepare=source.slice(source.indexOf('export async function prepareLaunchSources'));
 assert.match(prepare,/if\(!launchSourcesEnabled\(\)\)return/u);
 assert.match(prepare,/parseLaunchIndexBackfillPlan\(await deps.command\(owner,'enqueue-history-current',\{\}\)\)/u);
 assert.ok(source.includes("rpc('vnext_launch_csv_backfill_plan_v1'"));
 assert.equal(/BACKFILL_ENABLED|HISTORY_ENABLED/u.test(source),false);
 assert.equal(prepare.includes("deps.command(owner,'enqueue-current'"),false);
});
test('diagnostic CLI actually calls bounded accumulator/cancellation core; no registry, IO or granted completeness',()=>{
 const cli=read('web/scripts/launch-calendar-history.mjs'),core=read('web/src/lib/vnext/launch-calendar-history.ts');
 assert.match(cli,/diagnoseLaunchCalendarHistory\(JSON.parse\(text\)\)/u);assert.match(cli,/fatal:true/u);assert.match(cli,/1024\*1024/u);
 assert.equal(/fetch\(|\.rpc\(|readFile|process\.env/u.test(cli+core),false);
 for(const marker of ['array(input.batches,8)','array(input.events,256)','array(value.rows,1200)','officialCompletedSessions:null',
  'calendar_explicit_cancellation_producer_unavailable','futureScheduledRows','holidayScheduleRows','supersedesEventId'])assert.ok(core.includes(marker),marker);
 assert.equal(core.includes('slice(-400)'),false);
});
test('separate existing consumer floors and old annual chunk bounds are not rewritten by the new plan',()=>{
 const ranking=read('migrations/20261115_vnext_launch_ranking_v1.sql');
 assert.match(ranking,/required_sessions NOT IN\(240,520\)/u);assert.match(ranking,/1320 backfill/u);
 assert.equal(/required_sessions|append_trading_session|annual_rows_internal/u.test(sql),false);
 assert.match(read('scripts/runtime/official-calendar-v314.js'),/slice\(-400\)/u);
 assert.match(read('migrations/20260811_actionability_recovery_v3_14.sql'),/>1200/u);
});
