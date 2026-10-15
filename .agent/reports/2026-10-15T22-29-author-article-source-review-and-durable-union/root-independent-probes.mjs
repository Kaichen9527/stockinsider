import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root='file:///tmp/stockinsider-discovery-release-root-review-oct14/';
const {articleFixture}=await import(root+'scripts/research-v3-author-article-fixture.mjs');
const {createV3BusinessArticleValidator}=await import(root+'web/src/lib/research-v3-business-article.ts');
const {createV3AuthorArticleComposition}=await import(root+'web/src/lib/research-v3-author-result.ts');
const {resolveConfiguredResearchControllerPrincipals}=await import(root+'web/src/lib/research-execution-binding.ts');
const {FinancialIoDeadline}=await import(root+'web/src/lib/research-financial-io-owner.ts');
process.env.INTERNAL_API_KEY='root-synthetic-contract-author';
process.env.RESEARCH_REVIEW_KEY='root-synthetic-contract-reviewer';
const principal=resolveConfiguredResearchControllerPrincipals().authorPrincipalId;
assert.equal(typeof principal,'string');
const baseline=JSON.parse(fs.readFileSync('/tmp/stockinsider-original-article-coverage-oct15/coverage-baseline.json'));
const checks=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
const val=x=>createV3BusinessArticleValidator({bindingTexts:[x.text],executorFingerprint:x.binding.core.compiledFingerprintIdentity});
const run=(x)=>val(x).validate(x.db,JSON.stringify(x.request),x.saved.revision_id,x.saved.input_hash,JSON.stringify(x.article),[x.source]);
const comp=x=>createV3AuthorArticleComposition({bindingTexts:[x.text],executorFingerprint:x.binding.core.compiledFingerprintIdentity});
const req=(x,headers={})=>new Request('https://root-contract.invalid/',{method:'POST',headers:{authorization:'Bearer '+process.env.INTERNAL_API_KEY,'content-type':'application/json','x-research-author-result-action':'readAuthorPacket',...headers},body:JSON.stringify({action:'readAuthorPacket',input:x.request,inputRevisionId:x.saved.revision_id,inputHash:x.saved.input_hash})});
for(const symbol of ['2409','2383']){
 const x=await articleFixture(symbol,principal),b=baseline.articles.find(a=>a.symbol===symbol);
 assert.equal(sha(Buffer.from(x.markdown)),b.sha256);
 const reconstructed=x.article.summary.text+x.article.sections.map(s=>'## '+s.title+'\n'+s.paragraphs.map(p=>p.text).join('').slice(0,-1)).join('')+x.article.companyBackground;
 assert.equal(reconstructed,x.markdown);
 const tableCount=(x.markdown.match(/^\|(?:---|[ :|-])+\|\s*$/gm)||[]).length;
 assert.equal(tableCount,b.blocks.filter(v=>v.kind==='table').length);
 checks.push({name:symbol+' complete original Markdown reconstructed against independent baseline',tables:tableCount,sha256:b.sha256});
 const result=await run(x);const saved=JSON.stringify(result.validatedArticle);
 x.article.sections[0].paragraphs[0].text='mutated caller text after validation';x.source.url='https://mutated.invalid/';
 assert.equal(JSON.stringify(result.validatedArticle),saved);
 checks.push({name:symbol+' detached article/source snapshot'});
 for(const reference of [{kind:'assumption',pointer:'/scenarios/1/quarters/0/source/page'},{kind:'calculation',pointer:'/scenarios/1/quarters/0/period'},{kind:'reported_observation',pointer:'/monthlyFacts/0/publicationAt'}]){
  const z=await articleFixture(symbol,principal);z.article.tables[0].rows[0].reference=reference;await assert.rejects(run(z));
 }
 checks.push({name:symbol+' provenance and period metadata cannot become numeric table facts'});
}
{
 const x=await articleFixture('2409',principal);let calls=0;
 await assert.rejects(comp(x).readAuthorPacket(req(x,{'x-internal-key':'irrelevant-synthetic'}),{rpc:async()=>{calls++;throw Error('unexpected');}}));
 assert.equal(calls,0);checks.push({name:'conflicting auth header rejects before DB work'});
}
{
 const x=await articleFixture('2383',principal),deadline=new FinancialIoDeadline();let reads=0;
 const db={rpc:async(name,args)=>{reads++;const r=await x.db.rpc(name,args);if(name==='read_research_author_packet_candidate_v3')deadline.controller.abort();return r;}};
 await assert.rejects(comp(x).readAuthorPacket(req(x),db,deadline),/financial_deadline/);assert.equal(reads,3);
 checks.push({name:'same deadline remains authoritative after packet RPC; no reset'});
}
console.log(JSON.stringify({subject:'5609fe1ddbc3d4432de77a3c88ec596d1c28c736',groups:checks.length,checks,externalRpc:'synthetic',native:false,formalPublication:false},null,2));
