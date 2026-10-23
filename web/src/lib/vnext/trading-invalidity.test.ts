/** SOURCE contracts and hypothetical roster vectors only, never native SQL acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
type Row=Record<string,unknown>;
const read=(file:string)=>readFileSync(new URL('../../../../'+file,import.meta.url),'utf8');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const profile=JSON.parse(read('scripts/opportunity-v3/vnext-trading-invalidity-profile-v1.json'));
const sql=read(profile.migration);
function predecessor(){
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
 const prep=JSON.parse(read('scripts/opportunity-v3/vnext-preparation-read-profile-v1.json'));assert.equal(hash(body),prep.predecessorBodySha256);body=body.replace(prep.fragment.before,()=>prep.fragment.after);assert.equal(hash(body),prep.successorBodySha256);return body;
}
const helper=/AS \$checker\$([\s\S]*?)\$checker\$;/u.exec(sql)![1];
test('two existing bodies have exact current-source predecessors, inverse parity and successor hashes',()=>{
 const originals=[predecessor(),/AS \$command\$([\s\S]*?)\$command\$;/u.exec(read('migrations/20261022_vnext_target_exit_v1.sql'))![1]];
 for(let i=0;i<originals.length;i++){const r=profile.routines[i],original=originals[i];assert.equal(hash(original),r.predecessorBodySha256);assert.equal(Buffer.byteLength(original),r.predecessorBytes);let changed=original;for(const [before,after]of r.fragments){assert.equal(changed.split(before).length-1,1);changed=changed.replace(before,()=>after);}assert.equal(hash(changed),r.successorBodySha256);assert.equal(Buffer.byteLength(changed),r.successorBytes);for(const [before,after]of [...r.fragments].reverse())changed=changed.replace(after,()=>before);assert.equal(changed,original);}
 assert.equal(hash(sql),profile.migrationSha256);assert.equal(hash(helper),profile.newPrivateRoutine.bodySha256);assert.equal(profile.nativeVerified,false);
});
test('current roster proof precedes publication/target lookup and exits once per unique active symbol',()=>{
 const fragment=profile.routines[1].fragments[1][1] as string;
 assert.ok(fragment.indexOf('vnext_trading_invalid_current_v1')<fragment.indexOf('SELECT * INTO pub'));
 assert.ok(fragment.includes("'reason','trading_invalid'"));assert.ok(fragment.includes('CONTINUE;'));assert.ok(!fragment.includes('tradingInvalidity\',invalidity'));
 const original=/AS \$command\$([\s\S]*?)\$command\$;/u.exec(read('migrations/20261022_vnext_target_exit_v1.sql'))![1];assert.ok(original.includes("FOR member IN SELECT * FROM public.vnext_members_v1 WHERE state<>'exited' ORDER BY symbol LOOP"));assert.ok(original.includes("count(*) FROM public.vnext_members_v1 WHERE state<>'exited')>20"));
 assert.ok(!fragment.includes('claim'));assert.ok(!fragment.includes('quota'));assert.ok(!fragment.includes('model'));
});
test('direct trading_invalid requires exact recomputed proof and evidence hash before inherited mutation',()=>{
 const before=predecessor(),r=profile.routines[0];let changed=before;for(const [a,b]of r.fragments)changed=changed.replace(a,()=>b);
 assert.ok(changed.indexOf("'vnext_trading_invalid_current_authority_required'")<changed.indexOf("UPDATE public.vnext_members_v1 SET state='exited'"));
 assert.ok(r.fragments[0][1].includes("jsonb_typeof(r->'tradingInvalidityProof') IS DISTINCT FROM 'object'"));assert.ok(r.fragments[0][1].includes("IS DISTINCT FROM r->'tradingInvalidityProof'"));assert.ok(r.fragments[0][1].includes("r->'evidence' IS DISTINCT FROM jsonb_build_array"));
 assert.ok(changed.includes(JSON.parse(read('scripts/opportunity-v3/vnext-target-exit-profile-v1.json')).routines[0].newFragment.replace(" ELSIF p_command='exit' THEN\n",'').trimEnd()));
});
// A hypothetical specification mirror exercises named boundary examples. It is
// not the PostgreSQL checker and cannot grant authority or build a DB proof.
const at=Date.parse('2026-10-23T02:00:00Z');
const row=(patch:Row={}):Row=>({instrument_authority_id:'11111111-1111-4111-8111-111111111111',stock_id:'22222222-2222-4222-8222-222222222222',symbol:'2408',exchange:'TWSE',instrument_type:'common_stock',listing_status:'suspended',provider:'twse',source_timestamp:'2026-10-22T02:00:00Z',valid_from:'2026-10-22T02:00:00Z',valid_to:null,roster_version:'tw-instrument-roster-v3.0',recorded_at:'2026-10-22T03:00:00Z',...patch});
function hypothetical(rows:Row[],other:Row[]=[]){
 if(!rows.length||rows.length>1000)return null;
 if(rows.some(r=>r.symbol!=='2408'||!['TWSE','TPEX'].includes(String(r.exchange))||r.provider!==String(r.exchange).toLowerCase()||r.roster_version!=='tw-instrument-roster-v3.0'||r.instrument_type!=='common_stock'||!['active','suspended','delisted'].includes(String(r.listing_status))||['source_timestamp','recorded_at','valid_from'].some(k=>typeof r[k]!=='string'||!Number.isFinite(Date.parse(String(r[k]))))||Date.parse(String(r.source_timestamp))>at||Date.parse(String(r.recorded_at))>at||Date.parse(String(r.source_timestamp))>Date.parse(String(r.recorded_at))||r.valid_to!==null&&(!Number.isFinite(Date.parse(String(r.valid_to)))||Date.parse(String(r.valid_to))<=Date.parse(String(r.valid_from)))))return null;
 if(new Set(rows.map(r=>r.stock_id)).size!==1)return null;
 const sorted=[...rows].sort((a,b)=>Date.parse(String(b.recorded_at))-Date.parse(String(a.recorded_at))||Date.parse(String(b.source_timestamp))-Date.parse(String(a.source_timestamp))),head=sorted[0];
 const omit=(r:Row)=>JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='instrument_authority_id')));
 if(rows.some(r=>r.recorded_at===head.recorded_at&&omit(r)!==omit(head))||Date.parse(String(head.valid_from))>at||head.valid_to!==null&&Date.parse(String(head.valid_to))<=at||other.some(r=>r.stock_id===head.stock_id&&r.symbol!=='2408'&&Date.parse(String(r.recorded_at))<=at&&Date.parse(String(r.source_timestamp))<=at&&Date.parse(String(r.valid_from))<=at&&(r.valid_to===null||Date.parse(String(r.valid_to))>at)))return null;
 return ['suspended','delisted'].includes(String(head.listing_status))?head.listing_status:null;
}
test('hypothetical current official suspended/delisted tuple is sufficient; current-valid old source is not given invented expiry',()=>{
 assert.equal(hypothetical([row()]),'suspended');assert.equal(hypothetical([row({listing_status:'delisted'})]),'delisted');assert.equal(hypothetical([row({recorded_at:'2020-01-02T00:00:00Z',source_timestamp:'2020-01-01T00:00:00Z',valid_from:'2020-01-01T00:00:00Z'})]),'suspended');
});
test('hypothetical missing, unknown, active, stale interval and future authority all defer',()=>{
 assert.equal(hypothetical([]),null);for(const patch of [{listing_status:'active'},{listing_status:null},{source_timestamp:null},{recorded_at:'2026-10-24T00:00:00Z'},{valid_from:'2026-10-24T00:00:00Z'},{valid_to:'2026-10-23T00:00:00Z'},{provider:'finmind'},{exchange:'TPEX'},{roster_version:'invented'},{instrument_type:'preferred_stock'},{symbol:'2330'}])assert.equal(hypothetical([row(patch)]),null,JSON.stringify(patch));
});
test('hypothetical conflicting latest statuses, cross-stock and cross-symbol identities defer',()=>{
 assert.equal(hypothetical([row(),row({listing_status:'active',instrument_authority_id:'33333333-3333-4333-8333-333333333333'})]),null);assert.equal(hypothetical([row(),row({stock_id:'44444444-4444-4444-8444-444444444444'})]),null);assert.equal(hypothetical([row()],[row({symbol:'2330'})]),null);
 assert.equal(hypothetical([row({recorded_at:'2026-10-21T03:00:00Z',source_timestamp:'2026-10-21T02:00:00Z'}),row({listing_status:'active'})]),null);
});
test('SQL independently enforces tuple, identity, clocks, current interval, bounded history and canonical proof',()=>{
 for(const guard of ["row_item->>'provider' IS DISTINCT FROM lower(row_item->>'exchange')","row_item->>'roster_version' IS DISTINCT FROM 'tw-instrument-roster-v3.0'","stock_ids<>1","trading_invalid_latest_roster_conflict","trading_invalid_current_interval_unavailable","trading_invalid_symbol_identity_conflict","instrument->>'listing_status' NOT IN('suspended','delisted')","LIMIT 1001","member.input_hash IS DISTINCT FROM p_input_hash","'memberEvidenceHash'","'instrumentHash'","public.vnext_catalog_canonical_v1(receipt)"])assert.ok(helper.includes(guard),guard);
 assert.ok(!/interval\s*'\d+ days'/u.test(helper));assert.ok(!helper.includes('vnext_publications_v1'));assert.ok(!helper.includes('vnext_jobs_v1'));
});
test('installer changes no existing permission or policy and preserves full namespace except two bodies/private addition',()=>{
 assert.equal(profile.existingReadEdge.permissionDelta,'none');assert.equal(profile.existingReadEdge.columns.length,12);assert.ok(sql.includes("polroles=ARRAY['stockinsider_vnext_owner'::regrole::oid]"));assert.ok(sql.includes('a.atttypid=(CASE attribute'));assert.ok(sql.includes('vnext_trading_invalidity_namespace_changed'));assert.ok(sql.includes("to_jsonb(p)-'prosrc'"));assert.ok(sql.includes('AND NOT(p.oid=ANY($2))'));
 assert.equal((sql.match(/CREATE FUNCTION public\./gu)||[]).length,1);assert.ok(!/GRANT |CREATE POLICY|ALTER ROLE|ALTER TABLE/u.test(sql));assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.vnext_trading_invalid_current_v1(text,text) FROM PUBLIC,anon,authenticated,service_role'));
 assert.ok(sql.indexOf('pg_advisory_xact_lock(64221022)')<sql.indexOf('EXECUTE $create_checker$'));
});
