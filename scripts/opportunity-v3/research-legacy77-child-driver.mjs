// Engineering-only IPC child. No PG connection, production CLI, or caller-selectable module.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const historical='77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41';
assert.equal(typeof process.send,'function','private parent IPC required');
const witness=globalThis[Symbol.for('stockinsider.local.prerequisite.fs-witness')];assert.ok(witness,'preload before historical ESM');
const pending=new Map();let sequence=0,started=false;
process.on('message',async message=>{
 if(message.kind==='rpc-result'){
  const slot=pending.get(message.id);assert.ok(slot);pending.delete(message.id);
  if(message.error)slot.reject(Object.assign(new Error(message.error.message),{code:message.error.code}));else slot.resolve({data:message.data,error:null});return;
 }
 if(message.kind!=='start'||started)return;started=true;
 try{
  assert.equal(process.version,'v22.14.0');assert.ok(path.isAbsolute(message.realm)&&path.isAbsolute(message.root));
  const index=JSON.parse(fs.readFileSync(new URL('../fixtures/research-legacy77/source-index.json',import.meta.url),'utf8'));
  for(const pin of index.files){const bytes=fs.readFileSync(path.join(message.realm,pin.file));assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256);}
  // These imports resolve only inside the exact historical tree, not the current app.
  const input=await import(pathToFileURL(path.join(message.realm,'web/src/lib/research-complete-input.ts')));
  const {FinancialDeadline}=await import(pathToFileURL(path.join(message.realm,'web/src/lib/research-financial-file-reader.ts')));
  const mapping=JSON.parse(fs.readFileSync(path.join(message.realm,'web/src/lib/research-complete-mapping.json'),'utf8'));
  const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
  assert.equal(mapping.sourceClosureHash,historical);assert.equal(sha(JSON.stringify(sorted(mapping.sourceClosure))),historical);assert.deepEqual(mapping.sourceClosure,index.files.slice(0,22).map(({file,bytes,sha256})=>({file,bytes,sha256})));assert.equal(message.request.expectedCalculatorExecutionHash,historical);
  assert.equal(message.request.expectedArtifactManifestHash,mapping.companies[message.symbol].inventoryHash);
  const db={rpc(name,args){
   assert.ok(['read_research_article_input_revision_v2','assert_research_input_preparation_v2','seal_research_article_input_revision_v2'].includes(name));
   // The real query is owned by the parent until settlement. Abort is not represented as kernel cancellation.
   return {abortSignal(signal){if(signal.aborted)return Promise.reject(new Error('financial_deadline'));
    const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});process.send({kind:'rpc',id,name,args,fd:{...witness}});});}};
  }};
  const saved=await input.runCompleteInput(db,message.request,true,new FinancialDeadline(),message.root);
  input.validateCompleteResponse(message.request,saved);assert.equal(saved.status,'sealed');assert.equal(pending.size,0);
  assert.equal(witness.opens,message.symbol==='2409'?8:6);assert.equal(witness.closes,witness.opens);
  process.send({kind:'success',saved,fd:{...witness},pid:process.pid,node:process.version,nodeSha:sha(fs.readFileSync(process.execPath)),originalSourcesVerified:26,originalClosure:historical,compiledNextIdentityVerified:false},()=>process.disconnect());
 }catch(error){process.exitCode=1;process.send({kind:'failure',error:{code:error.code,message:error.message},fd:{...witness},pendingRpc:pending.size},()=>process.disconnect());}
});
