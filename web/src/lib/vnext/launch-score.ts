import type { TwEntryAuthorityRequest, TwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';
import type { launchPatternFixture } from './launch-patterns.ts';
import { evidenceInstant } from './evidence-clock.ts';
import { sha256Canonical } from '../opportunity-v3/canonical.ts';
import { evaluateLaunchRules, LAUNCH_RULE_POLICY, type LaunchExternalEvidence } from './launch-score-rules.ts';

export const LAUNCH_SCORE_POLICY = LAUNCH_RULE_POLICY;
export const LAUNCH_SCORE_ASSEMBLY = 'launch-score-unverified-assembly-v1';
export const LAUNCH_SCORE_WEIGHTS = Object.freeze({ trendRelativeStrength: 25, consolidation: 25, breakoutHold: 20, chips: 20, market: 10 });
type Component = keyof typeof LAUNCH_SCORE_WEIGHTS;
type Revisions = Record<'price' | 'calendar' | 'actions' | 'shareVolume' | 'chips' | 'market', string | null>;
type VersionedValue = { ruleId: string; ruleVersion: string; cutoff: string; availableAt: string; operandRevisionIds: string[] };
export type LaunchComponentDerivation = VersionedValue & { points: number | null; signalIds: string[] };
export type LaunchScoreAssemblyInput = {
  policyVersion: typeof LAUNCH_SCORE_POLICY; symbol: string; cutoff: string; revisions: Revisions;
  components: Record<Component, LaunchComponentDerivation | null>;
  relativeStrength63: (VersionedValue & { value: number | null }) | null;
};
const names = Object.keys(LAUNCH_SCORE_WEIGHTS) as Component[];
const technical = names.slice(0, 3);
const label = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 240;
const keys = (value: unknown, expected: string) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(' ') === expected.split(' ').sort().join(' ');
const invalid = (): never => { throw Error('launch_score_contract_invalid'); };

/** Aggregate explicitly UNVERIFIED supplied derivations. This validates bounds,
 * lineage and sums, not the meaning of any point rule or its producer. */
export function assembleLaunchScore(input: LaunchScoreAssemblyInput) {
  if (!keys(input, 'policyVersion symbol cutoff revisions components relativeStrength63')) invalid();
  const cutoff = evidenceInstant(input.cutoff);
  if (input.policyVersion !== LAUNCH_SCORE_POLICY || typeof input.symbol !== 'string' || !/^\d{4}$/u.test(input.symbol) || cutoff === null
    || !keys(input.components, names.join(' '))
    || !keys(input.revisions, 'actions calendar chips market price shareVolume')
    || Object.values(input.revisions).some(value => value !== null && !label(value))) invalid();
  const revisions = new Set(Object.values(input.revisions).filter((value): value is string => value !== null));
  const gaps = new Set<string>(['component_point_rules_and_semantics_unverified', 'formal_review_and_publication_not_connected']);
  const seenSignals = new Set<string>();
  const known = (record: VersionedValue) => {
    if (!label(record.ruleId) || !label(record.ruleVersion) || record.cutoff !== input.cutoff
      || !Array.isArray(record.operandRevisionIds) || record.operandRevisionIds.length < 1 || record.operandRevisionIds.length > 8
      || new Set(record.operandRevisionIds).size !== record.operandRevisionIds.length
      || record.operandRevisionIds.some(id => !label(id) || !revisions.has(id))) invalid();
    const at = evidenceInstant(record.availableAt);
    if (at === null) invalid();
    return at! <= cutoff!;
  };
  const components = Object.fromEntries(names.map(name => {
    const record = input.components[name];
    let points: number | null = null;
    if (record !== null) {
      if (!keys(record, 'ruleId ruleVersion cutoff availableAt operandRevisionIds points signalIds')) invalid();
      if (record.points !== null && (!Number.isFinite(record.points) || record.points < 0 || record.points > LAUNCH_SCORE_WEIGHTS[name])
        || !Array.isArray(record.signalIds) || record.signalIds.length > 32 || record.signalIds.some(id => !label(id))) invalid();
      for (const signal of record.signalIds) {
        if (seenSignals.has(signal)) invalid();
        seenSignals.add(signal);
      }
      if (known(record)) points = record.points;
      else gaps.add(`${name}_derivation_unavailable_at_cutoff`);
    }
    if (points === null) gaps.add(`${name}_points_unknown`);
    return [name, { maxPoints: LAUNCH_SCORE_WEIGHTS[name], points,
      derivation: record === null ? null : structuredClone(record) }];
  })) as Record<Component, { maxPoints: number; points: number | null; derivation: LaunchComponentDerivation | null }>;
  const availableWeight = names.reduce((sum, name) => sum + (components[name].points === null ? 0 : LAUNCH_SCORE_WEIGHTS[name]), 0);
  const confirmedPoints = names.reduce((sum, name) => sum + (components[name].points ?? 0), 0);
  const confirmedTechnicalPoints = technical.reduce((sum, name) => sum + (components[name].points ?? 0), 0);
  const technicalScore = technical.every(name => components[name].points !== null) ? confirmedTechnicalPoints : null;
  const rs = input.relativeStrength63;
  let relativeStrength63: number | null = null;
  if (rs !== null) {
    if (!keys(rs, 'ruleId ruleVersion cutoff availableAt operandRevisionIds value')) invalid();
    if (rs.value !== null && !Number.isFinite(rs.value)) invalid();
    if (known(rs)) relativeStrength63 = rs.value;
    else gaps.add('relative_strength63_unavailable_at_cutoff');
  }
  if (relativeStrength63 === null) gaps.add('relative_strength63_unknown');
  return { schemaVersion: LAUNCH_SCORE_ASSEMBLY, policyVersion: LAUNCH_SCORE_POLICY,
    scope: 'unverified_component_arithmetic' as const, symbol: input.symbol, cutoff: input.cutoff,
    revisions: { ...input.revisions }, assemblyInput: structuredClone(input), components, confirmedPoints, availableWeight,
    totalScore: availableWeight === 100 ? confirmedPoints : null, confirmedTechnicalPoints, technicalScore, relativeStrength63,
    derivationsVerified: false as const, rankable: false as const, rankingAuthority: false as const,
    publicationAuthority: false as const, sourceAuthority: false as const, entryAuthority: false as const, probability: false as const,
    gaps: [...gaps].sort() };
}

/** Actual T06 consumer of the separately versioned, user-authorized fixed
 * engineering rulebook. Missing source operands retain atomic null weights. */
export function scoreLaunchReadEvidence(request: Pick<TwEntryAuthorityRequest, 'symbol' | 'exchange' | 'cutoff' | 'signalSession'>,
  selected: { evidence: TwLaunchPatternReadEvidence; arithmetic: ReturnType<typeof launchPatternFixture> }, external: LaunchExternalEvidence = {}) {
  return evaluateLaunchRules(request, selected, external);
}

/** Stable bounded presentation of supplied arithmetic only. Unknown totals or
 * required RS tie keys are disclosed, never presented as an official ranking. */
export function launchScorePage(inputs: LaunchScoreAssemblyInput[], options: {
  limit?: number; cursor?: { snapshotHash: string; afterSymbol: string };
} = {}) {
  const limit = options.limit ?? 10;
  if (inputs.length > 20 || !Number.isInteger(limit) || limit < 1 || limit > 10
    || new Set(inputs.map(row => row.symbol)).size !== inputs.length
    || new Set(inputs.map(row => row.cutoff)).size > 1) invalid();
  const rows = inputs.map(assembleLaunchScore);
  const snapshotHash = sha256Canonical([...inputs].sort((a, b) => a.symbol.localeCompare(b.symbol)));
  const unresolved = new Set<string>();
  const tieGroup = (row: typeof rows[number]) => JSON.stringify([row.totalScore, row.technicalScore]);
  const groups = new Map<string, typeof rows>();
  for (const row of rows) groups.set(tieGroup(row), [...(groups.get(tieGroup(row)) ?? []), row]);
  const unknownGroups = new Set<string>();
  for (const [key, members] of groups) {
    if (members.length >= 2 && members.some(row => row.relativeStrength63 === null)) {
      unknownGroups.add(key);
      for (const row of members) unresolved.add(row.symbol);
    }
  }
  const descending = (a: number | null, b: number | null) => a === null ? b === null ? 0 : 1 : b === null ? -1 : b - a;
  rows.sort((a, b) => {
    const score = descending(a.totalScore, b.totalScore), tech = descending(a.technicalScore, b.technicalScore);
    if (score) return score;
    if (tech) return tech;
    if (unknownGroups.has(tieGroup(a))) return a.symbol.localeCompare(b.symbol);
    return descending(a.relativeStrength63, b.relativeStrength63) || a.symbol.localeCompare(b.symbol);
  });
  const cursor = options.cursor;
  if (cursor && (cursor.snapshotHash !== snapshotHash || !rows.some(row => row.symbol === cursor.afterSymbol))) invalid();
  const start = cursor ? rows.findIndex(row => row.symbol === cursor.afterSymbol) + 1 : 0;
  const items = rows.slice(start, start + limit);
  const incomplete = rows.some(row => row.totalScore === null || row.technicalScore === null);
  return { scope: 'unverified_score_presentation_only' as const, rankingAuthority: false as const, publicationAuthority: false as const,
    sourceAuthority: false as const, entryAuthority: false as const, rankable: false as const, probability: false as const,
    policyVersion: LAUNCH_SCORE_POLICY, cutoff: inputs[0]?.cutoff ?? null,
    snapshotHash, items, total: rows.length, unresolvedTieSymbols: [...unresolved].sort(),
    orderingStatus: incomplete ? 'incomplete_scores_presentation_only' as const
      : unresolved.size ? 'unknown_relative_strength_tie_presentation_only' as const : 'supplied_numeric_tie_order_only' as const,
    nextCursor: start + items.length < rows.length ? { snapshotHash, afterSymbol: items.at(-1)!.symbol } : null };
}
