// Read-only replay of two pinned product modules using controlled roster history.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { stripTypeScriptTypes } from 'node:module';
const gitBlobs = ["fe7bcc1e0c4c9fff871a5d4e2d6cf2d7f7d90f13","c28b7751f68da47b24297607e2b0b74b22f53d96"];
const scripts = readFileSync(0,'utf8').trim().split('\n').map((encoded,index) => {
  const raw=Buffer.from(encoded,'base64');
  assert.equal(createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex'),gitBlobs[index]);
  return raw.toString('utf8');
});
const dataUrl = (value) => 'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(value)).toString('base64');
const imported = scripts[1].replace('./preparation-trading-identity.ts',dataUrl(scripts[0]));
const {readCurrentScreeningInstruments} = await import(dataUrl(imported));
const knownDate='2026-11-13T13:30:00.000000Z';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const stocks=Array.from({length:220},(_,index)=>({id:id(index+1),symbol:String(1000+index),market:'TW'}));
function rosterRow(stock,ordinal,opts={}){
  const day=String(10+ordinal).padStart(2,'0');
  return {stock_id:stock.id,symbol:stock.symbol,instrument_authority_id:id(10000+Number(stock.symbol)*10+ordinal),
    exchange:'TWSE',instrument_type:'common_stock',listing_status:'active',provider:'twse',
    source_timestamp:'2026-08-'+day+'T00:00:00.000001Z',recorded_at:'2026-08-'+day+'T00:02:00.000001Z',
    valid_from:'2000-01-01T00:00:00.000000Z',valid_to:null,roster_version:'tw-instrument-roster-v3.0',...opts};
}
async function run(stockRows,history,cutoff){
  const calls=[];
  const client={from(table){
    const select = {select(){return select},in(key,values){calls.push([table,key,values.length]);return select},
      eq(){return select},order(){return select},limit(n){return {error:null,data:(table==='stocks'?stockRows:history).slice(0,n)}}};
    return select;
  }};
  const result=await readCurrentScreeningInstruments(client,stockRows.map(row=>row.symbol),cutoff);
  return {identities:result.identities.size,missing:result.gaps.size,gapReasons:[...new Set(result.gaps.values())],
    exchanges:[...new Set([...result.identities.values()].map(item=>item.exchange))],stockAndTwoRosterIndexesQueried:calls.length===3};
}
const baseline=stocks.flatMap(stock=>Array.from({length:4},(_,i)=>rosterRow(stock,i)));
const refreshed=[...baseline,...stocks.map(stock=>rosterRow(stock,4))];
const old=rosterRow(stocks[0],0,{exchange:'TPEX',provider:'tpex'});
const newer=rosterRow(stocks[0],1,{source_timestamp:'2026-11-14T00:00:00.000001Z',recorded_at:'2026-11-14T00:02:00.000001Z',valid_from:'2026-11-14T00:00:00.000000Z'});
const baselineResult=await run(stocks,baseline,knownDate);
const refreshedResult=await run(stocks,refreshed,knownDate);
const oldWithoutRevision=await run([stocks[0]],[old],knownDate);
const oldWithLaterRevision=await run([stocks[0]],[old,newer],knownDate);
const afterRevision=await run([stocks[0]],[old,newer],'2026-11-15T00:30:00.000000Z');
assert.equal(baselineResult.identities,220);
assert.deepEqual(refreshedResult.gapReasons,['shared_roster_cache_unbounded']);
assert.deepEqual(oldWithoutRevision.exchanges,['TPEX']);
assert.deepEqual(oldWithLaterRevision.gapReasons,['vnext_preparation_instrument_clock_unavailable']);
assert.deepEqual(afterRevision.exchanges,['TWSE']);
process.stdout.write(JSON.stringify({node:process.version,nonRoot:process.getuid()!==0,gitBlobsVerified:true,
  baselineResult,refreshedResult,oldWithoutRevision,oldWithLaterRevision,afterRevision})+'\n');
