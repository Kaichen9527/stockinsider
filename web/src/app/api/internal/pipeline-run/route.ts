import { NextResponse } from 'next/server';
import { sendOpsAlert } from '@/lib/alerts';
import { getLatestIngestionState, runPipelineFlow } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';
import { withRetry } from '@/lib/retry';
import {
  acquireProductionWriteLease,
  PRODUCTION_WRITE_LEASE_STALE_AFTER_SECONDS,
  recoverStaleProductionWriteLease,
  releaseProductionWriteLease,
} from '@/lib/production-write-lease';
import { requireActiveVpsWriter } from '@/lib/taiwan-data-runtime';
import { isTaiwanRefreshResearchReady } from '@/lib/taiwan-candidate-refresh';
import { CANDIDATE_RESEARCH_MODEL_VERSION } from '@/lib/candidate-research';

// Vercel only hosts the HTTPS OAuth/policy surface. Production pipeline writes
// run on the VPS systemd scheduler, while Hobby deployments reject values >300.
export const maxDuration = 300;

// Vercel cron triggers via GET
export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (process.env.VERCEL === '1') {
    return NextResponse.json({ ok: false, error: 'production_writer_runtime_forbidden' }, { status: 409 });
  }

  const writer = await requireActiveVpsWriter();
  if (!writer.ok) {
    return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  }

  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true || url.searchParams.get('dryRun') === 'true';
  const skipIngestion = body?.skipIngestion === true || url.searchParams.get('skipIngestion') === 'true';
  const modeParam = String(body?.mode || url.searchParams.get('mode') || '');
  const mode = modeParam === 'full' ? 'full' : modeParam === 'core' ? 'core' : dryRun ? 'full' : 'core';
  const inProcessRetry = body?.inProcessRetry === true;
  const syncTimeoutMs = Number(body?.syncTimeoutMs || process.env.PIPELINE_SYNC_TIMEOUT_MS || 18_000);
  const recoverOrphanedLease = body?.recoverOrphanedLease === true;
  const skipIfResearchSessionComplete = body?.skipIfResearchSessionComplete === true;
  const leaseTtlSeconds = Math.max(60, Math.min(7_200, Math.ceil(syncTimeoutMs / 1000) + 300));
  let leaseOwner: string | null = null;
  let ongoingFlow: Promise<Awaited<ReturnType<typeof runPipelineFlow>>> | null = null;
  let flowFinished = false;
  let researchSession: string | undefined;
  let researchCutoffAt: string | undefined;

  try {
    if (!dryRun && skipIfResearchSessionComplete) {
      const taipeiToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const sessionsRead = await writer.supabase.from('tw_trading_sessions_v3').select('session_id')
        .eq('status', 'completed').lte('session_id', taipeiToday).lte('close_at', new Date().toISOString())
        .order('session_id', { ascending: false }).limit(20);
      if (sessionsRead.error) throw new Error(`research_resume_sessions_failed:${sessionsRead.error.message}`);
      const sessions = (sessionsRead.data || []).map((row) => String(row.session_id || ''))
        .filter((session) => /^\d{4}-\d{2}-\d{2}$/u.test(session));
      const readySessions: string[] = [];
      const cutoffBySession = new Map<string, string>();
      for (const session of sessions) {
        const progress = await writer.supabase.rpc('read_taiwan_data_refresh_progress_v6', {
          p_session_date: session, p_phase: 'final',
        });
        if (progress.error) throw new Error(`research_resume_progress_failed:${progress.error.message}`);
        if (isTaiwanRefreshResearchReady(progress.data)) {
          readySessions.push(session);
          const cutoffAt = String((progress.data as Record<string, unknown>).cutoffAt || '');
          if (Number.isFinite(Date.parse(cutoffAt))) cutoffBySession.set(session, cutoffAt);
        }
      }
      if (readySessions.length === 0) {
        return NextResponse.json({ ok: true, result: { skipped: true, reason: 'final_data_not_research_ready', researchSession: sessions[0] || null },
          meta: { runId: null, dryRun, mode, timedOut: false, failedStep: null, stepStatus: [] } });
      }
      const prior = await writer.supabase.from('candidate_research_runs').select('id,technical_session_date,status,failed_count')
        .in('technical_session_date', readySessions).eq('model_version', CANDIDATE_RESEARCH_MODEL_VERSION)
        .not('pipeline_run_id', 'is', null)
        .eq('status', 'success').eq('failed_count', 0)
        .order('finished_at', { ascending: false }).limit(100);
      if (prior.error) throw new Error(`research_resume_receipt_read_failed:${prior.error.message}`);
      const completed = new Set((prior.data || []).map((row) => String(row.technical_session_date || '')));
      researchSession = [...readySessions].sort().find((session) => !completed.has(session));
      if (!researchSession) {
        return NextResponse.json({ ok: true, result: { skipped: true, reason: 'research_sessions_already_completed', researchSessions: readySessions },
          meta: { runId: prior.data?.[0]?.id || null, dryRun, mode, timedOut: false, failedStep: null, stepStatus: [] } });
      }
      researchCutoffAt = cutoffBySession.get(researchSession);
      if (!researchCutoffAt) throw new Error('research_resume_cutoff_missing');
    }
    if (!dryRun) {
      leaseOwner = await acquireProductionWriteLease(leaseTtlSeconds);
      if (!leaseOwner && recoverOrphanedLease) {
        const recovered = await recoverStaleProductionWriteLease(
          Math.max(PRODUCTION_WRITE_LEASE_STALE_AFTER_SECONDS, leaseTtlSeconds),
        );
        if (recovered) leaseOwner = await acquireProductionWriteLease(leaseTtlSeconds);
      }
      if (!leaseOwner) return NextResponse.json({ ok: false, error: 'production_write_cycle_already_running' }, { status: 409 });
    }
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
          () => runPipelineFlow({ dryRun, mode, ...(skipIngestion ? { skipIngestion: true } : {}), ...(researchSession ? { researchSession, researchCutoffAt } : {}) }),
          { retries: 3, delaysMs: [60_000, 5 * 60_000, 15 * 60_000] }
        )
      : runPipelineFlow({ dryRun, mode, ...(skipIngestion ? { skipIngestion: true } : {}), ...(researchSession ? { researchSession, researchCutoffAt } : {}) });
    ongoingFlow = flowPromise;
    void flowPromise.then(() => { flowFinished = true; }, () => { flowFinished = true; });

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
  } finally {
    if (leaseOwner) {
      const owner = leaseOwner;
      if (ongoingFlow && !flowFinished) {
        void ongoingFlow.then(
          () => releaseProductionWriteLease(owner),
          () => releaseProductionWriteLease(owner),
        ).catch(() => undefined);
      } else {
        await releaseProductionWriteLease(owner).catch(() => undefined);
      }
    }
  }
}
