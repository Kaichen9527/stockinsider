const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_MS = 14 * 24 * 60 * 60 * 1000;

export function assertUsableThreadsToken(input: {
  token: string;
  expiresAt: string | null;
  nowMs?: number;
}) {
  if (!input.token.trim()) throw new Error('threads_vault_token_missing');
  const nowMs = input.nowMs ?? Date.now();
  const expiresMs = input.expiresAt ? new Date(input.expiresAt).getTime() : null;
  if (expiresMs !== null && Number.isFinite(expiresMs) && expiresMs <= nowMs) {
    throw new Error('threads_vault_token_expired');
  }
}

export function shouldRefreshThreadsToken(input: {
  lastRefreshedAt: string | null;
  expiresAt: string | null;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const lastRefreshMs = input.lastRefreshedAt ? new Date(input.lastRefreshedAt).getTime() : null;
  const expiresMs = input.expiresAt ? new Date(input.expiresAt).getTime() : null;
  if (lastRefreshMs === null && expiresMs === null) return true;
  return (lastRefreshMs !== null && Number.isFinite(lastRefreshMs) && nowMs - lastRefreshMs >= REFRESH_AFTER_MS)
    || (expiresMs !== null && Number.isFinite(expiresMs) && expiresMs - nowMs <= EXPIRY_WARNING_MS);
}

export function threadsTokenExpiryWarning(input: { expiresAt: string | null; nowMs?: number }): 'expired' | 'expires_within_14_days' | null {
  if (!input.expiresAt) return null;
  const expiresMs = new Date(input.expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) return 'expired';
  const remainingMs = expiresMs - (input.nowMs ?? Date.now());
  if (remainingMs <= 0) return 'expired';
  return remainingMs <= EXPIRY_WARNING_MS ? 'expires_within_14_days' : null;
}

export function buildThreadsTokenRegistryMetadata(state: {
  lastRefreshedAt: string | null;
  expiresAt: string | null;
  tokenHash: string;
  ownerUserIdHash: string;
  refreshed: boolean;
}) {
  return {
    mode: 'threads_official_keyword_api',
    last_refreshed_at: state.lastRefreshedAt,
    expires_at: state.expiresAt,
    token_hash: state.tokenHash,
    owner_user_id_hash: state.ownerUserIdHash,
    token_refreshed_this_run: state.refreshed,
    expiry_warning: threadsTokenExpiryWarning({ expiresAt: state.expiresAt }),
  };
}
