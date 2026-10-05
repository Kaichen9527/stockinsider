import { open } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAX_BYTES = 4_000_000;
const MAX_TASKS = 32;
const BATCH_MS = 55_000;
const SYMBOL = /^\d{4}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(value)
  && Number.isFinite(Date.parse(value));
const exactSource = () => ({
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8' }).trim()),
});
function originUrl(origin) {
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')))
    throw new Error('monitor_controller_origin_invalid');
  return url;
}
async function jsonPost(url, body, key, timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 15_000)
    throw new Error('monitor_controller_transport_deadline');
  // Keep cancellation strongly reachable until the complete body is read.
  // An inline timeout signal may be collected once fetch returns its headers.
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('monitor_controller_transport_deadline')); }, timeoutMs);
  });
  // Race the awaited body itself: abort propagation alone can be lost by
  // transport internals after headers, even with a strongly held signal.
  const bounded = promise => Promise.race([promise, deadline]);
  try {
    const response = await bounded(fetch(url, { method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    const reader = response.body?.getReader();
    if (!reader) throw new Error('monitor_controller_response_missing');
    const parts = []; let bytes = 0;
    try {
      for (;;) {
        const item = await bounded(reader.read());
        if (item.done) break;
        bytes += item.value.byteLength;
        if (bytes > MAX_BYTES) { await bounded(reader.cancel()); throw new Error('monitor_controller_response_bound'); }
        parts.push(item.value);
      }
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
    // Never retain an arbitrary server error string (it may contain credentials).
    if (!response.ok) return { rejected: true, status: response.status };
    return { rejected: false, body: JSON.parse(Buffer.concat(parts).toString('utf8')) };
  } finally { clearTimeout(timer); }
}
export function validateMonitorWorklist(value, now) {
  if (!value || value.ok !== true || !instant(value.asOf) || !instant(now)
    || Date.parse(value.asOf) > Date.parse(now) || Date.parse(now) - Date.parse(value.asOf) > 120_000
    || !Number.isInteger(value.accountedTheses) || value.accountedTheses < 0 || value.accountedTheses > 20_000
    || !value.bookHeads || Object.keys(value.bookHeads).sort().join(',') !== 'conservative,growth'
    || Object.values(value.bookHeads).some(hash => hash !== null && (typeof hash !== 'string' || !HASH.test(hash)))
    || !Array.isArray(value.technicalSymbols) || value.technicalSymbols.length > 20_000
    || !Array.isArray(value.heldSymbols) || value.heldSymbols.length > 20_000
    || !Array.isArray(value.monthlyReviewsDue) || value.monthlyReviewsDue.length > value.accountedTheses)
    throw new Error('monitor_controller_worklist_invalid');
  const held = new Set(value.heldSymbols);
  if (held.size !== value.heldSymbols.length || [...held].some(symbol => typeof symbol !== 'string' || !SYMBOL.test(symbol)))
    throw new Error('monitor_controller_holdings_invalid');
  if (value.technicalSymbols.length > value.accountedTheses + held.size)
    throw new Error('monitor_controller_company_count_invalid');
  const symbols = new Set();
  const technicalSymbols = value.technicalSymbols.map(row => {
    if (!row || typeof row.symbol !== 'string' || !SYMBOL.test(row.symbol) || symbols.has(row.symbol)
      || typeof row.existingPaperPosition !== 'boolean' || typeof row.newEntryQualified !== 'boolean'
      || (!row.existingPaperPosition && !row.newEntryQualified) || row.existingPaperPosition !== held.has(row.symbol))
      throw new Error('monitor_controller_membership_invalid');
    symbols.add(row.symbol);
    return { symbol: row.symbol, existingPaperPosition: row.existingPaperPosition, newEntryQualified: row.newEntryQualified };
  }).sort((a, b) => Number(b.existingPaperPosition) - Number(a.existingPaperPosition) || a.symbol.localeCompare(b.symbol));
  if ([...held].some(symbol => !symbols.has(symbol))) throw new Error('monitor_controller_held_symbol_omitted');
  const due = new Set();
  const monthlyReviewsDue = value.monthlyReviewsDue.map(row => {
    if (!row || typeof row.symbol !== 'string' || !SYMBOL.test(row.symbol) || due.has(row.symbol)
      || typeof row.thesisRevisionId !== 'string' || !UUID.test(row.thesisRevisionId)
      || typeof row.articleRevisionId !== 'string' || !UUID.test(row.articleRevisionId)
      || !instant(row.nextReviewAt) || Date.parse(row.nextReviewAt) > Date.parse(value.asOf))
      throw new Error('monitor_controller_renewal_invalid');
    due.add(row.symbol);
    if (technicalSymbols.some(item => item.symbol === row.symbol && item.newEntryQualified))
      throw new Error('monitor_controller_expired_entry_conflict');
    return { symbol: row.symbol, thesisRevisionId: row.thesisRevisionId, articleRevisionId: row.articleRevisionId,
      nextReviewAt: row.nextReviewAt, disposition: 'independent_review_required' };
  }).sort((a, b) => a.symbol.localeCompare(b.symbol));
  return { asOf: value.asOf, bookHeads: { conservative: value.bookHeads.conservative, growth: value.bookHeads.growth },
    technicalSymbols, monthlyReviewsDue, accountedTheses: value.accountedTheses, heldSymbols: [...held].sort() };
}
function projectSnapshot(value, expectedSymbol, asOf, now) {
  const row = value?.decision;
  if (value?.ok !== true || typeof value.snapshotId !== 'string' || !UUID.test(value.snapshotId)
    || typeof value.idempotentReplay !== 'boolean' || !row || row.schemaVersion !== 'technical-monitoring-v1'
    || row.symbol !== expectedSymbol || !instant(row.observedAt) || Date.parse(row.observedAt) < Date.parse(asOf)
    || Date.parse(row.observedAt) > Date.parse(now) || !/^\d{4}-\d{2}-\d{2}$/u.test(row.marketSession)
    || row.marketSession > new Date(Date.parse(row.observedAt) + 8 * 3600_000).toISOString().slice(0, 10)
    || !HASH.test(row.marketDatasetHash) || !HASH.test(row.calendarHash) || !HASH.test(row.articleHash)
    || !HASH.test(row.reviewReceiptHash) || !UUID.test(row.thesisRevisionId) || !UUID.test(row.articleRevisionId)
    || !['pending_data', 'waiting', 'confirmed'].includes(row.signalState)
    || typeof row.entryResearchEligible !== 'boolean' || typeof row.monitorExistingPosition !== 'boolean'
    || !Array.isArray(row.blockers) || row.blockers.length > 30
    || row.blockers.some(code => typeof code !== 'string' || !/^[a-z0-9_:-]{1,120}$/u.test(code))
    || (row.entryResearchEligible && (row.signalState !== 'confirmed' || row.blockers.length !== 0)))
    throw new Error('monitor_controller_snapshot_binding_invalid');
  // Store only the bounded audit fields, never arbitrary upstream prose/values.
  return { snapshotId: value.snapshotId, idempotentReplay: value.idempotentReplay,
    observedAt: row.observedAt, marketSession: row.marketSession, articleHash: row.articleHash,
    thesisRevisionId: row.thesisRevisionId, articleRevisionId: row.articleRevisionId,
    reviewReceiptHash: row.reviewReceiptHash, marketDatasetHash: row.marketDatasetHash, calendarHash: row.calendarHash,
    signalState: row.signalState, entryResearchEligible: row.entryResearchEligible,
    monitorExistingPosition: row.monitorExistingPosition, blockers: row.blockers };
}

/** A bounded deterministic consumer. No model dispatch, renewal, paper-session,
 * strategy approval, caller-chosen stock subset or automatic retry is admitted. */
export async function monitorControllerCommand(args, dependencies = {}) {
  const [action, ...tail] = args;
  const flags = new Map();
  if (action !== 'batch' || tail.length !== 6) throw new Error('monitor_controller_arguments_invalid');
  for (let index = 0; index < tail.length; index += 2) {
    if (!['--origin', '--output', '--journal'].includes(tail[index]) || flags.has(tail[index]))
      throw new Error('monitor_controller_arguments_invalid');
    flags.set(tail[index], tail[index + 1]);
  }
  const origin = originUrl(flags.get('--origin'));
  const outputPath = flags.get('--output'); const journalPath = flags.get('--journal');
  if (!path.isAbsolute(outputPath || '') || !path.isAbsolute(journalPath || '') || outputPath === journalPath)
    throw new Error('monitor_controller_distinct_absolute_paths_required');
  const env = dependencies.env || process.env;
  const key = env.INTERNAL_API_KEY;
  if (typeof key !== 'string' || key.length < 16 || /\s/u.test(key)
    || [env.RESEARCH_TEST_KEY, env.RESEARCH_REVIEW_KEY, env.STRATEGY_APPROVAL_KEY, env.CRON_SECRET].includes(key))
    throw new Error('monitor_controller_distinct_writer_key_required');
  const source = (dependencies.source || exactSource)();
  if (source.dirty || !/^[a-f0-9]{40}$/u.test(source.commit)) throw new Error('monitor_controller_clean_source_required');
  const now = dependencies.now || (() => new Date().toISOString());
  const monotonic = dependencies.monotonic || (() => performance.now());
  const post = dependencies.post || jsonPost;
  const journal = await open(journalPath, 'wx', 0o600);
  let output; let pending = null;
  const log = async value => { await journal.writeFile(JSON.stringify(value) + '\n'); await journal.sync(); };
  const started = monotonic();
  const timeout = () => Math.min(15_000, Math.floor(BATCH_MS - (monotonic() - started)));
  try {
    output = await open(outputPath, 'wx', 0o600);
    pending = 'worklist';
    await log({ phase: 'request_pending', operation: pending, sourceCommit: source.commit, observedAt: now() });
    const firstTimeout = timeout();
    if (firstTimeout < 1000) {
      pending = null;
      await log({ phase: 'request_not_sent', operation: 'worklist', reason: 'batch_deadline', observedAt: now() });
      throw new Error('monitor_controller_batch_deadline');
    }
    const loaded = await post(new URL('/api/internal/research-monitor-worklist', origin).href, {}, key, firstTimeout);
    if (loaded.rejected) throw new Error('monitor_controller_worklist_rejected');
    const worklist = validateMonitorWorklist(loaded.body, now());
    const worklistHash = researchCanonicalHash(worklist);
    await log({ phase: 'worklist_verified', worklist, worklistHash, sourceCommit: source.commit, observedAt: now() });
    pending = null;
    const outcomes = [];
    let stopReason = null;
    for (const item of worklist.technicalSymbols) {
      if (outcomes.length >= MAX_TASKS || timeout() < 1000) { stopReason = outcomes.length >= MAX_TASKS ? 'batch_task_bound' : 'batch_deadline'; break; }
      pending = item.symbol;
      await log({ phase: 'request_pending', operation: 'technical_snapshot', symbol: item.symbol, worklistHash, observedAt: now() });
      const remaining = timeout();
      if (remaining < 1000) {
        pending = null; stopReason = 'batch_deadline';
        await log({ phase: 'request_not_sent', operation: 'technical_snapshot', symbol: item.symbol,
          worklistHash, reason: stopReason, observedAt: now() });
        break;
      }
      // Let the server reacquire current authority and thesis. Passing the older
      // worklist cutoff would conceal later invalidations or fresh acquisitions.
      const reply = await post(new URL('/api/internal/research-technical-snapshot', origin).href,
        { symbol: item.symbol }, key, remaining);
      const result = reply.rejected ? { symbol: item.symbol, status: 'server_rejected', httpStatus: reply.status }
        : { symbol: item.symbol, status: 'snapshot_saved', ...projectSnapshot(reply.body, item.symbol, worklist.asOf, now()) };
      await log({ phase: 'response_verified', result, worklistHash, observedAt: now() });
      outcomes.push(result); pending = null;
    }
    const attempted = new Set(outcomes.map(item => item.symbol));
    const deferred = worklist.technicalSymbols.filter(item => !attempted.has(item.symbol))
      .map(item => ({ symbol: item.symbol, existingPaperPosition: item.existingPaperPosition, reason: stopReason }));
    const receipt = { schemaVersion: 'research-monitor-batch-v1', sourceCommit: source.commit,
      worklistHash, worklistAsOf: worklist.asOf, observedAt: now(), totalSymbols: worklist.technicalSymbols.length,
      outcomes, deferred, monthlyReviewsDue: worklist.monthlyReviewsDue, allTechnicalSnapshotsSaved: deferred.length === 0
        && outcomes.every(item => item.status === 'snapshot_saved'),
      independentRenewalsPerformed: false, paperRiskProcessed: false, actualOrders: false,
      modelCalls: 0, automaticRetry: false, fairResumeImplemented: false };
    const saved = { ...receipt, receiptHash: researchCanonicalHash(receipt) };
    await log({ phase: 'batch_verified', saved, observedAt: now() });
    await output.writeFile(JSON.stringify(saved, null, 2) + '\n'); await output.sync();
    await log({ phase: 'response_saved', receiptHash: saved.receiptHash, observedAt: now() });
    return saved;
  } catch {
    await log({ phase: pending ? 'outcome_uncertain' : 'not_sent_or_destination_failed',
      operation: pending, observedAt: now(), automaticRetry: false });
    throw new Error(pending ? 'monitor_controller_outcome_uncertain_inspect_journal' : 'monitor_controller_output_unavailable');
  } finally { await output?.close(); await journal.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const receipt = await monitorControllerCommand(process.argv.slice(2));
    console.log(JSON.stringify({ receiptHash: receipt.receiptHash, totalSymbols: receipt.totalSymbols,
      attempted: receipt.outcomes.length, deferred: receipt.deferred.length,
      allTechnicalSnapshotsSaved: receipt.allTechnicalSnapshotsSaved, actualOrders: false }));
  } catch (error) { console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'monitor_controller_failed' })); process.exitCode = 1; }
}
