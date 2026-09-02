import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { readResponseTextWithin } from './official-operator-utils.mjs';

const appUrl = String(process.env.OPERATOR_TUNNEL_URL || '').replace(/\/$/u, '');
const internalKey = process.env.INTERNAL_API_KEY || '';
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!internalKey || !supabaseUrl || !serviceKey) throw new Error('operator_backfill_environment_missing');
if (appUrl !== 'http://127.0.0.1:43100') throw new Error('operator_backfill_ssh_tunnel_required');

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const number = (value) => {
  const parsed = Number(String(value ?? '').replace(/,/gu, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const session = (value) => {
  const match = String(value || '').match(/^(\d{3,4})\/(\d{2})\/(\d{2})$/u);
  if (!match) return null;
  const year = Number(match[1]) < 1911 ? Number(match[1]) + 1911 : Number(match[1]);
  const output = `${year}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${output}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === output ? output : null;
};
const monthCoordinates = (latest, monthsBack) => {
  const date = new Date(`${latest.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - monthsBack);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return { compact: `${year}${month}01`, slash: `${year}/${month}/01` };
};

async function allRows(table, select, configure) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabase.from(table).select(select).range(offset, offset + 999);
    query = configure(query);
    const result = await query;
    if (result.error) throw new Error(`${table}:${result.error.message}`);
    rows.push(...(result.data || []));
    if ((result.data || []).length < 1000) return rows;
  }
}

const manifest = await supabase.from('candidate_shadow_manifests').select('candidate_symbols,session_date').eq('policy_version', 'shadow-policy-v2').order('frozen_at', { ascending: false }).limit(1).single();
if (manifest.error || !manifest.data) throw new Error(`manifest_unavailable:${manifest.error?.message || 'missing'}`);
const symbols = [...new Set((manifest.data.candidate_symbols || []).map(String).filter((value) => /^\d{4}$/u.test(value)))].sort();
const instruments = await allRows('stock_instruments_v3', 'symbol,exchange,instrument_type,listing_status,recorded_at', (query) => query.in('symbol', symbols).eq('instrument_type', 'common_stock').eq('listing_status', 'active').order('recorded_at', { ascending: false }));
const exchangeBySymbol = new Map();
for (const row of instruments) if (!exchangeBySymbol.has(String(row.symbol))) exchangeBySymbol.set(String(row.symbol), String(row.exchange).toUpperCase());
const stocks = await supabase.from('stocks').select('id,symbol').eq('market', 'TW').in('symbol', symbols);
if (stocks.error) throw new Error(`stocks_unavailable:${stocks.error.message}`);
const stockIdBySymbol = new Map((stocks.data || []).map((row) => [String(row.symbol), String(row.id)]));
const stockIds = [...stockIdBySymbol.values()];
const existing = await allRows('official_price_history', 'stock_id,session_date', (query) => query.in('stock_id', stockIds).order('session_date', { ascending: true }));
const knownBySymbol = new Map(symbols.map((symbol) => [symbol, new Set()]));
const symbolByStockId = new Map([...stockIdBySymbol].map(([symbol, id]) => [id, symbol]));
for (const row of existing) knownBySymbol.get(symbolByStockId.get(String(row.stock_id)))?.add(String(row.session_date));
const targets = symbols.filter((symbol) => stockIdBySymbol.has(symbol) && ['TWSE','TPEX'].includes(exchangeBySymbol.get(symbol))
  && ((knownBySymbol.get(symbol)?.size || 0) < 260 || !knownBySymbol.get(symbol)?.has(manifest.data.session_date)));
const availableAt = new Date().toISOString();
const acquiredPages = [];
let acquiredRows = 0;
let written = 0;
let duplicate = 0;
let writeQueue = Promise.resolve();
const requestState = new Map();

async function pacedOfficialFetch(sourceUrl) {
  const hostname = new URL(sourceUrl).hostname;
  const state = requestState.get(hostname) || { count: 0, nextAt: 0 };
  const intervalMs = hostname === 'www.twse.com.tw' ? 1_200 : 800;
  const burstPauseMs = hostname === 'www.twse.com.tw' ? 15_000 : 6_000;
  const waitMs = Math.max(0, state.nextAt - Date.now());
  if (waitMs > 0) await delay(waitMs);
  if (state.count > 0 && state.count % 10 === 0) await delay(burstPauseMs);
  state.count += 1;
  state.nextAt = Date.now() + intervalMs;
  requestState.set(hostname, state);
  const response = await fetch(sourceUrl, {
    headers: { accept: 'application/json', 'user-agent': 'StockInsider/2.1 official-operator-backfill' },
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!response?.ok) {
    state.nextAt = Date.now() + (hostname === 'www.twse.com.tw' ? 30_000 : 12_000);
    requestState.set(hostname, state);
  }
  return response;
}

function flushAcquiredPages() {
  const pages = acquiredPages.splice(0, 30);
  if (pages.length === 0) return writeQueue;
  writeQueue = writeQueue.then(async () => {
    const batchHash = sha256(JSON.stringify(pages));
    const response = await fetch(`${appUrl}/api/internal/official-price-backfill`, {
      method: 'POST', headers: { authorization: `Bearer ${internalKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ availableAt, batchHash, pages, source: 'official_exchange_operator_backfill_v1' }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok !== true) throw new Error(`backfill_write_failed:${response.status}:${body?.error || 'unknown'}`);
    written += Number(body.result.written || 0);
    duplicate += Number(body.result.duplicate || 0);
  });
  return writeQueue;
}

async function acquireExchange(exchange) {
  for (const [index, symbol] of targets.filter((value) => exchangeBySymbol.get(value) === exchange).entries()) {
    const known = knownBySymbol.get(symbol);
    for (let monthsBack = 0; monthsBack < 16 && (known.size < 260 || !known.has(manifest.data.session_date)); monthsBack += 1) {
      const month = monthCoordinates(manifest.data.session_date, monthsBack);
      const sourceUrl = exchange === 'TWSE'
        ? `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${month.compact}&stockNo=${symbol}`
        : `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${symbol}&date=${encodeURIComponent(month.slash)}&response=json`;
      let response;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        response = await pacedOfficialFetch(sourceUrl);
        if (response?.ok) break;
        await delay(1_000 * attempt);
      }
      if (!response?.ok) continue;
      const raw = await readResponseTextWithin(response, { timeoutMs: 15_000 }).catch(() => null);
      if (raw == null) continue;
      let payload;
      try { payload = JSON.parse(raw); } catch { continue; }
      const table = exchange === 'TWSE' ? payload.data : payload.tables?.[0]?.data;
      if (!Array.isArray(table)) continue;
      const responseSha256 = sha256(raw);
      let missingRows = 0;
      for (const row of table) {
        if (!Array.isArray(row)) continue;
        const date = session(row[0]);
        const volumeRaw = number(row[1]);
        const open = number(row[3]); const high = number(row[4]); const low = number(row[5]); const close = number(row[6]);
        if (!date || date > manifest.data.session_date || known.has(date) || [volumeRaw, open, high, low, close].some((value) => value == null)) continue;
        if (open <= 0 || high < Math.max(open, close) || low > Math.min(open, close)) continue;
        known.add(date);
        missingRows += 1;
      }
      if (missingRows > 0) {
        const normalizedUrl = exchange === 'TWSE' ? sourceUrl : sourceUrl.replace(encodeURIComponent(month.slash), month.slash);
        acquiredPages.push({ symbol, exchange, sourceUrl: normalizedUrl, responseText: raw, responseSha256 });
        acquiredRows += missingRows;
      }
    }
    await flushAcquiredPages();
    process.stdout.write(`${JSON.stringify({ exchange, symbol, completed: index + 1, coverage: known.size })}\n`);
  }
}

await Promise.all([acquireExchange('TWSE'), acquireExchange('TPEX')]);
while (acquiredPages.length > 0) await flushAcquiredPages();
await writeQueue;
const failedTargets = targets.filter((symbol) => (knownBySymbol.get(symbol)?.size || 0) < 240
  || !knownBySymbol.get(symbol)?.has(manifest.data.session_date));
process.stdout.write(`${JSON.stringify({ ok: failedTargets.length === 0, targets: targets.length, acquiredRows, written, duplicate, failedTargets })}\n`);
if (failedTargets.length > 0) process.exitCode = 1;
