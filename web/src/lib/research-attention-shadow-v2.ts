import { discoveryInstant } from './research-discovery-evidence.ts';
import { RESEARCH_PRIORITY_POLICY, RESEARCH_PRIORITY_WEIGHTS, type ResearchSourceRoot } from './research-agent-priority.ts';

export const RESEARCH_ATTENTION_SHADOW_POLICY = 'research-attention-shadow-v2' as const;
export const RESEARCH_ATTENTION_SHADOW_LIMITS = Object.freeze({
  roots: 20_000, bindings: 20_000, identifierBytes: 512, referenceBytes: 2048,
  timeBytes: 40, inputBytes: 16 * 1024 * 1024,
});

/** Reviewed relationship supplied by a trusted controller. This pure computation
 * does not authenticate that controller, verify evidence, or grant authority. */
export type ReviewedResearchOriginBinding = {
  rootId: string; revisionId: string; publisherId: string; originId: string;
  evidenceRef: string; observedAt: string; reviewedAt: string;
};
export type ResearchAttentionShadowInput = {
  asOf: string; roots: ResearchSourceRoot[]; originBindings: ReviewedResearchOriginBinding[];
  v1Baseline?: { policyVersion: typeof RESEARCH_PRIORITY_POLICY; score: number; independentRootCount: number };
};
const rootKeys = ['rootId', 'url', 'publishedAt', 'firstObservedAt', 'revisionObservedAt',
  'revisionId', 'isOriginalSource', 'kind', 'status'];
const bindingKeys = ['rootId', 'revisionId', 'publisherId', 'originId', 'evidenceRef', 'observedAt', 'reviewedAt'];
// Forty-byte timestamps allow at most nineteen fractional digits. Retain all
// supplied precision; Date.parse alone silently drops sub-millisecond clocks.
const secondScale = BigInt('100000000000000000000');
const week = BigInt(7 * 86400) * secondScale;
const limits = RESEARCH_ATTENTION_SHADOW_LIMITS;
function ensure(ok: unknown): asserts ok { if (!ok) throw new Error('research_attention_shadow_invalid'); }
function record(value: unknown, keys: string[], required = keys): asserts value is Record<string, unknown> {
  ensure(value && typeof value === 'object' && !Array.isArray(value));
  ensure([Object.prototype, null].includes(Object.getPrototypeOf(value)));
  const row = value as Record<string, unknown>;
  ensure(Object.keys(row).every((key) => keys.includes(key)) && required.every((key) => Object.hasOwn(row, key)));
}
function text(value: unknown, bytes: number): asserts value is string {
  ensure(typeof value === 'string' && value.length > 0 && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value) && Buffer.byteLength(value, 'utf8') <= bytes);
}
function instant(value: unknown, cutoff?: bigint): bigint {
  text(value, limits.timeBytes); ensure(discoveryInstant(value));
  const parts = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/u.exec(value)!;
  const n = BigInt(Date.parse(parts[1] + parts[3])) * (secondScale / BigInt(1000))
    + BigInt((parts[2] || '').padEnd(20, '0'));
  ensure(cutoff === undefined || n <= cutoff); return n;
}
function validateRoot(value: unknown, cutoff: bigint): asserts value is ResearchSourceRoot {
  record(value, rootKeys, ['rootId', 'url', 'publishedAt', 'firstObservedAt', 'kind', 'status']);
  text(value.rootId, limits.identifierBytes); text(value.url, limits.referenceBytes);
  const url = new URL(value.url); ensure(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password);
  const published = instant(value.publishedAt, cutoff), first = instant(value.firstObservedAt, cutoff);
  ensure(published <= first);
  if (value.revisionObservedAt !== undefined) ensure(instant(value.revisionObservedAt, cutoff) >= first);
  if (value.revisionId !== undefined) text(value.revisionId, limits.identifierBytes);
  if (value.isOriginalSource !== undefined) ensure(typeof value.isOriginalSource === 'boolean');
  ensure(typeof value.kind === 'string'
    && ['official_verified', 'primary_industry', 'public_broker', 'news', 'social_rumor', 'metadata_only'].includes(value.kind));
  ensure(typeof value.status === 'string' && ['current', 'retracted', 'contradicted'].includes(value.status));
}
/** Mirror v1 selection without changing its live path. Ambiguous equal-identity
 * rows reject rather than choose a different result based on input order. */
function selectedRoots(roots: ResearchSourceRoot[]): ResearchSourceRoot[] {
  const selected = new Map<string, ResearchSourceRoot>();
  const firstTimes = new Map<string, string>();
  const severity = { current: 0, contradicted: 1, retracted: 2 };
  // Validate every tied revision, including losers. Comparing only against the
  // current winner lets a newer row hide an older ambiguous pair by permutation.
  const groups = new Map<string, Map<string, { precise: bigint; rows: ResearchSourceRoot[] }>>();
  for (const root of roots) {
    const time = root.revisionObservedAt || root.firstObservedAt;
    const key = `${root.isOriginalSource !== false}:${Date.parse(time)}`;
    const byClock = groups.get(root.rootId) || new Map<string, { precise: bigint; rows: ResearchSourceRoot[] }>();
    const group = byClock.get(key) || { precise: instant(time), rows: [] };
    ensure(group.precise === instant(time)); group.rows.push(root);
    byClock.set(key, group); groups.set(root.rootId, byClock);
  }
  for (const byClock of groups.values()) for (const group of byClock.values()) {
    group.rows.sort((a, b) => severity[a.status] - severity[b.status]
      || (a.revisionId || a.url).localeCompare(b.revisionId || b.url));
    for (let i = 1; i < group.rows.length; i++) {
      const a = group.rows[i - 1], b = group.rows[i];
      const aKey = a.revisionId || a.url, bKey = b.revisionId || b.url;
      if (severity[a.status] === severity[b.status] && aKey.localeCompare(bKey) === 0)
        ensure(aKey === bKey && a.revisionId === b.revisionId
          && a.kind === b.kind && instant(a.publishedAt) === instant(b.publishedAt));
    }
  }
  for (const root of roots) {
    const first = firstTimes.get(root.rootId);
    if (!first || instant(root.firstObservedAt) < instant(first)
      || instant(root.firstObservedAt) === instant(first) && root.firstObservedAt < first)
      firstTimes.set(root.rootId, root.firstObservedAt);
    const prior = selected.get(root.rootId);
    const revision = Date.parse(root.revisionObservedAt || root.firstObservedAt);
    const previous = prior ? Date.parse(prior.revisionObservedAt || prior.firstObservedAt) : -Infinity;
    const original = root.isOriginalSource !== false, priorOriginal = prior?.isOriginalSource !== false;
    const tie = (root.revisionId || root.url).localeCompare(prior?.revisionId || prior?.url || '');
    if (!prior || original && !priorOriginal || original === priorOriginal && (revision > previous
      || revision === previous && (severity[root.status] > severity[prior.status]
        || severity[root.status] === severity[prior.status] && tie > 0))) selected.set(root.rootId, root);
  }
  return [...selected.values()].map((root) => ({ ...root,
    firstObservedAt: firstTimes.get(root.rootId)!,
  })).sort((a, b) => a.rootId.localeCompare(b.rootId));
}

/** Publisher/origin connected components are a conservative lower bound;
 * components do not imply that every article shares identical content. */
function components(edges: ReviewedResearchOriginBinding[]): number {
  const parents = new Map<string, string>(), ranks = new Map<string, number>();
  const find = (key: string): string => {
    if (!parents.has(key)) { parents.set(key, key); ranks.set(key, 0); }
    let root = key;
    while (parents.get(root) !== root) root = parents.get(root)!;
    while (key !== root) { const next = parents.get(key)!; parents.set(key, root); key = next; }
    return root;
  };
  for (const edge of edges) {
    let a = find(`publisher:${edge.publisherId}`), b = find(`origin:${edge.originId}`);
    if (a === b) continue;
    if (ranks.get(a)! < ranks.get(b)!) [a, b] = [b, a];
    parents.set(b, a); if (ranks.get(a) === ranks.get(b)) ranks.set(a, ranks.get(a)! + 1);
  }
  return new Set([...parents.keys()].map(find)).size;
}

export function analyzeResearchAttentionShadow(input: ResearchAttentionShadowInput) {
  record(input, ['asOf', 'roots', 'originBindings', 'v1Baseline'], ['asOf', 'roots', 'originBindings']);
  const cutoff = instant(input.asOf);
  ensure(Array.isArray(input.roots) && input.roots.length <= limits.roots
    && Array.isArray(input.originBindings) && input.originBindings.length <= limits.bindings);
  const knownRevisions = new Map<string, Map<string, bigint>>();
  for (const root of input.roots) {
    validateRoot(root, cutoff);
    if (root.revisionId) {
      const revisions = knownRevisions.get(root.rootId) || new Map<string, bigint>();
      const time = instant(root.revisionObservedAt || root.firstObservedAt);
      if (!revisions.has(root.revisionId) || time > revisions.get(root.revisionId)!) revisions.set(root.revisionId, time);
      knownRevisions.set(root.rootId, revisions);
    }
  }
  const byRoot = new Map<string, Map<string, ReviewedResearchOriginBinding>>();
  for (const binding of input.originBindings) {
    record(binding, bindingKeys);
    for (const key of ['rootId', 'revisionId', 'publisherId', 'originId'] as const) text(binding[key], limits.identifierBytes);
    text(binding.evidenceRef, limits.referenceBytes);
    const observed = instant(binding.observedAt, cutoff), reviewed = instant(binding.reviewedAt, cutoff);
    ensure(observed <= reviewed);
    const revisionTime = knownRevisions.get(binding.rootId)?.get(binding.revisionId);
    if (revisionTime !== undefined) ensure(observed >= revisionTime);
    const revisions = byRoot.get(binding.rootId) || new Map<string, ReviewedResearchOriginBinding>();
    ensure(!revisions.has(binding.revisionId)); // Includes conflicting and identical duplicates.
    revisions.set(binding.revisionId, binding); byRoot.set(binding.rootId, revisions);
  }
  if (input.v1Baseline !== undefined) {
    record(input.v1Baseline, ['policyVersion', 'score', 'independentRootCount']);
    ensure(input.v1Baseline.policyVersion === RESEARCH_PRIORITY_POLICY
      && Number.isFinite(input.v1Baseline.score) && input.v1Baseline.score >= 0 && input.v1Baseline.score <= 100
      && Number.isInteger(input.v1Baseline.independentRootCount)
      && input.v1Baseline.independentRootCount >= 0 && input.v1Baseline.independentRootCount <= limits.roots);
  }
  ensure(Buffer.byteLength(JSON.stringify(input), 'utf8') <= limits.inputBytes);
  const roots = selectedRoots(input.roots).filter((root) => root.status === 'current' && root.kind !== 'metadata_only');
  const bucket = (n: bigint) => n > cutoff - week ? 'recent' : n > cutoff - BigInt(2) * week ? 'prior' : 'older';
  const edges: ReviewedResearchOriginBinding[] = [], unknown: string[] = [];
  const firstOriginPublication = new Map<string, bigint>();
  for (const root of roots) {
    const binding = root.revisionId ? byRoot.get(root.rootId)?.get(root.revisionId) : undefined;
    if (!binding) { unknown.push(root.rootId); continue; }
    edges.push(binding);
    const published = instant(root.publishedAt), first = firstOriginPublication.get(binding.originId);
    if (first === undefined || published < first) firstOriginPublication.set(binding.originId, published);
  }
  const recentIndependentCount = components(edges.filter((edge) => bucket(firstOriginPublication.get(edge.originId)!) === 'recent'));
  const priorIndependentCount = components(edges.filter((edge) => bucket(firstOriginPublication.get(edge.originId)!) === 'prior'));
  return {
    policyVersion: RESEARCH_ATTENTION_SHADOW_POLICY, asOf: input.asOf,
    baselinePolicyVersion: RESEARCH_PRIORITY_POLICY, weights: { ...RESEARCH_PRIORITY_WEIGHTS },
    v1Baseline: input.v1Baseline ? { ...input.v1Baseline } : null,
    currentRootCount: roots.length, rootIds: roots.map((root) => root.rootId).sort(),
    acquisitionRecentRootCount: roots.filter((root) => bucket(instant(root.firstObservedAt)) === 'recent').length,
    acquisitionPriorRootCount: roots.filter((root) => bucket(instant(root.firstObservedAt)) === 'prior').length,
    publicationRecentRootCount: roots.filter((root) => bucket(instant(root.publishedAt)) === 'recent').length,
    publicationPriorRootCount: roots.filter((root) => bucket(instant(root.publishedAt)) === 'prior').length,
    verifiedIndependentCount: components(edges), recentIndependentCount, priorIndependentCount,
    unknownIndependenceRootIds: unknown.sort(), unusedBindingCount: input.originBindings.length - edges.length,
    independenceCoverage: unknown.length ? 'partial_or_unknown' as const : 'complete_for_supplied_roots' as const,
    shadowAttentionLevel: Math.min(4, Math.max(0, recentIndependentCount - priorIndependentCount)),
    countingMethod: 'reviewed_publisher_origin_components_lower_bound' as const,
    productionAdopted: false as const, authenticatedController: false as const,
  };
}
