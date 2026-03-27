import { NextResponse } from 'next/server';
import { getSourceEntityDetail } from '@/lib/research-v2';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await getSourceEntityDetail(id);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
