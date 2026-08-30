import { createHash } from 'crypto';
import { getSupabaseServerClient } from './supabase-server';
import { assertUsableThreadsToken, shouldRefreshThreadsToken } from './threads-token-policy';

const DEFAULT_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

type CredentialMetadata = {
  last_refreshed_at?: string;
  expires_at?: string;
  token_hash?: string;
  mode?: string;
};

export type ThreadsTokenState = {
  token: string;
  lastRefreshedAt: string | null;
  expiresAt: string | null;
  tokenHash: string;
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
  assertUsableThreadsToken({ token, expiresAt });
}

async function persistRefreshedToken(token: string, refreshedAt: string, expiresAt: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.rpc('refresh_threads_source_secret', {
    p_secret: token,
    p_token_hash: tokenHash(token),
    p_refreshed_at: refreshedAt,
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(`threads_vault_refresh_failed:${error.message}`);
}

async function refreshToken(currentToken: string): Promise<{ token: string; refreshedAt: string; expiresAt: string }> {
  const endpoint = new URL('https://graph.threads.net/refresh_access_token');
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

export async function getThreadsTokenForRun(): Promise<ThreadsTokenState> {
  const [token, metadata] = await Promise.all([readVaultToken(), readCredentialMetadata()]);
  const lastRefreshedAt = validIso(metadata.last_refreshed_at);
  const expiresAt = validIso(metadata.expires_at);
  assertUsableThreadsToken({ token, expiresAt });
  const refreshDue = shouldRefreshThreadsToken({ lastRefreshedAt, expiresAt });

  if (!refreshDue) {
    return { token, lastRefreshedAt, expiresAt, tokenHash: tokenHash(token), refreshed: false };
  }

  const refreshed = await refreshToken(token);
  await persistRefreshedToken(refreshed.token, refreshed.refreshedAt, refreshed.expiresAt);
  return {
    token: refreshed.token,
    lastRefreshedAt: refreshed.refreshedAt,
    expiresAt: refreshed.expiresAt,
    tokenHash: tokenHash(refreshed.token),
    refreshed: true,
  };
}

export function threadsTokenRegistryMetadata(state: ThreadsTokenState) {
  return {
    mode: 'threads_official_keyword_api',
    last_refreshed_at: state.lastRefreshedAt,
    expires_at: state.expiresAt,
    token_hash: state.tokenHash,
    token_refreshed_this_run: state.refreshed,
  };
}
