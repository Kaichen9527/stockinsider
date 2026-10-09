import { NextResponse } from 'next/server';
import { requireExactInternalBearer, requireIndependentResearchReviewer, requireInternalAuth } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';

/** The trusted Mac controller keeps credentials outside the model process. */
export async function POST(request: Request) {
  if (request.headers.has('x-research-execution-version')) {
    if (request.headers.get('x-research-execution-version') !== '2')
      return NextResponse.json({ ok: false, error: 'research_execution_version_invalid' }, { status: 400 });
    if (request.headers.has('x-research-review-assignment-action')) {
      const { handleResearchReviewerAssignment } = await import('@/lib/research-reviewer-assignment');
      return handleResearchReviewerAssignment(request);
    }
    const { handleResearchAuthorAssignment } = await import('@/lib/research-author-assignment');
    return handleResearchAuthorAssignment(request);
  }
  const writer = requireExactInternalBearer(request);
  const reviewer = requireIndependentResearchReviewer(request);
  const testAuth = requireInternalAuth(request, { allowResearchTester: true });
  const tester = testAuth.ok && testAuth.authSource === 'research_test_key'
    && Boolean(request.headers.get('authorization')?.startsWith('Bearer ')) && !request.headers.has('x-internal-key');
  if (!writer && !reviewer && !tester) return NextResponse.json({ ok: false, error: 'research_controller_auth_required' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !/^[a-zA-Z0-9:_-]{3,120}$/u.test(String(body.owner)))
    return NextResponse.json({ ok: false, error: 'research_model_owner_invalid' }, { status: 400 });
  const db = getSupabaseServerClient();
  if (body.action === 'reserve') {
    // Deep research reserves atomically inside its existing job claim. Review
    // roles require a separate credential and cannot be claimed by the author.
    const roles = tester ? ['independent_test'] : reviewer ? ['counter_review'] : ['discovery', 'technical', 'strategy_research'];
    if (!roles.includes(body.role) || typeof body.workKey !== 'string' || body.workKey.length < 3 || body.workKey.length > 200)
      return NextResponse.json({ ok: false, error: 'research_model_role_or_work_invalid' }, { status: 400 });
    const result = await db.rpc('reserve_research_model_v1', { p_role: body.role, p_owner: body.owner, p_work_key: body.workKey });
    if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 409 });
    return NextResponse.json({ ok: true, reservation: result.data?.[0] || null,
      blockedReason: result.data?.length ? null : 'global_lease_or_daily_budget_exhausted' });
  }
  if (body.action === 'finish') {
    if (!/^[0-9a-f-]{36}$/u.test(String(body.reservationId)) || !['completed', 'failed'].includes(body.outcome)
      || !/^[0-9a-f]{64}$/u.test(String(body.resultHash)))
      return NextResponse.json({ ok: false, error: 'research_model_finish_invalid' }, { status: 400 });
    const reservation = await db.from('research_model_reservations_v1').select('role')
      .eq('reservation_id', body.reservationId).eq('owner', body.owner).maybeSingle();
    const roles = tester ? ['independent_test'] : reviewer ? ['counter_review'] : ['discovery', 'technical', 'strategy_research'];
    if (reservation.error || !reservation.data || !roles.includes(reservation.data.role))
      return NextResponse.json({ ok: false, error: 'research_model_role_not_authorized' }, { status: 409 });
    const result = await db.rpc('finish_research_model_v1', { p_reservation: body.reservationId,
      p_owner: body.owner, p_outcome: body.outcome, p_result_hash: body.resultHash });
    return NextResponse.json({ ok: !result.error && result.data === true, error: result.error?.message || null },
      { status: result.error ? 409 : 200 });
  }
  return NextResponse.json({ ok: false, error: 'research_model_action_invalid' }, { status: 400 });
}
