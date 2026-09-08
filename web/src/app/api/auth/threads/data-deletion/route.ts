import { NextResponse } from 'next/server';
import { threadsRedirectUri } from '@/lib/threads-api';
import { readThreadsDeletionStatus, revokeThreadsCredential } from '@/lib/threads-revocation';
import { processThreadsLifecycleCallback } from '@/lib/threads-lifecycle-callback';

export async function POST(request: Request) {
  try {
    const body = await processThreadsLifecycleCallback({
      appId: String(process.env.THREADS_APP_ID || ''),
      appSecret: String(process.env.THREADS_APP_SECRET || ''),
      kind: 'data_deletion',
      redirectUri: threadsRedirectUri(),
      request,
      revoke: revokeThreadsCredential,
    });
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'threads_data_deletion_failed';
    const status = message.startsWith('threads_signed_request') ? 400 : 500;
    return NextResponse.json({ error: message }, {
      status,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}

export async function GET(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get('code') || '';
    const result = await readThreadsDeletionStatus(code);
    if (!result) {
      return NextResponse.json({ found: false }, {
        status: 404,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }
    return NextResponse.json({ found: true, ...result }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json({ found: false, error: 'threads_deletion_status_unavailable' }, {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
