import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { validateExternalAgentProfile } from '@/lib/domain';

export async function POST(req: Request) {
  const auth = requireInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));
  const profileKey = body?.profileKey ? String(body.profileKey) : null;
  const agentRole = body?.agentRole ? String(body.agentRole) : '';
  if (!agentRole) {
    return NextResponse.json({ ok: false, error: 'agentRole is required' }, { status: 400 });
  }

  const result = validateExternalAgentProfile(profileKey, agentRole);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason, result }, { status: result.status });
  }

  return NextResponse.json({ ok: true, result });
}
