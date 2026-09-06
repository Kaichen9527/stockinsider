import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { validateCandidateDossierSubmission, type CandidateDossierFactMetadata } from '@/lib/candidate-dossier-validation';
import { candidateDossierBundleId, candidateDossierInputHash, candidateFactLocator, isPaidInvestAnchorsReference, numberedCandidateSources, sanitizeRevisionScopedDossierEvidence, withoutPaidInvestAnchorsSourceLinks } from '@/lib/candidate-dossier-contract';

type Row = Record<string, unknown>;

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Row;
  const revisionId = String(body.revisionId || '');
  const inputHash = String(body.inputHash || body.bundleHash || '');
  if (!/^[0-9a-f-]{36}$/iu.test(revisionId) || !/^[0-9a-f]{64}$/u.test(inputHash)) {
    return NextResponse.json({ ok: false, error: 'invalid_submission_schema' }, { status: 400 });
  }
  const expectedBundleId = candidateDossierBundleId(inputHash);
  const bundleId = String(body.bundleId || expectedBundleId);
  if (!/^[0-9a-f-]{36}$/iu.test(bundleId) || bundleId !== expectedBundleId) {
    return NextResponse.json({ ok: false, error: 'candidate_dossier_bundle_id_mismatch' }, { status: 409 });
  }
  const supabase = getSupabaseServerClient();
  const [detail, queuedBundle, publication] = await Promise.all([
    supabase.from('candidate_detail_snapshots').select('id,stock_id,session_date,lifecycle_stage,title,summary,fact_ids,source_links,sections,valuation,technical,as_of,available_at,stocks(symbol,name)').eq('id', revisionId).maybeSingle(),
    supabase.from('candidate_dossier_bundles').select('bundle_id,revision_id,published_revision_id,input_hash').eq('bundle_id', bundleId).eq('revision_id', revisionId).eq('input_hash', inputHash).maybeSingle(),
    supabase.from('candidate_daily_stage_snapshots').select('detail_revision_id').eq('detail_revision_id', revisionId).limit(1),
  ]);
  if (detail.error || !detail.data) return NextResponse.json({ ok: false, error: detail.error?.message || 'detail_revision_not_found' }, { status: detail.error ? 500 : 404 });
  if (queuedBundle.error) return NextResponse.json({ ok: false, error: queuedBundle.error.message }, { status: 500 });
  if (!queuedBundle.data) return NextResponse.json({ ok: false, error: 'candidate_dossier_bundle_not_queued' }, { status: 409 });
  if (String(queuedBundle.data.published_revision_id || '') !== revisionId || publication.error || !(publication.data || []).length) {
    return NextResponse.json({ ok: false, error: publication.error?.message || 'candidate_dossier_revision_not_published' }, { status: publication.error ? 500 : 409 });
  }
  const requestedFactIds = new Set((Array.isArray(detail.data.fact_ids) ? detail.data.fact_ids : []).map(String));
  const factRead = requestedFactIds.size > 0
    ? await supabase.from('candidate_official_facts').select('fact_id,stock_id,fact_key,fact_kind,period_end,value,unit,as_of,available_at,source_url,provenance,derivation').in('fact_id', [...requestedFactIds])
    : { data: [], error: null };
  if (factRead.error) return NextResponse.json({ ok: false, error: factRead.error.message }, { status: 500 });
  const readFacts = ((factRead.data || []) as Row[]).filter((fact) => !isPaidInvestAnchorsReference(fact.source_url));
  const scoped = sanitizeRevisionScopedDossierEvidence(
    { ...withoutPaidInvestAnchorsSourceLinks(detail.data as Row), fact_ids: readFacts.map((fact) => String(fact.fact_id)) },
    readFacts,
  );
  const safeDetail = scoped.detail;
  const facts = scoped.facts;
  const allowed = new Set(facts.map((fact) => String(fact.fact_id)));
  const expectedInputHash = candidateDossierInputHash(safeDetail, facts);
  if (inputHash !== expectedInputHash) return NextResponse.json({ ok: false, error: 'candidate_dossier_bundle_hash_mismatch' }, { status: 409 });

  const factValues = new Map<string, number[]>();
  const factKeys = new Map<string, string>();
  const factKinds = new Map<string, string>();
  const factMetadata = new Map<string, CandidateDossierFactMetadata>();
  for (const fact of facts) {
    const factId = String(fact.fact_id); const factKey = String(fact.fact_key); const factKind = String(fact.fact_kind);
    factKeys.set(factId, factKey); factKinds.set(factId, factKind);
    const value = Number(fact.value);
    if (Number.isFinite(value)) factValues.set(factId, [value]);
    const stockRelation = detail.data.stocks as Row | Row[] | null;
    const stock = Array.isArray(stockRelation) ? stockRelation[0] : stockRelation;
    factMetadata.set(factId, {
      factKey, factKind,
      stockId: fact.stock_id ? String(fact.stock_id) : null,
      symbol: stock?.symbol ? String(stock.symbol) : null,
      unit: fact.unit ? String(fact.unit) : null,
      period: fact.period_end ? String(fact.period_end) : null,
      locator: candidateFactLocator(fact),
      values: Number.isFinite(value) ? [value] : [],
    });
  }
  const stockRelation = detail.data.stocks as Row | Row[] | null;
  const stock = Array.isArray(stockRelation) ? stockRelation[0] : stockRelation;
  const validated = validateCandidateDossierSubmission({
    summary: body.summary, summaryFactIds: body.summaryFactIds, sections: body.sections, claims: body.claims,
    allowedFactIds: allowed, factValues, factKeys, factKinds, factMetadata,
    companyIdentity: { stockId: String(detail.data.stock_id || ''), symbol: String(stock?.symbol || ''), name: String(stock?.name || '') },
  });
  const { summary, summaryFactIds, sections: normalized, claims, rejectionReasons } = validated;
  if (Array.isArray(body.claims)) {
    const expectedSectionKeys = (Array.isArray(detail.data.sections) ? detail.data.sections as Row[] : []).map((section) => String(section.key || ''));
    const submittedSectionKeys = normalized.map((section) => section.key);
    if (expectedSectionKeys.length === 0 || expectedSectionKeys.length !== submittedSectionKeys.length || expectedSectionKeys.some((key, index) => key !== submittedSectionKeys[index])) {
      rejectionReasons.push('article_structure_revision_mismatch');
    }
    const symbol = String(stock?.symbol || ''); const name = String(stock?.name || '');
    const articleText = `${summary}\n${normalized.map((section) => `${section.title}\n${section.body}`).join('\n')}`;
    if ((!symbol || !articleText.includes(symbol)) && (!name || !articleText.includes(name))) rejectionReasons.push('article_company_identity_missing');
  }
  const valid = rejectionReasons.length === 0;
  const sources = numberedCandidateSources(safeDetail, facts);
  const submissionHash = createHash('sha256').update(JSON.stringify({ bundleId, revisionId, inputHash, summary, summaryFactIds, sections: normalized, claims })).digest('hex');
  const persistence = await supabase.rpc('record_candidate_dossier_submission_v4', {
    p_bundle_id: bundleId,
    p_revision_id: revisionId,
    p_input_hash: inputHash,
    p_submission_hash: submissionHash,
    p_content: valid ? { summary, sections: normalized, claims, sources } : { redacted: true, submissionSha256: submissionHash },
    p_claims: valid ? claims : [],
    p_source_references: valid ? sources : [],
    p_claim_fact_map: valid
      ? { summary: summaryFactIds, ...Object.fromEntries(normalized.map((section) => [section.key, section.factIds])), ...Object.fromEntries(claims.map((claim) => [claim.id, claim.factIds])) }
      : {},
    p_validation_status: valid ? 'valid' : 'rejected',
    p_rejection_reasons: rejectionReasons,
  });
  const receipt = Array.isArray(persistence.data) ? persistence.data[0] as Row | undefined : persistence.data as Row | null;
  if (persistence.error || !receipt) return NextResponse.json({ ok: false, error: persistence.error?.message || 'candidate_dossier_persistence_failed' }, { status: 500 });
  const accepted = receipt.status === 'accepted';
  return NextResponse.json({
    ok: accepted, submissionId: receipt.submission_id, status: receipt.status,
    revisionId, inputHash, dossierId: receipt.dossier_id, validationStatus: accepted ? 'valid' : 'rejected',
    rejectionReasons: receipt.rejection_reasons || rejectionReasons,
    idempotentReplay: receipt.idempotent_replay === true,
  }, { status: accepted ? 200 : 422 });
}
