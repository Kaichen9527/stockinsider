import assert from 'node:assert/strict';
import {requireInternalAuth,requireIndependentResearchReviewer} from './stockinsider-full-review-fge-oct11-source/web/src/lib/internal-auth.ts';
const keys=['INTERNAL_API_KEY','CRON_SECRET','RESEARCH_REVIEW_KEY','RESEARCH_TEST_KEY','STRATEGY_APPROVAL_KEY'];
const req=t=>new Request('https://fixture.invalid',{headers:{authorization:'Bearer '+t}});
const options={allowResearchReviewer:true,allowResearchTester:true,allowStrategyApprover:true};
for(const peer of keys.filter(k=>k!=='RESEARCH_REVIEW_KEY')){
 keys.forEach((k,i)=>process.env[k]='synthetic-'+i);process.env.RESEARCH_REVIEW_KEY=process.env[peer];
 const review=requireIndependentResearchReviewer(req(process.env[peer]));
 const selected=requireInternalAuth(req(process.env[peer]),options);
 assert.equal(review,['RESEARCH_TEST_KEY','STRATEGY_APPROVAL_KEY'].includes(peer));
 assert.equal(selected.ok,true);
 assert.equal(selected.authSource,peer==='INTERNAL_API_KEY'?'internal_api_key':peer==='CRON_SECRET'?'cron_secret':'research_review_key');
 console.log(JSON.stringify({aliasPeer:peer,reviewAccepted:review,selectedRole:selected.authSource,simultaneousTesterOrApprover:false}));
}
console.log('synthetic alias matrix: 4 cases passed; no real credentials loaded');
