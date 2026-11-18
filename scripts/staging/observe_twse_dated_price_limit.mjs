import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bindTwseLimitReplay, parseTwseLimitReplay, twseLimitReplayUrls } from '../../web/src/lib/vnext/launch-twse-daily-limit.ts';
import { decodeLicensedCsvRecords } from '../../web/src/lib/vnext/licensed-csv-decoder.ts';

const [session, symbol, ...extra] = process.argv.slice(2);
assert.ok(/^\d{4}-\d{2}-\d{2}$/u.test(session) && /^[1-9]\d{3}$/u.test(symbol) && !extra.length, 'expected trading day and TWSE ordinary-share control');
const urls = twseLimitReplayUrls(session);
const cutoff = session + 'T21:30:00+08:00';
const now = Date.now();
assert.ok(now >= Date.parse(session + 'T21:23:00+08:00') && now < Date.parse(session + 'T21:26:00+08:00'), 'outside actual observation window');
const directory = process.env.STATE_DIRECTORY;
assert.ok(directory?.startsWith('/var/lib/stockinsider-stage-twse-limit-'), 'isolated staging state directory required');

async function capture(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(18_000), redirect: 'error' });
  assert.equal(response.status, 200);
  assert.equal(response.url, url);
  assert.ok(response.body);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    assert.ok(bytes <= 512 * 1024);
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const observedAt = new Date().toISOString();
  const sha256 = createHash('sha256').update(body).digest('hex');
  // The recording clock marks when the in-memory bytes have been hashed.
  // Only the diagnostic receipt is persisted.
  const recordedAt = new Date().toISOString();
  return { url, body, bytes, sha256, observedAt, recordedAt };
}

const captures = await Promise.all([
  capture(urls.csv),
  capture(urls.json),
  capture('https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=open_data'),
]);
const [csv, report, quotes] = captures;
const token = parseTwseLimitReplay(session, symbol, csv, report);
const [header, ...rows] = decodeLicensedCsvRecords(new TextDecoder('utf-8', { fatal: true }).decode(quotes.body), 4001);
const columns = ['日期', '證券代號', '證券名稱', '成交股數', '成交金額', '開盤價', '最高價', '最低價', '收盤價', '漲跌價差', '成交筆數'];
assert.deepEqual(header, columns);
const rocSession = (Number(session.slice(0, 4)) - 1911).toString() + session.slice(5).replaceAll('-', '');
const current = rows.filter(row => row.length === columns.length && row[0] === rocSession && row[1] === symbol);
let diagnosticResult = null;
if (current.length === 1) {
  const values = [3, 5, 6, 7, 8].map(i => Number(current[0][i].replaceAll(',', '')));
  const [volume, open, high, low, close] = values;
  if (values.every(value => Number.isFinite(value) && value > 0) && high >= Math.max(open, close) && low <= Math.min(open, close)) {
    const selection = {
      history: { priceBasis: { anchorSession: session }, bars: [{ session, open, high, low, close, rawClose: close, volume }] },
      calendar: { status: 'validated_selected_window', sessions: [{ session, closeAt: session + 'T13:30:00+08:00' }] },
    };
    diagnosticResult = bindTwseLimitReplay(token, { exchange: 'TWSE', signalSession: session, symbol, cutoff }, selection);
  }
}

const checkedAt = new Date().toISOString();
assert.ok(Date.parse(checkedAt) < Date.parse(cutoff), 'no timely receipt after actual cutoff');
const receipt = {
  schema: 'stockinsider-actual-date-bound-limit-staging-v2', session, symbol, cutoff, checkedAt,
  captures: captures.map(({ url, bytes, sha256, observedAt, recordedAt }) => ({ url, bytes, sha256, observedAt, recordedAt })),
  diagnosticResult, rawBodiesPersisted: false, publicationAuthority: false,
};
const descriptor = openSync(join(directory, 'receipt.json'), 'wx', 0o600);
try {
  writeFileSync(descriptor, JSON.stringify(receipt) + '\n');
  fsyncSync(descriptor);
} finally {
  closeSync(descriptor);
}
const directoryDescriptor = openSync(directory, 'r');
try {
  fsyncSync(directoryDescriptor);
} finally {
  closeSync(directoryDescriptor);
}
assert.ok(Date.now() < Date.parse(cutoff), 'receipt completed after actual cutoff');
console.log('PRIVATE_LIMIT_RECEIPT_WRITTEN');
