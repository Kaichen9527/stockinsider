// Exact one-line source extraction; builtins only. Does not import native/app or start sockets.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash}from'node:crypto';
const file=process.argv[2],mode=process.argv[3],text=fs.readFileSync(file,'utf8'),lines=text.split('\n').filter(v=>v.startsWith('function storedResponse('));assert.equal(lines.length,1);
const exactFunction=lines[0],normalize=Function('assert',exactFunction+';return storedResponse;')(assert),clone=v=>JSON.parse(JSON.stringify(v));
const expectedBinding={bindingCapsuleIdentity:'a'.repeat(64),core:{symbol:'2409',wireVersion:'research-article-input-v3',inventoryHash:'b'.repeat(64)},registration:{inventory:[{file:'synthetic.json',bytes:2,sha256:'c'.repeat(64)}],modelCutoff:'2026-10-08T00:00:00.000000Z'}};
const stored={revision_id:'synthetic-row',preparation_id:'synthetic-preparation',request_hash:'d'.repeat(64),input_hash:'e'.repeat(64),logical_bytes:123,canonical_request:{owner:'synthetic-fixture-only'},canonical_payload:{clocks:{researchCutoff:'2026-10-15T02:40:00.123456Z'},capabilities:{publishableResearch:false}},admitted_at:'2026-10-15T02:40:00.123456Z',research_cutoff:'2026-10-15T02:40:00.123456Z'};
const response=()=>({...clone(stored),status:'sealed',replay:true,dispatchReady:false,binding:clone(expectedBinding)}),results=[];
function probe(name,fn){fn();results.push({name,status:'PASS'});}
probe('exact binding stripped only after validation; all row fields preserved',()=>{const input=response(),before=clone(input),actual=normalize(input,expectedBinding);assert.deepEqual(actual,stored);assert.deepEqual(input,before);});
if(mode!=='red'){
 probe('wrong nested binding rejected',()=>{const input=response();input.binding.core.inventoryHash='f'.repeat(64);assert.throws(()=>normalize(input,expectedBinding));});
 probe('missing binding rejected',()=>{const input=response();delete input.binding;assert.throws(()=>normalize(input,expectedBinding));});
 probe('null binding rejected',()=>{const input=response();input.binding=null;assert.throws(()=>normalize(input,expectedBinding));});
 probe('unknown extra binding metadata rejected',()=>{const input=response();input.binding.unapproved=true;assert.throws(()=>normalize(input,expectedBinding));});
 probe('missing nested registration rejected',()=>{const input=response();delete input.binding.registration;assert.throws(()=>normalize(input,expectedBinding));});
 probe('extra persisted field survives normalization and fails full row comparison',()=>{const input=response();input.unexpected_persisted_column='not ignored';const row=normalize(input,expectedBinding);assert.equal(row.unexpected_persisted_column,'not ignored');assert.throws(()=>assert.deepEqual(row,stored));});
 probe('missing persisted field fails full row comparison',()=>{const input=response();delete input.input_hash;assert.throws(()=>assert.deepEqual(normalize(input,expectedBinding),stored));});
 probe('changed stored hash fails full row comparison',()=>{const input=response();input.input_hash='0'.repeat(64);assert.throws(()=>assert.deepEqual(normalize(input,expectedBinding),stored));});
 probe('changed stored clock fails full row comparison',()=>{const input=response();input.canonical_payload.clocks.researchCutoff='2026-10-15T02:40:00.123457Z';assert.throws(()=>assert.deepEqual(normalize(input,expectedBinding),stored));});
 for(const[key,value]of[['status','absent'],['replay',false],['dispatchReady',true]])probe('metadata '+key+' expectation unchanged',()=>{const input=response();input[key]=value;assert.throws(()=>normalize(input,expectedBinding));});
 assert.ok(text.includes('storedResponse(result,x.selected),stored'),'real callsite passes exact selected binding and retains full comparison');
}
console.log(JSON.stringify({scope:'isolated exact-function synthetic normalization contract, not SQL/native/schema approval',source:file,exactFunction,exactFunctionSha256:createHash('sha256').update(exactFunction).digest('hex'),count:results.length,results,native:'NOT_RUN'},null,2));
