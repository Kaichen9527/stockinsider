import { NextResponse } from 'next/server';
import { getWeeklyRadarData } from '@/lib/domain';

export async function GET() {
  try {
    const data = await getWeeklyRadarData();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
