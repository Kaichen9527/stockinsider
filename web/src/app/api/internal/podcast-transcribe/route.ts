import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { runPodcastTranscribe } from '@/lib/research-v2';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);
    const result = await runPodcastTranscribe({ dryRun });
    return NextResponse.json({ ok: true, result, meta: { runId: result.runId, dryRun } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
