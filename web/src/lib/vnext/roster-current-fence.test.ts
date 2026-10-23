/** SOURCE reconstruction/guard contracts only; no PostgreSQL acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {currentPreparationInstrument} from './preparation-trading-identity.ts';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(file:string)=>readFileSync(new URL('../../../../'+file,import.meta.url),'utf8');
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const profile=JSON.parse(read('scripts/opportunity-v3/vnext-roster-current-profile-v1.json'));
const trading=JSON.parse(read('scripts/opportunity-v3/vnext-trading-invalidity-profile-v1.json'));
const sql=read(profile.migration),ir=read('migrations/20261022_vnext_issuer_ir_sources_v1.sql');
const originalSource=/\$current_body\$([\s\S]*?)\$current_body\$/u.exec(ir)![1];
function corePredecessor(){
 let body=/CREATE FUNCTION public\.vnext_command_v1\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/u.exec(read('migrations/20261022_stockinsider_vnext_20_v1.sql'))![1];
 assert.equal(hash(body),'328cb1ed871d94dcb92ca67759eb731ca9082db99547de2b5eb3b62794798af5');
 const pairs=(s:string)=>[...s.matchAll(/\$old_([a-z_]+)\$([\s\S]*?)\$old_\1\$,\$new_\1\$([\s\S]*?)\$new_\1\$/gu)];
 for(const [,,old,next]of pairs(read('migrations/20261022_vnext_thesis_audit_v1.sql').split('DO $provider_current_sources$')[0]))body=body.replace(old,()=>next);
 assert.equal(hash(body),'5dbab9e05b90b7bb2c323c3862ed8b64ee9bbe0fc25ac268f736da1078c91a41');
 const start=body.indexOf(" ELSIF p_command='swap' THEN"),end=body.indexOf(" ELSE RAISE EXCEPTION 'vnext_command_unsupported'; END IF;");const before=body.slice(start,end);let swap=before;
 for(const [,,old,next]of pairs(read('migrations/20261022_vnext_cached_admission_v2.sql')))swap=swap.replace(old,()=>next);
 swap=swap.replaceAll('12.5','(f.weight::numeric/2)').replaceAll("policy<>r->>'policy'",'policy<>v_comparison_policy').replaceAll("policy=r->>'policy'",'policy=v_comparison_policy').replace("VALUES(v_symbol,v_incumbent.symbol,r->>'policy',s,n)",'VALUES(v_symbol,v_incumbent.symbol,v_comparison_policy,s,n)');
 body=body.replace(before,()=>swap).replace(' s date; count_started integer;',' s date; v_comparison_policy text; count_started integer;');
 assert.equal(hash(body),'e27aa373d4a3d8b444c7bbec2585380329e98c21e35189746b56e72d522e121a');
 for(const [,,old,next]of pairs(read('migrations/20261022_vnext_terminal_failure_slots_v1.sql')))body=body.replace(old,()=>next);
 assert.equal(hash(body),'47a8d220420b10ac931118262032aac74bc66e94d437d9ac381ad3ab50226074');
 const target=JSON.parse(read('scripts/opportunity-v3/vnext-target-exit-profile-v1.json')).routines[0];body=body.replace(target.oldFragment,()=>target.newFragment);
 const prep=JSON.parse(read('scripts/opportunity-v3/vnext-preparation-read-profile-v1.json'));assert.equal(hash(body),prep.predecessorBodySha256);body=body.replace(prep.fragment.before,()=>prep.fragment.after);assert.equal(hash(body),prep.successorBodySha256);for(const [before,after]of trading.routines[0].fragments){assert.equal(body.split(before).length-1,1);body=body.replace(before,()=>after);}assert.equal(hash(body),trading.routines[0].successorBodySha256);return body;
}
function providerPredecessor(){
 let body=/\$replacement\$([\s\S]*?)\$replacement\$/u.exec(read('migrations/20261022_vnext_terminal_failure_slots_v1.sql'))![1];
 assert.equal(hash(body),'47fdb26746e2d20a2d85348d2e15cf288c8e1e1af84b7b4b6b780d150811288d');
 const source=ir.slice(ir.indexOf('DO $provider_patch$'),ir.indexOf('DO $current_patch$'));
 for(const match of source.matchAll(/\$old_([a-z_]+)\$([\s\S]*?)\$old_\1\$,\$new_\1\$([\s\S]*?)\$new_\1\$/gu)){const [,tag,before,after]=match;assert.equal(body.split(before).length-1,1,tag);body=body.replace(before,()=>after);}
 assert.equal(hash(body),'0e8121100eb0781d27e46f54d667cce39bbd061daa05a10efc4ebbb29a0312bd');
 const catalyst=JSON.parse(read('scripts/opportunity-v3/vnext-catalyst-criteria-profile-v1.json')).routines[2];for(const [before,after]of catalyst.fragments)body=body.replace(before,()=>after);assert.equal(hash(body),catalyst.successorBodySha256);return body;
}
test('current source predicate preserves all original source arms, exact append inverse and hash',()=>{
 assert.equal(hash(originalSource),profile.predecessorBodySha256);assert.equal(Buffer.byteLength(originalSource),profile.predecessorBytes);
 const after=originalSource+profile.appendFragment;assert.equal(hash(after),profile.successorBodySha256);assert.equal(Buffer.byteLength(after),profile.successorBytes);assert.equal(after.slice(0,-profile.appendFragment.length),originalSource);
 assert.ok(profile.appendFragment.includes('current_member.symbol=p_symbol'));assert.ok(profile.appendFragment.includes('vnext_trading_invalid_current_v1(current_member.symbol,current_member.input_hash)'));assert.ok(!profile.appendFragment.includes("input->"));assert.ok(profile.appendFragment.includes("? 'proofHash'"));assert.equal(hash(sql),profile.migrationSha256);assert.equal(profile.nativeVerified,false);
});
test('claim source is exact current trading successor; rejection follows admission but precedes replay/quota/start',()=>{
 const before=corePredecessor(),r=profile.routines[1];assert.equal(hash(before),r.predecessorBodySha256);let after=before;for(const [a,b]of r.fragments){assert.equal(after.split(a).length-1,1);after=after.replace(a,()=>b);}assert.equal(hash(after),r.successorBodySha256);assert.equal(Buffer.byteLength(after),r.successorBytes);for(const [a,b]of [...r.fragments].reverse())after=after.replace(b,()=>a);assert.equal(after,before);
 const changed=before.replace(r.fragments[0][0],()=>r.fragments[0][1]),claim=changed.slice(changed.indexOf(" ELSIF p_command='claim' THEN"),changed.indexOf(" ELSIF p_command IN('prepare'"));
 const guard=claim.indexOf('vnext_claim_confirmed_trading_invalid');assert.ok(guard>claim.indexOf('vnext_author_required'));assert.ok(guard>claim.indexOf('vnext_job_missing'));assert.ok(guard>claim.indexOf('vnext_admission_invalid'));assert.ok(guard<claim.indexOf("IF j.state<>'queued'"));assert.ok(guard<claim.indexOf('SELECT count(*)'));assert.ok(guard<claim.indexOf("SET state='running'"));
});
test('provider source preserves installed v3 symbol projection and only adds reserve rejection before lookup/replay',()=>{
 const before=providerPredecessor(),r=profile.routines[2];assert.equal(hash(before),r.predecessorBodySha256);let after=before;for(const [a,b]of r.fragments){assert.equal(after.split(a).length-1,1);after=after.replace(a,()=>b);}assert.equal(hash(after),r.successorBodySha256);assert.equal(Buffer.byteLength(after),r.successorBytes);for(const [a,b]of [...r.fragments].reverse())after=after.replace(b,()=>a);assert.equal(after,before);
 const changed=before.replace(r.fragments[0][0],()=>r.fragments[0][1]),guard=changed.indexOf('vnext_reserve_confirmed_trading_invalid');assert.ok(guard>changed.indexOf('vnext_worker_execution_binding'));assert.ok(guard<changed.indexOf('SELECT * INTO invocation'));assert.ok(guard<changed.indexOf("IF p_command='reserve' THEN"));assert.ok(r.fragments[0][1].startsWith(" IF p_command='reserve' AND "));
 const inspect=before.slice(before.indexOf(" IF p_command='inspect' THEN"),before.indexOf(' role_task:=actor;'));assert.ok(changed.includes(inspect));assert.ok(changed.endsWith(before.slice(before.indexOf(" IF p_command='read' THEN"))));
});
test('existing work/publication/current-public paths use the unchanged generic predicate callgraph',()=>{
 const thesis=read('migrations/20261022_vnext_thesis_audit_v1.sql');for(const site of ["p_command IN('prepare','work-context','author-context','author','review-claim','review-context','review-sources','review','qualification-context','record-qualification','publish')",'vnext_publication_original_rights_no_longer_current','current_sources:=coalesce(public.vnext_input_sources_current_v1(source_input,member.symbol),false)','current_sources:=coalesce(public.vnext_input_sources_current_v1(source_input,publication.symbol),false)'])assert.ok(thesis.includes(site),site);
});
test('confirmed proof alone suppresses prior current status; missing/conflicting/active retain original semantics',()=>{
 // Hypothetical Boolean specification, not a SQL interpreter or real receipt.
 const current=(original:boolean,observation:Record<string,unknown>|null)=>original&&!(observation&&Object.hasOwn(observation,'proofHash'));
 for(const unknown of [null,{deferred:'trading_invalid_roster_missing_or_unbounded'},{deferred:'trading_invalid_latest_roster_conflict'},{deferred:'trading_invalid_not_confirmed'},{deferred:'trading_invalid_current_interval_unavailable'}]){assert.equal(current(true,unknown),true);assert.equal(current(false,unknown),false);}
 assert.equal(current(true,{proofHash:'synthetic-only'}),false);assert.equal(current(false,{proofHash:'synthetic-only'}),false);
});
test('private checker dependency is exact and nonrecursive; no new authority/read edge or timer expiry',()=>{
 const helper=/AS \$checker\$([\s\S]*?)\$checker\$;/u.exec(read(trading.migration))![1];assert.equal(hash(helper),profile.prerequisites.privateCheckerBodySha256);assert.ok(!helper.includes('vnext_input_sources_current_v1'));assert.ok(!helper.includes('vnext_issuer_financial_evidence_current_v1'));assert.ok(helper.includes('public.vnext_members_v1'));assert.ok(helper.includes('public.stock_instruments_v3'));assert.equal(profile.permissionDelta,'none');assert.ok(!/GRANT |REVOKE |CREATE FUNCTION|CREATE POLICY|ALTER ROLE|ALTER TABLE/u.test(sql));
});
test('three existing routines retain full nonbody metadata/OIDs/catalog with original mutex and owner/ACL fences',()=>{
 assert.equal(profile.routines.length,3);for(const value of ['vnext_roster_current_namespace_changed','vnext_roster_current_metadata_changed','vnext_roster_current_claim_metadata_changed','vnext_roster_current_reserve_metadata_changed',"to_jsonb(p)-'prosrc'",'CASE WHEN p.oid=ANY($1)','USING ARRAY[target,core_target,provider_target]',"p.proargnames=ARRAY['input','p_symbol']","p.proconfig=ARRAY['search_path=pg_catalog, public']",'vnext_roster_current_source_acl_changed','vnext_roster_current_core_acl_changed','vnext_roster_current_provider_acl_changed'])assert.ok(sql.includes(value),value);
 assert.ok(sql.indexOf('pg_advisory_xact_lock(64221022)')<sql.indexOf('SELECT prosrc,pg_get_functiondef'));assert.ok(!sql.includes('to_jsonb(p) END ORDER BY p.oid LIMIT'));
});
test('SQL unknown-proof semantics never supply a positive preparation identity',()=>{
 // SQL preserves its prior source predicate for unknown roster data. The
 // independent actual preparation selector must still withhold identity;
 // preserving the old active-only query was never an acceptance requirement.
 assert.ok(profile.scope.includes('unknown roster retains original source semantics'));assert.ok(!profile.appendFragment.includes("'active'"));
 const scope={stockId:'10000000-0000-4000-8000-000000000001',symbol:'2330',cutoff:'2026-10-23T05:30:00Z'};
 for(const rows of [[],[{}],[{validated:true}],[{proofHash:'synthetic-only'}]])assert.equal(currentPreparationInstrument(rows,scope).status,'gap');
});
