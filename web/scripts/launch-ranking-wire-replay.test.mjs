import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {launchRankingFixture,LAUNCH_TEST_NOW,LAUNCH_TEST_RUN} from '../src/lib/vnext/launch-ranking.test-fixture.ts';
const script=fileURLToPath(new URL('./launch-ranking-wire-replay.mjs',import.meta.url));
function replay(input,args=['--run',LAUNCH_TEST_RUN,'--symbol','5274','--read-at',LAUNCH_TEST_NOW]){
  return spawnSync(process.execPath,['--no-warnings','--experimental-strip-types',script,...args],{input,encoding:'utf8',timeout:10000,env:{PATH:'/usr/bin:/bin'}});
}
test('actual wire consumer validates Node-only control but explicitly never labels it PG/source/publication evidence',()=>{
  const result=replay(JSON.stringify(launchRankingFixture(1,true)));assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(result.stdout);assert.equal(receipt.arithmeticVersion,'binary64-v1');assert.equal(receipt.wireSchema,'vnext-launch-ranking-snapshot-v2');
  assert.equal(receipt.rules,16);assert.equal(receipt.origin,'unverified_stdin');assert.equal(receipt.realPgExecution,'NOT_VERIFIED');
  assert.equal(receipt.sourceAuthority,false);assert.equal(receipt.publicationAuthority,false);assert.equal(receipt.rankingAuthority,false);
  assert.ok(!result.stdout.includes('Synthetic public research summary'));
});
test('wire consumer fatalUTF8/bounds/v1/wrongarith/extraobjects refuse generically with zero raw echo',()=>{
  const old=launchRankingFixture(1,true);old.schemaVersion='vnext-launch-ranking-read-v1';
  const wrong=launchRankingFixture(1,true);wrong.arithmeticVersion='numeric-v1';
  const privateExtra={...launchRankingFixture(1,true),raw:'PRIVATE_WIRE_VALUE_DO_NOT_ECHO'};
  for(const input of [Buffer.from([0xc0,0xaf]),Buffer.alloc(2*1024*1024+1,32),JSON.stringify(old),JSON.stringify(wrong),JSON.stringify(privateExtra)]){
    const result=replay(input);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'launch_wire_replay_refused\n');
  }
  assert.equal(replay('{}',['--url','https://example.org']).status,1);
});
