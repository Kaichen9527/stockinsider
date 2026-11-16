/** Actual new component guard function; imported helper has declarations only.
 * Synthetic query responses, no pg/fixture invocation, native entry or socket. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {checkClosedDayFiscalWithdrawal} from './vnext-disclosed-fiscal-native-fixture.mjs';
function mock(day,settings=[]){const trace=[];const x={observer:{processID:1,query:async sql=>{trace.push(sql);if(sql.startsWith('SELECT extract(isodow'))return {rows:[{closed_day:day}]};if(sql==='SELECT * FROM public.stockinsider_data_plane_settings_v1')return {rows:settings};throw Error('unexpected read');}},writer:{processID:2,query:async()=>{throw Error('must not mutate');}},snapshot:async()=>{throw Error('must not snapshot after failed preflight');}};return {x,trace};}
test('actual source-only component refuses weekday/unknown calendar before writer lease or mutation',async()=>{for(const day of [false,null,undefined,'true']){const {x,trace}=mock(day);await assert.rejects(()=>checkClosedDayFiscalWithdrawal(x,'id',[],async()=>{throw Error('must not acquire');}),{code:'ERR_ASSERTION'});assert.equal(trace.length,1);}});
test('actual component refuses configured formal-writer state and malformed source set before mutation',async()=>{const a=mock(true,[{settings:'configured'}]);await assert.rejects(()=>checkClosedDayFiscalWithdrawal(a.x,'id',[],async()=>{throw Error('must not acquire');}),{code:'ERR_ASSERTION'});const b=mock(true);await assert.rejects(()=>checkClosedDayFiscalWithdrawal(b.x,'id',[{kind:'annual'}],async()=>{throw Error('must not acquire');}),{code:'ERR_ASSERTION'});});
test('original fiscal helper and fatal business calendar gate are retained',()=>{
 const hash=value=>createHash('sha256').update(value).digest('hex');
 const helper=fs.readFileSync('scripts/vnext-disclosed-fiscal-native-fixture.mjs');
 assert.equal(hash(helper.subarray(0,16348)),'13bdd5d125296e44a1d7f67b63c5b314c01f17c45d672aac419b40d10be5bc5e');

 // This byte-exact span from cbb58166 extends through the gate, historical
 // session lookup, synthetic calendar writes and historical authority read.
 // Typed financial preparation elsewhere in the HTTP fixture is independent.
 const current=fs.readFileSync('scripts/vnext-preparation-http-fixture.mjs','utf8');
 const lines=current.split('\n');
 const starts=lines.map((line,index)=>line.startsWith('  const civil=(await x.observer.query("SELECT (clock_timestamp()')?index:-1).filter(index=>index>=0);
 const ends=lines.map((line,index)=>line.startsWith('  const historical=await loadTwEntryHistoricalPriceAuthority')?index:-1).filter(index=>index>=0);
 assert.equal(starts.length,1);
 assert.equal(ends.length,1);
 assert.ok(starts[0]<ends[0]);
 const calendarBoundary=lines.slice(starts[0],ends[0]+1).join('\n')+'\n';
 assert.equal(hash(calendarBoundary),'2ac8f10207812876a9f78c566ace4ddbba212005cb4893cc7ee2aadbdae995fc');
});
