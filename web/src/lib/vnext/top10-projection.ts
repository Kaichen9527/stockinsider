import { DEEP_WEIGHTS, POLICY, scoreFactors, type Factors } from './policy.ts';

/** Source candidate only: no route, storage, scheduling or execution side effects.
 * A future trusted server adapter MUST authenticate the publication, independent
 * executions and current evidence before constructing this input. These shape /
 * consistency checks do not establish review authority or source rights.
 */
export const TOP10_PROJECTION_VERSION = 'vnext-top10-projection-candidate-v1';
export type RankingRevisions = {
  research: string; score: string; financial: string; price: string; market: string;
};
export type FrozenRankingMember = {
  symbol: string;
  policyVersion: string;
  cutoff: string;
  eventAt: string;
  revisions: RankingRevisions;
  scoreBinding: RankingRevisions;
  factors: Factors;
  publication: {
    status: 'independently_approved' | 'unpublished' | 'review_pending' | 'rejected';
    researchRevision: string;
    authorExecutionId: string;
    reviewerExecutionId: string;
  };
  validity: {
    rights: 'current' | 'missing' | 'withdrawn';
    financial: 'current' | 'missing' | 'invalid';
    price: 'current' | 'missing' | 'invalid';
    validUntil: string;
  };
  entryEligible: boolean;
  waitingReasons: string[];
};
export type FrozenRankingInput = {
  policyVersion: string;
  cutoff: string;
  marketRevision: string;
  activePoolSymbols: string[];
  members: FrozenRankingMember[];
};
export type ProjectedRankingMember = {
  rank: number;
  symbol: string;
  eventAt: string;
  confirmedPoints: number;
  availableWeight: number;
  probability: false;
  revisions: RankingRevisions;
  entryEligible: boolean;
  waitingReasons: string[];
};
const revisionKeys = ['research', 'score', 'financial', 'price', 'market'] as const;
const present = (value: string) => typeof value === 'string' && value.trim().length > 0;
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Deterministic projection of one frozen active pool; never admission authority.
 * No immutable ranking snapshot/publication or current read validation is implied.
 */
export function projectTop10Candidate(input: FrozenRankingInput) {
  const cutoff = Date.parse(input.cutoff);
  if (input.policyVersion !== POLICY.version || !Number.isFinite(cutoff) || !present(input.marketRevision))
    throw new Error('vnext_top10_context_invalid');
  const pool = new Set(input.activePoolSymbols);
  if (input.activePoolSymbols.length > POLICY.activeSlots || pool.size !== input.activePoolSymbols.length
    || input.activePoolSymbols.some(symbol => typeof symbol !== 'string' || !/^\d{4}$/u.test(symbol)) || input.members.length > POLICY.activeSlots
    || input.members.length !== pool.size || input.members.some(member => !pool.has(member.symbol))
    || new Set(input.members.map(member => member.symbol)).size !== input.members.length)
    throw new Error('vnext_top10_pool_invalid');
  const ranked: Omit<ProjectedRankingMember, 'rank'>[] = [];
  const excluded: { symbol: string; reasons: string[] }[] = [];
  for (const member of input.members) {
    if (typeof member.symbol !== 'string' || !/^\d{4}$/u.test(member.symbol) || typeof member.entryEligible !== 'boolean'
      || !Array.isArray(member.waitingReasons) || member.waitingReasons.some(reason => typeof reason !== 'string'))
      throw new Error('vnext_top10_member_invalid');
    const reasons: string[] = [];
    if (!pool.has(member.symbol)) reasons.push('not_active');
    if (member.policyVersion !== input.policyVersion || member.cutoff !== input.cutoff) reasons.push('context_mismatch');
    if (revisionKeys.some(key => !present(member.revisions[key]) || member.revisions[key] !== member.scoreBinding[key])
      || member.revisions.market !== input.marketRevision) reasons.push('revision_mismatch');
    if (member.publication.status !== 'independently_approved'
      || member.publication.researchRevision !== member.revisions.research
      || !present(member.publication.authorExecutionId) || !present(member.publication.reviewerExecutionId)
      || member.publication.authorExecutionId === member.publication.reviewerExecutionId) reasons.push('independent_publication_required');
    const expires = Date.parse(member.validity.validUntil);
    if (member.validity.rights !== 'current') reasons.push('rights_not_current');
    if (member.validity.financial !== 'current') reasons.push('financial_not_current');
    if (member.validity.price !== 'current') reasons.push('price_not_current');
    if (!Number.isFinite(expires) || expires <= cutoff) reasons.push('validity_expired_or_unknown');
    const eventAt = Date.parse(member.eventAt);
    if (!Number.isFinite(eventAt) || eventAt > cutoff) reasons.push('event_time_invalid');
    const score = scoreFactors(member.factors, DEEP_WEIGHTS);
    if (score.availableWeight !== 100) reasons.push('deep_factor_evidence_incomplete');
    if (reasons.length) { excluded.push({ symbol: member.symbol, reasons }); continue; }
    ranked.push({ symbol: member.symbol, eventAt: new Date(eventAt).toISOString(), confirmedPoints: score.confirmedPoints,
      availableWeight: score.availableWeight, probability: false, revisions: { research: member.revisions.research, score: member.revisions.score,
        financial: member.revisions.financial, price: member.revisions.price, market: member.revisions.market },
      entryEligible: member.entryEligible, waitingReasons: [...member.waitingReasons] });
  }
  ranked.sort((a, b) => b.confirmedPoints - a.confirmedPoints || b.availableWeight - a.availableWeight
    || compareText(b.eventAt, a.eventAt) || compareText(a.symbol, b.symbol));
  excluded.sort((a, b) => compareText(a.symbol, b.symbol));
  return { version: TOP10_PROJECTION_VERSION, policyVersion: input.policyVersion, cutoff: input.cutoff,
    marketRevision: input.marketRevision, members: ranked.slice(0, 10).map((member, index) => ({ rank: index + 1, ...member })),
    excluded, qualifiedOutsideTop10: ranked.slice(10).map(member => member.symbol),
    authority: 'projection_only_requires_trusted_server_adapter' as const };
}
