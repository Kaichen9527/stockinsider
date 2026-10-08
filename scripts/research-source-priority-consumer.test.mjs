import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';
import { sourcePriorityCommand } from './research-source-priority-consumer.mjs';
const key = 'synthetic-local-only-internal-key';
async function fixture() {
  const dir=await mkdtemp(path.join(os.tmpdir(),'source-priority-consumer-'));
  const controller={asOf:new Date().toISOString(),authoritativePublication:false,strategyApproved:false,
    priorityRequest:{asOf:new Date().toISOString(),sourceAttempts:[]},inboxRequest:{items:[]}};
  controller.runHash=researchCanonicalHash(controller);
  await writeFile(path.join(dir,'controller.json'),JSON.stringify(controller));
  await writeFile(path.join(dir,'assessments.json'),'[]');
  const args=origin=>['--controller',path.join(dir,'controller.json'),'--assessments',path.join(dir,'assessments.json'),
    '--origin',origin,'--journal',path.join(dir,'journal')];
  return {dir,args};
}
test('PC01 actual loopback HTTP POST and completed journal replay issue no second request',async()=>{
  const f=await fixture();let calls=0;
  const server=http.createServer((req,res)=>{
    calls++;assert.equal(req.headers.authorization,`Bearer ${key}`);assert.equal(req.url,'/api/internal/research-priority-run');
    res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,rows:[{symbol:'2409',disposition:'needs_evidence'}],expectedCount:1,accountedCount:1,queue:[]}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const args=f.args(`http://127.0.0.1:${server.address().port}/`);
    const first=await sourcePriorityCommand(args,{env:{INTERNAL_API_KEY:key}});assert.equal(first.localJournalReplay,false);
    const replay=await sourcePriorityCommand(args,{env:{INTERNAL_API_KEY:key}});assert.equal(replay.localJournalReplay,true);
    assert.equal(replay.receiptHash,first.receiptHash);assert.equal(calls,1);
    assert.equal((await readFile(path.join(f.dir,'journal','receipt.json'),'utf8')).includes(key),false);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('PC02 uncertain POST is fenced on restart rather than repeated',async()=>{
  const f=await fixture();let calls=0;
  const options={env:{INTERNAL_API_KEY:key},post:async()=>{calls++;throw new Error('lost response');}};
  await assert.rejects(sourcePriorityCommand(f.args('http://127.0.0.1:5555/'),options));
  await assert.rejects(sourcePriorityCommand(f.args('http://127.0.0.1:5555/'),options),/uncertain_submission/);assert.equal(calls,1);
});
test('PC03 remote origin rejected before transport or journal creation',async()=>{
  const f=await fixture();await assert.rejects(sourcePriorityCommand(f.args('https://example.com/'),{env:{INTERNAL_API_KEY:key}}),/loopback_required/);
});
test('PC04 tampered controller or shared principal rejected',async()=>{
  const f=await fixture();const p=path.join(f.dir,'controller.json');const run=JSON.parse(await readFile(p));run.strategyApproved=true;
  await writeFile(p,JSON.stringify(run));await assert.rejects(sourcePriorityCommand(f.args('http://127.0.0.1:5555/'),{env:{INTERNAL_API_KEY:key}}),/binding_invalid/);
  await assert.rejects(sourcePriorityCommand(f.args('http://127.0.0.1:5555/'),{env:{INTERNAL_API_KEY:key,CRON_SECRET:key}}),/distinct_local_key/);
});
test('PC05 incomplete journal never becomes successful empty receipt',async()=>{
  const f=await fixture();await mkdir(path.join(f.dir,'journal'));await writeFile(path.join(f.dir,'journal','attempt.json'),'{}');
  await assert.rejects(sourcePriorityCommand(f.args('http://127.0.0.1:5555/'),{env:{INTERNAL_API_KEY:key}}),/binding_mismatch/);
});
