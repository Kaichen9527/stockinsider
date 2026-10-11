import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { loadResearchFinancialSupplement } from '../web/src/lib/research-financial-supplement.ts';
import { completeHash } from '../web/src/lib/research-complete-canonical.ts';

// Actual fixed AUO/EMC financial files/calculators, but explicitly synthetic
// claim/revision/source rows. This is pure contract acceptance, not PG sealing,
// live source/role/author/reviewer/publication or financial authenticity proof.
const mapping = JSON.parse(readFileSync('web/src/lib/research-complete-mapping.json', 'utf8'));
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const oldHash = value => createHash('sha256').update(canonical(value)).digest('hex');
const fixtures = new Map();
export async function authorPacketFixture(symbol = '2409') {
  if (fixtures.has(symbol)) return structuredClone(fixtures.get(symbol));
  const r = { owner: 'synthetic-article-fixture', jobId: randomUUID(), attempt: 1, reservationId: randomUUID(),
    bundleId: null, sourceDocumentIds: [], scope: 'research_observed_v1', snapshotHash: 'a'.repeat(64) };
  const preparationId = randomUUID();
  const preparationPayload = { symbol, scope: r.scope, snapshotHash: r.snapshotHash, modelDispatched: false };
  const preparationHash = oldHash(preparationPayload);
  const saved = { preparation_id: preparationId, input_hash: preparationHash, payload: preparationPayload, request: r,
    replay: true, dispatchReady: false, job_id: r.jobId, attempt: 1, reservation_id: r.reservationId, admitted_at: new Date().toISOString() };
  const db = { rpc(name) {
    assert.equal(name, 'assert_research_input_preparation_v2');
    return { abortSignal: async () => ({ data: structuredClone(saved), error: null }) };
  } };
  const supplement = await loadResearchFinancialSupplement(db, { request: r, preparationId, preparationInputHash: preparationHash }, process.cwd());
  const projection = structuredClone(supplement.projection); delete projection.sourceManifestHash;
  const calculation = structuredClone(supplement.calculation);
  for (const key of ['inputHash', 'resultHash', 'executionCodeHash']) delete calculation[key];
  const admittedAt = new Date().toISOString(), deadline = new Date(Date.now() + 1800_000).toISOString();
  const request = { owner: r.owner, jobId: r.jobId, attempt: 1, reservationId: r.reservationId, scope: r.scope,
    snapshotHash: r.snapshotHash, preparationId, preparationHash,
    expectedArtifactManifestHash: mapping.companies[symbol].inventoryHash, expectedCalculatorExecutionHash: mapping.sourceClosureHash };
  const source = { id: randomUUID(), rowHash: 'b'.repeat(64), url: 'https://example.com/public-summary',
    observedAt: '2026-10-08T14:00:00Z', admittedAt: '2026-10-08T14:01:00Z',
    publication: { precision: 'unknown', raw: null, timezone: null, instant: null },
    scope: 'company_mentions', symbols: [symbol], rights: 'public_summary_only', retracted: false, superseded: false };
  const payload = { schemaVersion: 'research-article-input-v2', assemblyStatus: 'complete', evidenceStatus: 'incomplete', producerAttribution: 'internal_controller_asserted',
    preparation: { id: preparationId, inputHash: preparationHash }, researchIdentity: { symbol, scope: r.scope, snapshotHash: r.snapshotHash, researchCompanyId: randomUUID() },
    originalJob: { jobId: r.jobId, attempt: 1, owner: r.owner, leaseExpiresAt: deadline },
    originalReservation: { reservationId: r.reservationId, startedAt: new Date(Date.now() - 60_000).toISOString(), leaseExpiresAt: deadline },
    sources: { sealId: randomUUID(), manifest: [{ id: source.id, rowHash: source.rowHash }], coverage: 'incomplete' },
    financial: { artifactInventory: mapping.companies[symbol].inventory, material: { projection, calculation } },
    hashes: { preparationInputHash: preparationHash, artifactInventoryHash: mapping.companies[symbol].inventoryHash,
      sourceClosureHash: mapping.sourceClosureHash, modelHistoricalCanonicalHash: mapping.companies[symbol].historicalHash,
      sourceManifestHash: completeHash(projection.sourceManifest), projectionHash: completeHash(projection),
      scenarioInputHash: completeHash(projection.projected.scenarios), resultHash: completeHash(calculation) },
    clocks: { originalModelCutoff: projection.clocks.originalModelCutoff, artifactReadKnownAt: projection.clocks.currentLocalReadKnownAt, researchCutoff: admittedAt },
    gaps: [{ namespace: 'source', reason: 'source_coverage_incomplete' },
      { namespace: 'financial', reason: 'financial_source_live_rights_unverified' },
      { namespace: 'execution', reason: 'trusted_role_execution_unavailable' },
      ...projection.gaps.map(reason => ({ namespace: 'financial', reason }))],
    capabilities: Object.fromEntries(['financialVerified', 'dispatchReady', 'modelDispatched', 'publishableResearch', 'researchQualified', 'strategyApproved', 'entryEligible', 'historicalPITEligible'].map(k => [k, false])) };
  const revision = { status: 'sealed', dispatchReady: false, revision_id: randomUUID(), canonical_request: request, request_hash: completeHash(request),
    canonical_payload: payload, input_hash: completeHash(payload), research_company_id: payload.researchIdentity.researchCompanyId,
    job_id: r.jobId, attempt: 1, reservation_id: r.reservationId, preparation_id: preparationId, research_scope: r.scope, snapshot_hash: r.snapshotHash };
  const assignment = { assignment_id: randomUUID(), job_id: request.jobId, attempt: 1,
    reservation_id: request.reservationId, input_revision_id: revision.revision_id, input_hash: revision.input_hash,
    research_company_id: revision.research_company_id, snapshot_hash: request.snapshotHash,
    work_owner: request.owner, assigned_at: admittedAt,
    reservation_started_at: payload.originalReservation.startedAt,
    reservation_expires_at: deadline, original_job_deadline: deadline };
  const response = { assignment: structuredClone(assignment), inputRevisionId: revision.revision_id, inputHash: revision.input_hash,
    sourceSealReceivedAt: source.admittedAt, sources: [{ descriptor: source, title: 'Synthetic public source', summary: 'Test public summary only; not actual discovered evidence.',
      catalyst: 'Potential customer validation; unconfirmed.', risk: 'Delay or competing technology.', platform: 'ptt', sourceClaimStatus: 'rumor',
      collectedAt: '2026-10-08T14:00:30Z', unverifiedPublicationClaim: '2026-10-08T00:00:00Z', untrustedEvidence: true }] };
  const f = { request: { input: request, inputRevisionId: revision.revision_id, inputHash: revision.input_hash }, revision, assignment, response };
  fixtures.set(symbol, f); return structuredClone(f);
}
