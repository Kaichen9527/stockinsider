import {createHash} from 'node:crypto';
import {evidenceInstant} from './evidence-clock.ts';
import {evaluateLaunchOutcome,type LaunchOutcomeInput} from './launch-outcomes.ts';
import {inputHash} from './policy.ts';

export const FUGLE_OPENING_CAPTURE_POLICY='fugle-opening-capture-v1';
export const FUGLE_CAPTURE_MAX_BYTES=512*1024;
const STREAM='wss://api.fugle.tw/marketdata/v1.0/stock/streaming';
const TICKER='https://api.fugle.tw/marketdata/v1.0/stock/intraday/ticker/';
const flags=['isTrial','isDelayedOpen','isContinuous','isOpen','isClose',
  'isLimitUpPrice','isLimitDownHalt','isLimitUpHalt'] as const;
type RawReceipt={url:string;receivedAt:string;sha256:string};
type Receipts={stream:RawReceipt;ticker:RawReceipt};
type Captures={stream:Uint8Array;ticker:Uint8Array};

function record(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('fugle_capture_shape');
  return value as Record<string,unknown>;
}
function time(value:unknown):bigint{
  const at=evidenceInstant(value);
  if(at===null)throw Error('fugle_capture_clock');
  return at;
}
function positiveInteger(value:unknown):value is number{
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
}
function decode(bytes:Uint8Array,receipt:RawReceipt,url:string,cutoff:bigint):unknown{
  if(receipt?.url!==url||time(receipt.receivedAt)>cutoff)throw Error('fugle_capture_receipt_scope');
  if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>FUGLE_CAPTURE_MAX_BYTES
    ||createHash('sha256').update(bytes).digest('hex')!==receipt.sha256)throw Error('fugle_capture_digest');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

/**
 * Check a private, operator-held capture against the first applicable official
 * session. The caller supplies already selected calendar and OHLC revisions.
 * Capture bytes and receipt clocks still require independent provenance review.
 * The result cannot update the writer or authorize a public execution outcome.
 */
export function checkFugleOpeningCapture(input:LaunchOutcomeInput,receipts:Receipts,captures:Captures){
  if(input.opening!==null)throw Error('fugle_capture_existing_opening');
  evaluateLaunchOutcome(input);
  const next=input.sessions.find(row=>row.status!=='cancelled');
  const bar=next&&input.bars.find(row=>row.session===next.session);
  if(!next||next.status!=='completed'||!bar)throw Error('fugle_capture_no_completed_opening');
  const {symbol,market}=input.signal;
  const cutoff=time(input.asOf),opens=time(next.openAt),closes=time(next.closeAt);
  const endWindow=opens+BigInt(120_000_000);
  const exchange=market==='TWSE'?'TWSE':'TPEx';
  const venue=market==='TWSE'?'TSE':'OTC';
  const capture=record(decode(captures.stream,receipts.stream,STREAM,cutoff));
  const ticker=record(decode(captures.ticker,receipts.ticker,TICKER+encodeURIComponent(symbol),cutoff));
  const tickerAt=time(receipts.ticker.receivedAt);
  const boardLot=ticker.boardLot,limit=ticker.limitUpPrice;
  if(ticker.symbol!==symbol||ticker.date!==next.session||ticker.exchange!==exchange||ticker.market!==venue
    ||ticker.type!=='EQUITY'||ticker.securityType!=='01'||ticker.securityStatus!=='NORMAL'
    ||ticker.isDisposition===true||ticker.tradingCurrency!=='TWD'||tickerAt<opens||tickerAt>closes
    ||!positiveInteger(boardLot)||typeof limit!=='number'||!Number.isFinite(limit)||limit<=0)
    throw Error('fugle_capture_ticker_scope');

  const subscribe=record(capture.subscription),received=Array.isArray(capture.frames)?capture.frames:[];
  const through=time(capture.through);
  if(subscribe.symbol!==symbol||subscribe.channel!=='trades'||subscribe.intradayOddLot!==false
    ||through<endWindow||through>time(receipts.stream.receivedAt)||received.length===0)
    throw Error('fugle_capture_opening_window');

  let previous=time(input.signal.cutoff),channelId:string|null=null;
  let first:{serial:number;micros:number;price:number;shares:number;fingerprint:string;opening:boolean}|null=null;
  const digests=new Map<number,string>();
  let last:{serial:number;micros:number}|null=null;
  let interruptedAuction=false;
  for(const item of received){
    const {receivedAt,message}=record(item);
    const at=time(receivedAt),frame=record(message),data=record(frame.data);
    if(at<previous||at>through)throw Error('fugle_capture_frame_clock');
    previous=at;
    if(frame.event==='subscribed'){
      if(channelId||at>=opens||typeof data.id!=='string'||!data.id||data.channel!=='trades'||data.symbol!==symbol)
        throw Error('fugle_capture_subscription');
      channelId=data.id;
      continue;
    }
    if(!channelId||frame.id!==channelId||(frame.channel!==undefined&&frame.channel!=='trades')
      ||data.symbol!==symbol||data.type!=='EQUITY'||data.exchange!==exchange||data.market!==venue
      ||flags.some(key=>data[key]!==undefined&&typeof data[key]!=='boolean'))
      throw Error('fugle_capture_frame_scope');
    if(frame.event==='snapshot'&&at<opens)continue;
    if(frame.event!=='data')throw Error('fugle_capture_frame_kind');
    if(!positiveInteger(data.time)||BigInt(data.time)>at)throw Error('fugle_capture_frame_clock');
    const micros=BigInt(data.time);
    if(micros>=endWindow)continue;
    if(!first&&(data.isDelayedOpen===true||data.isLimitDownHalt===true||data.isLimitUpHalt===true))interruptedAuction=true;
    if(data.isTrial===true)continue;
    if(micros<opens||at>=endWindow||!positiveInteger(data.serial)||!positiveInteger(data.size)
      ||typeof data.price!=='number'||!Number.isFinite(data.price)||data.price<=0)
      throw Error('fugle_capture_trade');
    const shares=data.size*boardLot;
    if(!positiveInteger(shares))throw Error('fugle_capture_trade');
    const fingerprint=inputHash(data);
    const duplicate=digests.get(data.serial);
    if(duplicate!==undefined){
      if(duplicate!==fingerprint)throw Error('fugle_capture_conflicting_trade');
      continue;
    }
    digests.set(data.serial,fingerprint);
    const opening=data.isOpen===true&&data.isDelayedOpen!==true&&data.isContinuous!==true&&data.isClose!==true
      &&data.isLimitUpPrice!==true&&data.isLimitDownHalt!==true&&data.isLimitUpHalt!==true;
    if(last&&(data.time<last.micros||data.serial<last.serial))throw Error('fugle_capture_trade_order');
    last={micros:data.time,serial:data.serial};
    if(first&&data.isOpen===true)throw Error('fugle_capture_conflicting_trade');
    first??={serial:data.serial,micros:data.time,price:data.price,shares,fingerprint,opening};
  }
  if(!channelId)throw Error('fugle_capture_subscription');
  const clocks=[receipts.stream.receivedAt,receipts.ticker.receivedAt,bar.availableAt,next.knownAt];
  const knownAt=clocks.reduce((a,b)=>time(a)>=time(b)?a:b);
  if(time(knownAt)>cutoff)throw Error('fugle_capture_receipt_scope');
  const scoped={policy:FUGLE_OPENING_CAPTURE_POLICY,symbol,session:next.session,knownAt};
  if(interruptedAuction||!first?.opening||first.shares<1000||first.price>=limit){
    return {...scoped,state:'insufficient_evidence' as const,candidate:null};
  }
  if(first.price!==Number(bar.rawOpen))throw Error('fugle_capture_official_open_mismatch');
  const revision=inputHash({...scoped,signal:input.signal.inputHash,rankingRunId:input.signal.rankingRunId,calendarRevision:input.calendarRevision,
    priceRevision:bar.priceRevision,streamDigest:receipts.stream.sha256,tickerDigest:receipts.ticker.sha256,
    frame:first.fingerprint});
  return {...scoped,state:'review_candidate' as const,candidate:{
    rawOpen:bar.rawOpen,openingShares:first.shares,openingUnixMicros:first.micros,priceRevision:bar.priceRevision,revision,
  }};
}
