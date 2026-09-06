import { NextResponse } from 'next/server';
import { runStockResearchRefresh } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';
import { acquireProductionWriteLease, releaseProductionWriteLease } from '@/lib/production-write-lease';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let leaseOwner: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const symbol = String(body?.symbol || '').toUpperCase();
    if (!symbol) {
      return NextResponse.json({ ok: false, error: 'symbol is required' }, { status: 400 });
    }

    const dryRun = Boolean(body?.dryRun);
    if (!dryRun) {
      leaseOwner = await acquireProductionWriteLease(3_600);
      if (!leaseOwner) {
        return NextResponse.json({ ok: false, error: 'production_write_cycle_already_running' }, { status: 409 });
      }
    }
    const result = await runStockResearchRefresh({
      symbol,
      force: Boolean(body?.force),
      reason: body?.reason ? String(body.reason) : undefined,
      dryRun,
      connectors: Array.isArray(body?.connectors) ? body.connectors.map((item: unknown) => String(item)) : undefined,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  } finally {
    if (leaseOwner) await releaseProductionWriteLease(leaseOwner).catch(() => undefined);
  }
}

export async function GET(req: Request) {
  return POST(req);
}
