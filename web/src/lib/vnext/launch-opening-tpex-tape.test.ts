import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {LaunchOutcomeInput} from './launch-outcomes.ts';
import {replayTpexOpeningOutcome} from './launch-opening-tpex-tape.ts';

const knownAt='2026-11-15T06:00:01Z';
const previous='2026-11-12',session='2026-11-13',revision='b'.repeat(64);
const symbol='3105',rank='00000000-0000-4000-8000-000000000001';
const input:LaunchOutcomeInput={scope:'historical_price_replay',asOf:knownAt,
  basisRevision:revision,calendarRevision:revision,opening:null,
  signal:{rankingRunId:rank,firstRankingRunId:rank,symbol,market:'TPEX',session:previous,
    cutoff:previous+'T13:30:00Z',inputHash:revision,priceRevision:revision,rawClose:'99',normalizedClose:'99'},
  sessions:[{session,openAt:session+'T01:00:00Z',closeAt:session+'T05:30:00Z',knownAt:session+'T06:00:00Z',status:'completed'}],
  bars:[{session,availableAt:session+'T06:00:00Z',priceRevision:revision,basisRevision:revision,rawOpen:'100.00',
    open:'100',high:'102',low:'99',close:'101'}]};
const headings=['代號','名稱','收盤','漲跌','開盤','最高','最低','均價','成交股數','成交金額(元)','成交筆數',
  '最後買價','最後買量(千股)','最後賣價','最後賣量(千股)','發行股數','次日 參考價','次日 漲停價','次日 跌停價'];

function row(side:'B'|'S',kind:string,clock:string,serial:number,shares:number,price='0100.00'){
  return [session.replaceAll('-',''),symbol.padEnd(6),side,kind,clock,String(serial).padStart(8,'0'),'00001',price,
    String(shares).padStart(9,'0'),'0000000000','\r\n'].join('');
}
function pair(kind:string,clock:string,serial:number,shares:number,price?:string){
  return row('B',kind,clock,serial,shares,price)+row('S',kind,clock,serial,shares,price);
}
function data(date:string,{shares=3425,groups=4,upper='110',open='100.00',close='101'}={}){
  const fields=[symbol,'測試股',close,'+1',open,'102','99','101',String(shares),'345925',String(groups),
    '100','20','101','10','50000000','101',upper,'90'];
  return Buffer.from(JSON.stringify({date:date.replaceAll('-',''),stat:'ok',tables:[{fields:headings,data:[fields]}]}));
}
function url(date:string){
  return 'https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date='+encodeURIComponent(date.replaceAll('-','/'))+'&response=json';
}
function packet(tape?:string,day=data(session),prior=data(previous,{close:'99'})){
  const raw=Buffer.from(tape??(
    pair('2','090000000001',11,25)+pair('0','090000123456',12,2000)
    +pair('0','090000123456',13,1000)+pair('0','143000000000',14,400)));
  const receipt=(bytes:Uint8Array)=>({observedAt:'2026-11-15T06:00:00Z',recordedAt:knownAt,
    sha256:createHash('sha256').update(bytes).digest('hex')});
  return {captures:{tape:raw,day,prior},receipts:{tape:receipt(raw),
    day:{...receipt(day),url:url(session)},prior:{...receipt(prior),url:url(previous)}}};
}

test('pairs both sides, excludes odd lots and after-hours, and freezes the modeled price in historical scope',()=>{
  const p=packet(),result=replayTpexOpeningOutcome(input,p.receipts,p.captures);
  assert.equal(result.scope,'historical_price_replay');
  assert.equal(result.firstMatchingAt,session+'T09:00:00.123456+08:00');
  assert.equal(result.dayShares,3425);
  assert.equal(result.firstMatchingShares,3000);
  assert.equal(result.firstMatchingTrades,2);
  assert.equal(result.knownAt,knownAt);
  assert.equal(result.outcome.execution.status,'modeled_fill');
  assert.equal(result.outcome.execution.fill?.rawOpen,'100.00');
  assert.equal(result.outcome.execution.fill?.openingRevision,result.revision);
  assert.deepEqual(replayTpexOpeningOutcome(input,p.receipts,p.captures),result);
});

test('a limit-up opening or a sub-lot first print does not establish a simulated fill',()=>{
  const locked=packet(undefined,data(session),data(previous,{upper:'100',close:'99'}));
  assert.equal(replayTpexOpeningOutcome(input,locked.receipts,locked.captures).outcome.execution.status,'opening_evidence_gap');
  const small=packet(pair('0','090000000001',11,400)+pair('0','090001000001',12,2000),data(session,{shares:2400,groups:2}));
  assert.equal(replayTpexOpeningOutcome(input,small.receipts,small.captures).outcome.execution.status,'opening_evidence_gap');
});

test('a first print at or after the official delayed-open boundary needs separate opening evidence',()=>{
  for(const at of ['090200000000','103012100000']){
    const p=packet(pair('0',at,12,2000),data(session,{shares:2000,groups:1}));
    const result=replayTpexOpeningOutcome(input,p.receipts,p.captures);
    assert.equal(result.firstMatchingShares,2000);
    assert.equal(result.outcome.execution.status,'opening_evidence_gap');
  }
});

test('unpaired, mixed price, missing groups, and wrong-day source are refused',()=>{
  for(const [p,reason] of [
    [packet(row('B','0','090000123456',11,2000)),/archive_unpaired/u],
    [packet(row('B','0','090000123456',11,2000)+row('S','0','090000123456',11,2000,'0101.00')),/archive_pair_price/u],
    [packet(pair('0','090000123456',12,2000)),/archive_daily_totals/u],
    [packet(undefined,data(previous)),/archive_daily_scope/u],
    [packet(undefined,data(session,{open:'99.00'})),/archive_bar_revision/u],
    [packet(pair('0','090000123456',12,2000).trimEnd()),/archive_record_width/u],
  ] as const)assert.throws(()=>replayTpexOpeningOutcome(input,p.receipts,p.captures),reason);
});

test('rejects future knowledge, tampering, wrong venue, and the published-ranking scope',()=>{
  const p=packet();
  assert.throws(()=>replayTpexOpeningOutcome({...input,scope:'published_rank'},p.receipts,p.captures),/archive_replay_only/u);
  assert.throws(()=>replayTpexOpeningOutcome({...input,signal:{...input.signal,market:'TWSE'}},p.receipts,p.captures),/archive_replay_only/u);
  assert.throws(()=>replayTpexOpeningOutcome({...input,asOf:'2026-11-15T06:00:00Z'},p.receipts,p.captures),/archive_cutoff/u);
  assert.throws(()=>replayTpexOpeningOutcome(input,{...p.receipts,tape:{...p.receipts.tape,sha256:'f'.repeat(64)}},p.captures),/archive_digest/u);
  assert.throws(()=>replayTpexOpeningOutcome(input,{...p.receipts,day:{...p.receipts.day,url:url(previous)}},p.captures),/archive_daily_origin/u);
});
