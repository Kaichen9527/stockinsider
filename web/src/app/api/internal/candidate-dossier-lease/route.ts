import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Only the trusted article controller calls this route; the model never sees the bearer or lease owner. */
export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const jobId = String(body.jobId || '');
  const owner = String(body.owner || '').trim();
  const action = String(body.action || '');
  const reason = String(body.reason || '').trim();
  if (!UUID.test(jobId) || !owner || owner.length > 120
    || !['heartbeat', 'retry', 'fail'].includes(action)
    || (action !== 'heartbeat' && (!reason || reason.length > 512))) {
    return NextResponse.json({ ok: false, error: 'candidate_dossier_lease_input_invalid' }, { status: 400 });
  }
  const supabase = getSupabaseServerClient();
  const result = action === 'heartbeat'
    ? await supabase.rpc('heartbeat_candidate_dossier_outbox_v6', { p_job_id: jobId, p_owner: owner })
    : await supabase.rpc('release_candidate_dossier_outbox_v6', {
      p_job_id: jobId, p_owner: owner, p_retryable: action === 'retry', p_reason: reason,
    });
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
  if (result.data !== true) return NextResponse.json({ ok: false, error: 'candidate_dossier_lease_lost' }, { status: 409 });
  return NextResponse.json({ ok: true, jobId, action });
}
