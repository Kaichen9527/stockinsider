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
const call=(symbol,files=input(symbol),deadline={check(){}})=>projectPinnedHistoricalCash('oct14_historical_cash_v1',symbol,files,deadline);
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
test('native map and typed-array brands are bounded; accessors do not substitute pinned byte lengths',()=>{
 const files=input('2409');files.get=()=>{throw Error('getter_accessed');};assert.throws(()=>call('2409',files),/projection_invalid/);
 const bad=input('2409'),first=[...bad.keys()][0];bad.set(first,new DataView(new ArrayBuffer(1)));assert.throws(()=>call('2409',bad),/projection_invalid/);
 const native=input('2409');const b=native.get(first);Object.defineProperty(b,'byteLength',{get(){throw Error('own_byteLength_accessed');}});assert.doesNotThrow(()=>call('2409',native));
 assert.ok(Object.isFrozen(historicalCashPins)&&Object.isFrozen(historicalCashPins.companies['2409'].files));
});
test('each projected row carries exact two-period packet/model locators and private source-line hashes',()=>{
 for(const symbol of ['2409','2383']){
  const result=call(symbol),packet=JSON.parse(bytes.get(historicalCashPins.packetPath)),issuer=packet.issuers.find(i=>i.stock===symbol);
  for(const ref of result.references){assert.deepEqual(ref.values,issuer.facts[ref.metric].values);assert.equal(ref.sourceLineSha256,createHash('sha256').update(issuer.facts[ref.metric].sourceLine).digest('hex'));assert.equal(ref.unit,'TWD_thousands');assert.equal(ref.periodKind,'half_year_cumulative');assert.match(ref.packetLocator.jsonPointer,new RegExp(`/facts/${ref.metric}/values$`));}
 }
});
