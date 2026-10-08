import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,constants} from 'node:fs';
import {open,writeFile,appendFile,symlink} from 'node:fs/promises';
import {readInsiderContinuationInput} from './research-insider-continuation-command.mjs';
import os from 'node:os';
import path from 'node:path';
const command=new URL('./research-insider-continuation-command.mjs',import.meta.url).href;
test('FIFO input refuses promptly before any HTTP or journal, instead of blocking open',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'si-insider-fifo-'));const fifo=path.join(dir,'input');
 try{
  execFileSync('mkfifo',[fifo]);
  const code=`import {insiderContinuationCommand} from ${JSON.stringify(command)};try{await insiderContinuationCommand(${JSON.stringify(['--input',fifo,'--origin','http://127.0.0.1:12345/','--journal',path.join(dir,'journal')])},{env:{INTERNAL_API_KEY:'synthetic-controlled-test-key'},post:async()=>{throw Error('must_not_call');}});process.exitCode=2;}catch(e){if(e.message!=='insider_command_input_bound')throw e;}`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',code],{timeout:700,encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.equal(child.error,undefined,'input must reject without waiting for a FIFO writer');assert.equal(child.status,0,child.stderr);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('regular exact/MAX+1, symlink/directory and malformed UTF8 inputs are bounded',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'si-insider-file-'));const file=path.join(dir,'input');
 try{await writeFile(file,'{}'+' '.repeat(32766));assert.deepEqual(await readInsiderContinuationInput(file),{});
  await appendFile(file,' ');await assert.rejects(readInsiderContinuationInput(file),/input_bound/);
  const link=path.join(dir,'link');await symlink(file,link);await assert.rejects(readInsiderContinuationInput(link));await assert.rejects(readInsiderContinuationInput(dir),/input_bound/);
  await writeFile(file,Buffer.from([0xff]));await assert.rejects(readInsiderContinuationInput(file));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('a real regular file grown between descriptor stat/read never allocates or reads beyond MAX+1',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'si-insider-grow-'));const file=path.join(dir,'input');let total=0;let closed=false;
 try{await writeFile(file,'{}');await assert.rejects(readInsiderContinuationInput(file,{openFile:async(name,flags)=>{
  assert.ok(flags&constants.O_NONBLOCK);assert.ok(flags&constants.O_NOFOLLOW);const f=await open(name,flags);let first=true;
  return {stat:()=>f.stat(),close:async()=>{closed=true;await f.close();},read:async(buffer,offset,length,position)=>{
   assert.equal(buffer.length,32769);if(first){first=false;await appendFile(file,' '.repeat(131072));}
   const result=await f.read(buffer,offset,length,position);total+=result.bytesRead;return result;
  }};
 }}),/input_bound/);assert.equal(total,32769);assert.equal(closed,true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
