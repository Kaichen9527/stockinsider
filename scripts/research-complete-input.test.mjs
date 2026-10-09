import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {completeCanonical,completeHash,parseCompleteJson,validateCompleteSchema} from '../web/src/lib/research-complete-canonical.ts';import {readCompleteBody,parseCompleteRequest,runCompleteInput} from '../web/src/lib/research-complete-input.ts';import {FinancialDeadline} from '../web/src/lib/research-financial-file-reader.ts';
const vectors=JSON.parse(fs.readFileSync('openspec/changes/research-complete-input-v2/canonical-vectors.json'));
for(const [i,v]of vectors.vectors.entries())test('canonical frozen vector '+i,()=>{const n=JSON.parse(v.rawJson);assert.equal(completeCanonical(n),v.canonicalUtf8);assert.equal(Buffer.byteLength(completeCanonical(n)),v.bytes);assert.equal(completeHash(n),v.sha256);});
for(const s of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"x":NaN}','{"x":1} trailing','"\\ud800"','"\\u0000"'])test('strict JSON rejects '+s,()=>assert.throws(()=>parseCompleteJson(s)));
for(const n of [Infinity,NaN,()=>{},undefined])test('non JSON value rejects '+String(n),()=>assert.throws(()=>completeCanonical(n)));
test('8192 actual UTF8 body bound inclusive, +1 and malformed UTF8 fail',async()=>{const req=s=>new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:s});assert.deepEqual(await readCompleteBody(req('{"a":"'+'x'.repeat(8184)+'"}'),new FinancialDeadline()),{a:'x'.repeat(8184)});await assert.rejects(()=>readCompleteBody(req('{"a":"'+'x'.repeat(8185)+'"}'),new FinancialDeadline()));await assert.rejects(()=>readCompleteBody(req(new Uint8Array([123,34,97,34,58,34,255,34,125])),new FinancialDeadline()));});
test('closed ingress cannot select executable, financial body or clock',()=>{for(const k of ['command','calculation','clock','sourceDocumentIds'])assert.throws(()=>parseCompleteRequest({[k]:'ignored'}));});
test('schema constant and unknown nested fields reject',()=>{const s={type:'object',properties:{a:{const:1}},required:['a'],additionalProperties:false};validateCompleteSchema({a:1},s,'');for(const v of [{a:2},{a:1,b:0},{}])assert.throws(()=>validateCompleteSchema(v,s,''));});

// Replays from an older DB mapping may not bypass the current server mapping.
const replayRequest={owner:'synthetic-replay-owner',jobId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',attempt:1,reservationId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',scope:'research_observed_v1',snapshotHash:'a'.repeat(64),preparationId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',preparationHash:'b'.repeat(64),expectedArtifactManifestHash:'c'.repeat(64),expectedCalculatorExecutionHash:'d'.repeat(64)};
for(const seal of [false,true])test('old DB sealed mapping cannot bypass current mapping '+seal,async()=>{
 let calls=0;const db={rpc(){calls++;return{abortSignal:async()=>({data:{status:'sealed',dispatchReady:false,canonical_payload:{researchIdentity:{symbol:'2409'}}},error:null})};}};
 await assert.rejects(runCompleteInput(db,replayRequest,seal,new FinancialDeadline(),'/must-not-read-replay'));assert.equal(calls,1);
});

// Compare all numeric/string schema tokens, not an approximate floating tolerance.
test('static schema bundles exactly preserve both original numeric and Unicode schemas',async()=>{
 const {schema2409,schema2383}=await import('../web/src/lib/research-complete-schema-bundles.ts');
 for(const[symbol,schema]of[['2409',schema2409],['2383',schema2383]])assert.deepEqual(schema,JSON.parse(fs.readFileSync('web/src/lib/research-complete-'+symbol+'.schema.json','utf8')));
 assert.equal(schema2409.properties.financialMaterial.properties.projection.properties.projected.properties.scenarios.prefixItems[1].properties.quarters.prefixItems[1].properties.segments.prefixItems[0].properties.revenue.const,31090.078766235238);
});

// This existing encoding sorts metadata object keys, not just the file array.
// Recompute the complete transitive source closure from actual Git file bytes.
test('closure metadata v1 preserves sorted keys independent of insertion order and binds SQL',async()=>{
 const {createHash}=await import('node:crypto');
 const mapping=JSON.parse(fs.readFileSync('web/src/lib/research-complete-mapping.json','utf8'));
 assert.equal(mapping.sourceClosureEncoding,'sorted_compact_utf8_json_metadata_v1');
 assert.deepEqual(mapping.sourceClosure.map(x=>x.file),mapping.sourceClosure.map(x=>x.file).sort());
 const sorted=rows=>JSON.stringify(rows.map(row=>Object.fromEntries(Object.keys(row).sort().map(k=>[k,row[k]]))));
 const digest=rows=>createHash('sha256').update(sorted(rows),'utf8').digest('hex');
 assert.equal(mapping.sourceClosureHash,digest(mapping.sourceClosure));
 assert.equal(digest(mapping.sourceClosure.map(({file,bytes,sha256})=>({sha256,file,bytes}))),mapping.sourceClosureHash);
 for(const pin of mapping.sourceClosure){const bytes=fs.readFileSync(pin.file);assert.equal(bytes.length,pin.bytes,pin.file);assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256,pin.file);}
 for(const company of Object.values(mapping.companies))assert.equal(company.sourceClosureHash,mapping.sourceClosureHash);
 const sql=fs.readFileSync('migrations/20261009_research_complete_input_v2.sql','utf8');
 assert.ok(sql.includes('"sourceClosureHash":"'+mapping.sourceClosureHash+'"'));
 assert.ok(!sql.includes('ef95096ff64e63dd4def51fa1aa5ec608837100fbdad780274becda5463b40ff'));
});
