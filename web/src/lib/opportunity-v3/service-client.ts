import { createHash } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export class OpportunityV3ServiceUnavailable extends Error {
  constructor() {
    super('v3_service_role_unavailable');
    this.name = 'OpportunityV3ServiceUnavailable';
  }
}

function visibleAscii(value: string): boolean {
  return /^[\x21-\x7e]+$/u.test(value);
}

export function validateOpportunityV3ServiceTuple(input: {
  url: string;
  projectRef: string;
  serviceRoleKey: string;
  approvedDigest: string;
}): boolean {
  if (!/^[a-z0-9]{20}$/u.test(input.projectRef)) return false;
  if (input.serviceRoleKey.length < 32 || input.serviceRoleKey.length > 4096 || !visibleAscii(input.serviceRoleKey)) return false;
  if (!/^[a-f0-9]{64}$/u.test(input.approvedDigest)) return false;
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return false;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    url.hostname !== `${input.projectRef}.supabase.co`
  ) return false;
  const digest = createHash('sha256').update(input.serviceRoleKey, 'utf8').digest('hex');
  return digest === input.approvedDigest;
}

export function getOpportunityV3ServerClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const tuple = {
    url: process.env.SUPABASE_URL ?? '',
    projectRef: process.env.OPPORTUNITY_V3_SUPABASE_PROJECT_REF ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    approvedDigest: process.env.OPPORTUNITY_V3_SERVICE_ROLE_KEY_SHA256 ?? '',
  };
  if (!validateOpportunityV3ServiceTuple(tuple)) throw new OpportunityV3ServiceUnavailable();
  cachedClient = createClient(tuple.url, tuple.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export function resetOpportunityV3ClientForTests(): void {
  cachedClient = null;
}
