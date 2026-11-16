/** Actual screening adapter with an injected RPC response. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readCurrentScreeningInstruments as read} from './screening-instrument-identity.ts';
import type {getSupabaseServerClient} from '../supabase-server';

const id='10000000-0000-4000-8000-000000000001';
const cutoff='2026-10-23T05:30:00Z';
const roster=(patch:Record<string,unknown>={})=>({
 instrument_authority_id:'20000000-0000-4000-8000-000000000001',stock_id:id,symbol:'2330',exchange:'TWSE',
 instrument_type:'common_stock',listing_status:'active',provider:'twse',source_timestamp:'2026-10-22T00:00:00Z',
 valid_from:'2026-10-22T00:00:00Z',valid_to:null,roster_version:'tw-instrument-roster-v3.0',
 recorded_at:'2026-10-22T00:01:00Z',...patch,
});
function fixture(data:unknown={'2330':roster()},stocks:unknown[]=[{id,symbol:'2330',market:'TW'}],rpcError=false){
 const calls:unknown[]=[];
 const client={
  from(table:string){
   assert.equal(table,'stocks');
   const query={
    select(){return query;},in(){return query;},eq(){return query;},
    async limit(n:number){calls.push({table,limit:n});return {data:stocks,error:null};},
   };
   return query;
  },
  async rpc(name:string,args:unknown){calls.push({name,args});return {data,error:rpcError};},
 } as unknown as ReturnType<typeof getSupabaseServerClient>;
 return {client,calls};
}

test('empty and malformed scopes do not reach transport',async()=>{
 const f=fixture();
 assert.equal((await read(f.client,[],cutoff)).identities.size,0);
 for(const scope of [['bad'],['2330','2330'],Array.from({length:221},(_,i)=>String(1000+i))])
  await assert.rejects(()=>read(f.client,scope,cutoff),/scope_invalid/u);
 assert.deepEqual(f.calls,[]);
});

test('screening reads one bounded cutoff projection for the full requested scope',async()=>{
 const symbols=Array.from({length:220},(_,index)=>String(1000+index));
 const stocks=symbols.map(symbol=>({id:id.slice(0,-4)+symbol,symbol,market:'TW'}));
 const rows=Object.fromEntries(stocks.map(stock=>[stock.symbol,roster({symbol:stock.symbol,stock_id:stock.id})]));
 const f=fixture(rows,stocks);
 const result=await read(f.client,symbols,cutoff);
 assert.equal(result.identities.size,220);
 assert.equal(result.gaps.size,0);
 assert.deepEqual(result.identities.get(symbols[0]),rows[symbols[0]]);
 assert.deepEqual(f.calls,[{table:'stocks',limit:221},
  {name:'vnext_screen_roster_heads_v1',args:{p_symbols:symbols,p_cutoff:cutoff}}]);
});

test('the selected latest suspension, delisting or non-common instrument never falls back',async()=>{
 for(const patch of [{listing_status:'suspended'},{listing_status:'delisted'},{instrument_type:'depositary_receipt'}]){
  const result=await read(fixture({'2330':roster(patch)}).client,['2330'],cutoff);
  assert.equal(result.identities.size,0);
  assert.ok(result.gaps.has('2330'));
 }
});

test('null heads, malformed clocks and stock ID crosswires are gaps',async()=>{
 for(const value of [null,roster({recorded_at:'2099-01-01T00:00:00Z'}),roster({provider:'unknown'}),
  roster({stock_id:'10000000-0000-4000-8000-000000000002'}),roster({symbol:'2408'}),roster({approved:true})]){
  const result=await read(fixture({'2330':value}).client,['2330'],cutoff);
  assert.equal(result.identities.size,0);
  assert.ok(result.gaps.has('2330'));
 }
});

test('omitted, unexpected or unbounded scope and ambiguous master identity fail closed',async()=>{
 for(const data of [{},{'2330':roster(),'9999':roster()},[roster()]]){
  const result=await read(fixture(data).client,['2330'],cutoff);
  assert.equal(result.gaps.get('2330'),'shared_roster_identity_unavailable');
 }
 for(const stocks of [Array.from({length:221},()=>({id,symbol:'2330',market:'TW'})),
  [{id,symbol:'2330',market:'TW'},{id:'10000000-0000-4000-8000-000000000002',symbol:'2330',market:'TW'}]]){
  assert.equal((await read(fixture({'2330':roster()},stocks).client,['2330'],cutoff)).identities.size,0);
 }
 await assert.rejects(()=>read(fixture(null,undefined,true).client,['2330'],cutoff),/cache_unavailable/u);
});
