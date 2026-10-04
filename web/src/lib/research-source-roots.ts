import { normalizeResearchPlatform } from './research-source-registry.ts';
import type { ResearchSourceRoot } from './research-agent-priority.ts';

type Row = Record<string, unknown>;
/** Issuer domains must come from the reviewed domain registry, never a model claim. */
export function researchRootKind(platform: string, host: string, metadata: Row, approvedIssuerHosts: string[] = []): ResearchSourceRoot['kind'] {
  const normalized = normalizeResearchPlatform(platform);
  if (metadata.content_form === 'chapter_titles' || metadata.content_semantics === 'metadata_only') return 'metadata_only';
  const official = /(^|\.)(twse\.com\.tw|tpex\.org\.tw)$/iu.test(host)
    || approvedIssuerHosts.some((domain) => host.toLowerCase() === domain.toLowerCase());
  if (official && ['official', 'twse_insider'].includes(normalized)
    && !['rumor', 'reported'].includes(String(metadata.claim_status))) return 'official_verified';
  if (/^(industry|omdia|peer)/u.test(normalized) && metadata.claim_status !== 'rumor') return 'primary_industry';
  if (normalized === 'broker' && metadata.visibility !== 'authenticated_summary'
    && metadata.claim_status !== 'rumor') return 'public_broker';
  if (['ptt', 'threads', 'instagram', 'facebook', 'investanchors', 'telegram', 'bulltalk', 'podcast', 'youtube'].includes(normalized)) return 'social_rumor';
  return 'news';
}

export function researchRootFromDocument(row: Row, asOf: string, approvedIssuerHosts: string[] = []): ResearchSourceRoot | null {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Row : {};
  const publishedAt = String(row.published_at || '');
  const firstObservedAt = String(metadata.first_observed_at || row.collected_at || '');
  const revisionObservedAt = String(metadata.revision_observed_at || metadata.retracted_at || row.collected_at || firstObservedAt);
  if (![publishedAt, firstObservedAt, revisionObservedAt].every((at) => Number.isFinite(Date.parse(at))
    && Date.parse(at) <= Date.parse(asOf)) || Date.parse(firstObservedAt) < Date.parse(publishedAt)
    || Date.parse(revisionObservedAt) < Date.parse(firstObservedAt)) return null;
  let url: URL;
  try { url = new URL(String(metadata.parent_source_url || metadata.canonical_url || row.document_url || '')); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  url.hash = '';
  return {
    rootId: url.toString(), url: url.toString(), publishedAt, firstObservedAt, revisionObservedAt,
    revisionId: String(row.canonical_content_hash || metadata.content_hash || row.id || row.document_url || ''),
    isOriginalSource: !metadata.parent_source_url || metadata.parent_source_url === metadata.canonical_url,
    kind: researchRootKind(String(row.platform || ''), url.hostname,
      { ...metadata, content_semantics: row.content_semantics }, approvedIssuerHosts),
    status: metadata.retracted_at ? 'retracted' : metadata.claim_status === 'denied' ? 'contradicted' : 'current',
  };
}
