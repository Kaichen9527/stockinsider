import type { VnextIdentity } from './auth.ts';
import { isHistoryDate } from '../candidate-price-history.ts';
import { isTaiwanRefreshResearchReady } from '../taiwan-candidate-refresh.ts';

type Job = { job_id: string };
type Queue = { session: string; queued: Job[]; transientFailures: Job[] };
type Receipt = { status: 'deferred'; reason: string } | {
  status: 'processed'; session: string; attempted: number; published: number; stopped: boolean;
};

const stop = (reason: string): Receipt => ({ status: 'deferred', reason });

function jobs(value: unknown): value is Job[] {
  return Array.isArray(value) && value.length <= 4 && value.every(job =>
    job !== null && typeof job === 'object' && typeof job.job_id === 'string'
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(job.job_id));
}

function readContext(data: unknown): Queue | string {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const row = data as Record<string, unknown>;
    if (row.session === null && typeof row.reason === 'string' && [
      'launch_research_mode_unavailable', 'launch_research_window_closed',
      'launch_research_official_session_missing', 'launch_research_both_venue_calendar_missing',
    ].includes(row.reason)) return row.reason;
    if (row.reason === null && typeof row.session === 'string' && isHistoryDate(row.session)
      && jobs(row.queued) && jobs(row.transientFailures)) {
      return { session: row.session, queued: row.queued, transientFailures: row.transientFailures };
    }
  }
  throw Error('launch_research_dispatch_context_unavailable');
}

export async function dispatchLaunchQueue(deps: {
  context(): Promise<unknown>;
  progress(session: string): Promise<unknown>;
  workerReady(): Promise<void>;
  retry(jobId: string): Promise<Record<string, unknown>>;
  run(jobId: string): Promise<Record<string, unknown>>;
}): Promise<Receipt> {
  const scope = readContext(await deps.context());
  if (typeof scope === 'string') return stop(scope);
  const { session, queued, transientFailures } = scope;
  if (!queued.length && !transientFailures.length) {
    return { status: 'processed', session, attempted: 0, published: 0, stopped: false };
  }
  if (!isTaiwanRefreshResearchReady(await deps.progress(session))) return stop('launch_research_final_data_unready');
  await deps.workerReady();

  let attempted = 0;
  let published = 0;
  let stopped = false;
  const seen = new Set<string>();
  for (const [item, retry] of [
    ...queued.map(job => [job, false] as const),
    ...transientFailures.map(job => [job, true] as const),
  ]) {
    if (attempted >= 4) break;
    if (seen.has(item.job_id)) continue;
    seen.add(item.job_id);
    const current = readContext(await deps.context());
    if (typeof current === 'string' || current.session !== session
      || !isTaiwanRefreshResearchReady(await deps.progress(session))) {
      stopped = true;
      break;
    }
    const eligible = retry ? current.transientFailures : current.queued;
    if (!eligible.some(job => job.job_id === item.job_id)) continue;
    let jobId = item.job_id;
    if (retry) {
      const receipt = await deps.retry(jobId);
      if (typeof receipt.jobId !== 'string') continue;
      jobId = receipt.jobId;
    }
    attempted++;
    const result = await deps.run(jobId);
    if (result.status === 'published' && result.replay !== true) published++;
  }
  return { status: 'processed', session, attempted, published, stopped };
}

export async function runScheduledLaunchResearch(identity: VnextIdentity): Promise<Receipt> {
  if (process.env.STOCKINSIDER_LAUNCH_RESEARCH_DISPATCH_ENABLED !== 'true') {
    return stop('launch_research_dispatch_disabled');
  }
  if (identity.role !== 'operator' || !identity.principal) throw Error('launch_research_operator_required');
  const { requireActiveVpsWriter } = await import('../taiwan-data-runtime.ts');
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return stop('launch_research_writer_unavailable');
  const [{ command }, { analysisWriter }, worker] = await Promise.all([
    import('./store.ts'), import('./analysis-runtime.ts'), import('./automatic-worker.ts'),
  ]);
  const dispatchStarted = performance.now();
  let calendarSyncTried = false;
  const readDispatchContext = async () => {
    const { data, error } = await writer.supabase.rpc('vnext_launch_dispatch_context_v1', {
      p_principal: identity.principal, p_writer_release: writer.releaseId,
    });
    if (error) throw Error('launch_research_dispatch_context_unavailable');
    return data;
  };
  return dispatchLaunchQueue({
    async context() {
      // Leave five minutes for in-flight author and review work inside the
      // scheduler's twelve-minute HTTP budget.
      if (performance.now() - dispatchStarted >= 7 * 60_000) {
        return { session: null, reason: 'launch_research_window_closed' };
      }
      const data = await readDispatchContext();
      if (data?.reason !== 'launch_research_official_session_missing' || calendarSyncTried) return data;
      calendarSyncTried = true;
      const { synchronizeScheduledLaunchCalendar } = await import('./calendar-sync.ts');
      const ready = await analysisWriter(() => synchronizeScheduledLaunchCalendar(identity));
      return ready ? readDispatchContext() : data;
    },
    async progress(session) {
      const { data, error } = await writer.supabase.rpc('read_taiwan_data_refresh_progress_v6', {
        p_session_date: session, p_phase: 'final',
      });
      if (error) throw Error('launch_research_final_progress_unavailable');
      return data;
    },
    workerReady: worker.requireScheduledLaunchWorker,
    retry: jobId => analysisWriter(() => command(identity, 'retry', { jobId })),
    run: worker.runAutomaticResearch,
  }).catch(() => { throw Error('launch_research_dispatch_unavailable'); });
}
