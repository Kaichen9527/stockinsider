import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { stockInsiderDataPlaneMode } from '@/lib/data-plane-runtime.ts';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { readProviderCredential, readProviderCredentialState, replaceProviderCredential } from '@/lib/provider-credential-store.ts';
import { requireActiveVpsWriter } from '@/lib/taiwan-data-runtime';
import { acquireProductionWriteLease, releaseProductionWriteLease } from '@/lib/production-write-lease.ts';

export const runtime = 'nodejs';

type Provider = 'threads' | 'finmind';

function parseBody(value: unknown): { provider: Provider; token: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(',') !== 'provider,token'
    || !['threads', 'finmind'].includes(String(input.provider))
    || typeof input.token !== 'string' || input.token.length < 16 || input.token.length > 16_384
    || /[\u0000-\u001f\u007f]/u.test(input.token)) return null;
  return { provider: input.provider as Provider, token: input.token };
}

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  }
  if (stockInsiderDataPlaneMode() !== 'contabo') {
    return NextResponse.json({ ok: false, error: 'provider_recovery_contabo_only' }, { status: 409 });
  }
  let input: ReturnType<typeof parseBody>;
  try { input = parseBody(await request.json()); }
  catch { input = null; }
  if (!input) return NextResponse.json({ ok: false, error: 'provider_recovery_payload_invalid' }, { status: 422 });
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  let leaseOwner: string | null = null;
  try {
    const prior = await readProviderCredentialState({ provider: input.provider, client: writer.supabase });
    if (prior) {
      if (prior.status !== 'valid') {
        return NextResponse.json({ ok: false, error: 'provider_recovery_existing_state_conflict' }, { status: 409 });
      }
      const current = await readProviderCredential({ provider: input.provider, client: writer.supabase });
      const supplied = Buffer.from(input.token, 'utf8');
      try {
        if (current.plaintext.length !== supplied.length || !timingSafeEqual(current.plaintext, supplied)) {
          return NextResponse.json({ ok: false, error: 'provider_recovery_existing_token_conflict' }, { status: 409 });
        }
        return NextResponse.json({ ok: true, provider: input.provider, generation: prior.generation,
          tokenSha256: createHash('sha256').update(supplied).digest('hex'), idempotentReplay: true });
      } finally { current.plaintext.fill(0); supplied.fill(0); }
    }
    let expiresAt: string | null = null;
    let ownerUserIdHash: string | null = null;
    if (input.provider === 'threads') {
      const registry = await writer.supabase.from('source_credentials_registry').select('metadata')
        .eq('platform', 'threads').maybeSingle();
      if (registry.error) throw new Error(`provider_recovery_registry_failed:${registry.error.message}`);
      const metadata = registry.data?.metadata && typeof registry.data.metadata === 'object'
        ? registry.data.metadata as Record<string, unknown> : {};
      expiresAt = typeof metadata.expires_at === 'string' && !Number.isNaN(Date.parse(metadata.expires_at))
        ? new Date(metadata.expires_at).toISOString() : null;
      ownerUserIdHash = typeof metadata.owner_user_id_hash === 'string'
        && /^[0-9a-f]{64}$/u.test(metadata.owner_user_id_hash) ? metadata.owner_user_id_hash : null;
      if (!ownerUserIdHash) throw new Error('provider_recovery_threads_owner_missing');
    }
    leaseOwner = await acquireProductionWriteLease(300);
    if (!leaseOwner) return NextResponse.json({ ok: false, error: 'production_write_cycle_already_running' }, { status: 409 });
    const plaintext = Buffer.from(input.token, 'utf8');
    try {
      const stored = await replaceProviderCredential({ provider: input.provider, plaintext,
        expectedGeneration: 0, credentialId: randomUUID(),
        keyVersion: String(process.env.STOCKINSIDER_PROVIDER_KEY_VERSION || 'v1'),
        expiresAt, ownerUserIdHash, client: writer.supabase });
      return NextResponse.json({ ok: true, provider: input.provider, generation: stored.generation,
        tokenSha256: stored.tokenSha256 });
    } finally { plaintext.fill(0); }
  } catch (cause) {
    return NextResponse.json({ ok: false,
      error: cause instanceof Error ? cause.message : 'provider_recovery_import_failed' }, { status: 422 });
  } finally {
    if (leaseOwner) await releaseProductionWriteLease(leaseOwner).catch(() => undefined);
    input.token = '';
  }
}
