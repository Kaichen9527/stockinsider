import { isPaidInvestAnchorsReference } from './candidate-dossier-contract.ts';
import { sanitizePublicSourceUrl } from './public-source-url.ts';

type Row = Record<string, unknown>;
export type DeepSourceSubjectScope = 'company_mentions' | 'industry_context' | 'unknown';

/** Used by admission and display. Scope comes from stored acquisition metadata,
 * never from a paragraph or an inferred company association. */
export function deepSourceCitation(metadata: unknown, candidateUrl: unknown): {
  subjectScope: DeepSourceSubjectScope; url: string | null;
} {
  if (metadata !== undefined && (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))) {
    return { subjectScope: 'unknown', url: null };
  }
  const data = (metadata || {}) as Row;
  const subjectScope = data.subject_scope === undefined || data.subject_scope === 'company_mentions'
    ? 'company_mentions' : data.subject_scope === 'industry_context' ? 'industry_context' : 'unknown';
  const url = sanitizePublicSourceUrl(candidateUrl);
  if (!url || subjectScope === 'unknown') return { subjectScope, url: null };
  if (subjectScope === 'company_mentions') {
    // Preserve the existing legacy-company policy. This amendment does not
    // broaden the dossier/member-source contract.
    return { subjectScope, url: data.visibility !== 'authenticated_summary'
      && !isPaidInvestAnchorsReference(url) ? url : null };
  }
  if (data.visibility !== 'public' || data.rights_boundary !== 'public_citation'
    || typeof data.acquisition_method !== 'string'
    || !['public_document', 'publisher_transcript'].includes(data.acquisition_method)) {
    return { subjectScope, url: null };
  }
  if (!isPaidInvestAnchorsReference(url)) return { subjectScope, url };
  // A public social permalink is not a member article merely because its
  // author handle contains InvestAnchors. Authenticated necessary-summary
  // acquisition still fails the explicit public-rights check above.
  const parsed = new URL(url);
  const publicPost = ['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'].includes(parsed.hostname)
    && /^\/@[^/]+\/post\/[A-Za-z0-9_-]+\/?$/u.test(parsed.pathname);
  return { subjectScope, url: publicPost ? url : null };
}
