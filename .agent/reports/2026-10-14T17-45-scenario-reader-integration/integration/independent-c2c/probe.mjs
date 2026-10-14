import fs from 'node:fs';import fsp from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {performance} from 'node:perf_hooks';import {pathToFileURL} from 'node:url';
const repo='/tmp/si-pubtail-o14';const load=x=>import(pathToFileURL(repo+'/web/src/lib/'+x));
const {createCandidateFinancialReaders:create}=await load('research-cash-financial-reader.ts');const {FinancialIoDeadline:Deadline,FinancialIoOwner:Owner,financialIoStatus:status}=await load('research-financial-io-owner.ts');const {historicalCashPins:pins}=await load('research-historical-cash-pins.ts');
const sources=JSON.parse(gunzipSync(fs.readFileSync(repo+'/scripts/fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz'),{maxOutputLength:2000000})).files;
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.homedir()),'.independent-scenario-integration-'));fs.chmodSync(root,0o700);const rows=[];let cases=0;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function settled(){const end=performance.now()+3000;while(!status().cleanupComplete&&performance.now()<end)await new Promise(r=>setTimeout(r,5));assert.equal(status().cleanupComplete,true);}
try{
for(const f of sources){const target=path.join(root,f.pin.path);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.writeFileSync(target,Buffer.from(f.rawBase64,'base64'),{mode:0o600});}
for(const symbol of ['2409','2383']){
 const n=pins.companies[symbol].files.length,handles=[],buffers=[];let rootChecks=0,ready=false,closed=0;const oldBuffer=Owner.prototype.buffer;
 const io={async lstat(name,...args){if(ready&&name===root){rootChecks++;assert.equal(closed,0);for(const h of handles)assert.ok((await h.stat()).isFile());}return fsp.lstat(name,...args);},async open(...args){const h=await fsp.open(...args),close=h.close.bind(h);handles.push(h);h.close=async()=>{closed++;return close();};return h;},checkpoint(label){if(label==='after_read:'+pins.companies[symbol].files.at(-1).path)ready=true;}};
 let result;try{Owner.prototype.buffer=function(bytes){const b=oldBuffer.call(this,bytes);buffers.push(b);return b;};result=await create(root,io).scenarioCash(pins.profile,symbol);}finally{Owner.prototype.buffer=oldBuffer;}
 assert.equal(handles.length,n);assert.equal(closed,n);assert.equal(rootChecks,3);assert.equal(buffers.length,n+1);for(const b of buffers)assert.ok(b.every(x=>x===0));for(const h of handles)await assert.rejects(h.stat(),e=>e.code==='EBADF');
 assert.equal(result.material.sourceClosureApproved,false);assert.equal(result.material.legacyV2ExecutionClaimed,false);assert.equal(result.material.forecastCash,null);assert.equal(result.readerReceipt.cleanupComplete,true);
 rows.push({case:'all FDs held through three post-read namespace passes',symbol,handles:n,rootChecks,closed,zeroBuffers:buffers.length,materialBytes:Buffer.byteLength(JSON.stringify(result.material)),knownAt:result.material.artifactReadKnownAt});cases++;
 let postRead=false,validations=0,drifted=false;const sibling=path.join(root,'namespace-drift-'+symbol);
 const bad={lstat:async(name,...args)=>{if(postRead&&name===root&&++validations===3){fs.writeFileSync(sibling,'owned diagnostic',{mode:0o600});drifted=true;}return fsp.lstat(name,...args);},open:fsp.open,checkpoint(label){if(label==='after_read:'+pins.companies[symbol].files.at(-1).path)postRead=true;}};
 try{await assert.rejects(create(root,bad).scenarioCash(pins.profile,symbol),/financial_parent_replaced/);assert.equal(drifted,true);assert.equal(status().cleanupComplete,true);}finally{if(fs.existsSync(sibling))fs.unlinkSync(sibling);}
 rows.push({case:'after-projection namespace drift rejects no partial result',symbol,validations,cleanup:status()});cases++;
 const gate=deferred(),arrived=deferred(),d=new Deadline();let closes=0,first=true;
 const stall={lstat:fsp.lstat,async open(...a){const h=await fsp.open(...a),close=h.close.bind(h);h.close=async()=>{closes++;if(first){first=false;Object.defineProperty(d,'end',{value:performance.now()+35});arrived.resolve();}await gate.promise;return close();};return h;}};
 const run=create(root,stall).scenarioCash(pins.profile,symbol,d);run.catch(()=>{});await arrived.promise;
 try{await assert.rejects(run,e=>e.message==='financial_deadline'&&e.financialCleanup.recoveryRequired);for(const kind of ['legacy','historicalCash','scenarioCash']){const r=create(root);await assert.rejects(kind==='legacy'?r.legacy([pins.companies['2383'].files[0]]):r[kind](pins.profile,'2383'),/cleanup_or_read_in_progress/);}}finally{gate.resolve();await settled();}
 assert.equal(closes,n);const next=await create(root).scenarioCash(pins.profile,symbol);assert.equal(next.readerReceipt.cleanupComplete,true);
 rows.push({case:'scenario close stall bounds failure blocks three facades until actual settlement',symbol,closed:closes,restored:true});cases++;
}
console.log(JSON.stringify({cases,rows,finalStatus:status()},null,2));
}finally{fs.rmSync(root,{recursive:true,force:true});}
