import { constants } from 'node:fs';
import { open, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';
import { assertSourcePacketBoundary } from '../web/src/lib/research-source-attempt-controller.ts';
import { validateResearchInboxItemAt } from '../web/src/lib/research-inbox.ts';
import { parseResearchPriorityScope } from '../web/src/lib/research-observed-priority.ts';
import { jsonPost } from './research-monitor-controller.mjs';

const MAX_BYTES = 2_000_000;
export function sourcePriorityScope(args) {
  const flags = new Map();
  if (![8, 10, 12].includes(args.length)) throw new Error('source_priority_arguments_invalid');
  for (let i = 0; i < args.length; i += 2) {
    if (!['--controller','--assessments','--origin','--journal','--scope','--snapshot-hash'].includes(args[i])
      || flags.has(args[i]) || typeof args[i + 1] !== 'string' || !args[i + 1])
      throw new Error('source_priority_arguments_invalid');
    flags.set(args[i], args[i + 1]);
  }
  if (!['--controller','--assessments','--origin','--journal'].every(flag => flags.has(flag)))
    throw new Error('source_priority_arguments_invalid');
  let scope;
  try {
    scope = parseResearchPriorityScope({
      ...(flags.has('--scope') ? { scope: flags.get('--scope') } : {}),
      ...(flags.has('--snapshot-hash') ? { snapshotHash: flags.get('--snapshot-hash') } : {}),
    });
  } catch { throw new Error('source_priority_scope_invalid'); }
  return { flags, scope };
}
function assertPriorityScope(body, scope) {
  if (scope.kind === 'research_observed_v1') {
    if (body?.scope !== scope.kind || body.snapshotHash !== scope.snapshotHash
      || body.scopeReceipt?.snapshotHash !== scope.snapshotHash
      || body.researchQualified !== false || body.strategyApproved !== false || body.entryEligible !== false)
      throw new Error('source_priority_response_scope_mismatch');
  } else if (body?.scope !== undefined && body.scope !== 'formal_v1' || body?.snapshotHash !== undefined) {
    throw new Error('source_priority_response_scope_mismatch');
  }
}
async function readJson(filename) {
  if (!path.isAbsolute(filename || '')) throw new Error('source_priority_absolute_path_required');
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > MAX_BYTES) throw new Error('source_priority_file_bound');
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (bytes.length !== before.size || before.ctimeMs !== after.ctimeMs || before.ino !== after.ino)
      throw new Error('source_priority_input_changed');
    return JSON.parse(bytes.toString('utf8'));
  } finally { await handle.close(); }
}
async function writeJson(filename, value) {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  if (Buffer.byteLength(bytes) > MAX_BYTES) throw new Error('source_priority_file_bound');
  const handle = await open(filename, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
function localOrigin(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
    || Number(url.port) < 1024 || Number(url.port) > 65535 || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) throw new Error('source_priority_loopback_required');
  return url;
}

/** Development-only loopback submission. Uncertain writes require reconciliation;
 * replaying a completed journal never calls either endpoint again. */
export async function sourcePriorityCommand(args, { env = process.env, post = jsonPost } = {}) {
  const { flags, scope } = sourcePriorityScope(args);
  const origin = localOrigin(flags.get('--origin'));
  const journal = flags.get('--journal');
  if (!path.isAbsolute(journal || '')) throw new Error('source_priority_absolute_path_required');
  const key = env.INTERNAL_API_KEY;
  if (typeof key !== 'string' || key.length < 16 || /\s/u.test(key)
    || [env.CRON_SECRET, env.RESEARCH_TEST_KEY, env.RESEARCH_REVIEW_KEY, env.STRATEGY_APPROVAL_KEY].includes(key))
    throw new Error('source_priority_distinct_local_key_required');
  const run = await readJson(flags.get('--controller'));
  const assessments = await readJson(flags.get('--assessments'));
  assertSourcePacketBoundary(assessments);
  const { runHash, ...unsigned } = run;
  if (runHash !== researchCanonicalHash(unsigned) || run.authoritativePublication !== false
    || run.strategyApproved !== false || !Array.isArray(run.inboxRequest?.items)
    || run.inboxRequest.items.length > 100 || !run.inboxRequest.items.every(item => validateResearchInboxItemAt(item, run.asOf))
    || !Array.isArray(run.priorityRequest?.sourceAttempts)
    || Object.keys(run.priorityRequest).some(key => !['asOf','sourceAttempts'].includes(key))
    || run.priorityRequest.asOf !== run.asOf || !Array.isArray(assessments) || assessments.length > 5000)
    throw new Error('source_priority_controller_binding_invalid');
  // Preserve existing formal journals; an observed run is separately bound to
  // its explicit immutable roster and cannot replay across scopes or snapshots.
  const observed = scope.kind === 'research_observed_v1' ? { scope: scope.kind, snapshotHash: scope.snapshotHash } : {};
  const inputHash = researchCanonicalHash({ runHash, assessments, origin: origin.toString(), ...observed });
  try { await mkdir(journal, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const directory = await open(journal, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
    const identity = await directory.stat();
    const anchored = `/proc/self/fd/${directory.fd}`;
    const attempt = await readJson(path.join(anchored, 'attempt.json'));
    if (attempt.inputHash !== inputHash) throw new Error('source_priority_replay_binding_mismatch');
    let result;
    try { result = await readJson(path.join(anchored, 'receipt.json')); }
    catch { throw new Error('source_priority_uncertain_submission'); }
    const { receiptHash, ...content } = result;
    if (result.inputHash !== inputHash || result.completed !== true || receiptHash !== researchCanonicalHash(content))
      throw new Error('source_priority_replay_receipt_invalid');
    assertPriorityScope(result.priority, scope);
    const visible = await lstat(journal);
    if (visible.isSymbolicLink() || visible.ino !== identity.ino || visible.dev !== identity.dev)
      throw new Error('source_priority_directory_changed');
    return { ...result, localJournalReplay: true };
    } finally { await directory.close(); }
  }
  const directory = await open(journal, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
  const identity = await directory.stat();
  const anchored = `/proc/self/fd/${directory.fd}`;
  const assertDirectory = async () => {
    const visible = await lstat(journal);
    if (visible.isSymbolicLink() || visible.ino !== identity.ino || visible.dev !== identity.dev)
      throw new Error('source_priority_directory_changed');
  };
  await assertDirectory();
  await writeJson(path.join(anchored, 'attempt.json'), {
    inputHash, controllerRunHash: runHash, ...observed, startedAt: new Date().toISOString(), developmentOnly: true,
  });
  await directory.sync();
  await assertDirectory();
  let inbox = { ok: true, accepted: 0, received: 0, revisions: [] };
  if (run.inboxRequest.items.length) {
    const result = await post(new URL('/api/internal/research-inbox', origin), run.inboxRequest, key, 15000);
    if (result.rejected || result.body?.ok !== true || result.body.received !== run.inboxRequest.items.length)
      throw new Error('source_priority_inbox_rejected_or_uncertain');
    inbox = result.body;
  }
  const priority = await post(new URL('/api/internal/research-priority-run', origin), {
    ...run.priorityRequest, assessments, ...observed,
  }, key, 15000);
  if (priority.rejected || priority.body?.ok !== true || !Array.isArray(priority.body.rows)
    || priority.body.rows.length !== priority.body.accountedCount || priority.body.expectedCount !== priority.body.accountedCount
    || !Array.isArray(priority.body.queue) || priority.body.queue.length > 20)
    throw new Error('source_priority_priority_rejected_or_uncertain');
  assertPriorityScope(priority.body, scope);
  const result = { inputHash, controllerRunHash: runHash, completed: true, completedAt: new Date().toISOString(),
    developmentOnly: true, ...observed, inbox, priority: priority.body, publication: false, strategyApproved: false,
    limitation: 'Explicit local run only; no automatic acquisition/dispatch or production acceptance.' };
  const receipt = { ...result, receiptHash: researchCanonicalHash(result) };
  await assertDirectory();
  await writeJson(path.join(anchored, 'receipt.json'), receipt);
  const persisted = await readJson(path.join(anchored, 'receipt.json'));
  if (researchCanonicalHash(persisted) !== researchCanonicalHash(receipt)) throw new Error('source_priority_receipt_changed');
  await directory.sync();
  await assertDirectory();
  return { ...receipt, localJournalReplay: false };
  } finally { await directory.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await sourcePriorityCommand(process.argv.slice(2));
    console.log(JSON.stringify({ completed: result.completed, localJournalReplay: result.localJournalReplay,
      receiptHash: result.receiptHash, accountedCount: result.priority.accountedCount, top20: result.priority.queue.map(row => row.symbol) }));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    console.error(JSON.stringify({ ok: false, error: /^source_priority_[a-z_]+$/u.test(message) ? message : 'source_priority_failed' }));
    process.exitCode = 1;
  }
}
