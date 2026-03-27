import { NextResponse } from 'next/server';
import { getDailyRadarData } from '@/lib/domain';

export async function GET() {
  try {
    const data = await getDailyRadarData();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
