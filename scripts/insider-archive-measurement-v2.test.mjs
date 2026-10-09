import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {allocationInventory,buildArchiveFixtureProfile,measurementVerdict,journalFingerprint,REQUIRED_CHECKS,runOwned,measureOpenUnlinkedLiability} from './insider-archive-measurement-v2.mjs';
import {insiderAcceptanceLifecycle} from './research-insider-acceptance-lifecycle.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(fn){const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'afm-light-'));try{await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('real FD allocated blocks count unique dev/ino, retaining distinct same-hash copies',()=>fixture(async root=>{
 const bytes=Buffer.alloc(8193,67);await fs.writeFile(path.join(root,'a'),bytes,{mode:0o600});await fs.link(path.join(root,'a'),path.join(root,'b'));await fs.writeFile(path.join(root,'c'),bytes,{mode:0o600});
 const r=await allocationInventory(root);const a=await fs.stat(path.join(root,'a'));
 assert.equal(r.uniqueFiles,2);assert.equal(r.fileEntries,3);assert.equal(r.apparentFileBytes,bytes.length*3);assert.equal(r.uniqueFileAllocatedBytes,a.blocks*512*2);assert.equal(r.entries.filter(x=>x.sha256===hash(bytes)).length,3);
 assert.equal(r.allocatedBytes,r.uniqueFileAllocatedBytes+r.directoryAllocatedBytes);
}));
test('unsafe symlink/FIFO and finite count/byte limits refuse without blocking',()=>fixture(async root=>{
 await fs.symlink('/dev/null',path.join(root,'bad'));await assert.rejects(allocationInventory(root),/unsafe/);await fs.unlink(path.join(root,'bad'));
 execFileSync('/usr/bin/mkfifo',[path.join(root,'fifo')]);const start=performance.now();await assert.rejects(allocationInventory(root),/unsafe/);assert.ok(performance.now()-start<1000);await fs.unlink(path.join(root,'fifo'));
 await fs.writeFile(path.join(root,'a'),'abc');await assert.rejects(allocationInventory(root,{maxEntries:1}),/entry_bound/);await assert.rejects(allocationInventory(root,{maxBytes:2}),/byte_bound/);
}));
test('actual growth during read rejects, already-aborted inventory refuses',async t=>fixture(async root=>{
 const file=path.join(root,'a');await fs.writeFile(file,Buffer.alloc(100));const fd=await fs.open(file,'r');const proto=Object.getPrototypeOf(fd);await fd.close();const original=proto.read;let changed=false;
 const mock=t.mock.method(proto,'read',async function(...args){if(!changed){changed=true;await fs.appendFile(file,'x');}return Reflect.apply(original,this,args);});
 try{await assert.rejects(allocationInventory(root),/changed|growth/);}finally{mock.mock.restore();}
 await assert.rejects(allocationInventory(root,{signal:AbortSignal.abort()}),/abort/);
}));
test('full committed event set detects late lower-numbered commits whereas max alone misses them',()=>{
 const earlier=[{id:2,binding:'b'}],later=[{id:2,binding:'b'},{id:1,binding:'a'}];assert.equal(Math.max(...earlier.map(x=>x.id)),Math.max(...later.map(x=>x.id)));
 assert.notEqual(journalFingerprint(earlier),journalFingerprint(later));assert.equal(journalFingerprint(later),journalFingerprint([...later].reverse()));
 assert.throws(()=>journalFingerprint([{id:1,binding:'a'},{id:1,binding:'b'}]),/identity/);
});
test('only every named check and confirmed cleanup permit fixture PASS; never productionReady',()=>{
 const good={passed:true,cleanupComplete:true,checks:Object.fromEntries(REQUIRED_CHECKS.map(k=>[k,'passed']))};assert.equal(measurementVerdict(good).testOutcome,'passed');assert.equal(measurementVerdict(good).productionReady,false);assert.equal(measurementVerdict(good).fullContractAcceptance,false);
 for(const bad of [{...good,passed:false},{...good,cleanupComplete:false},{...good,checks:{...good.checks,[REQUIRED_CHECKS[0]]:'failed'}},{...good,checks:{}}])assert.equal(measurementVerdict(bad).testOutcome,'failed');
});
test('controlled check failure and cancellation cannot yield a positive receipt',async()=>{
 for(const cancel of [false,true]){const ctl=new AbortController();const life=insiderAcceptanceLifecycle({signal:ctl.signal,timeoutMs:1000,requiredChecks:['x']});let cleaned=false;life.addCleanup(async()=>{cleaned=true;});
 const result=life.check('x',async()=>{if(cancel){ctl.abort(Error('controlled_cancel'));await new Promise(r=>setTimeout(r,5));}else throw Error('controlled_child_failure');});await assert.rejects(result);const receipt=await life.finish();assert.equal(receipt.passed,false);assert.equal(cleaned,true);}
});
test('profile extracts unchanged legacy bodies, closed fixture schema and reviewed isolation/observer hooks',async()=>{
 const p=await buildArchiveFixtureProfile();assert.ok(p.definitions.length>=10);assert.ok(p.definitions.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
 assert.match(p.sql,/WHERE public.production_write_leases.expires_at <= NOW\(\)/);assert.match(p.sql,/current_setting\('transaction_isolation'\)/);assert.match(p.sql,/MAXVALUE 128 NO CYCLE/);assert.match(p.sql,/CREATE SCHEMA archive_fixture/);
 assert.doesNotMatch(p.sql,/ALTER TABLE public.insider_snapshots|DELETE FROM public.source_raw_documents/);
});

test('actual owned Node child exit and timeout retain negative verdict and confirmed close',async()=>{
 for(const code of ['process.exit(7)','setInterval(()=>{},1000)']){
  const life=insiderAcceptanceLifecycle({timeoutMs:code.includes('exit')?1000:80,requiredChecks:['child'],cleanupTimeoutMs:1500});
  await assert.rejects(life.check('child',()=>runOwned(process.execPath,['-e',code],{life,env:{PATH:process.env.PATH}})));
  const result=await life.finish();assert.equal(result.passed,false);assert.equal(result.cleanupComplete,true);
 }
});

test('real isolated process restart reopens archive bytes and verifies expected hash',()=>fixture(async directory=>{
 const life=insiderAcceptanceLifecycle({timeoutMs:5000,requiredChecks:['restart']});
 await life.check('restart',async()=>{
  const codec=new URL('../web/src/lib/insider-completed-archive-codec-v2.ts',import.meta.url).href,io=new URL('../web/src/lib/insider-completed-archive-io-v2.ts',import.meta.url).href;
  const publish="const {encodeInsiderArchiveV2}=await import(process.argv[1]);const {publishInsiderArchiveV2}=await import(process.argv[2]);const e=await encodeInsiderArchiveV2(Buffer.from('synthetic restart bytes'));await publishInsiderArchiveV2(process.argv[3],e.bytes,e.binding);console.log(JSON.stringify(e.binding));";
  const manifest=JSON.parse(await runOwned(process.execPath,['--experimental-strip-types','--input-type=module','-e',publish,codec,io,directory],{life,env:{PATH:process.env.PATH}}));
  const restore="import{createHash}from'node:crypto';const{readInsiderArchiveV2}=await import(process.argv[1]);const b=await readInsiderArchiveV2(process.argv[2],JSON.parse(process.argv[3]));console.log(createHash('sha256').update(b).digest('hex'));";
  const digest=await runOwned(process.execPath,['--experimental-strip-types','--input-type=module','-e',restore,io,directory,JSON.stringify(manifest)],{life,env:{PATH:process.env.PATH}});
  assert.equal(digest.trim(),hash(Buffer.from('synthetic restart bytes')));
 });
 const outcome=await life.finish();assert.equal(outcome.passed,true);assert.equal(outcome.cleanupComplete,true);
}));

test('unhashed same-inode growth beyond allocation bound refuses',async t=>fixture(async root=>{
 const file=path.join(root,'a');await fs.writeFile(file,'x');const original=fs.lstat;let calls=0;
 const mock=t.mock.method(fs,'lstat',async function(filename,...args){if(filename===file&&++calls===2)await fs.appendFile(file,Buffer.alloc(1024*1024,71));return original.call(this,filename,...args);});
 try{await assert.rejects(allocationInventory(root,{hashFiles:false,maxBytes:32768}),/changed|bound/);}finally{mock.mock.restore();}
}));
test('directory insertion after enumeration refuses instead of reporting empty inventory',async t=>fixture(async root=>{
 const original=fs.opendir;let changed=false;
 const mock=t.mock.method(fs,'opendir',async function(filename,...args){const dir=await original.call(this,filename,...args);return {[Symbol.asyncIterator]:async function*(){for await(const entry of dir)yield entry;if(filename===root&&!changed){changed=true;await fs.writeFile(path.join(root,'late'),'late');}}};});
 try{await assert.rejects(allocationInventory(root,{hashFiles:false}),/changed/);}finally{mock.mock.restore();}
}));
test('second unlink failure closes owned unlinked descriptor before cleanup success',async t=>fixture(async root=>{
 const life=insiderAcceptanceLifecycle({timeoutMs:1500,requiredChecks:['orphan']});const originalOpen=fs.open,originalUnlink=fs.unlink;let handle;
 const open=t.mock.method(fs,'open',async function(...args){handle=await originalOpen.apply(this,args);return handle;});
 const unlink=t.mock.method(fs,'unlink',async function(filename){await originalUnlink.call(this,filename);if(filename.endsWith('.link'))throw Error('controlled_second_unlink_failure');});
 try{await assert.rejects(life.check('orphan',()=>measureOpenUnlinkedLiability(root,Buffer.alloc(8192,1),life)),/controlled_second/);const receipt=await life.finish();assert.equal(receipt.passed,false);assert.equal(receipt.cleanupComplete,true);await assert.rejects(handle.stat(),{code:'EBADF'});}
 finally{open.mock.restore();unlink.mock.restore();await handle?.close();}
}));
test('final sweep refuses growth of an earlier file during later traversal',async t=>fixture(async root=>{
 const earlier=path.join(root,'a'),later=path.join(root,'b');await fs.writeFile(earlier,'a');await fs.writeFile(later,'b');const original=fs.lstat;let changed=false;
 const mock=t.mock.method(fs,'lstat',async function(filename,...args){if(filename===later&&!changed){changed=true;await fs.appendFile(earlier,'late');}return original.call(this,filename,...args);});
 try{await assert.rejects(allocationInventory(root,{hashFiles:false}),/changed/);}finally{mock.mock.restore();}
}));
test('cancellation after unlink still closes descriptor and cannot pass',async t=>fixture(async root=>{
 const controller=new AbortController(),life=insiderAcceptanceLifecycle({signal:controller.signal,timeoutMs:1500,requiredChecks:['orphan']});const originalOpen=fs.open,originalUnlink=fs.unlink;let handle;
 const open=t.mock.method(fs,'open',async function(...args){handle=await originalOpen.apply(this,args);return handle;});
 const unlink=t.mock.method(fs,'unlink',async function(filename){await originalUnlink.call(this,filename);controller.abort(Error('controlled_orphan_cancel'));});
 try{await assert.rejects(life.check('orphan',()=>measureOpenUnlinkedLiability(root,Buffer.alloc(8192,1),life)),/cancel/);const receipt=await life.finish();assert.equal(receipt.passed,false);assert.equal(receipt.cleanupComplete,true);await assert.rejects(handle.stat(),{code:'EBADF'});}
 finally{open.mock.restore();unlink.mock.restore();await handle?.close();}
}));
test('unconfirmed descriptor close produces cleanupComplete false',async t=>fixture(async root=>{
 const life=insiderAcceptanceLifecycle({timeoutMs:1500,requiredChecks:['orphan']});const originalOpen=fs.open;let handle,close;
 const open=t.mock.method(fs,'open',async function(...args){handle=await originalOpen.apply(this,args);close=handle.close.bind(handle);handle.close=async()=>{throw Error('controlled_close_failure');};return handle;});
 try{await assert.rejects(life.check('orphan',()=>measureOpenUnlinkedLiability(root,Buffer.alloc(8192,1),life)),/close_failure/);const receipt=await life.finish();assert.equal(receipt.passed,false);assert.equal(receipt.cleanupComplete,false);assert.equal((await handle.stat()).nlink,0);}
 finally{open.mock.restore();await close?.();}
}));
