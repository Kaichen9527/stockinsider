import type { LinkResultV3, SourceClassV3 } from './contracts.ts';

export type OpportunityDetailSourceEvidenceV3 = {
  ref: string;
  sourceKey: string;
  sourceClass: SourceClassV3;
  effectiveAt: string;
  linkReason: LinkResultV3['reason'];
  verificationTier: 'provenance_verified' | 'publisher_verified';
  stance: 'supports' | 'contradicts';
};

const SOURCE_CLASSES = new Set<SourceClassV3>(['official', 'public_research', 'curated_thesis', 'community']);
const SOURCE_KEYS = new Set([
  'bulltalk',
  'earnings_call',
  'instagram',
  'investanchors',
  'mops_material_event',
  'podcast',
  'ptt',
  'public_broker_research',
  'telegram',
  'threads',
  'youtube',
]);
const LINK_REASONS = new Set<LinkResultV3['reason']>([
  'explicit_ticker_context',
  'exact_unique_alias_context',
  'duplicate_claim_link',
]);
const VERIFICATION_TIERS = new Set(['provenance_verified', 'publisher_verified']);
const EVIDENCE_STANCES = new Set(['supports', 'contradicts']);
const SOURCE_EVIDENCE_KEYS = [
  'effectiveAt',
  'linkReason',
  'ref',
  'sourceClass',
  'sourceKey',
  'stance',
  'verificationTier',
].sort();

export function validSourceEvidence(
  value: unknown,
  sourceCutoff?: string,
): value is OpportunityDetailSourceEvidenceV3[] {
  const parsedCutoff = sourceCutoff === undefined ? null : Date.parse(sourceCutoff);
  if (sourceCutoff !== undefined && !Number.isFinite(parsedCutoff)) return false;
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return false;
  const refs = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    if (Object.keys(row).sort().join('\0') !== SOURCE_EVIDENCE_KEYS.join('\0')) return false;
    if (
      typeof row.ref !== 'string' ||
      row.ref.length < 1 ||
      [...row.ref].length > 120 ||
      refs.has(row.ref) ||
      typeof row.sourceKey !== 'string' ||
      !SOURCE_KEYS.has(row.sourceKey) ||
      !SOURCE_CLASSES.has(row.sourceClass as SourceClassV3) ||
      typeof row.effectiveAt !== 'string' ||
      !Number.isFinite(Date.parse(row.effectiveAt)) ||
      (parsedCutoff !== null && Date.parse(row.effectiveAt) > parsedCutoff) ||
      !LINK_REASONS.has(row.linkReason as LinkResultV3['reason']) ||
      !VERIFICATION_TIERS.has(row.verificationTier as string) ||
      !EVIDENCE_STANCES.has(row.stance as string)
    ) return false;
    refs.add(row.ref);
  }
  return true;
}
