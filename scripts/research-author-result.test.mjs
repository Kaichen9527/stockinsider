import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {readResearchAuthorResultBody,runResearchAuthorResult,handleResearchAuthorResult} from '../web/src/lib/research-author-result.ts';
import {FinancialDeadline} from '../web/src/lib/research-financial-file-reader.ts';
import {completeCanonical,completeHash} from '../web/src/lib/research-complete-canonical.ts';
import {resolveResearchControllerIdentity} from '../web/src/lib/research-execution-binding.ts';
import {projectResearchAuthorPacket} from '../web/src/lib/research-author-packet.ts';
import {authorPacketFixture} from './research-author-packet-fixture.mjs';
import {authorResultFixture} from './research-author-result-fixture.mjs';
import {validateBusinessResearchArticle} from '../web/src/lib/research-business-article.ts';
const id=()=>randomUUID(),hash='a'.repeat(64);
const input={owner:'synthetic-owner',jobId:id(),attempt:1,reservationId:id(),scope:'research_observed_v1',snapshotHash:hash,preparationId:id(),preparationHash:hash,expectedArtifactManifestHash:hash,expectedCalculatorExecutionHash:hash};
const body=action=>({action,input,inputRevisionId:id(),inputHash:hash,...(action==='receiveAuthorResult'?{article:{},observation:{}}:{})});
const req=(raw,action='receiveAuthorResult',headers={})=>new Request('http://localhost/fixture',{method:'POST',headers:{'content-type':'application/json','x-research-execution-version':'2','x-research-author-result-action':action,...headers},body:raw});
for(const [action,limit]of [['readAuthorResult',8192],['receiveAuthorResult',1048576]])test(action+' streaming wire exact/+1 remains distinct from article/envelope limits',async()=>{
 const b=JSON.stringify(body(action)),raw=b+' '.repeat(limit-Buffer.byteLength(b));assert.equal((await readResearchAuthorResultBody(req(raw,action),new FinancialDeadline(),action)).action,action);await assert.rejects(readResearchAuthorResultBody(req(raw+' ',action),new FinancialDeadline(),action));
});
test('duplicate decoded keys, excessive nesting, invalid UTF8 and header/body disagreement reject',async()=>{
 const b=JSON.stringify(body('receiveAuthorResult'));
 for(const raw of [b.replace('"action":','"\\u0061ction":"receiveAuthorResult","action":'),b.replace('"article":{}','"article":'+ '['.repeat(14)+'0'+']'.repeat(14)),new Uint8Array([0xff]),JSON.stringify(body('readAuthorResult'))])await assert.rejects(readResearchAuthorResultBody(req(raw),new FinancialDeadline(),'receiveAuthorResult'));
});
test('stalled streaming body expires and is cancelled under same deadline',async()=>{
 let cancelled=false;const stream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}});
 const r=new Request('http://localhost/fixture',{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'}),d=new FinancialDeadline();Object.defineProperty(d,'end',{value:performance.now()+30});const start=performance.now();await assert.rejects(readResearchAuthorResultBody(r,d,'receiveAuthorResult'),/financial_deadline/);assert.ok(performance.now()-start<500);assert.equal(cancelled,true);
});
test('exhausted deadline launches no body read',async()=>{
 let reads=0;const request={headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>({read:()=>{reads++;return Promise.resolve({done:true});},cancel:async()=>{},releaseLock(){}})}};
 const d=new FinancialDeadline();Object.defineProperty(d,'end',{value:performance.now()-1});await assert.rejects(readResearchAuthorResultBody(request,d,'receiveAuthorResult'),/financial_deadline/);assert.equal(reads,0);
});
test('auth separation and malformed result discriminator fail before result handling',async()=>{
 const previous={...process.env};try{process.env.INTERNAL_API_KEY='synthetic-author';process.env.RESEARCH_REVIEW_KEY='synthetic-review';process.env.CRON_SECRET='synthetic-cron';delete process.env.RESEARCH_TEST_KEY;delete process.env.STRATEGY_APPROVAL_KEY;
  for(const key of ['', 'synthetic-review','synthetic-cron','unknown'])assert.equal((await handleResearchAuthorResult(req('{}','receiveAuthorResult',{authorization:'Bearer '+key}))).status,401);
  for(const action of ['bad','readAuthorResult'])assert.equal((await handleResearchAuthorResult(req(JSON.stringify(body('receiveAuthorResult')),action,{authorization:'Bearer synthetic-author'}))).status,400);
 }finally{for(const key of ['INTERNAL_API_KEY','RESEARCH_REVIEW_KEY','CRON_SECRET','RESEARCH_TEST_KEY','STRATEGY_APPROVAL_KEY']){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
for(const symbol of ['2409','2383'])test(symbol+' actual financial calculation with synthetic transport/execution; uncertain-write exact read',async()=>{
 const previous={...process.env};try{
 process.env.INTERNAL_API_KEY='synthetic-author';process.env.RESEARCH_REVIEW_KEY='synthetic-review';for(const key of ['CRON_SECRET','RESEARCH_TEST_KEY','STRATEGY_APPROVAL_KEY'])delete process.env[key];
 const http=req('{}','receiveAuthorResult',{authorization:'Bearer synthetic-author'}),principal=resolveResearchControllerIdentity(http,'author').principalId;
 const f=await authorPacketFixture(symbol),packet=projectResearchAuthorPacket(f.request,f.revision,f.assignment,f.response,new FinancialDeadline()).packet;
 const draft=authorResultFixture(f.request,f.revision,packet);
 if(symbol==='2383'){
  // Exercise an otherwise contract-valid article at the exact raw byte cap.
  const a=draft.request.article;let next=0;
  const append=text=>{const p={...a.summary,id:'budget_'+next,text,references:structuredClone(a.summary.references)};a.sections[next%7].paragraphs.push(p);next++;return p;};
  while(Buffer.byteLength(JSON.stringify(a))<262144-6000)append('界'.repeat(1900));
  const last=append('a'.repeat(20)),remaining=262144-Buffer.byteLength(JSON.stringify(a))+20;last.text='界'.repeat(Math.floor(remaining/3))+'a'.repeat(remaining%3);
  assert.equal(Buffer.byteLength(JSON.stringify(a)),262144);
  const validated=validateBusinessResearchArticle({request:f.request.input,revision:f.revision,sources:packet.sources.map(s=>s.descriptor),now:new Date().toISOString()},a);
  draft.request.observation.articleHash=validated.articleHash;draft.request.observation.outputHash=completeHash(a);
 }
 let persisted=null,loseResponse=true,receivedCalls=0;
 const db={rpc(name,args){let data;
  if(name==='read_research_article_input_revision_v2')data=f.revision;
  else if(name==='read_research_author_assignment_v2')data={...f.assignment,controller_principal:principal,canonical_request:f.request.input};
  else if(name==='read_research_author_packet_v2')data=f.response;
  else if(name==='receive_research_author_result_v2'){
   receivedCalls++;persisted={result_id:id(),assignment_id:packet.assignmentId,result_hash:completeHash(args.p_result),logical_bytes:Buffer.byteLength(completeCanonical(args.p_result)),received_at:new Date().toISOString(),payload:structuredClone(args.p_result)};
   if(loseResponse){loseResponse=false;const failed=Promise.reject(new Error('synthetic_lost_write_response'));failed.catch(()=>{});return Object.assign(failed,{abortSignal:()=>failed});}data=persisted;
  }else if(name==='read_research_author_result_v2')data=persisted;else throw new Error('unexpected RPC '+name);
  const p=Promise.resolve({data,error:null});return Object.assign(p,{abortSignal:()=>p});
 }};
 await assert.rejects(runResearchAuthorResult(db,draft.request,principal,http,new FinancialDeadline()),/synthetic_lost_write_response/);
 const saved=await runResearchAuthorResult(db,{...f.request,action:'readAuthorResult'},principal,http,new FinancialDeadline());assert.deepEqual(saved.result,persisted);assert.equal(receivedCalls,1);assert.equal(saved.controllerReportOnly,true);assert.equal(saved.publishableResearch,false);
 if(symbol==='2383'){const over=structuredClone(draft.request);over.article.summary.text+='a';assert.equal(Buffer.byteLength(JSON.stringify(over.article)),262145);await assert.rejects(runResearchAuthorResult(db,over,principal,http,new FinancialDeadline()));assert.equal(receivedCalls,1);}
 for(const change of [r=>r.observation.outputHash='f'.repeat(64),r=>r.article.authoredAt='2000-01-01T00:00:00Z',r=>r.observation.controllerObservedStartAt='2099-01-01T00:00:00Z']){const bad=structuredClone(draft.request);change(bad);await assert.rejects(runResearchAuthorResult(db,bad,principal,http,new FinancialDeadline()));assert.equal(receivedCalls,1);}
 let reached=false,aborted=false;
 const stalledDb={rpc(name,args){if(name!=='receive_research_author_result_v2')return db.rpc(name,args);reached=true;return {abortSignal(signal){return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(new Error('synthetic_aborted_rpc'));},{once:true});});}};}};
 const d=new FinancialDeadline();Object.defineProperty(d,'end',{value:performance.now()+500});const began=performance.now();await assert.rejects(runResearchAuthorResult(stalledDb,draft.request,principal,http,d),/financial_deadline|synthetic_aborted_rpc/);assert.equal(reached,true);assert.equal(aborted,true);assert.ok(performance.now()-began<1500);
 }finally{for(const key of ['INTERNAL_API_KEY','RESEARCH_REVIEW_KEY','CRON_SECRET','RESEARCH_TEST_KEY','STRATEGY_APPROVAL_KEY']){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
