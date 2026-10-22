import { NextResponse } from 'next/server';
import { vnextRoute } from '@/lib/vnext/http';
export async function POST(request: Request) {
  return await vnextRoute(request, 'vnext-research') || NextResponse.json({ ok: false, error: 'vnext_disabled' }, { status: 404 });
}
