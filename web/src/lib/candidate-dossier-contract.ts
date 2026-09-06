import { createHash } from 'crypto';

type Row = Record<string, unknown>;

export type CandidateDossierCursor = { availableAt: string; revisionId: string };

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Row).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]));
  return value;
}

export function candidateDossierInputHash(detail: Row, facts: Row[]) {
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

export function decodeCandidateDossierCursor(value: unknown): CandidateDossierCursor | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Row;
    const availableAt = String(parsed.availableAt || '');
    const revisionId = String(parsed.revisionId || '');
    if (!Number.isFinite(Date.parse(availableAt)) || !/^[0-9a-f-]{36}$/iu.test(revisionId)) return null;
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

export function withoutPaidInvestAnchorsSourceLinks(detail: Row) {
  return {
    ...detail,
    source_links: (Array.isArray(detail.source_links) ? detail.source_links as Row[] : []).filter((source) => !isPaidInvestAnchorsReference(`${source.label || ''} ${source.url || ''}`)),
  };
}

export function numberedCandidateSources(detail: Row, facts: Row[]) {
  const candidates: Array<{ label: string; url: string; publishedAt?: string | null; locator?: string }> = [];
  for (const source of Array.isArray(detail.source_links) ? detail.source_links as Row[] : []) {
    const url = String(source.url || '');
    if (!/^https?:\/\//iu.test(url) || isPaidInvestAnchorsReference(`${source.label || ''} ${url}`)) continue;
    candidates.push({ label: String(source.label || '原始來源'), url, publishedAt: source.publishedAt ? String(source.publishedAt) : null });
  }
  for (const fact of facts) {
    const url = String(fact.source_url || '');
    if (!/^https?:\/\//iu.test(url) || isPaidInvestAnchorsReference(url)) continue;
    candidates.push({ label: String(fact.fact_key || '官方資料'), url, publishedAt: fact.available_at ? String(fact.available_at) : null, locator: candidateFactLocator(fact) });
  }
  const unique = new Map<string, typeof candidates[number]>();
  for (const source of candidates) {
    const key = `${source.url}\u0000${source.locator || ''}`;
    if (!unique.has(key)) unique.set(key, source);
  }
  return [...unique.values()].map((source, index) => ({ referenceNumber: index + 1, ...source }));
}

export function factReferenceNumbers(facts: Row[], sources: ReturnType<typeof numberedCandidateSources>) {
  const sourceNumber = new Map(sources.map((source) => [`${source.url}\u0000${source.locator || ''}`, source.referenceNumber]));
  return new Map(facts.map((fact) => [String(fact.fact_id), sourceNumber.get(`${String(fact.source_url || '')}\u0000${candidateFactLocator(fact)}`)]).filter((entry): entry is [string, number] => entry[1] != null));
}
