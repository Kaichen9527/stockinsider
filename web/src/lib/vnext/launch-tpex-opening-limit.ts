import {createHash} from 'node:crypto';
import {isHistoryDate} from '../candidate-price-history.ts';
import type {TwOpeningQuote} from '../tw-entry-plan-authority.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {decodeLicensedCsvRecords} from './licensed-csv-decoder.ts';
import type {LaunchOutcomeInput} from './launch-outcomes.ts';

export const TPEX_OPENING_LIMIT_URL='https://www.tpex.org.tw/web/stock/aftertrading/ceil_non_trading/ceil_ord_result.php?l=zh-tw&o=data';
export const TPEX_OPENING_LIMIT_MAX_BYTES=512*1024;
const fields=['資料日期','股票代號','名稱','收盤價','漲跌','總成交張數','漲跌停成交張數','漲跌停委託張數','漲跌停未成交張數'];
const symbolPattern=/^[1-9]\d{3}$/u;
const reportCode=/^[A-Z0-9]{4,10}$/u;
const decimal=/^-?(?:\d{1,8}|[1-9]\d{0,2}(?:,\d{3}){1,2})(?:\.\d{1,4})?$/u;
const signedLots=/^-?(?:\d{1,13}|[1-9]\d{0,2}(?:,\d{3}){1,4})$/u;
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const badReport=()=>{throw Error('launch_tpex_opening_limit_report_unverified');};

export type TpexOpeningLimitReceipt={
  session:string; sessionAuthorityId:string; body:Uint8Array; sha256:string; observedAt:string; recordedAt:string;
};

export function readTpexOpeningLimitRows(session:string,body:Uint8Array){
  if(!isHistoryDate(session)||!(body instanceof Uint8Array)||body.length<2||body.length>TPEX_OPENING_LIMIT_MAX_BYTES)
    return badReport();
  const year=Number(session.slice(0,4))-1911;
  if(year<1||year>999)return badReport();
  const roc=String(year).padStart(3,'0')+session.slice(5).replace('-','');
  const [header,...rows]=decodeLicensedCsvRecords(new TextDecoder('utf-8',{fatal:true}).decode(body),4001,fields.length);
  if(!header||header.length!==fields.length||!fields.every((field,i)=>header[i]===field)
    ||!rows.length||rows.some(row=>row.length!==fields.length||row[0]!==roc||!reportCode.test(row[1]))
    ||new Set(rows.map(row=>row[1])).size!==rows.length)return badReport();
  return rows;
}

function fieldNumber(value:string,pattern:RegExp){
  return pattern.test(value)?Number(value.replaceAll(',','')):NaN;
}

/** Dataset 17247 reports actual trades and remaining orders at the daily
 * limit. Positive price change identifies the upper side. Whole-day flat
 * official OHLC binds those trades to the same open as the frozen outcome. */
export function bindTpexOpeningLimit(input:LaunchOutcomeInput,quote:TwOpeningQuote,
  receipt:TpexOpeningLimitReceipt|null):LaunchOutcomeInput['opening']{
  const next=input.sessions.find(day=>day.status!=='cancelled');
  const bar=input.bars.find(row=>row.session===quote.session);
  if(!receipt||input.scope!=='published_rank'||input.signal.market!=='TPEX'||input.opening!==null
    ||!symbolPattern.test(input.signal.symbol)||next?.status!=='completed'||next.session!==receipt.session
    ||next.session!==quote.session||receipt.sessionAuthorityId!==quote.sessionAuthorityId
    ||!bar||bar.priceRevision!==quote.priceRevision||bar.rawOpen!==quote.rawPrice
    ||![bar.high,bar.low,bar.close].every(price=>price===bar.open)
    ||!Number.isSafeInteger(quote.volume)||quote.volume<=0)return null;
  const close= evidenceInstant(next.closeAt),cutoff=evidenceInstant(input.asOf);
  const observed=evidenceInstant(receipt.observedAt),recorded=evidenceInstant(receipt.recordedAt),priceAt=evidenceInstant(bar.availableAt);
  if(close===null||cutoff===null||observed===null||recorded===null||priceAt===null
    ||observed<close||recorded<observed||recorded>cutoff||priceAt<close||priceAt>cutoff)return null;
  try{
    const row=readTpexOpeningLimitRows(next.session,receipt.body).find(item=>item[1]===input.signal.symbol);
    if(!row||hash(receipt.body)!==receipt.sha256)return null;
    const price=fieldNumber(row[3],decimal),change=fieldNumber(row[4],decimal);
    const [total,matched,ordered,remaining]=row.slice(5).map(value=>fieldNumber(value,signedLots));
    if(price!==Number(quote.rawPrice)||!(price>0)||!(change>0)
      ||![total,matched,ordered,remaining].every(Number.isSafeInteger)
      ||total!==Math.floor(quote.volume/1000)||matched<=0||matched>total||remaining<=0||ordered-matched!==remaining)return null;
    const revision=hash(JSON.stringify(['tpex-published-opening-lock-v1',next.session,input.signal.symbol,
      quote.sessionAuthorityId,quote.priceRevision,quote.rawPrice,quote.volume,receipt.sha256,receipt.observedAt,receipt.recordedAt]));
    return {session:next.session,knownAt:priceAt>=recorded?bar.availableAt:receipt.recordedAt,revision,
      status:'unfillable',reason:'one_price_upper_limit',rawOpen:null,priceRevision:null};
  }catch{return null;}
}
