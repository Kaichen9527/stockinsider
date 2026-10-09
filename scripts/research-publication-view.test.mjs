import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {publicationViewFixture} from './research-publication-view-fixture.mjs';
import {parseResearchPublicationView,publicationPreviewSelection,researchDisplayKind} from '../web/src/lib/research-publication-view.ts';
import {completeHash} from '../web/src/lib/research-complete-canonical.ts';
import {validateBusinessResearchArticle} from '../web/src/lib/research-business-article.ts';
const parse=w=>parseResearchPublicationView(w,w.researchCompanyId,w.symbol);
const rehash=w=>{w.publication.receipt.contentHash=completeHash(w.publication.content);return w;};
test('display derives only original published public content without altering hashed input',async()=>{
 const w=await publicationViewFixture(),before=structuredClone(w),v=parse(w);
 assert.deepEqual(w,before);assert.deepEqual(v.tables,w.publication.content.deepResearch.tables);assert.deepEqual(v.valuations,w.publication.content.deepResearch.valuations);
 assert.equal(v.schemaVersion,'research-company-publication-view-v2');assert.equal(v.entryEligible,false);assert.equal(Object.hasOwn(v,'receipt'),false);
 w.publication.content.deepResearch.article.sections[0].title='已改動';assert.notEqual(v.article.sections[0].title,'已改動');
 const withdrawn=structuredClone(before);withdrawn.publication.researchState='withdrawn';assert.equal(parse(withdrawn).researchState,'withdrawn');
});
test('tampering, private fields, identity conflicts and failed read never become a working draft',async()=>{
 const w=await publicationViewFixture();assert.throws(()=>parse(null));
 assert.throws(()=>parseResearchPublicationView(w,'00000000-0000-4000-8000-000000000000','2409'));
 assert.throws(()=>parseResearchPublicationView(w,w.researchCompanyId,'2383'));
 const mutations=[x=>x.privateRaw='secret',x=>x.publication.owner='secret',x=>x.publication.receipt.controllerPrincipal='secret',
  x=>x.publication.content.deepResearch.article.summary.text+=' alteration',x=>x.publication.entryEligible=true,
  x=>x.publication.content.deepResearch.article.researchCompanyId='00000000-0000-4000-8000-000000000000',
  x=>x.publication.content.deepResearch.article.sections.reverse(),x=>x.publication.content.deepResearch.article.summary.references.push({kind:'source',documentId:'unknown',rowHash:'a'.repeat(64),locator:'x'}),
  x=>x.publication.content.deepResearch.valuations[0].periods=['2027Q4','2027Q3','2027Q2','2027Q1'],
  x=>x.publication.content.deepResearch.valuations[0].targetPrice=100,x=>x.publication.content.deepResearch.valuations[0].epsConditional+=1,
  x=>x.publication.content.deepResearch.tables[0].rows[0].reference.pointer='/unrelated',x=>x.publication.content.deepResearch.limitations.push('cookie=private'),
  x=>x.publication.content.deepResearch.originalModelCutoff='2099-01-01T00:00:00Z'];
 for(const mutate of mutations){const bad=structuredClone(w);mutate(bad);assert.throws(()=>parse(bad));}
 // Even a consistent content hash does not authorize malformed display structure.
 for(const mutate of mutations.slice(5)){const bad=structuredClone(w);mutate(bad);assert.throws(()=>parse(rehash(bad)));}
});
test('public URL conversion occurs after original hash check; private targets are rejected',async()=>{
 const w=await publicationViewFixture();assert.ok(w.publication.sourceReferences.length);
 const before=structuredClone(w);w.publication.sourceReferences[0].url='https://example.com/source?token=redacted&article=1#private';
 const v=parse(w);assert.equal(v.sources[0].url,'https://example.com/source?article=1');assert.equal(w.publication.receipt.contentHash,before.publication.receipt.contentHash);
 for(const url of ['javascript:alert(1)','http://127.0.0.1/private','https://user:pass@example.com','http://[::1]/']){const bad=structuredClone(w);bad.publication.sourceReferences[0].url=url;assert.throws(()=>parse(bad));}
});
test('negative EPS cannot acquire applicable P/E; annual periods cannot borrow future-four labels',async()=>{
 const w=await publicationViewFixture(),d=w.publication.content.deepResearch;
 for(const v of d.valuations){v.epsConditional=-0.2;v.peApplicable=false;v.futurePriceSensitivity=null;v.presentValueSensitivity=null;}
 assert.ok(parse(rehash(w)).valuations.every(v=>!v.peApplicable));
 const bad=structuredClone(w);bad.publication.content.deepResearch.valuations[0].peApplicable=true;assert.throws(()=>parse(rehash(bad)));
 const annual=structuredClone(w),a=annual.publication.content.deepResearch;
 for(let i=0;i<3;i++){Object.assign(a.article.valuation[i],{period:'full_forecast_year',fiscalYear:'2027'});Object.assign(a.valuations[i],{period:'full_forecast_year',fiscalYear:'2027',periods:['2027Q1','2027Q2','2027Q3','2027Q4']});}
 assert.equal(parse(rehash(annual)).valuations[1].fiscalYear,'2027');
 a.valuations[1].periods[0]='2026Q4';assert.throws(()=>parse(rehash(annual)));
});
test('closed query and exclusive view preserve original legacy/draft choices without fallback',()=>{
 assert.deepEqual(publicationPreviewSelection({}),{kind:'draft'});const id='00000000-0000-4000-8000-000000000000';
 assert.deepEqual(publicationPreviewSelection({researchCompanyId:id}),{kind:'published',companyId:id});
 for(const v of ['',undefined,null,[id],[id,id],'not-a-uuid'])assert.throws(()=>publicationPreviewSelection({researchCompanyId:v}));
 assert.throws(()=>publicationPreviewSelection({researchCompanyId:id,owner:'x'}));
 assert.throws(()=>publicationPreviewSelection({owner:'x'}));
 assert.equal(researchDisplayKind({},undefined,undefined),'legacy');assert.equal(researchDisplayKind(null,{},undefined),'draft');
 assert.equal(researchDisplayKind(null,undefined,{}),'published');assert.equal(researchDisplayKind(null,undefined,undefined),'empty');
 for(const values of [[{},{}],[{},null,{}],[null,{},{}]])assert.throws(()=>researchDisplayKind(...values));
});
test('writer-to-reader compatibility preserves maximum catalysts, long locators and printed month/half-year units',async()=>{
 const w=await publicationViewFixture(async(f,payload)=>{
   const a=payload.rawArticle,source=payload.validatedArticle.sources[0];
   a.summary.references.push({kind:'source',documentId:source.id,rowHash:source.rowHash,locator:'a'.repeat(500)});
   a.catalysts=Array.from({length:15},(_,i)=>({...structuredClone(a.catalysts[0]),name:'合成催化劑'+i}));
   const projection=f.context.authorContext.revision.canonical_payload.financial.material.projection;
   const half=projection.reportedFacts.findIndex(x=>x.period.includes('H'));assert.ok(half>=0);
   a.tables[0].rows.push({label:'月營收',reference:{kind:'reported_observation',pointer:'/monthlyFacts/0/value'}},
    {label:'半年財報',reference:{kind:'reported_observation',pointer:`/reportedFacts/${half}/value`}});
   payload.validatedArticle=validateBusinessResearchArticle({request:f.context.authorContext.assignment.canonical_request,
     revision:f.context.authorContext.revision,sources:payload.validatedArticle.sources,now:new Date().toISOString()},a);
 });
 const v=parse(w);assert.equal(v.article.catalysts.length,15);assert.equal(v.article.summary.references.at(-1).locator.length,500);
 assert.match(v.tables[0].rows[1].periods[0],/^\d{4}-\d{2}$/);assert.equal(v.tables[0].rows[2].periods[0],'2026H1');
 assert.equal(v.tables[0].rows[2].unit,'TWD_thousands');
});
test('actual shared published component SSR escapes prose and shows periods, withdrawal and accessible folded tables',async()=>{
 const require=createRequire(new URL('../web/package.json',import.meta.url)),ts=require('typescript');
 const {renderToStaticMarkup}=require('react-dom/server'),React=require('react');
 const source=fs.readFileSync(new URL('../web/src/app/stock/[symbol]/PublishedResearchView.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText
  .replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
 const {PublishedResearchView}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
 const w=await publicationViewFixture();w.publication.content.deepResearch.article.summary.text='<script>alert(1)</script> 合成隔離測試，不是實際投資文章。';
 const v=parse(rehash(w)),html=renderToStaticMarkup(React.createElement(PublishedResearchView,{publication:v}));
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.match(html,/未取得投資資格/);assert.match(html,/未來四個未公布季度/);
 assert.match(html,/<summary[^>]*>財務與假設明細/);assert.match(html,/tabindex="0"/);assert.match(html,/scope="col"/);assert.match(html,/未附最新完整交易日行情/);
 for(const x of [v.researchCompanyId,w.publication.receipt.contentHash,'controllerObservedStartAt'])assert.ok(!html.includes(x));
 const withdrawn=renderToStaticMarkup(React.createElement(PublishedResearchView,{publication:{...v,researchState:'withdrawn'}}));assert.match(withdrawn,/來源已撤回・需要重新審查/);
});
