import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';
const root='/tmp/si-pubtail-o14';const url=n=>'file://'+root+'/web/src/lib/'+n+'.ts';
const {projectScenarioCashMaterial:project}=await import(url('research-scenario-cash-material'));
const {historicalCashPins:pins}=await import(url('research-historical-cash-pins'));
const {financialInstant:instant}=await import(url('research-financial-clock'));
const gz=fs.readFileSync(root+'/scripts/fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz');
const sha=x=>createHash('sha256').update(x).digest('hex');assert.equal(sha(gz),'afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f');
const fixture=JSON.parse(gunzipSync(gz,{maxOutputLength:2000000}));const raw=new Map();const fileEquality=[];
for(const f of fixture.files){const b=Buffer.from(f.rawBase64,'base64');assert.equal(sha(b),f.pin.sha256);assert.equal(b.length,f.pin.bytes);const original=execFileSync('git',['show','15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb:'+f.pin.path],{cwd:root,maxBuffer:1048576});assert.deepEqual(b,original);raw.set(f.pin.path,b);fileEquality.push({file:f.pin.path,bytes:b.length,sha256:sha(b)});}
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const carrier=s=>Buffer.from(canonical({schemaVersion:'historical-cash-private-byte-material-v1',financialProfile:pins.profile,symbol:s,files:pins.companies[s].files.map(p=>({path:p.path,rawBase64:raw.get(p.path).toString('base64')}))}));
const depth=v=>v&&typeof v==='object'?1+Math.max(0,...Object.values(v).map(depth)):0;
const packet=JSON.parse(raw.get(pins.packetPath)), now=new Date().toISOString(),counts={boundaryAssertions:0,numericComparisons:0,locatorComparisons:0},results=[];
const no=(fn,pattern)=>{assert.throws(fn,pattern);counts.boundaryAssertions++;};
for(const symbol of ['2409','2383']){
 const b=carrier(symbol);assert.equal(b.length,pins.companies[symbol].carrier.bytes);assert.equal(sha(b),pins.companies[symbol].carrier.sha256);
 const run=(input=b,clock=now,deadline={check(){}})=>project(pins.profile,symbol,input,clock,deadline);
 const value=run(),model=JSON.parse(raw.get(pins.companies[symbol].files[0].path));
 const qmetrics=['revenue','grossProfit','operatingExpenses','operatingProfit','nonOperating','pretaxProfit','taxExpense','netProfit','nonControllingNetProfit','ownersNetProfit','ordinaryWeightedSharesMillionAssumed','potentialWeightedSharesMillionAssumed','potentialIncludedMillion','antiDilutiveExcludedMillion','dilutedSharesMillionAssumed','basicEpsConditional','dilutedEpsConditional'];
 let maxDelta=0;for(let s=0;s<3;s++)for(let q=0;q<6;q++)for(const m of qmetrics){const delta=Math.abs(value.calculation.scenarios[s].quarters[q][m]-model.scenarios[s].quarters[q][m]);maxDelta=Math.max(maxDelta,delta);assert.ok(delta<1e-6);counts.numericComparisons++;}
 const pointer=(obj,p)=>p.split('/').slice(1).reduce((a,k)=>a[k.replaceAll('~1','/').replaceAll('~0','~')],obj);
 for(const fact of [...value.projection.reportedFacts,...value.projection.monthlyFacts]){const file=JSON.parse(raw.get(fact.locator.file));assert.equal(fact.value,pointer(file,fact.locator.jsonPointer));assert.equal(sha(raw.get(fact.locator.file)),fact.locator.fileSha256);assert.equal(fact.locallyReadAt,now);counts.locatorComparisons++;}
 assert.equal(value.projection.monthlyFacts.length,3);assert.equal(value.projection.monthlyBridge.namedOperands.length,3);assert.equal(value.projection.monthlyBridge.value,symbol==='2409'?66876:60884.517);
 assert.equal(value.projection.projected.originalModelCutoff,model.originalModelAsOf);assert.equal(value.projection.clocks.inputArtifactAsOf,packet.extractionAvailableAt);
 const packetObs=value.projection.projected.observations.find(x=>x.sourceArtifactHash===sha(raw.get(pins.packetPath)));assert.equal(packetObs.observedAt,packet.extractionAvailableAt);
 assert.equal(value.projection.historicalCash.calculation.rows[0].ratio.denominator,value.projection.historicalCash.calculation.rows[0].operands.netProfit);
 assert.equal(value.projection.historicalCash.forecastCash,null);assert.equal(value.calculation.scenarios[0].calendarActualPlusForecast.status,'incomplete');
 const str=JSON.stringify(value);for(const bad of ['sourceLine":','retainedPdfLocalPath','/Users/'])assert.equal(str.includes(bad),false);
 assert.ok(Buffer.byteLength(str)<=262144);assert.ok(Buffer.byteLength(JSON.stringify(value.projection))<=160000);assert.ok(depth(value)<=12);
 results.push({symbol,carrierBytes:b.length,carrierSha256:sha(b),resultBytes:Buffer.byteLength(str),projectionBytes:Buffer.byteLength(JSON.stringify(value.projection)),maxObjectDepth:depth(value),maxQuarterDelta:maxDelta,cashHash:value.projection.historicalCash.projectionSha256,reportedFacts:value.projection.reportedFacts.length,monthlyFacts:3,originalCutoff:model.originalModelAsOf,artifactAsOf:model.asOf,readAt:now});
 // Whole byte drift must be rejected without any JSON.parse invocation.
 const drift=Buffer.from(b);drift[drift.length-2]^=1;const parse=JSON.parse;let parsed=0;try{JSON.parse=(...a)=>{parsed++;return parse(...a);};no(()=>run(drift),/material_invalid/);assert.equal(parsed,0);}finally{JSON.parse=parse;}
 let touched=0;const hidden=Buffer.from(b);for(const key of ['length','byteLength','buffer','constructor','toJSON','slice',Symbol.iterator,...Array.from({length:10000},(_,i)=>'hidden_'+i)])Object.defineProperty(hidden,key,{get(){touched++;throw Error('caller_property');}});
 assert.equal(run(hidden).scenarioInputHash,value.scenarioInputHash);assert.equal(touched,0);counts.boundaryAssertions++;
 const proxy=new Proxy(b,{get(){touched++;throw Error('proxy');},ownKeys(){touched++;throw Error('proxy');},getPrototypeOf(){touched++;throw Error('proxy');}});
 for(const input of [proxy,new DataView(b.buffer),new Uint8ClampedArray(b),new Uint8Array(new SharedArrayBuffer(b.length)),new Uint8Array(new ArrayBuffer(b.length,{maxByteLength:b.length+1})),new Map(),new Uint8Array(b.length+1)])no(()=>run(input));
 const detached=new Uint8Array(b);structuredClone(detached.buffer,{transfer:[detached.buffer]});no(()=>run(detached));assert.equal(touched,0);
 const wrapped=new Uint8Array(b.length+2);wrapped.set(b,1);assert.equal(run(wrapped.subarray(1,-1)).projectionHash,value.projectionHash);counts.boundaryAssertions++;
 const mutate=Buffer.from(b);let checks=0;assert.equal(run(mutate,now,{check(){if(++checks===2)mutate.fill(0);}}).projectionHash,value.projectionHash);assert.ok(mutate.every(v=>v===0));counts.boundaryAssertions++;
 for(const clock of ['2026-02-30T00:00:00Z','2026-10-13T00:00:00Z',new Date(Date.now()+60000).toISOString(),now.replace('Z','+00:00'),now.replace('Z','0001Z')])no(()=>run(b,clock));
 const floor=packet.extractionAvailableAt;assert.equal(run(b,floor).artifactReadKnownAt,floor);counts.boundaryAssertions++;
 // Precisely one microsecond below floor rejects while preserving the original input.
 const n=instant(floor)-1000n,seconds=n/1000000000n,micro=(n%1000000000n)/1000n;
 const prior=new Date(Number(seconds)*1000).toISOString().slice(0,19)+'.'+micro.toString().padStart(6,'0')+'Z';no(()=>run(b,prior),/material_invalid/);
 let total=0;run(b,now,{check(){total++;}});let point=0;no(()=>run(b,now,{check(){if(++point===total)throw Error('last_deadline');}}),/last_deadline/);
}
// Capture NEW outer module native allocations, after module loader settles.
const allocated=[],set=Uint8Array.prototype.set,from=Buffer.from;let audited;
try{Uint8Array.prototype.set=function(...args){allocated.push(this);return set.apply(this,args);};Buffer.from=function(v,encoding,...rest){const result=from.call(Buffer,v,encoding,...rest);if(encoding==='base64')allocated.push(result);return result;};audited=await import(url('research-scenario-cash-material')+'?independent-wipe');}finally{Uint8Array.prototype.set=set;Buffer.from=from;}
allocated.length=0;const wipes=[];
for(const symbol of ['2409','2383']){
 const b=carrier(symbol),saved=Buffer.from(b);let total=0;audited.projectScenarioCashMaterial(pins.profile,symbol,b,now,{check(){total++;}});const successOwned=allocated.length;assert.equal(successOwned,pins.companies[symbol].files.length+1);assert.ok(allocated.every(a=>a.every(n=>n===0)));allocated.length=0;
 let wipeCount=0;for(let stop=1;stop<=total;stop++){let n=0;no(()=>audited.projectScenarioCashMaterial(pins.profile,symbol,b,now,{check(){if(++n===stop)throw Error('independent_deadline');}}),/independent_deadline/);for(const a of allocated){assert.ok(a.every(n=>n===0));wipeCount++;}allocated.length=0;assert.deepEqual(b,saved);}
 wipes.push({symbol,deadlineCheckpoints:total,successOwned,failedCallBuffersVerifiedZero:wipeCount});
}
console.log(JSON.stringify({subject:'e8de7d76c852d86d6383f52f10c7aad74b9fa1f3',node:process.version,counts,results,wipes,originalSourceFiles:fileEquality},null,2));
