import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,copyFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {financialInventory} from '/tmp/stockinsider-discovery-snapshot-root-review-oct14/web/src/lib/research-financial-inventory.ts';
import {loadResearchFinancialSupplement} from '/tmp/stockinsider-discovery-snapshot-root-review-oct14/web/src/lib/research-financial-supplement.ts';
const sourceRoot='/tmp/stockinsider-discovery-snapshot-root-review-oct14';
const scratch='/Users/kaerchen/.cache/stockinsider-workspaces/formal-input-compatibility-root-oct14';
const output='/tmp/stockinsider-formal-input-compatibility-evidence-oct14';
await mkdir(scratch,{mode:0o700});await mkdir(output,{mode:0o700});
function canonical(v){if(Array.isArray(v))return`[${v.map(canonical).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;return JSON.stringify(v);}
const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
// Same external preparation seam as the existing exact-source test. These IDs
// are synthetic fixtures only, with no DB, reservation, role or API operation.
function dbFixture(symbol){
 const request={owner:'synthetic-formal-input-compatibility-only',jobId:randomUUID(),attempt:1,reservationId:randomUUID(),bundleId:null,sourceDocumentIds:[],scope:'research_observed_v1',snapshotHash:'a'.repeat(64)};
 const payload={symbol,scope:request.scope,snapshotHash:request.snapshotHash,modelDispatched:false};
 const input={request,preparationId:randomUUID(),preparationInputHash:hash(payload)};
 const saved={preparation_id:input.preparationId,input_hash:input.preparationInputHash,payload,request,replay:true,dispatchReady:false,job_id:request.jobId,attempt:1,reservation_id:request.reservationId,admitted_at:new Date().toISOString()};
 let calls=0;
 return {input,get calls(){return calls;},db:{rpc(name,args){assert.equal(name,'assert_research_input_preparation_v2');assert.deepEqual(args,{p_request:request,p_preparation_id:input.preparationId,p_input_hash:input.preparationInputHash});calls++;const response=Promise.resolve({data:structuredClone(saved),error:null});response.abortSignal=()=>response;return response;}}};
}
const results=[];
for(const symbol of ['2409','2383']){
 const pins=financialInventory.companies[symbol];
 for(const pin of pins){
  const filename=path.join(scratch,pin.path);await mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const bytes=pin===pins[0]?execFileSync('git',['-C',sourceRoot,'show','243db636:'+pin.path]):await readFile(path.join(sourceRoot,pin.path));
  assert.equal(bytes.length,pin.bytes);assert.equal(hash(bytes),pin.sha256);await writeFile(filename,bytes,{mode:0o600,flag:'wx'});
 }
 const before=dbFixture(symbol);const positive=await loadResearchFinancialSupplement(before.db,before.input,scratch);
 assert.equal(positive.status,'unsealed_calculation_only');assert.equal(before.calls,2);
 const successor=await readFile(path.join(sourceRoot,pins[0].path));
 await writeFile(path.join(scratch,pins[0].path),successor);
 const after=dbFixture(symbol);let failure=null;
 try{await loadResearchFinancialSupplement(after.db,after.input,scratch);}catch(e){failure={name:e.name,message:e.message};}
 assert.equal(failure?.message,'financial_file_invalid');assert.equal(after.calls,1);
 const model=JSON.parse(successor);
 results.push({symbol,oldPin:pins[0],oldHistoricalCanonical:positive.projection.originalModelCanonicalHash,oldPositive:{status:positive.status,rpcCalls:before.calls,financialVerified:positive.financialVerified,dispatchReady:positive.dispatchReady},newArtifact:{bytes:successor.length,sha256:hash(successor),canonicalHash:model.canonicalHash,asOf:model.asOf},newNegative:{failure,rpcCalls:after.calls},scope:'real production adapter and filesystem reader; external preparation RPC is synthetic test-only; no production/PG/network/model/publication operation'});
}
const record={source:'15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb',evidence:'ae8bb71744587a57cf49fbd82809d391d9f64169',originalArtifactSource:'243db636',executedAt:new Date().toISOString(),results,interpretation:'Existing formal-input adapter correctly fails closed on unconfigured successor bytes. Working-draft consumer PASS does not establish complete-input/publication compatibility. A separately reviewed successor inventory/projection/schema/mapping is required; no guard or pin changed.'};
await writeFile(path.join(output,'adapter-compatibility.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record,null,2));
