import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => index % 2 === 0 ? [...rows, [value, all[index + 1]]] : rows, []));
if (!args['--sessions'] || !args['--output']) throw new Error('usage: --sessions <json> --output <json>');
const input = JSON.parse(readFileSync(args['--sessions'], 'utf8'));
const sessions = Array.isArray(input?.result?.sessions) ? input.result.sessions.filter((date) => /^\d{4}-\d{2}-\d{2}$/u.test(date)).sort().slice(-520) : [];
if (sessions.length !== 520) throw new Error(`expected_520_sessions:${sessions.length}`);
const monthLastSession = new Map();
for (const session of sessions) monthLastSession.set(session.slice(0, 7), session);
const pages = [];
for (const [month, lastSession] of monthLastSession) {
  const requests = [
    ['TWSE', `https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date=${month.replace('-', '')}01&response=json`],
    ['TPEX', `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingIndex?date=${lastSession.replaceAll('-', '/')}&response=json`],
  ];
  for (const [market, sourceUrl] of requests) {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(20_000), headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`${market}_${month}_http_${response.status}`);
    const payload = await response.json();
    const responseSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    pages.push({ market, sourceUrl, payload, responseSha256 });
  }
}
const availableAt = new Date().toISOString();
const batches = [];
for (let offset = 0; offset < pages.length; offset += 12) {
  const batchPages = pages.slice(offset, offset + 12);
  batches.push({
    availableAt,
    batchHash: createHash('sha256').update(JSON.stringify(batchPages)).digest('hex'),
    pages: batchPages,
    source: 'official_exchange_index_backfill_v1',
  });
}
writeFileSync(args['--output'], `${JSON.stringify({ batches })}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ sessions: sessions.length, months: monthLastSession.size, pages: pages.length, batches: batches.length })}\n`);
