import { NextRequest, NextResponse } from 'next/server';

const REDIRECT_HOSTS = new Set(['stockinsider-three.vercel.app', 'stockinsider-three-one.vercel.app']);
const CANONICAL_ORIGIN = 'http://5.104.83.211';

export function proxy(request: NextRequest) {
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '')
    .split(':')[0]
    .toLowerCase();
  if (!REDIRECT_HOSTS.has(host)) return NextResponse.next();
  const destination = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, CANONICAL_ORIGIN);
  return NextResponse.redirect(destination, 308);
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
