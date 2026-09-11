import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readCandidateHistoryCheckpoints, runCandidateHistoryBackfill } from './candidate-history-backfill.ts';
import { candidateDailyPriceRefreshDepth } from './candidate-research-policy.ts';

test('durable checkpoint reads paginate past 1,000 and never silently truncate a per-stock history', async () => {
  const rows=Array.from({length:1320},(_,index)=>({stock_id:'stock-a',month:String(index)}));
  const ranges:number[][]=[];
  const query={select(){return this;},in(){return this;},order(){return this;},range(from:number,to:number){ranges.push([from,to]);return Promise.resolve({data:rows.slice(from,to+1),error:null});}};
  const client={from(){return query;}} as unknown as SupabaseClient;
  assert.equal((await readCandidateHistoryCheckpoints(client,['stock-a'])).length,1320);
  assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499]]);
});

test('daily refresh remains bounded while deep coverage has its own persisted queue',()=>{
  assert.equal(candidateDailyPriceRefreshDepth([],'2026-09-10'),5);
  assert.equal(candidateDailyPriceRefreshDepth(['2026-09-10'],'2026-09-10'),0);
});

test('monthly acquisition persists evidence and checkpoint together, records partial sessions and isolates source empty', async () => {
  const completed:Array<Record<string,unknown>>=[];
  const query={select(){return this;},in(){return this;},order(){return this;},range(){return Promise.resolve({data:[],error:null});}};
  const client={from(){return query;},async rpc(name:string,args:Record<string,unknown>){
    assert.equal(name,'complete_candidate_history_month_v1'); completed.push(args);
    return {data:{status:args.p_status,terminal_reason:args.p_terminal_reason},error:null};
  }} as unknown as SupabaseClient;
  const bars=[{time:'2026-09-10',open:100,high:102,low:99,close:101,volume:1000,sourceUrl:'https://www.twse.com.tw/exchangeReport/STOCK_DAY',
    authorityTier:'official_primary' as const,provider:'official_primary' as const}];
  const result=await runCandidateHistoryBackfill({client,candidates:[{stockId:'stock-a',symbol:'2330',exchange:'TWSE',knownPriceSessions:[],knownMultipleSessions:[]}],
    officialSessions:['2026-09-09','2026-09-10'],latestSession:'2026-09-10',evaluationAt:'2026-09-11T00:00:00.000Z',requestBudget:2},
  {fetchMonth:async (job)=>({bars:job.dataset==='price'?bars:[],multiples:[],sourceUrl:bars[0].sourceUrl,httpStatus:null,terminalReason:job.dataset==='price'?'complete':'official_no_rows'})});
  assert.equal(result.attempted,2);
  assert.equal(result.prices.get('stock-a')?.length,1);
  assert.equal(completed.length,2);
  assert.equal(result.items.find((item)=>item.dataset==='price')?.terminalReason,'official_session_rows_missing');
  assert.equal(result.items.find((item)=>item.dataset==='multiple')?.terminalReason,'official_no_rows');
  assert.deepEqual(completed.find((item)=>item.p_dataset==='price')?.p_prices,bars);
  assert.equal(completed.every((item)=>item.p_next_attempt_at!==null),true);
});

test('atomic history write failure is not reported as a completed cursor', async () => {
  const query={select(){return this;},in(){return this;},order(){return this;},range(){return Promise.resolve({data:[],error:null});}};
  const client={from(){return query;},rpc(){return Promise.resolve({data:null,error:{message:'database_write_failed'}});}} as unknown as SupabaseClient;
  await assert.rejects(runCandidateHistoryBackfill({client,candidates:[{stockId:'stock-a',symbol:'2330',exchange:'TWSE',knownPriceSessions:[],knownMultipleSessions:[]}],
    officialSessions:['2026-09-10'],latestSession:'2026-09-10',evaluationAt:'2026-09-11T00:00:00.000Z',requestBudget:1},
    {fetchMonth:async()=>({bars:[],multiples:[],sourceUrl:'https://www.twse.com.tw/',httpStatus:403,terminalReason:'official_security_block'})}), /candidate_history_month_write_failed/);
});

test('a thrown source request becomes a per-month retry and does not cancel the other issuer', async () => {
  const query={select(){return this;},in(){return this;},order(){return this;},range(){return Promise.resolve({data:[],error:null});}};
  const client={from(){return query;},async rpc(_name:string,args:Record<string,unknown>){return {data:{status:args.p_status,terminal_reason:args.p_terminal_reason},error:null};}} as unknown as SupabaseClient;
  const candidates=['2330','6488'].map((symbol,index)=>({stockId:`stock-${index}`,symbol,exchange:'TWSE' as const,knownPriceSessions:[],knownMultipleSessions:[]}));
  const result=await runCandidateHistoryBackfill({client,candidates,officialSessions:['2026-09-10'],latestSession:'2026-09-10',
    evaluationAt:'2026-09-11T00:00:00.000Z',requestBudget:2},
  {fetchMonth:async(job)=>{if(job.symbol==='2330')throw new Error('socket connection failed');return {bars:[],multiples:[],sourceUrl:'https://www.twse.com.tw/',httpStatus:null,terminalReason:'official_no_rows'};}});
  assert.equal(result.items.length,2);
  assert.equal(result.items.find((item)=>item.stockId==='stock-0')?.terminalReason,'official_network_error');
  assert.equal(result.items.find((item)=>item.stockId==='stock-1')?.terminalReason,'official_no_rows');
});

test('stored conflicts survive subsequent runs even when no contradictory row is downloaded again', async () => {
  const checkpoint = { stock_id:'stock-a',dataset:'price',month:'2026-09-01',status:'conflict',terminal_reason:'official_history_value_conflict',
    attempted_at:'2026-09-10T13:00:00Z',next_attempt_at:null,attempts:1,observed_through:'2026-09-10',observed_sessions:['2026-09-10'] };
  const query={select(){return this;},in(){return this;},order(){return this;},range(){return Promise.resolve({data:[checkpoint],error:null});}};
  const client={from(){return query;},async rpc(_name:string,args:Record<string,unknown>){return {data:{status:args.p_status,terminal_reason:args.p_terminal_reason},error:null};}} as unknown as SupabaseClient;
  const result=await runCandidateHistoryBackfill({client,candidates:[{stockId:'stock-a',symbol:'2330',exchange:'TWSE',
    knownPriceSessions:['2026-09-10'],knownMultipleSessions:['2026-09-10']}],officialSessions:['2026-09-10'],
    latestSession:'2026-09-10',evaluationAt:'2026-09-11T00:00:00Z',requestBudget:1},
  {fetchMonth:async()=>({bars:[],multiples:[],sourceUrl:'https://www.twse.com.tw/',httpStatus:null,terminalReason:'official_no_rows'})});
  assert.deepEqual(result.conflicts,[{stockId:'stock-a',dataset:'price',month:'2026-09-01',terminalReason:'official_history_value_conflict'}]);
  assert.equal(result.prices.has('stock-a'),false);
});
