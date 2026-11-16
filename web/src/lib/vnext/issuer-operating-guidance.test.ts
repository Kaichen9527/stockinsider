import assert from 'node:assert/strict';
import test from 'node:test';
import {calculateGuidedOperatingScenarios,parseQuarterOperatingGuidance,readMediaTekQ4OperatingGuidance} from './issuer-operating-guidance.ts';

const text='Synthetic example. Expected fourth quarter revenue is NT$100.2 billion to NT$110.4 billion. Gross margin is forecasted at 41%, plus or minus 1.5 percentage points, and operating expense ratio is forecasted at 25%, plus or minus 2 percentage points.';
test('issuer ranges stay separate from independently calculated operating cases',()=>{
 const {guidance,locator}=parseQuarterOperatingGuidance(text);
 assert.deepEqual(guidance,{revenueTwd:{low:100200000000,high:110400000000},grossMarginBps:{low:3950,high:4250},expenseRatioBps:{low:2300,high:2700}});
 assert.match(locator.normalizedPageSha256,/^[a-f0-9]{64}$/u);
 assert.match(text.slice(locator.startCodePoint,locator.endCodePoint),/^fourth quarter revenue/iu);
 const result=calculateGuidedOperatingScenarios(guidance);
 assert.deepEqual([result.bear.operatingIncomeTwd,result.base.operatingIncomeTwd,result.bull.operatingIncomeTwd],[12525000000,16848000000,21528000000]);
 assert.equal(result.eps,null);
 assert.equal(result.forwardPe,null);
 assert.equal(result.targetPriceTwd,null);
 assert.ok(result.gaps.includes('forecast_weighted_shares_missing'));
});
test('the endpoint ordering handles a loss case without assuming higher revenue always improves it',()=>{
 const z=calculateGuidedOperatingScenarios({revenueTwd:{low:1000000,high:2000000},grossMarginBps:{low:1800,high:2000},expenseRatioBps:{low:2600,high:2800}});
 assert.deepEqual([z.bear.operatingIncomeTwd,z.base.operatingIncomeTwd,z.bull.operatingIncomeTwd],[-200000,-120000,-60000]);
 assert.equal(z.eps,null);
});
test('incomplete, duplicate, cross-block, and incorrectly scaled guidance is refused',()=>{
 for(const input of [text.replace('operating expense ratio','expenses'),text+' '+text,text.replace('NT$110.4','US$110.4'),
  text.replace('Gross margin','extra unrelated '.repeat(60)+'Gross margin'),text.replace('1.5 percentage points','1.001 percentage points')])
  assert.throws(()=>parseQuarterOperatingGuidance(input),/vnext_issuer_operating_guidance_/u);
 const valid=parseQuarterOperatingGuidance(text).guidance;
 assert.throws(()=>calculateGuidedOperatingScenarios({...valid,revenueTwd:{low:110,high:100}}),/range_invalid/u);
 assert.throws(()=>calculateGuidedOperatingScenarios({...valid,expenseRatioBps:{low:2301,high:2700}}),/midpoint_precision_unsupported/u);
});
test('transcript URL, revision and response size checks run before PDF decoding',async()=>{
 const reply=(body:string,url:string,type='application/pdf')=>{
  const r=new Response(body,{headers:{'content-type':type}});
  Object.defineProperty(r,'url',{value:url});
  return r;
 };
 await assert.rejects(()=>readMediaTekQ4OperatingGuidance(async()=>reply('%PDF-demo','https://example.com')),/transcript_unavailable/u);
 await assert.rejects(()=>readMediaTekQ4OperatingGuidance(async url=>reply('%PDF-demo',String(url))),/transcript_revision_unverified/u);
 await assert.rejects(()=>readMediaTekQ4OperatingGuidance(async url=>reply('%PDF-'+ 'x'.repeat(512*1024),String(url))),/transcript_too_large/u);
});
