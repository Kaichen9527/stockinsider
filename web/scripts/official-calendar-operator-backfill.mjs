import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { monthCoordinates, parseTpexTradingDates, parseTwseTradingDates, readResponseTextWithin } from './official-operator-utils.mjs';

const appUrl = String(process.env.OPERATOR_TUNNEL_URL || '').replace(/\/$/u, '');
const internalKey = process.env.INTERNAL_API_KEY || '';
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!internalKey || !supabaseUrl || !serviceKey) throw new Error('operator_calendar_environment_missing');
if (appUrl !== 'http://127.0.0.1:43100') throw new Error('operator_backfill_ssh_tunnel_required');

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function allSessions(market) {
  const values = new Set();
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase.from('tw_trading_sessions_v3').select('session_id').eq('market', market).eq('status', 'completed')
      .order('session_id', { ascending: false }).order('recorded_at', { ascending: false }).range(offset, offset + 999);
    if (result.error) throw new Error(`calendar_authority_read_failed:${market}:${result.error.message}`);
    for (const row of result.data || []) values.add(String(row.session_id));
    if ((result.data || []).length < 1000) return values;
  }
}

async function officialJson(url, hostDelayMs) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'StockInsider/2.1 official-calendar-operator' },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (response?.ok) {
      const text = await readResponseTextWithin(response, { timeoutMs: 15_000 }).catch(() => null);
      if (text != null) {
        try { return { payload: JSON.parse(text), responseText: text, responseSha256: createHash('sha256').update(text).digest('hex') }; } catch { /* retry a malformed official response */ }
      }
    }
    await delay(attempt * 2_000);
  }
  await delay(hostDelayMs);
  return null;
}

async function persistCalendarPages(pages, availableAt) {
  const batchHash = createHash('sha256').update(JSON.stringify(pages)).digest('hex');
  const response = await fetch(`${appUrl}/api/internal/official-calendar-backfill`, {
    method: 'POST', headers: { authorization: `Bearer ${internalKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ availableAt, batchHash, pages, source: 'official_calendar_operator_backfill_v1' }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true) throw new Error(`calendar_write_failed:${response.status}:${body?.error || 'unknown'}`);
  return body.result;
}

const manifest = await supabase.from('candidate_shadow_manifests').select('session_date').eq('policy_version', 'shadow-policy-v2')
  .order('frozen_at', { ascending: false }).limit(1).single();
if (manifest.error || !manifest.data) throw new Error(`manifest_unavailable:${manifest.error?.message || 'missing'}`);
const latestSession = String(manifest.data.session_date);
const availableAt = new Date().toISOString();
const twseDates = new Map();
const tpexDates = new Map();
let written = 0;
let duplicate = 0;
for (let monthsBack = 0; monthsBack < 67; monthsBack += 1) {
  const month = monthCoordinates(latestSession, monthsBack);
  const twseUrl = `https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date=${month.compact}&response=json`;
  const tpexUrl = `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingIndex?date=${month.slash}&response=json`;
  const [twse, tpex] = await Promise.all([officialJson(twseUrl, 1_200), officialJson(tpexUrl, 800)]);
  for (const date of twse ? parseTwseTradingDates(twse.payload) : []) if (date <= latestSession) twseDates.set(date, twseUrl);
  for (const date of tpex ? parseTpexTradingDates(tpex.payload) : []) if (date <= latestSession) tpexDates.set(date, tpexUrl);
  if (twse && tpex) {
    const result = await persistCalendarPages([
      { market: 'TWSE', sourceUrl: twseUrl, responseText: twse.responseText, responseSha256: twse.responseSha256 },
      { market: 'TPEX', sourceUrl: tpexUrl, responseText: tpex.responseText, responseSha256: tpex.responseSha256 },
    ], availableAt);
    written += Number(result.written || 0);
    duplicate += Number(result.duplicate || 0);
  }
  process.stdout.write(`${JSON.stringify({ month: month.key, twse: twseDates.size, tpex: tpexDates.size, written })}\n`);
  await delay(1_200);
}
const verifiedDates = [...twseDates.keys()].filter((date) => tpexDates.has(date)).sort().slice(-1320);
if (verifiedDates.length < 520 || verifiedDates.at(-1) !== latestSession) throw new Error(`official_calendar_coverage_incomplete:${verifiedDates.length}`);
const [existingTwse, existingTpex] = await Promise.all([allSessions('TWSE'), allSessions('TPEX')]);
process.stdout.write(`${JSON.stringify({ ok: existingTwse.size >= 520 && existingTpex.size >= 520, verifiedDates: verifiedDates.length, twseUnique: existingTwse.size, tpexUnique: existingTpex.size, written, duplicate })}\n`);
if (existingTwse.size < 520 || existingTpex.size < 520) process.exitCode = 1;
