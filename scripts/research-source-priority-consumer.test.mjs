import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';
import { loadDiscoveryPriceEnrichment } from '../web/src/lib/research-discovery-price-enrichment.ts';
import { selectResearchPriority } from '../web/src/lib/research-agent-priority.ts';
import { sourcePriorityCommand, sourcePriorityScope } from './research-source-priority-consumer.mjs';
const key = 'synthetic-local-only-internal-key';
async function fixture() {
  const dir=await mkdtemp(path.join(os.tmpdir(),'source-priority-consumer-'));
  const asOf=new Date().toISOString();
  const controller={asOf,authoritativePublication:false,strategyApproved:false,
    priorityRequest:{asOf,sourceAttempts:[]},inboxRequest:{items:[]}};
  controller.runHash=researchCanonicalHash(controller);
  await writeFile(path.join(dir,'controller.json'),JSON.stringify(controller));
  await writeFile(path.join(dir,'assessments.json'),'[]');
  const args=origin=>['--controller',path.join(dir,'controller.json'),'--assessments',path.join(dir,'assessments.json'),
    '--origin',origin,'--journal',path.join(dir,'journal')];
  return {dir,args,asOf};
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

const snapshotHash='a'.repeat(64);
const observedFlags=['--scope','research_observed_v1','--snapshot-hash',snapshotHash];
const validPriority=()=>({ok:true,rows:[{symbol:'2409',disposition:'needs_evidence'}],expectedCount:1,accountedCount:1,queue:[],
  scope:'research_observed_v1',snapshotHash,scopeReceipt:{snapshotHash},researchQualified:false,strategyApproved:false,entryEligible:false});

test('PC06 explicit observed roster reaches actual HTTP endpoint and replays once',async()=>{
  const f=await fixture();let calls=0;
  const server=http.createServer(async(req,res)=>{
    calls++;let text='';for await(const chunk of req)text+=chunk;
    const body=JSON.parse(text);
    assert.equal(body.scope,'research_observed_v1');assert.equal(body.snapshotHash,snapshotHash);
    assert.deepEqual(body.assessments,[]);assert.equal(req.url,'/api/internal/research-priority-run');
    assert.equal(req.headers.authorization,`Bearer ${key}`);
    res.setHeader('content-type','application/json');res.end(JSON.stringify(validPriority()));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const args=[...f.args(`http://127.0.0.1:${server.address().port}/`),...observedFlags];
    const first=await sourcePriorityCommand(args,{env:{INTERNAL_API_KEY:key}});
    assert.equal(first.scope,'research_observed_v1');assert.equal(first.snapshotHash,snapshotHash);
    assert.equal(first.publication,false);assert.equal(first.strategyApproved,false);
    const replay=await sourcePriorityCommand(args,{env:{INTERNAL_API_KEY:key}});
    assert.equal(replay.localJournalReplay,true);assert.equal(calls,1);
    await assert.rejects(sourcePriorityCommand(f.args(`http://127.0.0.1:${server.address().port}/`),{env:{INTERNAL_API_KEY:key}}),/replay_binding_mismatch/);
    await assert.rejects(sourcePriorityCommand([...args.slice(0,-1),'b'.repeat(64)],{env:{INTERNAL_API_KEY:key}}),/replay_binding_mismatch/);
    assert.equal(calls,1);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

for(const [name,amend] of [
  ['silent formal fallback',body=>{delete body.scope;}],
  ['wrong roster',body=>{body.snapshotHash='b'.repeat(64);}],
  ['wrong roster receipt',body=>{body.scopeReceipt.snapshotHash='b'.repeat(64);}],
  ['manufactured entry eligibility',body=>{body.entryEligible=true;}],
])test(`PC07 rejects ${name} and fences uncertain submission`,async()=>{
  const f=await fixture();let calls=0;
  const body=validPriority();amend(body);
  const args=[...f.args('http://127.0.0.1:5555/'),...observedFlags];
  const options={env:{INTERNAL_API_KEY:key},post:async()=>{calls++;return{body};}};
  await assert.rejects(sourcePriorityCommand(args,options),/response_scope_mismatch/);
  await assert.rejects(sourcePriorityCommand(args,options),/uncertain_submission/);
  assert.equal(calls,1);
});

test('PC08 formal response cannot silently switch to an observed roster',async()=>{
  const f=await fixture();
  await assert.rejects(sourcePriorityCommand(f.args('http://127.0.0.1:5555/'),{
    env:{INTERNAL_API_KEY:key},post:async()=>({body:validPriority()}),
  }),/response_scope_mismatch/);
});

test('PC09 controller cannot smuggle a different roster or cutoff',async()=>{
  for(const amend of [body=>{body.priorityRequest.scope='research_observed_v1';},body=>{body.priorityRequest.asOf='2020-01-01T00:00:00Z';}]){
    const f=await fixture();const filename=path.join(f.dir,'controller.json');const body=JSON.parse(await readFile(filename));
    delete body.runHash;amend(body);body.runHash=researchCanonicalHash(body);await writeFile(filename,JSON.stringify(body));
    let calls=0;
    await assert.rejects(sourcePriorityCommand(f.args('http://127.0.0.1:5555/'),{
      env:{INTERNAL_API_KEY:key},post:async()=>{calls++;},
    }),/controller_binding_invalid/);assert.equal(calls,0);
  }
});

test('PCscope default is formal; observed scope requires a valid explicit snapshot',()=>{
  const base=['--controller','/tmp/controller','--assessments','/tmp/assessments','--origin','http://127.0.0.1:5555/','--journal','/tmp/journal'];
  assert.deepEqual(sourcePriorityScope(base).scope,{kind:'formal_v1'});
  assert.deepEqual(sourcePriorityScope([...base,...observedFlags]).scope,{kind:'research_observed_v1',snapshotHash});
  for(const extra of [
    ['--snapshot-hash',snapshotHash],['--scope','research_observed_v1'],
    ['--scope','formal_v1','--snapshot-hash',snapshotHash],['--scope','automatic'],
    ['--scope','research_observed_v1','--snapshot-hash','bad'],['--scope','formal_v1','--scope','formal_v1'],
  ])assert.throws(()=>sourcePriorityScope([...base,...extra]),/source_priority_(?:scope|arguments)_invalid/);
  assert.throws(()=>sourcePriorityScope([...base,'--unknown','x']),/arguments_invalid/);
  assert.throws(()=>sourcePriorityScope(base.slice(0,-2)),/arguments_invalid/);
});

async function fullCohortPriority(asOf){
  const candidates=Array.from({length:1978},(_,i)=>({symbol:String(1000+i),sector:'',roots:[],attempts:[],
    profitImpact:{level:0,reason:'尚未完成有理由的人工研究評分'},novelty:{level:0,reason:'尚未完成有理由的人工研究評分'},
    researchability:{level:0,reason:'尚未完成有理由的人工研究評分'},lane:'general',inProgress:false,disposition:'needs_evidence'}));
  const query={select(){return this;},lte(){return this;},order(){return this;},range(){return this;},
    async abortSignal(){return{data:[],error:null};}};
  const enrichment=await loadDiscoveryPriceEnrichment({from:()=>query},candidates.map(c=>({symbol:c.symbol,
    stockId:'',exchange:'TWSE',firstSeenAt:null,hasDiscoveryEvidence:false})),asOf,{currentRun:{serverClock:asOf,prioritySymbols:[]}});
  const run=selectResearchPriority({candidates,asOf});
  return{...validPriority(),...run,priceContexts:candidates.map(c=>({symbol:c.symbol,
    priceContext:enrichment.contexts.get(c.symbol),supplementaryObservation:enrichment.supplements.get(c.symbol)}))};
}

test('PCsize actual scoring/enrichment modules produce a cohort larger than the old four-MB transport budget',async()=>{
  const body=await fullCohortPriority(new Date().toISOString());
  assert.equal(body.rows.length,1978);assert.equal(body.priceContexts.length,1978);
  assert.ok(Buffer.byteLength(JSON.stringify(body))>4_000_000);
  assert.ok(Buffer.byteLength(JSON.stringify(body))<32_000_000);
});

test('PC10 full1978 HTTP response persists compactly and replays all candidate and price rows',async()=>{
  const f=await fixture();const body=await fullCohortPriority(f.asOf);let calls=0;
  const server=http.createServer(async(req,res)=>{
    for await(const _chunk of req){/* drain */}calls++;
    res.setHeader('content-type','application/json');res.end(JSON.stringify(body));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const args=[...f.args(`http://127.0.0.1:${server.address().port}/`),...observedFlags];
    const first=await sourcePriorityCommand(args,{env:{INTERNAL_API_KEY:key}});
    assert.equal(first.priority.rows.length,1978);assert.equal(first.priority.priceContexts.length,1978);
    const persisted=await readFile(path.join(f.dir,'journal','receipt.json'),'utf8');
    assert.ok(Buffer.byteLength(persisted)>4_000_000);assert.ok(!persisted.startsWith('{\n'));
    const replay=await sourcePriorityCommand(args,{env:{INTERNAL_API_KEY:key}});
    assert.equal(replay.localJournalReplay,true);assert.equal(replay.receiptHash,first.receiptHash);
    assert.deepEqual(replay.priority,first.priority);assert.equal(calls,1);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
