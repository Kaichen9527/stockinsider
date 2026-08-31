import { randomUUID } from 'crypto';
import { getSupabaseServerClient } from './supabase-server';

const LEASE_KEY = 'production-data-plane';

export async function acquireProductionWriteLease(ttlSeconds: number): Promise<string | null> {
  const ownerId = randomUUID();
  const result = await getSupabaseServerClient().rpc('acquire_production_write_lease', {
    p_lease_key: LEASE_KEY,
    p_owner_id: ownerId,
    p_ttl_seconds: ttlSeconds,
  });
  if (result.error) throw new Error(`production_write_lease_failed:${result.error.message}`);
  return result.data === true ? ownerId : null;
}

export async function releaseProductionWriteLease(ownerId: string): Promise<void> {
  const result = await getSupabaseServerClient().rpc('release_production_write_lease', {
    p_lease_key: LEASE_KEY,
    p_owner_id: ownerId,
  });
  if (result.error) throw new Error(`production_write_lease_release_failed:${result.error.message}`);
}
