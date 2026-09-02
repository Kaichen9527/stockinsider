import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { requireInternalAuth } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { validateCandidateDossierSubmission } from '@/lib/candidate-dossier-validation';

type Row = Record<string, unknown>;

export async function POST(request: Request) {
  const auth = requireInternalAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({})) as Row;
  const revisionId = String(body.revisionId || '');
  if (!/^[0-9a-f-]{36}$/iu.test(revisionId)) return NextResponse.json({ ok: false, error: 'invalid_submission_schema' }, { status: 400 });
  const supabase = getSupabaseServerClient();
  const detail = await supabase.from('candidate_detail_snapshots').select('fact_ids').eq('id', revisionId).maybeSingle();
  if (detail.error || !detail.data) return NextResponse.json({ ok: false, error: detail.error?.message || 'detail_revision_not_found' }, { status: detail.error ? 500 : 404 });
  const allowed = new Set((Array.isArray(detail.data.fact_ids) ? detail.data.fact_ids : []).map(String));
  const factRead = allowed.size > 0
    ? await supabase.from('candidate_official_facts').select('fact_id,value').in('fact_id', [...allowed])
    : { data: [], error: null };
  if (factRead.error) return NextResponse.json({ ok: false, error: factRead.error.message }, { status: 500 });
  const factValues = new Map<string, number[]>();
  for (const fact of factRead.data || []) {
    const value = Number(fact.value);
    if (Number.isFinite(value)) factValues.set(String(fact.fact_id), [value]);
  }
  const validated = validateCandidateDossierSubmission({
    summary: body.summary,
    summaryFactIds: body.summaryFactIds,
    sections: body.sections,
    allowedFactIds: allowed,
    factValues,
  });
  const { summary, summaryFactIds, sections: normalized, rejectionReasons } = validated;
  const valid = rejectionReasons.length === 0;
  const submissionHash = createHash('sha256').update(JSON.stringify({ summary, summaryFactIds, sections: normalized })).digest('hex');
  const write = await supabase.from('candidate_research_dossiers').insert({
    detail_snapshot_id: revisionId, narrative_kind: 'codex_enriched',
    content: valid ? { summary, sections: normalized } : { redacted: true, submissionSha256: submissionHash },
    claim_fact_map: valid ? { summary: summaryFactIds, ...Object.fromEntries(normalized.map((section) => [section.key, section.factIds])) } : {},
    validation_status: valid ? 'valid' : 'rejected', rejection_reasons: rejectionReasons,
  }).select('id').single();
  if (write.error) return NextResponse.json({ ok: false, error: write.error.message }, { status: 500 });
  return NextResponse.json({ ok: valid, dossierId: write.data.id, validationStatus: valid ? 'valid' : 'rejected', rejectionReasons }, { status: valid ? 200 : 422 });
}
