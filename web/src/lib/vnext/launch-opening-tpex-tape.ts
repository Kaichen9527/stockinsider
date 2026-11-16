import {createHash} from 'node:crypto';
import {evidenceInstant} from './evidence-clock.ts';
import {evaluateLaunchOutcome,type LaunchOutcomeInput} from './launch-outcomes.ts';
import {inputHash} from './policy.ts';

export const TPEX_OPENING_TAPE_POLICY='tpex-mth-paired-opening-v1';
export const TPEX_MTH_MAX_BYTES=64*1024*1024;
export const TPEX_DAILY_MAX_BYTES=2*1024*1024;

export type ArchiveReceipt={
  observedAt:string; recordedAt:string; sha256:string;
};
export type TpexOpeningReplayReceipts={
  tape:ArchiveReceipt;
  prior:ArchiveReceipt & {url:string};
  day:ArchiveReceipt & {url:string};
};
type Captures={tape:Uint8Array; prior:Uint8Array; day:Uint8Array};
type CaptureClock={recordedAt:string; at:bigint; observed:bigint};
type Match={clock:string; kind:string; price:string; buy:number; sell:number};

const decimal=/^(?:0|[1-9]\d{0,10})(?:\.\d{1,8})?$/u;
const digits=/^[0-9]+$/u;
const priceFromArchive=/^\d{1,9}(?:\.\d{1,6})?$/u;
const tpexQuoteFields=['代號','名稱','收盤','漲跌','開盤','最高','最低','均價','成交股數','成交金額(元)','成交筆數',
  '最後買價','最後買量(千股)','最後賣價','最後賣量(千股)','發行股數','次日 參考價','次日 漲停價','次日 跌停價'];

function units(value:string):bigint {
  if(typeof value!=='string'||!decimal.test(value))throw Error('tpex_opening_archive_price');
  const [whole,fraction='']=value.split('.');
  const amount=BigInt(whole+fraction.padEnd(8,'0'));
  if(amount<=BigInt(0))throw Error('tpex_opening_archive_price');
  return amount;
}

function quoteCount(value:string):number {
  if(!/^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/u.test(value))throw Error('tpex_opening_archive_daily_count');
  const n=Number(value.replaceAll(',',''));
  if(!Number.isSafeInteger(n))throw Error('tpex_opening_archive_daily_count');
  return n;
}

function clock(iso:unknown):bigint {
  const value=evidenceInstant(iso);
  if(value===null)throw Error('tpex_opening_archive_clock');
  return value;
}

function receipt(bytes:Uint8Array,metadata:ArchiveReceipt,cap:number,asOf:bigint):CaptureClock {
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>cap
    ||!/^[a-f0-9]{64}$/u.test(metadata?.sha256)
    ||createHash('sha256').update(bytes).digest('hex')!==metadata.sha256)throw Error('tpex_opening_archive_digest');
  const observed=clock(metadata.observedAt),at=clock(metadata.recordedAt);
  if(observed>at||at>asOf)throw Error('tpex_opening_archive_cutoff');
  return {recordedAt:metadata.recordedAt,at,observed};
}

function quoteUrl(session:string):string {
  const url=new URL('https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes');
  url.searchParams.set('date',session.replaceAll('-','/'));
  url.searchParams.set('response','json');
  return url.href;
}

function readQuote(bytes:Uint8Array,source:string,session:string,symbol:string):string[] {
  if(source!==quoteUrl(session))throw Error('tpex_opening_archive_daily_origin');
  const packet=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!packet||packet.stat!=='ok'||packet.date!==session.replaceAll('-','')||!Array.isArray(packet.tables)||!packet.tables.length)
    throw Error('tpex_opening_archive_daily_scope');
  const table=packet.tables[0];
  if(!Array.isArray(table?.data)||table.data.length>20000||JSON.stringify(table.fields)!==JSON.stringify(tpexQuoteFields))
    throw Error('tpex_opening_archive_daily_shape');
  const rows=table.data.filter((row:unknown)=>Array.isArray(row)&&row[0]===symbol);
  if(rows.length!==1||rows[0].length!==tpexQuoteFields.length||!rows[0].every((cell:unknown)=>typeof cell==='string'))
    throw Error('tpex_opening_archive_daily_symbol');
  return rows[0];
}

function archivePrice(value:string):string {
  if(!priceFromArchive.test(value)||!/[1-9]/u.test(value))throw Error('tpex_opening_archive_price');
  return value.replace(/^0+(?=\d)/u,'');
}

function readMatches(bytes:Uint8Array,session:string,symbol:string):Match[] {
  // This adapter accepts the observed TPEx MTH profile, 67 bytes before CRLF.
  // The TWSE format and files mixing days or symbols have separate identities.
  const rowBytes=69;
  if(bytes.byteLength%rowBytes!==0)throw Error('tpex_opening_archive_record_width');
  const buffer=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const ymd=session.replaceAll('-','');
  const byMatch=new Map<string,Match>();
  for(let offset=0;offset<buffer.length;offset+=rowBytes){
    if(buffer[offset+67]!==13||buffer[offset+68]!==10)throw Error('tpex_opening_archive_record_width');
    const row=buffer.subarray(offset,offset+67);
    const field=(start:number,end:number)=>row.toString('latin1',start,end);
    const date=field(0,8),id=field(8,14),side=field(14,15),kind=field(15,16);
    const stamp=field(16,28),number=field(28,36),shares=field(48,57);
    if(date!==ymd||id!==symbol.padEnd(6,' ')||!['B','S'].includes(side)||!['0','1','2'].includes(kind)
      ||!digits.test(stamp)||!digits.test(number)||!digits.test(shares)||Number(shares)<=0)throw Error('tpex_opening_archive_record');
    const at=session+'T'+stamp.slice(0,2)+':'+stamp.slice(2,4)+':'+stamp.slice(4,6)+'.'+stamp.slice(6)+'+08:00';
    clock(at);
    const price=archivePrice(field(41,48)),key=kind+stamp+number;
    const match=byMatch.get(key)??{clock:at,kind,price,buy:0,sell:0};
    if(match.price!==price)throw Error('tpex_opening_archive_pair_price');
    if(side==='B')match.buy+=Number(shares);else match.sell+=Number(shares);
    byMatch.set(key,match);
  }
  const matches=[...byMatch.values()];
  if(matches.some(match=>match.buy===0||match.buy!==match.sell))throw Error('tpex_opening_archive_unpaired');
  return matches;
}

/** Offline historical price research using contemporaneous session bindings and
 * operator-held lawful archives. No scheduler, provider authorization, or
 * production transition is granted by this adapter or its report. */
export function replayTpexOpeningOutcome(input:LaunchOutcomeInput,receipts:TpexOpeningReplayReceipts,captures:Captures){
  if(input.scope!=='historical_price_replay'||input.signal.market!=='TPEX'||input.opening!==null)
    throw Error('tpex_opening_archive_replay_only');
  const historical=evaluateLaunchOutcome(input);
  const next=input.sessions.find(session=>session.status!=='cancelled');
  if(!next||next.status!=='completed')throw Error('tpex_opening_archive_session');
  const bar=input.bars.find(row=>row.session===next.session);
  if(!bar)throw Error('tpex_opening_archive_bar_missing');

  const asOf=clock(input.asOf),opens=clock(next.openAt),closes=clock(next.closeAt);
  const tape=receipt(captures.tape,receipts.tape,TPEX_MTH_MAX_BYTES,asOf);
  const prior=receipt(captures.prior,receipts.prior,TPEX_DAILY_MAX_BYTES,asOf);
  const day=receipt(captures.day,receipts.day,TPEX_DAILY_MAX_BYTES,asOf);
  if(tape.observed<closes||day.observed<closes||prior.observed<clock(input.signal.session+'T13:30:00+08:00'))
    throw Error('tpex_opening_archive_incomplete_day');

  const {symbol,session:signalSession}=input.signal;
  const dayQuote=readQuote(captures.day,receipts.day.url,next.session,symbol);
  const priorQuote=readQuote(captures.prior,receipts.prior.url,signalSession,symbol);
  const upper=units(priorQuote[17]);
  const rawOpen=dayQuote[4];
  const openingPrice=units(rawOpen);
  if(openingPrice!==units(bar.rawOpen)||units(priorQuote[2])!==units(input.signal.rawClose))
    throw Error('tpex_opening_archive_bar_revision');

  const matches=readMatches(captures.tape,next.session,symbol);
  const tradeShares=matches.reduce((sum,match)=>sum+match.buy,0);
  if(matches.length!==quoteCount(dayQuote[10])||tradeShares!==quoteCount(dayQuote[8])
    ||matches.some(match=>clock(match.clock)>tape.observed))throw Error('tpex_opening_archive_daily_totals');

  let firstTime:string|null=null,firstShares=0,firstMatches=0;
  for(const match of matches){
    if(match.kind!=='0')continue;
    const at=clock(match.clock);
    if(at<opens||at>closes)continue;
    if(firstTime===null||match.clock<firstTime){firstTime=match.clock;firstShares=0;firstMatches=0;}
    if(match.clock===firstTime){firstShares+=match.buy;firstMatches++;}
  }
  if(firstTime===null||matches.some(match=>match.kind==='0'&&match.clock===firstTime&&units(match.price)!==openingPrice)
    ||openingPrice>upper)throw Error('tpex_opening_archive_open_price');

  const knownAt=[tape,prior,day].reduce((a,b)=>a.at>=b.at?a:b).recordedAt;
  const revision=inputHash({policy:TPEX_OPENING_TAPE_POLICY,signalSession,session:next.session,symbol,
    tape:receipts.tape,prior:receipts.prior,day:receipts.day,priceRevision:bar.priceRevision,firstTime,firstShares});
  // The archive has no auction-status flag. The venue's two-minute delayed
  // opening starts a separate evidence case; a later first print alone
  // may be a reopening or a continuous match. Keep those fills unknown.
  const normalOpeningWindow=clock(firstTime)<opens+BigInt(120_000_000);
  const eligible=normalOpeningWindow&&openingPrice<upper&&firstShares>=1000;
  const outcome=eligible?evaluateLaunchOutcome({...input,opening:{session:next.session,knownAt,revision,status:'modeled_fill',
    rawOpen,priceRevision:bar.priceRevision,reason:null}}):historical;
  return {policy:TPEX_OPENING_TAPE_POLICY,scope:input.scope,symbol,session:next.session,knownAt,revision,
    firstMatchingAt:firstTime,firstMatchingShares:firstShares,firstMatchingTrades:firstMatches,rawOpen,officialUpperLimit:priorQuote[17],
    dayMatches:matches.length,dayShares:tradeShares,outcome};
}
