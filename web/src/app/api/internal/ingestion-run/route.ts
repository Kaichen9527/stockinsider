import { NextResponse } from 'next/server';
import { runIngestionBatch } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';

// Vercel cron triggers via GET
export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);
    const result = await runIngestionBatch({ dryRun });
    return NextResponse.json({ ok: true, result, meta: { runId: result.runId, dryRun } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message, meta: { runId: null, dryRun: false } }, { status: 500 });
  }
}
