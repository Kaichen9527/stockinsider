#!/usr/bin/env node
/** Bounded, isolated staging collection. State contains receipt and the
 * minimum code-level reconciliation computed in memory from licensed data.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import {
  LISTED_ROSTER_REPLAY_SCHEMA, LISTED_ROSTER_SOURCES, analyzeListedRosterReplay,
} from '../src/lib/vnext/launch-listed-roster-replay.ts';

const TIMEOUT_MS = 20_000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function requestMode(args, now) {
  const [session, mode, ...extra] = args;
  if (extra.length || (mode !== '--live' && mode !== '--rehearsal') || !/^\d{4}-\d{2}-\d{2}$/.test(session ?? '')) {
    throw Error('arguments_invalid');
  }
  const day = new Date(session + 'T00:00:00Z');
  if (!Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== session) throw Error('session_invalid');
  const cutoff = session + 'T21:30:00+08:00';
  const rehearsal = mode === '--rehearsal';
  const start = Date.parse(session + 'T21:24:00+08:00');
  if (!rehearsal && (now < start || now > Date.parse(cutoff))) throw Error('live_window_closed');
  return { session, cutoff, rehearsal };
}

async function collect(source) {
  const requestedAt = new Date().toISOString();
  const result = { datasetId: source.datasetId, url: source.url, requestedAt };
  const fail = code => ({ receipt: { ...result, error: code } });
  try {
    const response = await fetch(source.url, {
      redirect: 'error', headers: { Accept: 'text/csv, application/csv' }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    result.httpStatus = response.status;
    const type = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    result.contentType = type ?? null;
    if (response.status !== 200 || response.url !== source.url || !['text/csv', 'application/csv'].includes(type)) {
      await response.body?.cancel();
      return fail('unexpected_response');
    }
    const reader = response.body?.getReader();
    if (!reader) return fail('body_missing');
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > source.maxBytes) {
        await reader.cancel();
        return fail('byte_limit');
      }
      chunks.push(value);
    }
    const receivedAt = new Date().toISOString();
    if (!size) return fail('body_missing');
    const bytes = Buffer.concat(chunks, size);
    const sha256 = hash(bytes);
    const path = `bodies/source-${source.datasetId}.csv`;
    const descriptor = { datasetId: source.datasetId, url: source.url, receivedAt, bytes: size, sha256,
      body: { encoding: 'file', path } };
    return { bytes, descriptor, receipt: { ...result, receivedAt, bytes: size, sha256 } };
  } catch {
    return fail('source_unavailable');
  }
}

async function main(args) {
  const { session, cutoff, rehearsal } = requestMode(args, Date.now());
  const base = process.env.STATE_DIRECTORY;
  if (!base || !isAbsolute(base) || basename(base) !== 'stockinsider-stage-listed-roster') throw Error('state_directory_invalid');
  const mode = rehearsal ? 'rehearsal' : 'live';
  const dir = join(base, rehearsal ? session + '-rehearsal-' + Date.now() : session);
  mkdirSync(dir, { mode: 0o700 });
  const captured = await Promise.all(LISTED_ROSTER_SOURCES.map(collect));
  const receipt = {
    schema: 'stockinsider-stage-listed-roster-capture-v1', mode, session, cutoff,
    sources: captured.map(item => item.receipt), replay: null, retainedProjectionSha256: null,
    registryWrite: false, rankingAuthority: false, eligibleForRosterReview: false,
  };
  if (captured.every(item => item.descriptor)) {
    try {
      const files = new Map(captured.map(item => [item.descriptor.body.path, item.bytes]));
      const { summary, reviews } = analyzeListedRosterReplay({
        schema: LISTED_ROSTER_REPLAY_SCHEMA, targetSession: session, cutoff,
        responses: captured.map(item => item.descriptor),
      }, files);
      receipt.replay = summary;
      if (!rehearsal && summary.sameSessionByCutoff && reviews && Date.now() <= Date.parse(cutoff)) {
        const projection = JSON.stringify({ schema: 'stockinsider-stage-listed-roster-review-v1', session, cutoff,
          sourceHashes: summary.receipts.map(source => source.sha256), venues: reviews }) + '\n';
        writeFileSync(join(dir, 'listing-review.json'), projection, { flag: 'wx', mode: 0o600 });
        receipt.retainedProjectionSha256 = hash(projection);
        receipt.eligibleForRosterReview = true;
      }
    } catch {
      receipt.failure = 'reconciliation_refused';
    }
  } else receipt.failure = 'incomplete_sources';
  receipt.finishedAt = new Date().toISOString();
  receipt.peakRssKiB = process.resourceUsage().maxRSS;
  writeFileSync(join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const { sources, replay, ...status } = receipt;
  process.stdout.write(JSON.stringify(status) + '\n');
  return receipt.failure || (!rehearsal && !receipt.eligibleForRosterReview) ? 2 : 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const code = ['arguments_invalid', 'session_invalid', 'live_window_closed', 'state_directory_invalid'].includes(error?.message)
    ? error.message : 'capture_refused';
  process.stderr.write(code + '\n');
  process.exitCode = 2;
}
