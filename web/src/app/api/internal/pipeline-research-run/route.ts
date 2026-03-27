import { NextResponse } from 'next/server';
import { sendOpsAlert } from '@/lib/alerts';
import { runPipelineResearchFlow } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = Boolean(body?.dryRun);

  try {
    const result = await runPipelineResearchFlow({ dryRun });
    return NextResponse.json({
      ok: true,
      result,
      meta: {
        dryRun,
        durationMs: result.durationMs,
      },
    });
  } catch (error) {
    await sendOpsAlert({
      level: 'critical',
      title: 'StockInsider pipeline research run failed',
      message: (error as Error).message,
      context: { dryRun },
    }).catch(() => undefined);

    return NextResponse.json(
      { ok: false, error: (error as Error).message, meta: { dryRun } },
      { status: 500 },
    );
  }
}
