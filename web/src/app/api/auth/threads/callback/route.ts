import { NextResponse } from 'next/server';
import { verifyThreadsOAuthState } from '@/lib/threads-api';
import { exchangeThreadsAuthorizationCodeAndPersist } from '@/lib/threads-token';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const rawCookieState = request.headers.get('cookie')?.match(/(?:^|;\s*)stockinsider_threads_oauth_state=([^;]+)/u)?.[1] || '';
  let cookieState = '';
  try { cookieState = decodeURIComponent(rawCookieState); } catch { cookieState = ''; }
  if (!state || !cookieState || state !== cookieState || !verifyThreadsOAuthState(state)) {
    return NextResponse.json({ ok: false, error: 'threads_oauth_state_invalid' }, {
      status: 400,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  try {
    const result = await exchangeThreadsAuthorizationCodeAndPersist(code);
    const response = NextResponse.json({
      ok: true,
      status: 'token_stored_in_vault',
      expiresAt: result.expiresAt,
      nextStep: 'run_internal_threads_public_search_canary',
    }, { headers: { 'Cache-Control': 'private, no-store' } });
    response.cookies.set('stockinsider_threads_oauth_state', '', {
      httpOnly: true, secure: true, sameSite: 'lax', maxAge: 0, path: '/api/auth/threads/callback',
    });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, {
      status: 502,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
