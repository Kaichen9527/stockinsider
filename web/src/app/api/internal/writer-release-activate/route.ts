import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const auth = requireInternalAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const expectedReleaseId = String(process.env.STOCKINSIDER_WRITER_RELEASE_ID || '');
  if (!/^[0-9a-f]{7,64}$/u.test(expectedReleaseId)) {
    return NextResponse.json({ ok: false, error: 'writer_release_identity_missing' }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as { releaseId?: unknown };
  const releaseId = String(body.releaseId || '');
  if (releaseId !== expectedReleaseId) {
    return NextResponse.json({ ok: false, error: 'writer_release_identity_mismatch' }, { status: 409 });
  }
  const supabase = getSupabaseServerClient();
  const activeRelease = await supabase.from('production_writer_releases')
    .select('release_id').eq('active', true).maybeSingle();
  if (activeRelease.error) return NextResponse.json({ ok: false, error: activeRelease.error.message }, { status: 500 });
  let deploymentLeaseReleased = false;
  const previousReleaseId = String(activeRelease.data?.release_id || '');
  if (previousReleaseId !== releaseId) {
    // Deployment restarts the sole VPS web service before this authenticated
    // activation call. Any remaining lease therefore belongs to the stopped
    // release and must not block the new release for its full one-hour TTL.
    const lease = await supabase.from('production_write_leases')
      .select('owner_id').eq('lease_key', 'production-data-plane').maybeSingle();
    if (lease.error) return NextResponse.json({ ok: false, error: lease.error.message }, { status: 500 });
    const ownerId = String(lease.data?.owner_id || '');
    if (ownerId) {
      const released = await supabase.rpc('release_production_write_lease', {
        p_lease_key: 'production-data-plane', p_owner_id: ownerId,
      });
      if (released.error || released.data !== true) {
        return NextResponse.json({ ok: false, error: released.error?.message || 'deployment_lease_release_failed' }, { status: 500 });
      }
      deploymentLeaseReleased = true;
    }
  }
  const result = await supabase.rpc('register_production_writer_release', {
    p_release_id: releaseId,
    p_metadata: { activated_by: 'vps_internal_api', activated_at: new Date().toISOString() },
  });
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, releaseId, writerKind: 'vps', previousReleaseId: previousReleaseId || null, deploymentLeaseReleased });
}

export async function GET(request: Request) { return POST(request); }
