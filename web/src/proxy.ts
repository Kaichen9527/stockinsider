import { NextRequest, NextResponse } from 'next/server';

const LEGACY_HOST = 'stockinsider-three-one.vercel.app';
const CANONICAL_ORIGIN = 'https://stockinsider-three.vercel.app';

export function proxy(request: NextRequest) {
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '')
    .split(':')[0]
    .toLowerCase();
  if (host !== LEGACY_HOST) return NextResponse.next();
  const destination = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, CANONICAL_ORIGIN);
  return NextResponse.redirect(destination, 308);
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
