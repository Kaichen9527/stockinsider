/** SQL/source construction proof only; not PostgreSQL grammar/ACL/COMMIT. */
import fs from 'node:fs';import assert from 'node:assert/strict';import test from 'node:test';import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(p,'utf8'),sha=s=>createHash('sha256').update(s).digest('hex');
const p=JSON.parse(read('scripts/opportunity-v3/vnext-disclosed-fiscal-profile-v1.json')),sql=read(p.migration),original=read('migrations/20261023_vnext_forecast_sources_v1.sql'),action=read('migrations/20261023_vnext_corporate_action_terms_v1.sql');
const block=(s,tag)=>new RegExp('\\$'+tag+'\\$([\\s\\S]*?)\\$'+tag+'\\$','u').exec(s)[1];
test('complete four predecessor bodies and only declared finite insertions reverse exactly',()=>{
 assert.equal(sha(sql),p.migrationSha256);assert.equal(p.nativeVerified,false);assert.equal(p.nativeOids,null);assert.equal(p.modifiedRoutines.length,4);
 const prior=[block(original,'reader'),block(original,'check'),block(original,'input_check'),block(action,'successor0')];
 for(const [i,r]of p.modifiedRoutines.entries()){
  assert.equal(sha(prior[i]),r.predecessorBodySha256);assert.equal(Buffer.byteLength(prior[i]),r.predecessorBytes);let next=prior[i];for(const [a,b]of r.fragments){assert.equal(next.split(a).length,2);next=next.replace(a,()=>b);}assert.equal(next,block(sql,'successor'+i));assert.equal(sha(next),r.successorBodySha256);assert.equal(Buffer.byteLength(next),r.successorBytes);
  for(const [a,b]of [...r.fragments].reverse()){assert.equal(next.split(b).length,2);next=next.replace(b,()=>a);}assert.equal(next,prior[i]);assert.ok(sql.includes(r.predecessorBodySha256));assert.ok(sql.includes(r.successorBodySha256));
 }
});
test('actual entire prior source authority checks copied with explicit purpose adaptation; no arbitrary input or price factor authority',()=>{
 const r=block(action,'terms_current'),f=p.originalAuthorityFragment,source=r.slice(r.indexOf(f.startMarker),r.indexOf(f.endMarker));assert.equal(sha(source),f.sourceHash);const adapted=source.replaceAll('action_','fiscal_');assert.equal(sha(adapted),f.adaptedHash);assert.ok(block(sql,'fiscal_reader').includes(adapted));
 for(const key of ['source_revision_family_registry_v3','publisher_verification_authorities_v3','source_identity_authorities_v3','opportunity_manifest_rows_v3','revision.raw_field_payload','canonical_hash IS DISTINCT FROM verification.canonical_content_hash',"r.license_basis='public_issuer_guidance'","revoked.operation='revoke'",'fiscal_share_basis_action_reconfirmation_required','fiscal_conflicting_current_disclosures'])assert.ok(block(sql,'fiscal_reader').includes(key),key);
 assert.ok(!sql.includes('daily_adjustment_factor'));assert.ok(!sql.includes('pre_action_reference_price'));assert.ok(!sql.includes('post_action_reference_price'));
});
test('new private bodies/catalog codec/nonbody/ACL/role identity and finite trigger postcondition are sealed',()=>{
 assert.equal(p.newFunctions.length,3);for(const r of p.newFunctions){const body=block(sql,r.tag);assert.equal(sha(body),r.bodySha256);assert.equal(Buffer.byteLength(body),r.bytes);assert.ok(sql.includes(r.bodySha256));}
 const query=block(read('migrations/20261022_vnext_target_exit_v1.sql'),'catalog');assert.equal(sha(query),p.catalogQuerySha256);assert.equal([...sql.matchAll(/catalog_sql constant text:=\$catalog\$([\s\S]*?)\$catalog\$/gu)].length,2);for(const m of sql.matchAll(/catalog_sql constant text:=\$catalog\$([\s\S]*?)\$catalog\$/gu))assert.equal(m[1],query);
 assert.ok(!/GRANT |CREATE TABLE public\.|ALTER ROLE|CREATE ROLE|CREATE POLICY|ALTER TABLE|ALTER TYPE/u.test(sql));assert.equal((sql.match(/CREATE FUNCTION public\./gu)||[]).length,3);for(const v of ['vnext_fiscal_original_metadata_changed','vnext_fiscal_original_catalog_changed','vnext_fiscal_new_routine_acl',"tgtype=7 AND tgenabled='O'",'BEFORE INSERT ON public.vnext_preparations_v1'])assert.ok(sql.includes(v));
});
test('frozen/current comparisons and original start/deadline fence cannot be omitted or self-attested',()=>{
 const input=block(sql,'successor2'),guard=block(sql,'fiscal_preparation');for(const v of ["left(e->>'id',16)='fiscal-forecast:'","left(value->>'id',16)='fiscal-forecast:'",'current_projection:=public.vnext_forecast_current_internal_v1(stock,p_symbol,statement_timestamp())',"(projection->'evidence')||(current_projection->'evidence')",'IS DISTINCT FROM current_projection'])assert.ok(input.includes(v));
 for(const v of ["NOT(NEW.evidence ? 'forecastSourceReceipts')","NOT(NEW.evidence ? 'forecastSourceAsOf')","vnext_forecast_input_current_internal_v1(NEW.evidence,symbol_value)","::timestamptz<started",'clock_timestamp()>deadline'])assert.ok(guard.includes(v));assert.ok(!/skipLive|validated|approved|renew|reserve|claim/u.test(guard));
 const source=block(sql,'successor3');assert.ok(source.startsWith("SELECT CASE WHEN left(item->>'id',16)='fiscal-forecast:'"));assert.ok(source.includes('vnext_forecast_evidence_current_internal_v1(item,p_symbol)'));
});
test('legacy transport validator bytes retained around bounded explicit fiscal pair dispatch; existing caller/provider path is used',()=>{
 let s=read('web/src/lib/vnext/forecast-current.ts');for(const insertion of ["import {validateFiscalForecastPairs} from './disclosed-fiscal-forecast.ts';\n"," validateFiscalForecastPairs(r.evidence,r.receipts,{stockId:r.stockId as string,symbol:r.symbol,asOf:r.asOf});\n","  if(object(value)&&String(value.id).startsWith('fiscal-forecast:'))continue;\n"]){assert.equal(s.split(insertion).length,2);s=s.replace(insertion,'');}assert.equal(sha(s),'9c789343d8dcb6d7ca3799f93c5b731a7660e65e074ba239ec266031a6f630c4');
 const f=read('scripts/vnext-preparation-http-fixture.mjs');for(const v of ['installDisclosedFiscalCandidate(x)','seedDisclosedFiscalFixture(x,query,stockId,runner,kind)','assert.equal(current.evidence.length,6)','assert.equal(legacy.length,2)','frozen.evidence.forecastSourceReceipts,preparation.evidence.forecastSourceReceipts','fiscal-full-originals-revoked'])assert.ok(f.includes(v));
 const worker=read('web/src/lib/vnext/worker-core.ts');assert.ok(worker.includes('record.frozen_request'));assert.ok(!read('web/src/lib/vnext/disclosed-fiscal-forecast.ts').includes('fetch('));
});
