import { POLICY } from './policy.ts';
import type { Candidate } from './replacement.ts';
import { candidateOrder } from './replacement.ts';
type Row = Record<string, unknown>;
export type RotationObservation = { symbol: string; input: Row; candidate: Candidate; active: boolean; state?: string; verifiedExit?: { reason: string; evidence: string[] } };
export type RotationContext = { session: string; completed: boolean; postclose: boolean; weeklyDue: boolean };
/** Cache observations never rewrite a frozen research input. SQL owns all swaps,
 * confirmation counts, admission reservations and membership transitions. */
export async function rotateCachedObservations(context: RotationContext, observations: RotationObservation[], send: (action: string, request: Row) => Promise<Row>) {
  const reports: Row[] = [];
  for (const row of observations.filter((r) => r.active && r.verifiedExit)) {
    reports.push(await send('exit', { symbol: row.symbol, ...row.verifiedExit }));
    row.active = false;
  }
  await send('screen-observations', { session: context.session, observations: observations.map((r) => ({ symbol: r.symbol, input: r.input })) });
  if (context.weeklyDue) reports.push(await send('weekly-audit', { session: context.session, symbols: observations.filter((r) => r.active).map((r) => r.symbol),
    gaps: observations.filter((r) => r.active && !r.candidate.priceEvidence).map((r) => `${r.symbol}:current_comparison_evidence_missing`) }));
  if (!context.completed || !context.postclose) return { reports, reason: 'routine_rotation_requires_completed_postclose_session' };
  const challengers = observations.filter((r) => !r.active && !r.verifiedExit && r.candidate.eligible).sort((a,b) => candidateOrder(a.candidate,b.candidate)).slice(0,20);
  for (const challenger of challengers) {
    // Re-read under the SQL lock on each swap. Missing current factors never
    // create a forced exit or substitute the frozen research score.
    reports.push(await send('swap', { challengerSymbol: challenger.symbol, policy: POLICY.version,
      requestKey: `rotation:${context.session}:${challenger.symbol}:${String(challenger.input.hash)}` }));
  }
  return { reports, considered: challengers.length };
}
