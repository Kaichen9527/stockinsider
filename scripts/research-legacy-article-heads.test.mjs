import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as qualification from '../web/src/lib/research-agent-qualification.ts';
import * as rights from '../web/src/lib/research-deep-source-rights.ts';
import * as urls from '../web/src/lib/public-source-url.ts';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const ts = require('typescript');
const originalId = '00000000-0000-4000-8000-000000000001';
const withdrawnId = '00000000-0000-4000-8000-000000000002';

// Exercise the actual public loader, qualification and rights checks against an
// already-accepted synthetic v1 dossier. Unrelated financial/dossier input hash
// checks are fixed fixtures; this is no claim of real authorship or publishing.
async function fixture({ heads=[{id:originalId,headId:originalId,retracted:false,superseded:false}], error=null,
  rejected=false, missingDoc=false, documentError=false, storedRetraction=false, duplicateDocs=false }={}) {
  const now=Date.now();const article={schemaVersion:'candidate-deep-research-v1',symbol:'2409',articleHash:'a'.repeat(64),sourceDocumentIds:[originalId]};
  const overlay={deepResearch:article};
  const thesis={articleHash:qualification.researchCanonicalHash(overlay),status:'qualified',qualifiedAt:new Date(now-10000).toISOString(),nextReviewAt:new Date(now+86400000).toISOString(),reviewReceiptHash:'review'};
  const doc={id:originalId,document_url:'https://example.test/source',published_at:new Date(now-30000).toISOString(),metadata:{canonical_url:'https://example.test/source',visibility:'public',...(storedRetraction?{retracted_at:new Date(now-1000).toISOString()}:{})}};
  const withdrawn={...doc,id:withdrawnId,document_url:'https://example.test/source#si-revision-bbbbbbbbbbbbbbbb',metadata:{...doc.metadata,retracted_at:new Date(now-1000).toISOString()}};
  const rows={stocks:{id:'stock',symbol:'2409',name:'AUO'},candidate_detail_snapshots:{id:'revision',stock_id:'stock',session_date:'2026-10-08',as_of:new Date(now-30000).toISOString(),available_at:new Date(now-20000).toISOString(),fact_ids:[]},candidate_research_dossiers:[{id:'dossier',bundle_id:'bundle',input_hash:'fixed-valid-input',validation_status:'valid',published_at:new Date(now-5000).toISOString(),content:overlay}],candidate_dossier_submission_receipts:[{dossier_id:'dossier',bundle_id:'bundle',revision_id:'revision',input_hash:'fixed-valid-input',status:'accepted'}],candidate_deep_article_reviews_v1:[{decision:'accepted'}],source_raw_documents:missingDoc?[]:duplicateDocs?[doc,doc]:[doc,withdrawn],candidate_thesis_qualifications_v1:{id:'thesis',payload:thesis,status:thesis.status,article_hash:thesis.articleHash},candidate_technical_decisions_v1:{snapshot:{reviewReceiptHash:'review',articleHash:thesis.articleHash,symbol:'2409',entryResearchEligible:true}}};
  const calls=[];
  const db={from(table){let data=rows[table]??[];const query={select(){return query},eq(){return query},order(){return query},limit(){return query},maybeSingle(){return Promise.resolve({data,error:null})},in(k,ids){data=data.filter(r=>ids.includes(r[k]));return query},then(resolve){calls.push(table);resolve({data,error:table==='source_raw_documents'&&documentError?{message:'private query diagnostic'}:null});}};return query},async rpc(name,args){
    calls.push(name);if(name==='read_taiwan_data_publication_metadata_v5')return{data:null,error:null};assert.equal(name,'research_evidence_heads_v1');assert.deepEqual(JSON.parse(JSON.stringify(args.p_ids)),[originalId]);
    assert.ok(Date.parse(args.p_cutoff)>=now);if(rejected)throw new Error('private connection diagnostic');return{data:heads,error};}};
  const modules={'./supabase-server':{getSupabaseServerClient:()=>db},'./candidate-detail-fact-batches':{chunkCandidateFactIds:()=>[]},'./candidate-dossier-contract':{candidateDossierInputHash:()=> 'fixed-valid-input',factReferenceNumbers:()=>new Map(),isPaidInvestAnchorsReference:()=>false,numberedCandidateSources:()=>[]},'./public-source-url.ts':urls,'./tw-market.ts':{resolveTaiwanFinalPublicationSemantics:()=>({status:'confirmed',completenessPct:100,missingComponents:[]})},'./candidate-revision-context.ts':{readCandidateRevisionContext:()=>({scores:{},status:'available',riskAction:null})},'./candidate-trade-plan.ts':{readCandidateTradePlan:()=>null},'./research-deep-source-rights.ts':rights,'./research-agent-qualification.ts':qualification};
  const source=readFileSync(new URL('../web/src/lib/candidate-detail.ts',import.meta.url),'utf8');const exports={};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(n in modules,n);return modules[n]},Date,URL,console});
  const detail=await exports.loadCandidateDetail('2409');return{detail,calls};
}

test('legacy reader requires the original source to remain its verified current head',async()=>{
  const {detail,calls}=await fixture();assert.ok(calls.includes('research_evidence_heads_v1'));
  assert.equal(detail.thesisQualification.entryResearchAllowed,true);assert.equal(detail.deepResearchSources[0].evidenceStatus,'current');
});
for(const [label,options,status] of [
 ['append-only withdrawal',{heads:[{id:originalId,headId:withdrawnId,retracted:true,superseded:true}]},'retracted'],
 ['newer non-withdrawn revision',{heads:[{id:originalId,headId:withdrawnId,retracted:false,superseded:true}]},'superseded'],
 ['null head',{heads:[{id:originalId,headId:null,retracted:false,superseded:false}]},'unavailable'],
 ['incomplete heads',{heads:[]},'unavailable'],
 ['RPC failure',{error:{message:'private query diagnostic'}},'unavailable'],
 ['connection rejection',{rejected:true},'unavailable'],
 ['unknown head identity',{heads:[{id:withdrawnId,headId:withdrawnId,retracted:false,superseded:false}]},'unavailable'],
 ['malformed flags',{heads:[{id:originalId,headId:originalId,retracted:'false',superseded:false}]},'unavailable'],
 ['extra head',{heads:[{id:originalId,headId:originalId,retracted:false,superseded:false},{id:withdrawnId,headId:withdrawnId,retracted:false,superseded:false}]},'unavailable'],
 ['malformed head',{heads:[null]},'unavailable'],
 ['stored withdrawal',{storedRetraction:true},'retracted'],
 ['duplicate document rows',{duplicateDocs:true},'unavailable'],
]) test(`legacy reader ${label} keeps the historical article and denies new entry`,async()=>{
  const {detail}=await fixture(options);assert.ok(detail.deepResearch);assert.equal(detail.thesisQualification.entryResearchAllowed,false);
  assert.equal(detail.deepResearchSources[0].evidenceStatus,status);assert.equal(detail.deepResearchSources[0].retracted,status==='retracted');
  assert.equal(detail.thesisQualification.reason,'article_source_retracted_superseded_or_unavailable');
  assert.equal(detail.latestTechnicalSnapshot.entryResearchEligible,true,'retain original technical snapshot, with current eligibility separately denied');
  assert.equal(JSON.stringify(detail).includes('private query diagnostic'),false);
});
for(const options of [{missingDoc:true},{documentError:true}])test('missing source evidence does not erase the reviewed historical article',async()=>{
  const {detail}=await fixture(options);assert.ok(detail.deepResearch);assert.equal(detail.deepResearchSources.length,0);
  assert.equal(detail.thesisQualification.entryResearchAllowed,false);
});
