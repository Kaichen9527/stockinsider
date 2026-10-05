import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';
import { validateResearchDeepClaimContext } from '../web/src/lib/research-deep-claim-context.ts';
import { jsonPost } from './research-monitor-controller.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Reserve 37 characters for a unique claim identity within the API's 120 cap.
const OWNER = /^[A-Za-z0-9_:-]{3,83}$/u;
const SOURCE = /^[a-f0-9]{40}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const exactSource = () => ({
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8' }).trim()),
});
function originUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')))
    throw new Error('deep_controller_origin_invalid');
  return url;
}
async function recoveryRequest(filename, owner, origin, source) {
  // Read a bounded, original journal. Never follow a final-component symlink or
  // reinterpret a model-written packet as a claim request.
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > 131_072 || (before.mode & 0o077))
      throw new Error('deep_controller_recovery_journal_invalid');
    const buffer = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < buffer.length) {
      const part = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!part.bytesRead) break;
      offset += part.bytesRead;
    }
    const after = await handle.stat();
    const extra = await handle.read(Buffer.alloc(1), 0, 1, before.size);
    if (offset !== before.size || extra.bytesRead || before.size !== after.size || before.mtimeMs !== after.mtimeMs
      || before.ino !== after.ino || before.dev !== after.dev)
      throw new Error('deep_controller_recovery_journal_changed');
    const text = buffer.toString('utf8');
    if (!text.endsWith('\n')) throw new Error('deep_controller_recovery_journal_incomplete');
    const entries = text.trimEnd().split('\n').map(line => JSON.parse(line));
    const first = entries[0]; const request = first?.request;
    if (first?.phase !== 'request_pending' || !request || request.schemaVersion !== 'research-deep-request-v1'
      || request.action !== 'claim' || request.workerOwner !== owner || request.origin !== origin
      || typeof request.claimId !== 'string' || !UUID.test(request.claimId)
      || request.owner !== `${owner}:${request.claimId}`
      || request.sourceCommit !== source || first.requestHash !== researchCanonicalHash(request)
      || Object.keys(request).sort().join(',') !== 'action,claimId,observedAt,origin,owner,schemaVersion,sourceCommit,workerOwner'
      || !Number.isFinite(Date.parse(request.observedAt))) throw new Error('deep_controller_recovery_binding_invalid');
    const verified = entries.filter(row => row.phase === 'response_verified');
    if (verified.length > 1) throw new Error('deep_controller_recovery_journal_invalid');
    if (verified.length) {
      const { receiptHash, ...material } = verified[0].saved || {};
      if (material.requestHash !== first.requestHash || receiptHash !== researchCanonicalHash(material))
        throw new Error('deep_controller_recovery_receipt_invalid');
    }
    const job = verified[0]?.saved?.context?.job;
    if (job && (typeof job.jobId !== 'string' || !UUID.test(job.jobId)
      || !Number.isInteger(job.attempt) || job.attempt < 1 || job.attempt > 3))
      throw new Error('deep_controller_recovery_job_invalid');
    return { originalRequestHash: first.requestHash, owner: request.owner, claimId: request.claimId,
      ...(job ? { jobId: job.jobId, attempt: job.attempt } : {}) };
  } finally { await handle.close(); }
}

/** Claim/recover only. A durable lease context is neither a draft nor a model
 * dispatch, review, article submission, strategy approval or publication. */
export async function deepControllerCommand(args, dependencies = {}) {
  const [action, ...tail] = args;
  const flags = new Map();
  const names = action === 'claim' ? ['--origin', '--owner', '--output', '--journal']
    : action === 'recover' ? ['--origin', '--owner', '--output', '--journal', '--request-journal'] : [];
  if (!names.length || tail.length !== names.length * 2) throw new Error('deep_controller_arguments_invalid');
  for (let i = 0; i < tail.length; i += 2) {
    if (!names.includes(tail[i]) || flags.has(tail[i])) throw new Error('deep_controller_arguments_invalid');
    flags.set(tail[i], tail[i + 1]);
  }
  const origin = originUrl(flags.get('--origin')); const owner = flags.get('--owner');
  if (typeof owner !== 'string' || !OWNER.test(owner)) throw new Error('deep_controller_owner_invalid');
  const paths = names.filter(name => name.endsWith('journal') || name === '--output').map(name => flags.get(name));
  if (paths.some(value => !path.isAbsolute(value || '')) || new Set(paths.map(value => path.resolve(value))).size !== paths.length)
    throw new Error('deep_controller_distinct_absolute_paths_required');
  const env = dependencies.env || process.env; const key = env.INTERNAL_API_KEY;
  if (typeof key !== 'string' || key.length < 16 || /\s/u.test(key)
    || [env.RESEARCH_TEST_KEY, env.RESEARCH_REVIEW_KEY, env.STRATEGY_APPROVAL_KEY, env.CRON_SECRET].includes(key))
    throw new Error('deep_controller_distinct_writer_key_required');
  const source = (dependencies.source || exactSource)();
  if (source.dirty || !SOURCE.test(source.commit)) throw new Error('deep_controller_clean_source_required');
  const now = dependencies.now || (() => new Date().toISOString());
  const recovered = action === 'recover'
    ? await recoveryRequest(flags.get('--request-journal'), owner, origin.href, source.commit) : null;
  const clock = now();
  if (!Number.isFinite(Date.parse(clock))) throw new Error('deep_controller_clock_invalid');
  const claimId = recovered?.claimId ?? (dependencies.claimId || randomUUID)();
  if (typeof claimId !== 'string' || !UUID.test(claimId)) throw new Error('deep_controller_claim_identity_invalid');
  // Reusing a stable worker label must never make an old lost response recover
  // a different, later claim. Only this original opaque owner is queried.
  const claimOwner = recovered?.owner ?? `${owner}:${claimId}`;
  const request = { schemaVersion: 'research-deep-request-v1', sourceCommit: source.commit,
    origin: origin.href, workerOwner: owner, owner: claimOwner, claimId, action, observedAt: clock };
  const requestHash = researchCanonicalHash(request);
  const journal = await open(flags.get('--journal'), 'wx', 0o600);
  let output; let sending = false;
  const log = async row => { await journal.writeFile(JSON.stringify(row) + '\n'); await journal.sync(); };
  try {
    output = await open(flags.get('--output'), 'wx', 0o600);
    await log({ phase: 'request_pending', request, requestHash,
      originalRequestHash: recovered?.originalRequestHash ?? null });
    sending = true;
    const body = action === 'claim' ? { action: 'claim', owner: claimOwner }
      : { action: 'status', owner: claimOwner, ...(recovered?.jobId ? { jobId: recovered.jobId, attempt: recovered.attempt } : {}) };
    const reply = await (dependencies.post || jsonPost)(new URL('/api/internal/research-deep-job', origin).href, body, key, 15_000);
    if (reply.rejected) {
      // A claim may have committed before a server's context lookup failed.
      // Even a complete 409 reply must be recovered by status, never reclaimed.
      sending = action === 'claim';
      await log({ phase: 'server_rejected', httpStatus: reply.status, automaticRetry: false });
      throw new Error(action === 'claim' ? 'deep_controller_claim_uncertain' : 'deep_controller_server_rejected');
    }
    const envelope = reply.body;
    if (!envelope || envelope.ok !== true || !Object.hasOwn(envelope, 'context'))
      throw new Error('deep_controller_response_invalid');
    const context = envelope.context === null ? null : validateResearchDeepClaimContext(envelope.context,
      { owner: claimOwner, ...(recovered?.jobId ? { jobId: recovered.jobId, attempt: recovered.attempt } : {}), now: now() });
    if (context && (Date.parse(context.observedAt) > Date.parse(now())
      || Date.parse(now()) - Date.parse(context.observedAt) > 120_000)) throw new Error('deep_controller_response_clock_invalid');
    if (context === null && envelope.gap !== (action === 'claim' ? 'no_claimable_job' : 'no_active_owned_job'))
      throw new Error('deep_controller_missing_gap');
    if (context && envelope.gap !== null) throw new Error('deep_controller_context_gap_conflict');
    const receipt = { schemaVersion: 'research-deep-controller-receipt-v1', sourceCommit: source.commit,
      requestHash, originalRequestHash: recovered?.originalRequestHash ?? null, action,
      context, gap: context ? null : envelope.gap, observedAt: now(), modelDispatchable: false,
      modelCalls: 0, draftPersisted: false, authoritativePublication: false, strategyApproved: false,
      automaticRetry: false, recoveryMutatesLease: false };
    const saved = { ...receipt, receiptHash: researchCanonicalHash(receipt) };
    await log({ phase: 'response_verified', saved });
    await output.writeFile(JSON.stringify(saved, null, 2) + '\n'); await output.sync();
    await log({ phase: 'response_saved', receiptHash: saved.receiptHash });
    return saved;
  } catch (error) {
    await log({ phase: sending ? 'outcome_uncertain' : 'not_sent_or_server_rejected', automaticRetry: false });
    if (error?.message === 'deep_controller_server_rejected') throw error;
    throw new Error(sending ? 'deep_controller_outcome_uncertain_recover_status' : 'deep_controller_output_unavailable');
  } finally { await output?.close(); await journal.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await deepControllerCommand(process.argv.slice(2));
    console.log(JSON.stringify({ receiptHash: result.receiptHash, gap: result.gap, leaseRecovered: Boolean(result.context),
      modelDispatchable: false, authoritativePublication: false }));
  } catch (error) { console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'deep_controller_failed' })); process.exitCode = 1; }
}
