import { getStockInsiderDataPlaneClient } from './data-plane-runtime.ts';

export function getSupabaseServerClient() {
  // data-plane-runtime validates and applies STOCKINSIDER_WRITER_RELEASE_ID for
  // both the Supabase compatibility path and the Contabo successor path.
  return getStockInsiderDataPlaneClient();
}
