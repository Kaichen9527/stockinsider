import assert from 'node:assert/strict';
import test from 'node:test';
import {parseLaunchRankingRead,readLaunchRankingTransport,launchRankingMemberCurrent,LAUNCH_RANKING_ARITHMETIC} from './launch-ranking-read.ts';
import {launchRankingFixture,LAUNCH_TEST_NOW,LAUNCH_TEST_RUN} from './launch-ranking.test-fixture.ts';
import {sumInstitutionalShares} from './launch-institutional-volume.ts';
type Packet=ReturnType<typeof launchRankingFixture>;
const query={rankingRunId:LAUNCH_TEST_RUN,symbol:'5274'};
function amend(p:Packet,index:number,operands:Record<string,number|string|boolean|null>,matches:boolean){
  const rules=p.detail!.scoreEvidence;Object.assign(rules[index].operands,operands);Object.assign(rules[index],{matches,points:matches?rules[index].weight:0});
  const m=p.snapshot.members[0];
  for(const group of Object.keys(m.components) as Array<keyof typeof m.components>)m.components[group]=rules.filter(rule=>rule.group===group).reduce((sum,rule)=>sum+rule.points,0);
  m.totalScore=Object.values(m.components).reduce((sum,points)=>sum+points,0);m.technicalScore=m.components.trendRelativeStrength+m.components.consolidation+m.components.breakoutHold;
  if(index===4)m.relativeStrength63=operands.excessReturn as number;
  return p;
}
function adjacent(value:number,up:boolean){const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,value,false);view.setBigUint64(0,view.getBigUint64(0,false)+(up?BigInt(1):BigInt(-1)),false);return view.getFloat64(0,false);}
test('wirev2 requires exact arithmetic identity at every envelope and rejects oldschema/missing/wrong contracts',()=>{
  const good=launchRankingFixture(1,true);assert.equal(parseLaunchRankingRead(good,query,LAUNCH_TEST_NOW).snapshot!.arithmeticVersion,LAUNCH_RANKING_ARITHMETIC);
  for(const target of ['outer','snapshot','current','detail'] as const)for(const mode of ['missing','wrong'] as const){
    const p=launchRankingFixture(1,true),object=target==='outer'?p:target==='snapshot'?p.snapshot:target==='current'?p.current:p.detail!;
    if(mode==='missing')delete(object as Record<string,unknown>).arithmeticVersion;else Object.assign(object,{arithmeticVersion:'numeric-v1'});
    assert.throws(()=>parseLaunchRankingRead(p,query,LAUNCH_TEST_NOW),/contract_invalid/u,`${target}:${mode}`);
  }
  const old=launchRankingFixture();Object.assign(old,{schemaVersion:'vnext-launch-ranking-read-v1'});assert.throws(()=>parseLaunchRankingRead(old,{},LAUNCH_TEST_NOW),/contract_invalid/u);
  for(const invalid of [NaN,Infinity,-Infinity,-0]){const p=launchRankingFixture();p.snapshot.members[0].relativeStrength63=invalid;assert.throws(()=>parseLaunchRankingRead(p,{},LAUNCH_TEST_NOW),/contract_invalid/u);}
});
test('binary64 exposed subtraction preserves positive,negative and tiny signs with exactpoint math and no decimal epsilon',()=>{
  for(const [stockReturn,marketReturn] of [[.1,.3],[.3,.1],[1e-300,0],[-1e-300,0],[0,0]]){
    const excessReturn=stockReturn-marketReturn,p=amend(launchRankingFixture(1,true),4,{stockReturn,marketReturn,excessReturn},excessReturn>0);
    const read=parseLaunchRankingRead(JSON.parse(JSON.stringify(p)),query,LAUNCH_TEST_NOW);
    assert.equal(read.snapshot!.members[0].relativeStrength63,excessReturn);assert.equal(read.detail!.scoreEvidence[4].points,excessReturn>0?5:0);
    assert.equal(read.snapshot!.members[0].availableWeight,100);
  }
  const p=amend(launchRankingFixture(1,true),4,{stockReturn:.1,marketReturn:.3,excessReturn:-.2},false);
  assert.notEqual(.1-.3,-.2);assert.throws(()=>parseLaunchRankingRead(p,query,LAUNCH_TEST_NOW),/contract_invalid/u,'decimal NUMERIC result cannot masquerade as binary64 subtraction');
  const near=launchRankingFixture(1,true);near.snapshot.members[0].relativeStrength63=adjacent(.4-.1,true);assert.throws(()=>parseLaunchRankingRead(near,query,LAUNCH_TEST_NOW),/contract_invalid/u,'one ULP tamper is not tolerated');
});
test('exact and adjacent binary64 consolidation thresholds and strictprice comparisons retain fixed integerweights',()=>{
  for(const [index,key,threshold] of [[5,'depth',.15],[6,'distance',.05],[7,'ratio',.8],[8,'ratio',.8]] as const){
    for(const operand of [adjacent(threshold,false),threshold,adjacent(threshold,true)]){
      const p=amend(launchRankingFixture(1,true),index,{[key]:operand},operand<=threshold),read=parseLaunchRankingRead(JSON.parse(JSON.stringify(p)),query,LAUNCH_TEST_NOW);
      assert.equal(read.detail!.scoreEvidence[index].matches,operand<=threshold);assert.equal(read.detail!.scoreEvidence[index].points,operand<=threshold?p.detail!.scoreEvidence[index].weight:0);
    }
  }
  for(const close of [adjacent(100,false),100,adjacent(100,true)]){
    const p=amend(launchRankingFixture(1,true),0,{close,ma50:100},close>100);
    assert.equal(parseLaunchRankingRead(p,query,LAUNCH_TEST_NOW).detail!.scoreEvidence[0].matches,close>100);
  }
});
test('signed safeinteger institutional ratios use binary64 division; zerodenominator and rawrounding mismatch cannot acquireweights',()=>{
  const exact=sumInstitutionalShares([Number.MAX_SAFE_INTEGER,2,-Number.MAX_SAFE_INTEGER]);assert.equal(exact,2);
  const cancellation=amend(launchRankingFixture(1,true),10,{netShares:exact,volumeShares:10,netVolumeRatio:exact!/10},true);
  assert.equal(parseLaunchRankingRead(cancellation,query,LAUNCH_TEST_NOW).detail!.scoreEvidence[10].operands.netShares,2);
  assert.equal(sumInstitutionalShares([Number.MAX_SAFE_INTEGER,1]),null);
  for(const netShares of [-3,-1,0,1,3]){
    const p=amend(launchRankingFixture(1,true),10,{netShares,volumeShares:10,netVolumeRatio:netShares/10},netShares>0);
    const read=parseLaunchRankingRead(JSON.parse(JSON.stringify(p)),query,LAUNCH_TEST_NOW);assert.equal(read.detail!.scoreEvidence[10].operands.netVolumeRatio,netShares/10);
    assert.equal(read.detail!.scoreEvidence[10].points,netShares>0?5:0);assert.equal(read.snapshot!.members[0].availableWeight,100);
  }
  for(const netShares of [-1,1]){
    const ratio=netShares/3,p=amend(launchRankingFixture(1,true),10,{netShares,volumeShares:3,netVolumeRatio:ratio},netShares>0);
    const read=parseLaunchRankingRead(JSON.parse(JSON.stringify(p)),query,LAUNCH_TEST_NOW);
    assert.equal(read.detail!.scoreEvidence[10].operands.netVolumeRatio,ratio);assert.equal(read.detail!.scoreEvidence[10].points,netShares>0?5:0);
    const operands=p.detail!.scoreEvidence[10].operands;
    if(!('netVolumeRatio' in operands))throw Error('expected_institutional_ratio_fixture');
    Object.assign(operands,{netVolumeRatio:netShares>0?adjacent(ratio,true):-adjacent(-ratio,true)});
    assert.throws(()=>parseLaunchRankingRead(p,query,LAUNCH_TEST_NOW),/contract_invalid/u,'one ULP signed third tamper is not tolerated');
  }
  for(const invalid of [{netShares:1,volumeShares:0,netVolumeRatio:null},{netShares:1,volumeShares:3,netVolumeRatio:adjacent(1/3,true)}]){
    const p=amend(launchRankingFixture(1,true),10,invalid,true);assert.throws(()=>parseLaunchRankingRead(p,query,LAUNCH_TEST_NOW),/contract_invalid/u);
  }
});
test('binary64 tiny/exact63RS ties sort without epsilon or zeroimputation and technicalscore remainssecondkey',()=>{
  const p=launchRankingFixture(2);p.snapshot.members[0].relativeStrength63=1e-300;p.snapshot.members[1].relativeStrength63=1e-300;
  assert.deepEqual(parseLaunchRankingRead(p,{},LAUNCH_TEST_NOW).snapshot!.members.map(m=>m.symbol),['5274','5275']);
  p.snapshot.members[1].relativeStrength63=adjacent(1e-300,true);assert.throws(()=>parseLaunchRankingRead(p,{},LAUNCH_TEST_NOW),/contract_invalid/u);
  const tech=launchRankingFixture(2),a=tech.snapshot.members[0],b=tech.snapshot.members[1];a.components.chips=15;a.totalScore=95;
  b.components.trendRelativeStrength=20;b.totalScore=95;b.technicalScore=65;assert.equal(parseLaunchRankingRead(tech,{},LAUNCH_TEST_NOW).snapshot!.members[0].technicalScore,70);
  tech.snapshot.members.reverse();tech.snapshot.members.forEach((m,i)=>{m.rank=i+1;});assert.throws(()=>parseLaunchRankingRead(tech,{},LAUNCH_TEST_NOW),/contract_invalid/u);
});
test('production transport readAt is capturedafteractualRPCresponse; expired and trulyfuture SQLclocks stayclosed',async()=>{
  const started=Date.now();let checked='';
  const good=await readLaunchRankingTransport({rpc:async()=>{await new Promise(resolve=>setTimeout(resolve,20));const packet=launchRankingFixture(1,false,new Date().toISOString());checked=packet.current.members[0].checkedAt;return {data:packet,error:null};}});
  assert.ok(Date.parse(checked)>started);assert.ok(Date.parse(good.readAt)>=Date.parse(checked));assert.equal(launchRankingMemberCurrent(good.snapshot!.members[0],good.current,good.readAt),true);
  const expired=await readLaunchRankingTransport({rpc:async()=>{const packet=launchRankingFixture(1,false,new Date().toISOString());packet.current.members[0].expiresAt=new Date(Date.now()+5).toISOString();await new Promise(resolve=>setTimeout(resolve,20));return {data:packet,error:null};}});
  assert.equal(launchRankingMemberCurrent(expired.snapshot!.members[0],expired.current,expired.readAt),false);
  const future=await readLaunchRankingTransport({rpc:async()=>{const packet=launchRankingFixture(1,false,new Date().toISOString());const futureChecked=Date.now()+60000;packet.current.members[0].checkedAt=new Date(futureChecked).toISOString();packet.current.members[0].expiresAt=new Date(futureChecked+30000).toISOString();return {data:packet,error:null};}});
  assert.equal(launchRankingMemberCurrent(future.snapshot!.members[0],future.current,future.readAt),false);
});
