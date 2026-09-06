import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { acquireTaiwanDataset, type TaiwanDataset, type TaiwanExchange, type TaiwanRefreshPhase } from '@/lib/taiwan-data-provider';
import { requireActiveVpsWriter } from '@/lib/taiwan-data-runtime';

const BODY_LIMIT = 10_000;
const MAX_DRAIN_LIMIT = 100;
const DRAIN_CONCURRENCY = 4;

function parseLimit(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value as Record<string, unknown>).sort().join(',') !== 'limit') return null;
  const limit = (value as Record<string, unknown>).limit;
  return Number.isInteger(limit) && Number(limit) >= 1 && Number(limit) <= MAX_DRAIN_LIMIT ? Number(limit) : null;
}

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok: false, error: 'unauthorized_internal_writer' }, { status: 401 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > BODY_LIMIT) return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 422 }); }
  const limit = parseLimit(body);
  if (limit == null) return NextResponse.json({ ok: false, error: 'invalid_queue_drain_request' }, { status: 422 });
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  const claimedAt = new Date();
  const owner = `vps:${writer.releaseId}:${randomUUID()}`;
  const claim = await writer.supabase.rpc('claim_taiwan_data_refresh_jobs_v5', {
    p_limit: limit, p_owner: owner, p_claimed_at: claimedAt.toISOString(), p_lease_expires_at: new Date(claimedAt.getTime() + 25 * 60_000).toISOString(),
  });
  if (claim.error) return NextResponse.json({ ok: false, error: `taiwan_data_claim_failed:${claim.error.message}` }, { status: 500 });
  const jobs = (claim.data || []) as Array<{ job_id: string; dataset: TaiwanDataset; symbol: string | null; exchange: TaiwanExchange; refresh_phase: TaiwanRefreshPhase; requested_session_date: string }>;
  const terminalCounts: Record<string, number> = {};
  const completenessByPublication = new Map<string, { sessionDate: string; phase: TaiwanRefreshPhase; datasets: Record<string, unknown> }>();
  const processed: Array<{ job: typeof jobs[number]; result: Awaited<ReturnType<typeof acquireTaiwanDataset>>; persistence: string; disposition: string; error: string | null }> = [];
  for (let offset = 0; offset < jobs.length; offset += DRAIN_CONCURRENCY) {
    const batch = await Promise.all(jobs.slice(offset, offset + DRAIN_CONCURRENCY).map(async (job) => {
      let result = await acquireTaiwanDataset({ dataset: job.dataset, symbol: job.symbol, exchange: job.exchange, phase: job.refresh_phase, sessionDate: job.requested_session_date });
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
    processed.push(...batch);
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
  const errors = processed.flatMap((item) => item.error ? [{ jobId: item.job.job_id, error: item.error }] : []);
  return NextResponse.json({ ok: errors.length === 0, result: { claimed: jobs.length, completed: jobs.length - errors.length, terminalCounts, publication, errors, releaseId: writer.releaseId } }, { status: errors.length === 0 ? 200 : 500 });
}
