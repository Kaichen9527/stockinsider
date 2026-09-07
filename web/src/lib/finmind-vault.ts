import { getOpportunityV3ServerClient } from './opportunity-v3/service-client.ts';

let cached: { token: string; expiresAt: number } | null = null;

/** Service-side only. FinMind credentials are never read from process env so
 * a release, crash dump, or systemd environment cannot disclose the token. */
export async function readFinMindVaultToken(options: { forceRefresh?: boolean } = {}) {
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.token;
  const response = await getOpportunityV3ServerClient().rpc('read_stockinsider_finmind_api_token_v6');
  if (response.error) throw new Error('finmind_vault_read_failed');
  const value = Array.isArray(response.data) ? response.data[0] : response.data;
  const token = String(value || '').trim();
  if (!token) return '';
  cached = { token, expiresAt: Date.now() + 5 * 60_000 };
  return token;
}

export function clearFinMindVaultTokenCache() { cached = null; }
