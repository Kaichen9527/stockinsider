import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, cp, rm} from 'node:fs/promises';
import {execFileSync, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
const execute=promisify(execFile),root=path.resolve(import.meta.dirname,'../../..');
test('four concurrent FIFO artifacts refuse within bounded subprocess deadline without fs-pool exhaustion',async()=>{
 const tmp=await mkdtemp(path.join(os.tmpdir(),'draft-fifo-repro-'));
 try {
  const folder='docs/research/2026-10-08-emc-company-model';
  await mkdir(path.join(tmp,'docs/research'),{recursive:true});await cp(path.join(root,folder),path.join(tmp,folder),{recursive:true});
  const article=path.join(tmp,folder,'article.md');await rm(article);execFileSync('mkfifo',[article]);
  const loader=new URL('./research-working-draft-loader.ts',import.meta.url).href;
  const code=`import {loadReadOnlyWorkingDraft} from ${JSON.stringify(loader)}; const outcomes=await Promise.all(Array.from({length:4},()=>loadReadOnlyWorkingDraft(${JSON.stringify(tmp)},'2383').then(()=>false,()=>true))); if(!outcomes.every(Boolean))process.exit(2);console.log('bounded-refusals=4');`;
  const started=Date.now();
  try {
   const result=await execute(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{timeout:1500,killSignal:'SIGKILL',maxBuffer:10000});
   assert.match(result.stdout,/bounded-refusals=4/);assert.ok(Date.now()-started<1500);
  }catch(error){assert.fail(`FIFO did not produce four bounded refusals: ${(error as Error).message}`);}
 }finally{await rm(tmp,{recursive:true});}
});

import {readBoundedWorkingDraftArtifact} from './research-working-draft-loader.ts';
test('device and directory leaves reject before reading; symlink is not followed',async()=>{
 await assert.rejects(readBoundedWorkingDraftArtifact('/dev','null'),/non-regular/);
 await assert.rejects(readBoundedWorkingDraftArtifact(root,'docs'),/non-regular/);
});
