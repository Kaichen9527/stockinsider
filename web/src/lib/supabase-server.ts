import { getStockInsiderDataPlaneClient } from './data-plane-runtime.ts';

export function getSupabaseServerClient() {
  return getStockInsiderDataPlaneClient();
}
