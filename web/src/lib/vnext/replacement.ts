import { commonMargin, INITIAL_WEIGHTS, POLICY, scoreFactors, type Factors } from './policy.ts';
export type Candidate = { symbol: string; derivationVersion?:string; factors: Factors; eventAt: string; priceEvidence: boolean; eventEvidence: boolean; rootEvidence: boolean;
  eligible: boolean; contraindication: boolean; catalystCancelled: boolean; tradingInvalid: boolean; targetHit: boolean; newThesis: boolean; overheated: boolean };
export function exitReason(c: Candidate) {
  if (c.contraindication) return 'verified_contraindication'; if (c.catalystCancelled) return 'catalyst_cancelled';
  if (c.tradingInvalid) return 'trading_invalid'; if (c.targetHit && !c.newThesis) return 'target_hit'; return null;
}
export function candidateOrder(a: Candidate, b: Candidate) {
  const x = scoreFactors(a.factors, INITIAL_WEIGHTS); const y = scoreFactors(b.factors, INITIAL_WEIGHTS);
  return y.confirmedPoints - x.confirmedPoints || y.availableWeight - x.availableWeight || b.eventAt.localeCompare(a.eventAt) || a.symbol.localeCompare(b.symbol);
}
export type Confirmation = { challenger: string; incumbent: string; policy: string; lastSession: string; count: number };
export function confirmReplacement(challenger: Candidate, incumbent: Candidate, session: string, officialSessions: string[], previous?: Confirmation) {
  const margin = commonMargin(challenger.factors, incumbent.factors, INITIAL_WEIGHTS);
  const matchingVersion=challenger.derivationVersion===incumbent.derivationVersion;
  const policy=challenger.derivationVersion?`${POLICY.version}:${challenger.derivationVersion}`:POLICY.version;
  const valid = matchingVersion && challenger.eligible && incumbent.eligible && !exitReason(challenger) && !exitReason(incumbent) && !challenger.overheated
    && challenger.priceEvidence && challenger.eventEvidence && challenger.rootEvidence && incumbent.priceEvidence && incumbent.eventEvidence && incumbent.rootEvidence
    && margin.margin >= POLICY.replacementMargin && officialSessions.includes(session);
  if (!valid) return { confirmation: null, replace: false, margin };
  const same = previous?.challenger === challenger.symbol && previous.incumbent === incumbent.symbol && previous.policy === policy;
  const priorIndex = previous ? officialSessions.indexOf(previous.lastSession) : -1;
  const index = officialSessions.indexOf(session);
  const count = same && previous!.lastSession === session ? previous!.count : same && priorIndex >= 0 && index === priorIndex + 1 ? previous!.count + 1 : 1;
  const confirmation = { challenger: challenger.symbol, incumbent: incumbent.symbol, policy, lastSession: session, count };
  return { confirmation, replace: count >= POLICY.confirmationSessions, margin };
}
