import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveConfiguredResearchControllerPrincipals,resolveResearchControllerIdentity} from '../web/src/lib/research-execution-binding.ts';
const request=key=>new Request('http://localhost/synthetic',{headers:{authorization:'Bearer '+key}});
const initial={INTERNAL_API_KEY:'synthetic-author-A',RESEARCH_REVIEW_KEY:'synthetic-review-R'};
test('server configuration and exact credential principal agree without constructing author impersonation',()=>{
 const p=resolveConfiguredResearchControllerPrincipals(initial);assert.equal(p.ok,true);
 assert.equal(p.authorPrincipalId,resolveResearchControllerIdentity(request(initial.INTERNAL_API_KEY),'author',initial).principalId);
 assert.equal(p.reviewerPrincipalId,resolveResearchControllerIdentity(request(initial.RESEARCH_REVIEW_KEY),'reviewer',initial).principalId);
 assert.notEqual(p.authorPrincipalId,p.reviewerPrincipalId);assert.deepEqual(Object.keys(p).sort(),['authorPrincipalId','ok','reviewerPrincipalId']);
});
test('author/reviewer rotations, credential interchange and old-author-as-reviewer change frozen authority',()=>{
 const frozen=resolveConfiguredResearchControllerPrincipals(initial);
 for(const config of [{...initial,INTERNAL_API_KEY:'synthetic-author-B'},
  {INTERNAL_API_KEY:initial.RESEARCH_REVIEW_KEY,RESEARCH_REVIEW_KEY:initial.INTERNAL_API_KEY},
  {INTERNAL_API_KEY:'synthetic-author-B',RESEARCH_REVIEW_KEY:initial.INTERNAL_API_KEY}]){
   const now=resolveConfiguredResearchControllerPrincipals(config);assert.equal(now.ok,true);assert.notEqual(now.authorPrincipalId,frozen.authorPrincipalId);
 }
 const oldAsReview={INTERNAL_API_KEY:'synthetic-author-B',RESEARCH_REVIEW_KEY:initial.INTERNAL_API_KEY};
 const authenticated=resolveResearchControllerIdentity(request(initial.INTERNAL_API_KEY),'reviewer',oldAsReview);assert.equal(authenticated.ok,true);
 // This is the independent RED: role-domain inequality alone is not independence.
 assert.notEqual(authenticated.principalId,frozen.authorPrincipalId);
 assert.notEqual(resolveConfiguredResearchControllerPrincipals(oldAsReview).authorPrincipalId,frozen.authorPrincipalId);
 const rotatedReview=resolveConfiguredResearchControllerPrincipals({...initial,RESEARCH_REVIEW_KEY:'synthetic-review-S'});
 assert.equal(rotatedReview.authorPrincipalId,frozen.authorPrincipalId);assert.notEqual(rotatedReview.reviewerPrincipalId,frozen.reviewerPrincipalId);
});
test('same credential or cron/test/approval alias disables both configuration and request identity',()=>{
 for(const config of [{},{INTERNAL_API_KEY:initial.INTERNAL_API_KEY},{...initial,RESEARCH_REVIEW_KEY:initial.INTERNAL_API_KEY},
  ...['CRON_SECRET','RESEARCH_TEST_KEY','STRATEGY_APPROVAL_KEY'].flatMap(key=>[initial.INTERNAL_API_KEY,initial.RESEARCH_REVIEW_KEY].map(value=>({...initial,[key]:value})))]){
  assert.deepEqual(resolveConfiguredResearchControllerPrincipals(config),{ok:false,error:'research_controller_authority_unavailable'});
  for(const role of ['author','reviewer'])assert.equal(resolveResearchControllerIdentity(request(initial.INTERNAL_API_KEY),role,config).ok,false);
 }
});
