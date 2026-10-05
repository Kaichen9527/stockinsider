import type { SupabaseClient } from '@supabase/supabase-js';
import { researchCanonicalHash } from './research-agent-qualification.ts';
import { discoveryInstant } from './research-discovery-evidence.ts';
import { sanitizePublicSourceUrl } from './public-source-url.ts';
import { hasDirectCompanyMentionScope } from './research-source-roots.ts';

type Row = Record<string, unknown>;
export const ASSOCIATION_POLICY = 'industry-association-receipt-v1';
export const ASSOCIATION_LIMITS = Object.freeze({ perCompany: 3, perRun: 50, basisPerAssociation: 12,
  uniqueDocuments: 100, readBatch: 50, rootRows: 50, responseBytes: 131_072, totalBytes: 2_097_152, deadlineMs: 15_000 });
export const ASSOCIATION_DOCUMENT_COLUMNS = 'id,platform,document_url,published_at,collected_at,symbols,metadata,canonical_content_hash,content_semantics';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[0-9a-f]{64}$/u;
const keys = ['relation', 'sourceDocumentId', 'sourceContentHash', 'sourceRootId', 'hypothesis', 'rationale',
  'companyBasisDocumentIds', 'strongestCounterEvidence', 'associatedAt'];
export type IndustryAssociationInput = {
  relation: 'industry_hypothesis'; sourceDocumentId: string; sourceContentHash: string; sourceRootId: string;
  hypothesis: string; rationale: string; companyBasisDocumentIds: string[]; strongestCounterEvidence: string;
  /** Writer's claimed authoring time; never an authority for historical availability. */
  associatedAt: string;
};
export type AssociationDocumentProof = {
  documentId: string; contentHash: string; rootId: string; platform: string; subjectScope: string; symbols: string[];
  publishedAt: string; firstObservedAt: string; revisionObservedAt: string; collectedAt: string; availableAt: string;
  visibility: 'public' | 'authenticated_summary'; rightsBoundary: 'public_citation' | 'bounded_summary_only';
  acquisitionMethod: string; contentForm: string; claimStatus: string;
};
export type IndustryAssociationReceipt = IndustryAssociationInput & {
  policyVersion: typeof ASSOCIATION_POLICY; symbol: string; status: 'hypothesis';
  hypothesisOrigin: 'authenticated_research_submission';
  dataCutoff: string; researchObservedAt: string; availableAt: string; usableAtCutoff: false;
  evidenceStatus: 'needs_evidence' | 'awaiting_independent_review' | 'needs_update' | 'invalidated' | 'unavailable';
  source: AssociationDocumentProof | null; companyBasis: AssociationDocumentProof[];
  gaps: string[]; hasResearchCue: boolean; rankingInfluence: false; directSourceContribution: 0; associationHash: string;
};
export type AssociationRequests = Map<string, IndustryAssociationInput[]>;
function row(value: unknown): value is Row { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown, max: number) {
  return typeof value === 'string' && value === value.trim() && value.length >= 4 && value.length <= max
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && !/\bBearer\s+\S{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b(?:password|api[_-]?key|access[_-]?token|cookie)\s*[:=]\s*\S+/iu.test(value);
}
function cleanUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('https:') && sanitizePublicSourceUrl(value) === value;
}
/** Parse before any database access. Bounds count raw submissions, even duplicates. */
export function parseIndustryAssociations(assessments: Array<{ symbol: string; associations?: unknown }>, cutoff: string): AssociationRequests {
  if (!discoveryInstant(cutoff)) throw new Error('research_association_request_invalid');
  const parsed: AssociationRequests = new Map(); const ids = new Set<string>(); let total = 0;
  for (const assessment of assessments) {
    if (assessment.associations === undefined) continue;
    if (!/^\d{4}$/u.test(assessment.symbol) || parsed.has(assessment.symbol) || !Array.isArray(assessment.associations)
      || assessment.associations.length > ASSOCIATION_LIMITS.perCompany) throw new Error('research_association_request_invalid');
    total += assessment.associations.length;
    if (total > ASSOCIATION_LIMITS.perRun) throw new Error('research_association_request_bound_exceeded');
    const unique = new Map<string, IndustryAssociationInput>();
    for (const item of assessment.associations) {
      if (!row(item) || Object.keys(item).length !== keys.length || Object.keys(item).some((key) => !keys.includes(key))
        || item.relation !== 'industry_hypothesis' || typeof item.sourceDocumentId !== 'string' || !UUID.test(item.sourceDocumentId)
        || typeof item.sourceContentHash !== 'string' || !HASH.test(item.sourceContentHash) || !cleanUrl(item.sourceRootId)
        || !text(item.hypothesis, 600) || !text(item.rationale, 600) || !text(item.strongestCounterEvidence, 600)
        || !discoveryInstant(item.associatedAt) || Date.parse(String(item.associatedAt)) > Date.parse(cutoff)
        || !Array.isArray(item.companyBasisDocumentIds) || item.companyBasisDocumentIds.length > ASSOCIATION_LIMITS.basisPerAssociation
        || item.companyBasisDocumentIds.some((id) => typeof id !== 'string' || !UUID.test(id))
        || new Set(item.companyBasisDocumentIds.map((id) => String(id).toLowerCase())).size !== item.companyBasisDocumentIds.length) {
        throw new Error('research_association_request_invalid');
      }
      const input: IndustryAssociationInput = { relation: 'industry_hypothesis', sourceDocumentId: item.sourceDocumentId.toLowerCase(),
        sourceContentHash: item.sourceContentHash, sourceRootId: item.sourceRootId,
        hypothesis: String(item.hypothesis), rationale: String(item.rationale), strongestCounterEvidence: String(item.strongestCounterEvidence),
        companyBasisDocumentIds: item.companyBasisDocumentIds.map((id) => String(id).toLowerCase()).sort(),
        associatedAt: new Date(String(item.associatedAt)).toISOString() };
      ids.add(input.sourceDocumentId); input.companyBasisDocumentIds.forEach((id) => ids.add(id));
      unique.set(researchCanonicalHash(input), input);
    }
    parsed.set(assessment.symbol, [...unique.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value));
  }
  if (ids.size > ASSOCIATION_LIMITS.uniqueDocuments) throw new Error('research_association_request_bound_exceeded');
  return parsed;
}

function metadata(document: Row): Row | null { return row(document.metadata) ? document.metadata : null; }
function canonical(document: Row): string | null {
  const meta = metadata(document); if (!meta) return null;
  const url = meta.canonical_url ?? String(document.document_url || '').split('#si-revision-')[0];
  return cleanUrl(url) ? url : null;
}
function revision(document: Row): string | null {
  const value = metadata(document)?.revision_observed_at ?? document.collected_at;
  return discoveryInstant(value) ? new Date(String(value)).toISOString() : null;
}
function identity(document: Row) {
  const meta = metadata(document) || {};
  // Mirrors SQL's separate insider identity namespace; a malformed identity is never treated as null.
  return row(meta.insider_evidence) ? meta.insider_evidence.identity ?? null : meta.insider_evidence == null ? null : '__invalid__';
}
/** SQL #>> returns null for absent/scalar/array insider metadata. Keep those rows in the audit. */
function sqlIdentity(document: Row) {
  const meta = metadata(document);
  return meta && row(meta.insider_evidence) ? meta.insider_evidence.identity ?? null : null;
}
function sqlCanonical(document: Row) {
  return metadata(document)?.canonical_url ?? String(document.document_url || '').split('#si-revision-')[0];
}
function versionSignature(document: Row) {
  const meta = metadata(document) || {};
  return researchCanonicalHash({ hash: document.canonical_content_hash ?? null, metadataHash: meta.content_hash ?? null,
    timedExcerpts: meta.timed_excerpts ?? null, symbols: document.symbols ?? null,
    published: document.published_at ?? null, first: meta.first_observed_at ?? null,
    semantics: document.content_semantics ?? null, scope: meta.subject_scope === undefined ? 'company_mentions' : meta.subject_scope,
    claim: meta.claim_status ?? null, retracted: meta.retracted_at ?? null, parent: meta.parent_source_url ?? null,
    rights: meta.rights_boundary ?? null, visibility: meta.visibility ?? null,
    acquisition: meta.acquisition_method ?? null, contentForm: meta.content_form ?? null });
}
/** Shared invariants for both the requested document and every latest sibling. */
function documentInvariantProof(document: Row, cutoff: string): { proof: AssociationDocumentProof | null; gap: string | null } {
  const fail = (gap: string) => ({ proof: null, gap }); const meta = metadata(document); const root = canonical(document);
  if (!meta || !root || typeof document.id !== 'string' || !UUID.test(document.id)
    || typeof document.canonical_content_hash !== 'string' || !HASH.test(document.canonical_content_hash)
    || meta.content_hash != null && meta.content_hash !== document.canonical_content_hash
    || typeof document.platform !== 'string' || !/^[a-z][a-z0-9_]{1,79}$/u.test(document.platform)
    || identity(document) !== null) return fail('identity_invalid');
  const expectedRevisionUrl = `${root}#si-revision-${document.canonical_content_hash.slice(0, 16)}`;
  if (document.document_url !== root && document.document_url !== expectedRevisionUrl) return fail('identity_invalid');
  const clocks = [document.published_at, meta.first_observed_at, meta.revision_observed_at, document.collected_at];
  if (!clocks.every(discoveryInstant)) return fail('clock_invalid');
  const [published, first, revised, collected] = clocks.map((value) => Date.parse(String(value)));
  if (!(published <= first && first <= revised && revised <= collected)) return fail('clock_invalid');
  if (collected > Date.parse(cutoff)) return fail('future_at_cutoff');
  if (meta.retracted_at != null) return fail('retracted');
  if (meta.claim_status === 'denied') return fail('denied');
  if (meta.parent_source_url != null && meta.parent_source_url !== root) return fail('parent_unresolved');
  if (!['rumor', 'reported', 'confirmed'].includes(String(meta.claim_status))) return fail('claim_status_invalid');
  if (document.content_semantics !== 'editorial_discussion' || !['research_summary', 'transcript_excerpt'].includes(String(meta.content_form))) return fail('substantive_content_missing');
  const publicRights = meta.visibility === 'public' && meta.rights_boundary === 'public_citation'
    && ['public_document', 'publisher_transcript', 'user_authorized_document'].includes(String(meta.acquisition_method));
  const summaryRights = meta.visibility === 'authenticated_summary' && meta.rights_boundary === 'bounded_summary_only'
    && meta.acquisition_method === 'authenticated_browser_summary' && meta.content_form === 'research_summary'
    && (meta.timed_excerpts == null || Array.isArray(meta.timed_excerpts) && meta.timed_excerpts.length === 0);
  if (!publicRights && !summaryRights) return fail('rights_invalid');
  if (!Array.isArray(document.symbols) || document.symbols.length > 12
    || document.symbols.some((symbol) => typeof symbol !== 'string' || !/^\d{4}$/u.test(symbol))
    || new Set(document.symbols).size !== document.symbols.length) return fail('symbols_invalid');
  const scope = meta.subject_scope === undefined ? 'company_mentions' : meta.subject_scope;
  if (scope !== 'company_mentions' && scope !== 'industry_context') return fail('scope_invalid');
  if (scope === 'industry_context' ? document.symbols.length !== 0 : document.symbols.length === 0) return fail('symbols_scope_invalid');
  return { gap: null, proof: { documentId: document.id, contentHash: document.canonical_content_hash, rootId: root,
    platform: document.platform, subjectScope: scope, symbols: [...document.symbols].sort(),
    publishedAt: new Date(published).toISOString(), firstObservedAt: new Date(first).toISOString(),
    revisionObservedAt: new Date(revised).toISOString(), collectedAt: new Date(collected).toISOString(), availableAt: new Date(collected).toISOString(),
    visibility: meta.visibility as AssociationDocumentProof['visibility'], rightsBoundary: meta.rights_boundary as AssociationDocumentProof['rightsBoundary'],
    acquisitionMethod: String(meta.acquisition_method), contentForm: String(meta.content_form), claimStatus: String(meta.claim_status) } };
}
function documentProof(document: Row, head: Row | undefined, cutoff: string,
  conflict: string | undefined): { proof: AssociationDocumentProof | null; gap: string | null } {
  const checked = documentInvariantProof(document, cutoff);
  if (!checked.proof) return checked;
  if (head?.retracted === true) return { proof: null, gap: 'retracted' };
  if (!head || head.headId == null) return { proof: null, gap: 'head_missing' };
  if (head.headId !== document.id || head.superseded === true) return { proof: null, gap: 'superseded' };
  return conflict ? { proof: null, gap: conflict } : checked;
}

/** No fetching, body text, scoring or writes. Every submitted association receives a server-bound receipt. */
export async function loadIndustryAssociations(db: Pick<SupabaseClient, 'from' | 'rpc'>, requests: AssociationRequests,
  dataCutoff: string, serverClock: string, options: { deadlineMs?: number } = {}): Promise<Map<string, IndustryAssociationReceipt[]>> {
  if (!discoveryInstant(serverClock) || !discoveryInstant(dataCutoff) || Date.parse(serverClock) < Date.parse(dataCutoff)) {
    throw new Error('research_association_clock_invalid');
  }
  // Revalidate at this exported trust boundary, not just the HTTP parser.
  const inputs = parseIndustryAssociations([...requests].map(([symbol, associations]) => ({ symbol, associations })), dataCutoff);
  const ids = [...new Set([...inputs.values()].flat().flatMap((input) => [input.sourceDocumentId, ...input.companyBasisDocumentIds]))].sort();
  const documents = new Map<string, Row>(); const heads = new Map<string, Row>(); const conflicts = new Map<string, string>();
  const documentGaps = new Map<string, string>();
  const controller = new AbortController(); const deadline = Math.min(options.deadlineMs ?? ASSOCIATION_LIMITS.deadlineMs, ASSOCIATION_LIMITS.deadlineMs);
  let bytes = 0; let readFailure: string | null = null; let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('read_deadline')); }, Math.max(1, deadline)); });
  async function read(query: PromiseLike<{ data: unknown; error: unknown }>, maximum: number): Promise<Row[]> {
    if (controller.signal.aborted) throw new Error('read_deadline');
    const result = await Promise.race([query, expired]);
    if (result.error || !Array.isArray(result.data) || result.data.length > maximum || result.data.some((item) => !row(item))) throw new Error('read_failed');
    const size = Buffer.byteLength(JSON.stringify(result.data)); bytes += size;
    if (size > ASSOCIATION_LIMITS.responseBytes || bytes > ASSOCIATION_LIMITS.totalBytes) throw new Error('read_bound_exceeded');
    return result.data as Row[];
  }
  try {
    for (let start = 0; start < ids.length; start += ASSOCIATION_LIMITS.readBatch) {
      const batch = ids.slice(start, start + ASSOCIATION_LIMITS.readBatch);
      const found = await read(db.from('source_raw_documents').select(ASSOCIATION_DOCUMENT_COLUMNS)
        .in('id', batch).limit(batch.length).abortSignal(controller.signal), batch.length);
      for (const document of found) {
        if (!batch.includes(String(document.id)) || documents.has(String(document.id))) throw new Error('read_identity_mismatch');
        documents.set(String(document.id), document);
      }
      const latest = await read(db.rpc('research_evidence_heads_v1', { p_ids: batch, p_cutoff: dataCutoff })
        .abortSignal(controller.signal), batch.length);
      for (const head of latest) {
        if (!batch.includes(String(head.id)) || heads.has(String(head.id)) || typeof head.retracted !== 'boolean'
          || typeof head.superseded !== 'boolean' || head.headId !== null && (typeof head.headId !== 'string' || !UUID.test(head.headId))) throw new Error('read_identity_mismatch');
        heads.set(String(head.id), head);
      }
    }
    // SQL picks one deterministic head even when same-clock siblings contradict it.
    // Audit bounded canonical + legacy fallback rows, not the 14-day discovery window.
    const roots = [...new Set([...documents.values()].map(canonical).filter((value): value is string => Boolean(value)))].sort();
    for (const root of roots) {
      const quote = (value: string) => `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;
      const pattern = `^${root.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(#si-revision-|$)`;
      const filter = `metadata->>canonical_url.eq.${quote(root)},and(metadata->>canonical_url.is.null,document_url.match.${quote(pattern)})`;
      const siblingsRead = await read(db.from('source_raw_documents').select(ASSOCIATION_DOCUMENT_COLUMNS)
        .or(filter)
        .lte('published_at', dataCutoff).lte('collected_at', dataCutoff).order('collected_at', { ascending: false })
        .limit(ASSOCIATION_LIMITS.rootRows).abortSignal(controller.signal), ASSOCIATION_LIMITS.rootRows);
      if (siblingsRead.length === ASSOCIATION_LIMITS.rootRows) {
        conflicts.set(root, 'history_read_bound'); continue;
      }
      const siblings = siblingsRead.filter((document) => sqlCanonical(document) === root && sqlIdentity(document) === null);
      if (siblings.some((document) => !metadata(document) || identity(document) !== null)) {
        conflicts.set(root, 'history_identity_invalid'); continue;
      }
      if (siblings.some((document) => !revision(document))) { conflicts.set(root, 'history_clock_invalid'); continue; }
      const eligible = siblings.filter((document) => Date.parse(revision(document)!) <= Date.parse(dataCutoff));
      const latestTime = Math.max(...eligible.map((document) => Date.parse(revision(document)!)));
      const newest = eligible.filter((document) => Date.parse(revision(document)!) === latestTime);
      // A deterministic head winner cannot vouch for other same-clock versions.
      // Validate every one with the exact same invariants as the requested row,
      // including fields that do not otherwise distinguish revision signatures.
      const siblingChecks = newest.map((document) => documentInvariantProof(document, dataCutoff));
      if (new Set(newest.map(versionSignature)).size > 1) conflicts.set(root, 'conflicting_head');
      else {
        const invalid = siblingChecks.find((checked) => checked.gap);
        if (invalid) conflicts.set(root, `history_${invalid.gap}`);
      }
      for (const original of documents.values()) {
        if (canonical(original) !== root || identity(original) !== null) continue;
        if (!eligible.some((document) => document.id === original.id)) { documentGaps.set(String(original.id), 'history_identity_missing'); continue; }
        if (latestTime > Date.parse(revision(original) || dataCutoff)) documentGaps.set(String(original.id), 'superseded');
      }
    }
  } catch (error) {
    const known = ['read_deadline', 'read_failed', 'read_bound_exceeded', 'read_identity_mismatch'];
    readFailure = error instanceof Error && known.includes(error.message) ? error.message : 'read_failed';
    controller.abort();
  } finally { if (timeout) clearTimeout(timeout); }
  const result = new Map<string, IndustryAssociationReceipt[]>();
  for (const [symbol, associations] of inputs) result.set(symbol, associations.map((input) => {
    const gaps: string[] = []; let source: AssociationDocumentProof | null = null; const companyBasis: AssociationDocumentProof[] = [];
    const resolve = (id: string, prefix: string) => {
      const document = documents.get(id);
      if (!document) { gaps.push(`${prefix}_missing`); return null; }
      const checked = documentProof(document, heads.get(id), dataCutoff, conflicts.get(canonical(document) || '') || documentGaps.get(id));
      if (checked.gap) gaps.push(`${prefix}_${checked.gap}`);
      return checked.proof;
    };
    if (readFailure) gaps.push(readFailure);
    else {
      source = resolve(input.sourceDocumentId, 'source');
      if (source && (source.rootId !== input.sourceRootId || source.contentHash !== input.sourceContentHash)) {
        gaps.push('source_binding_mismatch'); source = null;
      }
      if (source && (source.subjectScope !== 'industry_context' || source.symbols.length !== 0)) {
        gaps.push('source_not_industry_only'); source = null;
      }
      for (const id of input.companyBasisDocumentIds) {
        const proof = resolve(id, 'basis'); if (!proof) continue;
        if (!hasDirectCompanyMentionScope(documents.get(id)!) || !proof.symbols.includes(symbol)) gaps.push('basis_company_mismatch');
        else companyBasis.push(proof);
      }
    }
    if (!input.companyBasisDocumentIds.length) gaps.push('company_basis_missing');
    const evidenceStatus: IndustryAssociationReceipt['evidenceStatus'] = readFailure ? 'unavailable'
      : gaps.some((gap) => /_(?:denied|retracted)$/u.test(gap)) ? 'invalidated'
      : gaps.some((gap) => /(?:superseded|conflicting_head|parent_unresolved|history_)/u.test(gap)) ? 'needs_update'
      : gaps.length ? 'needs_evidence' : 'awaiting_independent_review';
    const payload: Omit<IndustryAssociationReceipt, 'associationHash'> = { ...input, policyVersion: ASSOCIATION_POLICY, symbol, status: 'hypothesis' as const,
      hypothesisOrigin: 'authenticated_research_submission' as const, dataCutoff: new Date(dataCutoff).toISOString(),
      researchObservedAt: new Date(serverClock).toISOString(), availableAt: new Date(serverClock).toISOString(), usableAtCutoff: false as const,
      evidenceStatus, source, companyBasis, gaps: [...new Set(gaps)].sort(),
      hasResearchCue: Boolean(source) && (evidenceStatus === 'needs_evidence' || evidenceStatus === 'awaiting_independent_review')
        && !gaps.some((gap) => gap.startsWith('basis_')),
      rankingInfluence: false as const, directSourceContribution: 0 as const };
    return { ...payload, associationHash: researchCanonicalHash(payload) };
  }));
  return result;
}
