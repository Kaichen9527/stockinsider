/** Source construction/lineage only. No PostgreSQL acceptance or approval. */
import fs from 'node:fs';import {createHash} from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8'),sha=x=>createHash('sha256').update(x).digest('hex');
const profile=JSON.parse(read('scripts/opportunity-v3/vnext-action-terms-profile-v1.json')),sql=read(profile.migration);
const forecast=read('migrations/20261023_vnext_forecast_sources_v1.sql'),target=read('migrations/20261022_vnext_target_exit_v1.sql');
const block=(source,tag)=>new RegExp('\\$'+tag+'\\$([\\s\\S]*?)\\$'+tag+'\\$','u').exec(source)[1];
test('complete four predecessor/successor bodies and inverse fragments are bound, originals untouched',()=>{
 assert.equal(sha(sql),profile.migrationSha256);assert.equal(profile.nativeVerified,false);assert.equal(profile.nativeOids,null);
 let input=block(read('migrations/20261022_vnext_issuer_ir_sources_v1.sql'),'current_body');input+=/changed:=original\|\|\$fence\$([\s\S]*?)\$fence\$/u.exec(read('migrations/20261023_vnext_roster_current_fence_v1.sql'))[1];input='SELECT public.vnext_forecast_input_current_internal_v1(input,p_symbol) AND ('+input+')';
 const evidence="SELECT CASE WHEN left(item->>'id',9)='forecast:' THEN public.vnext_forecast_evidence_current_internal_v1(item,p_symbol) ELSE ("+block(read('migrations/20261022_vnext_source_withdrawals_v1.sql'),'replacement')+') END';
 let current=block(target,'current');for(const [a,b]of JSON.parse(read('scripts/opportunity-v3/vnext-target-profiles-source-v1.json')).fragments)current=current.replace(a,b);
 const original=[evidence,input,block(target,'quote'),current];
 profile.modifiedRoutines.forEach((r,i)=>{assert.equal(sha(original[i]),r.predecessorBodySha256);assert.equal(Buffer.byteLength(original[i]),r.predecessorBytes);const successor=block(sql,'successor'+i);assert.equal(sha(successor),r.successorBodySha256);assert.equal(Buffer.byteLength(successor),r.successorBytes);assert.ok(sql.includes(r.predecessorBodySha256)&&sql.includes(r.successorBodySha256));
  if(i<2){const [prefix,suffix]=i===0?["SELECT CASE WHEN left(item->>'id',7)='action:' THEN public.vnext_action_evidence_current_v1(item,p_symbol) ELSE (",') END']:['SELECT public.vnext_action_terms_input_current_v1(input,p_symbol) AND (',')'];assert.equal(successor,prefix+original[i]+suffix);}
  else{let changed=original[i];for(const [a,b]of r.fragments){assert.equal(changed.split(a).length,2);changed=changed.replace(a,b);}assert.equal(changed,successor);for(const [a,b]of [...r.fragments].reverse()){assert.equal(changed.split(b).length,2);changed=changed.replace(b,a);}assert.equal(changed,original[i]);}
 });
 assert.equal(block(sql,'baseline_sources'),input,'private immutable-target path retains COMPLETE prior current source/forecast/roster validation; no caller skip flag');
});
test('all eight new bodies, original catalog codecs and strict private/public ACL profile are sealed',()=>{
 for(const r of profile.newFunctions){const m=new RegExp('CREATE FUNCTION public\\.'+r.name+'\\([^;]*?AS \\$([a-z_]+)\\$([\\s\\S]*?)\\$\\1\\$;','u').exec(sql);assert.ok(m,r.name);assert.equal(sha(m[2]),r.bodySha256);assert.equal(Buffer.byteLength(m[2]),r.bytes);assert.ok(sql.includes(r.bodySha256));}
 const original=/catalog_sql constant text:=\$catalog\$([\s\S]*?)\$catalog\$/u.exec(target)[1];const queries=[...sql.matchAll(/catalog_sql constant text:=\$catalog\$([\s\S]*?)\$catalog\$/gu)];assert.equal(queries.length,2);for(const q of queries)assert.equal(q[1],original);
 assert.equal(sha(original),profile.catalogQuerySha256);for(const value of ['vnext_action_existing_metadata_changed','vnext_action_original_catalog_changed','vnext_action_undeclared_catalog_delta','vnext_action_new_routine_acl','vnext_action_target_baseline_acl','vnext_action_private_rights_profile'])assert.ok(sql.includes(value));
 assert.equal((sql.match(/GRANT EXECUTE/gu)||[]).length,2);assert.ok(!/GRANT USAGE|ALTER ROLE|CREATE ROLE|DISABLE TRIGGER|DISABLE ROW LEVEL SECURITY/u.test(sql));
});
test('current MOPS original, exact disclosed span parser and use permission are required, not price factors',()=>{
 const p=block(sql,'terms_current');for(const value of ['source_document_revisions_v3','source_revision_family_registry_v3','source_publication_verifications_v3','publisher_verification_authorities_v3','source_identity_authorities_v3','opportunity_manifest_rows_v3',"operation='revoke'",'revision.raw_field_payload','revision.ingestion_canonical_content_hash_v3',"publisher.source_class::text<>'official'",'canonical_hash IS DISTINCT FROM verification.canonical_content_hash','row_item.payload_json=jsonb_build_array(publisher.authority_id'])assert.ok(p.includes(value),value);
 assert.ok(!p.includes('daily_adjustment_factor'));assert.ok(!p.includes('pre_action_reference_price'));assert.ok(!p.includes('post_action_reference_price'));
 for(const label of ['換發前股數','換發後股數','每舊股現金股利','每舊股退還現金','每舊股認購價款','計價幣別'])assert.ok(block(sql,'terms_parser').includes(label));
 const q=block(sql,'successor2');assert.ok(q.includes("snapshot->>'snapshot_id'"));assert.ok(q.includes('target_cash_or_rights_intent_decision_required'));assert.ok(q.includes("'corporateActionReceipts',action_receipts"));
});
test('fresh terms changes/withdrawal fence preparation, provider and publication through original source callgraph',()=>{
 const input=block(sql,'terms_input');assert.ok(input.includes('statement_timestamp()'));assert.ok(input.includes("input->'actionTermsReceipts'=frozen_projection->'receipts'"));assert.ok(input.includes("input->'actionTermsGaps'=frozen_projection->'gaps'"));assert.ok(input.includes("items=frozen_projection->'evidence'"));assert.ok(input.includes("projection->'receipts'='[]'::jsonb AND projection->'gaps'='[]'::jsonb"));assert.ok(input.includes('stored.evidence=input'));assert.ok(block(sql,'preparation_guard').includes("NOT(NEW.evidence ? 'actionTermsReceipts')"));assert.ok(sql.includes('CREATE TRIGGER vnext_action_preparation_current BEFORE INSERT'));assert.ok(!block(sql,'terms_input').includes("input->>'prepared'"));
 const readBody=block(sql,'terms_read');for(const v of ["role='author'",'job.author_principal IS DISTINCT FROM p_principal','job.execution_id IS DISTINCT FROM p_execution','job.deadline_at<=clock_timestamp()',"'work-context'"])assert.ok(readBody.includes(v));
 assert.ok(input.includes("frozen_projection->'receipts'=projection->'receipts'"));assert.ok(input.includes("(input->>'actionTermsAsOf')::timestamptz"));assert.ok(block(sql,'preparation_guard').includes('clock_timestamp()>deadline'));assert.ok(block(sql,'terms_current').includes("octet_length(convert_to(item::text,'UTF8'))>1048576"));
 const prep=read('web/src/lib/vnext/preparation-reconciliation.ts'),store=read('web/src/lib/vnext/store.ts');for(const s of [prep,store])assert.ok(s.includes('readCurrentActionTerms'));
 const current=block(sql,'successor3');assert.ok(current.includes('target_exact_decimal_rebase_unavailable'));assert.ok(current.includes('mod(base*1000000*share_denominator,share_numerator)<>0'));assert.ok(!/UPDATE|INSERT INTO|DELETE FROM/u.test(current));
});
