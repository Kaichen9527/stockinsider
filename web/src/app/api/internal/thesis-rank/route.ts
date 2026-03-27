import { NextResponse } from 'next/server';
import { runThesisRank } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const startedAt = Date.now();
    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);
    const result = await runThesisRank({ dryRun });
    const recordsWritten = Number(result.written || 0);
    const blocked = Number(result.blocked || 0);
    return NextResponse.json({
      ok: true,
      result: {
        ...result,
        candidateCount: recordsWritten,
        recordsWritten,
        filledCount: Math.max(0, recordsWritten - blocked),
        missingCount: blocked,
        durationMs: Date.now() - startedAt,
      },
      meta: { runId: result.runId, dryRun, agentRunId: result.agentRunId },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
