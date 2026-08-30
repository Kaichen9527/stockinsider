import { NextResponse } from 'next/server';
import { runMonitoringChecks } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';
import { sendOpsAlert } from '@/lib/alerts';

// Vercel cron triggers via GET
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
    const result = await runMonitoringChecks();
    if (!dryRun) {
      for (const alert of result.alerts) {
        const delivery = await sendOpsAlert({
          level: alert.level,
          title: `StockInsider monitor: ${alert.type}`,
          message: alert.message,
          context: alert.context,
        });
        if (!delivery.delivered) throw new Error(`ops_alert_not_delivered:${delivery.reason}`);
      }
    }

    return NextResponse.json({
      ok: true,
      result,
      meta: { runId: null, dryRun },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message, meta: { runId: null, dryRun } },
      { status: 500 }
    );
  }
}
