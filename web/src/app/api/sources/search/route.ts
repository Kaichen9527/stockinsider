import { NextResponse } from 'next/server';
import { searchSourceDocuments } from '@/lib/domain';
import type { VerificationStatus } from '@/lib/types';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const data = await searchSourceDocuments({
      q: searchParams.get('q'),
      symbol: searchParams.get('symbol'),
      platform: searchParams.get('platform'),
      verificationStatus: (searchParams.get('verificationStatus') as VerificationStatus | null) || null,
      themeKey: searchParams.get('themeKey'),
      runId: searchParams.get('runId'),
      evidenceLevel: (searchParams.get('evidenceLevel') as '傳言層' | '佐證層' | '估值層' | null) || null,
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      includeContentSearch: searchParams.get('includeContent') === '1',
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      pageSize: searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : 25,
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
