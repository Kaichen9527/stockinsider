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
  const result = await getSupabaseServerClient().rpc('register_production_writer_release', {
    p_release_id: releaseId,
    p_metadata: { activated_by: 'vps_internal_api', activated_at: new Date().toISOString() },
  });
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, releaseId, writerKind: 'vps' });
}

export async function GET(request: Request) { return POST(request); }
