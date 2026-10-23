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
 const client={from(table:string){const q:Record<string,unknown>={};for(const method of ['select','in','eq','lte','gte','or','order'])q[method]=()=>q;q.limit=async()=>({data:table==='stock_instruments_v3'?[{symbol:'2330',stock_id:'synthetic-incomplete-roster',listing_status:'delisted',source_timestamp:'2026-10-21T00:00:00Z'}]:[],error:null});return q;}} as unknown as ReturnType<typeof getSupabaseServerClient>;
 const admit:typeof enqueue=async(_i,body)=>{trace.push('enqueue');calls.push({action:'enqueue',body});return {jobs:[]};};
 const result=await scanCachedCandidates(identity,{client,command:send,enqueue:admit,now,targets:async()=>{trace.push('current-roster-server-command');return {observations:[{symbol:'2330',status:'deferred',reason:'trading_invalid_latest_roster_conflict'}]};}});
 assert.deepEqual(trace.slice(0,2),['current-roster-server-command','screen-context']);
 assert.equal(calls.some(c=>['exit','claim','prepare','reserve','swap'].includes(c.action)),false);
 const observation=(calls.find(c=>c.action==='screen-observations')!.body.observations as Array<{symbol:string;input:{eligible:boolean;tradingValid:boolean}}>)[0];
 assert.equal(observation.symbol,'2330');assert.equal(observation.input.eligible,false);assert.equal(observation.input.tradingValid,false);
 assert.deepEqual(calls.find(c=>c.action==='enqueue')!.body.symbols,[]);
 assert.equal(JSON.stringify(frozen),original);assert.ok('rotation' in result);assert.equal((result.rotation as {reason:string}).reason,'routine_rotation_requires_completed_postclose_session');
});
test('actual discovery observes the server exit before screening and does no per-stock work for the empty current set',async()=>{
 const trace:string[]=[];
 const send:typeof command=async(_i,action)=>{trace.push(action);return {active:[],clues:[],session:'2026-10-22',priceSessions:[]};};
 const client={from(){throw Error('empty current set must not read stock data');}} as unknown as ReturnType<typeof getSupabaseServerClient>;
 const admit:typeof enqueue=async()=>{throw Error('empty current set must not enqueue');};
 const result=await scanCachedCandidates(identity,{client,command:send,enqueue:admit,now,targets:async()=>{trace.push('current-roster-server-command');return {observations:[{symbol:'2330',status:'exited',reason:'trading_invalid',revisionId:null,inputHash:inputHash('original')}]};}});
 assert.deepEqual(trace,['current-roster-server-command','screen-context']);assert.ok(result.scope);assert.equal(result.scope.admitted,0);
});
