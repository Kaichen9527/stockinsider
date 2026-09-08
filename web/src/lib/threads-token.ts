import { createHash } from 'crypto';
import { getSupabaseServerClient } from './supabase-server';
import { assertUsableThreadsToken, buildThreadsTokenRegistryMetadata, shouldRefreshThreadsToken } from './threads-token-policy';
import {
  THREADS_GRAPH_VERSION,
  THREADS_LONG_TOKEN_URL,
  THREADS_ME_URL,
  THREADS_OAUTH_TOKEN_URL,
  THREADS_REFRESH_TOKEN_URL,
  threadsRedirectUri,
} from './threads-api';
import { hashThreadsUserId } from './threads-signed-request';

const DEFAULT_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

type CredentialMetadata = {
  last_refreshed_at?: string;
  expires_at?: string;
  token_hash?: string;
  mode?: string;
  owner_user_id_hash?: string;
};

export type ThreadsTokenState = {
  token: string;
  lastRefreshedAt: string | null;
  expiresAt: string | null;
  tokenHash: string;
  ownerUserIdHash: string;
  refreshed: boolean;
};

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function readVaultToken() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('read_threads_source_secret');
  if (error) throw new Error(`threads_vault_read_failed:${error.message}`);
  const token = typeof data === 'string'
    ? data
    : Array.isArray(data) && typeof data[0] === 'string'
      ? data[0]
      : '';
  if (!token) throw new Error('threads_vault_token_missing');
  return token;
}

async function readCredentialMetadata(): Promise<CredentialMetadata> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('source_credentials_registry')
    .select('metadata')
    .eq('platform', 'threads')
    .maybeSingle();
  if (error) throw new Error(`threads_credential_metadata_failed:${error.message}`);
  return data?.metadata && typeof data.metadata === 'object' ? data.metadata as CredentialMetadata : {};
}

export async function assertThreadsTokenAvailable(): Promise<void> {
  const [token, metadata] = await Promise.all([readVaultToken(), readCredentialMetadata()]);
  const expiresAt = validIso(metadata.expires_at);
  if (!/^[0-9a-f]{64}$/u.test(String(metadata.owner_user_id_hash || ''))) {
    throw new Error('threads_token_owner_missing');
  }
  assertUsableThreadsToken({ token, expiresAt });
}

async function persistRefreshedToken(token: string, refreshedAt: string, expiresAt: string, ownerUserIdHash: string) {
  if (!/^[0-9a-f]{64}$/u.test(ownerUserIdHash)) throw new Error('threads_token_owner_missing');
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.rpc('refresh_threads_source_secret_v7', {
    p_owner_user_id_hash: ownerUserIdHash,
    p_secret: token,
    p_token_hash: tokenHash(token),
    p_refreshed_at: refreshedAt,
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(`threads_vault_refresh_failed:${error.message}`);
}

async function readTokenOwnerHash(token: string): Promise<string> {
  const endpoint = new URL(THREADS_ME_URL);
  endpoint.searchParams.set('fields', 'id');
  endpoint.searchParams.set('access_token', token);
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`threads_token_owner_http_${response.status}`);
  const payload = await response.json() as { id?: unknown };
  const userId = typeof payload.id === 'string' ? payload.id : '';
  if (!/^[0-9]{1,32}$/u.test(userId)) throw new Error('threads_token_owner_missing');
  return hashThreadsUserId(userId);
}

async function refreshToken(currentToken: string): Promise<{ token: string; refreshedAt: string; expiresAt: string }> {
  const endpoint = new URL(THREADS_REFRESH_TOKEN_URL);
  endpoint.searchParams.set('grant_type', 'th_refresh_token');
  endpoint.searchParams.set('access_token', currentToken);
  const response = await fetch(endpoint, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`threads_token_refresh_http_${response.status}`);
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error('threads_token_refresh_missing_token');
  const refreshedAt = new Date().toISOString();
  const ttlMs = Number.isFinite(Number(payload.expires_in))
    ? Math.max(24 * 60 * 60 * 1000, Number(payload.expires_in) * 1000)
    : DEFAULT_TOKEN_TTL_MS;
  return {
    token: payload.access_token,
    refreshedAt,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  };
}

async function parseTokenResponse(response: Response, errorPrefix: string): Promise<{ accessToken: string; expiresIn: number }> {
  if (!response.ok) throw new Error(`${errorPrefix}_http_${response.status}`);
  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
  if (!accessToken) throw new Error(`${errorPrefix}_missing_token`);
  const expiresIn = Number(payload.expires_in);
  return { accessToken, expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 60 * 24 * 60 * 60 };
}

export async function exchangeThreadsAuthorizationCodeAndPersist(code: string): Promise<{ expiresAt: string }> {
  if (!code.trim()) throw new Error('threads_oauth_code_missing');
  const appId = String(process.env.THREADS_APP_ID || '').trim();
  const appSecret = String(process.env.THREADS_APP_SECRET || '').trim();
  if (!appId || !appSecret) throw new Error('threads_app_credentials_missing');
  const shortResponse = await fetch(THREADS_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: threadsRedirectUri(),
      code,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const shortToken = await parseTokenResponse(shortResponse, 'threads_oauth_exchange');
  const longEndpoint = new URL(THREADS_LONG_TOKEN_URL);
  longEndpoint.searchParams.set('grant_type', 'th_exchange_token');
  longEndpoint.searchParams.set('client_secret', appSecret);
  longEndpoint.searchParams.set('access_token', shortToken.accessToken);
  const longResponse = await fetch(longEndpoint, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  const longToken = await parseTokenResponse(longResponse, 'threads_long_token_exchange');
  const ownerUserIdHash = await readTokenOwnerHash(longToken.accessToken);
  const refreshedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + longToken.expiresIn * 1000).toISOString();
  await persistRefreshedToken(longToken.accessToken, refreshedAt, expiresAt, ownerUserIdHash);
  return { expiresAt };
}

export async function recordThreadsPublicSearchCanary(receipt: {
  observedAt: string;
  selfUsernameHash: string;
  publicPostIdHash: string;
  queryHash: string;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  const metadata = await readCredentialMetadata();
  const { error } = await supabase.from('source_credentials_registry').upsert({
    platform: 'threads',
    credential_ref: 'SUPABASE_VAULT:threads_access_token',
    status: 'valid',
    last_validated_at: receipt.observedAt,
    error_message: null,
    metadata: {
      ...metadata,
      graph_version: THREADS_GRAPH_VERSION,
      required_scopes: ['threads_basic', 'threads_keyword_search'],
      non_self_public_search_canary: receipt,
    },
    updated_at: receipt.observedAt,
  }, { onConflict: 'platform' });
  if (error) throw new Error(`threads_canary_receipt_write_failed:${error.message}`);
}

export async function getThreadsTokenForRun(): Promise<ThreadsTokenState> {
  const [token, metadata] = await Promise.all([readVaultToken(), readCredentialMetadata()]);
  const lastRefreshedAt = validIso(metadata.last_refreshed_at);
  const expiresAt = validIso(metadata.expires_at);
  const ownerUserIdHash = typeof metadata.owner_user_id_hash === 'string' ? metadata.owner_user_id_hash : '';
  if (!/^[0-9a-f]{64}$/u.test(ownerUserIdHash)) throw new Error('threads_token_owner_missing');
  assertUsableThreadsToken({ token, expiresAt });
  const refreshDue = shouldRefreshThreadsToken({ lastRefreshedAt, expiresAt });

  if (!refreshDue) {
    return { token, lastRefreshedAt, expiresAt, tokenHash: tokenHash(token), ownerUserIdHash, refreshed: false };
  }

  const refreshed = await refreshToken(token);
  await persistRefreshedToken(refreshed.token, refreshed.refreshedAt, refreshed.expiresAt, ownerUserIdHash);
  return {
    token: refreshed.token,
    lastRefreshedAt: refreshed.refreshedAt,
    expiresAt: refreshed.expiresAt,
    tokenHash: tokenHash(refreshed.token),
    ownerUserIdHash,
    refreshed: true,
  };
}

export function threadsTokenRegistryMetadata(state: ThreadsTokenState) {
  return buildThreadsTokenRegistryMetadata(state);
}
