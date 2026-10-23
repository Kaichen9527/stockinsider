/** Exact source construction only; no SQL grammar/permission/COMMIT claim. */
import fs from 'node:fs';import {createHash} from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';
const h=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(p,'utf8');
const profile=JSON.parse(read('scripts/opportunity-v3/vnext-forecast-active-profile-v1.json')),sql=read(profile.migration),original=read('migrations/20261023_vnext_forecast_sources_v1.sql');
test('active projection pins exact dependency/source body and complete inherited catalog codec without existing definition changes',()=>{
 assert.equal(h(sql),profile.migrationSha256);const body=/\$active\$([\s\S]*?)\$active\$/u.exec(sql)[1];assert.equal(h(body),profile.newRoutine.bodySha256);assert.equal(Buffer.byteLength(body),profile.newRoutine.bytes);assert.equal(profile.nativeVerified,false);
 const catalog=/catalog_sql constant text:=\$catalog\$([\s\S]*?)\$catalog\$/u.exec(original)[1];const codecs=[...sql.matchAll(/catalog_sql constant text:=\$catalog\$([\s\S]*?)\$catalog\$/gu)];assert.equal(codecs.length,2);for(const c of codecs)assert.equal(c[1],catalog);
 assert.deepEqual(profile.existingBodyOrAclChanges,[]);for(const d of profile.predecessor.requiredRoutines)assert.ok(sql.includes(d.bodySha256));assert.ok(!/CREATE OR REPLACE|ALTER ROLE|CREATE TABLE|ON public\.stocks/u.test(sql));
});
test('operator mode and real active membership precede private source reads with closed scope and original bounds',()=>{
 const body=/\$active\$([\s\S]*?)\$active\$/u.exec(sql)[1];assert.ok(body.indexOf("role='operator'")<body.indexOf('FOR member IN'));assert.ok(body.includes("state<>'exited' ORDER BY symbol LIMIT 21"));assert.ok(body.includes('amount>20'));assert.ok(body.includes('vnext_forecast_stock_id_internal_v1(member.symbol)'));assert.ok(body.includes('vnext_forecast_current_internal_v1(stock,member.symbol,statement_timestamp())'));assert.ok(body.includes('>1048576'));
 assert.ok(!/INSERT|UPDATE|DELETE|claim|prepare|reserve|provider/u.test(body));assert.ok(!/p_symbol|p_cutoff|validated|approved/u.test(body));assert.ok(sql.includes("after_namespace IS DISTINCT FROM current_setting('vnext.forecast_active_before')::jsonb"));
});
