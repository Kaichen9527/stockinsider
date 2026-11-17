/** Bounded shared-cache read, not financial or source qualification authority. */
import type {getSupabaseServerClient} from '../supabase-server';
import {currentPreparationInstrument} from './preparation-trading-identity.ts';
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
 if(!ids.size)return unavailable('official_stock_cache_empty');
 const snapshot=await client.rpc('vnext_screen_roster_heads_v1',{p_symbols:symbols,p_cutoff:cutoff});
 if(snapshot.error)throw Error('vnext_shared_instrument_cache_unavailable');
 const heads=snapshot.data as Record<string,unknown>|null;
 if(!heads||typeof heads!=='object'||Array.isArray(heads)||Object.keys(heads).length!==symbols.length
   ||symbols.some(symbol=>!Object.hasOwn(heads,symbol)))return unavailable('shared_roster_identity_unavailable');
 for(const symbol of symbols){
  const stock=master.get(symbol);
  if(!stock||conflicts.has(symbol)){gaps.set(symbol,'shared_stock_identity_missing_or_ambiguous');continue;}
  const head=heads[symbol];
  const selected=currentPreparationInstrument(head===null?[]:[head],{stockId:String(stock.id),symbol,cutoff});
  if(selected.status!=='current'){gaps.set(symbol,selected.reason);continue;}
  identities.set(symbol,selected.instrument);
 }
 return {identities,gaps};
}
