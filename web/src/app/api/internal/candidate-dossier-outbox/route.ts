import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';

type Row = Record<string, unknown>;

/**
 * Private, resumable worker intake.  It returns only immutable bundles already
 * published to the public research revision; it never recalculates scores.
 */
export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Row;
  const owner = String(body.owner || '').trim();
  const limit = Math.max(1, Math.min(20, Number(body.limit || 5) || 5));
  if (!owner || owner.length > 120) return NextResponse.json({ ok: false, error: 'candidate_dossier_outbox_owner_invalid' }, { status: 400 });
  const supabase = getSupabaseServerClient();
  const claimed = await supabase.rpc('claim_candidate_dossier_outbox_v5', { p_owner: owner, p_limit: limit });
  if (claimed.error) return NextResponse.json({ ok: false, error: claimed.error.message }, { status: 500 });
  const jobs = (claimed.data || []) as Row[];
  const bundleIds = jobs.map((job) => String(job.bundle_id || '')).filter(Boolean);
  const bundles = bundleIds.length ? await supabase.from('candidate_dossier_bundles')
    .select('bundle_id,revision_id,input_hash,symbol,payload,queued_at').in('bundle_id', bundleIds) : { data: [], error: null };
  if (bundles.error) return NextResponse.json({ ok: false, error: bundles.error.message }, { status: 500 });
  const bundleById = new Map(((bundles.data || []) as Row[]).map((bundle) => [String(bundle.bundle_id), bundle]));
  return NextResponse.json({ ok: true, jobs: jobs.flatMap((job) => {
    const bundle = bundleById.get(String(job.bundle_id || ''));
    return bundle ? [{ jobId: job.job_id, attempts: job.attempts, bundle }] : [];
  }) });
}
