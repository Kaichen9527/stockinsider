import assert from 'node:assert/strict';
import test from 'node:test';
import {auditPublishedThesis,type ThesisAuditInput} from './thesis-audit.ts';
import {REQUIRED_SECTIONS,validateArtifact,validateReview,type Artifact,type Evidence,type Review} from './research.ts';
import {inputHash} from './policy.ts';

/** Actual audit/validators, synthetic original EPS and reviewer transport data.
 * No real issuer, SQL validation, semantic review or provider call is asserted. */
test('a reviewed EPS=1 fact renamed to catalyst checklist IDs cannot establish any catalyst criterion',()=>{
 const cutoff='2026-10-21T08:00:00.000Z';
 const eps:Evidence={id:'00000000-0000-4000-8000-000000000001',key:'quarterly_diluted_eps',value:1,unit:'TWD_per_share',period:'2026-06-30',kind:'fact',sourceTier:'official',source:'https://mops.twse.com.tw/synthetic-only/eps',eventAt:'2026-10-21T06:00:00.000Z',availableAt:'2026-10-21T07:00:00.000Z',contentHash:inputHash('synthetic original quarterly EPS=1; no catalyst assertion')};
 const claims:Artifact['claims']=['dated','verified','mechanism_documented','falsifier_defined'].map(key=>({id:`check:catalyst_${key}`,text:'The cited synthetic quarterly EPS is exactly1 TWD per share. This fact establishes no catalyst criterion.',kind:'fact',evidenceIds:[eps.id],numeric:{key:'quarterly_diluted_eps',value:1,unit:'TWD_per_share',period:'2026-06-30'}}));
 const artifact:Artifact={schemaVersion:'stockinsider-vnext-research-v1',model:'synthetic-source-only',modelVersion:'synthetic-v1',inputHash:inputHash('synthetic frozen input'),outputHash:'',claims,
  sections:Object.fromEntries(REQUIRED_SECTIONS.map(key=>[key,{text:'Synthetic EPS numeric support only; catalyst authority remains missing.',evidenceIds:[eps.id],claimIds:claims.map(claim=>claim.id)}])),
  quoteDate:'2026-10-21',valuationDate:'2026-10-21',annualEps:null,nextFourQuarterEps:null,gaps:['annual_eps_missing','next_four_quarter_eps_missing','quote_authority_missing']};
 artifact.outputHash=inputHash({...artifact,outputHash:undefined});
 const review:Review={approved:true,authorOutputHash:artifact.outputHash,modelVersion:'synthetic-independent-arithmetic-review',findings:[],factsChecked:true,valuationChecked:true,claimsChecked:true,
  claimChecks:claims.map(claim=>({claimId:claim.id,verdict:'supported',reason:'Synthetic source-hash-bound numeric comparison supports EPS=1 only, with no catalyst semantics.',sources:[{id:eps.id,contentHash:eps.contentHash}]}))};
 assert.deepEqual(validateArtifact(artifact,[eps],artifact.inputHash),{valid:true,reasons:[]});
 assert.deepEqual(validateReview(review,artifact,[eps]),[]);
 const input:ThesisAuditInput={symbol:'2330',inputHash:artifact.inputHash,revisionId:'00000000-0000-4000-8000-000000000002',publishedInputHash:artifact.inputHash,artifact,review,original:[eps],current:[eps],newContent:[],
  quote:{close:null,session:null,source:'',adjusted:false,volume:null,ma20:null,ma60:null,volumeRatio:null,institutionalFlow:null},cutoff,market:{risk:'unknown',snapshotHash:null},previousMarketHash:null,tradingValid:null};
 const audit=auditPublishedThesis(input);
 assert.equal(audit.deepScore.factors.catalysts.value,null,'Reserved claim IDs cannot turn unrelated EPS arithmetic into verified catalyst evidence.');
 assert.equal(audit.deepScore.confirmedPoints,0);
 assert.ok(audit.deepInputs.catalystChecklist?.checks.every(check=>check.met===null));
 assert.ok(audit.gaps.includes('semantic_criterion_authority_missing:catalyst_verified'));
});

for(const kind of ['assumption','derived'] as const)test(`reviewed ${kind} scalar1 and matching criterion key still supply no semantic authority`,()=>{
 const cutoff='2026-10-21T08:00:00.000Z';
 const keys=['competitive_advantage','catalyst_dated','catalyst_verified','catalyst_mechanism_documented','catalyst_falsifier_defined','risk_bound'];
 const source:Evidence={id:'00000000-0000-4000-8000-000000000003',key:kind==='assumption'?'catalyst_verified':'quarterly_diluted_eps',value:1,unit:kind==='assumption'?'ratio':'TWD_per_share',period:'2026-06-30',kind:kind==='assumption'?'assumption':'fact',sourceTier:kind==='assumption'?'public':'official',source:kind==='assumption'?'https://example.org/synthetic-only/assumption':'https://mops.twse.com.tw/synthetic-only/eps',eventAt:'2026-10-21T06:00:00.000Z',availableAt:'2026-10-21T07:00:00.000Z',contentHash:inputHash({synthetic:true,kind,value:1})};
 const original=kind==='assumption'?[source]:[source,{...source,id:'00000000-0000-4000-8000-000000000004',contentHash:inputHash('synthetic second EPS=1')}];
 const claims:Artifact['claims']=keys.map(key=>({id:`check:${key}`,text:'The scalar is1 by an explicitly labelled unrelated assumption or EPS/EPS arithmetic; it verifies no semantic criterion.',kind,evidenceIds:original.map(e=>e.id),numeric:{key:'catalyst_verified',value:1,unit:'ratio',period:'2026-06-30',...(kind==='derived'?{formula:{operation:'divide' as const,evidenceIds:original.map(e=>e.id)}}:{})}}));
 const artifact:Artifact={schemaVersion:'stockinsider-vnext-research-v1',model:'synthetic',modelVersion:'synthetic',inputHash:inputHash({synthetic:kind}),outputHash:'',claims,
  sections:Object.fromEntries(REQUIRED_SECTIONS.map(key=>[key,{text:'Synthetic numeric support does not establish semantic truth.',evidenceIds:original.map(e=>e.id),claimIds:claims.map(c=>c.id)}])),quoteDate:'2026-10-21',valuationDate:'2026-10-21',annualEps:null,nextFourQuarterEps:null,gaps:['annual_eps_missing','next_four_quarter_eps_missing','quote_authority_missing']};
 artifact.outputHash=inputHash({...artifact,outputHash:undefined});
 const review:Review={approved:true,authorOutputHash:artifact.outputHash,modelVersion:'synthetic-independent-numeric-review',factsChecked:true,valuationChecked:true,claimsChecked:true,findings:[],claimChecks:claims.map(claim=>({claimId:claim.id,verdict:'supported',reason:'Original numeric operands/hash comparison only; no semantic authority is attested.',sources:original.map(e=>({id:e.id,contentHash:e.contentHash}))}))};
 assert.deepEqual(validateArtifact(artifact,original,artifact.inputHash),{valid:true,reasons:[]});assert.deepEqual(validateReview(review,artifact,original),[]);
 const audit=auditPublishedThesis({symbol:'2330',inputHash:artifact.inputHash,revisionId:'00000000-0000-4000-8000-000000000005',publishedInputHash:artifact.inputHash,artifact,review,original,current:original,newContent:[],cutoff,quote:{close:null,session:null,source:'',adjusted:false,volume:null,ma20:null,ma60:null,volumeRatio:null,institutionalFlow:null},market:{risk:'unknown',snapshotHash:null},previousMarketHash:null,tradingValid:null});
 assert.equal(audit.deepScore.factors.catalysts.value,null);assert.equal(audit.deepScore.confirmedPoints,0);
 const checks=[...audit.deepInputs.profitabilityChecklist!.checks,...audit.deepInputs.catalystChecklist!.checks,...audit.deepInputs.marketLiquidityChecklist!.checks];
 for(const key of keys){assert.ok(audit.gaps.includes(`semantic_criterion_authority_missing:${key}`));const check=checks.find(c=>c.key===key || `catalyst_${c.key}`===key);assert.equal(check?.met,null);assert.deepEqual(check?.provenance,[]);}
});
