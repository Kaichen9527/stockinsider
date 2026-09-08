import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { THREADS_KEYWORD_SEARCH_URL, THREADS_ME_URL, assertDedicatedThreadsAppConfigured } from '@/lib/threads-api';
import { getThreadsTokenForRun, recordThreadsPublicSearchCanary } from '@/lib/threads-token';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function graphJson<T>(endpoint: URL): Promise<T> {
  const response = await fetch(endpoint, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`threads_canary_http_${response.status}`);
  return response.json() as Promise<T>;
}

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'internal_api_key_bearer_required' }, { status: 401 });
  }
  try {
    assertDedicatedThreadsAppConfigured();
    const query = String(process.env.THREADS_PUBLIC_CANARY_QUERY || '').trim();
    if (query.length < 2 || query.length > 80) throw new Error('threads_public_canary_query_missing');
    const token = await getThreadsTokenForRun();
    const meEndpoint = new URL(THREADS_ME_URL);
    meEndpoint.searchParams.set('fields', 'id,username');
    meEndpoint.searchParams.set('access_token', token.token);
    const me = await graphJson<{ id?: string; username?: string }>(meEndpoint);
    if (!me.id || !me.username) throw new Error('threads_canary_self_identity_missing');

    const searchEndpoint = new URL(THREADS_KEYWORD_SEARCH_URL);
    searchEndpoint.searchParams.set('q', query);
    searchEndpoint.searchParams.set('search_type', 'RECENT');
    searchEndpoint.searchParams.set('fields', 'id,username,permalink,timestamp');
    searchEndpoint.searchParams.set('limit', '25');
    searchEndpoint.searchParams.set('access_token', token.token);
    const result = await graphJson<{ data?: Array<{ id?: string; username?: string; permalink?: string; timestamp?: string }> }>(searchEndpoint);
    const self = me.username.replace(/^@/u, '').toLocaleLowerCase('en-US');
    const publicPost = (result.data || []).find((row) => row.id && row.permalink && String(row.username || '').trim()
      && String(row.username || '').replace(/^@/u, '').toLocaleLowerCase('en-US') !== self);
    if (!publicPost?.id) throw new Error('threads_non_self_public_post_canary_failed');
    const observedAt = new Date().toISOString();
    const receipt = {
      observedAt,
      selfUsernameHash: hash(self),
      publicPostIdHash: hash(publicPost.id),
      queryHash: hash(query),
      tokenHash: token.tokenHash,
    };
    await recordThreadsPublicSearchCanary(receipt);
    return NextResponse.json({
      ok: true,
      status: 'non_self_public_post_verified',
      receipt,
      activationRequired: 'set THREADS_OFFICIAL_CANARY_ACTIVE=true only after reviewing this receipt',
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false, status: 'blocked_auth', error: (error as Error).message }, {
      status: 409,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
