import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { runRevaluationQueue } from '@/lib/domain';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const body = await req.json().catch(() => ({}));
    const symbols = Array.isArray(body?.symbols)
      ? body.symbols.map((item: unknown) => String(item).toUpperCase()).filter(Boolean)
      : undefined;
    const connectors = Array.isArray(body?.connectors)
      ? body.connectors.map((item: unknown) => String(item)).filter(Boolean)
      : undefined;
    const maxSymbols = Number.isFinite(Number(body?.maxSymbols)) ? Number(body.maxSymbols) : undefined;
    const result = await runRevaluationQueue({
      dryRun: Boolean(body?.dryRun),
      symbols,
      connectors,
      maxSymbols,
    });
    return NextResponse.json({ ok: true, result, meta: { runId: result.runId } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
