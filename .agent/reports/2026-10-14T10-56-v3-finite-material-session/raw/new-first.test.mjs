import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';
import {createCandidateFinancialReaders as create} from '../web/src/lib/research-cash-financial-reader.ts';
import {createCompatibleFinancialReader} from '../web/src/lib/research-compatible-financial-reader.ts';
import {compatibleFinancialInventory as oldPins} from '../web/src/lib/research-compatible-financial-inventory.ts';
import {historicalCashPins as pins} from '../web/src/lib/research-historical-cash-pins.ts';
import {projectScenarioCashMaterial as project} from '../web/src/lib/research-scenario-cash-material.ts';
import {normalizeScenarioCashMaterial as normalize,validateNormalizedScenarioCashMaterial as validate,v3MaterialSchemaIdentity} from '../web/src/lib/research-v3-finite-material.ts';
import {completeHash,completeCanonical} from '../web/src/lib/research-v3-material-canonical.ts';
import {FinancialIoOwner,FinancialIoDeadline as Deadline,financialIoStatus as status} from '../web/src/lib/research-financial-io-owner.ts';
import {runFinancialIoSession} from '../web/src/lib/research-financial-io-engine.ts';
const sha=b=>createHash('sha256').update(b).digest('hex'),profile=pins.profile,noop={check(){}},witness='a'.repeat(64),ok=async()=>witness;
const packed=fs.readFileSync(new URL('./fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz',import.meta.url));assert.equal(sha(packed),'afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f');
const raw=new Map(JSON.parse(gunzipSync(packed,{maxOutputLength:2000000})).files.map(f=>[f.pin.path,Buffer.from(f.rawBase64,'base64')]));
const oldPacked=fs.readFileSync(new URL('./fixtures/research-compatible-financial/pinned-original-source.json.gz',import.meta.url));assert.equal(sha(oldPacked),'d094728eee0197a3343d7943c1600e7ffc62e1aff3ecb06f69380ff4a72ac96f');
const oldRaw=new Map(JSON.parse(gunzipSync(oldPacked,{maxOutputLength:2000000})).files.map(f=>[f.pin.path,Buffer.from(f.rawBase64,'base64')]));
const parent=fs.mkdtempSync(path.join(fs.realpathSync(os.homedir()),'.finite-v3-session-'));fs.chmodSync(parent,0o700);const root=path.join(parent,'cash'),oldRoot=path.join(parent,'old');
try{for(const[r,rows]of[[root,raw],[oldRoot,oldRaw]])for(const[name,b]of rows){fs.mkdirSync(path.dirname(path.join(r,name)),{recursive:true,mode:0o700});fs.writeFileSync(path.join(r,name),b,{mode:0o600});}}catch(e){fs.rmSync(parent,{recursive:true,force:true});throw e;}test.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
function canonical(v){if(Array.isArray(v))return`[${v.map(canonical).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')}}`;return JSON.stringify(v);}
const hash=v=>sha(canonical(v)),carrier=s=>Buffer.from(canonical({schemaVersion:'historical-cash-private-byte-material-v1',financialProfile:profile,symbol:s,files:pins.companies[s].files.map(p=>({path:p.path,rawBase64:raw.get(p.path).toString('base64')}))}));
const make=s=>{const clock=new Date().toISOString(),value=project(profile,s,carrier(s),clock,noop);return{clock,value};};
const normalizeAt=(s,v,t)=>normalize(profile,s,JSON.stringify(v),t,noop),validateAt=(s,v,t)=>validate(profile,s,JSON.stringify(v),t,noop);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function settled(){const end=performance.now()+3000;while(!status().cleanupComplete&&performance.now()<end)await new Promise(r=>setTimeout(r,5));assert.equal(status().cleanupComplete,true);}
const reader=create(root),compat=createCompatibleFinancialReader(oldRoot,ok),legacyPin=pins.companies['2383'].files[0];
const calls=[()=>reader.legacy([legacyPin]),()=>reader.historicalCash(profile,'2383'),()=>reader.scenarioCash(profile,'2383'),()=>compat.read(oldPins.profile,'2383'),()=>reader.completeScenarioCash(profile,'2383',ok)];
async function allBlocked(){for(const call of calls)await assert.rejects(call(),/financial_cleanup_or_read_in_progress/);}
for(const symbol of ['2409','2383']){
 test(`${symbol} exact raw/normalized schema identities; original values and all qualification fields retained`,()=>{
  const {clock,value}=make(symbol),result=normalizeAt(symbol,value,clock),{projection,calculation}=result.financialMaterial;
  for(const kind of ['raw','normalized'])assert.equal(sha(fs.readFileSync(new URL(`../web/src/lib/research-v3-material-schemas/${symbol}-${kind}.json`,import.meta.url))),v3MaterialSchemaIdentity[symbol][kind]);
  const p=structuredClone(value.projection);delete p.sourceManifestHash;const c=structuredClone(value.calculation);for(const k of ['inputHash','resultHash','executionCodeHash'])delete c[k];
  assert.deepEqual(projection,p);assert.deepEqual(calculation,c);assert.equal(calculation.scenarios.length,3);for(const s of calculation.scenarios)assert.equal(s.quarters.length,6);
  for(const[k,v]of Object.entries(value))if(!['projection','calculation','projectionHash','scenarioInputHash','resultHash','financialProfile','symbol','artifactReadKnownAt'].includes(k))assert.deepEqual(result.financialMaterial.provenance[k],v,k);
  assert.equal(result.candidateArtifactInventoryHash,completeHash(pins.companies[symbol].files));assert.equal(result.sourceClosureApproved,false);assert.equal(result.wireDispatchEnabled,false);assert.equal(result.wholeExecutionClosureBound,false);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=262144);assert.ok(Buffer.byteLength(JSON.stringify(projection))<=160000);assert.doesNotThrow(()=>completeCanonical(result));assert.notEqual(completeHash(result),value.resultHash);
  assert.equal(projection.clocks.currentLocalReadKnownAt,clock);assert.equal(projection.clocks.originalModelCutoff,value.projection.clocks.originalModelCutoff);assert.equal(projection.historicalCash.projectionSha256,symbol==='2409'?'b59bd42321ac7e9af6c3fcd1eba86fa359f2537d467a45e8fbef244e442c434d':'a1965a0f56556c4c4b50f89f7f96ef263b6fd7b6aec529c919cce3b8bfa585d7');
 });
 test(`${symbol} six dynamic hashes must satisfy raw canonical plus full actual recalculation`,()=>{
  const{clock,value}=make(symbol);for(const path of [['projectionHash'],['scenarioInputHash'],['resultHash'],['calculation','inputHash'],['calculation','resultHash'],['calculation','executionCodeHash']]){const v=structuredClone(value);let r=v;for(const k of path.slice(0,-1))r=r[k];r[path.at(-1)]='0'.repeat(64);assert.throws(()=>normalizeAt(symbol,v,clock));}
  const forged=structuredClone(value);forged.calculation.scenarios[0].quarters[0].revenue+=1;forged.resultHash=hash(forged.calculation);assert.throws(()=>normalizeAt(symbol,forged,clock));
 });
 test(`${symbol} closed finite data rejects unknown/missing/array/flags/cash/unit/basis/pin/clock drift`,()=>{
  const{clock,value}=make(symbol),result=normalizeAt(symbol,value,clock);
  const changes=[v=>v.extra=true,v=>delete v.financialMaterial.provenance.noFutureCash,v=>v.financialMaterial.projection.projected.scenarios.pop(),v=>v.financialMaterial.calculation.scenarios[0].quarters.pop(),v=>v.financialMaterial.provenance.sourceClosureApproved=true,v=>v.financialMaterial.provenance.forecastCash=1,v=>v.financialMaterial.projection.projected.unit='USD',v=>v.financialMaterial.projection.projected.scenarios[0].quarters[0].shares.openingOrdinaryMillion+=1,v=>v.financialMaterial.projection.rawModel.sha256='0'.repeat(64),v=>v.financialMaterial.projection.clocks.originalModelCutoff=clock,v=>v.financialMaterial.projection.clocks.currentLocalReadKnownAt='2026-10-08T00:00:00Z',v=>v.candidateArtifactInventoryHash='0'.repeat(64)];
  for(const mutate of changes){const v=structuredClone(result);mutate(v);assert.throws(()=>validateAt(symbol,v,clock));}
  const badRaw=structuredClone(value);badRaw.projection.sourceManifest[0].sha256='0'.repeat(64);badRaw.projectionHash=hash(badRaw.projection);assert.throws(()=>normalizeAt(symbol,badRaw,clock));
 });
 test(`${symbol} primitive ingress rejects metadata objects, oversized UTF8, duplicate keys and clock mismatch`,()=>{
  const{clock,value}=make(symbol);let touched=0;const object=new Proxy({},{get(){touched++;throw Error('getter');},ownKeys(){touched++;throw Error('keys');}});
  for(const text of [object,new Map(),' '.repeat(262145),'"'+'漢'.repeat(90000)+'"',JSON.stringify(value).replace('{','{"symbol":"'+symbol+'",')])assert.throws(()=>normalize(profile,symbol,text,clock,noop));assert.equal(touched,0);
  for(const t of ['2099-01-01T00:00:00Z','2026-10-13T00:00:00Z',clock.replace('Z','0001Z')])assert.throws(()=>normalize(profile,symbol,JSON.stringify(value),t,noop));
 });
 test(`${symbol} every cooperative normalization deadline rejects; no partially normalized success`,()=>{
  const{clock,value}=make(symbol),text=JSON.stringify(value);let count=0;normalize(profile,symbol,text,clock,{check(){count++;}});
  for(let at=1;at<=count;at++){let n=0;assert.throws(()=>normalize(profile,symbol,text,clock,{check(){if(++n===at)throw Error('expired');}}),/expired/);}
 });
 test(`${symbol} actual fixed FS full material holds all FD/raw through post assertion then closes and wipes`,async()=>{
  const handles=[],buffers=[],scratch=[],allocate=FinancialIoOwner.prototype.buffer,alloc=Buffer.alloc;let assertions=0;
  const r=create(root,{lstat:fsp.lstat,async open(...a){const h=await fsp.open(...a);handles.push(h);return h;}});
  let result;try{FinancialIoOwner.prototype.buffer=function(n){const b=allocate.call(this,n);buffers.push(b);return b;};Buffer.alloc=function(n,...args){const b=alloc.call(Buffer,n,...args);if(n===pins.companies[symbol].carrier.bytes)scratch.push(b);return b;};
   result=await r.completeScenarioCash(profile,symbol,async()=>{assertions++;if(assertions===2){assert.equal(handles.length,pins.companies[symbol].files.length);for(const h of handles)assert.ok((await h.stat()).isFile());for(const b of buffers)assert.ok(b.some(v=>v!==0));for(const b of scratch)assert.ok(b.every(v=>v===0));}return witness;});
  }finally{FinancialIoOwner.prototype.buffer=allocate;Buffer.alloc=alloc;}
  assert.equal(assertions,2);assert.equal(scratch.length,1);assert.equal(buffers.length,pins.companies[symbol].files.length);for(const h of handles)await assert.rejects(h.stat(),e=>e.code==='EBADF');for(const b of [...buffers,...scratch])assert.ok(b.every(v=>v===0));
  const expected=normalizeAt(symbol,project(profile,symbol,carrier(symbol),result.material.artifactReadKnownAt,noop),result.material.artifactReadKnownAt);assert.deepEqual(result.material,expected);assert.equal(result.readerReceipt.cleanupComplete,true);assert.equal(status().cleanupComplete,true);
 });
}
test('unknown selector/missing assertion/max10 reject before any callback/open, legacy still max8',async()=>{
 let count=0;const r=create(root,{lstat(){count++;throw Error('io');},open(){count++;throw Error('io');}}),a=async()=>{count++;return witness;};
 await assert.rejects(r.completeScenarioCash('wrong','2409',a),/profile_invalid/);await assert.rejects(r.completeScenarioCash(profile,'9999',a),/profile_invalid/);await assert.rejects(r.completeScenarioCash(profile,'2409',null),/assertion_required/);
 await assert.rejects(runFinancialIoSession(root,[...pins.companies['2409'].files,pins.companies['2383'].files[0]],new Deadline(),a,()=>{}),/inventory_invalid/);
 await assert.rejects(r.legacy(pins.companies['2409'].files),/inventory_invalid/);assert.equal(count,0);
});
test('fixed old model cannot be supplied to new9 profile',async()=>{const file=path.join(root,pins.companies['2409'].files[0].path),saved=fs.readFileSync(file);try{fs.writeFileSync(file,oldRaw.get(oldPins.companies['2409'][0].path));await assert.rejects(reader.completeScenarioCash(profile,'2409',ok),/financial_file_invalid/);}finally{fs.writeFileSync(file,saved);}assert.equal(status().cleanupComplete,true);});
for(const stage of ['pre','post'])test(`${stage} pending context expires, blocks all facades, late settlement permits actual reentry`,async()=>{
 const held=deferred(),arrived=deferred();let n=0;const d=new Deadline();const running=reader.completeScenarioCash(profile,'2383',async()=>{if(++n===(stage==='pre'?1:2)){arrived.resolve();return held.promise;}return witness;},d);running.catch(()=>{});
 await arrived.promise;Object.defineProperty(d,'end',{value:performance.now()-1});d.controller.abort();
 try{await assert.rejects(running,e=>e.financialCleanup?.recoveryRequired);await allBlocked();}finally{held.resolve(witness);await settled();}await reader.completeScenarioCash(profile,'2383',ok);
});
test('context mismatch and namespace replacement after full projection reject without success',async()=>{
 let n=0;await assert.rejects(reader.completeScenarioCash(profile,'2383',async()=>++n===1?witness:'b'.repeat(64)),/context_changed/);
 n=0;const file=path.join(root,pins.companies['2383'].files[0].path),tmp=file+'.saved';try{await assert.rejects(reader.completeScenarioCash(profile,'2383',async()=>{if(++n===2){fs.renameSync(file,tmp);fs.writeFileSync(file,fs.readFileSync(tmp),{mode:0o600});}return witness;}),/financial_parent_replaced|financial_file_replaced/);}finally{if(fs.existsSync(tmp)){fs.unlinkSync(file);fs.renameSync(tmp,file);}}assert.equal(status().cleanupComplete,true);
});
test('complete held-post blocks all facades and all four older facade acquisitions block complete',async()=>{
 const held=deferred(),arrived=deferred();let n=0;const running=reader.completeScenarioCash(profile,'2383',async()=>{if(++n===2){arrived.resolve();return held.promise;}return witness;});await arrived.promise;try{await allBlocked();}finally{held.resolve(witness);await running;}
 for(const kind of ['legacy','historicalCash','scenarioCash','compat']){const gate=deferred(),entered=deferred();let once=false;const io={lstat:fsp.lstat,open:fsp.open,checkpoint(){if(!once){once=true;entered.resolve();return gate.promise;}}};const r=create(root,io),c=createCompatibleFinancialReader(oldRoot,ok,io);const task=kind==='compat'?c.read(oldPins.profile,'2383'):kind==='legacy'?r.legacy([legacyPin]):r[kind](profile,'2383');await entered.promise;try{await assert.rejects(reader.completeScenarioCash(profile,'2383',ok),/cleanup_or_read_in_progress/);}finally{gate.resolve();await task;}}
});
test('unconfirmed actual close rejects complete and retains same owner until late confirmed closure',async()=>{
 const held=deferred(),entered=deferred();let once=false;const r=create(root,{lstat:fsp.lstat,async open(...a){const h=await fsp.open(...a),close=h.close.bind(h);h.close=async()=>{if(!once){once=true;entered.resolve();await held.promise;}return close();};return h;}}),d=new Deadline();const task=r.completeScenarioCash(profile,'2383',ok,d);task.catch(()=>{});await entered.promise;Object.defineProperty(d,'end',{value:performance.now()-1});d.controller.abort();try{await assert.rejects(task,e=>e.financialCleanup?.recoveryRequired);await allBlocked();}finally{held.resolve();await settled();}await reader.completeScenarioCash(profile,'2383',ok);
});
