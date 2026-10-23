/** Actual discovery/rotation composition; injected cache/RPC is synthetic.
 * These contracts do not establish native roster authority or HTTP acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadActualDiscovery} from './discovery-test-loader.mjs';
import {inputHash} from './policy.ts';
import type {command,enqueue} from './store.ts';
import type {getSupabaseServerClient} from '../supabase-server';
const {scanCachedCandidates}=loadActualDiscovery() as {scanCachedCandidates:typeof import('./discovery.ts').scanCachedCandidates};
const identity={principal:'synthetic-configured-operator',role:'operator' as const};
const now='2026-10-22T06:10:00.000Z';
test('actual discovery cannot turn a partial invalid cache row into a second exit after authoritative deferral',async()=>{
 const trace:string[]=[],calls:Array<{action:string;body:Record<string,unknown>}>=[];
 const clue={symbol:'2330',source:'ptt',root:'synthetic-one-root',authorRoot:'synthetic-one-author',contentHash:inputHash('synthetic-clue'),eventAt:'2026-10-21T06:00:00.000Z',availableAt:'2026-10-21T06:01:00.000Z'};
 const frozen={hash:inputHash('original-immutable-input'),clues:[clue]};const original=JSON.stringify(frozen);
 const context={session:'2026-10-22',completed:true,postclose:false,weeklyDue:false,priceSessions:[],clues:[],active:[{symbol:'2330',state:'waiting',evidence:frozen}],market:null};
 const send:typeof command=async(_i,action,body)=>{trace.push(action);calls.push({action,body});if(action==='exit')throw Error('partial_cache_must_not_authorize_exit');return action==='screen-context'?context:{recorded:true};};
 const client={from(table:string){const q:Record<string,unknown>={};for(const method of ['select','in','eq','lte','gte','or','order'])q[method]=()=>q;q.limit=async()=>({data:table==='stocks'?[{id:'10000000-0000-4000-8000-000000000001',symbol:'2330',market:'TW'}]:table==='stock_instruments_v3'?[{symbol:'2330',stock_id:'synthetic-incomplete-roster',listing_status:'delisted',source_timestamp:'2026-10-21T00:00:00Z'}]:[],error:null});return q;}} as unknown as ReturnType<typeof getSupabaseServerClient>;
 const admit:typeof enqueue=async(_i,body)=>{trace.push('enqueue');calls.push({action:'enqueue',body});return {jobs:[]};};
 const result=await scanCachedCandidates(identity,{client,command:send,enqueue:admit,now,targets:async()=>{trace.push('current-roster-server-command');return {observations:[{symbol:'2330',status:'deferred',reason:'trading_invalid_latest_roster_conflict'}]};}});
 assert.deepEqual(trace.slice(0,2),['current-roster-server-command','screen-context']);
 assert.equal(calls.some(c=>['exit','claim','prepare','reserve','swap'].includes(c.action)),false);
 assert.equal(calls.some(c=>['screen-observations','weekly-audit','enqueue'].includes(c.action)),false);
 assert.equal(JSON.stringify(frozen),original);assert.ok(result.scope);assert.equal(result.scope.admitted,0);assert.ok(result.gaps.includes('official_instrument_cache_empty'));

});
test('actual discovery observes the server exit before screening and does no per-stock work for the empty current set',async()=>{
 const trace:string[]=[];
 const send:typeof command=async(_i,action)=>{trace.push(action);return {active:[],clues:[],session:'2026-10-22',priceSessions:[]};};
 const client={from(){throw Error('empty current set must not read stock data');}} as unknown as ReturnType<typeof getSupabaseServerClient>;
 const admit:typeof enqueue=async()=>{throw Error('empty current set must not enqueue');};
 const result=await scanCachedCandidates(identity,{client,command:send,enqueue:admit,now,targets:async()=>{trace.push('current-roster-server-command');return {observations:[{symbol:'2330',status:'exited',reason:'trading_invalid',revisionId:null,inputHash:inputHash('original')}]};}});
 assert.deepEqual(trace,['current-roster-server-command','screen-context']);assert.ok(result.scope);assert.equal(result.scope.admitted,0);
});

test('actual screening rejects full newer invalid/conflicting identity before per-stock price/finance or enqueue',async()=>{
 const stockId='10000000-0000-4000-8000-000000000001';
 const base={instrument_authority_id:'20000000-0000-4000-8000-000000000001',stock_id:stockId,symbol:'2330',exchange:'TWSE',instrument_type:'common_stock',listing_status:'active',provider:'twse',source_timestamp:'2026-10-21T00:00:00Z',valid_from:'2026-10-21T00:00:00Z',valid_to:null,roster_version:'tw-instrument-roster-v3.0',recorded_at:'2026-10-21T00:01:00Z'};
 for(const mode of ['suspended','delisted','conflict','cross-stock','cross-symbol']){
  const trace:string[]=[],reads:string[]=[];const frozen={hash:inputHash('immutable-screen-head'),clues:[]};const before=JSON.stringify(frozen);
  const head={...base,instrument_authority_id:'20000000-0000-4000-8000-000000000002',listing_status:mode==='delisted'?'delisted':'suspended',recorded_at:'2026-10-22T06:00:00Z'};
  const rows=[base,...(mode==='cross-symbol'?[{...head,symbol:'2408',listing_status:'active'}]:mode==='cross-stock'?[{...head,stock_id:'10000000-0000-4000-8000-000000000002'}]:mode==='conflict'?[head,{...head,instrument_authority_id:'20000000-0000-4000-8000-000000000003',listing_status:'active'}]:[head])];
  const client={from(table:string){reads.push(table);assert.ok(['stocks','stock_instruments_v3'].includes(table),'invalid roster must block price/finance cache IO');let field:string;const q={select(){return q;},in(key:string){field=key;return q;},eq(){return q;},order(){return q;},async limit(){return {data:table==='stocks'?[{id:stockId,symbol:'2330',market:'TW'}]:rows.filter(row=>field==='symbol'?row.symbol==='2330':row.stock_id===stockId),error:null};}};return q;}} as unknown as ReturnType<typeof getSupabaseServerClient>;
  const send:typeof command=async(_i,action)=>{trace.push(action);assert.equal(action,'screen-context');return {active:[{symbol:'2330',state:'waiting',evidence:frozen}],clues:[],session:'2026-10-22',priceSessions:[]};};
  const admit:typeof enqueue=async()=>{throw Error('invalid current identity must not enqueue');};
  const result=await scanCachedCandidates(identity,{client,command:send,enqueue:admit,now,targets:async()=>{trace.push('server-current-target');return {observations:[]};}});
  assert.deepEqual(trace,['server-current-target','screen-context']);assert.deepEqual(reads,['stocks','stock_instruments_v3','stock_instruments_v3']);assert.ok(result.scope);assert.equal(result.scope.admitted,0,mode);assert.ok('rosterDeferrals' in result);assert.equal(result.rosterDeferrals?.length,1);assert.equal(result.rosterDeferrals?.[0].symbol,'2330');assert.equal(typeof result.rosterDeferrals?.[0].reason,'string');assert.equal(JSON.stringify(frozen),before);
 }
});
