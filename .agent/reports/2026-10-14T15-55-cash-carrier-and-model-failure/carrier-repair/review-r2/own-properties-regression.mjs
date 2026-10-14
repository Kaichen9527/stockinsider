import test from 'node:test';import assert from 'node:assert/strict';
import {projectPinnedHistoricalCash}from '/tmp/si-pubtail-o14/web/src/lib/research-historical-cash-projection.ts';
import {historicalCashPins}from '/tmp/si-pubtail-o14/web/src/lib/research-historical-cash-pins.ts';
for(const symbol of ['2409','2383'])test(`${symbol}: rejected native Map metadata must not materialize an unbounded own-key population`,()=>{
 const count=historicalCashPins.companies[symbol].files.length;
 const files=new Map(Array.from({length:count},(_,i)=>['unused_'+i,new Uint8Array()]));
 for(let i=0;i<10000;i++)Object.defineProperty(files,'extra_'+i,{value:i});
 const original=Reflect.ownKeys;let materialized=0,deadlineChecks=0;
 try{Reflect.ownKeys=function(v){const keys=original(v);if(v===files)materialized=keys.length;return keys;};assert.throws(()=>projectPinnedHistoricalCash(historicalCashPins.profile,symbol,files,{check(){deadlineChecks++;}}),/historical_cash_projection_invalid/);}finally{Reflect.ownKeys=original;}
 console.log(JSON.stringify({symbol,nativeMapSize:files.size,materialized,deadlineChecks,sourceLine:41}));
 assert.ok(materialized<=count,`bounded native${count}-entry admission materialized ${materialized} arbitrary own keys before rejection`);
});
