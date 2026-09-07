import { NextResponse } from 'next/server';
import { normalizeFinMindToken, verifyFinMindToken } from '@/lib/finmind-token-bootstrap.ts';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { requireActiveVpsWriter } from '@/lib/taiwan-data-runtime';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).sort().join(',') !== 'token') {
    return NextResponse.json({ ok: false, error: 'invalid_finmind_bootstrap_payload' }, { status: 422 });
  }
  const token = normalizeFinMindToken((raw as Record<string, unknown>).token);
  if (!token) return NextResponse.json({ ok: false, error: 'invalid_finmind_token' }, { status: 422 });
  try {
    const canary = await verifyFinMindToken(token);
    const stored = await writer.supabase.rpc('bootstrap_stockinsider_finmind_api_token_v6', {
      p_secret: token,
      p_token_hash: canary.tokenHash,
    });
    if (stored.error || !stored.data) throw new Error(`finmind_vault_write_failed:${stored.error?.message || 'missing'}`);
    return NextResponse.json({ ok: true, verified: true, canaryRows: canary.rowCount });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : 'finmind_bootstrap_failed' }, { status: 422 });
  }
}
