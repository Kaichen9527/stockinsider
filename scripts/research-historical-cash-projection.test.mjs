import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync}from 'node:zlib';import{createHash}from 'node:crypto';
import{projectPinnedHistoricalCash}from '../web/src/lib/research-historical-cash-projection.ts';
import{historicalCashPins}from '../web/src/lib/research-historical-cash-pins.ts';
import{calculateHistoricalCash}from '../web/src/lib/research-historical-cash-core.ts';
const fixtureBytes=fs.readFileSync(new URL('./fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'),'afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f');
const fixture=JSON.parse(gunzipSync(fixtureBytes,{maxOutputLength:2000000}));assert.equal(fixture.schema,'private-historical-cash-source-bytes-v1');assert.equal(fixture.sourceCommit,historicalCashPins.sourceCommit);assert.equal(fixture.files.length,15);
const vectors=JSON.parse(fs.readFileSync(new URL('./fixtures/research-historical-cash/operands-and-decimal-vectors.json',import.meta.url),'utf8'));
const bytes=new Map(fixture.files.map(x=>[x.pin.path,Buffer.from(x.rawBase64,'base64')]));
const input=symbol=>new Map(historicalCashPins.companies[symbol].files.map(p=>[p.path,Buffer.from(bytes.get(p.path))]));
// Fixture-only encoder; no production arbitrary-object/Map compatibility path.
function canonical(value){if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;return JSON.stringify(value);}
const material=(symbol,files=input(symbol))=>Buffer.from(canonical({schemaVersion:'historical-cash-private-byte-material-v1',financialProfile:historicalCashPins.profile,symbol,files:[...files].map(([path,raw])=>({path,rawBase64:raw.toString('base64')}))}));
const project=(symbol,carrier,deadline={check(){}})=>projectPinnedHistoricalCash(historicalCashPins.profile,symbol,carrier,deadline);
const call=(symbol,files=input(symbol),deadline={check(){}})=>project(symbol,material(symbol,files),deadline);
for(const symbol of ['2409','2383']){
 test(`${symbol} all exact source bytes project and recompute original cash without financial authority`,()=>{
  const files=input(symbol),before=[...files].map(([k,v])=>[k,v.toString('base64')]),result=call(symbol,files);
  assert.deepEqual(result.calculation,calculateHistoricalCash(vectors.cases.find(v=>v.input.symbol===symbol).input));
  assert.deepEqual([...files].map(([k,v])=>[k,v.toString('base64')]),before);
  assert.equal(result.sourceManifest.length,symbol==='2409'?9:7);assert.equal(result.references.length,symbol==='2409'?52:33);
  assert.equal(result.calculation.workload.cashNumericCells,symbol==='2409'?104:66);assert.equal(result.capitalReferences.length,symbol==='2409'?9:0);
  for(const flag of ['financialVerified','dispatchReady','modelDispatched','publishableResearch','researchQualified','historicalPITEligible','strategyApproved','entryEligible','published','valuationApproved','technicalAdmission','sourcePublicationVerified','rawPdfBytesRead','filesystemCustodyVerified'])assert.equal(result[flag],false,flag);
  assert.equal(result.inventoryBytesVerified,true);assert.equal(result.forecastCash,null);assert.equal(result.noFutureCash,true);
  const json=JSON.stringify(result);assert.ok(Buffer.byteLength(json)<160000);assert.ok(!json.includes('/Users/')&&!json.includes('sourceLine":')&&!json.includes('retainedPdfLocalPath'));
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.references)&&Object.isFrozen(result.references[0].values));
 });
 test(`${symbol} any exact inventory file mutation, length, omission, order or extra fails closed`,()=>{
  for(const p of historicalCashPins.companies[symbol].files){
   const x=input(symbol);x.get(p.path)[0]^=1;assert.throws(()=>call(symbol,x),/projection_invalid/);
   const y=input(symbol);y.set(p.path,Buffer.concat([y.get(p.path),Buffer.from(' ')]));assert.throws(()=>call(symbol,y),/projection_invalid/);
   const z=input(symbol);z.delete(p.path);assert.throws(()=>call(symbol,z),/projection_invalid/);
  }
  assert.throws(()=>call(symbol,new Map([...input(symbol)].reverse())),/projection_invalid/);
  const extra=input(symbol);extra.set('docs/research/unknown.json',Buffer.from('{}'));assert.throws(()=>call(symbol,extra),/projection_invalid/);
 });
 test(`${symbol} packet numeric, label, source clock, cross-manifest and model changes cannot be repaired by consistent arithmetic`,()=>{
  const packetPath=historicalCashPins.packetPath;
  for(const change of [p=>p.issuers[1].facts.receivables.values[0]++,p=>p.issuers[0].facts.pretax.label='wrong',p=>p.extractionAvailableAt='2026-10-08T00:00:00Z',p=>p.auoJune30Capital.issuedSharesThousands++]){
   const files=input(symbol),packet=JSON.parse(files.get(packetPath));change(packet);files.set(packetPath,Buffer.from(JSON.stringify(packet)));assert.throws(()=>call(symbol,files),/projection_invalid/);
  }
  for(const change of [m=>m.inputManifest.pop(),m=>m.historicalCashFlow.sourceInputManifest.reverse(),m=>m.historicalCashFlow.sourceFacts.receivables.values[0]++,m=>m.historicalCashFlow.noFutureCash=false]){
   const files=input(symbol),key=historicalCashPins.companies[symbol].files[0].path,m=JSON.parse(files.get(key));change(m);files.set(key,Buffer.from(JSON.stringify(m)));assert.throws(()=>call(symbol,files),/projection_invalid/);
  }
 });
 test(`${symbol} deadline exceptions at every successful checkpoint cannot return partial success`,()=>{
  let checks=0;call(symbol,input(symbol),{check(){checks++;}});
  for(let at=1;at<=checks;at++){
   let n=0;const files=input(symbol),before=files.get(historicalCashPins.packetPath).toString('base64');
   assert.throws(()=>call(symbol,files,{check(){if(++n===at)throw Error('shared_deadline_expired');}}),/shared_deadline_expired/);
   assert.equal(files.get(historicalCashPins.packetPath).toString('base64'),before);
  }
 });
}
test('unknown or substituted profiles/companies reject before injected material access',()=>{
 const material=new Proxy({}, {get(){throw Error('material_accessed');}});
 for(const [profile,symbol]of [['unknown','2409'],['oct14_historical_cash_v1','5347'],[null,'2383']])assert.throws(()=>projectPinnedHistoricalCash(profile,symbol,material,{check(){}}),/projection_invalid/);
 assert.throws(()=>call('2409',input('2383')),/projection_invalid/);
});
test('byte-only native views ignore caller metadata and reject wrong backing stores and proxies',()=>{
 for(const symbol of ['2409','2383']){
  let reads=0;const original=material(symbol);
  for(const carrier of [Buffer.from(original),new Uint8Array(original)]){
   for(const k of ['byteLength','buffer','length','constructor','slice','set','toJSON',Symbol.iterator,...Array.from({length:10000},(_,i)=>`meta_${i}`)])Object.defineProperty(carrier,k,{get(){reads++;throw Error('caller_getter');}});
   assert.doesNotThrow(()=>project(symbol,carrier));assert.equal(reads,0);
  }
  for(const view of [new DataView(original.buffer),new Uint8ClampedArray(original),new Uint16Array(2),new Proxy(original,{get(){reads++;throw Error('proxy_get');},getPrototypeOf(){reads++;throw Error('proxy_prototype');},ownKeys(){reads++;throw Error('proxy_keys');}}),new Uint8Array(new SharedArrayBuffer(original.length)),new Uint8Array(new ArrayBuffer(original.length,{maxByteLength:original.length+1}))])assert.throws(()=>project(symbol,view));
  const detached=new Uint8Array(original);structuredClone(detached.buffer,{transfer:[detached.buffer]});assert.throws(()=>project(symbol,detached));assert.equal(reads,0);
 }
 assert.ok(Object.isFrozen(historicalCashPins)&&Object.isFrozen(historicalCashPins.companies['2409'].files));
});
test('each projected row carries exact two-period packet/model locators and private source-line hashes',()=>{
 for(const symbol of ['2409','2383']){
  const result=call(symbol),packet=JSON.parse(bytes.get(historicalCashPins.packetPath)),issuer=packet.issuers.find(i=>i.stock===symbol);
  for(const ref of result.references){assert.deepEqual(ref.values,issuer.facts[ref.metric].values);assert.equal(ref.sourceLineSha256,createHash('sha256').update(issuer.facts[ref.metric].sourceLine).digest('hex'));assert.equal(ref.unit,'TWD_thousands');assert.equal(ref.periodKind,'half_year_cumulative');assert.match(ref.packetLocator.jsonPointer,new RegExp(`/facts/${ref.metric}/values$`));}
 }
});
test('all legacy Maps reject without iteration, getters or own-key reflection, including R1/R2 shapes',()=>{
 for(const symbol of ['2409','2383'])for(const shape of ['exact','ownProperties','10000entries','empty']){
  const files=shape==='10000entries'?new Map(Array.from({length:10000},(_,i)=>[`unknown_${i}`,new Uint8Array(0)])):shape==='empty'?new Map():input(symbol);
  let touched=0;if(shape==='ownProperties')for(let i=0;i<10000;i++)Object.defineProperty(files,`unknown_${i}`,{get(){touched++;throw Error('map_getter');}});
  const entries=Map.prototype.entries,ownKeys=Reflect.ownKeys;
  try{Map.prototype.entries=function(){if(this===files){touched++;throw Error('map_iterator');}return entries.call(this);};Reflect.ownKeys=function(v){if(v===files){touched++;throw Error('map_ownKeys');}return ownKeys(v);};
   assert.throws(()=>project(symbol,files),/projection_invalid/);assert.equal(touched,0);
  }finally{Map.prototype.entries=entries;Reflect.ownKeys=ownKeys;}
 }
});
test('whole carrier length and SHA reject all serialized drift before JSON parsing',()=>{
 for(const symbol of ['2409','2383']){
  const exact=material(symbol),json=exact.toString('utf8'),object=JSON.parse(json);
  assert.equal(exact.length,historicalCashPins.companies[symbol].carrier.bytes);assert.equal(createHash('sha256').update(exact).digest('hex'),historicalCashPins.companies[symbol].carrier.sha256);
  const unknown={...object,unknown:true},reorder={...object,files:[...object.files].reverse()},badBase64=structuredClone(object);badBase64.files[0].rawBase64='!'+badBase64.files[0].rawBase64.slice(1);
  const variants=[Buffer.alloc(0),Buffer.concat([exact,Buffer.from(' ')]),Buffer.alloc(1048577),Buffer.from(json.replace('schemaVersion','schemaversion')),Buffer.from(json.replace('"symbol":"'+symbol+'"','"symbol":"'+symbol+'","symbol":"'+symbol+'"')),Buffer.from(canonical(unknown)),Buffer.from(canonical(reorder)),Buffer.from(canonical(badBase64)),material(symbol==='2409'?'2383':'2409')];
  const parse=JSON.parse;let parses=0;try{JSON.parse=()=>{parses++;throw Error('parse_before_authentication');};for(const variant of variants)assert.throws(()=>project(symbol,variant),/projection_invalid/);assert.equal(parses,0);}finally{JSON.parse=parse;}
 }
});
test('owned carrier snapshot survives caller mutation after copying and preserves old projection hashes',()=>{
 for(const symbol of ['2409','2383']){
  const expected=call(symbol),carrier=material(symbol);let checks=0;
  const actual=project(symbol,carrier,{check(){if(++checks===2)carrier.fill(0);}});
  assert.deepEqual(actual,expected);assert.ok(carrier.every(v=>v===0));
 }
});
test('all allocated carrier/decode buffers are wiped on success and every cooperative deadline failure',async()=>{
 const allocated=[],from=Buffer.from,set=Uint8Array.prototype.set;
 let observed;
 try{
  Buffer.from=function(value,encoding,...rest){const result=from.call(Buffer,value,encoding,...rest);if(encoding==='base64')allocated.push(result);return result;};
  Uint8Array.prototype.set=function(...args){allocated.push(this);return set.apply(this,args);};
  observed=await import('../web/src/lib/research-historical-cash-projection.ts?cleanup-witness');
 }finally{Buffer.from=from;Uint8Array.prototype.set=set;}
 for(const symbol of ['2409','2383']){
  const carrier=material(symbol),before=Buffer.from(carrier);let total=0;
  observed.projectPinnedHistoricalCash(historicalCashPins.profile,symbol,carrier,{check(){total++;}});
  assert.equal(allocated.length,historicalCashPins.companies[symbol].files.length+1);for(const a of allocated)assert.ok(a.every(v=>v===0));allocated.length=0;
  for(let at=1;at<=total;at++){
   let n=0;assert.throws(()=>observed.projectPinnedHistoricalCash(historicalCashPins.profile,symbol,carrier,{check(){if(++n===at)throw Error('shared_deadline_expired');}}),/shared_deadline_expired/);
   for(const a of allocated)assert.ok(a.every(v=>v===0));allocated.length=0;assert.deepEqual(carrier,before);
  }
  const drift=Buffer.from(carrier);drift[0]^=1;assert.throws(()=>observed.projectPinnedHistoricalCash(historicalCashPins.profile,symbol,drift,{check(){}}),/projection_invalid/);assert.equal(allocated.length,1);assert.ok(allocated[0].every(v=>v===0));allocated.length=0;
 }
});
