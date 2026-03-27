import { NextResponse } from 'next/server';
import { getThemeDetail } from '@/lib/domain';

export async function GET(_req: Request, context: { params: Promise<{ theme: string }> }) {
  try {
    const { theme } = await context.params;
    const data = await getThemeDetail(theme);
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
