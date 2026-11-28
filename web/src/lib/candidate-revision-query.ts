import type { CandidateStageCard } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function parseCandidateRevision(value: string | string[] | undefined | null):
  { status: 'absent' } | { status: 'invalid' } | { status: 'valid'; revisionId: string } {
  if (value === undefined || value === null) return { status: 'absent' };
  if (typeof value !== 'string' || !UUID.test(value)) return { status: 'invalid' };
  return { status: 'valid', revisionId: value.toLowerCase() };
}

export function candidateRevisionHref(symbol: string, revisionId: string | null | undefined): string {
  const base = `/stock/${encodeURIComponent(symbol)}`;
  const parsed = parseCandidateRevision(revisionId);
  // An invalid non-null ID must not silently select the latest research.
  return parsed.status === 'absent' ? base
    : `${base}?candidateRevision=${encodeURIComponent(parsed.status === 'valid' ? parsed.revisionId : 'invalid')}`;
}

export function publishedRadarCandidateHref(
  candidate: Pick<CandidateStageCard, 'symbol' | 'detailRevisionId' | 'detailHref'>,
  snapshotPublishedAt?: string | null,
) {
  if (!snapshotPublishedAt || !candidate.detailRevisionId) {
    return candidate.detailHref || '/stock/' + candidate.symbol;
  }
  const query = new URLSearchParams({
    candidateRevision: candidate.detailRevisionId,
    radarSnapshotPublishedAt: snapshotPublishedAt,
  });
  return '/stock/' + candidate.symbol + '?' + query;
}
