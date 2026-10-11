import { financialInstant } from './research-financial-clock.ts';

/** The persistent source clock is PostgreSQL timestamptz (microseconds).
 * Reject finer input instead of silently rounding availability or identity. */
export function sourceEvidenceInstant(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value))
    throw new Error('research_inbox_clock_precision_invalid');
  return financialInstant(value);
}
export function sourceEvidenceClockValid(value: unknown): value is string {
  try { sourceEvidenceInstant(value); return true; } catch { return false; }
}
export function canonicalSourceEvidenceClock(value: string): string {
  sourceEvidenceInstant(value);
  const fraction = (/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/u.exec(value)?.[1] || '').padEnd(6, '0');
  const canonicalFraction = fraction.replace(/0+$/u, '').padEnd(3, '0');
  return new Date(value).toISOString().replace(/\.\d{3}Z$/u, `.${canonicalFraction}Z`);
}

