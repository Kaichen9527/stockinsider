import { createClient } from '@supabase/supabase-js';

export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE URL/key for server client');
  }

  const writerRelease = process.env.STOCKINSIDER_WRITER_RELEASE_ID?.trim();
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: writerRelease
      ? { headers: { 'x-stockinsider-writer-release': writerRelease } }
      : undefined,
  });
}
