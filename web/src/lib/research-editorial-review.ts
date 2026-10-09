import { completeHash, completeCanonical } from './research-complete-canonical.ts';
import { financialInstant } from './research-financial-clock.ts';
type Row = Record<string, unknown>;
export const EDITORIAL_CHECKS = ['source_support', 'rumor_staging', 'financial_recalculation', 'periods_and_dilution',
  'competitive_alternatives', 'valuation_assumptions', 'counterevidence', 'entry_separation'] as const;
function ensure(value: unknown): asserts value { if (!value) throw new Error('research_editorial_review_invalid'); }
function exact(value: unknown, keys: string[]): Row {
  ensure(value && typeof value === 'object' && !Array.isArray(value)); const row = value as Row;
  ensure(Object.keys(row).sort().join(',') === keys.sort().join(',')); return row;
}
function text(value: unknown, min: number, max: number) {
  ensure(typeof value === 'string' && Array.from(value.trim()).length >= min && Array.from(value).length <= max
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
    && !/\bBearer\s+\S+|-----BEGIN .*PRIVATE KEY-----|\b(?:password|api[_-]?key|access[_-]?token|cookie)\s*[:=]/iu.test(value));
}
function ids(value: unknown, allowed: Set<string>) {
  ensure(Array.isArray(value) && value.length <= 30 && new Set(value).size === value.length
    && value.every(id => typeof id === 'string' && allowed.has(id)));
}
/** Pure contract only; semantic source support and actual tool execution are independent gates. */
export function validateResearchEditorialReview(packet: Row, candidate: unknown, now: string) {
  ensure(Buffer.byteLength(completeCanonical(candidate), 'utf8') <= 65536);
  const review = exact(candidate, ['schemaVersion', 'articleHash', 'reviewPackHash', 'reviewedAt', 'decision', 'checks', 'findings', 'strongestCounterEvidence']);
  ensure(review.schemaVersion === 'research-editorial-review-v2' && review.articleHash === packet.articleHash
    && review.reviewPackHash === completeHash(packet) && typeof review.decision === 'string' && ['accepted', 'revision_required', 'rejected'].includes(review.decision)
    && financialInstant(review.reviewedAt) <= financialInstant(now));
  const article = packet.article as Row, summary = article.summary as Row;
  const paragraphIds = new Set([String(summary.id), ...(article.sections as Row[]).flatMap(s => (s.paragraphs as Row[]).map(p => String(p.id)))]);
  const sourceIds = new Set(((packet.research as Row).sources as Row[]).map(s => String((s.descriptor as Row).id)));
  ensure(Array.isArray(review.checks) && review.checks.length === EDITORIAL_CHECKS.length);
  const seen = new Set(); let concerns = 0;
  for (const candidate of review.checks) {
    const c = exact(candidate, ['category', 'status', 'rationale', 'paragraphIds']);
    ensure(EDITORIAL_CHECKS.includes(c.category as typeof EDITORIAL_CHECKS[number]) && !seen.has(c.category)
      && typeof c.status === 'string' && ['pass', 'concern', 'fail'].includes(c.status)); seen.add(c.category);
    text(c.rationale, 20, 2000); ids(c.paragraphIds, paragraphIds); if (c.status !== 'pass') concerns++;
  }
  ensure(Array.isArray(review.findings) && review.findings.length <= 30);
  for (const candidate of review.findings) {
    const f = exact(candidate, ['severity', 'paragraphId', 'issue', 'sourceIds']);
    ensure(typeof f.severity === 'string' && ['blocking', 'major', 'minor'].includes(f.severity)
      && (f.paragraphId === null || (typeof f.paragraphId === 'string' && paragraphIds.has(f.paragraphId))));
    text(f.issue, 20, 2000); ids(f.sourceIds, sourceIds); if (f.severity !== 'minor') concerns++;
  }
  text(review.strongestCounterEvidence, 20, 4000);
  ensure(review.decision === 'accepted' ? concerns === 0 : concerns > 0);
  const cloned = JSON.parse(JSON.stringify(review)) as Row;
  return { schemaVersion: 'validated-editorial-review-v2', review: cloned, reviewHash: completeHash(cloned),
    articleHash: packet.articleHash, reviewPackHash: completeHash(packet), validationStatus: 'contract_valid_only',
    controllerReportOnly: true, publishableResearch: false, researchQualified: false, strategyApproved: false, entryEligible: false };
}
