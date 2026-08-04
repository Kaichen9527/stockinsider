import { NextResponse } from 'next/server';
import { runStockResearchRefresh } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await req.json().catch(() => ({}));
    const symbol = String(body?.symbol || '').toUpperCase();
    if (!symbol) {
      return NextResponse.json({ ok: false, error: 'symbol is required' }, { status: 400 });
    }

    const result = await runStockResearchRefresh({
      symbol,
      force: Boolean(body?.force),
      reason: body?.reason ? String(body.reason) : undefined,
      dryRun: Boolean(body?.dryRun),
      connectors: Array.isArray(body?.connectors) ? body.connectors.map((item: unknown) => String(item)) : undefined,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
