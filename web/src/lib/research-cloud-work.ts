import { researchCanonicalHash } from './research-agent-qualification.ts';
import { sanitizePublicSourceUrl } from './public-source-url.ts';
import { validateDeepResearchArticle, type DeepResearchArticle, type EvidenceDocument } from './research-deep-article.ts';

export const CLOUD_WORK_SCHEMA = 'research-cloud-work-v1' as const;
export const CLOUD_RESULT_SCHEMA = 'research-cloud-result-v1' as const;
const SHA = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OWNER = /^[a-zA-Z0-9:_-]{3,120}$/u;
export const CLOUD_ROLE_BY_KIND = {
  discovery: 'discovery', article_draft: 'company_research', counter_review: 'counter_review',
  technical: 'technical', strategy_research: 'strategy_research', deep_article_validation: 'independent_test',
} as const;
export type CloudWorkKind = keyof typeof CLOUD_ROLE_BY_KIND;
export type CloudRole = typeof CLOUD_ROLE_BY_KIND[CloudWorkKind];
export type CloudEvidence = {
  id: string; publishedAt: string; observedAt: string; sourceUrl: string;
  contentHash: string; content: string; visibility: 'public' | 'authenticated_summary';
  contentForm: 'research_summary' | 'transcript_excerpt' | 'public_fact';
};
export type CloudWork = {
  schemaVersion: typeof CLOUD_WORK_SCHEMA; dataScope: 'research_snapshot' | 'synthetic_acceptance';
  kind: CloudWorkKind; sourceCommit: string; jobId: string; attempt: number;
  role: CloudRole; owner: string; reservationId: string;
  issuedAt: string; deadlineAt: string; cutoffAt: string;
  evidence: CloudEvidence[]; input: Record<string, unknown>; workHash: string;
};
export type CloudResult = {
  schemaVersion: typeof CLOUD_RESULT_SCHEMA; workHash: string; sourceCommit: string;
  jobId: string; attempt: number; role: CloudRole; owner: string; reservationId: string;
  startedAt: string; completedAt: string; status: 'completed' | 'failed';
  output: Record<string, unknown>; resultHash: string;
};
const MAX_JSON_BYTES = 4_000_000;
function instant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    && Number.isFinite(Date.parse(value));
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value: object, names: string[]) {
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...names].sort())) throw new Error('cloud_schema_keys_invalid');
}
/** JSON data only; never interprets text as commands. This is a second boundary
 * after the existing controller's rights-aware evidence projection, not a DLP guarantee. */
function boundedJson(value: unknown) {
  let nodes = 0;
  function visit(member: unknown, depth: number) {
    if (++nodes > 100_000 || depth > 30) throw new Error('cloud_json_bound_exceeded');
    if (member === null || typeof member === 'boolean') return;
    if (typeof member === 'number') {
      if (!Number.isFinite(member)) throw new Error('cloud_non_finite_number');
      return;
    }
    if (typeof member === 'string') {
      if (member.length > 200_000 || /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(member))
        throw new Error('cloud_secret_or_text_bound');
      return;
    }
    if (Array.isArray(member)) { for (const item of member) visit(item, depth + 1); return; }
    if (!record(member) || ![Object.prototype, null].includes(Object.getPrototypeOf(member))) throw new Error('cloud_non_json_value');
    for (const [key, item] of Object.entries(member)) {
      if (/^(?:__proto__|prototype|constructor|cookie|cookies|authorization|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|auth\.json)$/iu.test(key))
        throw new Error('cloud_forbidden_field');
      visit(item, depth + 1);
    }
  }
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_JSON_BYTES) throw new Error('cloud_json_bound_exceeded');
}
const taipeiDay = (value: string) => new Date(Date.parse(value) + 8 * 3600_000).toISOString().slice(0, 10);

export function validateCloudWork(value: unknown): CloudWork {
  if (!record(value)) throw new Error('cloud_work_invalid');
  boundedJson(value);
  exactKeys(value, ['schemaVersion', 'dataScope', 'kind', 'sourceCommit', 'jobId', 'attempt', 'role', 'owner',
    'reservationId', 'issuedAt', 'deadlineAt', 'cutoffAt', 'evidence', 'input', 'workHash']);
  const work = value as unknown as CloudWork;
  if (work.schemaVersion !== CLOUD_WORK_SCHEMA || !['research_snapshot', 'synthetic_acceptance'].includes(work.dataScope)
    || !Object.hasOwn(CLOUD_ROLE_BY_KIND, work.kind) || CLOUD_ROLE_BY_KIND[work.kind] !== work.role
    || !COMMIT.test(work.sourceCommit) || !UUID.test(work.jobId) || !UUID.test(work.reservationId)
    || !OWNER.test(work.owner) || !Number.isInteger(work.attempt) || work.attempt < 1 || work.attempt > 3
    || ![work.issuedAt, work.deadlineAt, work.cutoffAt].every(instant)
    || Date.parse(work.cutoffAt) > Date.parse(work.issuedAt)
    || Date.parse(work.deadlineAt) <= Date.parse(work.issuedAt)
    || Date.parse(work.deadlineAt) - Date.parse(work.issuedAt) > 1800_000
    || taipeiDay(work.issuedAt) !== taipeiDay(work.deadlineAt)
    || !record(work.input) || !Array.isArray(work.evidence) || work.evidence.length < 1 || work.evidence.length > 128
    || !SHA.test(work.workHash)) throw new Error('cloud_work_binding_invalid');
  const ids = new Set<string>();
  for (const item of work.evidence) {
    if (!record(item)) throw new Error('cloud_evidence_invalid');
    exactKeys(item, ['id', 'publishedAt', 'observedAt', 'sourceUrl', 'contentHash', 'content', 'visibility', 'contentForm']);
    if (!UUID.test(item.id) || ids.has(item.id) || ![item.publishedAt, item.observedAt].every(instant)
      || Date.parse(item.publishedAt) > Date.parse(item.observedAt)
      || Date.parse(item.observedAt) > Date.parse(work.cutoffAt)
      || !['public', 'authenticated_summary'].includes(item.visibility)
      || !['research_summary', 'transcript_excerpt', 'public_fact'].includes(item.contentForm)
      || typeof item.content !== 'string' || !item.content.trim() || item.content.length > (item.visibility === 'authenticated_summary' ? 600 : 4000)
      || (item.visibility === 'authenticated_summary' && item.contentForm !== 'research_summary')
      || typeof item.sourceUrl !== 'string' || !item.sourceUrl.startsWith('https://')
      || sanitizePublicSourceUrl(item.sourceUrl) !== item.sourceUrl
      || !SHA.test(item.contentHash) || item.contentHash !== researchCanonicalHash(item.content)) throw new Error('cloud_evidence_invalid');
    ids.add(item.id);
  }
  const { workHash, ...payload } = work;
  if (researchCanonicalHash(payload) !== workHash) throw new Error('cloud_work_hash_mismatch');
  return JSON.parse(JSON.stringify(work)) as CloudWork;
}

/** Input must come from a trusted, rights-aware controller after a real claim.
 * Constructing a packet does not create a reservation or attest source truth. */
export function createCloudWork(input: Omit<CloudWork, 'schemaVersion' | 'workHash'>): CloudWork {
  const payload = { schemaVersion: CLOUD_WORK_SCHEMA, ...input };
  return validateCloudWork({ ...payload, workHash: researchCanonicalHash(payload) });
}

function checkClock(work: CloudWork, startedAt: string, completedAt: string, now: string) {
  if (![startedAt, completedAt, now].every(instant)
    || Date.parse(startedAt) < Date.parse(work.issuedAt)
    || Date.parse(completedAt) < Date.parse(startedAt)
    || Date.parse(completedAt) > Date.parse(now)
    || Date.parse(now) >= Date.parse(work.deadlineAt)) throw new Error('cloud_result_deadline_invalid');
}
export function createCloudResult(input: {
  work: CloudWork; sourceCommit: string; startedAt: string; completedAt: string;
  status: CloudResult['status']; output: Record<string, unknown>;
}): CloudResult {
  const work = validateCloudWork(input.work);
  if (input.sourceCommit !== work.sourceCommit) throw new Error('cloud_source_commit_mismatch');
  checkClock(work, input.startedAt, input.completedAt, input.completedAt);
  boundedJson(input.output);
  if (!record(input.output) || !['completed', 'failed'].includes(input.status)) throw new Error('cloud_output_invalid');
  const payload = { schemaVersion: CLOUD_RESULT_SCHEMA, workHash: work.workHash, sourceCommit: work.sourceCommit,
    jobId: work.jobId, attempt: work.attempt, role: work.role, owner: work.owner, reservationId: work.reservationId,
    startedAt: input.startedAt, completedAt: input.completedAt, status: input.status, output: input.output };
  return { ...payload, resultHash: researchCanonicalHash(payload) };
}

/** Pure recomputation uses the same issuer-finance validator as publication. */
export function recomputeCloudArticle(workValue: CloudWork, now: string) {
  const work = validateCloudWork(workValue);
  if (work.kind !== 'deep_article_validation') throw new Error('cloud_deterministic_kind_required');
  exactKeys(work.input, ['article', 'documents', 'allowedOfficialFactIds']);
  const article = work.input.article as DeepResearchArticle;
  const documents = work.input.documents as EvidenceDocument[];
  const facts = work.input.allowedOfficialFactIds;
  if (!article || article.evidenceCutoffAt !== work.cutoffAt || !Array.isArray(documents)
    || !Array.isArray(facts) || facts.length > 128 || facts.some((id) => typeof id !== 'string' || !UUID.test(id))
    || new Set(facts).size !== facts.length || documents.length > 128) throw new Error('cloud_article_input_invalid');
  for (const document of documents) {
    const evidence = work.evidence.find((item) => item.id === document.id);
    if (!evidence || evidence.visibility !== 'public' || document.sourceUrl !== evidence.sourceUrl
      || document.publishedAt !== evidence.publishedAt || document.observedAt !== evidence.observedAt)
      throw new Error('cloud_article_evidence_not_bound');
  }
  const validated = validateDeepResearchArticle({ article, documents, allowedOfficialFactIds: new Set(facts),
    expectedSymbol: article.symbol, now });
  return { articleHash: validated.articleHash, scenarios: validated.scenarios,
    sourceDocumentIds: validated.sourceDocumentIds };
}

/** Caller supplies its original controller-held packet, never the result's
 * claimed packet. Source/math checks still do not approve strategy or publication. */
export function verifyCloudResult(expectedValue: CloudWork, resultValue: unknown, now: string) {
  const expected = validateCloudWork(expectedValue);
  if (!record(resultValue)) throw new Error('cloud_result_invalid');
  boundedJson(resultValue);
  exactKeys(resultValue, ['schemaVersion', 'workHash', 'sourceCommit', 'jobId', 'attempt', 'role', 'owner',
    'reservationId', 'startedAt', 'completedAt', 'status', 'output', 'resultHash']);
  const result = resultValue as unknown as CloudResult;
  if (result.schemaVersion !== CLOUD_RESULT_SCHEMA || !SHA.test(result.resultHash)
    || !['completed', 'failed'].includes(result.status) || !record(result.output)) throw new Error('cloud_result_invalid');
  for (const key of ['workHash', 'sourceCommit', 'jobId', 'attempt', 'role', 'owner', 'reservationId'] as const) {
    if (result[key] !== expected[key]) throw new Error('cloud_result_identity_mismatch');
  }
  checkClock(expected, result.startedAt, result.completedAt, now);
  const { resultHash, ...payload } = result;
  if (researchCanonicalHash(payload) !== resultHash) throw new Error('cloud_result_hash_mismatch');
  if (result.status === 'completed' && expected.kind === 'deep_article_validation'
    && researchCanonicalHash(result.output) !== researchCanonicalHash(recomputeCloudArticle(expected, now)))
    throw new Error('cloud_recomputed_result_mismatch');
  return { schemaVersion: 'research-cloud-handoff-v1', workHash: expected.workHash, resultHash,
    dataScope: expected.dataScope, kind: expected.kind, role: expected.role,
    jobId: expected.jobId, attempt: expected.attempt, reservationId: expected.reservationId,
    status: result.status === 'failed' ? 'failed' : 'verified_for_existing_submission',
    receivedAt: now, authoritativePublication: false, strategyApproved: false,
    requiresLiveReservationCheck: true, requiresIndependentReview: true };
}

/** Reserve this key via the existing independent tester endpoint BEFORE Cloud
 * dispatch. Reservation id/server times are attached after the real claim. */
export function cloudReservationWorkKey(value: Pick<CloudWork, 'dataScope' | 'kind' | 'sourceCommit' | 'jobId'
  | 'attempt' | 'role' | 'owner' | 'cutoffAt' | 'evidence' | 'input'>) {
  const payload = { dataScope: value.dataScope, kind: value.kind, sourceCommit: value.sourceCommit,
    jobId: value.jobId, attempt: value.attempt, role: value.role, owner: value.owner,
    cutoffAt: value.cutoffAt, evidence: value.evidence, input: value.input };
  boundedJson(payload);
  return `cloud:v1:${researchCanonicalHash(payload)}`;
}
