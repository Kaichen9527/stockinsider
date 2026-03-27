import { NextResponse } from 'next/server';
import { getStockDeepDiveLookup } from '@/lib/domain';

export async function GET(_req: Request, context: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await context.params;
    const lookup = await getStockDeepDiveLookup(symbol.toUpperCase());
    if (lookup.status === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (lookup.status === 'pending') {
      return NextResponse.json(lookup.data, { status: 202 });
    }
    return NextResponse.json(lookup.data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
