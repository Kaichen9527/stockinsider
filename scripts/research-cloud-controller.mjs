import { open } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readResearchBoundedFile } from './research-bounded-file.mjs';
import { createCloudWork, validateCloudWork, verifyCloudResult, cloudReservationWorkKey } from '../web/src/lib/research-cloud-work.ts';

const MAX_BYTES = 4_000_000;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const endpoint = (origin, route) => {
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')))
    throw new Error('cloud_controller_origin_invalid');
  return new URL(`/api/internal/${route}`, url).href;
};
async function readJson(filename) {
  const bytes = await readResearchBoundedFile(filename, { maximum: MAX_BYTES,
    absoluteError: 'cloud_controller_absolute_path_required', boundError: 'cloud_controller_input_bound',
    changedError: 'cloud_controller_input_changed' });
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
async function jsonPost(url, body, key) {
  const text = JSON.stringify(body);
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('cloud_controller_request_bound');
  // Keep cancellation strongly reachable until the complete body is read.
  // An inline timeout signal may be collected once fetch returns its headers.
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('cloud_controller_transport_deadline')); }, 15_000);
  });
  // Race the awaited body itself: abort propagation alone can be lost by
  // transport internals after headers, even with a strongly held signal.
  const bounded = promise => Promise.race([promise, deadline]);
  try {
    const response = await bounded(fetch(url, { method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: text }));
    const reader = response.body?.getReader();
    if (!reader) throw new Error('cloud_controller_response_missing');
    const parts = []; let bytes = 0;
    try {
      for (;;) {
        const chunk = await bounded(reader.read());
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BYTES) { await bounded(reader.cancel()); throw new Error('cloud_controller_response_bound'); }
        parts.push(chunk.value);
      }
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
    if (!response.ok) throw new Error('cloud_controller_server_rejected');
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally { clearTimeout(timer); }
}
const exactSource = () => ({
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8' }).trim()),
});

/** Credentials stay in this trusted process. There is no model dispatch,
 * publication, generic completion or automatic network retry in this adapter. */
export async function cloudControllerCommand(args, dependencies = {}) {
  const [action, ...tail] = args;
  const options = new Map();
  if (tail.length % 2) throw new Error('cloud_controller_arguments_invalid');
  for (let i = 0; i < tail.length; i += 2) {
    if (!['--origin', '--input', '--work', '--result', '--output', '--journal'].includes(tail[i]) || options.has(tail[i]))
      throw new Error('cloud_controller_arguments_invalid');
    options.set(tail[i], tail[i + 1]);
  }
  const names = action === 'reserve' ? ['--origin', '--input', '--output', '--journal']
    : action === 'accept' ? ['--origin', '--work', '--result', '--output', '--journal'] : [];
  if (!names.length || options.size !== names.length || names.some(name => !options.has(name)))
    throw new Error('cloud_controller_arguments_invalid');
  const route = action === 'reserve' ? 'research-model-reservation' : 'research-cloud-result';
  const url = endpoint(options.get('--origin'), route);
  const env = dependencies.env || process.env;
  const key = env.RESEARCH_TEST_KEY;
  if (typeof key !== 'string' || key.length < 16 || /[\r\n\s]/u.test(key)
    || [env.INTERNAL_API_KEY, env.CRON_SECRET, env.RESEARCH_REVIEW_KEY, env.STRATEGY_APPROVAL_KEY].includes(key))
    throw new Error('cloud_controller_distinct_tester_key_required');
  const post = dependencies.post || jsonPost;
  const now = dependencies.now || (() => new Date().toISOString());
  let work; let result; let workKey;
  if (action === 'reserve') {
    const input = await readJson(options.get('--input'));
    const clock = now();
    const probe = createCloudWork({ ...input, issuedAt: clock,
      deadlineAt: new Date(Date.parse(clock) + 1800_000).toISOString(), reservationId: randomUUID() });
    if (probe.kind !== 'deep_article_validation' || probe.dataScope !== 'research_snapshot')
      throw new Error('cloud_controller_live_validation_only');
    const source = (dependencies.source || exactSource)();
    if (source.dirty || source.commit !== probe.sourceCommit) throw new Error('cloud_controller_exact_clean_source_required');
    work = probe; workKey = cloudReservationWorkKey(probe);
  } else {
    work = validateCloudWork(await readJson(options.get('--work')));
    result = await readJson(options.get('--result'));
    if (work.kind !== 'deep_article_validation' || work.dataScope !== 'research_snapshot')
      throw new Error('cloud_controller_live_validation_only');
    // The receiver distinguishes a late first submission from a durable replay.
    // Bind the artifact locally at its completion, never manufacture acceptance.
    verifyCloudResult(work, result, result.completedAt);
    if (Date.parse(result.completedAt) > Date.parse(now())) throw new Error('cloud_controller_future_result');
    workKey = cloudReservationWorkKey(work);
  }
  const outputPath = options.get('--output'); const journalPath = options.get('--journal');
  if (![outputPath, journalPath].every(value => path.isAbsolute(value || ''))
    || new Set([...options.values()].filter(value => path.isAbsolute(value))).size !== options.size - 1)
    throw new Error('cloud_controller_distinct_absolute_paths_required');
  // Both destinations must be exclusively owned before making any mutation.
  const journal = await open(journalPath, 'wx', 0o600);
  let output;
  const log = async value => { await journal.writeFile(JSON.stringify(value) + '\n'); await journal.sync(); };
  let sending = false;
  try {
    output = await open(outputPath, 'wx', 0o600);
    await log({ phase: 'request_pending', action, workKey, workHash: action === 'accept' ? work.workHash : null, observedAt: now() });
    sending = true;
    const reply = await post(url, action === 'reserve'
      ? { action: 'reserve', role: work.role, owner: work.owner, workKey } : { work, result }, key);
    if (!reply || reply.ok !== true) throw new Error('cloud_controller_response_invalid');
    let saved;
    if (action === 'reserve') {
      const row = reply.reservation;
      if (row === null && reply.blockedReason === 'global_lease_or_daily_budget_exhausted') {
        await log({ phase: 'blocked', reason: 'global_lease_or_daily_budget_exhausted', observedAt: now() });
        return { prepared: false, blockedReason: 'global_lease_or_daily_budget_exhausted', automaticRetry: false };
      }
      if (!row || row.role !== work.role || row.owner !== work.owner || row.work_key !== workKey)
        throw new Error('cloud_controller_reservation_binding_invalid');
      const { schemaVersion: _schema, workHash: _hash, ...payload } = work;
      saved = createCloudWork({ ...payload, reservationId: row.reservation_id, issuedAt: row.started_at, deadlineAt: row.lease_expires_at });
      if (cloudReservationWorkKey(saved) !== workKey || Date.parse(saved.issuedAt) > Date.parse(now())
        || Date.parse(saved.deadlineAt) <= Date.parse(now())) throw new Error('cloud_controller_reservation_clock_invalid');
    } else {
      const expected = verifyCloudResult(work, result, result.completedAt);
      if (reply.authoritativePublication !== false || reply.strategyApproved !== false
        || typeof reply.idempotentReplay !== 'boolean' || !reply.handoff
        || Object.keys(expected).some(name => name !== 'receivedAt' && reply.handoff[name] !== expected[name])
        || !Number.isFinite(Date.parse(reply.handoff.receivedAt))
        || Date.parse(reply.handoff.receivedAt) < Date.parse(result.completedAt)
        || Date.parse(reply.handoff.receivedAt) > Date.parse(now())) throw new Error('cloud_controller_acceptance_binding_invalid');
      saved = { ok: true, handoff: { ...expected, receivedAt: reply.handoff.receivedAt },
        idempotentReplay: reply.idempotentReplay, authoritativePublication: false, strategyApproved: false };
    }
    // If destination persistence fails after a successful mutation, this fsynced
    // original packet/receipt lets an operator recover without reserving again.
    await log({ phase: 'response_verified', saved, observedAt: now() });
    await output.writeFile(JSON.stringify(saved, null, 2) + '\n'); await output.sync();
    await log({ phase: 'response_saved', workHash: action === 'reserve' ? saved.workHash : work.workHash,
      reservationId: action === 'reserve' ? saved.reservationId : work.reservationId, observedAt: now() });
    return { prepared: action === 'reserve', receiptSaved: action === 'accept', workKey,
      authoritativePublication: false, strategyApproved: false, automaticRetry: false };
  } catch {
    await log({ phase: sending ? 'outcome_uncertain' : 'not_sent', observedAt: now(), automaticRetry: false });
    throw new Error(sending ? 'cloud_controller_outcome_uncertain_inspect_journal' : 'cloud_controller_output_unavailable');
  } finally { await output?.close(); await journal.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await cloudControllerCommand(process.argv.slice(2)))); }
  catch (error) { console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'cloud_controller_failed' })); process.exitCode = 1; }
}
