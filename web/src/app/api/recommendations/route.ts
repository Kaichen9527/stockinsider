import { NextResponse } from 'next/server';
import { getRecommendationList } from '@/lib/domain';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const market = url.searchParams.get('market') || undefined;
    const minScore = url.searchParams.get('minScore');
    const parsedMinScore = minScore ? Number(minScore) : undefined;

    const data = await getRecommendationList(market || undefined, Number.isFinite(parsedMinScore) ? parsedMinScore : undefined);
    return NextResponse.json({ items: data });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
