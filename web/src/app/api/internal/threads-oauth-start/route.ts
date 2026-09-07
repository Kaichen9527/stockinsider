import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { buildThreadsAuthorizationUrl, createThreadsOAuthState } from '@/lib/threads-api';

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'internal_api_key_bearer_required' }, { status: 401 });
  }
  try {
    const state = createThreadsOAuthState();
    const response = NextResponse.json({
      ok: true,
      authorizationUrl: buildThreadsAuthorizationUrl(state),
      expiresInSeconds: 600,
      requiredScopes: ['threads_basic', 'threads_keyword_search'],
    }, { headers: { 'Cache-Control': 'private, no-store' } });
    response.cookies.set('stockinsider_threads_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/api/auth/threads/callback',
    });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 409 });
  }
}
