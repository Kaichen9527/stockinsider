import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const THREADS_GRAPH_ORIGIN = 'https://graph.threads.com';
export const THREADS_GRAPH_VERSION = 'v1.0';
export const THREADS_KEYWORD_SEARCH_URL = `${THREADS_GRAPH_ORIGIN}/${THREADS_GRAPH_VERSION}/keyword_search`;
export const THREADS_ME_URL = `${THREADS_GRAPH_ORIGIN}/${THREADS_GRAPH_VERSION}/me`;
export const THREADS_OAUTH_AUTHORIZE_URL = 'https://threads.net/oauth/authorize';
export const THREADS_OAUTH_TOKEN_URL = `${THREADS_GRAPH_ORIGIN}/oauth/access_token`;
export const THREADS_LONG_TOKEN_URL = `${THREADS_GRAPH_ORIGIN}/access_token`;
export const THREADS_REFRESH_TOKEN_URL = `${THREADS_GRAPH_ORIGIN}/refresh_access_token`;
export const THREADS_REQUIRED_SCOPES = ['threads_basic', 'threads_keyword_search'] as const;

const OAUTH_STATE_TTL_SECONDS = 10 * 60;

function configuredRedirectUri(): string {
  const raw = String(process.env.THREADS_REDIRECT_URI || '').trim();
  if (!raw) throw new Error('threads_redirect_uri_missing');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    throw new Error('threads_redirect_uri_requires_https');
  }
  return parsed.toString();
}

function oauthStateSecret(): string {
  const secret = String(process.env.THREADS_OAUTH_STATE_SECRET || process.env.INTERNAL_API_KEY || '').trim();
  if (secret.length < 32) throw new Error('threads_oauth_state_secret_missing');
  return secret;
}

function signature(value: string): string {
  return createHmac('sha256', oauthStateSecret()).update(value).digest('base64url');
}

export function createThreadsOAuthState(nowMs = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({
    nonce: randomBytes(24).toString('base64url'),
    issuedAt: Math.floor(nowMs / 1000),
  }), 'utf8').toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function verifyThreadsOAuthState(value: string, nowMs = Date.now()): boolean {
  const [payload, suppliedSignature, extra] = value.split('.');
  if (!payload || !suppliedSignature || extra) return false;
  const expected = signature(payload);
  const actualBytes = Buffer.from(suppliedSignature, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { issuedAt?: unknown; nonce?: unknown };
    const issuedAt = Number(decoded.issuedAt);
    return typeof decoded.nonce === 'string' && decoded.nonce.length >= 24
      && Number.isFinite(issuedAt)
      && issuedAt <= Math.floor(nowMs / 1000) + 30
      && issuedAt >= Math.floor(nowMs / 1000) - OAUTH_STATE_TTL_SECONDS;
  } catch {
    return false;
  }
}

export function assertDedicatedThreadsAppConfigured(): void {
  if (process.env.THREADS_DEDICATED_APP_CONFIRMED !== 'true') {
    throw new Error('threads_dedicated_app_not_confirmed');
  }
  if (!String(process.env.THREADS_APP_ID || '').trim()) throw new Error('threads_app_id_missing');
  configuredRedirectUri();
}

export function buildThreadsAuthorizationUrl(state: string): string {
  assertDedicatedThreadsAppConfigured();
  const endpoint = new URL(THREADS_OAUTH_AUTHORIZE_URL);
  endpoint.searchParams.set('client_id', String(process.env.THREADS_APP_ID));
  endpoint.searchParams.set('redirect_uri', configuredRedirectUri());
  endpoint.searchParams.set('scope', THREADS_REQUIRED_SCOPES.join(','));
  endpoint.searchParams.set('response_type', 'code');
  endpoint.searchParams.set('state', state);
  return endpoint.toString();
}

export function threadsRedirectUri(): string {
  return configuredRedirectUri();
}

export function assertThreadsKeywordSearchEndpoint(value: string): URL {
  const endpoint = new URL(value);
  if (endpoint.origin !== THREADS_GRAPH_ORIGIN || endpoint.pathname !== `/${THREADS_GRAPH_VERSION}/keyword_search`) {
    throw new Error('threads_keyword_search_endpoint_not_approved');
  }
  return endpoint;
}
