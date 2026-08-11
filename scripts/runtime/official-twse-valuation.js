'use strict';

const { canonicalJson,sha256,unavailable } = require('./codec');
const { loadOfficialTradingCalendarV314 } = require('./official-calendar-v314');
const { loadMopsFinancialHistoryV314 } = require('./official-mops-v314');

const SOURCE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL';
const TPEX_SOURCE_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis';
const TWSE_REVENUE_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L';
const TPEX_REVENUE_URL = 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O';
const TWSE_INDEX_URL = 'https://openapi.twse.com.tw/v1/indicesReport/MI_5MINS_HIST';
const TPEX_INDEX_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_index';
const TWSE_INDEX_HISTORY_URL = 'https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST';
const TPEX_INDEX_HISTORY_URL = 'https://www.tpex.org.tw/web/stock/iNdex_info/inxh/Inx_result.php';
const TWSE_VALUATION_HISTORY_URL = 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d';
const TPEX_VALUATION_HISTORY_URL = 'https://www.tpex.org.tw/web/stock/aftertrading/peratio_analysis/pera_result.php';
const TWSE_CLOSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const TPEX_CLOSE_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
const TWSE_PRICE_HISTORY_URL = 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY';
const TPEX_PRICE_HISTORY_URL = 'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock';
const STATEMENT_KINDS = Object.freeze(['ci','mim','basi','bd','fh','ins']);
const CORPORATE_ACTION_FEEDS = Object.freeze({
  TWSE:Object.freeze([
    Object.freeze({identity:'twse:twt49u:v1',kind:'ex_right_dividend',path:'exRight/TWT49U',header:['資料日期','股票代號','股票名稱','除權息前收盤價','除權息參考價']}),
    Object.freeze({identity:'twse:twtauu:v1',kind:'capital_reduction',path:'reducation/TWTAUU',header:['恢復買賣日期','股票代號','名稱','停止買賣前收盤價格','恢復買賣參考價']}),
    Object.freeze({identity:'twse:twtb8u:v1',kind:'par_value_change',path:'change/TWTB8U',header:['恢復買賣日期','股票代號','名稱','停止買賣前收盤價格','恢復買賣參考價']}),
  ]),
  TPEX:Object.freeze([
    Object.freeze({identity:'tpex:exright-cal:v1',kind:'ex_right_dividend',path:'exDailyQ',header:['除權息日期','代號','名稱','除權息前收盤價','除權息參考價']}),
    Object.freeze({identity:'tpex:reduction-reference:v1',kind:'capital_reduction',path:'revivt',header:['恢復買賣日期','股票代號','名稱','最後交易日之收盤價格','減資恢復買賣開始日參考價格']}),
    Object.freeze({identity:'tpex:change-reference:v1',kind:'par_value_change',path:'pvChgRslt',header:['恢復買賣日期','證券代號','證券名稱','最後交易日之收盤價格','恢復買賣開始參考價']}),
  ]),
});

function validOfficialReportedValuationSourceRef(exchange, sourceRef, { current = false } = {}) {
  if (typeof sourceRef !== 'string') return false;
  if (exchange === 'TWSE') return current
    ? /^twse-openapi:BWIBBU_ALL:\d{4}-\d{2}-\d{2}:\d{4}$/u.test(sourceRef)
    : /^(?:twse-openapi:BWIBBU_ALL|twse-rwd:BWIBBU_d):\d{4}-\d{2}-\d{2}:\d{4}$/u.test(sourceRef);
  if (exchange === 'TPEX') return current
    ? /^tpex-openapi:peratio:\d{4}-\d{2}-\d{2}:\d{4}$/u.test(sourceRef)
    : /^(?:tpex-openapi:peratio|tpex-rwd:peratio):\d{4}-\d{2}-\d{2}:\d{4}$/u.test(sourceRef);
  return false;
}

function statementUrl(exchange, statement, kind) {
  if (!['TWSE','TPEX'].includes(exchange) || !['income','balance'].includes(statement) || !STATEMENT_KINDS.includes(kind)) return null;
  const report = statement === 'income' ? '06' : '07';
  return exchange === 'TWSE'
    ? `https://openapi.twse.com.tw/v1/opendata/t187ap${report}_L_${kind}`
    : `https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap${report}_O_${kind}`;
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/gu, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function rocSession(value) {
  if (typeof value !== 'string' || !/^\d{7}$/u.test(value)) return null;
  const year = Number(value.slice(0, 3)) + 1911;
  const month = Number(value.slice(3, 5));
  const day = Number(value.slice(5, 7));
  const session = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${session}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === session ? session : null;
}

function parseTwseValuationRows(payload, { collectedAt, allowedSymbols = null } = {}) {
  if (!Array.isArray(payload) || typeof collectedAt !== 'string' || !Number.isFinite(Date.parse(collectedAt))) return [];
  return payload.flatMap((row) => {
    const symbol = typeof row?.Code === 'string' ? row.Code.trim() : '';
    const name = typeof row?.Name === 'string' ? row.Name.trim().normalize('NFC') : '';
    const session = rocSession(row?.Date);
    if (!/^\d{4}$/u.test(symbol) || !name || !session || (allowedSymbols && !allowedSymbols.has(symbol))) return [];
    return [{
      symbol,
      name,
      session,
      peRatio: finite(row.PEratio),
      pbRatio: finite(row.PBratio),
      dividendYield: finite(row.DividendYield),
      sourceRef: `twse-openapi:BWIBBU_ALL:${session}:${symbol}`,
      sourceUrl: SOURCE_URL,
      collectedAt: new Date(collectedAt).toISOString().replace('.000Z', 'Z'),
      authority: 'exchange_reported',
    }];
  });
}

function parseTpexValuationRows(payload, { collectedAt, allowedSymbols = null } = {}) {
  if (!Array.isArray(payload) || typeof collectedAt !== 'string' || !Number.isFinite(Date.parse(collectedAt))) return [];
  return payload.flatMap((row) => {
    const symbol = typeof row?.SecuritiesCompanyCode === 'string' ? row.SecuritiesCompanyCode.trim() : '';
    const name = typeof row?.CompanyName === 'string' ? row.CompanyName.trim().normalize('NFC') : '';
    const session = rocSession(row?.Date);
    if (!/^\d{4}$/u.test(symbol) || !name || !session || (allowedSymbols && !allowedSymbols.has(symbol))) return [];
    return [{ symbol,name,session,peRatio:finite(row.PriceEarningRatio),pbRatio:finite(row.PriceBookRatio),
      dividendYield:finite(row.YieldRatio),sourceRef:`tpex-openapi:peratio:${session}:${symbol}`,
      sourceUrl:TPEX_SOURCE_URL,collectedAt:new Date(collectedAt).toISOString().replace('.000Z','Z'),authority:'exchange_reported' }];
  });
}

function parseRevenueRows(payload, { exchange, collectedAt, allowedSymbols = null } = {}) {
  if (!Array.isArray(payload) || !['TWSE','TPEX'].includes(exchange)
      || typeof collectedAt !== 'string' || !Number.isFinite(Date.parse(collectedAt))) return [];
  return payload.flatMap((row) => {
    const symbol = String(row?.['公司代號'] ?? '').trim();
    const name = String(row?.['公司名稱'] ?? '').trim().normalize('NFC');
    const period = String(row?.['資料年月'] ?? '');
    if (!/^\d{4}$/u.test(symbol) || !name || !/^\d{5}$/u.test(period)
      || (allowedSymbols && !allowedSymbols.has(symbol))) return [];
    const year = Number(period.slice(0,3)) + 1911;
    const month = Number(period.slice(3,5));
    const asOf = `${year}-${String(month).padStart(2,'0')}-01`;
    const monthlyRevenue = finite(row['營業收入-當月營收']);
    if (!Number.isFinite(monthlyRevenue)) return [];
    const sourceUrl = exchange === 'TWSE' ? TWSE_REVENUE_URL : TPEX_REVENUE_URL;
    return [{ symbol,name,exchange,asOf,monthlyRevenue,yoyGrowth:finite(row['營業收入-去年同月增減(%)']),
      momGrowth:finite(row['營業收入-上月比較增減(%)']),sourceUrl,
      sourceRef:`${exchange.toLowerCase()}-openapi:monthly-revenue:${asOf}:${symbol}`,
      collectedAt:new Date(collectedAt).toISOString().replace('.000Z','Z'),authority:'exchange_reported' }];
  });
}

function parseOfficialCloseRows(payload,{exchange}={}) {
  if(!Array.isArray(payload)||!['TWSE','TPEX'].includes(exchange))return [];
  return payload.flatMap((row)=>{
    const symbol=String(exchange==='TWSE'?row?.Code:row?.SecuritiesCompanyCode??'').trim();
    const session=rocSession(row?.Date);const close=finite(exchange==='TWSE'?row?.ClosingPrice:row?.Close);
    return /^\d{4}$/u.test(symbol)&&session&&Number.isFinite(close)&&close>0
      ?[{symbol,exchange,session,close,sourceRef:`${exchange.toLowerCase()}-openapi:official-close:${session}:${symbol}`}]:[];
  });
}

function parseOfficialPriceHistory(payload,{exchange,symbol,sourceUrl,collectedAt}={}) {
  const rows=exchange==='TWSE'?payload?.data:payload?.tables?.[0]?.data;
  if(!Array.isArray(rows)||!['TWSE','TPEX'].includes(exchange)||!/^[0-9]{4}$/u.test(String(symbol))
      ||typeof sourceUrl!=='string'||typeof collectedAt!=='string'||!Number.isFinite(Date.parse(collectedAt)))return [];
  const expectedPrefix=exchange==='TWSE'?`${TWSE_PRICE_HISTORY_URL}?`:`${TPEX_PRICE_HISTORY_URL}?`;
  if(!sourceUrl.startsWith(expectedPrefix))return [];
  return rows.flatMap((row)=>{
    if(!Array.isArray(row))return [];
    const session=parseSlashSession(row[0]);
    const volume=finite(row[1]);const turnoverTwd=finite(row[2]);const open=finite(row[3]);
    const high=finite(row[4]);const low=finite(row[5]);const close=finite(row[6]);
    if(!session||![volume,turnoverTwd,open,high,low,close].every(Number.isFinite)||volume<0||turnoverTwd<0
        ||open<=0||high<=0||low<=0||close<=0||high<Math.max(open,close)||low>Math.min(open,close))return [];
    return [{symbol:String(symbol),exchange,session,open,high,low,close,volume,turnoverTwd,
      provider:exchange==='TWSE'?'twse':'tpex',sourceTimestamp:`${session}T06:30:00Z`,
      collectedAt:new Date(collectedAt).toISOString().replace('.000Z','Z'),sourceUrl,
      sourceRef:`${exchange.toLowerCase()}-rwd:${exchange==='TWSE'?'STOCK_DAY':'tradingStock'}:${session}:${symbol}`}];
  });
}

function parseActionSession(value){
  const normalized=String(value??'').trim().replace(/[年月]/gu,'/').replace(/日/gu,'');
  return parseSlashSession(normalized);
}

function parseCorporateActionResponse(bytes,{exchange,session,feed}={}){
  if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>8_388_608||!['TWSE','TPEX'].includes(exchange)
      ||!/^\d{4}-\d{2}-\d{2}$/u.test(String(session))||!CORPORATE_ACTION_FEEDS[exchange]?.includes(feed))
    throw new Error('corporate_action_input');
  const decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/<html|<!doctype/iu.test(decoded))throw new Error('corporate_action_html');
  let payload;try{payload=JSON.parse(decoded);}catch{throw new Error('corporate_action_json');}
  if(exchange==='TWSE'&&payload?.stat==='很抱歉，沒有符合條件的資料!')return [];
  if(!/^ok$/iu.test(String(payload?.stat??'')))throw new Error(`corporate_action_status:${feed.identity}`);
  const header=exchange==='TWSE'?payload.fields:payload?.tables?.[0]?.fields;
  const rows=exchange==='TWSE'?payload.data:payload?.tables?.[0]?.data;
  if(!Array.isArray(header)||!Array.isArray(rows)||!feed.header.every((value,index)=>header[index]===value))
    throw new Error(`corporate_action_schema:${feed.identity}`);
  const events=[];const seenRows=new Set();const seenSymbols=new Set();
  for(const row of rows){
    if(row.length<5||!parseActionSession(row[0]))continue;
    const rowSession=parseActionSession(row[0]);if(rowSession!==session)throw new Error('corporate_action_session_conflict');
    const canonicalRow=canonicalJson(row);if(seenRows.has(canonicalRow))continue;seenRows.add(canonicalRow);
    const symbol=String(row[1]??'').trim();const preActionReferencePrice=finite(row[3]);const postActionReferencePrice=finite(row[4]);
    if(!/^[0-9A-Za-z]{2,12}$/u.test(symbol)||!Number.isFinite(preActionReferencePrice)||preActionReferencePrice<=0
        ||!Number.isFinite(postActionReferencePrice)||postActionReferencePrice<=0||seenSymbols.has(symbol))
      throw new Error('corporate_action_row');
    seenSymbols.add(symbol);
    const sourceRow=["corporate-action-source-row-v3.1",exchange,session,symbol,feed.kind,
      preActionReferencePrice,postActionReferencePrice,feed.identity];
    events.push({symbol,eventKind:feed.kind,preActionReferencePrice,postActionReferencePrice,
      feedIdentity:feed.identity,sourceRowRef:sha256(canonicalJson(sourceRow))});
  }
  return events.sort((left,right)=>left.symbol.localeCompare(right.symbol));
}

function corporateActionUrl(exchange,session,feed){
  if(!CORPORATE_ACTION_FEEDS[exchange]?.includes(feed)||!/^\d{4}-\d{2}-\d{2}$/u.test(String(session)))return null;
  const compact=session.replaceAll('-','');const slash=session.replaceAll('-','%2F');
  return exchange==='TWSE'
    ?`https://www.twse.com.tw/rwd/zh/${feed.path}?startDate=${compact}&endDate=${compact}&response=json`
    :`https://www.tpex.org.tw/www/zh-tw/bulletin/${feed.path}?startDate=${slash}&endDate=${slash}&response=json`;
}

function statementIdentity(row, exchange) {
  const symbol = String(row?.['公司代號'] ?? row?.SecuritiesCompanyCode ?? '').trim();
  const name = String(row?.['公司名稱'] ?? row?.CompanyName ?? '').trim().normalize('NFC');
  const rocYear = Number(row?.['年度'] ?? row?.Year);
  const quarter = Number(row?.['季別'] ?? row?.Season);
  const output = String(row?.['出表日期'] ?? row?.Date ?? '');
  const filingDay = rocSession(output);
  if (!/^\d{4}$/u.test(symbol) || !name || !Number.isInteger(rocYear) || rocYear < 100
      || !Number.isInteger(quarter) || quarter < 1 || quarter > 4 || !filingDay) return null;
  const year = rocYear + 1911;
  const month = quarter * 3;
  const periodEnd = `${year}-${String(month).padStart(2,'0')}-${month === 3 || month === 12 ? '31' : '30'}`;
  return { symbol,name,exchange,quarter,periodStart:`${year}-01-01`,periodEnd,
    filingPublishedAt:`${filingDay}T00:00:00Z` };
}

function fact(identity, key, value, unit, sourceUrl, collectedAt, provider) {
  if (!Number.isFinite(value)) return null;
  const durationKind = [
    'book_value_per_share','net_asset_value','total_equity','total_assets','cash_and_equivalents','total_debt',
  ].includes(key) ? 'instant' : 'quarterly';
  return Object.freeze({ symbol:identity.symbol,name:identity.name,exchange:identity.exchange,factKey:key,
    periodStart:durationKind === 'instant' ? null : identity.periodStart,
    periodEnd:identity.periodEnd,durationKind,value,unit,
    provider,authorityTier:'official_filing',estimateKind:'reported',estimateHorizon:'reported_period',
    filingPublishedAt:identity.filingPublishedAt,sourceTimestamp:identity.filingPublishedAt,
    collectedAt:new Date(collectedAt).toISOString().replace('.000Z','Z'),
    sourceUrl,sourceRef:`${provider}-openapi:financial-statement:${identity.periodEnd}:${identity.symbol}:${key}` });
}

function sumAvailable(...values) {
  const selected = values.filter(Number.isFinite);
  return selected.length ? selected.reduce((sum,value)=>sum+value,0) : null;
}

function parseStatementFacts(payload, { exchange, statement, sourceUrl, collectedAt, allowedSymbols = null } = {}) {
  if (!Array.isArray(payload) || !['TWSE','TPEX'].includes(exchange) || !['income','balance'].includes(statement)
      || typeof sourceUrl !== 'string' || typeof collectedAt !== 'string' || !Number.isFinite(Date.parse(collectedAt))) return [];
  const provider = exchange === 'TWSE' ? 'twse' : 'tpex';
  return payload.flatMap((row) => {
    const identity = statementIdentity(row,exchange); if (!identity || (allowedSymbols && !allowedSymbols.has(identity.symbol))) return [];
    if (statement === 'balance') {
      const totalDebt = sumAvailable(finite(row['短期借款']),finite(row['長期借款']),
        finite(row['應付公司債']),finite(row['一年內到期長期負債']));
      const bookValuePerShare=finite(row['每股參考淨值'] ?? row['每股淨值']);
      const totalNetAssetValue=finite(row['淨資產價值'] ?? row['資產淨值']);
      return [
        fact(identity,'total_assets',finite(row['資產總計']), 'TWD_thousand',sourceUrl,collectedAt,provider),
        fact(identity,'total_equity',finite(row['權益總計'] ?? row['權益總額']), 'TWD_thousand',sourceUrl,collectedAt,provider),
        fact(identity,'book_value_per_share',bookValuePerShare, 'TWD_per_share',sourceUrl,collectedAt,provider),
        fact(identity,'net_asset_value',totalNetAssetValue, 'TWD_thousand',sourceUrl,collectedAt,provider),
        fact(identity,'cash_and_equivalents',finite(row['現金及約當現金']), 'TWD_thousand',sourceUrl,collectedAt,provider),
        fact(identity,'total_debt',totalDebt, 'TWD_thousand',sourceUrl,collectedAt,provider),
      ].filter(Boolean);
    }
    const operatingExpense=finite(row['營業費用'] ?? row['營業費用合計']);
    const attributable = finite(row['淨利（淨損）歸屬於母公司業主'] ?? row['母公司業主（淨利／損）']);
    const noncontrollingInterest=finite(row['淨利（淨損）歸屬於非控制權益']
      ??row['非控制權益（淨利／損）']??row['非控制權益']);
    const netIncome = finite(row['本期淨利（淨損）'] ?? row['本期稅後淨利（淨損）']);
    // Basic EPS is not diluted EPS authority.  When the filing omits the
    // diluted field, formal valuation readiness must remain unavailable rather
    // than silently deriving a smaller share count from basic EPS.
    const eps = finite(row['稀釋每股盈餘（元）']);
    const shares=finite(row['稀釋加權平均流通在外股數']??row['稀釋後加權平均流通在外股數']
      ??row['稀釋加權平均股數']);
    const ebitda=finite(row['稅前息前折舊攤銷前淨利'] ?? row['EBITDA']);
    const depreciationAmortization=finite(row['折舊及攤銷'] ?? row['折舊、折耗及攤銷']);
    return [
      fact(identity,'quarterly_revenue',finite(row['營業收入'] ?? row['收益']), 'TWD_thousand',sourceUrl,collectedAt,provider),
      fact(identity,'quarterly_gross_profit',finite(row['營業毛利（毛損）淨額'] ?? row['營業毛利（毛損）']), 'TWD_thousand',sourceUrl,collectedAt,provider),
      fact(identity,'quarterly_operating_expense',operatingExpense, 'TWD_thousand',sourceUrl,collectedAt,provider),
      fact(identity,'quarterly_operating_income',finite(row['營業利益（損失）']), 'TWD_thousand',sourceUrl,collectedAt,provider),
      fact(identity,'quarterly_ebitda',ebitda, 'TWD_thousand',sourceUrl,collectedAt,provider),
      fact(identity,'depreciation_amortization',depreciationAmortization, 'TWD_thousand',sourceUrl,collectedAt,provider),
      fact(identity,'quarterly_non_operating_income',finite(row['營業外收入及支出']), 'TWD_thousand',sourceUrl,collectedAt,provider),
      fact(identity,'quarterly_pretax_income',finite(row['稅前淨利（淨損）'] ?? row['繼續營業單位稅前淨利（淨損）']), 'TWD_thousand',sourceUrl,collectedAt,provider),
      fact(identity,'quarterly_income_tax_expense',finite(row['所得稅費用（利益）']), 'TWD_thousand',sourceUrl,collectedAt,provider),
      fact(identity,'quarterly_noncontrolling_interest',noncontrollingInterest, 'TWD_thousand',sourceUrl,collectedAt,provider),
      fact(identity,'quarterly_net_income',netIncome, 'TWD_thousand',sourceUrl,collectedAt,provider),
      fact(identity,'quarterly_net_income_attributable_to_common',attributable, 'TWD_thousand',sourceUrl,collectedAt,provider),
      fact(identity,'quarterly_diluted_eps',eps, 'TWD_per_share',sourceUrl,collectedAt,provider),
      fact(identity,'diluted_weighted_average_shares',shares, 'thousand_shares',sourceUrl,collectedAt,provider),
    ].filter(Boolean);
  });
}

function parseIndexRows(payload, { exchange } = {}) {
  if (!Array.isArray(payload) || !['TWSE','TPEX'].includes(exchange)) return [];
  return payload.flatMap((row) => {
    const rawDate = String(row?.Date ?? '');
    const session = rawDate.length === 7 ? rocSession(rawDate)
      : /^\d{8}$/u.test(rawDate) ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}` : null;
    const close = finite(row?.ClosingIndex ?? row?.Close);
    return session && Number.isFinite(close) && close > 0 ? [{ session,close }] : [];
  }).sort((left,right)=>left.session.localeCompare(right.session));
}

function parseSlashSession(value) {
  const match = String(value ?? '').trim().match(/^(?<year>\d{3,4})[\/-](?<month>\d{2})[\/-](?<day>\d{2})$/u);
  if (!match?.groups) return null;
  const year = Number(match.groups.year) + (match.groups.year.length === 3 ? 1911 : 0);
  const session = `${year}-${match.groups.month}-${match.groups.day}`;
  const parsed = new Date(`${session}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === session ? session : null;
}

function parseTwseIndexHistory(payload) {
  if (!payload || String(payload.stat).toUpperCase() !== 'OK' || !Array.isArray(payload.data)) return [];
  return payload.data.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const session = parseSlashSession(row[0]);
    const close = finite(row[4]);
    return session && Number.isFinite(close) && close > 0 ? [{ session,close }] : [];
  }).sort((left,right)=>left.session.localeCompare(right.session));
}

function parseTpexIndexHistory(payload) {
  const rows = payload?.tables?.[0]?.data;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const session = parseSlashSession(row[0]);
    const close = finite(row[4]);
    return session && Number.isFinite(close) && close > 0 ? [{ session,close }] : [];
  }).sort((left,right)=>left.session.localeCompare(right.session));
}

function parseTwseHistoricalValuationRows(payload, { collectedAt, sourceUrl, allowedSymbols = null } = {}) {
  if (!payload || String(payload.stat).toUpperCase() !== 'OK' || !Array.isArray(payload.data)
      || typeof collectedAt !== 'string' || !Number.isFinite(Date.parse(collectedAt))) return [];
  const session = /^\d{8}$/u.test(String(payload.date ?? ''))
    ? `${String(payload.date).slice(0,4)}-${String(payload.date).slice(4,6)}-${String(payload.date).slice(6,8)}` : null;
  if (!session || typeof sourceUrl !== 'string' || !sourceUrl.startsWith(`${TWSE_VALUATION_HISTORY_URL}?`)) return [];
  return payload.data.flatMap((row) => {
    const symbol = String(row?.[0] ?? '').trim(); const name = String(row?.[1] ?? '').trim().normalize('NFC');
    if (!/^\d{4}$/u.test(symbol) || !name || (allowedSymbols && !allowedSymbols.has(symbol))) return [];
    return [{ symbol,name,session,peRatio:finite(row[5]),pbRatio:finite(row[6]),sourceUrl,
      sourceRef:`twse-rwd:BWIBBU_d:${session}:${symbol}`,collectedAt:new Date(collectedAt).toISOString().replace('.000Z','Z'),
      authority:'exchange_reported_history' }];
  });
}

function parseTpexHistoricalValuationRows(payload, { collectedAt, sourceUrl, session, allowedSymbols = null } = {}) {
  const rows = payload?.tables?.[0]?.data;
  if (!Array.isArray(rows) || !parseSlashSession(session) || typeof sourceUrl !== 'string'
      || !sourceUrl.startsWith(`${TPEX_VALUATION_HISTORY_URL}?`) || typeof collectedAt !== 'string'
      || !Number.isFinite(Date.parse(collectedAt))) return [];
  const canonicalSession = parseSlashSession(session);
  return rows.flatMap((row) => {
    const symbol = String(row?.[0] ?? '').trim(); const name = String(row?.[1] ?? '').trim().normalize('NFC');
    if (!/^\d{4}$/u.test(symbol) || !name || (allowedSymbols && !allowedSymbols.has(symbol))) return [];
    return [{ symbol,name,session:canonicalSession,peRatio:finite(row[2]),pbRatio:finite(row[6]),sourceUrl,
      sourceRef:`tpex-rwd:peratio:${canonicalSession}:${symbol}`,collectedAt:new Date(collectedAt).toISOString().replace('.000Z','Z'),
      authority:'exchange_reported_history' }];
  });
}

function monthCoordinates(cutoffSession, monthsAgo) {
  const cutoff = new Date(`${cutoffSession}T00:00:00Z`);
  const value = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() - monthsAgo, 1));
  const year = value.getUTCFullYear(); const month = value.getUTCMonth() + 1;
  return { year,month,twseDate:`${year}${String(month).padStart(2,'0')}01`,rocMonth:`${year - 1911}/${String(month).padStart(2,'0')}` };
}

function dedupeSessions(rows) {
  return [...new Map(rows.map((row)=>[row.session,row])).values()].sort((left,right)=>left.session.localeCompare(right.session));
}

function parseTwseForeignFlow(payload) {
  if (!payload || String(payload.stat).toUpperCase() !== 'OK' || !Array.isArray(payload.data)) return null;
  const row = payload.data.find((item)=>Array.isArray(item) && String(item[0]).includes('外資及陸資(不含外資自營商)'));
  const net = finite(row?.[3]);
  const rawDate = String(payload.date ?? '');
  const session = /^\d{8}$/u.test(rawDate) ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}` : null;
  return Number.isFinite(net) && session ? { session,net } : null;
}

function parseTpexForeignFlow(payload) {
  if (!Array.isArray(payload)) return null;
  const row = payload.find((item)=>String(item?.Investor ?? '').trim()==='外資及陸資合計');
  const net = finite(row?.Net); const session = rocSession(row?.Date);
  return Number.isFinite(net) && session ? { session,net } : null;
}

async function fetchJsonBounded(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { Accept:'application/json','user-agent':'StockInsider/3.12' },
    signal:AbortSignal.timeout(12000) });
  if (!response?.ok) throw new Error(`official_source_unavailable:${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 2 || bytes.length > 4_000_000) throw new Error(`official_source_size:${url}`);
  return { payload:JSON.parse(bytes.toString('utf8')),hash:require('./codec').sha256(bytes) };
}

async function fetchBytesBounded(url,fetchImpl,maximumBytes=8_388_608){
  const response=await fetchImpl(url,{headers:{Accept:'application/json','user-agent':'StockInsider/3.13'},redirect:'error',
    signal:AbortSignal.timeout(12000)});
  if(!response?.ok||response.redirected)throw new Error(`official_source_unavailable:${url}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<1||bytes.length>maximumBytes)throw new Error(`official_source_size:${url}`);return bytes;
}

async function allSettledBounded(items,concurrency,operation){
  const output=[];
  for(let offset=0;offset<items.length;offset+=concurrency){
    output.push(...await Promise.allSettled(items.slice(offset,offset+concurrency).map(operation)));
  }
  return output;
}

function boundedValuationRequests(requests){
  if(!Array.isArray(requests))throw new Error('combined_valuation_request_input');
  const output=['TWSE','TPEX'].flatMap((exchange)=>[...new Map(requests.filter((request)=>request?.exchange===exchange
      &&/^\d{4}-\d{2}-\d{2}$/u.test(String(request.session))).map((request)=>[request.session,request])).values()]
    .sort((left,right)=>left.session.localeCompare(right.session)).slice(-252));
  if(output.length>504)throw new Error('combined_valuation_request_bound');
  return output;
}

function boundedCompletedCalendarSessions(rows){
  if(!Array.isArray(rows))throw new Error('corporate_action_calendar_input');
  return ['TWSE','TPEX'].flatMap((exchange)=>rows.filter((row)=>row?.market===exchange&&row?.status==='completed'
      &&/^\d{4}-\d{2}-\d{2}$/u.test(String(row.session)))
    .sort((left,right)=>left.session.localeCompare(right.session)).slice(-130));
}

async function loadCorporateActionSnapshots({sessions,fetchImpl,collectedAt}){
  if(!Array.isArray(sessions)||sessions.length>20)throw new Error('corporate_action_backfill_bound');
  return Promise.all(sessions.map(async(row)=>{
    const exchange=Array.isArray(row)?String(row[0]??''):String(row?.exchange??'');
    const session=Array.isArray(row)?String(row[1]??''):String(row?.session??'');
    if(!CORPORATE_ACTION_FEEDS[exchange]||!/^\d{4}-\d{2}-\d{2}$/u.test(session))throw new Error('corporate_action_backfill_input');
    const feeds=CORPORATE_ACTION_FEEDS[exchange];
    const acquired=await Promise.all(feeds.map(async(feed)=>{
      const url=corporateActionUrl(exchange,session,feed);const bytes=await fetchBytesBounded(url,fetchImpl);
      const events=parseCorporateActionResponse(bytes,{exchange,session,feed});
      return {feedEvidence:{feedIdentity:feed.identity,responseByteCount:bytes.length,
        responseSha256:sha256(bytes),parsedRowCount:events.length},events};
    }));
    const events=acquired.flatMap((row)=>row.events).sort((left,right)=>left.symbol.localeCompare(right.symbol));
    if(new Set(events.map((event)=>event.symbol)).size!==events.length)throw new Error('corporate_action_cross_feed_conflict');
    return {exchange,session,provider:exchange.toLowerCase(),corporateActionVersion:'tw-corporate-action-v3.1',
      collectedAt,feedEvidence:acquired.map((row)=>row.feedEvidence),declaredEventCount:events.length,events};
  }));
}

function corporateActionRangeUrl(exchange,startSession,endSession,feed){
  if(!CORPORATE_ACTION_FEEDS[exchange]?.includes(feed)||!/^\d{4}-\d{2}-\d{2}$/u.test(String(startSession))
      ||!/^\d{4}-\d{2}-\d{2}$/u.test(String(endSession))||startSession>endSession)return null;
  const startCompact=startSession.replaceAll('-','');const endCompact=endSession.replaceAll('-','');
  const startSlash=startSession.replaceAll('-','%2F');const endSlash=endSession.replaceAll('-','%2F');
  return exchange==='TWSE'
    ?`https://www.twse.com.tw/rwd/zh/${feed.path}?startDate=${startCompact}&endDate=${endCompact}&response=json`
    :`https://www.tpex.org.tw/www/zh-tw/bulletin/${feed.path}?startDate=${startSlash}&endDate=${endSlash}&response=json`;
}

function parseCorporateActionRangeResponse(bytes,{exchange,startSession,endSession,feed}={}){
  if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>8_388_608||!['TWSE','TPEX'].includes(exchange)
      ||!CORPORATE_ACTION_FEEDS[exchange]?.includes(feed)||!/^\d{4}-\d{2}-\d{2}$/u.test(String(startSession))
      ||!/^\d{4}-\d{2}-\d{2}$/u.test(String(endSession))||startSession>endSession)
    throw new Error('corporate_action_range_input');
  const decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/<html|<!doctype/iu.test(decoded))throw new Error('corporate_action_html');
  let payload;try{payload=JSON.parse(decoded);}catch{throw new Error('corporate_action_json');}
  if(exchange==='TWSE'&&payload?.stat==='很抱歉，沒有符合條件的資料!')return [];
  if(!/^ok$/iu.test(String(payload?.stat??'')))throw new Error(`corporate_action_status:${feed.identity}`);
  const header=exchange==='TWSE'?payload.fields:payload?.tables?.[0]?.fields;
  const rows=exchange==='TWSE'?payload.data:payload?.tables?.[0]?.data;
  if(!Array.isArray(header)||!Array.isArray(rows)||!feed.header.every((value,index)=>header[index]===value))
    throw new Error(`corporate_action_schema:${feed.identity}`);
  const events=[];const seen=new Set();
  for(const row of rows){
    if(!Array.isArray(row)||row.length<5)continue;const session=parseActionSession(row[0]);
    if(!session||session<startSession||session>endSession)throw new Error('corporate_action_session_conflict');
    const symbol=String(row[1]??'').trim();const preActionReferencePrice=finite(row[3]);const postActionReferencePrice=finite(row[4]);
    const identity=`${session}:${symbol}`;if(seen.has(identity))continue;seen.add(identity);
    if(!/^[0-9A-Za-z]{2,12}$/u.test(symbol)||!Number.isFinite(preActionReferencePrice)||preActionReferencePrice<=0
        ||!Number.isFinite(postActionReferencePrice)||postActionReferencePrice<=0)throw new Error('corporate_action_row');
    const sourceRow=['corporate-action-source-row-v3.1',exchange,session,symbol,feed.kind,
      preActionReferencePrice,postActionReferencePrice,feed.identity];
    events.push({session,symbol,eventKind:feed.kind,preActionReferencePrice,postActionReferencePrice,
      feedIdentity:feed.identity,sourceRowRef:sha256(canonicalJson(sourceRow))});
  }
  return events.sort((left,right)=>left.session.localeCompare(right.session)||left.symbol.localeCompare(right.symbol));
}

async function loadCorporateActionSnapshotsRange({calendarSessions,fetchImpl,collectedAt}){
  if(!Array.isArray(calendarSessions)||calendarSessions.length>260)throw new Error('corporate_action_range_bound');
  const output=[];
  for(const exchange of ['TWSE','TPEX']){
    const sessions=[...new Set(calendarSessions.filter((row)=>row.market===exchange&&row.status==='completed')
      .map((row)=>row.session))].sort().slice(-130);
    if(!sessions.length)continue;const startSession=sessions[0];const endSession=sessions.at(-1);
    const acquired=await Promise.all(CORPORATE_ACTION_FEEDS[exchange].map(async(feed)=>{
      const url=corporateActionRangeUrl(exchange,startSession,endSession,feed);const bytes=await fetchBytesBounded(url,fetchImpl);
      const events=parseCorporateActionRangeResponse(bytes,{exchange,startSession,endSession,feed});
      return {feedEvidence:{feedIdentity:feed.identity,responseByteCount:bytes.length,responseSha256:sha256(bytes)},events};
    }));
    for(const session of sessions){
      const events=acquired.flatMap((row)=>row.events.filter((event)=>event.session===session)
        .map(({session:ignored,...event})=>event)).sort((left,right)=>left.symbol.localeCompare(right.symbol));
      if(new Set(events.map((event)=>event.symbol)).size!==events.length)throw new Error('corporate_action_cross_feed_conflict');
      output.push({exchange,session,provider:exchange.toLowerCase(),corporateActionVersion:'tw-corporate-action-v3.1',
        collectedAt,feedEvidence:acquired.map((row)=>({...row.feedEvidence,
          parsedRowCount:row.events.filter((event)=>event.session===session).length})),declaredEventCount:events.length,events});
    }
  }
  return output;
}

async function loadOfficialTwMarketSnapshot({ cutoff, candidates = [], peerCandidates = [], valuationBackfillSessions = [],
  priceBackfillSymbols = [],corporateActionBackfillSessions=[],fetchImpl = globalThis.fetch } = {}) {
  if (typeof cutoff !== 'string' || !Number.isFinite(Date.parse(cutoff))) throw new Error('official_snapshot_cutoff');
  if (!Array.isArray(candidates) || candidates.length > 30) throw new Error('official_candidate_bound');
  if (!Array.isArray(peerCandidates) || peerCandidates.length > 240) throw new Error('official_peer_bound');
  if (!Array.isArray(valuationBackfillSessions) || valuationBackfillSessions.length > 504) throw new Error('valuation_backfill_bound');
  if (!Array.isArray(priceBackfillSymbols) || priceBackfillSymbols.length > 20) throw new Error('price_backfill_bound');
  if (!Array.isArray(corporateActionBackfillSessions) || corporateActionBackfillSessions.length > 260)
    throw new Error('corporate_action_backfill_bound');
  const collectedAt = new Date().toISOString().replace('.000Z','Z');
  const normalizedCandidates=candidates.map((row)=>({symbol:String(row?.symbol??row),exchange:String(row?.exchange??''),
    canonicalSector:row?.canonicalSector??'unknown'})).filter((row)=>/^\d{4}$/u.test(row.symbol)).slice(0,30);
  const normalizedPeers=peerCandidates.map((row)=>({symbol:String(row?.symbol??''),exchange:String(row?.exchange??''),
    canonicalSector:row?.canonicalSector??'unknown'})).filter((row)=>/^\d{4}$/u.test(row.symbol)&&['TWSE','TPEX'].includes(row.exchange)).slice(0,240);
  const candidateSymbols=new Set(normalizedCandidates.map((row)=>row.symbol));
  const allowedValuationSymbols=new Set([...candidateSymbols,...normalizedPeers.map((row)=>row.symbol)]);
  const valuationIdentityBySymbol=new Map([...normalizedCandidates,...normalizedPeers]
    .map((row)=>[row.symbol,{exchange:row.exchange,canonicalSector:row.canonicalSector}]));
  const calendarPromise=loadOfficialTradingCalendarV314({cutoff,fetchImpl});
  const mopsPromise=loadMopsFinancialHistoryV314({cutoff,candidates:normalizedCandidates.filter((row)=>['TWSE','TPEX'].includes(row.exchange)),fetchImpl});
  const sources = [SOURCE_URL,TPEX_SOURCE_URL,TWSE_REVENUE_URL,TPEX_REVENUE_URL,TWSE_INDEX_URL,TPEX_INDEX_URL,
    TWSE_CLOSE_URL,TPEX_CLOSE_URL];
  const values = await Promise.allSettled(sources.map((url)=>fetchJsonBounded(url,fetchImpl)));
  const byUrl = new Map(sources.flatMap((url,index)=>values[index].status==='fulfilled' ? [[url,values[index].value]] : []));
  const sourceFailures = sources.filter((url)=>!byUrl.has(url)).map((url)=>({ url,reason:'official_source_unavailable' }));
  const cutoffSession = new Date(cutoff).toISOString().slice(0,10);
  const closeBySymbol=new Map([
    ...parseOfficialCloseRows(byUrl.get(TWSE_CLOSE_URL)?.payload,{exchange:'TWSE'}),
    ...parseOfficialCloseRows(byUrl.get(TPEX_CLOSE_URL)?.payload,{exchange:'TPEX'}),
  ].map((row)=>[`${row.exchange}:${row.symbol}:${row.session}`,row]));
  const valuations = [...parseTwseValuationRows(byUrl.get(SOURCE_URL)?.payload,{collectedAt,allowedSymbols:allowedValuationSymbols}).map((row)=>({...row,exchange:'TWSE'})),
    ...parseTpexValuationRows(byUrl.get(TPEX_SOURCE_URL)?.payload,{collectedAt,allowedSymbols:allowedValuationSymbols}).map((row)=>({...row,exchange:'TPEX'}))]
    .filter((row)=>row.session<=cutoffSession).map((row)=>({...row,
      canonicalSector:valuationIdentityBySymbol.get(row.symbol)?.canonicalSector??'unknown',
      close:closeBySymbol.get(`${row.exchange}:${row.symbol}:${row.session}`)?.close??null,
      closeSourceRef:closeBySymbol.get(`${row.exchange}:${row.symbol}:${row.session}`)?.sourceRef??null }));
  const revenues = [...parseRevenueRows(byUrl.get(TWSE_REVENUE_URL)?.payload,{exchange:'TWSE',collectedAt,allowedSymbols:candidateSymbols}),
    ...parseRevenueRows(byUrl.get(TPEX_REVENUE_URL)?.payload,{exchange:'TPEX',collectedAt,allowedSymbols:candidateSymbols})].filter((row)=>row.asOf<=cutoffSession);
  const candidateSectors = new Set(normalizedCandidates.map((row)=>row.canonicalSector).filter(Boolean));
  const statementKinds = new Set(['ci','mim']);
  if (candidateSectors.has('finance_insurance')) ['basi','bd','fh','ins'].forEach((kind)=>statementKinds.add(kind));
  const statementRequests = candidateSymbols.size === 0 ? [] : ['TWSE','TPEX'].flatMap((exchange)=>
    ['income','balance'].flatMap((statement)=>[...statementKinds].map((kind)=>({ exchange,statement,kind,
      url:statementUrl(exchange,statement,kind) })))).filter((request)=>request.url);
  const statementResults = await Promise.allSettled(statementRequests.map((request)=>fetchJsonBounded(request.url,fetchImpl)));
  const financialFacts = statementRequests.flatMap((request,index)=>statementResults[index].status === 'fulfilled'
    ? parseStatementFacts(statementResults[index].value.payload,{ ...request,collectedAt,allowedSymbols:candidateSymbols }) : [])
    .filter((row)=>candidateSymbols.has(row.symbol) && row.filingPublishedAt<=cutoff && row.periodEnd<=cutoffSession);
  statementRequests.forEach((request,index)=>{ if (statementResults[index].status==='rejected') {
    sourceFailures.push({ url:request.url,reason:'official_source_unavailable' });
  }});
  const twseHistoryMonths = Array.from({length:18},(_,monthsAgo)=>({ monthsAgo,...monthCoordinates(cutoffSession,monthsAgo) }));
  const tpexHistoryMonths = Array.from({length:6},(_,monthsAgo)=>({ monthsAgo,...monthCoordinates(cutoffSession,monthsAgo) }));
  const twseIndexHistoryUrls = twseHistoryMonths.map((month)=>`${TWSE_INDEX_HISTORY_URL}?date=${month.twseDate}&response=json`);
  const tpexIndexHistoryUrls = tpexHistoryMonths.map((month)=>`${TPEX_INDEX_HISTORY_URL}?l=zh-tw&d=${encodeURIComponent(month.rocMonth)}`);
  const optionalIndexResults = await allSettledBounded([...twseIndexHistoryUrls,...tpexIndexHistoryUrls],8,
    (url)=>fetchJsonBounded(url,fetchImpl));
  const twseHistories = optionalIndexResults.slice(0,twseHistoryMonths.length).map((result,index)=>({
    month:twseHistoryMonths[index],url:twseIndexHistoryUrls[index],result,
    rows:result.status==='fulfilled' ? parseTwseIndexHistory(result.value.payload).filter((row)=>row.session<=cutoffSession) : [],
  }));
  const tpexHistories = optionalIndexResults.slice(twseHistoryMonths.length).map((result,index)=>({
    month:tpexHistoryMonths[index],url:tpexIndexHistoryUrls[index],result,
    rows:result.status==='fulfilled'?parseTpexIndexHistory(result.value.payload).filter((row)=>row.session<=cutoffSession):[],
  }));
  const twseIndex = dedupeSessions([
    ...twseHistories.flatMap((history)=>history.rows),...parseIndexRows(byUrl.get(TWSE_INDEX_URL)?.payload,{exchange:'TWSE'}),
  ].filter((row)=>row.session<=cutoffSession));
  const tpexIndex = dedupeSessions([
    ...tpexHistories.flatMap((history)=>history.rows),
    ...parseIndexRows(byUrl.get(TPEX_INDEX_URL)?.payload,{exchange:'TPEX'}),
  ].filter((row)=>row.session<=cutoffSession));
  let calendarAcquisition=null;
  try{calendarAcquisition=await calendarPromise;}catch(error){sourceFailures.push({url:'official-annual-trading-calendar',
    reason:error instanceof Error?error.message:'official_source_unavailable'});}
  const historicalSessions = twseHistories.map(({ month,rows })=>({ month,session:rows.at(-1)?.session ?? null }))
    .filter((row)=>typeof row.session==='string');
  const historicalValuationRequests = historicalSessions.flatMap(({ month,session })=>{
    const compactSession = session.replaceAll('-',''); const rocSessionValue = `${Number(session.slice(0,4))-1911}/${session.slice(5)}`;
    return [{ exchange:'TWSE',month,session,url:`${TWSE_VALUATION_HISTORY_URL}?date=${compactSession}&response=json` },
      { exchange:'TPEX',month,session,url:`${TPEX_VALUATION_HISTORY_URL}?l=zh-tw&d=${encodeURIComponent(rocSessionValue)}` }];
  });
  const calendarBackfillRequests=['TWSE','TPEX'].flatMap((exchange)=>(calendarAcquisition?.calendarSessions??[])
    .filter((row)=>row.market===exchange&&row.status==='completed').slice(-252).map((row)=>[exchange,row.session]));
  const effectiveBackfillSessions=[...valuationBackfillSessions,...calendarBackfillRequests];
  const backfillRequests=effectiveBackfillSessions.filter((row)=>Array.isArray(row)&&['TWSE','TPEX'].includes(row[0])
      && /^\d{4}-\d{2}-\d{2}$/u.test(String(row[1]))).map(([exchange,session])=>{
    const compact=String(session).replaceAll('-','');const roc=`${Number(String(session).slice(0,4))-1911}/${String(session).slice(5)}`;
    return exchange==='TWSE'?{exchange,session,url:`${TWSE_VALUATION_HISTORY_URL}?date=${compact}&response=json`}
      :{exchange,session,url:`${TPEX_VALUATION_HISTORY_URL}?l=zh-tw&d=${encodeURIComponent(roc)}`};
  });
  const combinedValuationRequests=boundedValuationRequests([...historicalValuationRequests,...backfillRequests]);
  const historicalValuationResults = await allSettledBounded(combinedValuationRequests,8,(request)=>fetchJsonBounded(request.url,fetchImpl));
  const valuationHistory = combinedValuationRequests.flatMap((request,index)=>{
    const result = historicalValuationResults[index]; if (result.status!=='fulfilled') return [];
    return request.exchange==='TWSE'
      ? parseTwseHistoricalValuationRows(result.value.payload,{collectedAt,sourceUrl:request.url,allowedSymbols:candidateSymbols})
      : parseTpexHistoricalValuationRows(result.value.payload,{collectedAt,sourceUrl:request.url,session:request.session,
        allowedSymbols:candidateSymbols});
  }).filter((row)=>row.session<=cutoffSession).map((row)=>({...row,
    canonicalSector:valuationIdentityBySymbol.get(row.symbol)?.canonicalSector??'unknown'}));
  const effectivePriceBackfill=priceBackfillSymbols.length?priceBackfillSymbols
    :normalizedCandidates.slice(0,20).map((row)=>[row.symbol,row.exchange]);
  const priceTargets=[...new Map(effectivePriceBackfill.flatMap((row)=>{
    const symbol=Array.isArray(row)?String(row[0]??''):String(row?.symbol??'');
    const exchange=Array.isArray(row)?String(row[1]??''):String(row?.exchange??'');
    return /^\d{4}$/u.test(symbol)&&['TWSE','TPEX'].includes(exchange)?[[`${exchange}:${symbol}`,{symbol,exchange}]]:[];
  })).values()];
  const priceHistoryRequests=priceTargets.flatMap((target)=>Array.from({length:13},(_,monthsAgo)=>{
    const month=monthCoordinates(cutoffSession,monthsAgo);
    return target.exchange==='TWSE'
      ?{...target,url:`${TWSE_PRICE_HISTORY_URL}?date=${month.twseDate}&stockNo=${target.symbol}&response=json`}
      :{...target,url:`${TPEX_PRICE_HISTORY_URL}?date=${encodeURIComponent(`${month.rocMonth}/01`)}&code=${target.symbol}&response=json`};
  }));
  const priceHistoryResults=await allSettledBounded(priceHistoryRequests,8,(request)=>fetchJsonBounded(request.url,fetchImpl));
  const allPriceObservations=dedupePriceObservations(priceHistoryRequests.flatMap((request,index)=>{
    const result=priceHistoryResults[index];
    return result.status==='fulfilled'?parseOfficialPriceHistory(result.value.payload,{...request,collectedAt}):[];
  }).filter((row)=>row.session<=cutoffSession));
  const priceObservations=[...Map.groupBy(allPriceObservations,(row)=>`${row.exchange}:${row.symbol}`).values()]
    .flatMap((rows)=>rows.slice(-260));
  priceHistoryRequests.forEach((request,index)=>{
    if(priceHistoryResults[index].status==='rejected')sourceFailures.push({url:request.url,reason:'official_source_unavailable'});
  });
  let corporateActionSnapshots=[];
  const boundedActionCalendar=boundedCompletedCalendarSessions(calendarAcquisition?.calendarSessions??[]);
  try{corporateActionSnapshots=calendarAcquisition
    ?await loadCorporateActionSnapshotsRange({calendarSessions:boundedActionCalendar,fetchImpl,collectedAt})
    :await loadCorporateActionSnapshots({sessions:corporateActionBackfillSessions,fetchImpl,collectedAt});}
  catch(error){sourceFailures.push({url:'official-corporate-action-backfill',reason:error instanceof Error?error.message:'official_source_unavailable'});}
  let mopsHistory={facts:[],sourceHashes:{},sourceFailures:[]};
  try{mopsHistory=await mopsPromise;}catch(error){sourceFailures.push({url:'official-mops-inline-history',
    reason:error instanceof Error?error.message:'official_source_unavailable'});}
  financialFacts.push(...mopsHistory.facts.filter((row)=>row.periodEnd<=cutoffSession));
  const flowSession = twseIndex.at(-1)?.session ?? cutoffSession;
  const twseFlowUrl = `https://www.twse.com.tw/rwd/zh/fund/BFI82U?response=json&date=${flowSession.replaceAll('-','')}`;
  const tpexFlowUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_3insti_summary';
  const [twseFlowResult,tpexFlowResult] = await Promise.allSettled([fetchJsonBounded(twseFlowUrl,fetchImpl),fetchJsonBounded(tpexFlowUrl,fetchImpl)]);
  const twseFlow = twseFlowResult.status==='fulfilled' ? parseTwseForeignFlow(twseFlowResult.value.payload) : null;
  const tpexFlow = tpexFlowResult.status==='fulfilled' ? parseTpexForeignFlow(tpexFlowResult.value.payload) : null;
  const flowSessionMatch = twseFlow?.session===flowSession && tpexFlow?.session===flowSession;
  const foreignFlow = flowSessionMatch ? { session:flowSession,net1d:twseFlow.net+tpexFlow.net,twseNet1d:twseFlow.net,
    tpexNet1d:tpexFlow.net,sourceRefs:[twseFlowUrl,tpexFlowUrl] } : null;
  const optionalHashes = {};
  for (const history of twseHistories) if (history.result.status==='fulfilled') optionalHashes[history.url]=history.result.value.hash;
  for(const history of tpexHistories)if(history.result.status==='fulfilled')optionalHashes[history.url]=history.result.value.hash;
  combinedValuationRequests.forEach((request,index)=>{
    if (historicalValuationResults[index].status==='fulfilled') optionalHashes[request.url]=historicalValuationResults[index].value.hash;
  });
  priceHistoryRequests.forEach((request,index)=>{
    if(priceHistoryResults[index].status==='fulfilled')optionalHashes[request.url]=priceHistoryResults[index].value.hash;
  });
  statementRequests.forEach((request,index)=>{ if (statementResults[index].status==='fulfilled') {
    optionalHashes[request.url]=statementResults[index].value.hash;
  }});
  const sourceHashes={...Object.fromEntries([...byUrl].map(([url,result])=>[url,result.hash])),...optionalHashes,
    ...(calendarAcquisition?.sourceHashes??{}),...(mopsHistory.sourceHashes??{})};
  sourceFailures.push(...(mopsHistory.sourceFailures??[]));
  if (twseFlowResult.status==='fulfilled') sourceHashes[twseFlowUrl]=twseFlowResult.value.hash;
  else sourceFailures.push({ url:twseFlowUrl,reason:'official_source_unavailable' });
  if (tpexFlowResult.status==='fulfilled') sourceHashes[tpexFlowUrl]=tpexFlowResult.value.hash;
  else sourceFailures.push({ url:tpexFlowUrl,reason:'official_source_unavailable' });
  return Object.freeze({ schema:'official-tw-market-snapshot-v1.4',collectedAt,cutoff,
    calendarSessions:calendarAcquisition?.calendarSessions??[],valuations,valuationHistory,priceObservations,
    corporateActionSnapshots,revenues,financialFacts,twseIndex,
    tpexIndex,foreignFlow,sourceFailures,sourceHashes });
}

function validateReportedValuation(row) {
  const sourceExchange=row?.sourceUrl===SOURCE_URL?'TWSE':row?.sourceUrl===TPEX_SOURCE_URL?'TPEX':null;
  const exchangeMatches=row?.exchange===undefined||row?.exchange===sourceExchange;
  const officialSource = sourceExchange!==null&&exchangeMatches
    &&validOfficialReportedValuationSourceRef(sourceExchange,row?.sourceRef,{current:true});
  if (!row || row.authority !== 'exchange_reported' || !officialSource) {
    return unavailable('non_authoritative_reported_valuation');
  }
  const pe = row.peRatio;
  const pb = row.pbRatio;
  if (pe !== null && (!Number.isFinite(pe) || pe <= 0 || pe > 200)) return unavailable('reported_pe_out_of_range');
  if (pb !== null && (!Number.isFinite(pb) || pb <= 0 || pb > 100)) return unavailable('reported_pb_out_of_range');
  if (pe === null && pb === null) return unavailable('reported_valuation_missing');
  return Object.freeze({ availability: 'available', ...row });
}

function dedupePriceObservations(rows){
  return [...new Map(rows.map((row)=>[`${row.exchange}:${row.symbol}:${row.session}`,row])).values()]
    .sort((left,right)=>left.symbol.localeCompare(right.symbol)||left.session.localeCompare(right.session));
}

module.exports = { SOURCE_URL,TPEX_SOURCE_URL,TWSE_REVENUE_URL,TPEX_REVENUE_URL,TWSE_INDEX_URL,TPEX_INDEX_URL,
  TWSE_CLOSE_URL,TPEX_CLOSE_URL,TWSE_PRICE_HISTORY_URL,TPEX_PRICE_HISTORY_URL,parseOfficialCloseRows,parseOfficialPriceHistory,
  CORPORATE_ACTION_FEEDS,corporateActionUrl,loadCorporateActionSnapshots,loadCorporateActionSnapshotsRange,
  parseCorporateActionResponse,
  loadOfficialTwMarketSnapshot,parseIndexRows,parseRevenueRows,parseTpexForeignFlow,parseTpexHistoricalValuationRows,
  parseStatementFacts,statementUrl,
  parseTpexIndexHistory,parseTpexValuationRows,parseTwseForeignFlow,parseTwseHistoricalValuationRows,
  parseTwseIndexHistory,parseTwseValuationRows,rocSession,validateReportedValuation,
  validOfficialReportedValuationSourceRef,boundedValuationRequests,boundedCompletedCalendarSessions };
