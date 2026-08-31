import { randomUUID } from 'crypto';
import { getSupabaseServerClient } from './supabase-server';

const LEASE_KEY = 'production-data-plane';
export const PRODUCTION_WRITE_LEASE_STALE_AFTER_SECONDS = 3_900;

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

export async function recoverStaleProductionWriteLease(minimumAgeSeconds = PRODUCTION_WRITE_LEASE_STALE_AFTER_SECONDS): Promise<boolean> {
  if (!Number.isInteger(minimumAgeSeconds) || minimumAgeSeconds < PRODUCTION_WRITE_LEASE_STALE_AFTER_SECONDS) {
    throw new Error('production_write_lease_recovery_age_invalid');
  }
  const supabase = getSupabaseServerClient();
  const lease = await supabase.from('production_write_leases')
    .select('owner_id,acquired_at')
    .eq('lease_key', LEASE_KEY)
    .maybeSingle();
  if (lease.error) throw new Error(`production_write_lease_recovery_read_failed:${lease.error.message}`);
  if (!lease.data) return true;
  const acquiredAt = Date.parse(String(lease.data.acquired_at || ''));
  if (!Number.isFinite(acquiredAt) || Date.now() - acquiredAt < minimumAgeSeconds * 1000) return false;
  const ownerId = String(lease.data.owner_id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(ownerId)) return false;
  const released = await supabase.rpc('release_production_write_lease', {
    p_lease_key: LEASE_KEY,
    p_owner_id: ownerId,
  });
  if (released.error) throw new Error(`production_write_lease_recovery_failed:${released.error.message}`);
  return released.data === true;
}
