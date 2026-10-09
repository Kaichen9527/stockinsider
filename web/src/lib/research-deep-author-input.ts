import type { SupabaseClient } from '@supabase/supabase-js';
import { candidateDossierBundleId, candidateDossierInputHash, sanitizeRevisionScopedDossierEvidence } from './candidate-dossier-contract.ts';
import { researchCanonicalHash } from './research-agent-qualification.ts';
import { loadResearchDeepClaimContext, researchDeepInstant } from './research-deep-claim-context.ts';
import { ASSOCIATION_DOCUMENT_COLUMNS, documentInvariantProof } from './research-source-association.ts';
import { sanitizePublicSourceUrl } from './public-source-url.ts';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SOURCE_COLUMNS = `${ASSOCIATION_DOCUMENT_COLUMNS},summary`;
const MAX_BYTES = 1_048_576;
export type AuthorInputRequest = { owner: string; jobId: string; attempt: number; reservationId: string;
  bundleId: string | null; sourceDocumentIds: string[]; scope?: 'research_observed_v1'; snapshotHash?: string };
function ensure(ok: unknown): asserts ok { if (!ok) throw new Error('research_deep_input_invalid'); }
function row(value: unknown): Row { ensure(value && typeof value === 'object' && !Array.isArray(value)); return value as Row; }
function safeText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && !/\bBearer\s+\S+|-----BEGIN .*PRIVATE KEY-----|\b(?:password|api[_-]?key|access[_-]?token|cookie)\s*[:=]|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/iu.test(value);
}
function publicUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('https://') && sanitizePublicSourceUrl(value) === value;
}
export function parseAuthorInputRequest(value: unknown): AuthorInputRequest {
  const input = row(value);
  const observed = input.scope === 'research_observed_v1';
  ensure(Object.keys(input).sort().join(',') === (observed ? 'attempt,bundleId,jobId,owner,reservationId,scope,snapshotHash,sourceDocumentIds' : 'attempt,bundleId,jobId,owner,reservationId,sourceDocumentIds'));
  if(observed) ensure(typeof input.snapshotHash==='string' && /^[a-f0-9]{64}$/u.test(input.snapshotHash));
  ensure(typeof input.owner === 'string' && /^[A-Za-z0-9:_-]{3,120}$/u.test(input.owner)
    && typeof input.jobId === 'string' && UUID.test(input.jobId)
    && Number.isInteger(input.attempt) && Number(input.attempt) >= 1 && Number(input.attempt) <= 3
    && typeof input.reservationId === 'string' && UUID.test(input.reservationId)
    && (input.bundleId === null || typeof input.bundleId === 'string' && UUID.test(input.bundleId))
    && Array.isArray(input.sourceDocumentIds) && input.sourceDocumentIds.length <= 30
    && input.sourceDocumentIds.every(id => typeof id === 'string' && UUID.test(id))
    && new Set(input.sourceDocumentIds).size === input.sourceDocumentIds.length);
  return { owner: input.owner, jobId: input.jobId, attempt: input.attempt as number,
    reservationId: input.reservationId, bundleId: input.bundleId as string | null,
    sourceDocumentIds: [...input.sourceDocumentIds].sort(), ...(observed ? {scope:'research_observed_v1' as const,snapshotHash:input.snapshotHash as string}: {}) };
}

/** Trusted controller preparation only; never dispatches a model or writes. */
export async function loadResearchDeepAuthorInput(db: Pick<SupabaseClient, 'from' | 'rpc'>,
  request: AuthorInputRequest, options: { now?: () => string; timeoutMs?: number } = {}) {
  const input = parseAuthorInputRequest(request), now = options.now || (() => new Date().toISOString());
  const cutoff = now(); researchDeepInstant(cutoff);
  const abort = new AbortController(); let timer: ReturnType<typeof setTimeout>;
  let bytes = 0;
  const read = async (query: PromiseLike<{ data: unknown; error: unknown }>, max: number): Promise<Row[]> => {
    ensure(!abort.signal.aborted);
    const response = await query;
    ensure(!abort.signal.aborted && !response.error && Array.isArray(response.data) && response.data.length <= max);
    const size = Buffer.byteLength(JSON.stringify(response.data)); bytes += size;
    ensure(size <= MAX_BYTES && bytes <= 2 * MAX_BYTES);
    return response.data.map(row);
  };
  const active = async () => {
    ensure(!abort.signal.aborted);
    const context = await loadResearchDeepClaimContext(db, { owner: input.owner, jobId: input.jobId, attempt: input.attempt, scope:input.scope, snapshotHash:input.snapshotHash }, abort.signal);
    ensure(!abort.signal.aborted && context && context.modelCompletion === null
      && context.modelReservation.reservationId === input.reservationId);
    return context;
  };
  const execute = async () => {
    const context = await active();
    const runRows = await read(db.from('research_priority_runs_v1').select('run_id,as_of,input_hash')
      .eq('run_id', context.job.priorityRunId).limit(2).abortSignal(abort.signal), 2);
    ensure(runRows.length === 1 && runRows[0].run_id === context.job.priorityRunId
      && typeof runRows[0].input_hash === 'string' && /^[a-f0-9]{64}$/u.test(runRows[0].input_hash)
      && researchDeepInstant(runRows[0].as_of) <= researchDeepInstant(cutoff));
    if(context.schemaVersion==='research-deep-claim-context-v2') ensure(runRows[0].input_hash===context.researchIdentity.priorityInputHash && researchDeepInstant(runRows[0].as_of)===researchDeepInstant(context.researchIdentity.priorityAsOf));
    const gaps: Array<{ documentId?: string; reason: string }> = [];
    let financial: null | { bundleId: string; revisionId: string; inputHash: string; asOf: string; availableAt: string; facts: Row[] } = null;
    if (input.bundleId && context.schemaVersion==='research-deep-claim-context-v2') ensure(context.researchIdentity.stockId !== null);
    if (input.bundleId) {
      const bundles = await read(db.from('candidate_dossier_bundles')
        .select('bundle_id,revision_id,published_revision_id,input_hash,symbol,payload,queued_at')
        .eq('bundle_id', input.bundleId).eq('symbol', context.job.symbol).limit(2).abortSignal(abort.signal), 2);
      if (!bundles.length) gaps.push({ reason: 'dossier_missing' });
      else {
        ensure(bundles.length === 1); const bundle = bundles[0], payload = row(bundle.payload), detail = row(payload.detail);
        const facts = payload.facts; ensure(Array.isArray(facts) && facts.length <= 512);
        const stock = row(Array.isArray(detail.stocks) ? detail.stocks[0] : detail.stocks);
        ensure(bundle.bundle_id === input.bundleId && bundle.revision_id === bundle.published_revision_id
          && detail.id === bundle.revision_id && stock.symbol === context.job.symbol
          && candidateDossierInputHash(detail, facts.map(row)) === bundle.input_hash
          && candidateDossierBundleId(String(bundle.input_hash)) === bundle.bundle_id
          && researchDeepInstant(bundle.queued_at) <= researchDeepInstant(cutoff)
          && researchDeepInstant(detail.as_of) <= researchDeepInstant(detail.available_at)
          && researchDeepInstant(detail.available_at) <= researchDeepInstant(cutoff));
        ensure(typeof detail.stock_id === 'string' && UUID.test(detail.stock_id));
        if(context.schemaVersion==='research-deep-claim-context-v2') ensure(detail.stock_id===context.researchIdentity.stockId);
        const issuer = await read(db.from('stocks').select('id,symbol').eq('id', detail.stock_id)
          .eq('symbol', context.job.symbol).limit(2).abortSignal(abort.signal), 2);
        const published = await read(db.from('candidate_daily_stage_snapshots').select('detail_revision_id,stock_id,created_at')
          .eq('detail_revision_id', bundle.revision_id).eq('stock_id', detail.stock_id)
          .lte('created_at', cutoff).limit(1).abortSignal(abort.signal), 1);
        ensure(issuer.length === 1 && issuer[0].id === detail.stock_id && issuer[0].symbol === context.job.symbol
          && published.length === 1 && published[0].detail_revision_id === bundle.revision_id
          && published[0].stock_id === detail.stock_id && researchDeepInstant(published[0].created_at) <= researchDeepInstant(cutoff));
        const scoped = sanitizeRevisionScopedDossierEvidence(detail, facts.map(row));
        const numeric = scoped.facts.flatMap(fact => {
          if (!safeText(fact.fact_id, 160) || !safeText(fact.fact_key, 120) || !safeText(fact.unit, 60)
            || typeof fact.value !== 'number' || !Number.isFinite(fact.value) || !publicUrl(fact.source_url)) return [];
          const available = researchDeepInstant(fact.available_at), asOf = researchDeepInstant(fact.as_of);
          ensure(asOf <= available && available <= researchDeepInstant(detail.available_at));
          if (typeof fact.period_end !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(fact.period_end)
            || new Date(`${fact.period_end}T00:00:00Z`).toISOString().slice(0, 10) !== fact.period_end) return [];
          return [{ factId: fact.fact_id, key: fact.fact_key, periodEnd: fact.period_end, value: fact.value,
            unit: fact.unit, asOf: fact.as_of, availableAt: fact.available_at, sourceUrl: fact.source_url }];
        });
        if (numeric.length !== facts.length) gaps.push({ reason: 'dossier_facts_excluded' });
        if (!numeric.length) gaps.push({ reason: 'numeric_financial_facts_missing' });
        financial = { bundleId: input.bundleId, revisionId: String(bundle.revision_id), inputHash: String(bundle.input_hash),
          asOf: String(detail.as_of), availableAt: String(detail.available_at), facts: numeric };
      }
    } else gaps.push({ reason: 'dossier_not_selected' });
    const sources: Row[] = [];
    if (!input.sourceDocumentIds.length) gaps.push({ reason: 'sources_not_selected' });
    if (input.sourceDocumentIds.length) {
      const documents = await read(db.from('source_raw_documents').select(SOURCE_COLUMNS)
        .in('id', input.sourceDocumentIds).limit(31).abortSignal(abort.signal), 30);
      ensure(new Set(documents.map(d => d.id)).size === documents.length
        && documents.every(d => input.sourceDocumentIds.includes(String(d.id))));
      const heads = await read(db.rpc('research_evidence_heads_v1', { p_ids: input.sourceDocumentIds, p_cutoff: cutoff })
        .abortSignal(abort.signal), 30);
      for (const id of input.sourceDocumentIds) {
        const document = documents.find(d => d.id === id);
        const fail = (reason: string) => { gaps.push({ documentId: id, reason }); };
        if (!document) { fail('source_missing'); continue; }
        const checked = documentInvariantProof(document, cutoff), meta = row(document.metadata);
        if (!checked.proof) { fail(checked.gap!); continue; }
        const proof = { ...checked.proof, publishedAt: String(document.published_at),
          firstObservedAt: String(meta.first_observed_at), revisionObservedAt: String(meta.revision_observed_at),
          collectedAt: String(document.collected_at), availableAt: String(document.collected_at) };
        if (meta.acquisition_mode !== 'local_codex_research_inbox' || meta.content_form !== 'research_summary'
          || meta.content_hash !== document.canonical_content_hash
          || !safeText(document.summary, 600)) { fail('bounded_inbox_summary_required'); continue; }
        if (proof.subjectScope === 'company_mentions' && !proof.symbols.includes(context.job.symbol)) {
          fail('company_mismatch'); continue;
        }
        const times = [document.published_at, meta.first_observed_at, meta.revision_observed_at, document.collected_at, cutoff]
          .map(researchDeepInstant);
        if (times.some((time, i) => i > 0 && time < times[i - 1])) { fail('clock_invalid'); continue; }
        const head = heads.filter(h => h.id === id);
        if (head.length !== 1 || head[0].headId !== id || head[0].superseded !== false || head[0].retracted !== false) {
          fail('source_head_changed'); continue;
        }
        // Audit every visible canonical sibling, including legacy URL-only rows.
        const quote = (value: string) => `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;
        const pattern = `^${proof.rootId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(#si-revision-|$)`;
        const filter = `metadata->>canonical_url.eq.${quote(proof.rootId)},and(metadata->>canonical_url.is.null,document_url.match.${quote(pattern)})`;
        const siblings = await read(db.from('source_raw_documents').select(SOURCE_COLUMNS).or(filter)
          .lte('published_at', cutoff).lte('collected_at', cutoff).limit(50).abortSignal(abort.signal), 50);
        if (siblings.length === 50) { fail('source_history_saturated'); continue; }
        let conflict = false;
        for (const sibling of siblings) {
          const siblingMeta = row(sibling.metadata);
          const revised = researchDeepInstant(siblingMeta.revision_observed_at);
          if (revised > researchDeepInstant(cutoff)) { conflict = true; break; }
          if (revised < times[2]) continue;
          const siblingChecked = documentInvariantProof(sibling, cutoff).proof;
          const siblingClocks = [sibling.published_at, siblingMeta.first_observed_at, siblingMeta.revision_observed_at,
            sibling.collected_at, cutoff].map(researchDeepInstant);
          if (siblingClocks.some((time, i) => i > 0 && time < siblingClocks[i - 1])) { conflict = true; break; }
          const siblingProof = siblingChecked ? { ...siblingChecked, publishedAt: String(sibling.published_at),
            firstObservedAt: String(siblingMeta.first_observed_at), revisionObservedAt: String(siblingMeta.revision_observed_at),
            collectedAt: String(sibling.collected_at), availableAt: String(sibling.collected_at) } : null;
          if (!siblingProof || siblingProof.rootId !== proof.rootId || revised > times[2]
            || researchCanonicalHash({ proof: { ...siblingProof, documentId: null }, summary: sibling.summary })
              !== researchCanonicalHash({ proof: { ...proof, documentId: null }, summary: document.summary })) { conflict = true; break; }
        }
        if (!siblings.some(d => d.id === id) || conflict) { fail('source_conflicting_head'); continue; }
        sources.push({ ...proof, summary: document.summary, summaryHash: researchCanonicalHash(document.summary),
          companyEvidence: proof.subjectScope === 'company_mentions',
          publishable: proof.visibility === 'public' && proof.rightsBoundary === 'public_citation' });
      }
    }
    const current = await active();
    ensure(researchCanonicalHash({ job: context.job, model: context.modelReservation })
      === researchCanonicalHash({ job: current.job, model: current.modelReservation })
      && researchCanonicalHash(context) === researchCanonicalHash({...current,observedAt:context.observedAt}));
    const material = { schemaVersion: context.schemaVersion==='research-deep-claim-context-v2' ? 'research-deep-author-input-v2' : 'research-deep-author-input-v1', dataCutoff: cutoff,
      ...(context.schemaVersion==='research-deep-claim-context-v2' ? {researchIdentity:context.researchIdentity}:{}),
      discovery: { runId: context.job.priorityRunId, asOf: runRows[0].as_of, inputHash: runRows[0].input_hash },
      job: context.job, modelReservation: context.modelReservation, financial, sources, gaps,
      requiresIndependentReview: true, modelDispatched: false, authoritativePublication: false,
      sourceSelectionComplete: false, financialForecastComplete: false };
    ensure(Buffer.byteLength(JSON.stringify(material)) <= MAX_BYTES);
    return { ...material, inputHash: researchCanonicalHash(material) };
  };
  try {
    return await Promise.race([execute(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abort.abort(); reject(new Error('research_deep_input_timeout')); }, options.timeoutMs ?? 15_000);
    })]);
  } finally { clearTimeout(timer!); abort.abort(); }
}

/** Verify the server packet against the exact currently observed claim before
 * saving it as model input. This is not a signature or publication approval. */
export function validateResearchDeepAuthorInput(value: unknown,
  context: import('./research-deep-claim-context.ts').ResearchDeepClaimContext, now: string) {
  const packet = row(value);
  const observed=context.schemaVersion==='research-deep-claim-context-v2';
  ensure(Object.keys(packet).sort().join(',') === (observed ? 'authoritativePublication,dataCutoff,discovery,financial,financialForecastComplete,gaps,inputHash,job,modelDispatched,modelReservation,requiresIndependentReview,researchIdentity,schemaVersion,sourceSelectionComplete,sources' : 'authoritativePublication,dataCutoff,discovery,financial,financialForecastComplete,gaps,inputHash,job,modelDispatched,modelReservation,requiresIndependentReview,schemaVersion,sourceSelectionComplete,sources'));
  if(observed) ensure(researchCanonicalHash(packet.researchIdentity)===researchCanonicalHash(context.researchIdentity));
  ensure(packet.schemaVersion === (observed ? 'research-deep-author-input-v2' : 'research-deep-author-input-v1') && context.modelCompletion === null
    && packet.modelDispatched === false && packet.authoritativePublication === false
    && packet.requiresIndependentReview === true && packet.financialForecastComplete === false
    && packet.sourceSelectionComplete === false && typeof packet.inputHash === 'string'
    && researchDeepInstant(packet.dataCutoff) >= researchDeepInstant(context.modelReservation.startedAt)
    && researchDeepInstant(packet.dataCutoff) <= researchDeepInstant(now)
    && researchDeepInstant(now) - researchDeepInstant(packet.dataCutoff) <= BigInt(120_000_000)
    && researchDeepInstant(now) < researchDeepInstant(context.modelReservation.leaseExpiresAt)
    && researchCanonicalHash(packet.job) === researchCanonicalHash(context.job)
    && researchCanonicalHash(packet.modelReservation) === researchCanonicalHash(context.modelReservation));
  const { inputHash, ...material } = packet;
  ensure(inputHash === researchCanonicalHash(material) && Buffer.byteLength(JSON.stringify(packet)) <= MAX_BYTES);
  const discovery = row(packet.discovery);
  ensure(Object.keys(discovery).sort().join(',') === 'asOf,inputHash,runId'
    && discovery.runId === context.job.priorityRunId && typeof discovery.inputHash === 'string'
    && /^[a-f0-9]{64}$/u.test(discovery.inputHash)
    && researchDeepInstant(discovery.asOf) <= researchDeepInstant(packet.dataCutoff));
  if(observed) ensure(discovery.inputHash===context.researchIdentity.priorityInputHash && researchDeepInstant(discovery.asOf)===researchDeepInstant(context.researchIdentity.priorityAsOf));
  ensure(Array.isArray(packet.gaps) && packet.gaps.length <= 64 && packet.gaps.every(g => {
    const gap = row(g);
    return Object.keys(gap).every(key => ['documentId', 'reason'].includes(key))
      && typeof gap.reason === 'string' && /^[a-z_]{4,80}$/u.test(gap.reason)
      && (gap.documentId === undefined || typeof gap.documentId === 'string' && UUID.test(gap.documentId));
  }));
  ensure(Array.isArray(packet.sources) && packet.sources.length <= 30);
  for (const source of packet.sources) {
    const s = row(source);
    ensure(Object.keys(s).sort().join(',') === 'acquisitionMethod,availableAt,claimStatus,collectedAt,companyEvidence,contentForm,contentHash,documentId,firstObservedAt,platform,publishable,publishedAt,revisionObservedAt,rightsBoundary,rootId,subjectScope,summary,summaryHash,symbols,visibility'
      && typeof s.documentId === 'string' && UUID.test(s.documentId) && publicUrl(s.rootId)
      && safeText(s.summary, 600) && s.summaryHash === researchCanonicalHash(s.summary)
      && typeof s.contentHash === 'string' && /^[a-f0-9]{64}$/u.test(s.contentHash)
      && s.contentForm === 'research_summary' && safeText(s.platform, 80)
      && ['rumor', 'reported', 'confirmed'].includes(String(s.claimStatus))
      && Array.isArray(s.symbols) && s.symbols.length <= 12 && s.symbols.every(symbol => typeof symbol === 'string' && /^\d{4}$/u.test(symbol))
      && (s.subjectScope === 'company_mentions' ? s.companyEvidence === true && s.symbols.includes(context.job.symbol)
        : s.subjectScope === 'industry_context' && s.companyEvidence === false && s.symbols.length === 0));
    ensure(s.visibility === 'public' ? s.rightsBoundary === 'public_citation' && s.publishable === true
      && typeof s.acquisitionMethod === 'string' && ['public_document', 'publisher_transcript', 'user_authorized_document'].includes(s.acquisitionMethod)
      : s.visibility === 'authenticated_summary' && s.rightsBoundary === 'bounded_summary_only' && s.publishable === false
        && s.acquisitionMethod === 'authenticated_browser_summary');
    const clocks = [s.publishedAt, s.firstObservedAt, s.revisionObservedAt, s.collectedAt, packet.dataCutoff].map(researchDeepInstant);
    ensure(clocks.every((time, i) => i === 0 || time >= clocks[i - 1]) && s.availableAt === s.collectedAt);
  }
  ensure(new Set(packet.sources.map(s => row(s).documentId)).size === packet.sources.length);
  if (packet.financial !== null) {
    const f = row(packet.financial);
    ensure(Object.keys(f).sort().join(',') === 'asOf,availableAt,bundleId,facts,inputHash,revisionId'
      && typeof f.bundleId === 'string' && UUID.test(f.bundleId) && typeof f.revisionId === 'string' && UUID.test(f.revisionId)
      && typeof f.inputHash === 'string' && candidateDossierBundleId(f.inputHash) === f.bundleId
      && researchDeepInstant(f.asOf) <= researchDeepInstant(f.availableAt)
      && researchDeepInstant(f.availableAt) <= researchDeepInstant(packet.dataCutoff)
      && Array.isArray(f.facts) && f.facts.length <= 512);
    for (const fact of f.facts) {
      const x = row(fact);
      ensure(Object.keys(x).sort().join(',') === 'asOf,availableAt,factId,key,periodEnd,sourceUrl,unit,value'
        && safeText(x.factId, 160) && safeText(x.key, 120) && safeText(x.unit, 60) && publicUrl(x.sourceUrl)
        && typeof x.value === 'number' && Number.isFinite(x.value)
        && typeof x.periodEnd === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(x.periodEnd)
        && new Date(`${x.periodEnd}T00:00:00Z`).toISOString().slice(0, 10) === x.periodEnd
        && researchDeepInstant(x.asOf) <= researchDeepInstant(x.availableAt)
        && researchDeepInstant(x.availableAt) <= researchDeepInstant(f.availableAt));
    }
  }
  return packet;
}
