import { NextResponse } from 'next/server';
import { getLatestIngestionState, runRecommendationBatch } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);
    const ingestion = await getLatestIngestionState();
    if (!ingestion.ok) {
      return NextResponse.json(
        { ok: false, error: `ingestion precheck failed: ${ingestion.reason}`, meta: { runId: null, dryRun } },
        { status: 409 }
      );
    }

    const result = await runRecommendationBatch({ dryRun });
    return NextResponse.json({ ok: true, result, meta: { runId: result.runId, dryRun } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message, meta: { runId: null, dryRun: false } }, { status: 500 });
  }
}
