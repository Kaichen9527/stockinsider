import { NextResponse } from 'next/server';
import { sendOpsAlert } from '@/lib/alerts';
import { runPipelineDispatchFlow } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';
import { requireActiveVpsWriter } from '@/lib/taiwan-data-runtime';

// Vercel only hosts the HTTPS OAuth/policy surface. Production pipeline writes
// run on the VPS systemd scheduler, while Hobby deployments reject values >300.
export const maxDuration = 300;

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (process.env.VERCEL === '1') {
    return NextResponse.json({ ok: false, error: 'production_writer_runtime_forbidden' }, { status: 409 });
  }

  const writer = await requireActiveVpsWriter();
  if (!writer.ok) {
    return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = Boolean(body?.dryRun);

  try {
    const result = await runPipelineDispatchFlow({ dryRun });
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
      title: 'StockInsider pipeline dispatch run failed',
      message: (error as Error).message,
      context: { dryRun },
    }).catch(() => undefined);

    return NextResponse.json(
      { ok: false, error: (error as Error).message, meta: { dryRun } },
      { status: 500 },
    );
  }
}
