import { createHash } from 'crypto';
import { sanitizePublicSourceUrl } from './public-source-url.ts';

type Row = Record<string, unknown>;

export type CandidateDossierCursor = { availableAt: string; revisionId: string };

export type CandidateDossierReceiptExpectation = {
  revisionId: string;
  inputHash: string;
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Row).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]));
  return value;
}

export function candidateDossierInputHash(detail: Row, facts: Row[]) {
  const scoped = sanitizeRevisionScopedDossierEvidence(detail, facts);
  detail = scoped.detail;
  facts = scoped.facts;
  const factIds = new Set((Array.isArray(detail.fact_ids) ? detail.fact_ids : []).map(String));
  const stockRelation = detail.stocks as Row | Row[] | null;
  const stock = Array.isArray(stockRelation) ? stockRelation[0] : stockRelation;
  const exactDetail = Object.fromEntries([
    'id', 'stock_id', 'session_date', 'lifecycle_stage', 'title', 'summary', 'sections', 'fact_ids',
    'source_links', 'valuation', 'technical', 'as_of', 'available_at',
  ].map((key) => [key, detail[key] ?? null]));
  exactDetail.source_links = (Array.isArray(detail.source_links) ? detail.source_links as Row[] : []).filter((source) => !isPaidInvestAnchorsReference(`${source.label || ''} ${source.url || ''}`));
  exactDetail.stocks = stock ? { symbol: stock.symbol ?? null, name: stock.name ?? null } : null;
  const exactFacts = facts.filter((fact) => factIds.has(String(fact.fact_id))).sort((left, right) => String(left.fact_id).localeCompare(String(right.fact_id)));
  return createHash('sha256').update(JSON.stringify(stable({ contract: 'candidate-dossier-input-v4', detail: exactDetail, facts: exactFacts }))).digest('hex');
}

export function candidateDossierBundleId(inputHash: string) {
  if (!/^[0-9a-f]{64}$/u.test(inputHash)) throw new Error('candidate_dossier_input_hash_invalid');
  const hex = createHash('sha256').update(`candidate-dossier-v4:${inputHash}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function encodeCandidateDossierCursor(cursor: CandidateDossierCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function decodeCandidateDossierCursor(value: unknown): CandidateDossierCursor | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Row;
    const availableAt = String(parsed.availableAt || '');
    const revisionId = String(parsed.revisionId || '');
    if (!Number.isFinite(Date.parse(availableAt)) || !UUID_PATTERN.test(revisionId)) return null;
    return { availableAt, revisionId };
  } catch {
    return null;
  }
}

export function candidateFactLocator(fact: Row) {
  const provenance = fact.provenance && typeof fact.provenance === 'object' && !Array.isArray(fact.provenance) ? fact.provenance as Row : {};
  for (const key of ['locator', 'source_locator', 'page', 'section', 'field']) {
    if (typeof provenance[key] === 'string' && provenance[key]) return String(provenance[key]);
    if (typeof provenance[key] === 'number' && Number.isFinite(provenance[key])) return `${key}:${provenance[key]}`;
  }
  return `${String(fact.fact_key || 'fact')}:${String(fact.period_end || 'unknown-period')}`;
}

export function isPaidInvestAnchorsReference(value: unknown) {
  return /(?:investanchors|investanchor|定錨投資|定錨會員)/iu.test(String(value || ''));
}

function publicHttpUrl(value: unknown) {
  return isPaidInvestAnchorsReference(value) ? null : sanitizePublicSourceUrl(value);
}

function stringIds(value: unknown) {
  return (Array.isArray(value) ? value : value == null ? [] : [value]).map(String).filter(Boolean);
}

/**
 * Produces the only evidence payload an external dossier worker may see.
 * Facts must be adopted by this immutable detail revision and, when the detail
 * carries a stock ID, must prove that they belong to the same issuer. Links are retained only
 * when they identify an adopted fact or a timestamped mention already stored
 * on this revision. The latter preserves the v4 legacy mention shape while
 * preventing an arbitrary unbound reading list from entering the bundle.
 */
export function sanitizeRevisionScopedDossierEvidence(detail: Row, facts: Row[]) {
  const adoptedIds = new Set(stringIds(detail.fact_ids));
  const adoptedMentionIds = new Set(stringIds(detail.mention_ids ?? detail.mentionIds));
  const stockId = String(detail.stock_id || '');
  const detailAvailableAt = Date.parse(String(detail.available_at || ''));
  const uniqueFacts = new Map<string, Row>();
  for (const fact of facts) {
    const factId = String(fact.fact_id || '');
    if (!factId || !adoptedIds.has(factId)) continue;
    if (stockId && String(fact.stock_id || '') !== stockId) continue;
    const factAvailableAt = Date.parse(String(fact.available_at || ''));
    if (Number.isFinite(detailAvailableAt) && (!Number.isFinite(factAvailableAt) || factAvailableAt > detailAvailableAt)) continue;
    if (isPaidInvestAnchorsReference(`${fact.source_url || ''} ${JSON.stringify(fact.provenance || {})}`)) continue;
    if (!uniqueFacts.has(factId)) uniqueFacts.set(factId, fact);
  }
  const exactFacts = [...uniqueFacts.values()].sort((left, right) => String(left.fact_id).localeCompare(String(right.fact_id)));
  const exactFactIds = exactFacts.map((fact) => String(fact.fact_id));
  const exactFactIdSet = new Set(exactFactIds);
  const factUrls = new Set(exactFacts.map((fact) => publicHttpUrl(fact.source_url)).filter((url): url is string => Boolean(url)));
  const sourceLinks = (Array.isArray(detail.source_links) ? detail.source_links as Row[] : []).flatMap((source) => {
    const url = publicHttpUrl(source.url);
    if (!url || isPaidInvestAnchorsReference(`${source.label || ''} ${source.url || ''}`)) return [];
    const boundFactIds = stringIds(source.factIds ?? source.fact_ids ?? source.factId ?? source.fact_id);
    const boundToFact = factUrls.has(url) || boundFactIds.some((factId) => exactFactIdSet.has(factId));
    const publishedAt = source.publishedAt ?? source.published_at;
    const publishedAtMs = Date.parse(String(publishedAt || ''));
    if (Number.isFinite(detailAvailableAt) && Number.isFinite(publishedAtMs) && publishedAtMs > detailAvailableAt) return [];
    const boundMentionIds = stringIds(source.mentionIds ?? source.mention_ids ?? source.mentionId ?? source.mention_id)
      .filter((mentionId) => adoptedMentionIds.has(mentionId));
    const legacyRevisionMention = Boolean(source.platform) && Number.isFinite(publishedAtMs)
      && (!Number.isFinite(detailAvailableAt) || publishedAtMs <= detailAvailableAt);
    if (!boundToFact && boundMentionIds.length === 0 && !legacyRevisionMention) return [];
    return [{
      ...(source.platform ? { platform: String(source.platform) } : {}),
      label: String(source.label || '原始來源'), url,
      ...(Number.isFinite(publishedAtMs) ? { publishedAt: String(publishedAt) } : {}),
      ...(boundFactIds.length ? { factIds: [...new Set(boundFactIds.filter((factId) => exactFactIdSet.has(factId)))].sort() } : {}),
      ...(boundMentionIds.length ? { mentionIds: [...new Set(boundMentionIds)].sort() } : {}),
    }];
  });
  const uniqueLinks = new Map<string, Row>();
  for (const source of sourceLinks) {
    const key = `${String(source.url)}\u0000${String(source.publishedAt || '')}\u0000${String(source.label || '')}`;
    if (!uniqueLinks.has(key)) uniqueLinks.set(key, source);
  }
  const sections = (Array.isArray(detail.sections) ? detail.sections as Row[] : []).map((section) => {
    const sectionFactIds = stringIds(section.factIds ?? section.fact_ids).filter((factId) => exactFactIdSet.has(factId));
    const { fact_ids: _legacyFactIds, factIds: _factIds, ...content } = section;
    void _legacyFactIds; void _factIds;
    return { ...content, factIds: [...new Set(sectionFactIds)].sort() };
  });
  return {
    detail: {
      ...detail,
      fact_ids: exactFactIds,
      source_links: [...uniqueLinks.values()],
      ...(Array.isArray(detail.sections) ? { sections } : {}),
    },
    facts: exactFacts,
  };
}

export function withoutPaidInvestAnchorsSourceLinks(detail: Row) {
  return {
    ...detail,
    source_links: (Array.isArray(detail.source_links) ? detail.source_links as Row[] : []).flatMap((source) => {
      const url = publicHttpUrl(source.url);
      return url && !isPaidInvestAnchorsReference(`${source.label || ''} ${source.url || ''}`) ? [{ ...source, url }] : [];
    }),
  };
}

export function numberedCandidateSources(detail: Row, facts: Row[]) {
  const scoped = sanitizeRevisionScopedDossierEvidence(detail, facts);
  detail = scoped.detail;
  facts = scoped.facts;
  const candidates: Array<{ label: string; url: string; publishedAt?: string | null; locator?: string }> = [];
  for (const source of Array.isArray(detail.source_links) ? detail.source_links as Row[] : []) {
    const url = publicHttpUrl(source.url);
    if (!url || isPaidInvestAnchorsReference(`${source.label || ''} ${source.url || ''}`)) continue;
    candidates.push({ label: String(source.label || '原始來源'), url, publishedAt: source.publishedAt ? String(source.publishedAt) : null });
  }
  for (const fact of facts) {
    const url = publicHttpUrl(fact.source_url);
    if (!url) continue;
    candidates.push({ label: String(fact.fact_key || '官方資料'), url, publishedAt: fact.available_at ? String(fact.available_at) : null, locator: candidateFactLocator(fact) });
  }
  const unique = new Map<string, typeof candidates[number]>();
  for (const source of candidates) {
    const key = `${source.url}\u0000${source.locator || ''}`;
    if (!unique.has(key)) unique.set(key, source);
  }
  return [...unique.values()].map((source, index) => ({ referenceNumber: index + 1, ...source }));
}

export function compareCandidateDossierPageRows(left: Row, right: Row) {
  const time = String(right.available_at || '').localeCompare(String(left.available_at || ''));
  return time || String(right.id || '').localeCompare(String(left.id || ''));
}

export function candidateDossierReceiptMatchesRequest(receipt: unknown, expected: CandidateDossierReceiptExpectation) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false;
  const row = receipt as Row;
  const accepted = row.status === 'accepted' && row.validationStatus === 'valid' && row.ok === true;
  const rejected = row.status === 'rejected' && row.validationStatus === 'rejected' && row.ok === false;
  return String(row.revisionId || '') === expected.revisionId
    && String(row.inputHash || '') === expected.inputHash
    && UUID_PATTERN.test(String(row.submissionId || ''))
    && UUID_PATTERN.test(String(row.dossierId || ''))
    && typeof row.idempotentReplay === 'boolean'
    && Array.isArray(row.rejectionReasons)
    && ((accepted && row.rejectionReasons.length === 0) || (rejected && row.rejectionReasons.length > 0));
}

export function factReferenceNumbers(facts: Row[], sources: ReturnType<typeof numberedCandidateSources>) {
  const sourceNumber = new Map(sources.map((source) => [`${source.url}\u0000${source.locator || ''}`, source.referenceNumber]));
  return new Map(facts.map((fact) => [String(fact.fact_id), sourceNumber.get(`${String(fact.source_url || '')}\u0000${candidateFactLocator(fact)}`)]).filter((entry): entry is [string, number] => entry[1] != null));
}
