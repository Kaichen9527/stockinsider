import assert from 'node:assert/strict';
import test from 'node:test';
import {parseLaunchPublicCitation} from './launch-public-citation.ts';
import {launchPublicCitationFixture,unsafeCitationUrls,unknownRightsCitationUrls} from './launch-citation.test-fixture.ts';
import {publishLaunchRanking} from './launch-ranking-command.ts';

test('closed public DTO preserves all five already registered dataset attributions and source bindings, without creating rights',()=>{
  for(const id of [11370,11371,11856,11391,11755] as const){
    const input=launchPublicCitationFixture(id),output=parseLaunchPublicCitation(input);
    assert.deepEqual(output,input);assert.notEqual(output,input);assert.notEqual(output!.publicRights,input.publicRights);
    assert.equal(output!.publicRights.license,'Taiwan Open Government Data License 1.0');
    assert.equal(Object.hasOwn(output!,'sourceAuthority'),false);
  }
});
test('member, unknown-rights, tracking, redirected, sensitive and encoded links cannot be relabelled public by a DTO',()=>{
  for(const url of [...unsafeCitationUrls,...unknownRightsCitationUrls])assert.equal(parseLaunchPublicCitation({...launchPublicCitationFixture(),url}),null,url);
  for(const change of [{publicRights:undefined},{sourceRevision:'SYNTHETIC_UNKNOWN'},{contentHash:'SYNTHETIC_UNKNOWN'},
    {id:'SYNTHETIC_PRIVATE_ID'},{rawBody:'SYNTHETIC_PRIVATE_ONLY'}])assert.equal(parseLaunchPublicCitation({...launchPublicCitationFixture(),...change}),null);
  for(const change of [{datasetId:99999},{license:'SYNTHETIC_UNKNOWN'},{licenseUrl:'https://example.org/license'},
    {rightsRevision:'SYNTHETIC_UNKNOWN'},{attribution:'SYNTHETIC_UNKNOWN'},{scope:'operator_claim'}]){
    const citation=launchPublicCitationFixture();Object.assign(citation.publicRights,change);assert.equal(parseLaunchPublicCitation(citation),null);
  }
});
test('public DTO guard refuses lazy accessors and proxies without evaluating hooks',()=>{
  let hooks=0;const citation=launchPublicCitationFixture();
  const accessor={...citation,get url(){hooks++;return citation.url;}},proxy=new Proxy(citation,{get(){hooks++;throw Error('SYNTHETIC_HOOK');}});
  assert.equal(parseLaunchPublicCitation(accessor),null);assert.equal(parseLaunchPublicCitation(proxy),null);assert.equal(hooks,0);
});
test('actual launch command rejects caller citation/permission injection before configuration, lease or source work',async()=>{
  const ids={rankingRunId:'00000000-0000-4000-8000-000000000001',expectedPreviousRankingRunId:null};
  const actor={role:'operator' as const,principal:'SYNTHETIC_OPERATOR'};
  for(const url of [...unsafeCitationUrls,...unknownRightsCitationUrls]){
    await assert.rejects(publishLaunchRanking(actor,{...ids,citations:[{...launchPublicCitationFixture(),url}]}),/closed_request/u);
  }
  await assert.rejects(publishLaunchRanking(actor,{...ids,publicRights:launchPublicCitationFixture().publicRights}),/closed_request/u);
  let touched=0;await assert.rejects(publishLaunchRanking(actor,{...ids,get citations(){touched++;return [];}}),/closed_request/u);assert.equal(touched,0);
});
