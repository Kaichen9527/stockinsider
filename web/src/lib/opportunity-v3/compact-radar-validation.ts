import { sha256Canonical } from './canonical.ts';

export type CompactRadarProjection = {
  sourceLedCorrectness: {
    schema: 'legacy-radar-v3.11.3';
    window: 'daily' | 'hot' | 'weekly' | 'home';
    asOf: string;
  };
  opportunities: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export class RadarProjectionValidationError extends Error {
  readonly code: 'radar_projection_unavailable' | 'projection_conflict';
  constructor(code: 'radar_projection_unavailable' | 'projection_conflict' = 'radar_projection_unavailable') {
    super(code);
    this.code = code;
  }
}

export function validateCompactRadarProjectionRow(
  window: CompactRadarProjection['sourceLedCorrectness']['window'],
  row: Record<string, unknown> | null | undefined,
): CompactRadarProjection | null {
  const payload = row?.payload_json;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = payload as CompactRadarProjection;
  if (value.sourceLedCorrectness?.schema !== 'legacy-radar-v3.11.3'
    || value.sourceLedCorrectness?.window !== window || !Array.isArray(value.opportunities)
    || value.opportunities.length > 60 || typeof row?.payload_sha256 !== 'string'
    || sha256Canonical(value) !== row.payload_sha256 || new TextEncoder().encode(JSON.stringify(value)).byteLength > 150000) return null;
  return value;
}

export function compactRadarEtag(payload: CompactRadarProjection): string {
  return `\"sha256:${sha256Canonical(payload)}\"`;
}

export function selectCompactRadarProjectionRows(
  window: CompactRadarProjection['sourceLedCorrectness']['window'],
  rows: Array<Record<string, unknown>>,
): CompactRadarProjection {
  if (rows.length === 0) throw new RadarProjectionValidationError();
  const [newest, sentinel] = rows;
  if (sentinel && newest.as_of === sentinel.as_of && newest.created_at === sentinel.created_at
    && newest.payload_sha256 !== sentinel.payload_sha256) {
    throw new RadarProjectionValidationError('projection_conflict');
  }
  const selected = validateCompactRadarProjectionRow(window, newest);
  if (!selected) throw new RadarProjectionValidationError();
  return selected;
}
