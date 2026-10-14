// Independent readonly probes of exact06ae. No production API or fixture edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root='/tmp/si-pubtail-o14'; const base=pathToFileURL(root+'/web/src/lib/');
const {historicalCashPins:pins}=await import(new URL('research-historical-cash-pins.ts',base));
const {projectPinnedHistoricalCash:project}=await import(new URL('research-historical-cash-projection.ts',base));
const sha=x=>createHash('sha256').update(x).digest('hex');
const canon=v=>Array.isArray(v)?'['+v.map(canon).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v);
const gz=fs.readFileSync(root+'/scripts/fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz');
assert.equal(sha(gz),'afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f');
const expanded=gunzipSync(gz,{maxOutputLength:2000000});const fixture=JSON.parse(expanded);
const report={subject:'06ae6924a7d6a90d60d3161a154fdb5104aab3f1',node:process.version,fixture:{gzipBytes:gz.length,sha256:sha(gz),expandedBytes:expanded.length},gitSources:[],companies:[],cases:[],cleanup:[]};
const record=(name,data={})=>report.cases.push({name,pass:true,...data});
for(const f of fixture.files){const raw=Buffer.from(f.rawBase64,'base64'); const git=execFileSync('git',['show',`${pins.sourceCommit}:${f.pin.path}`],{cwd:root,maxBuffer:1048576}); assert.equal(raw.length,f.pin.bytes);assert.equal(sha(raw),f.pin.sha256);assert.ok(raw.equals(git));report.gitSources.push({path:f.pin.path,bytes:raw.length,sha256:sha(raw),gitBytesEqual:true});raw.fill(0);git.fill(0);}
const carriers={};
for(const symbol of ['2409','2383']){
 const selected=pins.companies[symbol],files=selected.files.map(p=>{const f=fixture.files.filter(f=>f.pin.path===p.path);assert.equal(f.length,1);assert.deepEqual(f[0].pin,p);return {path:p.path,rawBase64:f[0].rawBase64};});
 const c=Buffer.from(canon({schemaVersion:'historical-cash-private-byte-material-v1',financialProfile:pins.profile,symbol,files})); carriers[symbol]=c;
 assert.equal(c.length,selected.carrier.bytes);assert.equal(sha(c),selected.carrier.sha256);
 const expected=project(pins.profile,symbol,c,{check(){}}); const expectedHash=symbol==='2409'?'b59bd42321ac7e9af6c3fcd1eba86fa359f2537d467a45e8fbef244e442c434d':'a1965a0f56556c4c4b50f89f7f96ef263b6fd7b6aec529c919cce3b8bfa585d7';assert.equal(expected.projectionSha256,expectedHash);
 const out=JSON.stringify(expected);assert.ok(Buffer.byteLength(out)<=160000);assert.ok(!out.includes('sourceLine":')&&!out.includes('/Users/')&&!out.includes('retainedPdfLocalPath'));
 report.companies.push({symbol,files:files.length,carrierBytes:c.length,carrierSHA256:sha(c),rawBytes:selected.files.reduce((n,f)=>n+f.bytes,0),outputBytes:Buffer.byteLength(out),projectionSha256:expected.projectionSha256});
 // All old Map shapes, including correct source bytes, must fail without user access.
 for(const shape of ['valid','valid+10000props','10000entries','empty']){
  const m=shape==='empty'?new Map():shape==='10000entries'?new Map(Array.from({length:10000},(_,i)=>[i,0])):new Map(files.map(f=>[f.path,Buffer.from(f.rawBase64,'base64')]));
  let touches=0; if(shape.includes('props'))for(let i=0;i<10000;i++)Object.defineProperty(m,'u'+i,{get(){touches++;throw Error('getter');}});
  Object.defineProperty(m,Symbol.iterator,{get(){touches++;throw Error('iterator');}});
  const ent=Map.prototype.entries,keys=Reflect.ownKeys;
  try{Map.prototype.entries=function(){if(this===m){touches++;throw Error('entries');}return ent.call(this);};Reflect.ownKeys=function(v){if(v===m){touches++;throw Error('keys');}return keys(v);};assert.throws(()=>project(pins.profile,symbol,m,{check(){}}),/projection_invalid/);assert.equal(touches,0);}finally{Map.prototype.entries=ent;Reflect.ownKeys=keys;}
  record(symbol+':Map:'+shape,{touches});
 }
 // Do not rely only on different lengths to show pre-parse authentication.
 const same=Buffer.from(c);same[Math.floor(same.length/2)]^=1;
 const parsed=JSON.parse(c); const reorder=Buffer.from(canon({...parsed,files:[...parsed.files].reverse()}));assert.equal(reorder.length,c.length);
 const changedKey=Buffer.from(c.toString().replace('schemaVersion','schemaversion'));assert.equal(changedKey.length,c.length);
 const variants=[['sameLengthByte',same],['sameLengthReorder',reorder],['sameLengthUnknownKey',changedKey],['oversize',new Uint8Array(1048577)],['short',c.subarray(1)]];
 const parse=JSON.parse,decode=TextDecoder.prototype.decode;let parses=0,decodes=0;
 try{JSON.parse=()=>{parses++;throw Error('parse');};TextDecoder.prototype.decode=function(){decodes++;throw Error('decode');};for(const [name,v]of variants){assert.throws(()=>project(pins.profile,symbol,v,{check(){}}),/projection_invalid/);record(symbol+':preparse:'+name);}assert.equal(parses,0);assert.equal(decodes,0);}finally{JSON.parse=parse;TextDecoder.prototype.decode=decode;}
 for(const kind of ['Buffer','Uint8Array','offsetView']){
  const v=kind==='Buffer'?Buffer.from(c):kind==='Uint8Array'?new Uint8Array(c):new Uint8Array(new ArrayBuffer(c.length+16),8,c.length);if(kind==='offsetView')v.set(c);
  let touches=0;for(const k of ['byteLength','buffer','length','constructor','toJSON',Symbol.iterator])Object.defineProperty(v,k,{get(){touches++;throw Error('view getter');}});
  assert.equal(project(pins.profile,symbol,v,{check(){}}).projectionSha256,expectedHash);assert.equal(touches,0);record(symbol+':view:'+kind,{touches});
 }
 const detached=new Uint8Array(c);structuredClone(detached.buffer,{transfer:[detached.buffer]});
 const invalid=[['shared',new Uint8Array(new SharedArrayBuffer(c.length))],['resizable',new Uint8Array(new ArrayBuffer(c.length,{maxByteLength:c.length+1}))],['detached',detached],['DataView',new DataView(new ArrayBuffer(c.length))],['clamped',new Uint8ClampedArray(c)]];
 for(const [name,v]of invalid){assert.throws(()=>project(pins.profile,symbol,v,{check(){}}));record(symbol+':reject:'+name);}
 let traps=0;const proxy=new Proxy(c,{get(){traps++;throw Error('proxy get');},getPrototypeOf(){traps++;throw Error('proxy proto');},ownKeys(){traps++;throw Error('proxy ownkeys');}});assert.throws(()=>project(pins.profile,symbol,proxy,{check(){}}));assert.equal(traps,0);record(symbol+':reject:proxy',{traps});
 const mutable=Buffer.from(c);let checks=0;const stable=project(pins.profile,symbol,mutable,{check(){if(++checks===2)mutable.fill(0);}});assert.deepEqual(stable,expected);record(symbol+':ownedMutationIsolation');
}
// Capture actual buffers allocated by separately imported exact runtime; exclude loader phase explicitly.
const allocated=[];const originalFrom=Buffer.from,originalSet=Uint8Array.prototype.set;let observed;
try{Buffer.from=function(v,enc,...rest){const r=originalFrom.call(Buffer,v,enc,...rest);if(enc==='base64')allocated.push(r);return r;};Uint8Array.prototype.set=function(...args){allocated.push(this);return originalSet.apply(this,args);};observed=await import(new URL('research-historical-cash-projection.ts?independent06ae',base));}finally{Buffer.from=originalFrom;Uint8Array.prototype.set=originalSet;}
const loaderAllocations=allocated.length;allocated.length=0;
for(const symbol of ['2409','2383']){
 const c=carriers[symbol],callerHash=sha(c);let checkpoints=0,wiped=0;
 observed.projectPinnedHistoricalCash(pins.profile,symbol,c,{check(){checkpoints++;}});assert.equal(allocated.length,pins.companies[symbol].files.length+1);for(const b of allocated){assert.ok(b.every(v=>v===0));wiped++;}allocated.length=0;
 for(let at=1;at<=checkpoints;at++){let n=0;assert.throws(()=>observed.projectPinnedHistoricalCash(pins.profile,symbol,c,{check(){if(++n===at)throw Error('review_deadline');}}),/review_deadline/);for(const b of allocated){assert.ok(b.every(v=>v===0));wiped++;}allocated.length=0;assert.equal(sha(c),callerHash);}
 const drift=Buffer.from(c);drift[0]^=1;assert.throws(()=>observed.projectPinnedHistoricalCash(pins.profile,symbol,drift,{check(){}}));assert.equal(allocated.length,1);assert.ok(allocated[0].every(v=>v===0));allocated.length=0;
 const oversize=new Uint8Array(1048577);assert.throws(()=>observed.projectPinnedHistoricalCash(pins.profile,symbol,oversize,{check(){}}));assert.equal(allocated.length,0);
 report.cleanup.push({symbol,checkpoints,deadlineFailures:checkpoints,successAndDeadlineBuffersWiped:wiped,hashFailureCarrierWiped:true,oversizeNoCopy:true,callerUnchanged:true});
}
report.loaderAllocationsExcluded=loaderAllocations;report.caseCount=report.cases.length;report.maxRSSKiB=process.resourceUsage().maxRSS;console.log(JSON.stringify(report,null,2));
