import test from 'node:test';
import assert from 'node:assert/strict';
import { initialFactors, type ScreeningInputs } from './factors.ts';
import { independentClues, volumeComparison, type Clue } from './screening.ts';
import { inputHash } from './policy.ts';
const cutoff='2026-11-07T00:00:00Z';
const clue=(n:number):Clue=>({symbol:'2330',source:'official',root:`original:${n}`,authorRoot:`author:${n}`,eventAt:'2026-11-06T00:00:00Z',availableAt:'2026-11-06T01:00:00Z',contentHash:inputHash(n)});
const missing={value:null,source:'',observedAt:''};
function score(recent7:number|null,prior21:number|null,sourceHealthy=true,clues=[clue(1)]){
 const input:ScreeningInputs={cutoff,clues,sourceHealthy,recent7,prior21,priceReturn20:missing,volumeRatio20:missing,institutionalFlowRatio:missing,revenueGrowth:missing,catalystVerified:missing,corporateActionAdjusted:false};
 return initialFactors(input).factors.sourceVolume.components!;
}
test('actual initial-score caller preserves7 versus prior21 daily averages, known zero and outage gaps',()=>{
 assert.equal(volumeComparison(7,21,true).ratio,1);
 assert.equal(score(14,21).volume.value,1);
 assert.equal(score(7,0).volume.value,1);
 assert.equal(score(0,0).volume.value,0);
 for(const [recent,prior,healthy] of [[7,null,true],[null,21,true],[7,21,false],[NaN,21,true],[7,Infinity,true],[Infinity,0,true],[-1,21,true],[Number.MAX_VALUE,Number.MIN_VALUE,true]] as const){
  assert.equal(score(recent,prior,healthy).volume.value,null);
  assert.equal(volumeComparison(recent,prior,healthy).state,'gap');
 }
});
test('same content joins transitive origin and author families without merging different issuers',()=>{
 const first=clue(1),bridge={...clue(2),contentHash:first.contentHash},tail={...clue(3),authorRoot:bridge.authorRoot};
 for(const rows of [[first,bridge,tail],[tail,bridge,first]]){
  assert.equal(independentClues(rows).length,1);
  assert.equal(score(null,null,false,rows).independent.value,1/3);
  assert.equal(score(null,null,false,rows).volume.value,null);
 }
 assert.equal(independentClues([first,{...first,symbol:'2317'}]).length,2);
 assert.equal(independentClues([first,clue(4)]).length,2);
});
