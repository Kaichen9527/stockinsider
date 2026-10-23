/** Bounded shared-cache read, not financial or source qualification authority. */
import type {getSupabaseServerClient} from '../supabase-server';
import {currentPreparationInstrument,PREPARATION_INSTRUMENT_COLUMNS} from './preparation-trading-identity.ts';
type Row=Record<string,unknown>;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
export async function readCurrentScreeningInstruments(client:ReturnType<typeof getSupabaseServerClient>,symbols:string[],cutoff:string){
 if(!Array.isArray(symbols)||symbols.length>220||new Set(symbols).size!==symbols.length||symbols.some(s=>!/^\d{4}$/u.test(s))||!Number.isFinite(Date.parse(cutoff)))throw Error('vnext_screen_roster_scope_invalid');
 const identities=new Map<string,Row>(),gaps=new Map<string,string>();
 const unavailable=(reason:string)=>{for(const symbol of symbols)gaps.set(symbol,reason);return {identities,gaps};};
 if(!symbols.length)return {identities,gaps};
 const stocks=await client.from('stocks').select('id,symbol,market').in('symbol',symbols).eq('market','TW').limit(221);
 if(stocks.error)throw Error('vnext_shared_stock_cache_unavailable');
 if(!Array.isArray(stocks.data)||stocks.data.length>220)return unavailable('shared_stock_cache_unbounded');
 const master=new Map<string,Row>(),ids=new Map<string,string>();const conflicts=new Set<string>();
 for(const value of stocks.data){
  const row=value as Row;
  if(!row||Object.keys(row).sort().join('|')!=='id|market|symbol'||typeof row.id!=='string'||!uuid.test(row.id)||typeof row.symbol!=='string'||!symbols.includes(row.symbol)||row.market!=='TW')return unavailable('shared_stock_identity_unavailable');
  if(master.has(row.symbol))conflicts.add(row.symbol);
  const prior=ids.get(row.id);if(prior){conflicts.add(prior);conflicts.add(row.symbol);}
  master.set(row.symbol,row);ids.set(row.id,row.symbol);
 }
 const stockIds=[...ids.keys()];
 if(!stockIds.length)return unavailable('official_stock_cache_empty');
 // Preserve the original 2000-row shared bound. Two bounded indexes are needed:
 // symbol corrections and same-stock symbol changes must both be visible.
 // Each has one overflow sentinel; overflow defers, never truncates into health.
 const bySymbol=await client.from('stock_instruments_v3').select(PREPARATION_INSTRUMENT_COLUMNS).in('symbol',symbols).order('recorded_at',{ascending:false}).limit(1001);
 const byStock=await client.from('stock_instruments_v3').select(PREPARATION_INSTRUMENT_COLUMNS).in('stock_id',stockIds).order('recorded_at',{ascending:false}).limit(1001);
 if(bySymbol.error||byStock.error)throw Error('vnext_shared_instrument_cache_unavailable');
 if(!Array.isArray(bySymbol.data)||!Array.isArray(byStock.data)||bySymbol.data.length>1000||byStock.data.length>1000)return unavailable('shared_roster_cache_unbounded');
 const union=new Map<string,Row>();
 const bytes=(row:Row)=>JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])));
 for(const row of [...bySymbol.data,...byStock.data] as Row[]){
  if(!row||typeof row.instrument_authority_id!=='string'||!uuid.test(row.instrument_authority_id)||typeof row.symbol!=='string'||typeof row.stock_id!=='string'||!symbols.includes(row.symbol)&&!stockIds.includes(row.stock_id))return unavailable('shared_roster_identity_unavailable');
  const existing=union.get(row.instrument_authority_id);
  if(existing&&bytes(existing)!==bytes(row))return unavailable('shared_roster_observation_changed_during_read');
  union.set(row.instrument_authority_id,row);
 }
 for(const symbol of symbols){
  const stock=master.get(symbol);
  if(!stock||conflicts.has(symbol)){gaps.set(symbol,'shared_stock_identity_missing_or_ambiguous');continue;}
  const selected=currentPreparationInstrument([...union.values()].filter(row=>row.symbol===symbol||row.stock_id===stock.id),{stockId:String(stock.id),symbol,cutoff});
  if(selected.status!=='current'){gaps.set(symbol,selected.reason);continue;}
  identities.set(symbol,selected.instrument);
 }
 return {identities,gaps};
}
