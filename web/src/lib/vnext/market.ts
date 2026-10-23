import { latestCompletedSession, type Session } from './policy.ts';
export type Risk = 'risk_on' | 'selective' | 'risk_off' | 'breakdown' | 'unknown';
export type MarketInput = { risk: Risk; confidence: 'complete' | 'limited' | 'insufficient'; session: string | null; sourceAt: string | null;
  expiresAt: string | null; continuity: boolean; provenance: string[]; gaps: string[];
  overseas: Array<{ name: string; value: number | null; sourceAt: string | null; provenance: string | null }>;
  reasons?: string[]; risks?: string[]; conditions?: string[];
  background?: { status: 'observed' | 'gap'; sessions: number; from: string | null; to: string | null; taiexReturn: number | null; tpexReturn: number | null };
  aiInterpretation?: { status: 'unavailable' | 'completed'; reason: string; model?: string; modelVersion?: string; inputHash?: string; outputHash?: string; invocationId?: string; mechanisms?: Array<{eventHash:string;mechanism:string;counterevidence:string}>; gaps?: string[] } };
export function marketJudgment(input: MarketInput, sessions: Session[], now: string, overlay?: { risk: Risk; evidenceIds: string[]; modelVersion: string; inputHash: string; outputHash: string }) {
  const latest = latestCompletedSession(sessions, now);
  const gaps = [...input.gaps];
  if (!latest || latest !== input.session) gaps.push('latest_completed_tw_session_missing');
  if (!input.continuity) gaps.push('session_continuity_missing');
  if (!input.sourceAt || Date.parse(input.sourceAt) > Date.parse(now) || !Number.isFinite(Date.parse(input.sourceAt))) gaps.push('source_time_missing');
  if (!input.expiresAt || Date.parse(input.expiresAt) < Date.parse(now) || !Number.isFinite(Date.parse(input.expiresAt))) gaps.push('market_stale');
  if (!input.provenance.length) gaps.push('market_provenance_missing');
  const coreBlocked = gaps.some((gap) => !gap.startsWith('overseas_unavailable:') && !gap.startsWith('supplemental_unavailable:'));
  for (const item of input.overseas) if (item.value === null || !item.provenance || !item.sourceAt || !Number.isFinite(Date.parse(item.sourceAt)) || Date.parse(item.sourceAt) > Date.parse(now)) gaps.push(`overseas_unavailable:${item.name}`);
  const order: Risk[] = ['risk_on', 'selective', 'risk_off', 'breakdown', 'unknown'];
  let risk = coreBlocked ? 'unknown' as Risk : input.risk;
  if (overlay?.evidenceIds.length && overlay.modelVersion && overlay.inputHash && overlay.outputHash && order.indexOf(overlay.risk) > order.indexOf(risk)) risk = overlay.risk;
  const action = risk === 'risk_on' ? 'evaluate' : risk === 'selective' ? 'selective' : risk === 'unknown' ? 'cannot_determine' : 'wait';
  return { ...input, risk, confidence: coreBlocked ? 'insufficient' : gaps.length ? 'limited' : input.confidence, action, entryBlocked: ['wait', 'cannot_determine'].includes(action),
    gaps: [...new Set(gaps)], evaluatedAt: now };
}
