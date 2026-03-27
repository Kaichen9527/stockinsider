import { NextResponse } from 'next/server';
import { runDeepDiveBuild } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);
    const symbol = body?.symbol ? String(body.symbol).toUpperCase() : undefined;
    const result = await runDeepDiveBuild({ dryRun, symbol });
    return NextResponse.json({ ok: true, result, meta: { runId: result.runId, dryRun, startedRoles: result.startedRoles } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
