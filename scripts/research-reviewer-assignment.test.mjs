import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {readResearchReviewerBody,runResearchReviewerAssignment,handleResearchReviewerAssignment} from '../web/src/lib/research-reviewer-assignment.ts';
import {FinancialDeadline} from '../web/src/lib/research-financial-file-reader.ts';
import {completeCanonical,completeHash} from '../web/src/lib/research-complete-canonical.ts';
import {projectResearchAuthorPacket} from '../web/src/lib/research-author-packet.ts';
import {authorPacketFixture} from './research-author-packet-fixture.mjs';
import {authorResultFixture} from './research-author-result-fixture.mjs';
const id=()=>randomUUID(),hash='a'.repeat(64),author=randomBytes(32).toString('hex'),reviewer=randomBytes(32).toString('hex');
const input={owner:'synthetic-owner',jobId:id(),attempt:1,reservationId:id(),scope:'research_observed_v1',snapshotHash:hash,preparationId:id(),preparationHash:hash,expectedArtifactManifestHash:hash,expectedCalculatorExecutionHash:hash};
const body=action=>({action,input,inputRevisionId:id(),inputHash:hash,resultId:id(),resultHash:hash});
const req=(raw,action='assignReviewer',headers={})=>new Request('http://localhost/fixture',{method:'POST',headers:{'content-type':'application/json','x-research-execution-version':'2','x-research-review-assignment-action':action,...headers},body:raw});
for(const action of ['assignReviewer','readReviewerAssignment','readReviewerPacket'])test(action+' strict8192 byte body, header discrimination and UTF8',async()=>{
 const b=JSON.stringify(body(action)),raw=b+' '.repeat(8192-Buffer.byteLength(b));assert.equal((await readResearchReviewerBody(req(raw,action),new FinancialDeadline())).action,action);
 for(const bad of [raw+' ',new Uint8Array([0xff]),b.replace('"action":','"\\u0061ction":"'+action+'","action":'),b.replace('"input":{','"input":{"extra":'+ '['.repeat(14)+'0'+']'.repeat(14)+',')])await assert.rejects(readResearchReviewerBody(req(bad,action),new FinancialDeadline()));
 for(const key of ['x-research-author-result-action','x-research-author-handoff-action'])await assert.rejects(readResearchReviewerBody(req(b,action,{[key]:'read'}),new FinancialDeadline()));
});
test('body stall cancelled; expired read launches no I/O',async()=>{
 let cancelled=false;const stream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}}),r=new Request('http://localhost/fixture',{method:'POST',headers:{'content-type':'application/json','x-research-review-assignment-action':'assignReviewer'},body:stream,duplex:'half'}),d=new FinancialDeadline();Object.defineProperty(d,'end',{value:performance.now()+30});await assert.rejects(readResearchReviewerBody(r,d),/financial_deadline/);assert.equal(cancelled,true);
 let reads=0;const mock={headers:r.headers,body:{getReader:()=>({read:()=>{reads++;return Promise.resolve({done:true});},cancel:async()=>{},releaseLock(){}})}};const expired=new FinancialDeadline();Object.defineProperty(expired,'end',{value:performance.now()-1});await assert.rejects(readResearchReviewerBody(mock,expired),/financial_deadline/);assert.equal(reads,0);
});
test('author, cron, tester and unknown credentials cannot enter reviewer body/DB',async()=>{
 const keys=['INTERNAL_API_KEY','RESEARCH_REVIEW_KEY','CRON_SECRET','RESEARCH_TEST_KEY','STRATEGY_APPROVAL_KEY'],prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{process.env.INTERNAL_API_KEY='synthetic-A';process.env.RESEARCH_REVIEW_KEY='synthetic-R';process.env.CRON_SECRET='synthetic-C';process.env.RESEARCH_TEST_KEY='synthetic-T';delete process.env.STRATEGY_APPROVAL_KEY;
 for(const key of ['synthetic-A','synthetic-C','synthetic-T','wrong',''])assert.equal((await handleResearchReviewerAssignment(req('{}','assignReviewer',{authorization:'Bearer '+key}))).status,401);
 assert.equal((await handleResearchReviewerAssignment(req('{}','assignReviewer',{authorization:'Bearer synthetic-R'}))).status,400);
 }finally{for(const [k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
for(const symbol of ['2409','2383'])test(symbol+' actual fixed calculation, synthetic completed author and atomic reviewer transport',async()=>{
 const f=await authorPacketFixture(symbol),publicPacket=projectResearchAuthorPacket(f.request,f.revision,f.assignment,f.response,new FinancialDeadline()).packet;
 const draft=authorResultFixture(f.request,f.revision,publicPacket),result={result_id:id(),assignment_id:publicPacket.assignmentId,result_hash:completeHash(draft.envelope),logical_bytes:Buffer.byteLength(completeCanonical(draft.envelope)),received_at:new Date().toISOString(),payload:draft.envelope};
 const a={...f.assignment,controller_principal:author,canonical_request:f.request.input},completed=new Date().toISOString();
 const context={authorContext:{assignment:a,result,revision:f.revision,completion:{reservation_id:a.reservation_id,owner:a.work_owner,outcome:'completed',result_hash:draft.envelope.validatedArticle.articleHash,finished_at:completed}},reviewerAssignment:null};
 const request={...f.request,action:'assignReviewer',resultId:result.result_id,resultHash:result.result_hash};let reserves=0,blocked=true,lose=false;
 const db={rpc(name,args){assert.equal(args.p_author_principal,author);assert.equal(args.p_reviewer_principal,reviewer);let data;
 if(name==='read_research_reviewer_context_v2')data=structuredClone(context);
 else if(name==='assign_research_reviewer_v2'){
  reserves++;if(blocked)data=null;else{context.reviewerAssignment??={assignment_id:id(),author_assignment_id:a.assignment_id,author_result_id:result.result_id,author_result_hash:result.result_hash,job_id:a.job_id,attempt:a.attempt,input_revision_id:a.input_revision_id,input_hash:a.input_hash,reviewer_principal:reviewer,work_owner:a.work_owner,reservation_id:id(),reservation_started_at:new Date().toISOString(),reservation_expires_at:a.reservation_expires_at,original_job_deadline:a.original_job_deadline,assigned_at:new Date().toISOString()};data=context.reviewerAssignment;}
  if(lose){lose=false;const p=Promise.reject(new Error('synthetic_lost_response'));p.catch(()=>{});return Object.assign(p,{abortSignal:()=>p});}
 }else if(name==='read_research_reviewer_sources_v2')data={sourceSealReceivedAt:f.response.sourceSealReceivedAt,sources:f.response.sources};else throw new Error('unexpected mutation '+name);
 const p=Promise.resolve({data,error:null});return Object.assign(p,{abortSignal:()=>p});}};
 const run=(r=request)=>runResearchReviewerAssignment(db,r,author,reviewer,new FinancialDeadline());
 assert.equal((await run({...request,action:'readReviewerAssignment'})).assignment,null);assert.equal(reserves,0);
 assert.equal((await run()).blockedReason,'global_lease_or_daily_budget_exhausted');assert.equal(context.reviewerAssignment,null);
 blocked=false;lose=true;await assert.rejects(run(),/synthetic_lost_response/);const original=structuredClone(context.reviewerAssignment);
 assert.deepEqual((await run({...request,action:'readReviewerAssignment'})).assignment,Object.fromEntries(Object.entries(original).filter(([key])=>key!=='reviewer_principal')));assert.equal(reserves,2);
 assert.deepEqual((await run()).assignment,Object.fromEntries(Object.entries(original).filter(([key])=>key!=='reviewer_principal')));assert.equal(reserves,3);
 const p=await run({...request,action:'readReviewerPacket'});assert.equal(p.packetHash,completeHash(p.packet));assert.deepEqual(p.packet.article,draft.envelope.rawArticle);assert.equal(p.packet.articleHash,draft.envelope.validatedArticle.articleHash);assert.equal(p.packet.reviewerDispatched,false);assert.equal(p.packet.research.sources[0].summary,f.response.sources[0].summary);
 const encoded=JSON.stringify(p.packet);for(const value of [author,reviewer,a.work_owner,a.job_id,a.reservation_id,original.reservation_id])assert.equal(encoded.includes(value),false,'private execution binding excluded: '+value);
 assert.deepEqual((await run({...request,action:'readReviewerPacket'})).packet,p.packet);
 let writes=0;for(const mutate of [c=>c.authorContext.assignment.controller_principal='d'.repeat(64),c=>c.reviewerAssignment.reviewer_principal='d'.repeat(64),c=>c.authorContext.result.payload.validatedArticle.calculatorExecutionHash='e'.repeat(64),c=>c.authorContext.completion=null]){
  const bad=structuredClone(context);mutate(bad);const mock={rpc(name){if(name!=='read_research_reviewer_context_v2')writes++;const p=Promise.resolve({data:bad,error:null});return Object.assign(p,{abortSignal:()=>p});}};await assert.rejects(runResearchReviewerAssignment(mock,request,author,reviewer,new FinancialDeadline()));
 }assert.equal(writes,0);
 const d=new FinancialDeadline();Object.defineProperty(d,'end',{value:performance.now()-1});await assert.rejects(runResearchReviewerAssignment({rpc(){writes++;throw Error();}},request,author,reviewer,d),/financial_deadline/);assert.equal(writes,0);
});
