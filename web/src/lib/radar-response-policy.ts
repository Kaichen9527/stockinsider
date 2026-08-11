export type RadarResponseState = 'fresh' | 'stale_readonly' | 'degraded' | 'checksum_conflict' | 'error';

// Freshness and recommendation authority are evaluated at request time. No
// intermediary may reuse a prior actionable response across that boundary.
export function radarResponseHeaders(_state: RadarResponseState): Readonly<Record<string, string>> {
  return Object.freeze({ 'Cache-Control': 'private, no-store' });
}
