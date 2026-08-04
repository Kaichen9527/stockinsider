import { NextResponse } from 'next/server';
import { getGovernanceContractSummary } from '@/lib/domain';
import { requireInternalAuth } from '@/lib/internal-auth';

export async function GET(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const result = await getGovernanceContractSummary();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
