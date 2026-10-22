import { createHash } from 'node:crypto';

export const POLICY = Object.freeze({ version: 'stockinsider-vnext-20-v1', activeSlots: 20, attemptsPerSession: 4,
  retryLimit: 1, dailyContent: 200, sourceContent: 50, replacementMargin: 5, confirmationSessions: 2,
  replaces: ['candidate-queue-20', 'research-weekly-5', 'candidate-projection-15-plus-5'] });
export const INITIAL_WEIGHTS = { recency: 20, sourceVolume: 25, priceVolume: 25, chips: 15, operationsCatalyst: 15 } as const;
export const DEEP_WEIGHTS = { valuation: 30, profitability: 25, technicalChips: 20, catalysts: 15, marketLiquidity: 10 } as const;
export function vnextEnabled() { return process.env.STOCKINSIDER_VNEXT_ENABLED === 'true'; }
export type Factor = { raw: unknown; value: number | null; provenance: string[]; reason: string; components?: Record<string, Factor> };
export type Factors = Record<string, Factor>;
export function scoreFactors(factors: Factors, weights: Record<string, number>) {
  let confirmedPoints = 0; let availableWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const f = factors[key];
    if (f?.components) {
      const keys = Object.keys(f.components); const nested = scoreFactors(f.components, Object.fromEntries(keys.map((key) => [key, weight / keys.length])));
      confirmedPoints += nested.confirmedPoints; availableWeight += nested.availableWeight; continue;
    }
    if (f?.value === null || f?.value === undefined || !Number.isFinite(f.value) || !f.provenance.length || !f.reason) continue;
    if (f.value < 0 || f.value > 1) throw new Error('vnext_factor_out_of_range');
    confirmedPoints += f.value * weight; availableWeight += weight;
  }
  return { confirmedPoints, availableWeight, policyVersion: POLICY.version, factors, probability: false as const };
}
export function commonMargin(challenger: Factors, incumbent: Factors, weights: Record<string, number>) {
  let margin = 0; let weight = 0;
  for (const [key, w] of Object.entries(weights)) {
    const a = challenger[key]; const b = incumbent[key];
    if (a?.components && b?.components) {
      const keys = [...new Set([...Object.keys(a.components), ...Object.keys(b.components)])];
      const nested = commonMargin(a.components, b.components, Object.fromEntries(keys.map((key) => [key, w / keys.length])));
      margin += nested.margin; weight += nested.weight; continue;
    }
    if (a?.value == null || b?.value == null || !a.provenance.length || !b.provenance.length) continue;
    if (![a.value, b.value].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) continue;
    margin += (a.value - b.value) * w; weight += w;
  }
  return { margin, weight };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .filter(([key]) => !['fetchedAt', 'collectedAt', 'retrievedAt', 'evaluatedAt'].includes(key)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function inputHash(value: unknown) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
/** Admission dedup uses substantive facts, rather than a later screening clock. */
export function researchMaterialHash(value: Record<string, unknown>) {
  const screening = value.screening as Record<string, unknown> | undefined;
  const clues = Array.isArray(value.clues) ? value.clues.map((raw) => {
    const clue = raw as Record<string, unknown>;
    return { symbol: clue.symbol, source: clue.source, root: clue.root, authorRoot: clue.authorRoot, eventAt: clue.eventAt,
      contentHash: clue.contentHash, catalystUntil: clue.catalystUntil, rightsAttested: clue.rightsAttested, operatorClaim: clue.operatorClaim };
  }) : [];
  return inputHash({ policyVersion: POLICY.version, clues, evidence: value.evidence,
    screening: screening ? { ...screening, cutoff: undefined, clues: undefined } : null, deep: value.deep,
    marketSnapshotHash: value.marketSnapshotHash, tradingValid: value.tradingValid, contraindication: value.contraindication, overheated: value.overheated });
}
export function explicitScope(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > POLICY.activeSlots || value.some((v) => typeof v !== 'string' || !/^\d{4}$/u.test(v)))
    throw new Error('vnext_explicit_scope_required');
  return [...new Set(value as string[])].sort();
}
export type Session = { id: string; closeAt: string; completed: boolean };
export function latestCompletedSession(sessions: Session[], now: string): string | null {
  const cutoff = Date.parse(now);
  return sessions.filter((s) => s.completed && Number.isFinite(Date.parse(s.closeAt)) && Date.parse(s.closeAt) <= cutoff)
    .map((s) => s.id).sort().at(-1) || null;
}
export function taipeiDate(now: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}
export const STAGING_SCHEDULE = Object.freeze({ enabled: false, timeZone: 'Asia/Taipei', postClose: '18:30', premarket: '08:15' });
