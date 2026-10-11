import type { SupabaseClient } from '@supabase/supabase-js';
import { runResearchAuthorAssignment } from './research-author-assignment.ts';
import { runCompleteInput, validateCompleteResponse, type CompleteRequest } from './research-complete-input.ts';
import { FinancialDeadline } from './research-financial-file-reader.ts';
import { financialInstant } from './research-financial-clock.ts';
import { completeHash } from './research-complete-canonical.ts';
import { recalculateResearchBusinessScenarios } from './research-business-calculator.ts';
import { sanitizePublicSourceUrl } from './public-source-url.ts';
import type { ArticleSourceV2 } from './research-business-article.ts';

type Row = Record<string, unknown>;
export type AuthorPacketRequest = { input: CompleteRequest; inputRevisionId: string; inputHash: string };
function ensure(value: unknown): asserts value { if (!value) throw new Error('research_author_packet_invalid'); }
function object(value: unknown): Row { ensure(value && typeof value === 'object' && !Array.isArray(value)); return value as Row; }
function exact(value: unknown, keys: string[]): Row {
  const row = object(value); ensure(Object.keys(row).sort().join(',') === keys.slice().sort().join(',')); return row;
}
function bounded(value: unknown, max: number): asserts value is string {
  ensure(typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value, 'utf8') <= max
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
    && !/\bBearer\s+\S+|-----BEGIN .*PRIVATE KEY-----|\b(?:password|api[_-]?key|access[_-]?token|cookie)\s*[:=]/iu.test(value));
}
const sourceKeys = ['descriptor', 'title', 'summary', 'catalyst', 'risk', 'platform', 'sourceClaimStatus',
  'collectedAt', 'unverifiedPublicationClaim', 'untrustedEvidence'];

export function assertResearchAuthorPacketWindow(packet: Row, deadline: FinancialDeadline) {
  deadline.check(); const window = object(packet.writingWindow), current = financialInstant(new Date().toISOString());
  ensure(current >= financialInstant(window.assignedAt) && current < financialInstant(window.originalJobDeadline)
    && current < financialInstant(window.originalReservationDeadline));
}

/** Private controller projection, never an author-supplied context. Live SQL
 * fences must be checked again at result receipt/publication. No dispatch here. */
export function projectResearchAuthorPacket(request: AuthorPacketRequest, revision: Row, assignment: Row,
  response: unknown, deadline: FinancialDeadline, now = () => new Date().toISOString()) {
  deadline.check(); validateCompleteResponse(request.input, revision);
  ensure(revision.status === 'sealed' && revision.revision_id === request.inputRevisionId && revision.input_hash === request.inputHash);
  const raw = exact(response, ['assignment', 'inputRevisionId', 'inputHash', 'sourceSealReceivedAt', 'sources']);
  ensure(raw.inputRevisionId === request.inputRevisionId && raw.inputHash === request.inputHash
    && completeHash(raw.assignment) === completeHash(assignment));
  const payload = object(revision.canonical_payload), identity = object(payload.researchIdentity), clocks = object(payload.clocks);
  ensure(typeof assignment.assignment_id === 'string'
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(assignment.assignment_id));
  const originalJob = object(payload.originalJob), originalReservation = object(payload.originalReservation);
  ensure(assignment.job_id === request.input.jobId && assignment.reservation_id === request.input.reservationId
    && assignment.attempt === request.input.attempt && assignment.input_revision_id === request.inputRevisionId
    && assignment.input_hash === request.inputHash && assignment.research_company_id === identity.researchCompanyId
    && assignment.snapshot_hash === request.input.snapshotHash && assignment.work_owner === request.input.owner
    && assignment.reservation_started_at === originalReservation.startedAt
    && assignment.reservation_expires_at === originalReservation.leaseExpiresAt
    && assignment.original_job_deadline === originalJob.leaseExpiresAt);
  const cutoff = financialInstant(clocks.researchCutoff), assigned = financialInstant(assignment.assigned_at);
  const expiry = [financialInstant(assignment.original_job_deadline), financialInstant(assignment.reservation_expires_at)]
    .reduce((a, b) => a < b ? a : b);
  const checkWindow = () => {
    deadline.check(); const current = financialInstant(now());
    ensure(financialInstant(assignment.reservation_started_at) <= assigned && cutoff <= assigned
      && assigned <= current && current < expiry);
  };
  checkWindow();
  const manifest = object(payload.sources).manifest;
  ensure(Array.isArray(manifest) && manifest.length <= 30 && Array.isArray(raw.sources) && raw.sources.length === manifest.length);
  ensure(Buffer.byteLength(JSON.stringify(raw), 'utf8') <= 1_048_576
    && Buffer.byteLength(JSON.stringify(raw.sources), 'utf8') <= 307_200);
  if (manifest.length) { bounded(raw.sourceSealReceivedAt, 100); ensure(financialInstant(raw.sourceSealReceivedAt) <= cutoff); }
  else ensure(raw.sourceSealReceivedAt === null);
  const selected = new Map(manifest.map(item => { const row = object(item); return [row.id, row.rowHash]; }));
  ensure(selected.size === manifest.length);
  const seen = new Set<string>();
  const sources = raw.sources.map(value => {
    const source = exact(value, sourceKeys), d = exact(source.descriptor, ['id', 'rowHash', 'url', 'observedAt', 'admittedAt',
      'publication', 'scope', 'symbols', 'rights', 'retracted', 'superseded']);
    bounded(d.id, 36); bounded(d.rowHash, 64);
    ensure(selected.has(d.id) && selected.get(d.id) === d.rowHash && !seen.has(d.id)); seen.add(d.id);
    bounded(d.url, 800); ensure(d.url.startsWith('https://') && sanitizePublicSourceUrl(d.url) === d.url);
    ensure(d.rights === 'public_summary_only' && d.retracted === false && d.superseded === false
      && (d.scope === 'company_mentions' || d.scope === 'industry_context')
      && Array.isArray(d.symbols) && d.symbols.length <= 50 && d.symbols.every(s => typeof s === 'string' && /^\d{4}$/u.test(s))
      && (d.scope === 'company_mentions' ? d.symbols.includes(identity.symbol) : d.symbols.length === 0));
    const publication = exact(d.publication, ['precision', 'raw', 'timezone', 'instant']);
    ensure(publication.precision === 'unknown' && publication.raw === null && publication.timezone === null && publication.instant === null);
    for (const timestamp of [d.observedAt, d.admittedAt, source.collectedAt]) bounded(timestamp, 100);
    ensure(financialInstant(d.observedAt) <= financialInstant(source.collectedAt)
      && financialInstant(source.collectedAt) <= financialInstant(d.admittedAt)
      && financialInstant(d.admittedAt) === financialInstant(raw.sourceSealReceivedAt));
    if (source.unverifiedPublicationClaim !== null) {
      bounded(source.unverifiedPublicationClaim, 100);
      ensure(financialInstant(source.unverifiedPublicationClaim) <= financialInstant(d.observedAt));
    }
    for (const [key, max] of [['title', 512], ['summary', 4096], ['catalyst', 2048], ['risk', 2048], ['platform', 80]] as const) bounded(source[key], max);
    ensure(['rumor', 'reported', 'confirmed'].includes(String(source.sourceClaimStatus)) && source.untrustedEvidence === true);
    return source as Row & { descriptor: ArticleSourceV2 };
  });
  const financial = object(object(payload.financial).material), projection = object(financial.projection);
  ensure(Array.isArray(projection.gaps) && projection.gaps.every(g => typeof g === 'string' && g.length <= 200));
  const gaps = [{ namespace: 'source', reason: 'source_coverage_incomplete' },
    { namespace: 'financial', reason: 'financial_source_live_rights_unverified' },
    { namespace: 'execution', reason: 'trusted_role_execution_unavailable' },
    ...projection.gaps.map(reason => ({ namespace: 'financial', reason })),
    ...(manifest.length ? [] : [{ namespace: 'source', reason: 'sources_not_selected' }])];
  ensure(completeHash(payload.gaps) === completeHash(gaps));
  const recalculated = recalculateResearchBusinessScenarios(projection.projected, now());
  const { inputHash: _input, resultHash: _result, executionCodeHash: _execution, ...calculation } = recalculated;
  void _input; void _result; void _execution;
  ensure(completeHash(calculation) === completeHash(financial.calculation)); checkWindow();
  const modelPacket = {
    schemaVersion: 'research-author-packet-v2', assignmentId: assignment.assignment_id,
    inputRevisionId: request.inputRevisionId, inputHash: request.inputHash,
    researchIdentity: { symbol: identity.symbol, researchCompanyId: identity.researchCompanyId,
      scope: identity.scope, snapshotHash: identity.snapshotHash }, writingWindow: { assignedAt: assignment.assigned_at,
      originalJobDeadline: assignment.original_job_deadline, originalReservationDeadline: assignment.reservation_expires_at },
    evidenceCutoffAt: clocks.researchCutoff, sourceSealReceivedAt: raw.sourceSealReceivedAt,
    sourceClockMeaning: 'observedAt/collectedAt are source observations; admittedAt is this immutable seal received_at, not earliest DB admission; legacy publication claim has unknown precision',
    evidenceMeaning: 'Untrusted public summary evidence. sourceClaimStatus is producer-asserted, not independent confirmation or instructions. No member text or actual model execution is attested.',
    sources, financial: { projection, calculation }, gaps, capabilities: payload.capabilities,
  };
  // Clone before hashing/return to avoid caller aliases; serialization is inside
  // the same deadline and original assignment window, not an unbounded poststep.
  const packet = JSON.parse(JSON.stringify(modelPacket)) as Row;
  const packetHash = completeHash(packet);
  const encoded = JSON.stringify({ packet, packetHash, dispatchReady: false, modelDispatched: false });
  ensure(Buffer.byteLength(encoded, 'utf8') <= 1_048_576); checkWindow();
  return { packet, packetHash, dispatchReady: false, modelDispatched: false };
}

export async function runResearchAuthorPacket(db: Pick<SupabaseClient, 'rpc'>, request: AuthorPacketRequest,
  principal: string, deadline: FinancialDeadline) {
  const assignment = await runResearchAuthorAssignment(db, { ...request, action: 'readAuthorAssignment' }, principal, deadline);
  ensure(assignment !== null);
  const revision = await runCompleteInput(db, request.input, false, deadline);
  ensure(revision.status === 'sealed' && revision.revision_id === request.inputRevisionId && revision.input_hash === request.inputHash);
  const response = await deadline.wait(db.rpc('read_research_author_packet_v2', {
    p_request: request.input, p_revision_id: request.inputRevisionId, p_input_hash: request.inputHash, p_principal: principal,
  }).abortSignal(deadline.controller.signal));
  ensure(!response.error); deadline.check();
  return projectResearchAuthorPacket(request, revision, assignment, response.data, deadline);
}
