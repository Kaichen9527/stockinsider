import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { runThesisRefresh } from '@/lib/research-v2';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const startedAt = Date.now();
    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);
    const symbols = Array.isArray(body?.symbols) ? body.symbols.map(String) : undefined;
    const topN = body?.topN == null ? undefined : Number(body.topN);
    const result = await runThesisRefresh({ dryRun, symbols, topN });
    return NextResponse.json({
      ok: true,
      result: {
        ...result,
        durationMs: Date.now() - startedAt,
      },
      meta: { runId: result.runId, dryRun },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
