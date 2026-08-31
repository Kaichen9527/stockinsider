type TwStockModule = {
  TwStock: new (options?: { ttl?: number; limit?: number }) => {
    stocks: {
      quote: (options: { symbol: string; odd?: boolean }) => Promise<Record<string, unknown>>;
      values: (options: { symbol: string; date: string; exchange?: 'TWSE' | 'TPEx' }) => Promise<Record<string, unknown>>;
      institutional: (options: { symbol: string; date: string; exchange?: 'TWSE' | 'TPEx' }) => Promise<Record<string, unknown>>;
      revenue: (options: { symbol: string; year: number; month: number; exchange?: 'TWSE' | 'TPEx'; foreign?: boolean }) => Promise<Record<string, unknown>>;
      eps: (options: { symbol: string; year: number; quarter: number; exchange?: 'TWSE' | 'TPEx' }) => Promise<Record<string, unknown>>;
      marginTrades: (options: { symbol: string; date: string; exchange?: 'TWSE' | 'TPEx' }) => Promise<Record<string, unknown>>;
      shortSales: (options: { symbol: string; date: string; exchange?: 'TWSE' | 'TPEx' }) => Promise<Record<string, unknown>>;
    };
  };
};

let twStockClientPromise: Promise<InstanceType<TwStockModule['TwStock']> | null> | null = null;
const TWSTOCK_REQUEST_TIMEOUT_MS = 2500;
const OFFICIAL_MARKET_MAX_CONCURRENCY = 4;
const OFFICIAL_VALUATION_BACKFILL_MONTHS_PER_CYCLE = 12;
let officialMarketActive = 0;
const officialMarketWaiters: Array<() => void> = [];
const officialHostPace = new Map<string, Promise<void>>();
const officialHostNextRequestAt = new Map<string, number>();

async function withOfficialMarketSlot<T>(work: () => Promise<T>): Promise<T> {
  if (officialMarketActive >= OFFICIAL_MARKET_MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => officialMarketWaiters.push(resolve));
  }
  officialMarketActive += 1;
  try {
    return await work();
  } finally {
    officialMarketActive -= 1;
    officialMarketWaiters.shift()?.();
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOfficialHostPace(url: string) {
  const host = new URL(url).hostname;
  const previous = officialHostPace.get(host) || Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => { release = resolve; });
  officialHostPace.set(host, current);
  await previous;
  try {
    const waitMs = Math.max(0, (officialHostNextRequestAt.get(host) || 0) - Date.now());
    if (waitMs > 0) await delay(waitMs);
    officialHostNextRequestAt.set(host, Date.now() + 300);
  } finally {
    release();
    if (officialHostPace.get(host) === current) officialHostPace.delete(host);
  }
}

async function fetchOfficialJson<T>(url: string, timeoutMs: number, attempts = 3): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await withOfficialMarketSlot(async () => {
        await waitForOfficialHostPace(url);
        const response = await fetch(url, {
          headers: { accept: 'application/json', 'user-agent': 'StockInsider/2.1 official-market-data' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return { retryable: response.status === 403 || response.status === 429 || response.status >= 500, data: null };
        return { retryable: false, data: await response.json() as T };
      });
      if (result.data != null) return result.data;
      if (!result.retryable) return null;
    } catch {
      // Retry bounded official-source timeouts and transient network failures.
    }
    if (attempt + 1 < attempts) await delay(500 * (attempt + 1));
  }
  return null;
}

async function withTwStockTimeout<T>(promise: Promise<T>, timeoutMs = TWSTOCK_REQUEST_TIMEOUT_MS): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('twstock_timeout')), timeoutMs);
    }),
  ]);
}

function toFiniteNumber(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonthShift(monthsBack: number) {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - monthsBack);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function buildRecentDates(daysBack = 10) {
  const dates: string[] = [];
  for (let i = 0; i < daysBack; i += 1) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const day = date.getUTCDay();
    if (day === 0 || day === 6) continue;
    dates.push(formatDate(date));
  }
  return dates;
}

function compactTwseDate(date: string) {
  return date.replace(/-/g, '');
}

function normalizeTwseDate(date: string) {
  if (/^\d{8}$/.test(date)) {
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  }
  return date;
}

function twseNumber(value: unknown) {
  return toFiniteNumber(String(value ?? '').replace(/--/g, ''));
}

function parseTwseTwt93uRow(symbol: string, payload: Record<string, unknown>, sourceUrl: string) {
  const rows = Array.isArray(payload.data) ? (payload.data as unknown[]) : [];
  const row = rows.find((item) => Array.isArray(item) && String(item[0]).trim() === symbol) as unknown[] | undefined;
  if (!row) return null;
  const sblShortBalancePrev = twseNumber(row[8]);
  const sblShortSale = twseNumber(row[9]);
  const sblShortReturn = twseNumber(row[10]);
  const sblShortAdjustment = twseNumber(row[11]);
  const sblShortBalance = twseNumber(row[12]);
  const sblShortQuota = twseNumber(row[13]);
  if (sblShortBalance == null && sblShortSale == null) return null;
  const date = typeof payload.date === 'string' ? normalizeTwseDate(payload.date) : null;
  return {
    date,
    source: 'twse-official:TWT93U',
    sourceUrl,
    marginShortBalancePrev: null,
    marginShortSell: null,
    marginShortBuy: null,
    marginShortRedeem: null,
    marginShortBalance: null,
    marginShortQuota: null,
    marginShortUsageRatio: null,
    sblShortBalancePrev,
    sblShortSale,
    sblShortReturn,
    sblShortAdjustment,
    sblShortBalance,
    sblShortQuota,
    sblShortUsageRatio:
      sblShortBalance != null && sblShortQuota && sblShortQuota > 0 ? (sblShortBalance / sblShortQuota) * 100 : null,
    note: 'TWSE 官方「融券借券賣出餘額」TWT93U。',
  };
}

export async function fetchTwseOfficialSblShortSales(symbol: string) {
  const dates = buildRecentDates(8);
  for (const date of dates) {
    const compactDate = compactTwseDate(date);
    const sourceUrl = `https://www.twse.com.tw/exchangeReport/TWT93U?response=json&date=${compactDate}`;
    try {
      const response = await fetch(sourceUrl, {
        headers: {
          'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0',
          accept: 'application/json,text/plain,*/*',
        },
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as Record<string, unknown>;
      if (String(payload.stat || '').toUpperCase() !== 'OK') continue;
      const parsed = parseTwseTwt93uRow(symbol, payload, sourceUrl);
      if (parsed) return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function ohlcNumber(value: unknown) {
  return toFiniteNumber(value);
}

export function parseTpexTradingStockRows(payload: Record<string, unknown>) {
  const tables = Array.isArray(payload.tables) ? payload.tables as Array<Record<string, unknown>> : [];
  const data = tables.flatMap((table) => Array.isArray(table.data) ? table.data as unknown[][] : []);
  return data.flatMap((item) => {
    const roc = String(item[0] || '').match(/^(\d{3})\/(\d{2})\/(\d{2})$/u);
    const lots = ohlcNumber(item[1]);
    const open = ohlcNumber(item[3]);
    const high = ohlcNumber(item[4]);
    const low = ohlcNumber(item[5]);
    const close = ohlcNumber(item[6]);
    if (!roc || open == null || high == null || low == null || close == null) return [];
    return [{
      time: `${Number(roc[1]) + 1911}-${roc[2]}-${roc[3]}`,
      open,
      high,
      low,
      close,
      volume: lots == null ? null : Math.round(lots * 1000),
    }];
  });
}

async function getTwStockClient() {
  if (!twStockClientPromise) {
    twStockClientPromise = (async () => {
      try {
        const twstock = (await import('node-twstock')) as unknown as TwStockModule;
        return new twstock.TwStock({ ttl: 1200, limit: 2 });
      } catch {
        return null;
      }
    })();
  }
  return twStockClientPromise;
}

export async function fetchTwStockQuote(symbol: string) {
  const client = await getTwStockClient();
  if (!client) return null;
  try {
    const data = await withTwStockTimeout(client.stocks.quote({ symbol }));
    const lastPrice = toFiniteNumber(data.lastPrice);
    if (!(lastPrice && lastPrice > 0)) return null;
    const referencePrice = toFiniteNumber(data.referencePrice);
    const totalVolume = toFiniteNumber((data as { totalVoluem?: unknown }).totalVoluem);
    const changePct =
      lastPrice && referencePrice && referencePrice > 0
        ? ((lastPrice - referencePrice) / referencePrice) * 100
        : null;
    return {
      date: typeof data.date === 'string' ? data.date : null,
      symbol,
      name: typeof data.name === 'string' ? data.name : symbol,
      price: lastPrice,
      openPrice: toFiniteNumber(data.openPrice),
      highPrice: toFiniteNumber(data.highPrice),
      lowPrice: toFiniteNumber(data.lowPrice),
      referencePrice,
      volume: totalVolume,
      changePct,
      lastUpdated: toFiniteNumber(data.lastUpdated),
    };
  } catch {
    return null;
  }
}

export async function fetchTwStockValues(symbol: string) {
  const symbols = new Set([symbol]);
  const dates = buildRecentDates(8);
  for (const date of dates) {
    const compactDate = compactTwseDate(date);
    const tpexDate = date.replace(/-/g, '/');
    const [twsePayload, tpexPayload] = await Promise.all([
      fetchOfficialJson<Record<string, unknown>>(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${compactDate}&selectType=ALL&response=json`, 8_000),
      fetchOfficialJson<Record<string, unknown>>(`https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate?date=${tpexDate}&cate=&response=json`, 8_000),
    ]);
    const point = (twsePayload ? parseTwseValuationPanel(twsePayload, date, symbols).get(symbol) : null)
      || (tpexPayload ? parseTpexValuationPanel(tpexPayload, date, symbols).get(symbol) : null);
    if (point) return { ...point, dividendYield: null, dividendYear: null };
  }
  return null;
}

export type TwValuationHistoryPoint = {
  date: string;
  peRatio: number | null;
  pbRatio: number | null;
  sourceUrl: string;
};

export function isOfficialValuationSourceUrl(value: unknown) {
  const sourceUrl = String(value || '');
  return /https:\/\/www\.twse\.com\.tw\/rwd\/zh\/afterTrading\/BWIBBU(?:_d)?\?/u.test(sourceUrl)
    || /https:\/\/www\.tpex\.org\.tw\/www\/zh-tw\/afterTrading\/peQryDate\?/u.test(sourceUrl);
}

export function selectOfficialValuationBackfillMonths(monthlyStarts: string[], knownMonths: Set<string>) {
  return monthlyStarts
    .filter((monthStart) => !knownMonths.has(`${monthStart.slice(0, 4)}-${monthStart.slice(4, 6)}`))
    .slice(-OFFICIAL_VALUATION_BACKFILL_MONTHS_PER_CYCLE);
}

export function parseTwseValuationPanel(payload: Record<string, unknown>, date: string, symbols: Set<string>) {
  const rows = Array.isArray(payload.data) ? payload.data as unknown[][] : [];
  const result = new Map<string, TwValuationHistoryPoint>();
  for (const row of rows) {
    const symbol = String(row[0] || '').trim();
    if (!symbols.has(symbol)) continue;
    const peRatio = twseNumber(row[5]);
    const pbRatio = twseNumber(row[6]);
    if (peRatio == null && pbRatio == null) continue;
    result.set(symbol, {
      date,
      peRatio,
      pbRatio,
      sourceUrl: `https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${compactTwseDate(date)}&selectType=ALL&response=json`,
    });
  }
  return result;
}

export function parseTpexValuationPanel(payload: Record<string, unknown>, date: string, symbols: Set<string>) {
  const tables = Array.isArray(payload.tables) ? payload.tables as Array<Record<string, unknown>> : [];
  const rows = tables.flatMap((table) => Array.isArray(table.data) ? table.data as unknown[][] : []);
  const result = new Map<string, TwValuationHistoryPoint>();
  for (const row of rows) {
    const symbol = String(row[0] || '').trim();
    if (!symbols.has(symbol)) continue;
    const peRatio = twseNumber(row[5]);
    const pbRatio = twseNumber(row[6]);
    if (peRatio == null && pbRatio == null) continue;
    result.set(symbol, {
      date,
      peRatio,
      pbRatio,
      sourceUrl: `https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate?date=${date.replace(/-/g, '/')}&cate=&response=json`,
    });
  }
  return result;
}

export function parseTwseStockValuationHistory(payload: Record<string, unknown>, sourceUrl: string) {
  const rows = Array.isArray(payload.data) ? payload.data as unknown[][] : [];
  return rows.flatMap((row): TwValuationHistoryPoint[] => {
    const roc = String(row[0] || '').match(/^(\d{3})年(\d{2})月(\d{2})日$/u);
    const peRatio = twseNumber(row[3]);
    const pbRatio = twseNumber(row[4]);
    if (!roc || (peRatio == null && pbRatio == null)) return [];
    return [{
      date: `${Number(roc[1]) + 1911}-${roc[2]}-${roc[3]}`,
      peRatio,
      pbRatio,
      sourceUrl,
    }];
  });
}

export async function fetchTwMarketValuationHistory(
  symbols: string[],
  tradingSessions: string[],
  monthsBack = 60,
  exchangeBySymbol?: Map<string, 'TWSE' | 'TPEx'>,
  existingHistory?: Map<string, TwValuationHistoryPoint[]>,
) {
  const requestedSymbols = new Set(symbols.filter((symbol) => /^\d{4}$/u.test(symbol)));
  const latestSessionByMonth = new Map<string, string>();
  for (const session of [...tradingSessions].sort()) latestSessionByMonth.set(session.slice(0, 7), session);
  const sampleSessions = [...latestSessionByMonth.values()].sort().slice(-monthsBack);
  const histories = new Map<string, TwValuationHistoryPoint[]>();
  for (const symbol of requestedSymbols) {
    const trusted = (existingHistory?.get(symbol) || []).filter((point) => isOfficialValuationSourceUrl(point.sourceUrl));
    if (trusted.length > 0) histories.set(symbol, [...trusted]);
  }
  const latestSession = sampleSessions.at(-1);
  const sessionsToFetch = sampleSessions.filter((session) => {
    if (session === latestSession) return true;
    const month = session.slice(0, 7);
    return [...requestedSymbols].some((symbol) => !(histories.get(symbol) || []).some((point) => point.date.slice(0, 7) === month));
  });
  await Promise.all(sessionsToFetch.map(async (session) => {
    const compactDate = compactTwseDate(session);
    const tpexDate = session.replace(/-/g, '/');
    const [twsePayload, tpexPayload] = await Promise.all([
      fetchOfficialJson<Record<string, unknown>>(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${compactDate}&selectType=ALL&response=json`, 10_000),
      fetchOfficialJson<Record<string, unknown>>(`https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate?date=${tpexDate}&cate=&response=json`, 10_000),
    ]);
    const panels = [
      twsePayload ? parseTwseValuationPanel(twsePayload, session, requestedSymbols) : new Map<string, TwValuationHistoryPoint>(),
      tpexPayload ? parseTpexValuationPanel(tpexPayload, session, requestedSymbols) : new Map<string, TwValuationHistoryPoint>(),
    ];
    for (const panel of panels) {
      for (const [symbol, point] of panel) {
        const history = histories.get(symbol);
        if (history) history.push(point);
        else histories.set(symbol, [point]);
      }
    }
  }));
  const monthlyStarts = sampleSessions.map((session) => `${session.slice(0, 4)}${session.slice(5, 7)}01`);
  await Promise.all([...requestedSymbols].map(async (symbol) => {
    if (exchangeBySymbol?.get(symbol) === 'TPEx') return;
    const history = histories.get(symbol) || [];
    const knownMonths = new Set(history.map((point) => point.date.slice(0, 7)));
    const missingMonths = selectOfficialValuationBackfillMonths(monthlyStarts, knownMonths);
    const recovered = await Promise.all(missingMonths.map(async (monthStart) => {
      const sourceUrl = `https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=${monthStart}&stockNo=${encodeURIComponent(symbol)}&response=json`;
      // Historical gaps are retried by the next daily cycle. Avoid extending the
      // 19:00 production window with transient retries for non-current evidence.
      const payload = await fetchOfficialJson<Record<string, unknown>>(sourceUrl, 8_000, 1);
      return payload ? parseTwseStockValuationHistory(payload, sourceUrl).sort((left, right) => left.date.localeCompare(right.date)).at(-1) || null : null;
    }));
    const merged = new Map(history.map((point) => [point.date.slice(0, 7), point]));
    for (const point of recovered) if (point) merged.set(point.date.slice(0, 7), point);
    if (merged.size > 0) histories.set(symbol, [...merged.values()].sort((left, right) => left.date.localeCompare(right.date)));
  }));
  for (const history of histories.values()) history.sort((left, right) => left.date.localeCompare(right.date));
  return histories;
}

export async function fetchTwStockDailyBars(symbol: string, daysBack = 120) {
  const rows: Array<{ time: string; open: number; high: number; low: number; close: number; volume: number | null }> = [];
  const monthCount = Math.min(36, Math.max(2, Math.ceil(daysBack / 18) + 2));
  const monthStarts = Array.from({ length: monthCount }, (_, offset) => {
    const value = new Date();
    value.setUTCDate(1);
    value.setUTCMonth(value.getUTCMonth() - offset);
    return `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, '0')}01`;
  });
  const monthlyResults = await Promise.all(monthStarts.map(async (date) => {
    try {
      const payload = await fetchOfficialJson<{ stat?: string; data?: string[][] }>(`https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${date}&stockNo=${encodeURIComponent(symbol)}&response=json`, 8_000);
      if (!payload) return [];
      if (payload.stat !== 'OK' || !Array.isArray(payload.data)) return [];
      return payload.data.flatMap((item) => {
        const roc = String(item[0] || '').match(/^(\d{3})\/(\d{2})\/(\d{2})$/u);
        const volume = ohlcNumber(item[1]);
        const open = ohlcNumber(item[3]);
        const high = ohlcNumber(item[4]);
        const low = ohlcNumber(item[5]);
        const close = ohlcNumber(item[6]);
        if (!roc || open == null || high == null || low == null || close == null) return [];
        return [{
          time: `${Number(roc[1]) + 1911}-${roc[2]}-${roc[3]}`,
          open, high, low, close,
          volume: volume == null ? null : Math.round(volume),
        }];
      });
    } catch {
      return [];
    }
  }));
  rows.push(...monthlyResults.flat());

  if (rows.length === 0) {
    const tpexMonthlyResults = await Promise.all(monthStarts.map(async (date) => {
      const month = `${date.slice(0, 4)}/${date.slice(4, 6)}/01`;
      try {
        const payload = await fetchOfficialJson<Record<string, unknown>>(`https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${encodeURIComponent(symbol)}&date=${month}&response=json`, 8_000);
        return payload ? parseTpexTradingStockRows(payload) : [];
      } catch {
        return [];
      }
    }));
    rows.push(...tpexMonthlyResults.flat());
  }

  if (rows.length === 0) {
    try {
      const response = await withOfficialMarketSlot(() => fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', {
        headers: { accept: 'application/json', 'user-agent': 'StockInsider/2.0 official-market-data' },
        signal: AbortSignal.timeout(10_000),
      }));
      const payload = response.ok ? await response.json() as Array<Record<string, unknown>> : [];
      const item = payload.find((row) => String(row.SecuritiesCompanyCode || '') === symbol);
      const date = String(item?.Date || '').match(/^(\d{3})(\d{2})(\d{2})$/u);
      const open = ohlcNumber(item?.Open);
      const high = ohlcNumber(item?.High);
      const low = ohlcNumber(item?.Low);
      const close = ohlcNumber(item?.Close);
      if (date && open != null && high != null && low != null && close != null) {
        rows.push({
          time: `${Number(date[1]) + 1911}-${date[2]}-${date[3]}`,
          open, high, low, close,
          volume: ohlcNumber(item?.TradingShares),
        });
      }
    } catch {
      // TPEx historical series remains unknown until an authorized historical feed is configured.
    }
  }
  if (rows.length === 0) return null;
  return rows
    .sort((a, b) => a.time.localeCompare(b.time))
    .filter((row, index, values) => index === values.findIndex((item) => item.time === row.time))
    .slice(-daysBack);
}

export type TwStockMasterRecord = {
  symbol: string;
  name: string;
  exchange: 'TWSE' | 'TPEx';
};

export async function fetchTwStockMaster(): Promise<TwStockMasterRecord[]> {
  const headers = { accept: 'application/json', 'user-agent': 'StockInsider/2.1 official-stock-master' };
  const [twse, tpex] = await Promise.all([
    withOfficialMarketSlot(() => fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {
      headers,
      signal: AbortSignal.timeout(12_000),
    })).then(async (response) => response.ok ? await response.json() as Array<Record<string, unknown>> : []).catch(() => []),
    withOfficialMarketSlot(() => fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes', {
      headers,
      signal: AbortSignal.timeout(12_000),
    })).then(async (response) => response.ok ? await response.json() as Array<Record<string, unknown>> : []).catch(() => []),
  ]);
  const records = new Map<string, TwStockMasterRecord>();
  for (const row of twse) {
    const symbol = String(row.Code || '').trim();
    const name = String(row.Name || row.CompanyName || '').trim();
    if (/^\d{4}$/u.test(symbol) && name) records.set(symbol, { symbol, name, exchange: 'TWSE' });
  }
  for (const row of tpex) {
    const symbol = String(row.SecuritiesCompanyCode || row.Code || '').trim();
    const name = String(row.CompanyName || row.SecuritiesCompanyName || '').trim();
    if (/^\d{4}$/u.test(symbol) && name && !records.has(symbol)) records.set(symbol, { symbol, name, exchange: 'TPEx' });
  }
  return [...records.values()];
}

export async function fetchTwMarketTradingSessions(daysBack = 80): Promise<string[]> {
  const monthCount = Math.max(2, Math.ceil(daysBack / 18) + 1);
  const months = Array.from({ length: monthCount }, (_, offset) => {
    const value = new Date();
    value.setUTCDate(1);
    value.setUTCMonth(value.getUTCMonth() - offset);
    return `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, '0')}01`;
  });
  const results = await Promise.all(months.map(async (date) => {
    try {
      const payload = await fetchOfficialJson<Record<string, unknown>>(`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${date}&response=json`, 8_000);
      if (!payload) return [];
      const rows = Array.isArray(payload.data) ? payload.data as unknown[][] : [];
      return rows.flatMap((row) => {
        const roc = String(row[0] || '').match(/^(\d{3})\/(\d{2})\/(\d{2})$/u);
        return roc ? [`${Number(roc[1]) + 1911}-${roc[2]}-${roc[3]}`] : [];
      });
    } catch {
      return [];
    }
  }));
  return [...new Set(results.flat())].sort().slice(-daysBack);
}

export async function fetchTwStockInstitutional(symbol: string) {
  const client = await getTwStockClient();
  if (!client) return null;
  const dates = buildRecentDates(6);
  for (const date of dates) {
    try {
      const data = await withTwStockTimeout(client.stocks.institutional({ symbol, date }));
      const rows = Array.isArray(data.institutional) ? (data.institutional as Array<Record<string, unknown>>) : [];
      if (rows.length === 0) continue;
      const lookup = (matcher: RegExp) =>
        rows.find((row) => matcher.test(String(row.investor || '')));
      const foreign = lookup(/外資及陸資\(不含外資自營商\)/);
      const trust = lookup(/^投信$/);
      const dealer = lookup(/^自營商$/);
      return {
        date,
        foreignNet: toFiniteNumber(foreign?.difference),
        investmentTrustNet: toFiniteNumber(trust?.difference),
        dealerNet: toFiniteNumber(dealer?.difference),
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchTwStockRevenue(symbol: string, monthsBack = 4) {
  const client = await getTwStockClient();
  if (!client) return null;
  for (let i = 0; i < monthsBack; i += 1) {
    const { year, month } = startOfMonthShift(i + 1);
    try {
      const data = await withTwStockTimeout(client.stocks.revenue({ symbol, year, month }));
      const revenue = toFiniteNumber(data.revenue);
      if (revenue == null) continue;
      return {
        asOfDate: `${year}-${String(month).padStart(2, '0')}-01`,
        revenue,
        year,
        month,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchTwStockEpsTtm(symbol: string, quartersBack = 4) {
  const client = await getTwStockClient();
  if (!client) return null;
  const parts: Array<{ year: number; quarter: number }> = [];
  const now = new Date();
  let year = now.getUTCFullYear();
  let quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  // Public filings can lag the current calendar quarter. Scan enough older
  // periods to find four consecutive published quarters without fabricating gaps.
  for (let i = 0; i < quartersBack + 3; i += 1) {
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
    parts.push({ year, quarter });
  }

  let total = 0;
  const periods: string[] = [];
  let started = false;
  let latestLabel: string | null = null;
  for (const part of parts) {
    try {
      const data = await withTwStockTimeout(client.stocks.eps({ symbol, year: part.year, quarter: part.quarter }));
      const eps = toFiniteNumber(data.eps);
      if (eps == null) {
        if (started) return null;
        continue;
      }
      started = true;
      total += eps;
      const label = `${part.year}-Q${part.quarter}`;
      periods.push(label);
      if (!latestLabel) latestLabel = label;
      if (periods.length === 4) {
        return {
          asOfLabel: latestLabel,
          epsTtm: Number(total.toFixed(2)),
          periods,
        };
      }
    } catch {
      if (started) return null;
    }
  }
  return null;
}

export async function fetchTwStockMarginTrades(symbol: string) {
  const client = await getTwStockClient();
  if (!client) return null;
  const dates = buildRecentDates(6);
  for (const date of dates) {
    try {
      const data = await withTwStockTimeout(client.stocks.marginTrades({ symbol, date }));
      const marginBalance = toFiniteNumber(data.marginBalance);
      const shortBalance = toFiniteNumber(data.shortBalance);
      if (marginBalance == null && shortBalance == null) continue;
      const marginQuota = toFiniteNumber(data.marginQuota);
      const shortQuota = toFiniteNumber(data.shortQuota);
      return {
        date,
        marginBuy: toFiniteNumber(data.marginBuy),
        marginSell: toFiniteNumber(data.marginSell),
        marginRedeem: toFiniteNumber(data.marginRedeem),
        marginBalancePrev: toFiniteNumber(data.marginBalancePrev),
        marginBalance,
        marginQuota,
        shortBuy: toFiniteNumber(data.shortBuy),
        shortSell: toFiniteNumber(data.shortSell),
        shortRedeem: toFiniteNumber(data.shortRedeem),
        shortBalancePrev: toFiniteNumber(data.shortBalancePrev),
        shortBalance,
        shortQuota,
        offset: toFiniteNumber(data.offset),
        marginUsageRatio: marginBalance != null && marginQuota && marginQuota > 0 ? (marginBalance / marginQuota) * 100 : null,
        shortUsageRatio: shortBalance != null && shortQuota && shortQuota > 0 ? (shortBalance / shortQuota) * 100 : null,
        note: typeof data.note === 'string' ? data.note : null,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchTwStockShortSales(symbol: string) {
  const client = await getTwStockClient();
  const officialSbl = await fetchTwseOfficialSblShortSales(symbol).catch(() => null);
  if (!client) return officialSbl;
  const dates = buildRecentDates(6);
  for (const date of dates) {
    try {
      const data = await withTwStockTimeout(client.stocks.shortSales({ symbol, date }));
      const marginShortBalance = toFiniteNumber(data.marginShortBalance);
      const sblShortBalance = officialSbl?.sblShortBalance ?? toFiniteNumber(data.sblShortBalance);
      if (marginShortBalance == null && sblShortBalance == null) continue;
      const marginShortQuota = toFiniteNumber(data.marginShortQuota);
      const sblShortQuota = officialSbl?.sblShortQuota ?? toFiniteNumber(data.sblShortQuota);
      return {
        date,
        marginShortBalancePrev: toFiniteNumber(data.marginShortBalancePrev),
        marginShortSell: toFiniteNumber(data.marginShortSell),
        marginShortBuy: toFiniteNumber(data.marginShortBuy),
        marginShortRedeem: toFiniteNumber(data.marginShortRedeem),
        marginShortBalance,
        marginShortQuota,
        sblShortBalancePrev: officialSbl?.sblShortBalancePrev ?? toFiniteNumber(data.sblShortBalancePrev),
        sblShortSale: officialSbl?.sblShortSale ?? toFiniteNumber(data.sblShortSale),
        sblShortReturn: officialSbl?.sblShortReturn ?? toFiniteNumber(data.sblShortReturn),
        sblShortAdjustment: officialSbl?.sblShortAdjustment ?? toFiniteNumber(data.sblShortAdjustment),
        sblShortBalance,
        sblShortQuota,
        marginShortUsageRatio:
          marginShortBalance != null && marginShortQuota && marginShortQuota > 0 ? (marginShortBalance / marginShortQuota) * 100 : null,
        sblShortUsageRatio:
          sblShortBalance != null && sblShortQuota && sblShortQuota > 0 ? (sblShortBalance / sblShortQuota) * 100 : null,
        source: officialSbl?.source ?? 'node-twstock',
        sourceUrl: officialSbl?.sourceUrl ?? null,
        note: officialSbl?.note ?? (typeof data.note === 'string' ? data.note : null),
      };
    } catch {
      continue;
    }
  }
  return officialSbl;
}
