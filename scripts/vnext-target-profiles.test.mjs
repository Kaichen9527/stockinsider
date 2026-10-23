/** Source engineering only. Actual v5 current-target RPC is separately exercised
 * by the fresh business native entry. No PG/mock result is called native here. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const profile=JSON.parse(fs.readFileSync('scripts/opportunity-v3/vnext-target-profiles-source-v1.json','utf8'));
const source=fs.readFileSync(profile.source,'utf8'),sql=fs.readFileSync(profile.migration,'utf8');
const original=/AS \$current\$([\s\S]*?)\$current\$;/u.exec(source)[1];
test('finite target profile candidate has exact complete predecessor, successor and inverse parity',()=>{
 assert.equal(sha(original),profile.predecessorBodySha256);assert.equal(Buffer.byteLength(original),profile.predecessorBytes);assert.equal(sha(sql),profile.migrationSha256);
 let current=original;for(const [before,after] of profile.fragments){assert.equal(current.split(before).length,2);assert.ok(sql.includes(before));assert.ok(sql.includes(after));current=current.replace(before,after);}assert.equal(sha(current),profile.successorBodySha256);assert.equal(Buffer.byteLength(current),profile.successorBytes);
 for(const [before,after] of [...profile.fragments].reverse())current=current.replace(after,before);assert.equal(current,original);
});
test('only known v5 gains the same exact symbol arm; old profiles and v4 cancellation stay closed',()=>{
 assert.equal(profile.fragments.length,2);for(const [index,role] of ['author','reviewer'].entries())assert.deepEqual(profile.fragments[index],[`${role}_call.prompt_version='vnext-research-worker-v3'`,`${role}_call.prompt_version IN('vnext-research-worker-v3','vnext-research-worker-v5')`]);
 assert.equal(sql.includes("'vnext-research-worker-v4'"),false);assert.equal(sql.includes('cancellationContext'),false);assert.equal(sql.includes('EXCEPTION WHEN'),false);
});
test('original full namespace codec retained with no allowed edge or new grant/role/table',()=>{
 const query=s=>/catalog_sql constant text:=\$catalog\$([\s\S]*?)\$catalog\$;/u.exec(s)[1];assert.equal(query(sql),query(source));assert.ok(sql.includes("USING ARRAY[target],ARRAY[]::oid[],'{}'::jsonb"));
 for(const prohibited of ['CREATE FUNCTION','CREATE TABLE','ALTER ROLE','ALTER OWNER','GRANT ','REVOKE ','UPDATE public.','DELETE FROM'])assert.equal(sql.includes(prohibited),false,prohibited);
 for(const required of ['read committed',"statement_timeout='30s'","lock_timeout='2s'",'pg_advisory_xact_lock(64221022)','vnext_target_profile_acl','vnext_target_profile_post_metadata','vnext_target_profile_namespace'])assert.ok(sql.includes(required),required);
});
test('share/cash terms are never invented from a reference price factor and all original target guards remain exact',()=>{
 let changed=original;for(const [a,b] of profile.fragments)changed=changed.replace(a,b);
 for(const expression of ["'target_frozen_review_request_mismatch'","'target_current_revision_input_or_rights_unavailable'","'target_pending_fundamental_or_source_work'","'target_original_provider_receipts_missing'","'target_original_reviewed_quote_missing'",'author_call.request_hash','reviewer_call.request_hash','public.vnext_target_quote_v1'])assert.ok(changed.includes(expression));
 const quote=/AS \$quote\$([\s\S]*?)\$quote\$;/u.exec(source)[1];assert.ok(quote.includes("RETURN jsonb_build_object('deferred','target_rebase_after_corporate_action_unavailable')"));assert.equal(profile.nativeVerified,false);assert.equal(profile.actualOid,null);
});
