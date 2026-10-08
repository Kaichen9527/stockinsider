// VM Linux only; FD-anchored private journal acceptance. Tool absence is a fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,stat,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {insiderContinuationCommand} from './research-insider-continuation-command.mjs';
const runId='11111111-1111-4111-8111-111111111111';
const pins=Array.from({length:5},(_,dataset)=>({dataset,snapshotId:`00000000-0000-4000-8000-00000000000${dataset}`}));
function response(round){const complete=round===2;const members=pins.map(p=>({...p,offset:p.dataset===0?(complete?501:500):0,totalRows:p.dataset===0?501:0,generation:p.dataset===0?round:1,complete:p.dataset===0?complete:true,observedAt:'2026-10-08T00:00:01Z',attemptedAt:'2026-10-08T00:00:00Z',hash:'a'.repeat(64)}));return {status:complete?200:502,body:{ok:complete,result:{connector:'twse_insider',terminalReason:complete?'success':'partial',degradedReason:complete?null:'insider_bounded_response_pages_remaining',metadata:{insider_snapshot:{schema:'insider_snapshot_progress_v1',runId,pins,members,outcome:complete?'coverage_complete':'pages_remaining',remainingRows:complete?0:1}}}}};}
test('Linux durable journals save five pins before another HTTP and preserve uncertain writes for explicit resume',async()=>{
 assert.equal(process.platform,'linux','run FD-anchored journal acceptance in the VM single queue');
 const dir=await mkdtemp(path.join(os.tmpdir(),'si-insider-journal-'));const input=path.join(dir,'input.json');const journal=path.join(dir,'journal');
 const key='synthetic-local-internal-key-only';await writeFile(input,JSON.stringify({runId}),{mode:0o600});let calls=0;
 const args=j=>['--input',input,'--origin','http://127.0.0.1:12345/','--journal',j];
 try{
  const result=await insiderContinuationCommand(args(journal),{env:{INTERNAL_API_KEY:key},post:async(url,body,k)=>{calls++;assert.equal(k,key);assert.equal(url.pathname,'/api/internal/source-sync');if(calls===2){const saved=JSON.parse(await readFile(path.join(journal,'001.json'),'utf8'));assert.deepEqual(saved.request.pins,pins);assert.deepEqual(body.insiderSnapshot.pins,pins);}return response(calls);}});
  assert.equal(result.stopped,'complete');assert.equal(calls,2);assert.equal((await stat(journal)).mode&0o777,0o700);
  for(const file of await readdir(journal)){assert.equal((await stat(path.join(journal,file))).mode&0o777,0o600);const text=await readFile(path.join(journal,file),'utf8');assert.ok(!text.includes(key));assert.ok(!text.includes('documents'));}
  await assert.rejects(insiderContinuationCommand(args(journal),{env:{INTERNAL_API_KEY:key},post:async()=>{throw Error('must not run');}}),/EEXIST/);
  const uncertain=path.join(dir,'uncertain');let attempts=0;await assert.rejects(insiderContinuationCommand(args(uncertain),{env:{INTERNAL_API_KEY:key},post:async()=>{attempts++;throw Error('lost response');}}),/lost response/);assert.equal(attempts,1);
  assert.equal(JSON.parse(await readFile(path.join(uncertain,'000.json'),'utf8')).request.runId,runId);
  await insiderContinuationCommand(args(path.join(dir,'explicit-resume')),{env:{INTERNAL_API_KEY:key},post:async(_url,body)=>{assert.equal(body.insiderSnapshot.runId,runId);return response(2);}});
 }finally{await rm(dir,{recursive:true,force:true});}
});
