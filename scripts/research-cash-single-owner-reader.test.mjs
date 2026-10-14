import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { historicalCashPins as pins } from '../web/src/lib/research-historical-cash-pins.ts';
import { createCandidateFinancialReaders as create } from '../web/src/lib/research-cash-financial-reader.ts';
import { FinancialIoDeadline as Deadline, financialIoStatus as status } from '../web/src/lib/research-financial-io-owner.ts';
const gzip=fs.readFileSync(new URL('./fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(gzip).digest('hex'),'afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f');
const fixture=JSON.parse(gunzipSync(gzip,{maxOutputLength:2000000}));
const originals=new Map(fixture.files.map(f=>[f.pin.path,Buffer.from(f.rawBase64,'base64')]));
const root=fs.mkdtempSync('/workspace/.cash-owner-fixture-');fs.chmodSync(root,0o700);
for(const [name,raw]of originals){fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true,mode:0o700});fs.writeFileSync(path.join(root,name),raw,{mode:0o600});}
const io={lstat:fsp.lstat,open:fsp.open};const reader=create(root),profile=pins.profile;
const sha=v=>createHash('sha256').update(v).digest('hex');
const legacyPin=pins.companies['2383'].files[0];
const legacy=()=>reader.legacy([legacyPin]);
const cash=s=>reader.historicalCash(profile,s);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const short=()=>{const d=new Deadline();Object.defineProperty(d,'end',{value:performance.now()+30});return d;};
async function settle(){const end=performance.now()+2000;while(!status().cleanupComplete&&performance.now()<end)await new Promise(r=>setTimeout(r,5));assert.equal(status().cleanupComplete,true,JSON.stringify(status()));}
const restore=name=>fs.writeFileSync(path.join(root,name),originals.get(name),{mode:0o600});
const cleanStatus=()=>assert.deepEqual(status(),{cleanupComplete:true,recoveryRequired:false,pendingOperations:0,unconfirmedHandles:0,ownedBuffers:0,cleanupFailed:false,kernelIoCancellationConfirmed:false});
const hashes=['b59bd42321ac7e9af6c3fcd1eba86fa359f2537d467a45e8fbef244e442c434d','a1965a0f56556c4c4b50f89f7f96ef263b6fd7b6aec529c919cce3b8bfa585d7'];
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
for(const[symbol,expected]of [['2409',hashes[0]],['2383',hashes[1]]]){
 test(`${symbol} actual secure FS complete profile, exact output and unchanged original bytes`,async()=>{
  const result=await cash(symbol);assert.equal(result.projection.projectionSha256,expected);assert.equal(Buffer.byteLength(JSON.stringify(result.projection)),symbol==='2409'?52077:32598);
  assert.equal(result.readerReceipt.files,symbol==='2409'?9:7);assert.equal(result.readerReceipt.cleanupComplete,true);
  assert.equal(result.projection.filesystemCustodyVerified,false);assert.equal(result.projection.sourcePublicationVerified,false);assert.equal(result.projection.entryEligible,false);assert.equal(result.projection.forecastCash,null);
  for(const p of pins.companies[symbol].files)assert.equal(sha(fs.readFileSync(path.join(root,p.path))),p.sha256);cleanStatus();
 });
 test(`${symbol} each file content, length, omission, symlink, nlink and replacement reject`,async()=>{
  for(const p of pins.companies[symbol].files){const name=path.join(root,p.path);const original=originals.get(p.path);
   const drift=Buffer.from(original);drift[0]^=1;fs.writeFileSync(name,drift);await assert.rejects(cash(symbol),/financial_file_hash_or_length/);restore(p.path);
   fs.appendFileSync(name,' ');await assert.rejects(cash(symbol),/financial_file_invalid/);restore(p.path);
   fs.unlinkSync(name);await assert.rejects(cash(symbol),/ENOENT/);restore(p.path);
   const target=path.join(root,'retained-source.json');fs.writeFileSync(target,original,{mode:0o600});fs.unlinkSync(name);fs.symlinkSync(target,name);await assert.rejects(cash(symbol),/financial_file_invalid/);fs.unlinkSync(name);restore(p.path);fs.unlinkSync(target);
   const link=path.join(root,'link.json');fs.linkSync(name,link);await assert.rejects(cash(symbol),/financial_file_invalid/);fs.unlinkSync(link);
   const r=create(root,{...io,checkpoint(label){if(label==='before_open:'+p.path){fs.unlinkSync(name);restore(p.path);}}});await assert.rejects(r.historicalCash(profile,symbol),/financial_file_replaced/);cleanStatus();
  }
 });
}
test('legacy <=8 compatible parsed facade rejects9 before any IO; unknown/crossissuer cannot select paths',async()=>{
 const r=await reader.legacy(pins.companies['2383'].files);assert.equal(r.records.size,7);assert.equal(r.records.get(legacyPin.path).value.symbol,'2383');
 let calls=0;const denied=create(root,{lstat(){calls++;throw Error('io');},open(){calls++;throw Error('io');}});
 await assert.rejects(denied.legacy(pins.companies['2409'].files),/inventory_invalid/);
 for(const[p,s]of [['unknown','2409'],[profile,'9999'],[profile,{symbol:'2409'}]])await assert.rejects(denied.historicalCash(p,s),/profile_invalid/);assert.equal(calls,0);cleanStatus();
});
test('world writable ancestor genuinely rejected, no /tmp exception',async()=>{
 const r=create('/tmp/'+path.basename(root));await assert.rejects(r.legacy([legacyPin]),/parent_invalid/);cleanStatus();
});
test('FIFO leaf and replacement FIFO bounded by NONBLOCK; no unconfirmed success',async()=>{
 const name=path.join(root,legacyPin.path);fs.unlinkSync(name);execFileSync('mkfifo',[name]);await assert.rejects(legacy(),/file_invalid/);fs.unlinkSync(name);restore(legacyPin.path);
 const r=create(root,{...io,checkpoint(label){if(label==='before_open:'+legacyPin.path){fs.unlinkSync(name);execFileSync('mkfifo',[name]);}}});
 await assert.rejects(r.legacy([legacyPin]),/file_invalid/);fs.unlinkSync(name);restore(legacyPin.path);cleanStatus();
});
test('parent rename and ninth-file namespace substitution rejects all-profile success',async()=>{
 const dirname=path.dirname(path.join(root,legacyPin.path));const moved=dirname+'-moved';
 const r=create(root,{...io,checkpoint(label){if(label==='after_read:'+legacyPin.path){fs.renameSync(dirname,moved);fs.mkdirSync(dirname,{mode:0o700});}}});
 await assert.rejects(r.legacy([legacyPin]),/parent_replaced|ENOENT/);fs.rmdirSync(dirname);fs.renameSync(moved,dirname);
 const nine=pins.companies['2409'].files;const first=nine[0].path,last=nine.at(-1).path;
 const r9=create(root,{...io,checkpoint(label){if(label==='after_read:'+last){const name=path.join(root,first);fs.unlinkSync(name);restore(first);}}});await assert.rejects(r9.historicalCash(profile,'2409'),/parent_replaced|file_replaced/);cleanStatus();
});
test('legacy8 -> v3 and v3 -> legacy8 share opaque owner while real FD retained',async()=>{
 for(const direction of ['legacy','cash']){
  const held=deferred(),arrived=deferred();let once=false;
  const r=create(root,{...io,checkpoint(label){if(!once&&label.startsWith('after_read:')){once=true;arrived.resolve();return held.promise;}}});
  const running=direction==='legacy'?r.legacy([legacyPin]):r.historicalCash(profile,'2409');await arrived.promise;
  await assert.rejects(direction==='legacy'?cash('2383'):legacy(),/cleanup_or_read_in_progress/);
  assert.ok(status().unconfirmedHandles>=1);held.resolve();await running;cleanStatus();
 }
});
test('query module imports cannot establish a second slot; new owner generation remains shared',async()=>{
 const again=await import('../web/src/lib/research-financial-io-owner.ts?duplicate-module');
 const held=deferred(),arrived=deferred();const r=create(root,{...io,checkpoint(){arrived.resolve();return held.promise;}});
 const running=r.legacy([legacyPin]);await arrived.promise;
 assert.throws(()=>new again.FinancialIoOwner(),/cleanup_or_read_in_progress/);assert.equal(again.financialIoStatus().cleanupComplete,false);
 held.resolve();await running;cleanStatus();
});
test('late actual open remains owned then close-once confirmed before both facades reenter',async()=>{
 const gate=deferred(),arrived=deferred();let closeCalls=0;
 const r=create(root,{...io,async open(...args){const handle=await fsp.open(...args);const close=handle.close.bind(handle);handle.close=async()=>{closeCalls++;return close();};arrived.resolve();await gate.promise;return handle;}});
 const d=short(),running=r.legacy([legacyPin],d);await arrived.promise;let failure;
 try{await running;assert.fail('success');}catch(e){failure=e;assert.match(e.message,/deadline/);assert.equal(e.financialCleanup.recoveryRequired,true);}
 await assert.rejects(cash('2383'),/cleanup_or_read_in_progress/);assert.equal(closeCalls,0);
 gate.resolve();await settle();assert.equal(closeCalls,1);assert.equal(failure.financialCleanup.kernelIoCancellationConfirmed,false);await cash('2383');await legacy();cleanStatus();
});
test('late read can write after return: retain raw ownership, wipe on settlement, close-once then restore',async()=>{
 const gate=deferred(),arrived=deferred();let raw,handle,closeCalls=0;
 const r=create(root,{...io,async open(...args){handle=await fsp.open(...args);const read=handle.read.bind(handle),close=handle.close.bind(handle);let once=true;
  handle.read=async(...a)=>{if(once){once=false;raw=a[0];arrived.resolve();await gate.promise;}return read(...a);};
  handle.close=async()=>{closeCalls++;await gate.promise;return close();};return handle;}});
 const d=short(),running=r.legacy([legacyPin],d);await arrived.promise;await assert.rejects(running,e=>e.message==='financial_deadline'&&e.financialCleanup.recoveryRequired);
 assert.ok(raw.every(x=>x===0));await assert.rejects(cash('2383'),/cleanup_or_read_in_progress/);gate.resolve();await settle();assert.ok(raw.every(x=>x===0));assert.equal(closeCalls,1);await cash('2383');cleanStatus();
});
test('normal read stalled close never success, deadline bounded and late close releases all facades',async()=>{
 const gate=deferred(),arrived=deferred();let closeCalls=0;
 const r=create(root,{...io,async open(...args){const handle=await fsp.open(...args),close=handle.close.bind(handle);handle.close=async()=>{closeCalls++;arrived.resolve();await gate.promise;return close();};return handle;}});
 const d=short(),running=r.legacy([legacyPin],d);await arrived.promise;await assert.rejects(running,e=>e.message==='financial_deadline'&&e.financialCleanup.recoveryRequired);
 await assert.rejects(legacy(),/cleanup_or_read_in_progress/);gate.resolve();await settle();assert.equal(closeCalls,1);await legacy();cleanStatus();
});
test('primary hash error plus real-FD close rejection preserves primary and recovery fence (isolated process)',()=>{
 const script=`import{open,lstat}from'node:fs/promises';import{createCandidateFinancialReaders as create}from${JSON.stringify(new URL('../web/src/lib/research-cash-financial-reader.ts',import.meta.url).href)};import{financialIoStatus}from${JSON.stringify(new URL('../web/src/lib/research-financial-io-owner.ts',import.meta.url).href)};let fd;const io={lstat,async open(...args){fd=await open(...args);const close=fd.close.bind(fd);fd.close=async()=>{await close();throw Error('synthetic_unconfirmed_close');};return fd;}};const pins=${JSON.stringify([{...legacyPin,sha256:'0'.repeat(64)}])};try{await create(${JSON.stringify(root)},io).legacy(pins);throw Error('unexpected_success');}catch(e){if(e.message!=='financial_file_hash_or_length'||!e.financialCleanup.cleanupFailed||!financialIoStatus().recoveryRequired)throw e;}try{await create(${JSON.stringify(root)}).legacy(pins);throw Error('unexpected_reentry');}catch(e){if(e.message!=='financial_cleanup_or_read_in_progress')throw e;}console.log('primary_preserved_real_fd_closed_fence_retained');`;
 const output=execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8',timeout:5000});assert.match(output,/primary_preserved_real_fd_closed_fence_retained/);cleanStatus();
});
test('all real raw buffers wipe and every actual FD is closed before successful return',async()=>{
 for(const symbol of ['2409','2383']){
  const handles=[],raws=new Set();let closes=0;
  const r=create(root,{...io,async open(...args){const h=await fsp.open(...args);handles.push(h);const read=h.read.bind(h),close=h.close.bind(h);
   h.read=(...a)=>{raws.add(a[0]);return read(...a);};h.close=async()=>{closes++;return close();};return h;}});
  const result=await r.historicalCash(profile,symbol);assert.equal(result.readerReceipt.cleanupComplete,true);assert.equal(handles.length,symbol==='2409'?9:7);assert.equal(closes,handles.length);
  for(const h of handles)await assert.rejects(h.stat(),e=>e.code==='EBADF');for(const raw of raws)assert.ok(raw.every(x=>x===0));cleanStatus();
 }
});
test('perfile/aggregate/duplicate bounds and malformed UTF8 fail without a second budget',async()=>{
 let calls=0;const denied=create(root,{lstat(){calls++;throw Error('io');},open(){calls++;throw Error('io');}});
 await assert.rejects(denied.legacy([{...legacyPin,bytes:524289}]),/pin_invalid/);
 await assert.rejects(denied.legacy([{...legacyPin,bytes:524288},{...legacyPin,path:'docs/research/b.json',bytes:524288},{...legacyPin,path:'docs/research/c.json',bytes:1}]),/read_bound/);
 await assert.rejects(denied.legacy([legacyPin,legacyPin]),/pin_invalid/);assert.equal(calls,0);
 const name='docs/research/invalid-utf8.json',file=path.join(root,name),raw=Buffer.from([0xff]);fs.writeFileSync(file,raw,{mode:0o600});
 try{await assert.rejects(reader.legacy([{path:name,bytes:1,sha256:sha(raw)}]),/encoded data was not valid/);}finally{fs.unlinkSync(file);}cleanStatus();
});
test('finite NEW source closure is exact and distinctly different from immutable historical77b1',()=>{
 const descriptor=JSON.parse(fs.readFileSync(new URL('./fixtures/research-historical-cash/new-reader-execution-closure.json',import.meta.url)));
 const rows=descriptor.files.map(p=>{const bytes=fs.readFileSync(new URL('../'+p.file,import.meta.url));assert.equal(bytes.length,p.bytes);assert.equal(sha(bytes),p.sha256);return p;});
 const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
 assert.equal(sha(canonical(rows)),descriptor.sourceClosureHash);assert.notEqual(descriptor.sourceClosureHash,descriptor.historicalLegacyClosure);assert.equal(descriptor.enabledForLiveV2,false);assert.equal(process.versions.node,descriptor.nodeVersion);
});
test('hash failure wipes every raw buffer and confirmed cleanup allows either facade',async()=>{
 const raws=new Set();const r=create(root,{...io,async open(...a){const h=await fsp.open(...a),read=h.read.bind(h);h.read=(...args)=>{raws.add(args[0]);return read(...args);};return h;}});
 await assert.rejects(r.legacy([{...legacyPin,sha256:'0'.repeat(64)}]),/hash_or_length/);for(const raw of raws)assert.ok(raw.every(x=>x===0));cleanStatus();await cash('2409');await legacy();
});
test('late open plus close failure is observed once, retains shared fence and primary deadline (child)',()=>{
 const script=`import{open,lstat}from'node:fs/promises';import{performance}from'node:perf_hooks';import{createCandidateFinancialReaders as create}from${JSON.stringify(new URL('../web/src/lib/research-cash-financial-reader.ts',import.meta.url).href)};import{FinancialIoDeadline,financialIoStatus}from${JSON.stringify(new URL('../web/src/lib/research-financial-io-owner.ts',import.meta.url).href)};let release,arrived;const gate=new Promise(r=>release=r),arrival=new Promise(r=>arrived=r);let closes=0;const io={lstat,async open(...a){const h=await open(...a),close=h.close.bind(h);h.close=async()=>{closes++;await close();throw Error('unconfirmed_late_close');};arrived();await gate;return h;}};const d=new FinancialIoDeadline();Object.defineProperty(d,'end',{value:performance.now()+30});const attempt=create(${JSON.stringify(root)},io).legacy(${JSON.stringify([legacyPin])},d);attempt.catch(()=>{});await arrival;let primary;try{await attempt;throw Error('success');}catch(e){primary=e;if(e.message!=='financial_deadline'||!e.financialCleanup.recoveryRequired)throw e;}release();for(let n=0;n<100&&!financialIoStatus().cleanupFailed;n++)await new Promise(r=>setTimeout(r,5));if(closes!==1||!financialIoStatus().cleanupFailed||!financialIoStatus().recoveryRequired||primary.message!=='financial_deadline')throw Error('bad_late_cleanup');try{await create(${JSON.stringify(root)}).historicalCash('oct14_historical_cash_v1','2383');throw Error('unexpected_reentry');}catch(e){if(e.message!=='financial_cleanup_or_read_in_progress')throw e;}console.log('late_actual_fd_close_rejected_observed_primary_deadline_preserved');`;
 assert.match(execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8',timeout:5000}),/late_actual_fd_close_rejected_observed_primary_deadline_preserved/);cleanStatus();
});
