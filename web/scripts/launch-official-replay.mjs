#!/usr/bin/env node
/** OFFLINE exchange-source staging replay. No fetch/DB/writer/download. No
 * rights inferred. Output contains receipts/counts/gaps, never raw bodies. */
import fs from 'node:fs';
import { parseMarketFlowPairReplay, parseTpexMarketFlowReplay, MARKET_FLOW_PAIR_SCHEMA, TPEX_MARKET_FLOW_MAX_BYTES, TPEX_MARKET_FLOW_SCHEMA, TWSE_MARKET_FLOW_MAX_BYTES } from '../src/lib/vnext/launch-market-foreign-flow.ts';
import path from 'node:path';
import { LISTED_ROSTER_MAX_BYTES, LISTED_ROSTER_REPLAY_SCHEMA, LISTED_ROSTER_TOTAL_BYTES, parseListedRosterReplay } from '../src/lib/vnext/launch-listed-roster-replay.ts';
import { parseLaunchOfficialReplay, parseLaunchLicensedCsvReplay, LICENSED_CSV_SCHEMA, officialReplayObservationPlan } from '../src/lib/vnext/launch-official-replay.ts';
import { parseTpexNativeShareReplay, NATIVE_SHARE_SCHEMA } from '../src/lib/vnext/launch-native-volume.ts';
import { parseTpexInstitutionalVolumeReplay, INSTITUTIONAL_VOLUME_SCHEMA } from '../src/lib/vnext/launch-institutional-volume.ts';
import { parseTpexBreadthReplay, BREADTH_REPLAY_SCHEMA, parseTwseHistoricalCloseReplay, TWSE_CLOSE_REPLAY_SCHEMA } from '../src/lib/vnext/launch-breadth-replay.ts';

try {
  const args = process.argv.slice(2);
  if (process.version !== 'v22.14.0' || args.length !== 4 || args[0] !== '--root' || !['--manifest', '--receipt'].includes(args[2])) throw Error('input');
  const workRoot = fs.realpathSync(path.resolve('work')) + path.sep;
  const allowed = fs.realpathSync(path.resolve(args[1]));
  const rootStat = fs.statSync(allowed);
  if (!allowed.startsWith(workRoot) || !rootStat.isDirectory() || (rootStat.mode & 0o077) !== 0) throw Error('input');
  const prefix = allowed + path.sep;
  function privateFile(filename, limit) {
    const absolute = path.resolve(filename);
    if (!absolute.startsWith(prefix)) throw Error('input');
    let current = allowed;
    for (const segment of path.relative(allowed, absolute).split(path.sep)) {
      current = path.join(current, segment);
      if (fs.lstatSync(current).isSymbolicLink()) throw Error('input');
    }
    const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const stat = fs.fstatSync(fd);
      const verifyTarget = () => {
        const target = fs.readlinkSync(`/proc/self/fd/${fd}`);
        if (!path.isAbsolute(target) || target.endsWith(' (deleted)') || !target.startsWith(prefix)) throw Error('input');
      };
      if (!stat.isFile() || stat.size > limit) throw Error('input');
      verifyTarget();
      const bound = Math.min(limit, stat.size), bytes = Buffer.alloc(bound + 1); let used = 0;
      while (used < bytes.length) {
        const count = fs.readSync(fd, bytes, used, bytes.length - used, null);
        if (!count) break;
        used += count;
      }
      if (used > bound || fs.fstatSync(fd).size !== stat.size) throw Error('input');
      verifyTarget(); return bytes.subarray(0, used);
    } finally { fs.closeSync(fd); }
  }
  const manifestPath = path.resolve(args[3]);
  const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(privateFile(manifestPath, args[2] === '--receipt' ? 1048576 : 160 * 1024 * 1024)));
  if (args[2] === '--receipt') process.stdout.write(JSON.stringify(officialReplayObservationPlan(input)) + '\n');
  else {
    const nativeShares = input?.schema === NATIVE_SHARE_SCHEMA;
    const institutionalVolume = input?.schema === INSTITUTIONAL_VOLUME_SCHEMA;
    const breadth = input?.schema === BREADTH_REPLAY_SCHEMA;
    const twseClose = input?.schema === TWSE_CLOSE_REPLAY_SCHEMA;
    const marketFlow = input?.schema === TPEX_MARKET_FLOW_SCHEMA;
    const pairedMarketFlow = input?.schema === MARKET_FLOW_PAIR_SCHEMA;
    const listedRoster = input?.schema === LISTED_ROSTER_REPLAY_SCHEMA;
    const limits = listedRoster ? { pages: 3, pageBytes: LISTED_ROSTER_MAX_BYTES, totalBytes: LISTED_ROSTER_TOTAL_BYTES }
      : pairedMarketFlow ? { pages: 10, pageBytes: Math.max(TWSE_MARKET_FLOW_MAX_BYTES, TPEX_MARKET_FLOW_MAX_BYTES), totalBytes: 5 * (TWSE_MARKET_FLOW_MAX_BYTES + TPEX_MARKET_FLOW_MAX_BYTES) }
      : marketFlow ? { pages: 5, pageBytes: TPEX_MARKET_FLOW_MAX_BYTES, totalBytes: 5 * TPEX_MARKET_FLOW_MAX_BYTES }
      : breadth || twseClose ? { pages: 30, pageBytes: 500000, totalBytes: 15000000 }
      : institutionalVolume ? { pages: 21, pageBytes: 3 * 1024 * 1024, totalBytes: 64 * 1024 * 1024 }
      : nativeShares ? { pages: 57, pageBytes: 500000, totalBytes: 32 * 1024 * 1024 }
        : { pages: 68, pageBytes: 5000000, totalBytes: 112 * 1024 * 1024 };
    const files = new Map(); let total = 0;
    const descriptors = [...(Array.isArray(input.responses) ? input.responses : []), ...(Array.isArray(input.schemaEvidence) ? input.schemaEvidence : [])];
    if (descriptors.length > limits.pages) throw Error('input');
    for (const descriptor of descriptors) {
      const body = descriptor?.body;
      if (body?.encoding !== 'file') continue;
      if (typeof body.path !== 'string' || !/^bodies\/[A-Za-z0-9_./-]+$/.test(body.path) || body.path.split('/').some(p => !p || p === '.' || p === '..') || files.has(body.path)) throw Error('input');
      const member = privateFile(path.resolve(path.dirname(manifestPath), body.path), limits.pageBytes);
      if (member.byteLength !== descriptor.bytes || (total += member.byteLength) > limits.totalBytes) throw Error('input');
      files.set(body.path, member);
    }
    const read = listedRoster ? parseListedRosterReplay(input, files)
      : pairedMarketFlow ? parseMarketFlowPairReplay(input, files)
      : marketFlow ? parseTpexMarketFlowReplay(input, files)
      : twseClose ? parseTwseHistoricalCloseReplay(input, files) : breadth ? parseTpexBreadthReplay(input, files) : institutionalVolume ? parseTpexInstitutionalVolumeReplay(input, files) : nativeShares ? parseTpexNativeShareReplay(input, files)
      : input?.schema === LICENSED_CSV_SCHEMA ? parseLaunchLicensedCsvReplay(input, files) : parseLaunchOfficialReplay(input, files);
    process.stdout.write(JSON.stringify(read) + '\n');
  }
} catch {
  process.stderr.write('official_exchange_replay_refused\n'); process.exitCode = 1;
}
