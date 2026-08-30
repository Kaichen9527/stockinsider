const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

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
    || (expiresMs !== null && Number.isFinite(expiresMs) && expiresMs - nowMs <= REFRESH_AFTER_MS);
}
