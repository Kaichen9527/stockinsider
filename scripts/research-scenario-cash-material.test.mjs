import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{gunzipSync}from'node:zlib';import{createHash}from'node:crypto';
import{projectScenarioCashMaterial as project}from'../web/src/lib/research-scenario-cash-material.ts';
import{historicalCashPins as pins}from'../web/src/lib/research-historical-cash-pins.ts';
const packed=fs.readFileSync(new URL('./fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(packed).digest('hex'),'afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f');
const fixture=JSON.parse(gunzipSync(packed,{maxOutputLength:2000000})),raw=new Map(fixture.files.map(f=>[f.pin.path,Buffer.from(f.rawBase64,'base64')]));
function canonical(v){if(Array.isArray(v))return`[${v.map(canonical).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;return JSON.stringify(v);}
const material=(symbol,change=()=>{})=>{const o={schemaVersion:'historical-cash-private-byte-material-v1',financialProfile:pins.profile,symbol,files:pins.companies[symbol].files.map(p=>({path:p.path,rawBase64:raw.get(p.path).toString('base64')}))};change(o);return Buffer.from(canonical(o));};
const clock=()=>new Date().toISOString(),call=(s,bytes=material(s),now=clock(),deadline={check(){}})=>project(pins.profile,s,bytes,now,deadline);
const metrics=['revenue','grossProfit','operatingExpenses','operatingProfit','nonOperating','pretaxProfit','taxExpense','netProfit','nonControllingNetProfit','ownersNetProfit','ordinaryWeightedSharesMillionAssumed','potentialWeightedSharesMillionAssumed','potentialIncludedMillion','antiDilutiveExcludedMillion','dilutedSharesMillionAssumed','basicEpsConditional','dilutedEpsConditional'];
for(const symbol of ['2409','2383']){
 test(`${symbol} actual full scenario calculations match all retained model quarter values and cash`,()=>{
  const now=clock(),bytes=material(symbol),before=Buffer.from(bytes),r=call(symbol,bytes,now),model=JSON.parse(raw.get(pins.companies[symbol].files[0].path));
  assert.deepEqual(bytes,before);assert.equal(r.projection.clocks.originalModelCutoff,model.originalModelAsOf);assert.equal(r.projection.clocks.inputArtifactAsOf,model.asOf);assert.equal(r.projection.clocks.currentLocalReadKnownAt,now);assert.equal(r.artifactReadKnownAt,now);
  assert.equal(r.projection.projected.originalModelCutoff,model.originalModelAsOf);assert.equal(r.calculation.originalModelCutoff,model.originalModelAsOf);assert.equal(r.projection.projected.observations.length,pins.companies[symbol].files.length-1);
  assert.equal(r.projection.historicalCash.projectionSha256,symbol==='2409'?'b59bd42321ac7e9af6c3fcd1eba86fa359f2537d467a45e8fbef244e442c434d':'a1965a0f56556c4c4b50f89f7f96ef263b6fd7b6aec529c919cce3b8bfa585d7');
  let comparisons=0;for(let s=0;s<3;s++)for(let q=0;q<6;q++){
   const actual=r.calculation.scenarios[s].quarters[q],expected=model.scenarios[s].quarters[q];assert.equal(actual.period,expected.period);
   for(const key of metrics){assert.ok(Math.abs(actual[key]-expected[key])<1e-6,`${symbol}/${s}/${q}/${key}: ${actual[key]} vs ${expected[key]}`);comparisons++;}
  }assert.equal(comparisons,306);
  assert.equal(r.calculation.scenarios[0].calendarActualPlusForecast.status,'incomplete');
  assert.ok(r.projection.reportedFacts.length+r.projection.monthlyFacts.length+1<=64);assert.ok(Buffer.byteLength(JSON.stringify(r.projection))<=160000);assert.ok(Buffer.byteLength(JSON.stringify(r))<=262144);
  for(const key of ['sourceClosureApproved','legacyV2ExecutionClaimed','filesystemCustodyVerified','sourcePublicationVerified','financialVerified','dispatchReady','modelDispatched','publishableResearch','researchQualified','historicalPITEligible','strategyApproved','entryEligible','published','valuationApproved','technicalAdmission'])assert.equal(r[key],false,key);
  assert.equal(r.forecastCash,null);assert.equal(r.noFutureCash,true);assert.ok(!JSON.stringify(r).includes('/Users/')&&!JSON.stringify(r).includes('retainedPdfLocalPath'));
  assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.projection)&&Object.isFrozen(r.calculation.scenarios[0].quarters));
 });
 test(`${symbol} source bytes cannot be substituted even with coherent edited numbers`,()=>{
  for(const file of pins.companies[symbol].files){const bad=material(symbol,o=>{const item=o.files.find(x=>x.path===file.path),b=Buffer.from(item.rawBase64,'base64');b[0]^=1;item.rawBase64=b.toString('base64');});assert.throws(()=>call(symbol,bad),/material_invalid/);}
  assert.throws(()=>call(symbol,material(symbol,o=>o.files.reverse())),/material_invalid/);assert.throws(()=>call(symbol,material(symbol==='2409'?'2383':'2409')),/material_invalid/);
 });
 test(`${symbol} each cooperative deadline exception rejects and preserves caller bytes`,()=>{
  const bytes=material(symbol),before=Buffer.from(bytes),now=clock();let count=0;call(symbol,bytes,now,{check(){count++;}});
  for(let at=1;at<=count;at++){let n=0;assert.throws(()=>call(symbol,bytes,now,{check(){if(++n===at)throw Error('shared_deadline_expired');}}),/shared_deadline_expired/);assert.deepEqual(bytes,before);}
 });
}
test('invalid profile/company/clock reject before material access',()=>{
 const bytes=new Proxy({},{get(){throw Error('material_getter');},ownKeys(){throw Error('material_ownKeys');}}),d={check(){}};
 for(const [profile,symbol,now]of [['unknown','2409',clock()],[pins.profile,'5347',clock()],[pins.profile,'2409','2099-01-01T00:00:00Z'],[pins.profile,'2409','2026-10-14T08:30:00.000000001Z'],[pins.profile,'2409',{}]])assert.throws(()=>project(profile,symbol,bytes,now,d),/material_invalid/);
 for(const symbol of ['2409','2383'])assert.throws(()=>call(symbol,material(symbol),'2026-10-13T00:00:00Z'),/material_invalid/);
});
test('all old Maps and hostile views fail or remain unread metadata under fixed byte-only domain',()=>{
 for(const symbol of ['2409','2383']){
  assert.throws(()=>call(symbol,new Map()),/material_invalid/);
  const bytes=material(symbol);let reads=0;for(let i=0;i<10000;i++)Object.defineProperty(bytes,`extra_${i}`,{get(){reads++;throw Error('metadata_getter');}});
  for(const key of ['length','byteLength','buffer',Symbol.iterator])Object.defineProperty(bytes,key,{get(){reads++;throw Error('view_getter');}});
  assert.doesNotThrow(()=>call(symbol,bytes));assert.equal(reads,0);
 }
});
test('outer carrier and decoded buffers are actually wiped on success and all deadline failures',async()=>{
 const allocations=[],set=Uint8Array.prototype.set,from=Buffer.from;let observed;
 try{Uint8Array.prototype.set=function(...args){allocations.push(this);return set.apply(this,args);};Buffer.from=function(value,encoding,...rest){const v=from.call(Buffer,value,encoding,...rest);if(encoding==='base64')allocations.push(v);return v;};observed=await import('../web/src/lib/research-scenario-cash-material.ts?cleanup-witness');}
 finally{Uint8Array.prototype.set=set;Buffer.from=from;}
 allocations.length=0;
 for(const symbol of ['2409','2383']){
  const bytes=material(symbol),before=Buffer.from(bytes),now=clock();let count=0;
  observed.projectScenarioCashMaterial(pins.profile,symbol,bytes,now,{check(){count++;}});assert.equal(allocations.length,pins.companies[symbol].files.length+1);for(const b of allocations)assert.ok(b.every(v=>v===0));allocations.length=0;
  for(let at=1;at<=count;at++){let n=0;assert.throws(()=>observed.projectScenarioCashMaterial(pins.profile,symbol,bytes,now,{check(){if(++n===at)throw Error('shared_deadline_expired');}}),/shared_deadline_expired/);for(const b of allocations)assert.ok(b.every(v=>v===0));allocations.length=0;assert.deepEqual(bytes,before);}
 }
});
