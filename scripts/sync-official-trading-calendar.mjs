import { createHash } from 'node:crypto';

const appUrl = String(process.env.APP_URL || 'http://127.0.0.1:3100').replace(/\/$/u, '');
const internalApiKey = String(process.env.INTERNAL_API_KEY || '');
if (!internalApiKey) throw new Error('INTERNAL_API_KEY is required');

const MAX_PAGE_BYTES = 500_000;

function taipeiMonth(offset = 0) {
  const now = new Date();
  const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric' }).format(now));
  const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', month: '2-digit' }).format(now));
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function fetchOfficialPage(market, sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: { accept: 'application/json', 'user-agent': 'StockInsider/official-calendar-sync-v1' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${market}_official_calendar_http_${response.status}`);
  const responseText = await response.text();
  const bytes = Buffer.byteLength(responseText, 'utf8');
  if (bytes < 2 || bytes > MAX_PAGE_BYTES || /<html|<!doctype/iu.test(responseText)) {
    throw new Error(`${market}_official_calendar_payload_invalid`);
  }
  return {
    market,
    sourceUrl,
    responseText,
    responseSha256: createHash('sha256').update(responseText).digest('hex'),
  };
}

async function syncMonth(month) {
  const compact = month.replace('-', '');
  const pages = await Promise.all([
    fetchOfficialPage('TWSE', `https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date=${compact}01&response=json`),
    fetchOfficialPage('TPEX', `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingIndex?date=${month.replace('-', '/')}%2F01&response=json`),
  ]);
  const body = {
    availableAt: new Date().toISOString(),
    batchHash: createHash('sha256').update(JSON.stringify(pages)).digest('hex'),
    pages,
    source: 'official_calendar_operator_backfill_v1',
  };
  const response = await fetch(`${appUrl}/api/internal/official-calendar-backfill`, {
    method: 'POST',
    headers: { authorization: `Bearer ${internalApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw new Error(`official_calendar_sync_failed:${month}:${response.status}:${String(payload?.error || 'invalid_response')}`);
  }
  return { month, accepted: Number(payload.result?.accepted || 0), written: Number(payload.result?.written || 0), duplicate: Number(payload.result?.duplicate || 0) };
}

const results = [];
for (const month of [taipeiMonth(-1), taipeiMonth(0)]) results.push(await syncMonth(month));
process.stdout.write(`${JSON.stringify({ ok: true, months: results })}\n`);
