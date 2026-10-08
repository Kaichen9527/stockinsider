import { NextResponse } from 'next/server';
import { processCandidateFinancialDocumentReceipts } from '@/lib/candidate-financial-document-worker';
import { acquireProductionWriteLease, releaseProductionWriteLease } from '@/lib/production-write-lease';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { requireActiveVpsWriter } from '@/lib/taiwan-data-runtime';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const limit = Number(body.limit ?? 5);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20 || Object.keys(body).some((key) => key !== 'limit')) {
    return NextResponse.json({ ok: false, error: 'invalid_candidate_financial_document_worker_request' }, { status: 422 });
  }
  let leaseOwner: string | null;
  try { leaseOwner = await acquireProductionWriteLease(3_600); }
  catch { return NextResponse.json({ ok: false, error: 'production_write_lease_unavailable' }, { status: 503 }); }
  if (!leaseOwner) return NextResponse.json({ ok: false, error: 'production_write_cycle_already_running' }, { status: 409 });
  try {
    const result = await processCandidateFinancialDocumentReceipts(limit);
    const hasErrors = result.reconciliationErrors.length > 0
      || result.results.some((item) => item.error || item.status === 'rejected' || item.status === 'partial'
        || item.status === 'validation_pending' || (item.missingRequirements?.length || 0) > 0);
    return NextResponse.json({ ok: !hasErrors, releaseId: writer.releaseId, result }, { status: hasErrors ? 500 : 200 });
  } finally {
    await releaseProductionWriteLease(leaseOwner);
  }
}
