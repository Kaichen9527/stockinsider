/** Source/catalog construction checks only. No PostgreSQL acceptance claim. */
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(p,'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
const profile=JSON.parse(read('scripts/opportunity-v3/vnext-forecast-sources-profile-v1.json')),sql=read(profile.migration);
test('candidate seal pins every new function and preserves original current-source bodies inside finite wrappers',()=>{
 assert.equal(hash(sql),profile.migrationSha256);assert.equal(profile.nativeVerified,false);assert.equal(profile.nativeOids,null);
 const originals=[/\$replacement\$([\s\S]*?)\$replacement\$/u.exec(read('migrations/20261022_vnext_source_withdrawals_v1.sql'))[1],/\$current_body\$([\s\S]*?)\$current_body\$/u.exec(read('migrations/20261022_vnext_issuer_ir_sources_v1.sql'))[1]];
 originals[1]+=/changed:=original\|\|\$fence\$([\s\S]*?)\$fence\$/u.exec(read('migrations/20261023_vnext_roster_current_fence_v1.sql'))[1];
 const wrappers=[a=>"SELECT CASE WHEN left(item->>'id',9)='forecast:' THEN public.vnext_forecast_evidence_current_internal_v1(item,p_symbol) ELSE ("+a+') END',a=>'SELECT public.vnext_forecast_input_current_internal_v1(input,p_symbol) AND ('+a+')'];
 profile.modifiedRoutines.forEach((r,i)=>{assert.equal(hash(originals[i]),r.predecessorBodySha256);assert.equal(Buffer.byteLength(originals[i]),r.predecessorBytes);assert.equal(hash(wrappers[i](originals[i])),r.successorBodySha256);assert.equal(Buffer.byteLength(wrappers[i](originals[i])),r.successorBytes);assert.ok(sql.includes(r.predecessorBodySha256)&&sql.includes(r.successorBodySha256));});
 const bodies=[...sql.matchAll(/CREATE FUNCTION public\.(\w+)\([^;]*?AS \$(\w+)\$([\s\S]*?)\$\2\$;/gu)];assert.equal(bodies.length,6);
 for(const [,name,,body]of bodies){const row=profile.newFunctions.find(r=>r.name===name);assert.ok(row);assert.equal(hash(body),row.bodySha256);assert.equal(Buffer.byteLength(body),row.bytes);assert.ok(sql.includes("oid='"+row.signature+"'::regprocedure"));assert.ok(sql.includes(row.bodySha256));}
});
test('full original catalog codec and rows remain guarded; only explicit new private metadata and one pure dependency grant are allowed',()=>{
 const original=/catalog_sql constant text:=\$catalog\$([\s\S]*?)\$catalog\$/u.exec(read('migrations/20261022_vnext_target_exit_v1.sql'))[1];const queries=[...sql.matchAll(/catalog_sql constant text:=\$catalog\$([\s\S]*?)\$catalog\$/gu)];assert.equal(queries.length,2);for(const q of queries)assert.equal(q[1],original);
 for(const token of ['vnext_forecast_original_catalog_changed','vnext_forecast_undeclared_catalog_delta','vnext_forecast_codec_predecessor_privilege','vnext_forecast_codec_acl_changed','vnext_forecast_routine_acl','vnext_forecast_private_rights_profile'])assert.ok(sql.includes(token));
 assert.equal((sql.match(/GRANT EXECUTE ON FUNCTION public\.vnext_catalog_canonical_v1\(jsonb\)/gu)||[]).length,1);assert.ok(!/ALTER ROLE|CREATE ROLE|DISABLE TRIGGER|DISABLE ROW LEVEL SECURITY|SET ROLE/u.test(sql));
});
test('reader is author/job/execution-bound and current original publication/rights/manifest/identity are required before projection',()=>{
 const reader=/\$public_reader\$([\s\S]*?)\$public_reader\$/u.exec(sql)[1];assert.ok(reader.indexOf("role='author'")<reader.indexOf('vnext_forecast_current_internal_v1'));for(const s of ['job.execution_id IS DISTINCT FROM p_execution','job.author_principal IS DISTINCT FROM p_principal','job.deadline_at<=clock_timestamp()'])assert.ok(reader.includes(s));
 for(const s of ['source_publication_verifications_v3','source_document_revisions_v3','publisher_verification_authorities_v3','source_identity_authorities_v3','source_revision_family_registry_v3','opportunity_manifest_rows_v3',"operation='revoke'",'manifest.root_canonical','publisher.institution_identity','revision.ingestion_canonical_content_hash_v3'])assert.ok(sql.includes(s));
 assert.ok(!/INSERT INTO public\.vnext_jobs|INSERT INTO public\.vnext_provider_invocations|renew|reclaim/u.test(sql));
});
test('numeric projection preserves original quarter/12month assumptions, never annual/4Q or a manufactured denominator',()=>{
 for(const s of ["fact.duration_kind::text='quarterly'","date_trunc('quarter',fact.period_start)","term:='source_quarterly_diluted_eps_estimate'","term:='source_target_price_12m'","'kind','assumption'","'denominatorShares',NULL,'annualEps',NULL,'nextFourQuarterEps',NULL",'forecast_horizon_not_supported','forecast_original_period_or_unit_unavailable'])assert.ok(sql.includes(s));
 const input=/\$input_check\$([\s\S]*?)\$input_check\$/u.exec(sql)[1];assert.ok(input.includes("input->'forecastSourceReceipts'=projection->'receipts'"));assert.ok(input.includes("frozen_items=projection->'evidence'"));assert.ok(input.includes("cutoff>(input->>'cutoff')::timestamptz"));
});
test('stock identity stays in the existing stock-owning composition without granting stocks to the source owner',()=>{
 const source=/\$reader\$([\s\S]*?)\$reader\$/u.exec(sql)[1];assert.ok(!source.includes('FROM public.stocks'));assert.ok(source.includes('symbol_value:=p_symbol'));
 for(const name of ['vnext_forecast_evidence_current_internal_v1','vnext_forecast_input_current_internal_v1'])assert.ok(sql.includes('ALTER FUNCTION public.'+name+'(jsonb,text) OWNER TO stockinsider_vnext_owner;'));
 assert.ok(sql.includes('vnext_forecast_current_internal_v1(stock,job.symbol,statement_timestamp())'));assert.ok(sql.includes('vnext_forecast_current_internal_v1(stock,p_symbol,cutoff)'));assert.ok(sql.includes('stock:=public.vnext_forecast_stock_id_internal_v1(job.symbol)'));assert.ok(sql.includes('retained>1000 OR identities<>1'));assert.ok(!sql.includes('FROM public.stocks'));assert.ok(!/GRANT[^;]*ON(?: TABLE)? public\.stocks/iu.test(sql));
});
