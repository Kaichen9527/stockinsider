import { createHash } from 'node:crypto';
import { stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { compareLaunchDispositionReports, DISPOSITION_RANGE_MAX_BYTES, launchDispositionRangeUrl } from '../web/src/lib/vnext/launch-disposition-range.ts';
import { launchDispositionSource } from '../web/src/lib/vnext/launch-disposition-status.ts';

const [day, ...extra] = process.argv.slice(2);
if (!day || extra.length) throw Error('expected_a_single_taipei_date');
const cutoff = day + 'T21:30:00+08:00';
const archive = process.env.STATE_DIRECTORY;
if (archive) {
  const expected = '/var/lib/stockinsider-stage-disposition-range-' + day.replaceAll('-', '');
  if (archive !== expected || !/^\/var\/lib\/stockinsider-stage-disposition-range-\d{8}$/u.test(archive)) {
    throw Error('private_disposition_stage_directory_required');
  }
  const details = await stat(archive);
  if (!details.isDirectory() || (details.mode & 0o077) !== 0 || details.uid !== process.getuid()) {
    throw Error('private_disposition_stage_directory_required');
  }
}

async function retain(name, content) {
  if (!archive) return;
  const target = await open(join(archive, name), 'wx', 0o600);
  try {
    await target.writeFile(content);
    await target.sync();
  } finally {
    await target.close();
  }
  const directory = await open(archive, 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

async function capture(name, url, maxBytes, mediaType) {
  const response = await fetch(url, {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== 200 || response.redirected || new URL(response.url).href !== new URL(url).href
    || !mediaType.test(response.headers.get('content-type') || '') || !response.body) {
    throw Error('official_disposition_response_unavailable');
  }
  const declaredSize = response.headers.get('content-length');
  if (declaredSize !== null && (!/^\d+$/u.test(declaredSize) || Number(declaredSize) > maxBytes)) {
    throw Error('official_disposition_response_too_large');
  }
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw Error('official_disposition_response_too_large');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const observedAt = new Date().toISOString();
  const body = Buffer.concat(chunks, size);
  await retain(name, body);
  return { url, body, sha256: createHash('sha256').update(body).digest('hex'), observedAt, recordedAt: new Date().toISOString() };
}

const rows = await Promise.all(['TWSE', 'TPEX'].map(async market => {
  const licensedSource = launchDispositionSource(market, market === 'TWSE' ? day : undefined);
  const [range, licensed] = await Promise.all([
    capture(market + '-effective-range.json', launchDispositionRangeUrl(market, day), DISPOSITION_RANGE_MAX_BYTES, /^application\/json(?:;|$)/iu),
    capture(market + '-notice.csv', licensedSource.url, licensedSource.maxBytes, /^(?:text|application)\/csv(?:;|$)/iu),
  ]);
  const evidence = compareLaunchDispositionReports(market, range, { ...licensed, datasetId: licensedSource.datasetId }, day, cutoff);
  const { restrictedSymbols, ...rangeSummary } = evidence.report;
  return { market, range: { ...rangeSummary, fourDigitSymbols: restrictedSymbols.size },
    licensed: evidence.corroboration, reportsAgree: evidence.reportsAgree, timelyOnThisReplay: evidence.confirmed };
}));

const receipt = JSON.stringify({ schemaVersion: 'launch-disposition-range-replay-v1', day, cutoff,
  archivedInStaging: Boolean(archive), durableWriterReceipt: false, rankingAuthority: false, sources: rows }, null, 2);
await retain('sanitized-receipt.json', receipt + '\n');
console.log(receipt);
