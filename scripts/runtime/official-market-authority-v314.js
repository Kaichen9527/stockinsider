'use strict';

const { canonicalJson, invariant, sha256 } = require('./codec');

const OFFICIAL_HOSTS = Object.freeze(['openapi.twse.com.tw', 'www.twse.com.tw', 'www.tpex.org.tw']);
const MARKETS = Object.freeze(['TWSE', 'TPEX']);
const FLOW_FACT_KEYS = Object.freeze([
  'quarterly_revenue', 'quarterly_gross_profit', 'quarterly_operating_expense',
  'quarterly_operating_income', 'quarterly_non_operating_income', 'quarterly_pretax_income',
  'quarterly_income_tax_expense', 'quarterly_noncontrolling_interest', 'quarterly_net_income',
  'quarterly_net_income_attributable_to_common', 'quarterly_diluted_eps',
  'diluted_weighted_average_shares',
]);
const BALANCE_FACT_KEYS = Object.freeze([
  'cash_and_equivalents', 'total_debt', 'total_assets', 'total_equity', 'book_value_per_share',
]);

function officialRef(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'https:' && OFFICIAL_HOSTS.includes(parsed.hostname);
  } catch { return false; }
}

function civilDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value))) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? String(value) : null;
}

function officialFactRef(value) {
  return /^(?:twse|tpex)-(?:openapi:financial-statement|mops-inline):/u.test(String(value));
}

function factValue(row) {
  const value=Number(row?.value);
  if(!Number.isFinite(value))return null;
  if(row.unit==='TWD_thousand')return value*1000;
  if(row.unit==='TWD_million')return value*1_000_000;
  if(['TWD','share','TWD_per_share'].includes(row.unit))return value;
  if(row.unit==='thousand_shares')return value*1000;
  return null;
}

function selectedFactHead(rows,key,period) {
  return rows.filter((row)=>row.factKey===key&&row.periodEnd===period)
    .sort((left,right)=>String(right.filingPublishedAt).localeCompare(String(left.filingPublishedAt))
      ||String(right.sourceTimestamp).localeCompare(String(left.sourceTimestamp))
      ||String(right.collectedAt).localeCompare(String(left.collectedAt))
      ||String(left.sourceRef).localeCompare(String(right.sourceRef)))[0]??null;
}

function canonicalMarketSession(row, evaluatedAt) {
  const session = civilDate(row?.session);
  invariant(session && MARKETS.includes(row?.market) && ['completed', 'holiday', 'scheduled'].includes(row?.status)
    && officialRef(row?.sourceUrl) && typeof row?.sourceRef === 'string' && row.sourceRef.length > 8,
  'official calendar session authority');
  const closeAt = row.status === 'holiday' ? null : row.closeAt;
  invariant(closeAt === null || (typeof closeAt === 'string' && Number.isFinite(Date.parse(closeAt))),
    'official calendar close authority');
  return Object.freeze({ market:row.market, session, status:row.status, closeAt,
    sourceUrl:row.sourceUrl, sourceRef:row.sourceRef,
    sourceSha256:/^[0-9a-f]{64}$/u.test(String(row.sourceSha256)) ? row.sourceSha256 : null,
    observedAt:new Date(evaluatedAt).toISOString() });
}

function buildOfficialTradingScheduleV314({ calendarSessions = [], evaluatedAt }) {
  invariant(Number.isFinite(Date.parse(evaluatedAt)), 'calendar evaluation timestamp');
  invariant(Array.isArray(calendarSessions) && calendarSessions.length > 0 && calendarSessions.length <= 1600,
    'official calendar bound');
  const rows = new Map();
  for (const raw of calendarSessions) {
    const row = canonicalMarketSession(raw, evaluatedAt);
    const key = `${row.market}:${row.session}`;
    const prior = rows.get(key);
    invariant(!prior || canonicalJson(prior) === canonicalJson(row), 'calendar session conflict');
    rows.set(key, row);
  }
  const marketSessions = [...rows.values()].sort((left, right) => left.session.localeCompare(right.session)
    || left.market.localeCompare(right.market));
  const byDate = Map.groupBy(marketSessions, (row) => row.session);
  const sessions = [];
  for (const [session, members] of byDate) {
    if (members.length !== 2 || !MARKETS.every((market) => members.some((row) => row.market === market))) continue;
    const statuses = new Set(members.map((row) => row.status));
    invariant(statuses.size === 1, 'calendar cross-market conflict');
    const status = members[0].status;
    const closeValues = members.map((row) => row.closeAt).filter(Boolean).sort();
    sessions.push(Object.freeze({ session, status, closeAt:closeValues.at(-1) ?? null,
      sourceRefs:Object.freeze(members.map((row) => row.sourceRef).sort()) }));
  }
  invariant(sessions.length > 0, 'calendar composite unavailable');
  const authorityHash = sha256(canonicalJson(['official-tw-trading-calendar-v3.14', marketSessions, sessions]));
  return Object.freeze({ schema:'official-tw-trading-calendar-v3.14', authorityHash,
    marketSessions:Object.freeze(marketSessions), sessions:Object.freeze(sessions) });
}

function validAdjustedEvidence(row, completedSessions = null) {
  const evidence = row?.adjustmentEvidence;
  if (!Array.isArray(evidence) || evidence.length !== 15 || row?.adjustmentEvidenceRef !== sha256(canonicalJson(evidence))) return false;
  const [schema, anchorSession, observationId, rawSourceRef, sessionAuthorityId, rawOpen, rawHigh,
    rawLow, rawClose, actionDays, adjustmentFactor, adjustedOpen, adjustedHigh, adjustedLow, adjustedClose] = evidence;
  if (schema !== 'adjusted-price-evidence-v3.1' || !civilDate(anchorSession) || !civilDate(row?.session)
    || anchorSession < row.session || !/^[0-9a-f-]{36}$/u.test(String(observationId))
    || !/^[0-9a-f-]{36}$/u.test(String(sessionAuthorityId)) || rawSourceRef !== row.rawSourceRef
    || !officialRef(row.rawSourceUrl) || !['TWSE', 'TPEX'].includes(row.exchange)
    || !Array.isArray(actionDays) || actionDays.length > 252 || !Number.isFinite(adjustmentFactor)
    || adjustmentFactor <= 0) return false;
  let prior = row.session;
  for (const member of actionDays) {
    if (!Array.isArray(member) || member.length !== 6 || !civilDate(member[0]) || member[0] <= prior
      || member[0] > anchorSession || !/^[0-9a-f-]{36}$/u.test(String(member[1]))
      || !/^[0-9a-f-]{36}$/u.test(String(member[2])) || !/^[0-9a-f]{64}$/u.test(String(member[3]))
      || !(member[4] === null || Array.isArray(member[4])) || !Number.isFinite(member[5]) || member[5] <= 0) return false;
    prior = member[0];
  }
  const recomputedFactor=actionDays.reduce((product,member)=>product*member[5],1);
  if(Math.abs(recomputedFactor-adjustmentFactor)>Math.max(1e-10,Math.abs(adjustmentFactor)*1e-10))return false;
  if(completedSessions instanceof Set){
    const expected=[...completedSessions].filter((session)=>session>row.session&&session<=anchorSession).sort();
    if(expected.length!==actionDays.length||expected.some((session,index)=>session!==actionDays[index][0]))return false;
  }
  const raw = [rawOpen, rawHigh, rawLow, rawClose];
  const adjusted = [adjustedOpen, adjustedHigh, adjustedLow, adjustedClose];
  return raw.every((value) => Number.isFinite(value) && value > 0)
    && adjusted.every((value) => Number.isFinite(value) && value > 0)
    && rawHigh >= Math.max(rawOpen, rawClose) && rawLow <= Math.min(rawOpen, rawClose)
    && adjustedHigh >= Math.max(adjustedOpen, adjustedClose) && adjustedLow <= Math.min(adjustedOpen, adjustedClose)
    && row.open === adjustedOpen && row.high === adjustedHigh && row.low === adjustedLow && row.close === adjustedClose;
}

function completeFinancialAuthority(rows, symbol) {
  const accepted = (rows ?? []).filter((row) => row?.symbol === symbol && FLOW_FACT_KEYS.includes(row.factKey)
    && /^\d{4}-(?:03-31|06-30|09-30|12-31)$/u.test(String(row.periodEnd))
    && row.periodStart===`${String(row.periodEnd).slice(0,4)}-01-01`&&row.durationKind==='quarterly'
    && officialFactRef(row.sourceRef)&&factValue(row)!==null);
  const periods = [...new Set(accepted.filter((row) => row.factKey === 'quarterly_revenue').map((row) => row.periodEnd))]
    .sort().slice(-4);
  if (periods.length !== 4 || periods.some((period,index)=>index>0&&(
    Number(period.slice(0,4))*4+['03-31','06-30','09-30','12-31'].indexOf(period.slice(5))
    !==Number(periods[index-1].slice(0,4))*4+['03-31','06-30','09-30','12-31'].indexOf(periods[index-1].slice(5))+1))) return false;
  const selected=periods.map((period)=>Object.fromEntries(FLOW_FACT_KEYS.map((key)=>[key,selectedFactHead(accepted,key,period)])));
  if(selected.some((quarter)=>FLOW_FACT_KEYS.some((key)=>!quarter[key])))return false;
  for(const quarter of selected){
    const at=(key)=>factValue(quarter[key]);const tolerance=Math.max(1,Math.abs(at('quarterly_revenue'))*1e-8);
    const epsTolerance=Math.max(.01,Math.abs(at('quarterly_diluted_eps'))*1e-4);
    if(Math.abs(at('quarterly_gross_profit')-at('quarterly_operating_expense')-at('quarterly_operating_income'))>tolerance
      ||Math.abs(at('quarterly_operating_income')+at('quarterly_non_operating_income')-at('quarterly_pretax_income'))>tolerance
      ||Math.abs(at('quarterly_pretax_income')-at('quarterly_income_tax_expense')-at('quarterly_net_income'))>tolerance
      ||Math.abs(at('quarterly_net_income')-at('quarterly_noncontrolling_interest')
        -at('quarterly_net_income_attributable_to_common'))>tolerance
      ||!(at('diluted_weighted_average_shares')>0)
      ||Math.abs(at('quarterly_net_income_attributable_to_common')/at('diluted_weighted_average_shares')
        -at('quarterly_diluted_eps'))>epsTolerance)return false;
  }
  const balances = (rows ?? []).filter((row) => row?.symbol === symbol && BALANCE_FACT_KEYS.includes(row.factKey)
    && row.durationKind==='instant'&&row.periodStart===null&&officialFactRef(row.sourceRef)&&factValue(row)!==null);
  const latest = periods.at(-1);
  const selectedBalances=Object.fromEntries(BALANCE_FACT_KEYS.map((key)=>[key,selectedFactHead(balances,key,latest)]));
  if(BALANCE_FACT_KEYS.some((key)=>!selectedBalances[key]))return false;
  const assets=factValue(selectedBalances.total_assets);const equity=factValue(selectedBalances.total_equity);
  const cash=factValue(selectedBalances.cash_and_equivalents);const debt=factValue(selectedBalances.total_debt);
  return assets>=equity&&assets>=cash&&debt>=0;
}

function coverageReportV314({ calendar, candidates = [], officialSnapshot }) {
  invariant(calendar?.schema === 'official-tw-trading-calendar-v3.14', 'official calendar required');
  const completed = new Set(calendar.sessions.filter((row) => row.status === 'completed').map((row) => row.session));
  const bySymbol = (rows) => Map.groupBy(rows ?? [], (row) => String(row.symbol));
  const prices = bySymbol(officialSnapshot?.priceObservations);
  const allValuations=[...(officialSnapshot?.valuations ?? []), ...(officialSnapshot?.valuationHistory ?? [])];
  const valuations = bySymbol(allValuations);
  const facts = bySymbol(officialSnapshot?.financialFacts);
  const rows = candidates.map((candidate) => {
    const symbol = String(candidate.symbol); const priceRows = prices.get(symbol) ?? [];
    const valueRows = valuations.get(symbol) ?? []; const factRows = facts.get(symbol) ?? [];
    const priceSessions = new Set(priceRows.filter((row) => completed.has(String(row.session)) && validAdjustedEvidence(row,completed))
      .map((row) => String(row.session)));
    const valuationSessions = new Set(valueRows.filter((row) => completed.has(String(row.session))
      && officialRef(row.sourceUrl) && typeof row.sourceRef === 'string').map((row) => String(row.session)));
    const latestSession=[...valuationSessions].sort().at(-1)??null;
    const peerCount=latestSession?new Set(allValuations.filter((row)=>row.symbol!==symbol&&row.session===latestSession
      &&row.exchange===candidate.exchange&&row.canonicalSector===candidate.canonicalSector
      &&officialRef(row.sourceUrl)&&typeof row.sourceRef==='string'
      &&(Number(row.peRatio)>0||Number(row.pbRatio)>0)).map((row)=>String(row.symbol))).size:0;
    const financialReady = completeFinancialAuthority(factRows, symbol);
    return Object.freeze({ symbol, priceSessions:priceSessions.size, valuationSessions:valuationSessions.size,
      peerCount, priceReady:priceSessions.size >= 130, relativeReady:valuationSessions.size >= 252 && peerCount >= 8,
      financialReady, periodReadiness:financialReady ? 'ttm_from_four_official_quarters' : 'missing_complete_official_bridge' });
  });
  const blockers = [];
  if (completed.size < 300) blockers.push('calendar_completed_sessions_below_300');
  for (const row of rows) {
    if (!row.priceReady) blockers.push(`${row.symbol}:adjusted_price_sessions_below_130`);
    if (!row.relativeReady) blockers.push(`${row.symbol}:relative_authority_incomplete`);
    if (!row.financialReady) blockers.push(`${row.symbol}:financial_bridge_incomplete`);
  }
  return Object.freeze({ schema:'official-market-coverage-v3.14', completedSessions:completed.size,
    candidates:Object.freeze(rows), ready:blockers.length === 0, blockers:Object.freeze(blockers) });
}

module.exports = { BALANCE_FACT_KEYS, FLOW_FACT_KEYS, buildOfficialTradingScheduleV314,
  completeFinancialAuthority, coverageReportV314, officialFactRef, officialRef, validAdjustedEvidence };
