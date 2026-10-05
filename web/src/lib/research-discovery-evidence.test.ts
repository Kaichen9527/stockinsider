import assert from 'node:assert/strict';
import test from 'node:test';
import { discoveryInstant, discoveryRelativeReturns, discoveryPricePhase, type DiscoveryPriceBar } from './research-discovery-evidence.ts';

const asOf = '2026-10-05T10:00:00Z';
function bars(): DiscoveryPriceBar[] {
  const rows: DiscoveryPriceBar[] = [];
  for (let time=Date.parse('2026-06-01T00:00:00Z');rows.length<61;time+=86_400_000) {
    const day=new Date(time); const session=day.toISOString().slice(0,10);
    // Synthetic short holiday week: a trading-day window, never 61 civil days.
    if ([0,6].includes(day.getUTCDay()) || ['2026-06-18','2026-06-19'].includes(session)) continue;
    rows.push({session,close:100+rows.length,availableAt:`${session}T06:00:00Z`});
  }
  return rows;
}
test('DE01 61 aligned completed sessions count holiday short weeks, with exact 5/20/60 ratios',()=>{
  const stock=bars(); const market=stock.map((row)=>({...row,close:100}));
  const result=discoveryRelativeReturns(stock,market,asOf);
  assert.equal(result.relative5d,160/155-1); assert.equal(result.relative20d,160/140-1);
  assert.equal(result.relative60d,160/100-1); assert.equal(stock.some((row)=>row.session==='2026-06-19'),false);
});
test('DE02 incomplete or misaligned benchmark makes all horizons unknown',()=>{
  const stock=bars();
  assert.deepEqual(discoveryRelativeReturns(stock.slice(-21),stock.slice(-21),asOf,{requireComplete61:true}),{relative5d:null,relative20d:null,relative60d:null});
  const market=structuredClone(stock);market[0].session='2026-05-29';
  assert.equal(discoveryRelativeReturns(stock,market,asOf,{requireComplete61:true}).relative5d,null);
});
test('DE03 impossible, timezone-free, 24-hour and malformed date clocks reject',()=>{
  for(const value of ['2026-02-30T06:00:00Z','2026-10-05T24:00:00Z','2026-10-05T10:00:00','2026-10-05T10:61:00Z']) {
    assert.equal(discoveryInstant(value),false);
    assert.throws(()=>discoveryRelativeReturns(bars(),bars(),value),/cutoff_invalid/);
  }
  const stock=bars();stock[0].session='2026-02-30';
  assert.throws(()=>discoveryRelativeReturns(stock,bars(),asOf),/price_invalid/);
});
test('DE04 future availability/session and availability before session cannot be silently filtered',()=>{
  for(const change of [{availableAt:'2026-10-06T06:00:00Z'},
    {session:'2026-10-06',availableAt:'2026-10-05T06:00:00Z'},
    {availableAt:'2026-05-31T06:00:00Z'}]) {
    const stock=bars();stock[0]={...stock[0],...change};
    assert.throws(()=>discoveryRelativeReturns(stock,bars(),asOf),/price_invalid/);
  }
});
const phase={close:100,ma20:99,atr14:3,rsi14:60,breakoutConfirmed:true,pullbackConfirmed:false,officialDatasetVerified:true};
test('DE05 RSI ranges, official failure, absent or conflicting trigger metadata stay unknown',()=>{
  for(const input of [{...phase,rsi14:-1},{...phase,rsi14:101},{...phase,officialDatasetVerified:false},
    {...phase,breakoutConfirmed:null},{...phase,pullbackConfirmed:true}]) assert.equal(discoveryPricePhase(input),'unknown');
});
test('DE06 existing overheating predicates outrank breakout and pullback',()=>{
  assert.equal(discoveryPricePhase({...phase,rsi14:75}),'extended');
  assert.equal(discoveryPricePhase({...phase,close:106}),'extended');
});
test('DE07 established breakout, pullback and waiting are research phases only',()=>{
  assert.equal(discoveryPricePhase(phase),'initial_breakout');
  assert.equal(discoveryPricePhase({...phase,breakoutConfirmed:false,pullbackConfirmed:true}),'trend_pullback');
  assert.equal(discoveryPricePhase({...phase,breakoutConfirmed:false}),'research_before_trigger');
});
