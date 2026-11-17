/** Exact PostgreSQL/ISO microsecond clock for cached evidence boundaries. */
export function evidenceInstant(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  const seconds = match ? Date.parse(match[1] + match[3]) : NaN;
  if (!match || !Number.isFinite(seconds) || Number(match[1].slice(11, 13)) > 23 || Number(match[1].slice(14, 16)) > 59 || Number(match[1].slice(17, 19)) > 59) return null;
  const civil = Date.parse(match[1].slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(civil) || new Date(civil).toISOString().slice(0, 10) !== match[1].slice(0, 10)) return null;
  return Number.isFinite(seconds) ? BigInt(seconds) * BigInt(1000) + BigInt((match![2] || '').padEnd(6, '0')) : null;
}
export function evidenceKnownAt(value: unknown, cutoff: string) {
  const at = evidenceInstant(value), end = evidenceInstant(cutoff);
  return at !== null && end !== null && at <= end;
}
export function compareEvidenceClocks(a: unknown, b: unknown) {
  const left = evidenceInstant(a), right = evidenceInstant(b);
  if (left === null || right === null) throw Error('vnext_evidence_clock_invalid');
  return left < right ? -1 : left > right ? 1 : 0;
}
