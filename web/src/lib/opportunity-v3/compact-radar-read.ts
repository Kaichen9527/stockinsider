import { getSupabaseServerClient } from '@/lib/supabase-server';
import { RadarProjectionValidationError, selectCompactRadarProjectionRows, type CompactRadarProjection } from './compact-radar-validation';

export { compactRadarEtag, validateCompactRadarProjectionRow, type CompactRadarProjection } from './compact-radar-validation';

export class RadarProjectionUnavailableError extends Error {
  readonly code: 'radar_projection_unavailable' | 'projection_conflict';
  constructor(code: 'radar_projection_unavailable' | 'projection_conflict' = 'radar_projection_unavailable') {
    super(code);
    this.code = code;
  }
}

export function legacyCorrectnessProjectionEnabled(
  value = process.env.LEGACY_RADAR_CORRECTNESS_PROJECTION,
): boolean {
  if (value === undefined || value === '' || value === 'disabled') return false;
  if (value === 'enabled') return true;
  throw new RadarProjectionUnavailableError();
}

// Indexed two-row sentinel: the newest row is authoritative unless an equal timestamp
// has a different checksum, which is a fail-closed projection conflict.
export async function loadCompactRadarProjection(
  window: CompactRadarProjection['sourceLedCorrectness']['window'],
): Promise<CompactRadarProjection | null> {
  if (!legacyCorrectnessProjectionEnabled()) return null;
  const client = getSupabaseServerClient();
  const storageWindow = window === 'hot' ? 'three_day' : window;
  const { data, error } = await client.from('legacy_radar_projections_v3_11')
    .select('payload_json,payload_sha256,as_of,created_at,projection_id')
    .eq('window', storageWindow).order('as_of', { ascending: false }).order('created_at', { ascending: false })
    .order('projection_id', { ascending: true }).limit(2);
  if (error || !Array.isArray(data) || data.length === 0) throw new RadarProjectionUnavailableError();
  let selected: CompactRadarProjection;
  try {
    selected = selectCompactRadarProjectionRows(window, data as Array<Record<string, unknown>>);
  } catch (error) {
    if (error instanceof RadarProjectionValidationError) throw new RadarProjectionUnavailableError(error.code);
    throw error;
  }
  const age = Date.now() - Date.parse(selected.sourceLedCorrectness.asOf);
  if (!Number.isFinite(age) || age > 24 * 60 * 60 * 1000) throw new RadarProjectionUnavailableError();
  return selected;
}
