'use strict';

const { unavailable } = require('./codec');

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

function parseTwseValuationRows(payload, { collectedAt } = {}) {
  if (!Array.isArray(payload) || typeof collectedAt !== 'string' || !Number.isFinite(Date.parse(collectedAt))) return [];
  return payload.flatMap((row) => {
    const symbol = typeof row?.Code === 'string' ? row.Code.trim() : '';
    const name = typeof row?.Name === 'string' ? row.Name.trim().normalize('NFC') : '';
    const session = rocSession(row?.Date);
    if (!/^\d{4}$/u.test(symbol) || !name || !session) return [];
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

function parseTpexValuationRows(payload, { collectedAt } = {}) {
  if (!Array.isArray(payload) || typeof collectedAt !== 'string' || !Number.isFinite(Date.parse(collectedAt))) return [];
  return payload.flatMap((row) => {
    const symbol = typeof row?.SecuritiesCompanyCode === 'string' ? row.SecuritiesCompanyCode.trim() : '';
    const name = typeof row?.CompanyName === 'string' ? row.CompanyName.trim().normalize('NFC') : '';
    const session = rocSession(row?.Date);
    if (!/^\d{4}$/u.test(symbol) || !name || !session) return [];
    return [{ symbol,name,session,peRatio:finite(row.PriceEarningRatio),pbRatio:finite(row.PriceBookRatio),
      dividendYield:finite(row.YieldRatio),sourceRef:`tpex-openapi:peratio:${session}:${symbol}`,
      sourceUrl:TPEX_SOURCE_URL,collectedAt:new Date(collectedAt).toISOString().replace('.000Z','Z'),authority:'exchange_reported' }];
  });
}

function parseRevenueRows(payload, { exchange, collectedAt } = {}) {
  if (!Array.isArray(payload) || !['TWSE','TPEX'].includes(exchange)
      || typeof collectedAt !== 'string' || !Number.isFinite(Date.parse(collectedAt))) return [];
  return payload.flatMap((row) => {
    const symbol = String(row?.['公司代號'] ?? '').trim();
    const name = String(row?.['公司名稱'] ?? '').trim().normalize('NFC');
    const period = String(row?.['資料年月'] ?? '');
    if (!/^\d{4}$/u.test(symbol) || !name || !/^\d{5}$/u.test(period)) return [];
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

function parseTwseHistoricalValuationRows(payload, { collectedAt, sourceUrl } = {}) {
  if (!payload || String(payload.stat).toUpperCase() !== 'OK' || !Array.isArray(payload.data)
      || typeof collectedAt !== 'string' || !Number.isFinite(Date.parse(collectedAt))) return [];
  const session = /^\d{8}$/u.test(String(payload.date ?? ''))
    ? `${String(payload.date).slice(0,4)}-${String(payload.date).slice(4,6)}-${String(payload.date).slice(6,8)}` : null;
  if (!session || typeof sourceUrl !== 'string' || !sourceUrl.startsWith(`${TWSE_VALUATION_HISTORY_URL}?`)) return [];
  return payload.data.flatMap((row) => {
    const symbol = String(row?.[0] ?? '').trim(); const name = String(row?.[1] ?? '').trim().normalize('NFC');
    if (!/^\d{4}$/u.test(symbol) || !name) return [];
    return [{ symbol,name,session,peRatio:finite(row[5]),pbRatio:finite(row[6]),sourceUrl,
      sourceRef:`twse-rwd:BWIBBU_d:${session}:${symbol}`,collectedAt:new Date(collectedAt).toISOString().replace('.000Z','Z'),
      authority:'exchange_reported_history' }];
  });
}

function parseTpexHistoricalValuationRows(payload, { collectedAt, sourceUrl, session } = {}) {
  const rows = payload?.tables?.[0]?.data;
  if (!Array.isArray(rows) || !parseSlashSession(session) || typeof sourceUrl !== 'string'
      || !sourceUrl.startsWith(`${TPEX_VALUATION_HISTORY_URL}?`) || typeof collectedAt !== 'string'
      || !Number.isFinite(Date.parse(collectedAt))) return [];
  const canonicalSession = parseSlashSession(session);
  return rows.flatMap((row) => {
    const symbol = String(row?.[0] ?? '').trim(); const name = String(row?.[1] ?? '').trim().normalize('NFC');
    if (!/^\d{4}$/u.test(symbol) || !name) return [];
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

async function loadOfficialTwMarketSnapshot({ cutoff, fetchImpl = globalThis.fetch } = {}) {
  if (typeof cutoff !== 'string' || !Number.isFinite(Date.parse(cutoff))) throw new Error('official_snapshot_cutoff');
  const collectedAt = new Date().toISOString().replace('.000Z','Z');
  const sources = [SOURCE_URL,TPEX_SOURCE_URL,TWSE_REVENUE_URL,TPEX_REVENUE_URL,TWSE_INDEX_URL,TPEX_INDEX_URL];
  const values = await Promise.all(sources.map((url)=>fetchJsonBounded(url,fetchImpl)));
  const byUrl = new Map(sources.map((url,index)=>[url,values[index]]));
  const cutoffSession = new Date(cutoff).toISOString().slice(0,10);
  const valuations = [...parseTwseValuationRows(byUrl.get(SOURCE_URL).payload,{collectedAt}),
    ...parseTpexValuationRows(byUrl.get(TPEX_SOURCE_URL).payload,{collectedAt})].filter((row)=>row.session<=cutoffSession);
  const revenues = [...parseRevenueRows(byUrl.get(TWSE_REVENUE_URL).payload,{exchange:'TWSE',collectedAt}),
    ...parseRevenueRows(byUrl.get(TPEX_REVENUE_URL).payload,{exchange:'TPEX',collectedAt})].filter((row)=>row.asOf<=cutoffSession);
  const historyMonths = [1,3,6,12].map((monthsAgo)=>({ monthsAgo,...monthCoordinates(cutoffSession,monthsAgo) }));
  const twseIndexHistoryUrls = historyMonths.map((month)=>`${TWSE_INDEX_HISTORY_URL}?date=${month.twseDate}&response=json`);
  const priorMonth = historyMonths[0];
  const tpexIndexHistoryUrl = `${TPEX_INDEX_HISTORY_URL}?l=zh-tw&d=${encodeURIComponent(priorMonth.rocMonth)}`;
  const optionalIndexResults = await Promise.allSettled([
    ...twseIndexHistoryUrls.map((url)=>fetchJsonBounded(url,fetchImpl)), fetchJsonBounded(tpexIndexHistoryUrl,fetchImpl),
  ]);
  const twseHistories = optionalIndexResults.slice(0,historyMonths.length).map((result,index)=>({
    month:historyMonths[index],url:twseIndexHistoryUrls[index],result,
    rows:result.status==='fulfilled' ? parseTwseIndexHistory(result.value.payload).filter((row)=>row.session<=cutoffSession) : [],
  }));
  const tpexHistoryResult = optionalIndexResults.at(-1);
  const twseIndex = dedupeSessions([
    ...twseHistories[0].rows,...parseIndexRows(byUrl.get(TWSE_INDEX_URL).payload,{exchange:'TWSE'}),
  ].filter((row)=>row.session<=cutoffSession));
  const tpexIndex = dedupeSessions([
    ...(tpexHistoryResult.status==='fulfilled' ? parseTpexIndexHistory(tpexHistoryResult.value.payload) : []),
    ...parseIndexRows(byUrl.get(TPEX_INDEX_URL).payload,{exchange:'TPEX'}),
  ].filter((row)=>row.session<=cutoffSession));
  const historicalSessions = twseHistories.map(({ month,rows })=>({ month,session:rows.at(-1)?.session ?? null }))
    .filter((row)=>typeof row.session==='string');
  const historicalValuationRequests = historicalSessions.flatMap(({ month,session })=>{
    const compactSession = session.replaceAll('-',''); const rocSessionValue = `${Number(session.slice(0,4))-1911}/${session.slice(5)}`;
    return [{ exchange:'TWSE',month,session,url:`${TWSE_VALUATION_HISTORY_URL}?date=${compactSession}&response=json` },
      { exchange:'TPEX',month,session,url:`${TPEX_VALUATION_HISTORY_URL}?l=zh-tw&d=${encodeURIComponent(rocSessionValue)}` }];
  });
  const historicalValuationResults = await Promise.allSettled(historicalValuationRequests.map((request)=>fetchJsonBounded(request.url,fetchImpl)));
  const valuationHistory = historicalValuationRequests.flatMap((request,index)=>{
    const result = historicalValuationResults[index]; if (result.status!=='fulfilled') return [];
    return request.exchange==='TWSE'
      ? parseTwseHistoricalValuationRows(result.value.payload,{collectedAt,sourceUrl:request.url})
      : parseTpexHistoricalValuationRows(result.value.payload,{collectedAt,sourceUrl:request.url,session:request.session});
  }).filter((row)=>row.session<=cutoffSession);
  const flowSession = twseIndex.at(-1)?.session ?? cutoffSession;
  const twseFlowUrl = `https://www.twse.com.tw/rwd/zh/fund/BFI82U?response=json&date=${flowSession.replaceAll('-','')}`;
  const tpexFlowUrl = 'https://www.tpex.org.tw/openapi/v1/tpex_3insti_summary';
  const [twseFlowResult,tpexFlowResult] = await Promise.all([fetchJsonBounded(twseFlowUrl,fetchImpl),fetchJsonBounded(tpexFlowUrl,fetchImpl)]);
  const twseFlow = parseTwseForeignFlow(twseFlowResult.payload);
  const tpexFlow = parseTpexForeignFlow(tpexFlowResult.payload);
  const flowSessionMatch = twseFlow?.session===flowSession && tpexFlow?.session===flowSession;
  const foreignFlow = flowSessionMatch ? { session:flowSession,net1d:twseFlow.net+tpexFlow.net,twseNet1d:twseFlow.net,
    tpexNet1d:tpexFlow.net,sourceRefs:[twseFlowUrl,tpexFlowUrl] } : null;
  const optionalHashes = {};
  for (const history of twseHistories) if (history.result.status==='fulfilled') optionalHashes[history.url]=history.result.value.hash;
  if (tpexHistoryResult.status==='fulfilled') optionalHashes[tpexIndexHistoryUrl]=tpexHistoryResult.value.hash;
  historicalValuationRequests.forEach((request,index)=>{
    if (historicalValuationResults[index].status==='fulfilled') optionalHashes[request.url]=historicalValuationResults[index].value.hash;
  });
  return Object.freeze({ schema:'official-tw-market-snapshot-v1.1',collectedAt,cutoff,
    valuations,valuationHistory,revenues,twseIndex,
    tpexIndex,foreignFlow,
    sourceHashes:{...Object.fromEntries(sources.map((url)=>[url,byUrl.get(url).hash])),
      [twseFlowUrl]:twseFlowResult.hash,[tpexFlowUrl]:tpexFlowResult.hash,...optionalHashes} });
}

function validateReportedValuation(row) {
  const officialSource = row?.sourceUrl === SOURCE_URL && /^twse-openapi:BWIBBU_ALL:\d{4}-\d{2}-\d{2}:\d{4}$/u.test(row?.sourceRef ?? '')
    || row?.sourceUrl === TPEX_SOURCE_URL && /^tpex-openapi:peratio:\d{4}-\d{2}-\d{2}:\d{4}$/u.test(row?.sourceRef ?? '');
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

module.exports = { SOURCE_URL,TPEX_SOURCE_URL,TWSE_REVENUE_URL,TPEX_REVENUE_URL,TWSE_INDEX_URL,TPEX_INDEX_URL,
  loadOfficialTwMarketSnapshot,parseIndexRows,parseRevenueRows,parseTpexForeignFlow,parseTpexHistoricalValuationRows,
  parseTpexIndexHistory,parseTpexValuationRows,parseTwseForeignFlow,parseTwseHistoricalValuationRows,
  parseTwseIndexHistory,parseTwseValuationRows,rocSession,validateReportedValuation };
