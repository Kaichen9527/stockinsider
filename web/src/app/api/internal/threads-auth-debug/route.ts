import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { runThreadsAuthDebug } from '@/lib/research-v2';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await req.json().catch(() => ({}));
    const result = await runThreadsAuthDebug({
      forceLogin: Boolean(body?.forceLogin),
      ignoreFallbackCookies: Boolean(body?.ignoreFallbackCookies),
      persistOnSuccess: body?.persistOnSuccess === undefined ? true : Boolean(body?.persistOnSuccess),
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message || 'threads_auth_debug_failed' },
      { status: 500 },
    );
  }
}
