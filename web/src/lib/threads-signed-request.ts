import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const MAX_SIGNED_REQUEST_BYTES = 16 * 1024;
const MAX_SIGNED_REQUEST_AGE_SECONDS = 24 * 60 * 60;

export type ThreadsSignedRequestPayload = {
  algorithm?: string;
  issued_at?: number;
  user_id: string;
};

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('threads_signed_request_encoding_invalid');
  return Buffer.from(value, 'base64url');
}

export function verifyThreadsSignedRequest(
  signedRequest: string,
  appSecret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): ThreadsSignedRequestPayload {
  if (!appSecret || appSecret.length < 16) throw new Error('threads_app_secret_missing');
  if (!signedRequest || Buffer.byteLength(signedRequest, 'utf8') > MAX_SIGNED_REQUEST_BYTES) {
    throw new Error('threads_signed_request_invalid');
  }
  const [encodedSignature, encodedPayload, extra] = signedRequest.split('.');
  if (!encodedSignature || !encodedPayload || extra) throw new Error('threads_signed_request_invalid');

  const supplied = decodeBase64Url(encodedSignature);
  const expected = createHmac('sha256', appSecret).update(encodedPayload).digest();
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error('threads_signed_request_signature_invalid');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8'));
  } catch {
    throw new Error('threads_signed_request_payload_invalid');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('threads_signed_request_payload_invalid');
  }
  const value = payload as Record<string, unknown>;
  if (value.algorithm != null && String(value.algorithm).toUpperCase() !== 'HMAC-SHA256') {
    throw new Error('threads_signed_request_algorithm_invalid');
  }
  const userId = typeof value.user_id === 'string' ? value.user_id : '';
  if (!/^[0-9]{1,32}$/u.test(userId)) throw new Error('threads_signed_request_user_invalid');
  const issuedAt = Number(value.issued_at);
  if (!Number.isInteger(issuedAt)
    || issuedAt > nowSeconds + 300
    || issuedAt < nowSeconds - MAX_SIGNED_REQUEST_AGE_SECONDS) {
    throw new Error('threads_signed_request_expired');
  }
  return { algorithm: value.algorithm as string | undefined, issued_at: issuedAt, user_id: userId };
}

export function hashThreadsUserId(userId: string, configuredAppId = process.env.THREADS_APP_ID): string {
  const appId = String(configuredAppId || '').trim();
  if (!appId) throw new Error('threads_app_id_missing');
  return createHash('sha256').update(`${appId}:${userId}`, 'utf8').digest('hex');
}

export function createThreadsDeletionConfirmationCode(signedRequest: string, appSecret: string): string {
  if (!appSecret || appSecret.length < 16) throw new Error('threads_app_secret_missing');
  return createHmac('sha256', appSecret).update(`threads-deletion:${signedRequest}`, 'utf8').digest('base64url');
}

export function hashThreadsDeletionConfirmationCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

export function hashThreadsSignedRequest(signedRequest: string): string {
  return createHash('sha256').update(signedRequest, 'utf8').digest('hex');
}

export function threadsDeletionStatusUrl(confirmationCode: string, redirectUri: string): string {
  const origin = new URL(redirectUri).origin;
  const configuredOrigin = new URL(String(process.env.STOCKINSIDER_PUBLIC_ORIGIN
    || 'https://stockinsider-three.vercel.app')).origin;
  const localhost = new URL(redirectUri).hostname === 'localhost';
  if ((origin !== configuredOrigin || !origin.startsWith('https://')) && !localhost) {
    throw new Error('threads_deletion_status_origin_invalid');
  }
  return new URL(`/api/auth/threads/data-deletion?code=${encodeURIComponent(confirmationCode)}`, origin).toString();
}

export async function readThreadsSignedRequest(request: Request): Promise<string> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_SIGNED_REQUEST_BYTES) {
    throw new Error('threads_signed_request_too_large');
  }
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    throw new Error('threads_signed_request_content_type_invalid');
  }
  const body = await request.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_SIGNED_REQUEST_BYTES) {
    throw new Error('threads_signed_request_too_large');
  }
  const signedRequest = new URLSearchParams(body).get('signed_request') || '';
  if (!signedRequest) throw new Error('threads_signed_request_missing');
  return signedRequest;
}
