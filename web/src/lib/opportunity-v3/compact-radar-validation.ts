import { sha256Canonical } from './canonical.ts';
import { validatePublishedDecisionCard } from './decision-publication.ts';

export type CompactRadarProjection = {
  sourceLedCorrectness: {
    schema: 'legacy-radar-v3.11.3' | 'legacy-radar-v3.12.0' | 'legacy-radar-v3.13.0' | 'legacy-radar-v3.14.0';
    window: 'daily' | 'hot' | 'weekly' | 'home';
    asOf: string;
    contentAsOf?: string;
    evaluatedAt?: string;
    publishedAt?: string;
    nextExpectedAt?: string;
    freshnessSchedule?: Array<{ session_id?: string | null; close_at?: string | null; status?: string | null }>;
    producerIdentity?: { commitSha?: string | null; runtimeManifestSha256?: string | null };
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

function validCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validProvisionalRelativeValue(card: unknown): boolean {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return false;
  const value=(card as Record<string,unknown>).provisionalRelativeValue;
  if (value === undefined || value === null) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const provisional=value as Record<string,unknown>;const band=provisional.referenceBand as Record<string,unknown> | null;
  if(provisional.kind!=='provisional_relative_value'||!Number.isInteger(provisional.sampleCount)
    ||Number(provisional.sampleCount)<60||Number(provisional.sampleCount)>251||!validCivilDate(provisional.asOf)
    ||!band||!['low','base','high'].every((key)=>Number.isFinite(band[key])&&Number(band[key])>0)
    ||Number(band.low)>Number(band.base)||Number(band.base)>Number(band.high)
    ||typeof provisional.evidenceRoot!=='string'||!/^[0-9a-f]{64}$/u.test(provisional.evidenceRoot)
    ||!Array.isArray(provisional.sourceRefs)||provisional.sourceRefs.length<1||provisional.sourceRefs.length>8
    ||new Set(provisional.sourceRefs).size!==provisional.sourceRefs.length)return false;
  return provisional.sourceRefs.every((ref)=>{
    if(typeof ref!=='string'||!/^(?:twse-openapi:BWIBBU_ALL|twse-rwd:BWIBBU_d|tpex-openapi:peratio|tpex-rwd:peratio):/u.test(ref))return false;
    const embedded=ref.match(/:(\d{4}-\d{2}-\d{2}):\d{4}$/u)?.[1];
    return validCivilDate(embedded)&&embedded<=String(provisional.asOf);
  });
}

export function validateCompactRadarProjectionRow(
  window: CompactRadarProjection['sourceLedCorrectness']['window'],
  row: Record<string, unknown> | null | undefined,
): CompactRadarProjection | null {
  const payload = row?.payload_json;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = payload as CompactRadarProjection;
  const sourceSignals=value.sourceSignals;
  const decisionSchema=['legacy-radar-v3.13.0','legacy-radar-v3.14.0'].includes(value.sourceLedCorrectness?.schema);
  const validDecisionCards=!decisionSchema||(
    Array.isArray(sourceSignals)&&sourceSignals.length<=30
    &&sourceSignals.every((card)=>validatePublishedDecisionCard(card)!==null)
    &&sourceSignals.every(validProvisionalRelativeValue)
    &&new Set(sourceSignals.map((card)=>(card as Record<string,unknown>).symbol)).size===sourceSignals.length);
  if (!['legacy-radar-v3.11.3', 'legacy-radar-v3.12.0', 'legacy-radar-v3.13.0','legacy-radar-v3.14.0'].includes(value.sourceLedCorrectness?.schema)
    || value.sourceLedCorrectness?.window !== window || !Array.isArray(value.opportunities)
    || value.opportunities.length > 60 || typeof row?.payload_sha256 !== 'string'
    ||!validDecisionCards
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
