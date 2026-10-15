import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID}from'node:crypto';
import {articleFixture}from'./research-v3-author-article-fixture.mjs';
import {createV3BusinessArticleValidator}from'../web/src/lib/research-v3-business-article.ts';
import {createV3AuthorArticleComposition}from'../web/src/lib/research-v3-author-result.ts';
import {resolveConfiguredResearchControllerPrincipals}from'../web/src/lib/research-execution-binding.ts';
import {completeHash}from'../web/src/lib/research-v3-material-canonical.ts';
import {FinancialIoDeadline}from'../web/src/lib/research-financial-io-owner.ts';
const old={INTERNAL_API_KEY:process.env.INTERNAL_API_KEY,RESEARCH_REVIEW_KEY:process.env.RESEARCH_REVIEW_KEY};
process.env.INTERNAL_API_KEY='synthetic-author-contract-only';process.env.RESEARCH_REVIEW_KEY='synthetic-review-contract-only';
const principals=resolveConfiguredResearchControllerPrincipals();assert.equal(principals.ok,true);
const principal=principals.authorPrincipalId;
const validate=x=>createV3BusinessArticleValidator({bindingTexts:[x.text],executorFingerprint:x.binding.core.compiledFingerprintIdentity}).validate(x.db,JSON.stringify(x.request),x.saved.revision_id,x.saved.input_hash,JSON.stringify(x.article),[x.source]);
function request(x,action,observation){return new Request('https://fixture.invalid/not-an-active-route',{method:'POST',headers:{authorization:'Bearer '+process.env.INTERNAL_API_KEY,'content-type':'application/json','x-research-author-result-action':action},body:JSON.stringify({action,input:x.request,inputRevisionId:x.saved.revision_id,inputHash:x.saved.input_hash,...(action==='receiveAuthorResult'?{article:x.article,observation}:{})})});}
function observation(x,validated){return {version:'research_execution_observation_v2',assignmentId:x.assignment.assignment_id,jobId:x.request.jobId,attempt:1,reservationId:x.request.reservationId,inputRevisionId:x.saved.revision_id,inputHash:x.saved.input_hash,articleHash:validated.articleHash,reviewPackHash:null,outputHash:completeHash(x.article),verificationLevel:'trusted_controller_observation',providerSurface:'codex_cross_chat',hostId:null,threadId:randomUUID(),turnId:null,invocationId:'synthetic-source-contract-only',dispatchObservationHash:'d'.repeat(64),completionObservationHash:'e'.repeat(64),controllerObservedStartAt:x.article.authoredAt,controllerObservedEndAt:new Date().toISOString(),modelIdentity:null};}
for(const symbol of ['2409','2383']){
 test(symbol+' full original draft text and v3 cash/scenario namespaces -> actual validator',async()=>{
  const x=await articleFixture(symbol,principal),{validatedArticle:v}=await validate(x);
  assert.equal(v.article.sections.length,7);assert.equal(v.article.companyBackground,x.article.companyBackground);assert.deepEqual(v.article.sections,x.article.sections);assert.equal(v.article.summary.text,x.article.summary.text);
  const original=x.markdown.split('<details>')[0].split(/^## /m).slice(1);for(let i=0;i<7;i++)assert.equal(v.article.sections[i].paragraphs.map(p=>p.text).join(''),original[i].slice(original[i].indexOf('\n')+1)+'\n');
  assert.equal(v.tables.length,5);assert.deepEqual(v.valuations[0].periods,['2026Q3','2026Q4','2027Q1','2027Q2']);assert.deepEqual(v.valuations[1].periods,['2027Q1','2027Q2','2027Q3','2027Q4']);
  assert.equal(v.tables.at(-1).rows[1].value,symbol==='2409'?1134612:-5661917);assert.equal(v.tables.at(-1).rows[0].unit,'TWD_thousands');assert.equal(v.forecastCash,null);for(const k of ['publishableResearch','financialVerified','wireDispatchEnabled','technicalAdmission','sourceClosureApproved'])assert.equal(v[k],false);assert.ok(v.valuations.every(v=>v.targetPrice===null));
  assert.equal(x.calls.length,1);assert.equal(x.calls[0].name,'read_research_article_input_candidate_v3');
 });
 test(symbol+' authenticated actual packet/result composition remains nonpersisting candidate',async()=>{
  const x=await articleFixture(symbol,principal),{validatedArticle:v}=await validate(x);x.calls.length=0;
  const c=createV3AuthorArticleComposition({bindingTexts:[x.text],executorFingerprint:x.binding.core.compiledFingerprintIdentity});
  const packet=await c.readAuthorPacket(request(x,'readAuthorPacket'),x.db);assert.equal(packet.packet.schemaVersion,'research-author-packet-v3-candidate');assert.equal(packet.dispatchReady,false);assert.equal(JSON.stringify(packet).includes(principal),false);
  const result=await c.prepareAuthorResult(request(x,'receiveAuthorResult',observation(x,v)),x.db);assert.equal(result.envelope.schemaVersion,'research-author-result-v3-candidate');assert.equal(result.envelope.validatedArticle.articleHash,v.articleHash);assert.equal(result.persistence.status,'unavailable');assert.equal(result.publishableResearch,false);assert.equal(result.envelope.bindingCapsuleIdentity,x.binding.bindingCapsuleIdentity);assert.ok(x.calls.every(v=>!v.name.startsWith('receive')&&!v.name.startsWith('seal')));
 });
 test(symbol+' strict article mutations reject without v2 fallback',async()=>{
  const mutations=[x=>x.article.schemaVersion='candidate-deep-research-v2',x=>x.article.inputHash='0'.repeat(64),x=>x.article.sections.reverse(),x=>x.article.tables[4].rows[0].reference.citation.value++,x=>x.article.tables[4].rows[0].reference.citation.unit='TWD_million',x=>x.article.tables[4].rows[0].reference.citation.period='2026Q2',x=>x.article.tables[4].rows[0].reference.citation.pointer='/cash/references/0/pdfPage',x=>x.article.tables[4].rows[0].reference.citation.classification='conditional_scenario',x=>x.article.tables[2].rows[0].reference.pointer='/reportedFacts/0/locator/pdfPage',x=>x.article.tables[3].rows[0].reference.kind='reported_observation',x=>x.article.valuation[1].fiscalYear='2026',x=>x.source.retracted=true,x=>x.source.rights='unavailable',x=>x.source.symbols=['9999'],x=>x.article.authoredAt='2099-01-01T00:00:00Z'];
  for(const mutate of mutations){const x=await articleFixture(symbol,principal);mutate(x);await assert.rejects(validate(x));}
 });
 test(symbol+' missing candidate SQL, wrong principal/packet context and stale source fail closed',async()=>{
  for(const mode of ['missing','principal','binding','source']){
   const x=await articleFixture(symbol,principal),c=createV3AuthorArticleComposition({bindingTexts:[x.text],executorFingerprint:x.binding.core.compiledFingerprintIdentity});
   if(mode==='principal')x.assignment.controller_principal='0'.repeat(64);if(mode==='binding')x.packet.bindingCapsuleIdentity='0'.repeat(64);if(mode==='source')x.packet.sources[0].descriptor.retracted=true;
   const db=mode==='missing'?{rpc:async(name,args)=>name==='read_research_article_input_candidate_v3'?x.db.rpc(name,args):({data:null,error:{code:'42883'}})}:x.db;
   await assert.rejects(c.readAuthorPacket(request(x,'readAuthorPacket'),db));assert.ok(x.calls.every(v=>['read_research_article_input_candidate_v3','read_research_author_assignment_v2','read_research_author_packet_v2'].includes(v.name)));
  }
 });
}
test('auth first, primitive bounds, duplicate JSON and shared expired deadline',async()=>{
 const x=await articleFixture('2409',principal),c=createV3AuthorArticleComposition({bindingTexts:[x.text],executorFingerprint:x.binding.core.compiledFingerprintIdentity});let calls=0;const db={rpc:async()=>{calls++;throw Error('must not call');}};
 await assert.rejects(c.prepareAuthorResult(new Request('https://fixture.invalid',{method:'POST',body:'bad'}),db));assert.equal(calls,0);
 const expired=new FinancialIoDeadline();expired.controller.abort();await assert.rejects(c.readAuthorPacket(request(x,'readAuthorPacket'),db,expired),/financial_deadline/);assert.equal(calls,0);
 const v=createV3BusinessArticleValidator({bindingTexts:[x.text],executorFingerprint:x.binding.core.compiledFingerprintIdentity});for(const body of [' '.repeat(262145),' {"schemaVersion":"x","schemaVersion":"y"}'])await assert.rejects(v.validate(db,JSON.stringify(x.request),x.saved.revision_id,x.saved.input_hash,body,[x.source]));assert.equal(calls,0);
 await assert.rejects(x.consumer.read(x.db,JSON.stringify(x.request),x.saved.revision_id,x.saved.input_hash,expired),/financial_deadline/);
});
test('author observation wrong output/identity clock rejected and deadline never reset',async()=>{
 const x=await articleFixture('2383',principal),{validatedArticle:v}=await validate(x),c=createV3AuthorArticleComposition({bindingTexts:[x.text],executorFingerprint:x.binding.core.compiledFingerprintIdentity});
 for(const delta of [{articleHash:'0'.repeat(64)},{outputHash:'0'.repeat(64)},{controllerObservedStartAt:'2099-01-01T00:00:00Z'},{assignmentId:randomUUID()}])await assert.rejects(c.prepareAuthorResult(request(x,'receiveAuthorResult',{...observation(x,v),...delta}),x.db));
 const deadline=new FinancialIoDeadline(),db={rpc:async(name,args)=>{const response=await x.db.rpc(name,args);deadline.controller.abort();return response;}};await assert.rejects(c.readAuthorPacket(request(x,'readAuthorPacket'),db,deadline),/financial_deadline/);assert.equal(deadline.controller.signal.aborted,true);
});
test('bounded receive/read wire and unknown request keys reject before any RPC',async()=>{
 const x=await articleFixture('2409',principal),c=createV3AuthorArticleComposition({bindingTexts:[x.text],executorFingerprint:x.binding.core.compiledFingerprintIdentity});let calls=0;const db={rpc:async()=>{calls++;throw Error('no RPC');}};
 for(const [action,body] of [['receiveAuthorResult',' '.repeat(1048577)],['readAuthorPacket',' '.repeat(8193)],['readAuthorPacket',JSON.stringify({action:'readAuthorPacket',input:x.request,inputRevisionId:x.saved.revision_id,inputHash:x.saved.input_hash,validated:true})]]){
  const req=new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer '+process.env.INTERNAL_API_KEY,'content-type':'application/json','x-research-author-result-action':action},body});
  await assert.rejects(action==='readAuthorPacket'?c.readAuthorPacket(req,db):c.prepareAuthorResult(req,db));
 }assert.equal(calls,0);
});
test('old77/v2 and binding/hash/source metadata cannot be selected through v3 request fields',async()=>{
 const x=await articleFixture('2409',principal),v=createV3BusinessArticleValidator({bindingTexts:[x.text],executorFingerprint:x.binding.core.compiledFingerprintIdentity});let calls=0;const db={rpc:async()=>{calls++;throw Error('no RPC');}};
 for(const patch of [{expectedCalculatorExecutionHash:'77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41'},{root:'/tmp'},{validated:true},{schema:'caller-schema'}])await assert.rejects(v.validate(db,JSON.stringify({...x.request,...patch}),x.saved.revision_id,x.saved.input_hash,JSON.stringify(x.article),[x.source]));assert.equal(calls,0);
 const config=JSON.parse(x.text);config.wireVersion='research-article-input-v2';assert.throws(()=>createV3AuthorArticleComposition({bindingTexts:[JSON.stringify(config)],executorFingerprint:x.binding.core.compiledFingerprintIdentity}));
});
test('packet snapshot cannot authorize later article READ after source revocation',async()=>{
 const x=await articleFixture('2383',principal),{validatedArticle:v}=await validate(x),c=createV3AuthorArticleComposition({bindingTexts:[x.text],executorFingerprint:x.binding.core.compiledFingerprintIdentity});let reads=0;
 const db={rpc:async(name,args)=>{if(name==='read_research_article_input_candidate_v3'&&++reads===2)throw Object.assign(Error('source_seal_invalidated_or_missing'),{code:'P0001'});return x.db.rpc(name,args);}};
 await assert.rejects(c.prepareAuthorResult(request(x,'receiveAuthorResult',observation(x,v)),db),e=>e.code==='P0001'&&e.message==='source_seal_invalidated_or_missing');assert.equal(reads,2);assert.ok(x.calls.every(v=>!v.name.startsWith('receive')));
});
test.after(()=>{for(const[k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
