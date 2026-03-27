import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { runSourceSync } from '@/lib/research-v2';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const body = await req.json().catch(() => ({}));
    const { searchParams } = new URL(req.url);
    // Support connector via body OR URL query string (for Vercel cron which can't send body)
    const connector = body?.connector ? String(body.connector) : (searchParams.get('connector') || 'investanchors');
    const dryRun = Boolean(body?.dryRun);
    const result = await runSourceSync({ connector, dryRun });
    return NextResponse.json({ ok: true, result, meta: { runId: result.runId, dryRun, connector } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

// Vercel cron triggers via GET; mirror POST logic
export async function GET(req: Request) {
  return POST(req);
}
