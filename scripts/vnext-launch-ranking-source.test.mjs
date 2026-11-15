/** Static SOURCE contracts only. These do not execute PostgreSQL, prove SQL
 * grammar/ACL/RLS/CAS/concurrency/performance, or certify an actual DB score. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sql=readFileSync(new URL('../migrations/20261115_vnext_launch_ranking_v1.sql',import.meta.url),'utf8');
const transport=readFileSync(new URL('../web/src/lib/vnext/launch-ranking-read.ts',import.meta.url),'utf8');
const clean=value=>value.replace(/--[^\n]*/gu,'');
function routine(name){
 const match=sql.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`,'u'));
 assert.ok(match,`missing source routine ${name}`);return clean(match[1]);
}
const command=routine('vnext_launch_ranking_command_v1');

test('new writer has closed IDs, exact owned backend lease and no old publication command',()=>{
 assert.match(command,/count\(\*\) FROM jsonb_object_keys\(p_request\)\)<>2/u);
 assert.match(command,/rankingRunId','expectedPreviousRankingRunId/u);
 assert.match(command,/vnext_launch_csv_backend_v1\(p_lease_owner\)/u);
 assert.doesNotMatch(command,/p_request\s*->>?\s*'(?:symbol|score|points|rows|qualified|source|cutoff)'/u);
 assert.doesNotMatch(command,/vnext_ranking_command_v1|vnext_command_v1|normalizedPayload/u);
});
test('missing active evidence cannot be filtered into Top0 or a partial fresh publication',()=>{
 const firstWrite=command.indexOf('INSERT INTO public.vnext_launch_score_evidence_v1');
 const memberLoop=command.indexOf('FOR member IN SELECT');
 assert.ok(memberLoop>=0&&firstWrite>memberLoop);
 for(const reason of ['launch_active_instrument_unknown','launch_formal_research_not_available_at_cutoff',
  'launch_active_source_or_full_weight_incomplete','launch_active_current_qualification_incomplete']){
  const at=command.indexOf(`'${reason}'`);assert.ok(at>memberLoop&&at<firstWrite,reason);
 }
 const continues=command.match(/CONTINUE;/gu)??[];assert.equal(continues.length,1);
 assert.match(command,/preflight->>'outcome'='known_reject'/u);
 assert.doesNotMatch(command,/member\.contraindication IS TRUE OR/u);
 assert.match(command,/launch_current_qualification_expired_during_recompute/u);
 assert.match(command,/pool_revision<>public\.vnext_launch_csv_hash_v1/u);
});
test('resource head precedes target membership and fact lookup, preventing omitted-target resurrection',()=>{
 const body=routine('vnext_launch_source_fact_v1');
 const head=body.indexOf('selected:=rows_json->0');
 assert.ok(head>0);
 assert.ok(body.indexOf("jsonb_array_elements(selected->'poolTargets')")>head);
 assert.ok(body.indexOf('FROM public.vnext_launch_csv_facts_v1 f')>head);
 assert.match(body,/JOIN public\.vnext_launch_csv_ready_acks_v1/u);
 assert.match(body,/greatest\(c\.available_at,a\.recorded_at\)/u);
 assert.match(body,/IF fact IS NULL THEN RETURN NULL/u);
});
test('annual candidate bounds precede JSON aggregation and overflow cannot be accepted as a partial calendar',()=>{
 const body=routine('vnext_launch_annual_rows_internal_v1');
 assert.match(body,/jsonb_agg\(candidate\.packet/u);
 assert.match(body,/INTO result FROM\(/u);
 assert.match(body,/LIMIT 12001\s*\) candidate/u);
 assert.match(body,/jsonb_array_length\(result\)>12000 THEN RETURN NULL/u);
 assert.match(body,/job\.status::text='succeeded'/u);
 assert.match(body,/chunk\.producer_sha=release/u);
 const live=routine('vnext_launch_live_v1');
 assert.match(live,/calendar_now->'annual' IS DISTINCT FROM selected->'calendar'->'annual'/u);
 assert.match(live,/day>score_row\.signal_session AND head->>'status'='completed'/u);
});
test('SQL canonical16 rule IDs, groups and weights stay aligned with actual read contract',()=>{
 const expected=[...transport.matchAll(/\['([a-z0-9_]+)','(trendRelativeStrength|consolidation|breakoutHold|chips|market)',(\d+),'/gu)]
  .map(([,id,group,weight])=>[id,group,Number(weight)]);
 assert.equal(expected.length,16);
 const kernel=routine('vnext_launch_mechanical_v1');
 const actual=[...kernel.matchAll(/vnext_launch_rule_v1\('([^']+)','([^']+)',(\d+),/gu)]
  .map(([,id,group,weight])=>[id,group,Number(weight)]);
 const chips=kernel.match(/ARRAY\[('chips_foreign5_positive'[\s\S]*?'chips_trust20_positive')\]/u);
 assert.ok(chips);for(const match of chips[1].matchAll(/'([^']+)'/gu))actual.push([match[1],'chips',5]);
 assert.deepEqual(actual.sort((a,b)=>a[0].localeCompare(b[0])),expected.sort((a,b)=>a[0].localeCompare(b[0])));
 assert.equal(actual.reduce((sum,row)=>sum+row[2],0),100);
});
test('integer sums remain exact before binary64 division; rule and tie operations do not use integer casts',()=>{
 const integerSum=routine('vnext_launch_integer_sum_v1');
 assert.match(integerSum,/total numeric:=0/u);assert.match(integerSum,/total:=total\+value::numeric/u);
 assert.match(integerSum,/total NOT BETWEEN -9007199254740991 AND 9007199254740991/u);
 const kernel=routine('vnext_launch_mechanical_v1');
 assert.match(kernel,/ratio64_v1\(net::double precision/u);
 assert.match(kernel,/excess63:=stock63-market63/u);
 assert.match(command,/totalScore'\)::double precision DESC/u);
 assert.match(command,/technicalScore'\)::double precision DESC/u);
 assert.match(sql,/SET LOCAL extra_float_digits=3/u);
 assert.doesNotMatch(clean(sql),/isfinite\([^)]*(?:double precision|float8)/u);
});
test('independent technical51 and institutional20 windows preserve coverage and issued-capital gates',()=>{
 const selected=routine('vnext_launch_selected_score_v1');
 assert.match(selected,/native_previous_issued/u);assert.match(selected,/institutional_previous_issued/u);
 assert.match(selected,/jsonb_array_length\(native_inventory\)<>52/u);
 assert.match(selected,/cardinality\(denominator\)<>20/u);
 assert.match(selected,/tpex_11371_report_excluding_fixed_price_v1/u);
 assert.match(selected,/tpex_11370_all_sessions_v1/u);assert.match(selected,/tpex_11856_combined_sessions_v1/u);
 assert.match(selected,/native_total>9007199254740991/u);
 assert.match(selected,/THEN technical_ok:=false/u);assert.match(selected,/THEN institutional_ok:=false/u);
});
test('waiting entry observations never borrow next-day limits or imply full rank qualification',()=>{
 const selected=routine('vnext_launch_selected_score_v1');
 assert.match(selected,/ma20_ratio>1\.15::double precision/u);
 assert.match(selected,/'sameSessionOnePriceLimit',NULL/u);
 assert.match(selected,/launch_same_session_price_limit_authority_missing/u);
 assert.match(selected,/launch_fixed_original_extension_authority_missing/u);
 assert.doesNotMatch(selected,/次日|nextDay|next_day|limit_up/u);
 assert.match(command,/entryEligible',selected->'entry'->>'eligible'='true'/u);
 assert.match(command,/CASE WHEN packet->>'entryEligible'='true' THEN 'eligible' ELSE 'waiting' END/u);
 assert.match(command,/'reasons',packet->'reasons'/u);
 assert.match(command,/launch_market_wait/u);
});
test('formal provider review is separate from missing source/catalyst, disposition and market authority',()=>{
 const qualification=routine('vnext_launch_qualification_checks_v1');
 assert.match(qualification,/vnext_business_criteria_current_v1/u);
 assert.match(qualification,/source_ok:=NULL/u);
 assert.match(qualification,/launch_original_source_producer_not_connected/u);
 assert.match(qualification,/launch_positive_disposition_coverage_producer_not_connected/u);
 assert.doesNotMatch(qualification,/qualification->>'qualified'|target_current_v1/u);
 assert.match(command,/vnext_launch_market_context_v1/u);
 assert.doesNotMatch(command,/vnext_read_v1\(NULL\)/u);
 assert.match(command,/launch_market_520_current_authority_incomplete/u);
 assert.match(command,/coalesce\(market->>'risk',''\) NOT IN\('risk_on','selective','risk_off','breakdown'\)/u);
});
test('new public read call graph is stable and contains no writes, lease, queue or provider work',()=>{
 for(const name of ['vnext_launch_ranking_read_v1','vnext_launch_live_v1','vnext_launch_qualification_checks_v1',
  'vnext_launch_source_fact_v1','vnext_launch_price_rows_internal_v1','vnext_launch_action_day_v1','vnext_launch_public_citations_v1',
  'vnext_launch_rank_preflight_v1','vnext_launch_cash_calendar_internal_v1','vnext_launch_instrument_v1']){
  assert.match(sql,new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?LANGUAGE (?:sql|plpgsql) STABLE`,'u'));
  assert.doesNotMatch(routine(name),/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER)\b|vnext_launch_csv_command_v1|production_write_lease|pg_advisory|http_get|http_post/gu,name);
 }
 assert.match(routine('vnext_launch_live_v1'),/vnext_launch_today_calendar_internal_v1/u);
 assert.match(routine('vnext_launch_live_v1'),/launch_current_source_head_or_rights_changed/u);
});
test('public citations are representative pinned licensed dataset links with current independent profile rights',()=>{
 const citations=routine('vnext_launch_public_citations_v1');
 assert.match(citations,/DISTINCT ON\(c\.dataset_id\)/u);
 assert.match(citations,/vnext_launch_score_source_pins_v1/u);
 assert.match(citations,/policy\.valid_until>statement_timestamp\(\)/u);
 assert.match(citations,/launch-public-rights-v1/u);assert.match(citations,/Securities and Futures Bureau, Financial Supervisory Commission/u);
 assert.match(citations,/https:\/\/data\.gov\.tw\/dataset\//u);
 assert.doesNotMatch(citations,/vnext_publications|publication\.content|canonical_url|LIMIT 100/u);
});
test('new schema retains immutable CAS/FK pins and private execute-only server entry points',()=>{
 assert.match(sql,/vnext_launch_ranking_single_successor_v1/u);
 assert.match(sql,/FOREIGN KEY\(capture_id,session_date,symbol\) REFERENCES public\.vnext_launch_csv_facts_v1/u);
 assert.match(sql,/REVOKE ALL ON public\.%I FROM PUBLIC,anon,authenticated,service_role/u);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.vnext_launch_cycle_context_v1\(text\),public\.vnext_launch_ranking_command_v1\(text,uuid,jsonb\),public\.vnext_launch_ranking_read_v1\(uuid,text\) TO service_role/u);
 assert.doesNotMatch(clean(sql),/GRANT\s+(?:SELECT|ALL)\b[\s\S]*?ON\s+(?:TABLE\s+)?public\.(?:stock_instruments|opportunity_price|tw_trading_sessions|legacy_official)/u);
 assert.match(sql,/enabled boolean NOT NULL DEFAULT false/u);
 assert.ok(sql.trimEnd().endsWith('COMMIT;'));
 const prefix=readFileSync(new URL('../web/src/lib/tw-entry-plan-authority.ts',import.meta.url)).subarray(0,32483);
 assert.equal(createHash('sha256').update(prefix).digest('hex'),'2b275f3de397c0574b6dbd462dbfa88d3c861346773b0f38cd98ca87bb8e406d');
});

// Incremental known-reject SOURCE contracts. None execute the SQL or stand in
// for a DB fixture proving clocks, concurrency, official coverage or ACLs.
test('independent hard negatives precede fullscore unknowns and exclude only a waiting candidate',()=>{
 const preflight=routine('vnext_launch_rank_preflight_v1');
 const call=command.indexOf('preflight:=public.vnext_launch_rank_preflight_v1');
 assert.ok(call>0&&call<command.indexOf('SELECT * INTO publication')&&call<command.indexOf('selected:=public.vnext_launch_selected_score_v1'));
 const rejection=command.slice(call,command.indexOf('SELECT * INTO publication'));
 assert.match(rejection,/preflight->>'outcome'='known_reject'/u);
 assert.match(rejection,/'state','waiting','reasons',preflight->'reasons'/u);
 assert.doesNotMatch(rejection,/'exited'|DELETE|UPDATE|vnext_command_v1/u);
 assert.ok(preflight.indexOf("IF reason IS NULL AND cash_known")<preflight.indexOf("IF reason IS NOT NULL THEN outcome"));
 assert.match(preflight,/sum_ntd<1000000000::numeric/u);
 assert.match(preflight,/outcome text:='unknown'/u);
 assert.doesNotMatch(preflight,/outcome:='(?:approved|eligible|qualified)'|selected_score|technicalInventory|issued_shares|action_day|original_source/u);
 assert.match(routine('vnext_launch_qualification_checks_v1'),/source_ok:=NULL/u);
 assert.ok(command.indexOf('launch_market_520_current_authority_incomplete')<call);
});
test('cash negatives require exact official20 with current identity, never last20 listed observations',()=>{
 const preflight=routine('vnext_launch_rank_preflight_v1');const calendar=routine('vnext_launch_cash_calendar_internal_v1');
 assert.match(preflight,/current_instrument->>'stockId'=frozen_instrument->>'stockId'/u);
 assert.match(preflight,/current_instrument->>'exchange'=frozen_instrument->>'exchange'/u);
 assert.match(preflight,/venue:=CASE WHEN identity_known THEN/u);
 assert.match(calendar,/r->>'stock_id' IS DISTINCT FROM stock::text OR r->>'exchange' IS DISTINCT FROM venue/u);
 assert.match(calendar,/jsonb_array_length\(sessions\)<>20/u);
 assert.match(calendar,/sessions->-1->>'session_id'<>signal_day::text/u);
 assert.match(calendar,/vnext_launch_annual_rows_internal_v1/u);
 assert.match(calendar,/priority=1 GROUP BY/u);
 assert.ok(calendar.indexOf('SELECT DISTINCT ON')<calendar.indexOf("WHERE value->>'status'='completed'"));
 assert.match(preflight,/FOR c IN SELECT value FROM jsonb_array_elements\(calendar->'sessions'\)/u);
 assert.match(preflight,/vnext_launch_source_fact_v1\(11370,\(c->>'session_id'\)::date,target,input_digest,cutoff\)/u);
 assert.match(preflight,/f IS NULL[\s\S]*?THEN cash_known:=false;EXIT/u);
 assert.match(preflight,/jsonb_array_length\(inventory\)<>20 THEN cash_known:=false/u);
 assert.match(preflight,/observedAt'\)::timestamptz<\(c->>'close_at'\)::timestamptz/u);
 assert.doesNotMatch(preflight,/LIMIT 20|coalesce\([^;]*traded_ntd|11371|29082|11677/u);
 const source=routine('vnext_launch_source_fact_v1');
 for(const clock of ['observed_at','recorded_at','available_at'])assert.ok(source.includes(`c.${clock}<=cutoff`));
 assert.match(source,/a\.recorded_at<=cutoff/u);
 assert.match(source,/c\.rights_binding_hash=policy_hash/u);
 // Expiry is current at each selection/recheck, even within a long statement.
 assert.match(source,/enabled AND valid_until>clock_timestamp\(\)/u);
 assert.doesNotMatch(source,/valid_until>statement_timestamp\(\)/u);
});
test('current venue rejection needs genuine exact invalidity proof; deferred is never approval',()=>{
 const preflight=routine('vnext_launch_rank_preflight_v1');const instrument=routine('vnext_launch_instrument_v1');
 assert.match(preflight,/vnext_trading_invalid_current_v1\(target,input_digest\)/u);
 assert.match(preflight,/invalidity->'instrument'->>'instrument_authority_id'=current_instrument->>'id'/u);
 assert.match(preflight,/invalidity->>'proofHash'=public\.vnext_launch_csv_hash_v1\(invalidity-'proofHash'\)/u);
 assert.match(preflight,/scope:='current_venue'/u);assert.match(preflight,/scope:='cutoff_liquidity'/u);
 assert.match(preflight,/launch_positive_disposition_coverage_producer_not_connected/u);
 assert.doesNotMatch(preflight,/deferred[^;]*THEN[^;]*reason:=|disposal[^;]*reason:=/u);
 // Current clock is deliberate: historical source/calendar calls below use
 // fixed cutoff, while the current instrument helper accepts current now.
 assert.match(preflight,/at timestamptz:=clock_timestamp\(\)/u);
 assert.match(instrument,/cutoff>clock_timestamp\(\)/u);
 assert.doesNotMatch(instrument,/cutoff>statement_timestamp\(\)/u);
 assert.match(instrument,/other\.stock_id=\(selected->>'stockId'\)::uuid AND other\.symbol<>target/u);
 assert.match(preflight,/cash_calendar_internal_v1\([^;]*signal_day,cutoff,at\)/u);
});
test('all classifications are rechecked before first append and exclusion provenance is immutable and pinned',()=>{
 const firstWrite=command.indexOf('INSERT INTO public.vnext_launch_score_evidence_v1');
 const check=command.indexOf('FOR preflight IN SELECT value FROM jsonb_array_elements(preflights)');
 assert.ok(check>command.indexOf('document:=')&&check<firstWrite);
 const recheck=command.slice(check,firstWrite);
 assert.match(recheck,/vnext_launch_csv_backend_v1\(p_lease_owner\)/u);
 assert.match(recheck,/classificationDigest' IS DISTINCT FROM preflight->>'classificationDigest'/u);
 assert.match(recheck,/expiresAt'\)::timestamptz<=clock_timestamp\(\)/u);
 assert.match(recheck,/launch_preflight_changed_before_append/u);
 assert.match(recheck,/launch_current_qualification_changed_before_append/u);
 assert.doesNotMatch(recheck,/INSERT|UPDATE|DELETE/u);
 const preflight=routine('vnext_launch_rank_preflight_v1');
 assert.ok(preflight.indexOf("'classificationDigest',public.vnext_launch_csv_hash_v1(basis)")<preflight.indexOf("'checkedAt',at"));
 assert.match(command,/jsonb_build_array\(pool_revision,scored,exclusions,market_revision\)/u);
 assert.match(command,/INSERT INTO public\.vnext_launch_rank_exclusions_v1/u);
 assert.match(command,/INSERT INTO public\.vnext_launch_exclusion_source_pins_v1/u);
 assert.match(sql,/cash_known_at IS NOT NULL AND cash_known_at<=input_cutoff/u);
 assert.match(preflight,/known_at:=greatest\(cash_known_at,identity_known_at\)/u);
 assert.match(preflight,/current_fact IS DISTINCT FROM f THEN cash_known:=false/u);
 const live=routine('vnext_launch_live_v1');
 assert.match(live,/vnext_launch_rank_preflight_v1\(score_row.symbol,score_row.input_hash,score_row.signal_session,score_row.input_cutoff\)/u);
 assert.match(live,/state:=CASE WHEN preflight->>'outcome'='known_reject'/u);
 assert.doesNotMatch(live,/INSERT|UPDATE|DELETE/u);
});
