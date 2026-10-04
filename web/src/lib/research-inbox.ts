import { createHash } from 'node:crypto';
import { sanitizePublicSourceUrl } from './public-source-url.ts';
import { RESEARCH_SOURCE_PLATFORMS, validateResearchTimedExcerpts,
  type ResearchContentForm, type ResearchAcquisitionMethod, type ResearchTimedExcerpt } from './research-source-registry.ts';

export const researchInboxPlatforms = RESEARCH_SOURCE_PLATFORMS;
export type ResearchInboxPlatform = typeof researchInboxPlatforms[number];
export type ResearchClaimStatus = 'rumor' | 'reported' | 'confirmed' | 'denied';
export type ResearchVisibility = 'public' | 'authenticated_summary';

export type ResearchInboxItem = {
  sourcePlatform: ResearchInboxPlatform;
  sourceUrl: string;
  author: string;
  publishedAt: string;
  observedAt: string;
  symbols: string[];
  shortSummary: string;
  catalyst: string;
  risk: string;
  claimStatus: ResearchClaimStatus;
  visibility: ResearchVisibility;
  parentSourceUrl?: string | null;
  contentForm?: ResearchContentForm;
  acquisitionMethod?: ResearchAcquisitionMethod;
  timedExcerpts?: ResearchTimedExcerpt[];
  /** Corrections retain the first discovery time and acquire a new revision time. */
  firstObservedAt?: string;
  revisionObservedAt?: string;
  retracted?: boolean;
};

const statuses = new Set<ResearchClaimStatus>(['rumor', 'reported', 'confirmed', 'denied']);
const visibilities = new Set<ResearchVisibility>(['public', 'authenticated_summary']);
const platforms = new Set<ResearchInboxPlatform>(researchInboxPlatforms);

function boundedText(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

function httpsUrl(value: unknown) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value); url.hash = '';
    return url.protocol === 'https:' && sanitizePublicSourceUrl(value) === url.toString();
  } catch { return false; }
}

export function validateResearchInboxItem(value: unknown): value is ResearchInboxItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<ResearchInboxItem>;
  if (!platforms.has(item.sourcePlatform as ResearchInboxPlatform)
    || !statuses.has(item.claimStatus as ResearchClaimStatus)
    || !visibilities.has(item.visibility as ResearchVisibility)
    || !httpsUrl(item.sourceUrl)
    || (item.parentSourceUrl != null && !httpsUrl(item.parentSourceUrl))
    || !boundedText(item.author, 160)
    || !boundedText(item.shortSummary, 600)
    || !boundedText(item.catalyst, 400)
    || !boundedText(item.risk, 400)
    || item.contentForm !== undefined && !['research_summary', 'transcript_excerpt', 'chapter_titles'].includes(item.contentForm)
    || item.acquisitionMethod !== undefined && !['public_document', 'publisher_transcript',
      'authenticated_browser_summary', 'user_authorized_document'].includes(item.acquisitionMethod)
    || item.timedExcerpts !== undefined && !validateResearchTimedExcerpts(item.timedExcerpts)
    || item.retracted !== undefined && typeof item.retracted !== 'boolean'
    || !Array.isArray(item.symbols)
    || item.symbols.length < 1
    || item.symbols.length > 12
    || item.symbols.some((symbol) => !/^\d{4}$/u.test(symbol))) return false;
  const published = Date.parse(String(item.publishedAt));
  const observed = Date.parse(String(item.observedAt));
  const first = Date.parse(item.firstObservedAt || String(item.observedAt));
  const revised = Date.parse(item.revisionObservedAt || String(item.observedAt));
  if (item.visibility === 'authenticated_summary' && item.timedExcerpts?.length) return false;
  if (item.contentForm === 'transcript_excerpt' && !item.timedExcerpts?.length) return false;
  return [published, observed, first, revised].every(Number.isFinite)
    && published <= first && first <= revised && revised <= observed;
}

export function researchInboxContentHash(item: ResearchInboxItem) {
  const canonical = JSON.stringify({
    sourcePlatform: item.sourcePlatform,
    sourceUrl: sanitizePublicSourceUrl(item.sourceUrl),
    author: item.author.trim(),
    publishedAt: new Date(item.publishedAt).toISOString(),
    symbols: [...new Set(item.symbols)].sort(),
    shortSummary: item.shortSummary.trim(),
    catalyst: item.catalyst.trim(),
    risk: item.risk.trim(),
    claimStatus: item.claimStatus,
    visibility: item.visibility,
    parentSourceUrl: item.parentSourceUrl ? sanitizePublicSourceUrl(item.parentSourceUrl) : null,
    ...(item.contentForm !== undefined || item.acquisitionMethod !== undefined || item.timedExcerpts !== undefined
      || item.retracted !== undefined ? {
        contentForm: item.contentForm || 'research_summary', acquisitionMethod: item.acquisitionMethod || 'public_document',
        timedExcerpts: item.timedExcerpts || [], retracted: item.retracted || false,
      } : {}),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function buildResearchInboxRow(item: ResearchInboxItem) {
  const contentHash = researchInboxContentHash(item);
  const url = new URL(item.sourceUrl);
  url.hash = '';
  const canonicalUrl = url.toString();
  return {
    source_entity_id: null,
    platform: `research_inbox_${item.sourcePlatform}`,
    document_url: `${canonicalUrl}#si-revision-${contentHash.slice(0, 16)}`,
    title: `${item.claimStatus.toUpperCase()}｜${item.shortSummary.slice(0, 120)}`,
    summary: item.shortSummary.trim(),
    content_text: `${item.shortSummary.trim()}\n催化：${item.catalyst.trim()}\n風險：${item.risk.trim()}`,
    published_at: new Date(item.publishedAt).toISOString(),
    collected_at: new Date(item.observedAt).toISOString(),
    symbols: [...new Set(item.symbols)].sort(),
    sentiment_label: null,
    confidence: item.claimStatus === 'confirmed' ? 0.95 : item.claimStatus === 'reported' ? 0.65 : item.claimStatus === 'denied' ? 0.9 : 0.35,
    content_semantics: item.contentForm === 'chapter_titles' ? 'metadata_only' : 'editorial_discussion',
    publisher_key: `${item.sourcePlatform}:${item.author.trim().normalize('NFKC').toLocaleLowerCase('zh-TW')}`,
    publisher_name: item.author.trim(),
    canonical_content_hash: contentHash,
    stance_semantics: item.claimStatus === 'denied' ? 'negative' : 'neutral',
    metadata: {
      acquisition_mode: 'local_codex_research_inbox',
      canonical_url: canonicalUrl,
      parent_source_url: item.parentSourceUrl ? sanitizePublicSourceUrl(item.parentSourceUrl) : null,
      first_observed_at: new Date(item.observedAt).toISOString(),
      revision_observed_at: new Date(item.revisionObservedAt || item.observedAt).toISOString(),
      ...(item.firstObservedAt ? { first_observed_at: new Date(item.firstObservedAt).toISOString() } : {}),
      ...(item.retracted ? { retracted_at: new Date(item.revisionObservedAt || item.observedAt).toISOString() } : {}),
      content_form: item.contentForm || 'research_summary',
      acquisition_method: item.acquisitionMethod || (item.visibility === 'authenticated_summary'
        ? 'authenticated_browser_summary' : 'public_document'),
      timed_excerpts: item.timedExcerpts || [],
      claim_status: item.claimStatus,
      visibility: item.visibility,
      catalyst: item.catalyst.trim(),
      risk: item.risk.trim(),
      content_hash: contentHash,
      rights_boundary: item.visibility === 'authenticated_summary' ? 'bounded_summary_only' : 'public_citation',
    },
  };
}
