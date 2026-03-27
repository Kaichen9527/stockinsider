import { NextResponse } from 'next/server';
import { getLineDispatchDiagnostics } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';

export async function GET(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(req.url);
    const hoursParam = Number(url.searchParams.get('hours') || '24');
    const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? Math.min(hoursParam, 168) : 24;
    const result = await getLineDispatchDiagnostics(hours);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
