import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { runReportIngest } from '@/lib/research-v2';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const startedAt = Date.now();
    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);
    const requestedTopN = Number(body?.topN || process.env.STORY_CANDIDATE_TOP_N || 50);
    const topN = Number.isFinite(requestedTopN) ? Math.max(5, Math.floor(requestedTopN)) : 50;
    const result = await runReportIngest({ dryRun });
    return NextResponse.json({
      ok: true,
      result: {
        ...result,
        candidateCount: topN,
        filledCount: Number(result.recordsWritten || 0),
        missingCount: Math.max(0, topN - Number(result.recordsWritten || 0)),
        durationMs: Date.now() - startedAt,
      },
      meta: { runId: result.runId, dryRun },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
