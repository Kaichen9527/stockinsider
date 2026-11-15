import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { acquireTaiwanDataset, type TaiwanDataset, type TaiwanExchange, type TaiwanRefreshPhase } from '@/lib/taiwan-data-provider';
import { parseTaiwanQueueRequest, requireActiveVpsWriter, resolveLatestCompletedTaiwanSession } from '@/lib/taiwan-data-runtime';
import { readFinMindVaultToken } from '@/lib/finmind-vault';
import { isTaiwanRefreshComplete, isTaiwanRefreshResearchReady, parseTaiwanDrainOptions } from '@/lib/taiwan-candidate-refresh';
import { boundedOfficialCurlFetch } from '@/lib/bounded-official-curl-fetch';
import { classifyLaunchSourceJob, adoptClaimedLaunchSource, launchSourcesEnabled, prepareLaunchSources, drainLaunchSources } from '@/lib/vnext/launch-source-store';
import { vnextIdentity } from '@/lib/vnext/auth';

const BODY_LIMIT = 10_000;
const DRAIN_CONCURRENCY = 4;
const DRAIN_WALL_CLOCK_BUDGET_MS = 20 * 60_000;
type TaiwanQueueJob = { job_id: string; dataset: TaiwanDataset; symbol: string | null; exchange: TaiwanExchange; refresh_phase: TaiwanRefreshPhase; requested_session_date: string };

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok: false, error: 'unauthorized_internal_writer' }, { status: 401 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > BODY_LIMIT) return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 422 }); }
  const input = parseTaiwanDrainOptions(body);
  if (!input) return NextResponse.json({ ok: false, error: 'invalid_queue_drain_request' }, { status: 422 });
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  let sessionDate = input.sessionDate;
  if (input.phase && !sessionDate) {
    try {
      const today = parseTaiwanQueueRequest({ datasets: ['daily_price'], phase: input.phase, symbols: [] })!.sessionDate;
      sessionDate = await resolveLatestCompletedTaiwanSession(writer.supabase, today);
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'latest_completed_trading_session_missing' }, { status: 503 });
    }
  }
  const owner = `vps:${writer.releaseId}:${randomUUID()}`;
  const startedAt = Date.now();
  const terminalCounts: Record<string, number> = {};
  let finMindToken:Promise<string>|undefined;
  const licensedSources:Array<{jobId:string;attemptId:string;status:string;captureId:string|null}>=[];
  const sourceDispatchErrors:Array<{jobId:string;error:string}>=[];
  let sourcePrepass:{status:string;jobs:number;reason?:string;sourceAuthority:false;scope?:'current_and_history'|'history_only'|null;
    twseCloseJobs?:number;currentPlanStatus?:'planned'|'deferred'|'no_active_pool';currentReason?:string|null;calendarAuthority?:false}|null=null;
  let sourceNoActivePool=false;
  if(launchSourcesEnabled()){
    const identity=vnextIdentity(request);
    if(identity?.role!=='operator')return NextResponse.json({ok:false,error:'launch_source_operator_required'},{status:403});
    try{
      const plan=await prepareLaunchSources(identity);
      if(!('jobs' in plan)||!Number.isSafeInteger(plan.jobs))throw Error('launch_source_plan_unavailable');
      sourceNoActivePool=plan.status==='no_active_pool';
      sourcePrepass={status:plan.status,jobs:Number(plan.jobs),sourceAuthority:false,...(plan.status==='deferred'?{reason:plan.reason!}:{}),
        ...('scope' in plan?{scope:plan.scope,currentPlanStatus:plan.currentPlanStatus,currentReason:plan.currentReason,calendarAuthority:plan.calendarAuthority}:{}),
        ...(plan.twseCloseJobs===undefined?{}:{twseCloseJobs:plan.twseCloseJobs})};
      // Only fresh planning defers. Independently classified existing jobs still
      // use their original bound adoption or unbound queue authority below.
      if(plan.status==='planned'){
        const drained=await drainLaunchSources(identity,Math.min(input.limit,4));
        if(!('outcomes' in drained))throw Error('launch_source_drain_unavailable');
        licensedSources.push(...drained.outcomes);sourcePrepass.status=drained.outcomes.length?'processed':'no_pending';
        if(drained.outcomes.some(item=>item.status!=='recorded'))return NextResponse.json({ok:false,error:'launch_source_prepass_uncertain',result:{sourcePrepass,licensedSources}},{status:503});
      }
    }catch{return NextResponse.json({ok:false,error:'launch_source_prepass_unavailable',result:{sourcePrepass,licensedSources}},{status:503});}
  }
  const completenessByPublication = new Map<string, { sessionDate: string; phase: TaiwanRefreshPhase; datasets: Record<string, unknown> }>();
  const processed: Array<{ job: TaiwanQueueJob; result: Awaited<ReturnType<typeof acquireTaiwanDataset>>; persistence: string; disposition: string; error: string | null }> = [];
  let batches = 0;
  let budgetExhausted = false;
  for (; batches < input.maxBatches; batches += 1) {
    if (Date.now() - startedAt >= DRAIN_WALL_CLOCK_BUDGET_MS) { budgetExhausted = true; break; }
    const claimedAt = new Date();
    const claim = await writer.supabase.rpc('claim_taiwan_data_refresh_jobs_v6', {
      p_limit: input.limit, p_owner: owner, p_claimed_at: claimedAt.toISOString(),
      p_lease_expires_at: new Date(claimedAt.getTime() + 25 * 60_000).toISOString(),
      p_session_date: sessionDate, p_phase: input.phase,
    });
    if (claim.error) return NextResponse.json({ ok: false, error: `taiwan_data_claim_failed:${claim.error.message}`, result: { processed: processed.length, batches,sourcePrepass,licensedSources } }, { status: 500 });
    const jobs = (claim.data || []) as TaiwanQueueJob[];
    if (jobs.length === 0) break;
    for (let offset = 0; offset < jobs.length; offset += DRAIN_CONCURRENCY) {
      const scoped = await Promise.all(jobs.slice(offset, offset + DRAIN_CONCURRENCY).map(async (job) => {
        // Every genuine claim, including expired reclaims, is classified before
        // old JSON/provider/credential IO. Missing catalog is a cutover blocker.
        let dispatch:Awaited<ReturnType<typeof classifyLaunchSourceJob>>;
        try{dispatch=await classifyLaunchSourceJob(writer.supabase,job.job_id);}
        catch{sourceDispatchErrors.push({jobId:job.job_id,error:'launch_source_dispatch_unavailable'});return null;}
        return {job,dispatch};
      }));
      // CSV work owns the exclusive global lease. Serialize it, then release
      // every source lease before the unchanged parallel unbound JSON work.
      for(const item of scoped){
        if(item&&item.dispatch.bound){
          const {job,dispatch}=item;
          const identity=vnextIdentity(request);
          if(sourceNoActivePool||!dispatch.configured||!launchSourcesEnabled()||identity?.role!=='operator'){
            sourceDispatchErrors.push({jobId:job.job_id,error:'launch_source_bound_job_not_configured'});continue;
          }
          try{const receipt=await adoptClaimedLaunchSource(identity,job.job_id,owner);licensedSources.push(receipt);
            if(receipt.status!=='recorded')sourceDispatchErrors.push({jobId:job.job_id,error:'launch_source_completion_not_verified'});}
          catch{sourceDispatchErrors.push({jobId:job.job_id,error:'launch_source_owned_execution_unavailable'});}
        }
      }
      const batch=await Promise.all(scoped.filter((item):item is NonNullable<typeof item>=>item!==null&&!item.dispatch.bound).map(async({job})=>{
        const token=await(finMindToken??=readFinMindVaultToken().catch(()=>''));
        let result = await acquireTaiwanDataset(
          { dataset: job.dataset, symbol: job.symbol, exchange: job.exchange, phase: job.refresh_phase, sessionDate: job.requested_session_date },
          { finMindToken:token, ...(job.exchange === 'TPEX' ? { officialFetchImpl: boundedOfficialCurlFetch } : {}) },
        );
        let persistence = 'not_persisted';
        if (result.terminal === 'complete' && job.dataset === 'financial_statement') {
          // Financial statements are persisted by the period-aware acquisition
          // queue, never by this market-close dataset plane.
          result = { ...result, terminal: 'schema_invalid' as const, actionEligible: false, selectedProvider: null, selectedAuthorityTier: null, canonical: null };
        }
        if (result.terminal === 'complete' && job.symbol === null
          && (job.dataset === 'daily_valuation' || job.dataset === 'monthly_revenue')
          && result.selectedProvider === 'finmind') {
          // A mirror response cannot stand in for an exchange-wide official
          // response because that would create unbounded, unverifiable fan-out.
          result = { ...result, terminal: 'schema_invalid' as const, actionEligible: false, selectedProvider: null, selectedAuthorityTier: null, canonical: null };
        }
        if (result.terminal === 'complete' && result.canonical) {
          const persisted = await writer.supabase.rpc('persist_taiwan_data_canonical_result_v5', {
            p_job_id: job.job_id, p_owner: owner, p_result: result, p_persisted_at: new Date().toISOString(),
          });
          if (persisted.error || !persisted.data) {
            result = { ...result, terminal: 'network_error' as const, actionEligible: false, selectedProvider: null, selectedAuthorityTier: null, canonical: null };
          } else {
            persistence = 'persisted';
            result = { ...result, actionEligible: true };
          }
        }
        const complete = await writer.supabase.rpc('complete_taiwan_data_refresh_job_v5', {
          p_job_id: job.job_id, p_owner: owner, p_result: result, p_completed_at: new Date().toISOString(),
        });
        return { job, result, persistence, disposition: String(complete.data || 'terminal'), error: complete.error ? `taiwan_data_complete_failed:${complete.error.message}` : null };
      }));
      processed.push(...batch.filter((item):item is NonNullable<typeof item>=>item!==null));
    }
  }
  for (const item of processed) {
    if (item.error) continue;
    const { job, result, persistence, disposition } = item;
    terminalCounts[disposition === 'retry_scheduled' ? 'retry_scheduled' : result.terminal] = (terminalCounts[disposition === 'retry_scheduled' ? 'retry_scheduled' : result.terminal] || 0) + 1;
    if (disposition === 'retry_scheduled') continue;
    const publicationKey = `${job.requested_session_date}:${job.refresh_phase}`;
    const publication = completenessByPublication.get(publicationKey) || { sessionDate: job.requested_session_date, phase: job.refresh_phase, datasets: {} };
    publication.datasets[`${job.dataset}:${job.exchange}${job.symbol ? `:${job.symbol}` : ''}`] = {
      terminal: result.terminal, actionEligible: result.actionEligible,
      selectedProvider: result.selectedProvider, selectedAuthorityTier: result.selectedAuthorityTier, persistence,
    };
    completenessByPublication.set(publicationKey, publication);
  }
  const publication = await Promise.all([...completenessByPublication.values()].map(async (item) => {
    const metadata = await writer.supabase.rpc('record_taiwan_data_publication_metadata_v5', {
      p_session_date: item.sessionDate, p_publication_phase: item.phase,
      p_data_cutoff_at: new Date().toISOString(), p_dataset_completeness: item.datasets,
    });
    if (metadata.error) throw new Error(`taiwan_data_publication_metadata_failed:${metadata.error.message}`);
    return metadata.data;
  }));
  const legacyErrors=processed.flatMap((item)=>item.error?[{jobId:item.job.job_id,error:item.error}]:[]);
  const errors = [...legacyErrors,...sourceDispatchErrors];
  const progressRead = sessionDate && input.phase ? await writer.supabase.rpc('read_taiwan_data_refresh_progress_v6', {
    p_session_date: sessionDate, p_phase: input.phase,
  }) : { data: null, error: null };
  if (progressRead.error) return NextResponse.json({ ok: false, error: `taiwan_refresh_progress_failed:${progressRead.error.message}` }, { status: 500 });
  const scopeComplete = isTaiwanRefreshComplete(progressRead.data);
  const researchReady = isTaiwanRefreshResearchReady(progressRead.data);
  const scopeSettled = (progressRead.data as { settled?: boolean } | null)?.settled === true;
  const ok = errors.length === 0 && (!input.requireComplete || researchReady);
  return NextResponse.json({ ok, ...(!ok ? { error: errors.length ? 'taiwan_data_job_completion_failed' : 'taiwan_refresh_scope_incomplete' } : {}),
    result: { claimed: processed.length+new Set([...licensedSources.map(item=>item.jobId),...sourceDispatchErrors.map(item=>item.jobId)]).size,
      completed: processed.length-legacyErrors.length+licensedSources.filter(item=>item.status==='recorded').length, batches,
      budgetExhausted: budgetExhausted || (input.phase !== null && batches === input.maxBatches && !scopeSettled),
      status: scopeComplete ? 'complete' : researchReady ? 'partial_candidate_data' : 'incomplete',
      scopeComplete, dataComplete: scopeComplete, researchReady, progress: progressRead.data, phase: input.phase, sessionDate,
      terminalCounts, publication, errors, licensedSources,sourcePrepass, releaseId: writer.releaseId },
  }, { status: ok ? 200 : errors.length ? 500 : 503 });
}
