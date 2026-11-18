import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {evidenceInstant} from './evidence-clock.ts';
import {checkFugleOpeningCapture} from './launch-opening-fugle.ts';
import type {LaunchOutcomeInput} from './launch-outcomes.ts';

const rank='00000000-0000-4000-8000-000000000001', digest='b'.repeat(64);
const day='2023-05-29', previous='2023-05-26';
const ts=(hhmmss:string)=>day+'T'+hhmmss+'+08:00';
const micros=(hhmmss:string)=>Number(evidenceInstant(ts(hhmmss)));
const tickerUrl='https://api.fugle.tw/marketdata/v1.0/stock/intraday/ticker/';
const streamUrl='wss://api.fugle.tw/marketdata/v1.0/stock/streaming';

function harness(market:LaunchOutcomeInput['signal']['market']='TWSE'){
  const symbol=market==='TWSE'?'2330':'3105';
  const security={symbol,type:'EQUITY',exchange:market==='TWSE'?'TWSE':'TPEx',market:market==='TWSE'?'TSE':'OTC'};
  const input:LaunchOutcomeInput={
    scope:'published_rank',asOf:ts('21:30:00'),calendarRevision:digest,basisRevision:digest,opening:null,
    signal:{rankingRunId:rank,firstRankingRunId:rank,symbol,market,session:previous,cutoff:previous+'T21:30:00+08:00',
      inputHash:digest,priceRevision:digest,rawClose:'566',normalizedClose:'566'},
    sessions:[{session:day,openAt:ts('09:00:00'),closeAt:ts('13:30:00'),knownAt:ts('15:00:00'),status:'completed'}],
    bars:[{session:day,availableAt:ts('15:00:00'),priceRevision:digest,basisRevision:digest,rawOpen:'568.00',
      open:'568',high:'572',low:'560',close:'568'}],
  };
  const ticker={...security,date:day,boardLot:1000,securityType:'01',securityStatus:'NORMAL',isDisposition:false,
    tradingCurrency:'TWD',limitUpPrice:622};
  const trade=(receive:string,fields:Record<string,unknown>={})=>({
    receivedAt:ts(receive),message:{event:'data',id:'example',channel:'trades',data:{
      ...security,price:568,size:2,volume:2,time:micros('09:00:00.100000'),serial:100,...fields,
    }},
  });
  const open=trade('09:00:00.200000',{isOpen:true});
  const ack={receivedAt:ts('08:55:00'),message:{event:'subscribed',data:{id:'example',symbol,channel:'trades'}}};
  const stream={subscription:{channel:'trades',symbol,intradayOddLot:false},through:ts('09:02:00'),
    frames:[ack,open] as Array<{receivedAt:string;message:Record<string,unknown>}>};
  const packet=()=>{
    const raw=(value:unknown)=>Buffer.from(JSON.stringify(value));
    const captures={stream:raw(stream),ticker:raw(ticker)};
    const receipt=(bytes:Buffer,url:string,receivedAt:string)=>({receivedAt,url,sha256:createHash('sha256').update(bytes).digest('hex')});
    return {captures,receipts:{stream:receipt(captures.stream,streamUrl,stream.through),
      ticker:receipt(captures.ticker,tickerUrl+symbol,ts('09:02:30'))}};
  };
  return {input,ticker,stream,open,ack,trade,packet,run:()=>{
    const {captures,receipts}=packet();
    return checkFugleOpeningCapture(input,receipts,captures);
  }};
}

test('binds a regular opening candidate to immutable official revisions for both markets',()=>{
  for(const market of ['TWSE','TPEX'] as const){
    const h=harness(market);
    const result=h.run();
    assert.equal(result.state,'review_candidate');
    assert.equal(result.candidate?.priceRevision,digest);
    assert.equal(result.candidate?.rawOpen,'568.00');
    assert.equal(result.candidate?.openingShares,2000);
    assert.equal(result.knownAt,ts('15:00:00'));
    assert.equal(h.input.opening,null);
    assert.equal(Object.hasOwn(result,'execution'),false);
    assert.deepEqual(result,h.run());
    h.input.bars[0].priceRevision='c'.repeat(64);
    assert.notEqual(result.candidate?.revision,h.run().candidate?.revision);
  }
});

test('documented 2330 closing packet and pre-open trial do not count as opening evidence',()=>{
  const h=harness();
  const close=h.trade('13:30:00.100000',{price:568,size:4778,volume:54538,bid:567,ask:568,isClose:true,time:1685338200000000});
  const trial=h.trade('08:59:59.950000',{isTrial:true,isOpen:true,time:micros('08:59:59.900000')});
  h.stream.through=close.receivedAt;
  h.stream.frames=[h.ack,trial,close];
  assert.equal(h.run().state,'insufficient_evidence');
});

test('rejects odd-lot requests, missing or late acknowledgements, and wrong event scope',()=>{
  const odd=harness();
  odd.stream.subscription.intradayOddLot=true;
  assert.throws(odd.run,/opening_window/u);
  const missing=harness();
  missing.stream.frames.shift();
  assert.throws(missing.run,/frame_scope/u);
  const late=harness();
  late.ack.receivedAt=ts('09:00:00');
  assert.throws(late.run,/subscription/u);
  const wrong=harness();
  wrong.open.message.id='another-subscription';
  assert.throws(wrong.run,/frame_scope/u);
  const snapshot=harness();
  snapshot.open.message.event='snapshot';
  assert.throws(snapshot.run,/frame_kind/u);
});

test('preserves ambiguous early trades, delayed opens and board lots below the simulated fill threshold',()=>{
  const first=harness();
  first.stream.frames.splice(1,0,first.trade('09:00:00.050000',{
    time:micros('09:00:00.000001'),serial:99,isContinuous:true,
  }));
  assert.throws(first.run,/conflicting_trade/u);
  const delayed=harness();
  Object.assign(delayed.open.message.data,{isDelayedOpen:true});
  assert.equal(delayed.run().state,'insufficient_evidence');
  const delayedTrial=harness();
  delayedTrial.stream.frames.splice(1,0,delayedTrial.trade('08:59:59.950000',{
    isTrial:true,isDelayedOpen:true,time:micros('08:59:59.900000'),
  }));
  assert.equal(delayedTrial.run().state,'insufficient_evidence');
  const lot=harness();
  lot.ticker.boardLot=100;
  assert.equal(lot.run().state,'insufficient_evidence');
  lot.ticker.boardLot=500;
  assert.equal(lot.run().candidate?.openingShares,1000);
  const limit=harness();
  limit.ticker.limitUpPrice=568;
  assert.equal(limit.run().state,'insufficient_evidence');
});

test('exact duplicate frames are harmless while conflicted serials, prices or late timestamps fail closed',()=>{
  const dup=harness();
  dup.stream.frames.push({...dup.open,receivedAt:ts('09:00:00.300000')});
  assert.equal(dup.run().candidate?.openingShares,2000);
  dup.stream.frames.push(dup.trade('09:00:00.400000',{isOpen:true,size:3}));
  assert.throws(dup.run,/conflicting_trade/u);
  const mismatch=harness();
  mismatch.input.bars[0].rawOpen='569';
  assert.throws(mismatch.run,/official_open_mismatch/u);
  const late=harness();
  late.open.receivedAt=ts('09:02:00');
  assert.throws(late.run,/trade/u);
  const before=harness();
  before.open.receivedAt=ts('09:00:00.099999');
  assert.throws(before.run,/frame_clock/u);
});

test('rejects modified bytes, a ticker from the wrong date and receipts beyond the outcome cutoff',()=>{
  const h=harness(),{captures,receipts}=h.packet();
  captures.ticker[0]=0;
  assert.throws(()=>checkFugleOpeningCapture(h.input,receipts,captures),/digest/u);
  const stale=harness();
  stale.ticker.date=previous;
  assert.throws(stale.run,/ticker_scope/u);
  const late=h.packet();
  late.receipts.ticker.receivedAt=ts('21:30:00.000001');
  assert.throws(()=>checkFugleOpeningCapture(h.input,late.receipts,late.captures),/receipt_scope/u);
});
