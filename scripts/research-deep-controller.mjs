import { open } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readResearchBoundedFile } from './research-bounded-file.mjs';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';
import { researchDeepInstant, validateResearchDeepClaimContext } from '../web/src/lib/research-deep-claim-context.ts';
import { validateResearchDeepAuthorInput } from '../web/src/lib/research-deep-author-input.ts';
import { jsonPost } from './research-monitor-controller.mjs';
import { privateDraftCommand } from './research-deep-draft-controller.mjs';

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
  const buffer = await readResearchBoundedFile(filename, { maximum: 131_072, minimum: 1, privateMode: true,
    absoluteError: 'deep_controller_recovery_journal_invalid', boundError: 'deep_controller_recovery_journal_invalid',
    changedError: 'deep_controller_recovery_journal_changed' });
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  if (!text.endsWith('\n')) throw new Error('deep_controller_recovery_journal_incomplete');
  const entries = text.trimEnd().split('\n').map(line => JSON.parse(line));
  const first = entries[0]; const request = first?.request;
  if (first?.phase !== 'request_pending' || !request || !['research-deep-request-v1','research-deep-request-v2'].includes(request.schemaVersion)
    || request.action !== 'claim' || request.workerOwner !== owner || request.origin !== origin
    || typeof request.claimId !== 'string' || !UUID.test(request.claimId)
    || request.owner !== `${owner}:${request.claimId}`
    || request.sourceCommit !== source || first.requestHash !== researchCanonicalHash(request)
    || Object.keys(request).sort().join(',') !== (request.schemaVersion==='research-deep-request-v2' ? 'action,claimId,observedAt,origin,owner,schemaVersion,scope,snapshotHash,sourceCommit,workerOwner' : 'action,claimId,observedAt,origin,owner,schemaVersion,sourceCommit,workerOwner')
    || request.schemaVersion==='research-deep-request-v2' && (request.scope!=='research_observed_v1' || !/^[a-f0-9]{64}$/u.test(request.snapshotHash || ''))
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
    observedAt: request.observedAt, ...(request.schemaVersion==='research-deep-request-v2' ? {scope:request.scope,snapshotHash:request.snapshotHash}:{}), ...(verified[0]?.saved?.context ? {context:verified[0].saved.context} : {}),
    ...(job ? { jobId: job.jobId, attempt: job.attempt } : {}) };
}

/** Claim/recover only. A durable lease context is neither a draft nor a model
 * dispatch, review, article submission, strategy approval or publication. */
export async function deepControllerCommand(args, dependencies = {}) {
  const [action, ...tail] = args;
  if(['draft','inspectDraft'].includes(action)) {
    try {return await privateDraftCommand(args,{source:(dependencies.source || exactSource)(),
      now:dependencies.now || (()=>new Date().toISOString()),recoverOriginal:recoveryRequest,checkpoint:dependencies.checkpoint});}
    catch(error) {throw new Error(error instanceof Error && /^deep_draft_[a-z_]+$/u.test(error.message)
      ? error.message : 'deep_draft_private_artifact_unavailable');}
  }
  const flags = new Map();
  const observedClaim=action==='claim' && tail.includes('--snapshot-hash');
  const names = action === 'claim' ? ['--origin', '--owner', '--output', '--journal',...(observedClaim ? ['--snapshot-hash']:[])]
    : action === 'recover' ? ['--origin', '--owner', '--output', '--journal', '--request-journal']
    : action === 'prepare' ? ['--origin', '--owner', '--output', '--journal', '--request-journal', '--bundle-id', '--source-ids'] : [];
  if (!names.length || tail.length !== names.length * 2) throw new Error('deep_controller_arguments_invalid');
  for (let i = 0; i < tail.length; i += 2) {
    if (!names.includes(tail[i]) || flags.has(tail[i])) throw new Error('deep_controller_arguments_invalid');
    flags.set(tail[i], tail[i + 1]);
  }
  if(observedClaim && !/^[a-f0-9]{64}$/u.test(flags.get('--snapshot-hash') || '')) throw new Error('deep_controller_scope_invalid');
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
  const recovered = ['recover', 'prepare'].includes(action)
    ? await recoveryRequest(flags.get('--request-journal'), owner, origin.href, source.commit) : null;
  if (action === 'prepare') return prepareInput(flags, { origin, owner, source, now, key, recovered, post: dependencies.post || jsonPost });
  const clock = now();
  if (!Number.isFinite(Date.parse(clock))) throw new Error('deep_controller_clock_invalid');
  const claimId = recovered?.claimId ?? (dependencies.claimId || randomUUID)();
  if (typeof claimId !== 'string' || !UUID.test(claimId)) throw new Error('deep_controller_claim_identity_invalid');
  // Reusing a stable worker label must never make an old lost response recover
  // a different, later claim. Only this original opaque owner is queried.
  const claimOwner = recovered?.owner ?? `${owner}:${claimId}`;
  const scopeFields = recovered?.scope ? {scope:recovered.scope,snapshotHash:recovered.snapshotHash} : observedClaim ? {scope:'research_observed_v1',snapshotHash:flags.get('--snapshot-hash')}:{};
  const request = { schemaVersion: scopeFields.scope ? 'research-deep-request-v2' : 'research-deep-request-v1', ...scopeFields, sourceCommit: source.commit,
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
    const body = action === 'claim' ? { action: 'claim', owner: claimOwner, ...scopeFields }
      : { action: 'status', owner: claimOwner, ...scopeFields, ...(recovered?.jobId ? { jobId: recovered.jobId, attempt: recovered.attempt } : {}) };
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
      { owner: claimOwner, ...scopeFields, ...(recovered?.jobId ? { jobId: recovered.jobId, attempt: recovered.attempt } : {}), now: now() });
    if (context && (researchDeepInstant(context.observedAt) > researchDeepInstant(now())
      || researchDeepInstant(now()) - researchDeepInstant(context.observedAt) > 120_000_000n)) throw new Error('deep_controller_response_clock_invalid');
    if (context === null && envelope.gap !== (action === 'claim' ? 'no_claimable_job' : 'no_active_owned_job'))
      throw new Error('deep_controller_missing_gap');
    if (context && envelope.gap !== null) throw new Error('deep_controller_context_gap_conflict');
    const receipt = { schemaVersion:scopeFields.scope ? 'research-deep-controller-receipt-v2':'research-deep-controller-receipt-v1', sourceCommit: source.commit,
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

async function prepareInput(flags, { origin, source, now, key, recovered, post }) {
  const bundleId = flags.get('--bundle-id') === 'none' ? null : flags.get('--bundle-id');
  const ids = flags.get('--source-ids') === 'none' ? [] : flags.get('--source-ids').split(',');
  if ((bundleId !== null && !UUID.test(bundleId)) || ids.length > 30
    || ids.some(id => !UUID.test(id)) || new Set(ids).size !== ids.length)
    throw new Error('deep_controller_input_selection_invalid');
  const scopeFields=recovered.scope ? {scope:recovered.scope,snapshotHash:recovered.snapshotHash}:{};
  const request = { ...scopeFields, action: 'prepare', originalRequestHash: recovered.originalRequestHash,
    sourceCommit: source.commit, owner: recovered.owner, origin: origin.href, observedAt: now(), bundleId, sourceDocumentIds: ids };
  const journal = await open(flags.get('--journal'), 'wx', 0o600); let output;
  const log = async row => { await journal.writeFile(JSON.stringify(row) + '\n'); await journal.sync(); };
  try {
    output = await open(flags.get('--output'), 'wx', 0o600);
    await log({ phase: 'input_pending', requestHash: researchCanonicalHash(request), request });
    const status = await post(new URL('/api/internal/research-deep-job', origin).href,
      { action: 'status', owner: recovered.owner, ...scopeFields, ...(recovered.jobId ? { jobId: recovered.jobId, attempt: recovered.attempt } : {}) }, key, 15_000);
    if (status.rejected || status.body?.ok !== true || status.body.gap !== null) throw new Error('input_status_unavailable');
    const context = validateResearchDeepClaimContext(status.body.context, { owner: recovered.owner, ...scopeFields,
      ...(recovered.jobId ? { jobId: recovered.jobId, attempt: recovered.attempt } : {}), now: now() });
    if (context.modelCompletion !== null) throw new Error('input_model_already_completed');
    const reply = await post(new URL('/api/internal/research-deep-job', origin).href, {
      action: 'input', owner: recovered.owner, ...scopeFields, jobId: context.job.jobId, attempt: context.job.attempt,
      reservationId: context.modelReservation.reservationId, bundleId, sourceDocumentIds: ids }, key, 15_000);
    if (reply.rejected || reply.body?.ok !== true) throw new Error('input_unavailable');
    const packet = validateResearchDeepAuthorInput(reply.body.packet, context, now());
    if ((packet.financial && packet.financial.bundleId !== bundleId)
      || packet.sources.some(s => !ids.includes(s.documentId))
      || packet.gaps.some(g => g.documentId !== undefined && !ids.includes(g.documentId))
      || ids.some(id => !packet.sources.some(s => s.documentId === id) && !packet.gaps.some(g => g.documentId === id))
      || bundleId !== null && !packet.financial && !packet.gaps.some(g => g.reason === 'dossier_missing'))
      throw new Error('input_selection_mismatch');
    const material = { schemaVersion:scopeFields.scope ? 'research-deep-prepared-input-v2':'research-deep-prepared-input-v1', sourceCommit: source.commit,
      requestHash: researchCanonicalHash(request), originalRequestHash: recovered.originalRequestHash, packet,
      preparedAt: now(), modelCalls: 0, modelDispatched: false, authoritativePublication: false };
    const saved = { ...material, receiptHash: researchCanonicalHash(material) };
    if (JSON.stringify(saved).includes(key)) throw new Error('input_credential_fragment');
    await output.writeFile(JSON.stringify(saved, null, 2) + '\n'); await output.sync();
    await log({ phase: 'input_saved', receiptHash: saved.receiptHash });
    return saved;
  } catch {
    await log({ phase: 'input_unavailable', automaticRetry: false, claimMutated: false });
    throw new Error('deep_controller_input_unavailable');
  } finally { await output?.close(); await journal.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await deepControllerCommand(process.argv.slice(2));
    console.log(JSON.stringify({ receiptHash: result.receiptHash, gap: result.gap ?? null, leaseRecovered: Boolean(result.context), inputPrepared: Boolean(result.packet),
      draftPersisted:Boolean(result.draftPersisted),handoffState:result.handoffState,leaseState:result.leaseState,
      modelDispatchable: false, authoritativePublication: false }));
  } catch (error) { console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'deep_controller_failed' })); process.exitCode = 1; }
}
