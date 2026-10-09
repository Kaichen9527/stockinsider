import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {readResearchPublicationBody,handleResearchPublication,validateResearchPublicationContext,runResearchPublication} from '../web/src/lib/research-atomic-publication.ts';
import {reviewerResultFixture,syntheticReviewCredentials} from './research-reviewer-result-fixture.mjs';
import {completeCanonical,completeHash} from '../web/src/lib/research-complete-canonical.ts';
import {FinancialDeadline} from '../web/src/lib/research-financial-file-reader.ts';
function env(t){const keys=['INTERNAL_API_KEY','RESEARCH_REVIEW_KEY','CRON_SECRET','RESEARCH_TEST_KEY','STRATEGY_APPROVAL_KEY'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));for(const k of keys)delete process.env[k];Object.assign(process.env,syntheticReviewCredentials);t.after(()=>{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});}
async function fixture(){const f=await reviewerResultFixture(),id=randomUUID(),received=new Date().toISOString();
 const result={result_id:id,assignment_id:f.context.reviewerAssignment.assignment_id,result_hash:completeHash(f.envelope),logical_bytes:Buffer.byteLength(completeCanonical(f.envelope)),received_at:received,payload:f.envelope};
 f.context.reviewResult=result;f.context.reviewCompletion={reservation_id:f.context.reviewerAssignment.reservation_id,owner:f.context.reviewerAssignment.work_owner,outcome:'completed',result_hash:result.result_hash,finished_at:received};
 return {...f,publication:{action:'publishResearchArticle',input:f.request.input,inputRevisionId:f.request.inputRevisionId,inputHash:f.request.inputHash,authorResultId:f.request.resultId,authorResultHash:f.request.resultHash,reviewerResultId:id,reviewerResultHash:result.result_hash}};}
const wire=(body,extra={})=>new Request('http://localhost/api/internal/research-deep-job',{method:'POST',headers:{'content-type':'application/json','x-research-input-version':'2','x-research-publication-action':'publishResearchArticle',...extra},body:typeof body==='string'?body:JSON.stringify(body)});
test('closed publication request permits only original result identities; all mixed controls rejected',async()=>{
 const f=await fixture(),body=f.publication;assert.deepEqual(await readResearchPublicationBody(wire(body),new FinancialDeadline()),body);
 for(const patch of [{accepted:true},{article:{}},{principal:'x'},{leaseSeconds:1800},{command:'x'},{url:'https://example.com'},{action:'publishAnything'},{inputHash:['a'.repeat(64)]},{reviewerResultId:null}])await assert.rejects(readResearchPublicationBody(wire({...body,...patch}),new FinancialDeadline()));
 for(const h of ['x-research-execution-version','x-research-author-result-action','x-research-author-handoff-action','x-research-review-result-action','x-research-review-assignment-action'])await assert.rejects(readResearchPublicationBody(wire(body,{[h]:'mixed'}),new FinancialDeadline()));
 for(const h of [{'content-type':'text/plain'},{'x-research-input-version':'1'}])await assert.rejects(readResearchPublicationBody(wire(body,h),new FinancialDeadline()));
 const encoded=JSON.stringify(body);await assert.rejects(readResearchPublicationBody(wire(encoded.slice(0,-1)+',"action":"publishResearchArticle"}'),new FinancialDeadline()));
 await assert.rejects(readResearchPublicationBody(wire(encoded+' '.repeat(8193)),new FinancialDeadline()));
});
test('stalled reader cancels under original deadline, expired execution starts zero I/O',async()=>{
 let cancelled=false;const stream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}});
 const request=new Request('http://localhost/fixture',{method:'POST',headers:{'content-type':'application/json','x-research-input-version':'2','x-research-publication-action':'publishResearchArticle'},body:stream,duplex:'half'});
 const d=new FinancialDeadline();Object.defineProperty(d,'end',{value:performance.now()+20});await assert.rejects(readResearchPublicationBody(request,d),/financial_deadline/);assert.equal(cancelled,true);
 const f=await fixture(),expired=new FinancialDeadline();Object.defineProperty(expired,'end',{value:performance.now()-1});let io=0;await assert.rejects(runResearchPublication({rpc(){io++;throw Error();}},f.publication,f.pair.authorPrincipalId,f.pair.reviewerPrincipalId,expired),/financial_deadline/);assert.equal(io,0);
});
test('only actual independent configured author bearer can reach publication body',async t=>{
 env(t);for(const key of [syntheticReviewCredentials.RESEARCH_REVIEW_KEY,'synthetic-cron','synthetic-tester','unknown',''])assert.equal((await handleResearchPublication(wire('{}',{authorization:'Bearer '+key}))).status,401);
 assert.equal((await handleResearchPublication(wire('{}',{authorization:'Bearer '+syntheticReviewCredentials.INTERNAL_API_KEY}))).status,400);
 assert.equal((await handleResearchPublication(wire('{}',{authorization:'Bearer '+syntheticReviewCredentials.INTERNAL_API_KEY,'x-internal-key':syntheticReviewCredentials.INTERNAL_API_KEY}))).status,401);
});
test('saved reports and calculators revalidated; no synthetic reviewer Request or caller prose authority',async t=>{
 env(t);const f=await fixture();const validate=(ctx=f.context)=>validateResearchPublicationContext(f.publication,ctx,f.sources,f.pair.authorPrincipalId,f.pair.reviewerPrincipalId,new FinancialDeadline());
 const content=validate();assert.equal(content.deepResearch.entryEligible,false);assert.equal(content.deepResearch.articleHash,f.packet.articleHash);
 const original=structuredClone(f.context);for(const mutate of [c=>c.reviewResult.payload.rawReview.decision='needs_revision',c=>c.reviewResult.payload.packet.tables=[],c=>c.authorContext.result.payload.rawArticle.summary+=' changed',c=>c.reviewCompletion.outcome='failed',c=>c.reviewResult.payload.observation.threadId=c.authorContext.result.payload.observation.threadId,c=>c.reviewResult.received_at='2026-01-01T00:00:00Z']){const bad=structuredClone(f.context);mutate(bad);assert.throws(()=>validate(bad));}assert.deepEqual(f.context,original);
 process.env.RESEARCH_REVIEW_KEY='rotated-real-server-config';assert.throws(()=>validate());
});
test('completed read precedes live readers and never reserves or rewrites content',async()=>{
 const f=await fixture(),calls=[];const db={rpc(name){calls.push(name);const p=Promise.resolve({data:null,error:null});return Object.assign(p,{abortSignal:()=>p});}};
 assert.equal(await runResearchPublication(db,{...f.publication,action:'readResearchPublication'},f.pair.authorPrincipalId,f.pair.reviewerPrincipalId,new FinancialDeadline()),null);assert.deepEqual(calls,['read_completed_research_publication_v2']);
});
