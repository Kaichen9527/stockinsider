import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {observeNamespace} from './research-financial-parent-namespace-diagnostic.mjs';

test('observer caps events, closes collectors and rejects teardown after saving failed receipt',async t=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'namespace-bound-')),out=path.join(dir,'receipt.json');
 let callback,closed=0;
 t.mock.method(fs,'watch',(_path,_options,fn)=>{callback=fn;return{on(){return this;},close(){closed++;}};});
 try{
  const observer=await observeNamespace([dir],out);
  for(let i=0;i<10050;i++)callback('rename','entry-'+i);
  assert.equal(observer.events.length,10000);assert.ok(closed);
  await assert.rejects(()=>observer.stop(),/namespace_observation_bound/u);
  const receipt=JSON.parse(await fsp.readFile(out,'utf8'));
  assert.equal(receipt.failed,'namespace_observation_bound');assert.equal(receipt.events.length,10000);
  callback('rename','after-stop');assert.equal(observer.events.length,10000);
  await assert.rejects(()=>observer.around('never',()=>{throw Error('work_dispatched');}),/namespace_observation_bound/u);
 }finally{await fsp.rm(dir,{recursive:true,force:true});}
});
test('ordinary observations save unchanged raw stats and zero-failure receipt',async()=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'namespace-healthy-')),out=path.join(dir,'receipt.json');
 try{
  const observer=await observeNamespace([dir],out);
  assert.equal(await observer.around('read',async()=>42),42);
  const report=await observer.stop();assert.equal(report.failed,null);assert.equal(report.requests.length,1);
  assert.deepEqual(report.requests[0].before,report.requests[0].after);
  assert.equal(JSON.parse(await fsp.readFile(out,'utf8')).failed,null);
 }finally{await fsp.rm(dir,{recursive:true,force:true});}
});
