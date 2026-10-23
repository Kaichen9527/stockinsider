/** Bounded current instrument selection. This cache check does not mint a
 * source/financial qualification receipt; DB current-work fences still apply. */
export const PREPARATION_INSTRUMENT_COLUMNS='instrument_authority_id,stock_id,symbol,exchange,instrument_type,listing_status,provider,source_timestamp,valid_from,valid_to,roster_version,recorded_at';
type Row=Record<string,unknown>;
const keys=PREPARATION_INSTRUMENT_COLUMNS.split(',').sort().join('|');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
/** Preserve PostgreSQL microseconds when comparing current-head clocks. Never
 * round a later correction into an earlier equal-millisecond observation. */
function instant(value:unknown):bigint|null{
 if(typeof value!=='string')return null;
 const m=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.([0-9]{1,6}))?(Z|[+-](?:0[0-9]|1[0-4]):[0-5][0-9])$/u.exec(value);
 if(!m)return null;
 const base=Date.parse(m[1]+m[3]);if(!Number.isSafeInteger(base))return null;
 const offset=m[3]==='Z'?0:(m[3][0]==='-'?-1:1)*(Number(m[3].slice(1,3))*60+Number(m[3].slice(4,6)));
 if(new Date(base+offset*60000).toISOString().slice(0,19)!==m[1])return null;
 return BigInt(base)*BigInt(1000000)+BigInt((m[2]||'').padEnd(6,'0'))*BigInt(1000);
}
export function currentPreparationInstrument(value:unknown,scope:{stockId:string;symbol:string;cutoff:string}){
 const gap=(reason:string)=>({status:'gap' as const,reason});
 const cutoff=instant(scope.cutoff);
 if(!uuid.test(scope.stockId)||!/^\d{4}$/u.test(scope.symbol)||cutoff===null)return gap('vnext_preparation_instrument_scope_invalid');
 if(!Array.isArray(value)||value.length>1000)return gap('vnext_preparation_instrument_scope_unbounded');
 if(!value.length)return gap('vnext_trading_authority_missing');
 const rows:Row[]=[];const ids=new Set<string>();
 for(const item of value){
  if(!item||typeof item!=='object'||Array.isArray(item))return gap('vnext_preparation_instrument_shape_invalid');
  const row=item as Row;
  if(Object.keys(row).sort().join('|')!==keys||typeof row.instrument_authority_id!=='string'||!uuid.test(row.instrument_authority_id)||ids.has(row.instrument_authority_id)||typeof row.stock_id!=='string'||!uuid.test(row.stock_id)||typeof row.symbol!=='string'||!/^\d{4}$/u.test(row.symbol)||row.symbol!==scope.symbol&&row.stock_id!==scope.stockId)return gap('vnext_preparation_instrument_identity_invalid');
  ids.add(row.instrument_authority_id);
  if(typeof row.exchange!=='string'||typeof row.listing_status!=='string'||!['TWSE','TPEX'].includes(row.exchange)||row.provider!==row.exchange.toLowerCase()||row.instrument_type!=='common_stock'||!['active','suspended','delisted'].includes(String(row.listing_status))||row.roster_version!=='tw-instrument-roster-v3.0')return gap('vnext_preparation_instrument_tuple_unavailable');
  const source=instant(row.source_timestamp),recorded=instant(row.recorded_at),from=instant(row.valid_from),to=row.valid_to===null?null:instant(row.valid_to);
  if(source===null||recorded===null||from===null||row.valid_to!==null&&to===null||source>recorded||source>cutoff||recorded>cutoff||to!==null&&to<=from)return gap('vnext_preparation_instrument_clock_unavailable');
  rows.push(row);
 }
 const candidates=rows.filter(row=>row.symbol===scope.symbol);
 if(!candidates.length||candidates.some(row=>row.stock_id!==scope.stockId))return gap('vnext_preparation_instrument_stock_crosswire');
 const ordered=[...candidates].sort((a,b)=>instant(a.recorded_at)!>instant(b.recorded_at)!?-1:instant(a.recorded_at)!<instant(b.recorded_at)!?1:instant(a.source_timestamp)!>instant(b.source_timestamp)!?-1:instant(a.source_timestamp)!<instant(b.source_timestamp)!?1:String(a.instrument_authority_id).localeCompare(String(b.instrument_authority_id)));
 const head=ordered[0],headAt=instant(head.recorded_at)!;
 const tuple=(row:Row)=>JSON.stringify(Object.fromEntries(PREPARATION_INSTRUMENT_COLUMNS.split(',').filter(key=>key!=='instrument_authority_id').map(key=>[key,row[key]])));
 if(ordered.some(row=>instant(row.recorded_at)===headAt&&tuple(row)!==tuple(head)))return gap('vnext_preparation_instrument_latest_conflict');
 if(instant(head.valid_from)!>cutoff||head.valid_to!==null&&instant(head.valid_to)!<=cutoff)return gap('vnext_preparation_instrument_interval_unavailable');
 if(rows.some(row=>row.stock_id===scope.stockId&&row.symbol!==scope.symbol&&instant(row.valid_from)!<=cutoff&&(row.valid_to===null||instant(row.valid_to)!>cutoff)))return gap('vnext_preparation_instrument_symbol_crosswire');
 if(head.listing_status!=='active')return gap('vnext_trading_authority_not_active');
 return {status:'current' as const,instrument:structuredClone(head),exchange:head.exchange as 'TWSE'|'TPEX'};
}
