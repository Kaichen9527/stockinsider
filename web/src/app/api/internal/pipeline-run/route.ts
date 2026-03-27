import { NextResponse } from 'next/server';
import { sendOpsAlert } from '@/lib/alerts';
import { getLatestIngestionState, runPipelineFlow } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';
import { withRetry } from '@/lib/retry';

// Vercel cron triggers via GET
export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true || url.searchParams.get('dryRun') === 'true';
  const skipIngestion = body?.skipIngestion === true || url.searchParams.get('skipIngestion') === 'true';
  const modeParam = String(body?.mode || url.searchParams.get('mode') || '');
  const mode = modeParam === 'full' ? 'full' : modeParam === 'core' ? 'core' : dryRun ? 'full' : 'core';
  const inProcessRetry = body?.inProcessRetry === true;
  const syncTimeoutMs = Number(body?.syncTimeoutMs || process.env.PIPELINE_SYNC_TIMEOUT_MS || 18_000);

  try {
    if (skipIngestion) {
      const state = await getLatestIngestionState();
      if (!state.ok) {
        return NextResponse.json(
          { ok: false, error: `ingestion precheck failed: ${state.reason}`, meta: { runId: null, dryRun } },
          { status: 409 }
        );
      }
    }

    const flowPromise = inProcessRetry
      ? withRetry(
          () => runPipelineFlow({ dryRun, mode, ...(skipIngestion ? { skipIngestion: true } : {}) }),
          { retries: 3, delaysMs: [60_000, 5 * 60_000, 15 * 60_000] }
        )
      : runPipelineFlow({ dryRun, mode, ...(skipIngestion ? { skipIngestion: true } : {}) });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const timeoutError = new Error(`pipeline run timed out after ${syncTimeoutMs}ms`) as Error & {
          timedOut?: boolean;
          failedStep?: string;
          durationMs?: number;
          stepStatus?: Array<Record<string, unknown>>;
        };
        timeoutError.timedOut = true;
        timeoutError.failedStep = 'pipeline_sync_timeout';
        timeoutError.durationMs = syncTimeoutMs;
        timeoutError.stepStatus = [];
        reject(timeoutError);
      }, syncTimeoutMs);
    });

    const result = await Promise.race([flowPromise, timeoutPromise]);

    return NextResponse.json({
      ok: true,
      result,
      meta: {
        runId: result.recommendation.runId,
        dryRun,
        mode,
        durationMs: result.durationMs,
        timedOut: false,
        failedStep: null,
        stepStatus: result.stepStatus || [],
        ingestionRunId: result.ingestion.runId,
        deepDiveRunId: result.deepDive.runId,
        startedRoles: result.recommendation.startedRoles,
      },
    });
  } catch (error) {
    const typedError = error as Error & {
      timedOut?: boolean;
      failedStep?: string;
      durationMs?: number;
      stepStatus?: Array<Record<string, unknown>>;
    };
    await sendOpsAlert({
      level: 'critical',
      title: 'StockInsider pipeline failed',
      message: typedError.message,
      context: {
        dryRun,
        mode,
        timedOut: Boolean(typedError.timedOut),
        failedStep: typedError.failedStep || null,
        durationMs: typedError.durationMs || null,
      },
    }).catch(() => undefined);

    return NextResponse.json(
      {
        ok: false,
        error: typedError.message,
        meta: {
          runId: null,
          dryRun,
          mode,
          timedOut: Boolean(typedError.timedOut),
          failedStep: typedError.failedStep || null,
          durationMs: typedError.durationMs || null,
          stepStatus: typedError.stepStatus || [],
        },
      },
      { status: 500 }
    );
  }
}
