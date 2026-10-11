import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import type {FileHandle} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {encodeInsiderArchiveV2} from './insider-completed-archive-codec-v2.ts';
import {publishInsiderArchiveV2,readInsiderArchiveV2} from './insider-completed-archive-io-v2.ts';
async function fixture(fn:(root:string)=>Promise<void>){const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'si-archive-io-'));try{await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
const raw=Buffer.from('[{"name":"synthetic 😀","shares":123}]\n'.repeat(30));
let encoded:Awaited<ReturnType<typeof encodeInsiderArchiveV2>>;
before(async()=>{encoded=await encodeInsiderArchiveV2(raw);});
const location=(root:string)=>path.join(root,encoded.binding.artifactSha256.slice(0,2),encoded.binding.artifactSha256);
test('private store publication/fsync/readback and dedup preserve exact bytes without DB authority',async()=>fixture(async root=>{
 const first=await publishInsiderArchiveV2(root,encoded.bytes,encoded.binding);assert.equal(first.created,true);assert.equal(first.evictionAuthorized,false);assert.deepEqual(await readInsiderArchiveV2(root,encoded.binding),raw);
 const before=await fs.stat(location(root));const second=await publishInsiderArchiveV2(root,encoded.bytes,encoded.binding);assert.equal(second.created,false);const after=await fs.stat(location(root));assert.equal(after.ino,before.ino);assert.equal(after.mtimeMs,before.mtimeMs);
 assert.equal((after.mode&0o077),0);assert.deepEqual((await fs.readdir(root)).sort(),[encoded.binding.artifactSha256.slice(0,2)]);
}));
test('FIFO, symlink, device/directory and corrupt existing object refuse without overwrite',async()=>fixture(async root=>{
 const shard=path.dirname(location(root));await fs.mkdir(shard,{mode:0o700});
 execFileSync('/usr/bin/mkfifo',[location(root)]);const start=performance.now();await assert.rejects(readInsiderArchiveV2(root,encoded.binding),/file/);assert.ok(performance.now()-start<1000);await assert.rejects(publishInsiderArchiveV2(root,encoded.bytes,encoded.binding),/file/);await fs.unlink(location(root));
 await fs.symlink('/dev/null',location(root));await assert.rejects(readInsiderArchiveV2(root,encoded.binding));await fs.unlink(location(root));
 await fs.mkdir(location(root),{mode:0o700});await assert.rejects(readInsiderArchiveV2(root,encoded.binding),/file/);await fs.rmdir(location(root));
 await fs.writeFile(location(root),'corrupt',{mode:0o600});await assert.rejects(publishInsiderArchiveV2(root,encoded.bytes,encoded.binding),/file|identity/);assert.equal(await fs.readFile(location(root),'utf8'),'corrupt');
}));
test('real regular growth and directory replacement during descriptor read reject',async t=>fixture(async root=>{
 await publishInsiderArchiveV2(root,encoded.bytes,encoded.binding);
 const probe=await fs.open(location(root),'r');const proto=Object.getPrototypeOf(probe);await probe.close();const original=proto.read;
 let once=false;const grow=t.mock.method(proto,'read',async function(this:FileHandle,...args:unknown[]){if(!once){once=true;await fs.appendFile(location(root),'x');}return Reflect.apply(original,this,args);});
 await assert.rejects(readInsiderArchiveV2(root,encoded.binding),/changed|identity|file/);grow.mock.restore();await fs.writeFile(location(root),encoded.bytes);
 const moved=root+'-moved';once=false;const rename=t.mock.method(proto,'read',async function(this:FileHandle,...args:unknown[]){if(!once){once=true;await fs.rename(root,moved);await fs.mkdir(root,{mode:0o700});}return Reflect.apply(original,this,args);});
 try{await assert.rejects(readInsiderArchiveV2(root,encoded.binding),/directory|changed/);}finally{rename.mock.restore();await fs.rm(moved,{recursive:true,force:true});}
}));
test('fsync failure, already-aborted operation and corrupt requested encoding cannot return verification',async t=>fixture(async root=>{
 const probe=await fs.open(path.join(root,'probe'),'wx',0o600);const proto=Object.getPrototypeOf(probe);await probe.close();await fs.unlink(path.join(root,'probe'));
 const sync=t.mock.method(proto,'sync',async()=>{throw Error('controlled_fsync_failure');});await assert.rejects(publishInsiderArchiveV2(root,encoded.bytes,encoded.binding),/controlled_fsync_failure/);sync.mock.restore();
 await assert.rejects(publishInsiderArchiveV2(root,encoded.bytes,encoded.binding,{signal:AbortSignal.abort()}),/aborted/);
 const bad=Buffer.from(encoded.bytes);bad[10]^=1;await assert.rejects(publishInsiderArchiveV2(root,bad,encoded.binding),/identity/);
}));

test('replacement during final fsync cannot return a positive component result',async t=>fixture(async root=>{
 const probe=await fs.open(path.join(root,'probe'),'wx',0o600);const proto=Object.getPrototypeOf(probe);await probe.close();await fs.unlink(path.join(root,'probe'));
 const original=proto.sync;let replaced=false;
 const mock=t.mock.method(proto,'sync',async function(this:FileHandle){
  if(!replaced&&(await this.stat()).isFile()){
   try{await fs.lstat(location(root));replaced=true;await fs.rename(location(root),location(root)+'.original');await fs.writeFile(location(root),'replaced',{mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  return Reflect.apply(original,this,[]);
 });
 try{await assert.rejects(publishInsiderArchiveV2(root,encoded.bytes,encoded.binding),/file_changed/);assert.equal(replaced,true);assert.equal(await fs.readFile(location(root),'utf8'),'replaced');}finally{mock.mock.restore();}
}));
test('deadline and in-flight abort lock failure after bounded regular I/O, descriptors close',async t=>fixture(async root=>{
 await publishInsiderArchiveV2(root,encoded.bytes,encoded.binding);
 const probe=await fs.open(location(root),'r');const proto=Object.getPrototypeOf(probe);await probe.close();const original=proto.read;
 const abort=new AbortController();let once=false;
 const mock=t.mock.method(proto,'read',async function(this:FileHandle,...args:unknown[]){const result=await Reflect.apply(original,this,args);if(!once){once=true;abort.abort();}return result;});
 await assert.rejects(readInsiderArchiveV2(root,encoded.binding,{signal:abort.signal}),/aborted/);mock.mock.restore();
 const delay=t.mock.method(proto,'read',async function(this:FileHandle,...args:unknown[]){await new Promise(r=>setTimeout(r,20));return Reflect.apply(original,this,args);});
 try{await assert.rejects(readInsiderArchiveV2(root,encoded.binding,{timeoutMs:10}),/deadline/);}finally{delay.mock.restore();}
 assert.deepEqual(await readInsiderArchiveV2(root,encoded.binding),raw);
}));
test('two same-content publishers never overwrite; existing verified final remains readable',async()=>fixture(async root=>{
 const results=await Promise.allSettled([publishInsiderArchiveV2(root,encoded.bytes,encoded.binding),publishInsiderArchiveV2(root,encoded.bytes,encoded.binding)]);
 assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.created).length,1);
 assert.deepEqual(await readInsiderArchiveV2(root,encoded.binding),raw);
}));
