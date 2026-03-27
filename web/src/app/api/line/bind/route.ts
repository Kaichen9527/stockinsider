import { NextResponse } from 'next/server';
import { bindLinePreference, isValidLineUserId } from '@/lib/domain';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.lineUserId) {
      return NextResponse.json({ error: 'lineUserId is required' }, { status: 400 });
    }
    if (!isValidLineUserId(String(body.lineUserId))) {
      return NextResponse.json(
        { error: 'lineUserId format invalid, expected LINE user id like Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
        { status: 400 }
      );
    }

    const result = await bindLinePreference({
      userId: body.userId,
      lineUserId: body.lineUserId,
      watchlist: Array.isArray(body.watchlist) ? body.watchlist : [],
      eventPreferences: body.eventPreferences || {
        hit_target: true,
        hit_stop_loss: true,
        daily_digest: true,
      },
      digestEnabled: body.digestEnabled !== false,
      throttleMinutes: Number.isFinite(Number(body.throttleMinutes)) ? Number(body.throttleMinutes) : 30,
    });

    return NextResponse.json({ ok: true, subscription: result });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
