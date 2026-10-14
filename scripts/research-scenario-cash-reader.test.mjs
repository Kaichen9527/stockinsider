import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import fsp from'node:fs/promises';import path from'node:path';import os from'node:os';import{gunzipSync}from'node:zlib';import{createHash}from'node:crypto';import{performance}from'node:perf_hooks';
import{createCandidateFinancialReaders as create}from'../web/src/lib/research-cash-financial-reader.ts';
import{FinancialIoDeadline as Deadline,FinancialIoOwner,financialIoStatus as status}from'../web/src/lib/research-financial-io-owner.ts';
import{historicalCashPins as pins}from'../web/src/lib/research-historical-cash-pins.ts';
import{projectScenarioCashMaterial as project}from'../web/src/lib/research-scenario-cash-material.ts';
const gzip=fs.readFileSync(new URL('./fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz',import.meta.url));assert.equal(createHash('sha256').update(gzip).digest('hex'),'afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f');
const raw=new Map(JSON.parse(gunzipSync(gzip,{maxOutputLength:2000000})).files.map(f=>[f.pin.path,Buffer.from(f.rawBase64,'base64')]));
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.homedir()),'.stockinsider-scenario-reader-'));fs.chmodSync(root,0o700);
try{for(const[name,b]of raw){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true,mode:0o700});fs.writeFileSync(path.join(root,name),b,{mode:0o600});}}catch(e){fs.rmSync(root,{recursive:true,force:true});throw e;}
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const io={lstat:fsp.lstat,open:fsp.open},profile=pins.profile,reader=create(root),legacyPin=pins.companies['2383'].files[0];
function sorted(v){if(Array.isArray(v))return`[${v.map(sorted).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${sorted(v[k])}`).join(',')}}`;return JSON.stringify(v);}
const carrier=s=>Buffer.from(sorted({schemaVersion:'historical-cash-private-byte-material-v1',financialProfile:profile,symbol:s,files:pins.companies[s].files.map(p=>({path:p.path,rawBase64:raw.get(p.path).toString('base64')}))}));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function settled(){const end=performance.now()+2000;while(!status().cleanupComplete&&performance.now()<end)await new Promise(r=>setTimeout(r,5));assert.equal(status().cleanupComplete,true);}
for(const symbol of ['2409','2383'])test(`${symbol} actual single acquisition returns full scenario plus cash only after FD/buffer cleanup`,async()=>{
 const handles=[],buffers=[],nativeBuffer=FinancialIoOwner.prototype.buffer;let closes=0;
 const r=create(root,{...io,async open(...a){const h=await fsp.open(...a),close=h.close.bind(h);handles.push(h);h.close=async()=>{closes++;return close();};return h;}});
 let result;try{FinancialIoOwner.prototype.buffer=function(n){const b=nativeBuffer.call(this,n);buffers.push(b);return b;};result=await r.scenarioCash(profile,symbol);}finally{FinancialIoOwner.prototype.buffer=nativeBuffer;}
 assert.deepEqual(result.material,project(profile,symbol,carrier(symbol),result.material.artifactReadKnownAt,{check(){}}));
 assert.equal(handles.length,pins.companies[symbol].files.length);assert.equal(closes,handles.length);assert.equal(buffers.length,handles.length+1);for(const h of handles)await assert.rejects(h.stat(),e=>e.code==='EBADF');for(const b of buffers)assert.ok(b.every(v=>v===0));
 assert.equal(result.readerReceipt.cleanupComplete,true);assert.equal(result.readerReceipt.kernelIoCancellationConfirmed,false);assert.equal(status().cleanupComplete,true);assert.equal(result.material.sourceClosureApproved,false);assert.equal(result.material.financialVerified,false);assert.equal(result.material.forecastCash,null);
 assert.equal(result.material.projection.historicalCash.sourceManifest.length,pins.companies[symbol].files.length);assert.equal(result.material.calculation.scenarios.length,3);assert.equal(result.material.calculation.scenarios[0].quarters.length,6);
});
test('full scenario profile cannot nominate IO paths, hashes, clocks or a different issuer',async()=>{
 let calls=0;const r=create(root,{lstat(){calls++;throw Error('unexpected_io');},open(){calls++;throw Error('unexpected_io');}});
 for(const[p,s]of [['unknown','2409'],[profile,'5347'],[profile,{symbol:'2409'}]])await assert.rejects(r.scenarioCash(p,s),/profile_invalid/);
 const d=new Deadline();Object.defineProperty(d,'end',{value:performance.now()-1});await assert.rejects(r.scenarioCash(profile,'2409',d),/financial_deadline/);assert.equal(calls,0);assert.equal(status().cleanupComplete,true);
});
test('legacy and full scenario facade block each other at the same actual FD owner',async()=>{
 for(const kind of ['legacy','scenario']){
  const held=deferred(),arrived=deferred();let once=false;const r=create(root,{...io,checkpoint(){if(!once){once=true;arrived.resolve();return held.promise;}}});
  const running=kind==='legacy'?r.legacy([legacyPin]):r.scenarioCash(profile,'2409');
  try{await arrived.promise;await assert.rejects(kind==='legacy'?reader.scenarioCash(profile,'2383'):reader.legacy([legacyPin]),/cleanup_or_read_in_progress/);assert.equal(status().cleanupComplete,false);}finally{held.resolve();await running;}
  assert.equal(status().cleanupComplete,true);
 }
});
test('full scenario shared deadline failure retains the pending acquisition until real settlement',async()=>{
 const held=deferred(),arrived=deferred();let once=false;const r=create(root,{...io,checkpoint(label){if(!once&&label.startsWith('after_read:')){once=true;arrived.resolve();return held.promise;}}});
 const d=new Deadline();Object.defineProperty(d,'end',{value:performance.now()+30});const running=r.scenarioCash(profile,'2409',d);running.catch(()=>{});
 try{await arrived.promise;await assert.rejects(running,e=>e.message==='financial_deadline'&&e.financialCleanup.recoveryRequired);await assert.rejects(reader.legacy([legacyPin]),/cleanup_or_read_in_progress/);await assert.rejects(reader.historicalCash(profile,'2383'),/cleanup_or_read_in_progress/);}finally{held.resolve();await settled();}
 const next=await reader.scenarioCash(profile,'2409');assert.equal(next.readerReceipt.cleanupComplete,true);assert.equal(status().cleanupComplete,true);
});
