import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForResearchReadiness,readAfterResearchReadiness} from './research-http-readiness.mjs';
const response=(status,body)=>({status,json:async()=>body});
const setup=(responses,extra={})=>{
 const attempts=[];let calls=0,pauses=0;
 return {attempts,get calls(){return calls;},get pauses(){return pauses;},run:()=>waitForResearchReadiness(async()=>responses[calls++],{name:'prepare_research_input_v2',attempts,ready:x=>x.status===400&&x.body.code==='P0001'&&x.body.message==='input_preparation_shape',pause:async ms=>{assert.equal(ms,100);pauses++;},...extra})};
};
const ready=response(400,{code:'P0001',message:'input_preparation_shape'});
test('schema-cache startup is recorded before exact no-write shape readiness',async()=>{
 const h=setup([response(404,{code:'PGRST202',message:'Could not find public.prepare_research_input_v2 in schema cache'}),ready]);await h.run();assert.equal(h.calls,2);assert.equal(h.pauses,1);assert.equal(h.attempts[0].body.code,'PGRST202');assert.equal(h.attempts[1].body.message,'input_preparation_shape');
});
for(const status of [400,401,409,500])test(`functional ${status} is never retried or hidden by later readiness`,async()=>{
 const h=setup([response(status,{code:'P0001',message:'original fence rejection'}),ready]);await assert.rejects(h.run(),/readiness_unexpected_response/);assert.equal(h.calls,1);assert.equal(h.pauses,0);assert.equal(h.attempts[0].status,status);
});
test('only matching schema function lookup can be retried',async()=>{
 const h=setup([response(404,{code:'PGRST202',message:'another_function missing'}),ready]);await assert.rejects(h.run(),/readiness_unexpected_response/);assert.equal(h.calls,1);
});
test('known database startup errors have a fixed three-call limit',async()=>{
 const h=setup(Array.from({length:4},()=>response(503,{code:'PGRST002',message:'schema cache startup'})));await assert.rejects(h.run(),/readiness_exhausted/);assert.equal(h.calls,3);assert.equal(h.pauses,2);assert.equal(h.attempts.length,3);
});
test('unclassified 503 and transport failures cannot become green retries',async()=>{
 const h=setup([response(503,{error:'unknown'}),ready]);await assert.rejects(h.run(),/readiness_unexpected_response/);assert.equal(h.calls,1);
 let calls=0;await assert.rejects(waitForResearchReadiness(async()=>{calls++;throw new Error('original transport failure');},{name:'x',ready:()=>true,attempts:[]}),/original transport failure/);assert.equal(calls,1);
});
test('restart readiness requires the formal authority to remain empty',async()=>{
 const h=setup([response(200,[{id:'fabricated-authority'}])],{name:'candidate_research_stock_authority_page',ready:x=>x.status===200&&Array.isArray(x.body)&&x.body.length===0});await assert.rejects(h.run(),/readiness_unexpected_response/);assert.equal(h.calls,1);
});
for(const status of [400,401,409,500])test(`ready then single business ${status} stays rejected`,async()=>{
 let calls=0;const attempts=[];const post=async()=>{calls++;return response(calls===1?status:200,{error:'business rejection'});};
 const r=await readAfterResearchReadiness(async()=>ready,post,{name:'prepare_research_input_v2',attempts,ready:x=>x.status===400&&x.body.code==='P0001'&&x.body.message==='input_preparation_shape'});assert.equal(r.status,status);assert.equal(calls,1);assert.equal(attempts.length,1);
});
test('readiness rejection prevents the business request entirely',async()=>{
 let calls=0;const attempts=[];
 await assert.rejects(readAfterResearchReadiness(async()=>response(401,{error:'denied'}),async()=>{calls++;return ready;},{name:'prepare_research_input_v2',attempts,ready:()=>false}),/readiness_unexpected_response/);assert.equal(calls,0);assert.equal(attempts.length,1);
});
