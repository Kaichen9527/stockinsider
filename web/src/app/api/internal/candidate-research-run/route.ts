import { NextResponse } from 'next/server';
import { runCandidateResearchCanary } from '@/lib/domain';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { acquireProductionWriteLease, releaseProductionWriteLease } from '@/lib/production-write-lease';
import { requireActiveVpsWriter } from '@/lib/taiwan-data-runtime';

const BODY_LIMIT = 2_000;

function parseBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!Object.keys(body).every((key) => ['dryRun', 'symbols'].includes(key))
    || !Array.isArray(body.symbols) || body.symbols.length < 1 || body.symbols.length > 5
    || body.symbols.some((symbol) => typeof symbol !== 'string' || !/^\d{4}$/u.test(symbol))
    || (body.dryRun !== undefined && typeof body.dryRun !== 'boolean')) return null;
  return { dryRun: body.dryRun === true, symbols: [...new Set(body.symbols as string[])] };
}

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized_internal_writer' }, { status: 401 });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > BODY_LIMIT) {
    return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  }
  let parsed: ReturnType<typeof parseBody>;
  try { parsed = parseBody(JSON.parse(raw)); }
  catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 422 }); }
  if (!parsed) return NextResponse.json({ ok: false, error: 'invalid_candidate_research_canary_request' }, { status: 422 });

  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  let leaseOwner: string | null = null;
  try {
    if (!parsed.dryRun) {
      leaseOwner = await acquireProductionWriteLease(3_600);
      if (!leaseOwner) return NextResponse.json({ ok: false, error: 'production_write_cycle_already_running' }, { status: 409 });
    }
    const result = await runCandidateResearchCanary(parsed);
    return NextResponse.json({ ok: true, result, releaseId: writer.releaseId });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'candidate_research_canary_failed',
    }, { status: 500 });
  } finally {
    if (leaseOwner) await releaseProductionWriteLease(leaseOwner).catch(() => undefined);
  }
}
