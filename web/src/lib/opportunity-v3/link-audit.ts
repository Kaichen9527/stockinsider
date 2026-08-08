import { sha256Canonical } from './canonical.ts';

export type LinkAuditPopulationV3 = {
  connector: string;
  linkMode: string;
  outcomeFamily: string;
  runId: string;
  claimId: string;
  mentionOrdinal: number;
};

export function linkAuditSample(population: LinkAuditPopulationV3[], cap = 400): LinkAuditPopulationV3[] {
  if (!Number.isSafeInteger(cap) || cap < 0) throw new TypeError('invalid link audit cap');
  const target = Math.min(cap, population.length);
  const strata = new Map<string, LinkAuditPopulationV3[]>();
  for (const row of population) {
    if (
      !row.connector ||
      !row.linkMode ||
      !row.outcomeFamily ||
      !row.runId ||
      !row.claimId ||
      !Number.isSafeInteger(row.mentionOrdinal) ||
      row.mentionOrdinal < 0
    ) throw new TypeError('invalid link audit population row');
    const key = [row.connector, row.linkMode, row.outcomeFamily].join('\u0000');
    const bucket = strata.get(key) ?? [];
    bucket.push(row);
    strata.set(key, bucket);
  }
  if (!target) return [];
  const orderedStrata = [...strata.entries()].sort(([left], [right]) => left.localeCompare(right));
  const allocation = new Map<string, number>();
  const base = Math.floor(target / strata.size);
  let used = 0;
  for (const [key, rows] of orderedStrata) {
    const seats = Math.min(base, rows.length);
    allocation.set(key, seats);
    used += seats;
  }
  while (used < target) {
    const eligible = orderedStrata
      .map(([key, rows]) => ({
        key,
        residual: rows.length - (allocation.get(key) ?? 0),
      }))
      .filter(({ residual }) => residual > 0);
    if (!eligible.length) break;
    const remaining = target - used;
    const totalResidual = eligible.reduce((sum, { residual }) => sum + residual, 0);
    const shares = eligible.map(({ key, residual }) => {
      const ideal = remaining * residual / totalResidual;
      const floor = Math.min(residual, Math.floor(ideal));
      return { key, residual, floor, remainder: ideal - Math.floor(ideal) };
    });
    for (const share of shares) {
      if (!share.floor) continue;
      allocation.set(share.key, (allocation.get(share.key) ?? 0) + share.floor);
      used += share.floor;
    }
    if (used === target) break;
    for (const share of shares.sort(
      (left, right) => right.remainder - left.remainder || left.key.localeCompare(right.key),
    )) {
      if ((allocation.get(share.key) ?? 0) >=
        (orderedStrata.find(([key]) => key === share.key)?.[1].length ?? 0)) continue;
      allocation.set(share.key, (allocation.get(share.key) ?? 0) + 1);
      used += 1;
      if (used === target) break;
    }
  }
  if (used !== target) throw new TypeError('link audit allocation conservation failure');
  return orderedStrata.flatMap(([key, rows]) =>
    [...rows]
      .sort((a, b) =>
        sha256Canonical(['link-audit-selection-v3.0', a.runId, a.claimId, a.mentionOrdinal])
          .localeCompare(sha256Canonical(['link-audit-selection-v3.0', b.runId, b.claimId, b.mentionOrdinal])) ||
        a.runId.localeCompare(b.runId) ||
        a.claimId.localeCompare(b.claimId) ||
        a.mentionOrdinal - b.mentionOrdinal)
      .slice(0, allocation.get(key) ?? 0));
}
