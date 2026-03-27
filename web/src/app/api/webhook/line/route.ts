import { NextResponse } from 'next/server';
import { Client as LineClient, validateSignature } from '@line/bot-sdk';
import { bindLinePreference, isValidLineUserId } from '@/lib/domain';

type LineEvent = {
  type?: string;
  replyToken?: string;
  message?: { type?: string; text?: string };
  source?: { userId?: string };
};

function getLineClient() {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required');
  }
  return new LineClient({ channelAccessToken });
}

function parseBindSymbols(text: string): string[] {
  return text
    .replace('/bind', '')
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

async function replyText(client: LineClient, replyToken: string | undefined, text: string) {
  if (!replyToken) return;
  if (replyToken === '00000000000000000000000000000000') return;
  await client.replyMessage(replyToken, { type: 'text', text });
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-line-signature') || '';
    const channelSecret = process.env.LINE_CHANNEL_SECRET || '';

    if (!channelSecret || !signature) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const isValid = validateSignature(rawBody, channelSecret, signature);
    if (!isValid) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const events: LineEvent[] = Array.isArray(body.events) ? body.events : [];
    const lineClient = getLineClient();

    for (const event of events) {
      const userId = String(event.source?.userId || '');
      if (userId && isValidLineUserId(userId)) {
        await bindLinePreference({
          lineUserId: userId,
          watchlist: [],
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

      if (event.type !== 'message' || event.message?.type !== 'text') {
        continue;
      }

      const text = String(event.message?.text || '').trim();
      if (!userId || !isValidLineUserId(userId)) continue;

      if (text.startsWith('/bind')) {
        const symbols = parseBindSymbols(text);
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

        const reply = symbols.length > 0
          ? `已完成綁定，追蹤清單：${symbols.join(', ')}`
          : '已完成綁定，請用 /bind 2330,2454 設定追蹤清單';
        await replyText(lineClient, event.replyToken, reply);
        continue;
      }

      if (text === '/help') {
        await replyText(lineClient, event.replyToken, '可用指令：\n/bind 2330,2454\n/help');
        continue;
      }

      await replyText(lineClient, event.replyToken, '指令不支援。請使用 /help 查看可用指令。');
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    console.error(err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
