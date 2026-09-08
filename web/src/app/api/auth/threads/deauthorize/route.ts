import { NextResponse } from 'next/server';
import { revokeThreadsCredential } from '@/lib/threads-revocation';
import { processThreadsLifecycleCallback } from '@/lib/threads-lifecycle-callback';

export async function POST(request: Request) {
  try {
    const body = await processThreadsLifecycleCallback({
      appId: String(process.env.THREADS_APP_ID || ''),
      appSecret: String(process.env.THREADS_APP_SECRET || ''),
      kind: 'deauthorize',
      redirectUri: String(process.env.THREADS_REDIRECT_URI || ''),
      request,
      revoke: revokeThreadsCredential,
    });
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'threads_deauthorization_failed';
    const status = message.startsWith('threads_signed_request') ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, {
      status,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
