/** Offline replay of an explicitly supplied private PTT HTML artifact. No fetch,
 * source policy, database/writer, authorization or model operation is installed. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadActualPttCollector } from '../web/src/lib/ptt-collector-test-loader.mjs';
import { projectPttBodyObservation } from '../web/src/lib/ptt-article-parser.ts';

try {
  if (process.version !== 'v22.14.0' || process.argv.length !== 3) throw Error('input');
  const privateRoot = fs.realpathSync(path.resolve('work')) + path.sep;
  function privateFile(filename, limit, html = false) {
    if (typeof filename !== 'string' || !path.resolve(filename).startsWith(privateRoot) || (html && !filename.endsWith('.html'))) throw Error('input');
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd);
      const verifyTarget = () => {
        const target = fs.readlinkSync(`/proc/self/fd/${fd}`);
        if (!path.isAbsolute(target) || target.endsWith(' (deleted)') || !target.startsWith(privateRoot)) throw Error('input');
      };
      if (!stat.isFile() || stat.size > limit) throw Error('input');
      verifyTarget();
      const bytes = Buffer.alloc(limit + 1); let used = 0;
      while (used < bytes.length) {
        const count = fs.readSync(fd, bytes, used, bytes.length - used, null);
        if (count === 0) break;
        used += count;
      }
      if (used > limit) throw Error('input');
      verifyTarget();
      return bytes.subarray(0, used);
    } finally { fs.closeSync(fd); }
  }
  const manifest = JSON.parse(privateFile(process.argv[2], 32768).toString('utf8'));
  if (manifest.kind !== 'private-authorized-ptt-replay-v1' || !Array.isArray(manifest.cases) || manifest.cases.length < 1 || manifest.cases.length > 4 ||
      !Array.isArray(manifest.stockAuthority) || manifest.stockAuthority.length > 20) throw Error('input');
  const validSymbols = new Set(), stockNamesBySymbol = new Map(), aliasesBySymbol = new Map();
  for (const row of manifest.stockAuthority) {
    if (typeof row.symbol !== 'string' || !/^\d{4}$/u.test(row.symbol) || typeof row.name !== 'string' || row.name.length > 80) throw Error('input');
    validSymbols.add(row.symbol); stockNamesBySymbol.set(row.symbol, row.name);
  }
  const { projectPttCollectorArticle } = loadActualPttCollector();
  const rows = [];
  for (const item of manifest.cases) {
    if (typeof item.label !== 'string' || !/^[a-z0-9_-]{1,40}$/u.test(item.label) || typeof item.title !== 'string' || item.title.length > 512 ||
        typeof item.documentUrl !== 'string' || item.documentUrl.length > 2048 || typeof item.observedAt !== 'string' || typeof item.cutoff !== 'string') throw Error('input');
    const bytes = privateFile(item.htmlPath, 524288, true);
    const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const projected = projectPttCollectorArticle({ html, documentUrl: item.documentUrl, title: item.title, observedAt: item.observedAt,
      validSymbols, stockNamesBySymbol, aliasesBySymbol });
    const observation = projectPttBodyObservation(projected.provenance, item.documentUrl, item.observedAt, item.cutoff);
    rows.push({ label: item.label, htmlSha256: createHash('sha256').update(bytes).digest('hex'), parserVersion: projected.article.parserVersion,
      bodyStatus: projected.article.status, sourcePublishedAt: projected.article.sourcePublishedAt, clockConsistent: projected.article.clockConsistent,
      cleanBodySha256: projected.article.cleanBodySha256, bodySymbols: [...projected.bodyExtracted.symbols], observationStatus: observation.status,
      reason: observation.reason, researchAdmissionAuthority: false, instrumentQualificationAuthority: false, queue: 'blocked_existing_metadata_scope' });
  }
  process.stdout.write(JSON.stringify({ kind: 'ptt-private-artifact-replay-v1', source: 'explicit_private_input_only',
    stockAuthority: 'caller_supplied_not_listing_proof', coverage: 'unknown', actualRightsOrQueueAcceptance: false, rows }, null, 2) + '\n');
} catch {
  process.stderr.write('ptt_private_replay_refused\n'); process.exitCode = 1;
}
