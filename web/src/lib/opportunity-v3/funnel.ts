import { clampScore, roundHalfAwayFromZero } from './canonical.ts';
import { SOURCE_CLASSES_V3, sourcePolicy } from './config.ts';
import type { CandidateV3, ClaimV3 } from './contracts.ts';

function sourcePrior(sourceClass: ClaimV3['sourceClass']): number {
  return SOURCE_CLASSES_V3.find((row) => row[0] === sourceClass)?.[1] ?? 0;
}

export function isFreshClaim(claim: ClaimV3, cutoff: string): boolean {
  const ttl = SOURCE_CLASSES_V3.find((row) => row[0] === claim.sourceClass)?.[2] ?? 0;
  const age = (new Date(cutoff).getTime() - new Date(claim.effectiveAt).getTime()) / 1000;
  return Number.isFinite(age) && age >= 0 && age <= ttl && sourcePolicy(claim.sourceKey) !== null;
}

export function preResearchScore(
  claim: ClaimV3,
  priceVolume: number | null,
  chip: number | null,
  liquidity: number | null,
): number {
  const source = 100 * sourcePrior(claim.sourceClass) * claim.confidence;
  return clampScore(0.6 * source + 0.2 * (priceVolume ?? 0) + 0.1 * (chip ?? 0) + 0.1 * (liquidity ?? 0));
}

export function boundedCandidates(candidates: CandidateV3[]): {
  active: CandidateV3[];
  shallow: CandidateV3[];
  deep: CandidateV3[];
  visible: CandidateV3[];
} {
  const grouped = new Map<string, CandidateV3[]>();
  for (const candidate of candidates) {
    const rows = grouped.get(candidate.symbol) ?? [];
    rows.push(candidate);
    grouped.set(candidate.symbol, rows);
  }
  const canonical = [...grouped.values()].map((rows) => {
    const ordered = rows.toSorted((a, b) =>
      b.preResearchScore - a.preResearchScore ||
      Number(b.directSource) - Number(a.directSource) ||
      b.anchor.confidence - a.anchor.confidence ||
      sourcePrior(b.anchor.sourceClass) - sourcePrior(a.anchor.sourceClass) ||
      b.anchor.effectiveAt.localeCompare(a.anchor.effectiveAt) ||
      a.anchor.sourceKey.localeCompare(b.anchor.sourceKey) ||
      a.anchor.canonicalClaimHash.localeCompare(b.anchor.canonicalClaimHash));
    const owner = ordered[0];
    const evidence = new Map<string, ClaimV3>();
    for (const row of ordered) {
      for (const claim of [row.anchor, ...row.claims]) {
        if (!evidence.has(claim.canonicalClaimHash)) evidence.set(claim.canonicalClaimHash, claim);
      }
    }
    return {
      ...owner,
      claims: [...evidence.values()].filter(
        (claim) => claim.canonicalClaimHash !== owner.anchor.canonicalClaimHash,
      ),
    };
  });
  const active = canonical
    .sort((a, b) => b.preResearchScore - a.preResearchScore || a.symbol.localeCompare(b.symbol))
    .slice(0, 60);
  const shallow = fairQuota(active, 30, (candidate) => candidate.anchor.sourceKey, 0.4);
  const deep = fairQuota(shallow, 20, (candidate) => candidate.sector || 'unknown', 0.35);
  return { active, shallow, deep, visible: deep.slice(0, 12) };
}

export function fairQuota<T>(rows: T[], limit: number, groupOf: (row: T) => string, baseShare = 0): T[] {
  if (limit <= 0 || rows.length === 0) return [];
  const target = Math.min(limit, rows.length);
  const groupCount = new Set(rows.map(groupOf)).size;
  const cap = Math.ceil(target * Math.max(baseShare, 1 / groupCount));
  const chosen: T[] = [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const group = groupOf(row);
    const count = counts.get(group) ?? 0;
    if (count >= cap) continue;
    chosen.push(row);
    counts.set(group, count + 1);
    if (chosen.length === target) break;
  }
  return chosen;
}

export function quotaCoverage(selected: number, target: number): number {
  return target === 0 ? 100 : roundHalfAwayFromZero((100 * selected) / target, 2);
}
