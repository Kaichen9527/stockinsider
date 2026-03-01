import { NextResponse } from 'next/server';
import { sendOpsAlert } from '@/lib/alerts';
import { dispatchLineEvents, getLatestIngestionState, runRecommendationBatch } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';
import { withRetry } from '@/lib/retry';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = Boolean(body?.dryRun);
  const inProcessRetry = process.env.PIPELINE_INPROCESS_RETRY === 'true';
  try {
    const ingestion = await getLatestIngestionState();
    if (!ingestion.ok) {
      await sendOpsAlert({
        level: 'critical',
        title: 'StockInsider pipeline blocked',
        message: `ingestion precheck failed: ${ingestion.reason}`,
        context: { dryRun },
      }).catch(() => undefined);
      return NextResponse.json(
        { ok: false, error: `ingestion precheck failed: ${ingestion.reason}`, meta: { runId: null, dryRun } },
        { status: 409 }
      );
    }

    const recommendation = inProcessRetry
      ? await withRetry(
          () => runRecommendationBatch({ dryRun }),
          { retries: 3, delaysMs: [60_000, 5 * 60_000, 15 * 60_000] }
        )
      : await runRecommendationBatch({ dryRun });
    const dispatch = inProcessRetry
      ? await withRetry(
          () => dispatchLineEvents({ dryRun }),
          { retries: 3, delaysMs: [60_000, 5 * 60_000, 15 * 60_000] }
        )
      : await dispatchLineEvents({ dryRun });

    return NextResponse.json({
      ok: true,
      result: {
        recommendation,
        dispatch,
      },
      meta: {
        runId: recommendation.runId,
        dryRun,
      },
    });
  } catch (error) {
    await sendOpsAlert({
      level: 'critical',
      title: 'StockInsider pipeline failed',
      message: (error as Error).message,
      context: { dryRun },
    }).catch(() => undefined);

    return NextResponse.json(
      { ok: false, error: (error as Error).message, meta: { runId: null, dryRun } },
      { status: 500 }
    );
  }
}
