import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {readResearchAuthorHandoffBody,runResearchAuthorHandoff,handleResearchAuthorHandoff} from '../web/src/lib/research-author-handoff.ts';
import {FinancialDeadline} from '../web/src/lib/research-financial-file-reader.ts';
import {completeCanonical,completeHash} from '../web/src/lib/research-complete-canonical.ts';
import {projectResearchAuthorPacket} from '../web/src/lib/research-author-packet.ts';
import {authorPacketFixture} from './research-author-packet-fixture.mjs';
import {authorResultFixture} from './research-author-result-fixture.mjs';
const id=()=>randomUUID(),hash='a'.repeat(64);
const input={owner:'synthetic-owner',jobId:id(),attempt:1,reservationId:id(),scope:'research_observed_v1',snapshotHash:hash,preparationId:id(),preparationHash:hash,expectedArtifactManifestHash:hash,expectedCalculatorExecutionHash:hash};
const body=action=>({action,input,inputRevisionId:id(),inputHash:hash,resultId:id(),resultHash:hash});
const req=(raw,action='handoffAuthorResult',headers={})=>new Request('http://localhost/fixture',{method:'POST',headers:{'content-type':'application/json','x-research-execution-version':'2','x-research-author-handoff-action':action,...headers},body:raw});
for(const action of ['handoffAuthorResult','readAuthorHandoff'])test(action+' original8192 wire limit exact/+1 and strict decoding',async()=>{
 const b=JSON.stringify(body(action)),raw=b+' '.repeat(8192-Buffer.byteLength(b));assert.equal((await readResearchAuthorHandoffBody(req(raw,action),new FinancialDeadline())).action,action);
 for(const bad of [raw+' ',b.replace('"action":','"\\u0061ction":"'+action+'","action":'),new Uint8Array([0xff]),b.replace('"input":{','"input":{"unknown":'+ '['.repeat(14)+'0'+']'.repeat(14)+',')])await assert.rejects(readResearchAuthorHandoffBody(req(bad,action),new FinancialDeadline()));
 await assert.rejects(readResearchAuthorHandoffBody(req(b,action,{'x-research-author-result-action':'readAuthorResult'}),new FinancialDeadline()));
 await assert.rejects(readResearchAuthorHandoffBody(req(b,action==='handoffAuthorResult'?'readAuthorHandoff':'handoffAuthorResult'),new FinancialDeadline()));
});
test('stalled body cancels and expired body launches no reads',async()=>{
 let cancelled=false;const stream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}});
 const r=new Request('http://localhost/fixture',{method:'POST',headers:{'content-type':'application/json','x-research-author-handoff-action':'readAuthorHandoff'},body:stream,duplex:'half'}),d=new FinancialDeadline();Object.defineProperty(d,'end',{value:performance.now()+30});await assert.rejects(readResearchAuthorHandoffBody(r,d),/financial_deadline/);assert.equal(cancelled,true);
 let reads=0;const mock={headers:r.headers,body:{getReader:()=>({read:()=>{reads++;return Promise.resolve({done:true});},cancel:async()=>{},releaseLock(){}})}};const expired=new FinancialDeadline();Object.defineProperty(expired,'end',{value:performance.now()-1});await assert.rejects(readResearchAuthorHandoffBody(mock,expired),/financial_deadline/);assert.equal(reads,0);
});
test('review/cron/unknown credentials reject; exact author malformed request rejects',async()=>{
 const keys=['INTERNAL_API_KEY','RESEARCH_REVIEW_KEY','CRON_SECRET','RESEARCH_TEST_KEY','STRATEGY_APPROVAL_KEY'],prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{process.env.INTERNAL_API_KEY='synthetic-author';process.env.RESEARCH_REVIEW_KEY='synthetic-review';process.env.CRON_SECRET='synthetic-cron';delete process.env.RESEARCH_TEST_KEY;delete process.env.STRATEGY_APPROVAL_KEY;
 for(const key of ['synthetic-review','synthetic-cron','wrong',''])assert.equal((await handleResearchAuthorHandoff(req('{}','handoffAuthorResult',{authorization:'Bearer '+key}))).status,401);
 assert.equal((await handleResearchAuthorHandoff(req('{}','handoffAuthorResult',{authorization:'Bearer synthetic-author'}))).status,400);
 }finally{for(const [k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
for(const symbol of ['2409','2383'])test(symbol+' actual calculator, synthetic immutable transport: no receipt, lost response, exact read/replay and no renewal',async()=>{
 const f=await authorPacketFixture(symbol),packet=projectResearchAuthorPacket(f.request,f.revision,f.assignment,f.response,new FinancialDeadline()).packet;
 const draft=authorResultFixture(f.request,f.revision,packet),principal='f'.repeat(64);
 const result={result_id:id(),assignment_id:packet.assignmentId,result_hash:completeHash(draft.envelope),logical_bytes:Buffer.byteLength(completeCanonical(draft.envelope)),received_at:new Date().toISOString(),payload:draft.envelope};
 const a={...f.assignment,controller_principal:principal,canonical_request:f.request.input};
 const context={assignment:a,result,revision:f.revision,completion:null};
 const request={...f.request,action:'handoffAuthorResult',resultId:result.result_id,resultHash:result.result_hash};let commits=0,lose=true;
 const db={rpc(name,args){assert.equal(args.p_result_id,result.result_id);assert.equal(args.p_principal,principal);let data;
 if(name==='read_research_author_handoff_context_v2')data=structuredClone(context);
 else if(name==='commit_research_author_handoff_v2'){commits++;context.completion??={reservation_id:a.reservation_id,owner:a.work_owner,outcome:'completed',result_hash:result.payload.validatedArticle.articleHash,finished_at:new Date().toISOString()};
 if(lose){lose=false;const p=Promise.reject(new Error('synthetic_lost_response'));p.catch(()=>{});return Object.assign(p,{abortSignal:()=>p});}data=context.completion;
 }else throw new Error('unexpected mutation '+name);const p=Promise.resolve({data,error:null});return Object.assign(p,{abortSignal:()=>p});}};
 const run=(r=request,d=new FinancialDeadline())=>runResearchAuthorHandoff(db,r,principal,d);
 assert.equal((await run({...request,action:'readAuthorHandoff'})).receipt,null);assert.equal(commits,0);
 await assert.rejects(run(),/synthetic_lost_response/);const original=structuredClone(context.completion);
 const saved=await run({...request,action:'readAuthorHandoff'});assert.deepEqual(saved.receipt,original);assert.equal(commits,1);assert.equal(saved.controllerReportOnly,true);assert.equal(saved.reviewerDispatched,false);assert.equal(saved.publishableResearch,false);
 assert.deepEqual((await run()).receipt,original);assert.equal(commits,2);
 for(const mutate of [c=>c.assignment.controller_principal='a'.repeat(64),c=>c.result.result_hash='b'.repeat(64),c=>c.result.payload.validatedArticle.calculation={},c=>c.completion.result_hash='c'.repeat(64),c=>c.completion.finished_at='2099-01-01T00:00:00Z']){
  const bad=structuredClone(context);mutate(bad);const mock={rpc(){const p=Promise.resolve({data:bad,error:null});return Object.assign(p,{abortSignal:()=>p});}};await assert.rejects(runResearchAuthorHandoff(mock,request,principal,new FinancialDeadline()));
 }
 let calls=0;const expired=new FinancialDeadline();Object.defineProperty(expired,'end',{value:performance.now()-1});await assert.rejects(runResearchAuthorHandoff({rpc(){calls++;throw Error();}},request,principal,expired),/financial_deadline/);assert.equal(calls,0);
 let aborted=false;const stalled={rpc(name,args){if(name!=='commit_research_author_handoff_v2')return db.rpc(name,args);return {abortSignal(signal){return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('synthetic_abort'));},{once:true}));}};}};
 const d=new FinancialDeadline();Object.defineProperty(d,'end',{value:performance.now()+500});await assert.rejects(runResearchAuthorHandoff(stalled,request,principal,d),/financial_deadline|synthetic_abort/);assert.equal(aborted,true);
});
