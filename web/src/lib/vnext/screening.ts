import { POLICY } from './policy.ts';
export type Clue = { symbol: string; source: string; root: string; authorRoot: string; eventAt: string; contentHash: string;
  availableAt: string; catalystUntil?: string; rightsAttested?: boolean; operatorClaim?: boolean; rawContent?: string };
export function eligibleClue(clue: Clue, cutoff: string) {
  const cutoffMs = Date.parse(cutoff); const eventMs = Date.parse(clue.eventAt); const availableMs = Date.parse(clue.availableAt);
  if (![cutoffMs, eventMs, availableMs].every(Number.isFinite) || eventMs > cutoffMs || availableMs > cutoffMs || availableMs < eventMs) return false;
  const allowedKeys = new Set(['symbol', 'source', 'root', 'authorRoot', 'eventAt', 'contentHash', 'availableAt', 'catalystUntil', 'rightsAttested', 'operatorClaim', 'rawContent']);
  if (Object.keys(clue).some((key) => !allowedKeys.has(key))) return false;
  if (![clue.source, clue.root, clue.authorRoot].every((s) => typeof s === 'string' && s.length > 0 && s.length <= 256) || !/^[a-f0-9]{64}$/u.test(clue.contentHash)) return false;
  const age = cutoffMs - eventMs;
  const restricted = ['investanchors', 'telegram'].includes(clue.source.toLowerCase());
  if (restricted && (!clue.rightsAttested || !clue.operatorClaim || clue.rawContent)) return false;
  if (!clue.root || !clue.authorRoot || !clue.contentHash || !/^\d{4}$/u.test(clue.symbol) || Date.parse(clue.availableAt) > Date.parse(cutoff)) return false;
  const maxCatalyst = new Date(cutoff); maxCatalyst.setUTCMonth(maxCatalyst.getUTCMonth() + 3);
  const catalyst = clue.catalystUntil ? Date.parse(clue.catalystUntil) : NaN;
  return age >= 0 && (age <= 30 * 86400000 || (catalyst >= Date.parse(cutoff) && catalyst <= maxCatalyst.getTime()));
}
/** A shared author or original root joins a single syndication family. */
export function independentClues(clues: Clue[]) {
  const ordered = [...clues].filter((c) => c.root && c.authorRoot).sort((a, b) => a.contentHash.localeCompare(b.contentHash));
  const parent = ordered.map((_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const roots = new Map<string, number>(); const authors = new Map<string, number>();
  for (const [i, clue] of ordered.entries()) for (const [map, key] of [[roots, `${clue.symbol}:${clue.root}`], [authors, `${clue.symbol}:${clue.authorRoot}`]] as const) {
    const prior = map.get(key); if (prior !== undefined) parent[find(i)] = find(prior); else map.set(key, i);
  }
  const selected = new Map<number, Clue>(); for (const [i, clue] of ordered.entries()) if (!selected.has(find(i))) selected.set(find(i), clue);
  return [...selected.values()];
}
/** One shared, deterministic batch. Source health is independent of observed volume. */
export function screenRoundRobin(clues: Clue[], cutoff: string, alreadyParsed: ReadonlySet<string> = new Set()) {
  const groups = new Map<string, Clue[]>(); const seen = new Set(alreadyParsed);
  for (const clue of clues.filter((c) => eligibleClue(c, cutoff)).sort((a, b) => a.eventAt.localeCompare(b.eventAt) || a.contentHash.localeCompare(b.contentHash))) {
    if (!eligibleClue(clue, cutoff) || seen.has(clue.contentHash)) continue;
    seen.add(clue.contentHash); const list = groups.get(clue.source) || []; list.push(clue); groups.set(clue.source, list);
  }
  const sources = [...groups.keys()].sort(); const result: Clue[] = [];
  for (let round = 0; round < POLICY.sourceContent && result.length < POLICY.dailyContent; round++) for (const source of sources) {
    const clue = groups.get(source)?.[round]; if (!clue || result.length >= POLICY.dailyContent) continue;
    result.push(clue);
  }
  return result;
}
export function volumeComparison(recent7: number | null, prior21: number | null, sourceHealthy: boolean) {
  if (!sourceHealthy || recent7 === null || prior21 === null || recent7 < 0 || prior21 < 0) return { ratio: null, state: 'gap' };
  if (prior21 === 0) return { ratio: null, state: recent7 > 0 ? 'new' : 'zero' };
  return { ratio: (recent7 / 7) / (prior21 / 21), state: 'measured' };
}
