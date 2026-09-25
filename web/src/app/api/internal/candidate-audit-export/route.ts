import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { auditUuid, exportCandidateAudit, type AuditRow, type CandidateAuditReader } from '@/lib/candidate-audit-export';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Authorization', 'X-Content-Type-Options': 'nosniff' };
const RUN = 'id,evaluation_at,status,candidate_count,completed_count,failed_count,partial_count,started_at,finished_at';

/** GET only. No outbox enqueue, claims, dossier creation, RPC or DB mutation. */
export async function GET(request: Request) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401, headers });
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => key !== 'runId') || url.searchParams.getAll('runId').length > 1) {
    return NextResponse.json({ ok: false, error: 'candidate_audit_query_invalid' }, { status: 400, headers });
  }
  const runId = url.searchParams.get('runId');
  if (runId !== null && !auditUuid(runId)) return NextResponse.json({ ok: false, error: 'candidate_audit_run_id_invalid' }, { status: 400, headers });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const db = getSupabaseServerClient();
    const rows = (result: { data: unknown; error: unknown }): AuditRow[] => {
      if (result.error || !Array.isArray(result.data)) throw new Error('candidate_audit_database_read_failed');
      return result.data as AuditRow[];
    };
    const reader: CandidateAuditReader = {
      run: async (id) => {
        let query = db.from('candidate_research_runs').select(RUN);
        query = id ? query.eq('id', id) : query.in('status', ['success', 'partial', 'failed']).order('finished_at', { ascending: false }).order('id', { ascending: false });
        const result = await query.limit(1).abortSignal(controller.signal);
        return rows(result)[0] ?? null;
      },
      items: async (id, offset, limit) => rows(await db.from('candidate_research_run_items')
        .select('id,run_id,stock_id,symbol,status,finished_at,detail_revision_id:metrics->>detailRevisionId')
        .eq('run_id', id).order('id').range(offset, offset + limit - 1).abortSignal(controller.signal)),
      details: async (ids, offset, limit) => rows(await db.from('candidate_detail_snapshots')
        .select('id,stock_id,research_run_id,session_date,available_at,as_of').in('id', ids)
        .order('id').range(offset, offset + limit - 1).abortSignal(controller.signal)),
      instruments: async (ids, cutoff, offset, limit) => rows(await db.from('stock_instruments_v3')
        .select('instrument_authority_id,stock_id,symbol,exchange,instrument_type,listing_status,official_name,provider,source_timestamp,recorded_at,valid_from,valid_to')
        .in('stock_id', ids).lte('recorded_at', cutoff).lte('source_timestamp', cutoff).lte('valid_from', cutoff)
        .or(`valid_to.is.null,valid_to.gt.${cutoff}`).order('instrument_authority_id')
        .range(offset, offset + limit - 1).abortSignal(controller.signal)),
    };
    const result = await exportCandidateAudit(reader, runId, new Date().toISOString());
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch (error) {
    const code = error instanceof Error && /^candidate_audit_[a-z_]+$/u.test(error.message) ? error.message : 'candidate_audit_unavailable';
    return NextResponse.json({ ok: false, error: code }, { status: controller.signal.aborted ? 504 : 409, headers });
  } finally { clearTimeout(timer); }
}
