import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { bindLinePreference } from '@/lib/domain';

// Minimal LINE Webhook skeleton
export async function POST(req: Request) {
    try {
        const rawBody = await req.text();
        const signature = req.headers.get('x-line-signature');
        const channelSecret = process.env.LINE_CHANNEL_SECRET;
        if (!channelSecret || !signature) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const hash = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
        const isValid =
            hash.length === signature.length &&
            crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
        if (!isValid) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const body = JSON.parse(rawBody);

        // Process events
        for (const event of body.events) {
            if (event.type === 'message' && event.message.type === 'text') {
                const userId = event.source.userId;
                const text: string = event.message.text || '';

                // /bind 2330,2454
                if (text.startsWith('/bind')) {
                    const symbols = text
                        .replace('/bind', '')
                        .split(',')
                        .map((x: string) => x.trim().toUpperCase())
                        .filter(Boolean);

                    await bindLinePreference({
                        lineUserId: userId,
                        watchlist: symbols,
                        eventPreferences: {
                            hit_target: true,
                            hit_stop_loss: true,
                            state_changed: true,
                            daily_digest: true,
                        },
                        digestEnabled: true,
                        throttleMinutes: 30,
                    });
                }
            }
        }

        return new NextResponse('OK', { status: 200 });
    } catch (err) {
        console.error(err);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
