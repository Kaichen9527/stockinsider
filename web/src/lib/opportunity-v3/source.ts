import { sha256Canonical } from './canonical.ts';
import { sourcePolicy } from './config.ts';
import type { ClaimV3, InstrumentV3, LinkResultV3, MentionV3, SourceDocumentV3 } from './contracts.ts';

const CORPORATE_SUFFIXES = /(?:股份有限公司|有限公司|公司|corp(?:oration)?|inc(?:orporated)?|ltd)\.?$/iu;

export function normalizeAlias(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US')
    .replace(CORPORATE_SUFFIXES, '')
    .trim();
}

export function normalizeCanonicalUrl(value: string | null): string | null {
  if (!value) return null;
  if (/%(?![0-9A-Fa-f]{2})/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.username = '';
    url.password = '';
    url.hash = '';
    const path = normalizePercentTriplets(url.pathname || '/');
    if (path === null) return null;
    const canonicalPath = path !== '/' && path.endsWith('/')
      ? path.slice(0, -1)
      : path;
    const queryRows = url.search.length === 0
      ? []
      : url.search.slice(1).split('&').map((element, ordinal) => {
        const separator = element.indexOf('=');
        const rawKey = separator === -1 ? element : element.slice(0, separator);
        const rawValue = separator === -1 ? '' : element.slice(separator + 1);
        const key = normalizePercentTriplets(rawKey);
        const itemValue = normalizePercentTriplets(rawValue);
        if (key === null || itemValue === null) throw new TypeError('invalid canonical URL');
        return { key, value: itemValue, ordinal };
      }).filter(({ key }) => {
        const lowerKey = key.toLocaleLowerCase('en-US');
        return lowerKey !== 'fbclid' && lowerKey !== 'gclid' &&
          !lowerKey.startsWith('utm_');
      });
    queryRows.sort((left, right) =>
      left.key < right.key ? -1 : left.key > right.key ? 1
        : left.value < right.value ? -1 : left.value > right.value ? 1
          : left.ordinal - right.ordinal);
    const query = queryRows.length === 0
      ? ''
      : `?${queryRows.map(({ key, value: itemValue }) => `${key}=${itemValue}`).join('&')}`;
    return `${url.protocol}//${url.host.toLocaleLowerCase('en-US')}${canonicalPath}${query}`;
  } catch {
    return null;
  }
}

function normalizePercentTriplets(value: string): string | null {
  if (/%(?![0-9A-Fa-f]{2})/u.test(value)) return null;
  return value.replace(/%([0-9A-Fa-f]{2})/gu, (_match, hexadecimal: string) => {
    const byte = Number.parseInt(hexadecimal, 16);
    const character = String.fromCharCode(byte);
    return /[A-Za-z0-9._~-]/u.test(character)
      ? character
      : `%${hexadecimal.toUpperCase()}`;
  });
}

export function collapseRevisionFamilies(documents: SourceDocumentV3[], cutoff: string): SourceDocumentV3[] {
  const families = new Map<string, SourceDocumentV3[]>();
  for (const document of documents) {
    if (!sourcePolicy(document.sourceKey)) continue;
    const rows = families.get(document.revisionFamilyKey) ?? [];
    rows.push(document);
    families.set(document.revisionFamilyKey, rows);
  }
  if (families.size > 1_000_000) throw new Error('bound_violation');

  const selected: SourceDocumentV3[] = [];
  for (const rows of families.values()) {
    if (rows.length > 64) throw new Error('bound_violation');
    const eligible = rows
      .filter((row) =>
        row.recordedAt <= cutoff &&
        row.collectedAt <= cutoff &&
        (row.publishedAt === null || row.publishedAt <= cutoff))
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || a.revisionId.localeCompare(b.revisionId));
    if (eligible[0]) selected.push(eligible[0]);
  }
  return selected.sort((a, b) => {
    if (a.publishedAt === null && b.publishedAt !== null) return 1;
    if (a.publishedAt !== null && b.publishedAt === null) return -1;
    return (
      (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') ||
      b.collectedAt.localeCompare(a.collectedAt) ||
      a.stableConnectorDocumentId.localeCompare(b.stableConnectorDocumentId) ||
      a.revisionId.localeCompare(b.revisionId)
    );
  });
}

export function claimsFromDocument(document: SourceDocumentV3): ClaimV3[] {
  if (document.acquisitionStatus !== 'complete') return [];
  const text = document.fields.join('\n').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!text) return [];
  const sentences = text.split(/(?<=[。！？!?])\s*/u).filter(Boolean).slice(0, 200);
  return sentences.map((sentence, index) => {
    const canonicalClaimHash = sha256Canonical(['canonical-claim-v3.0', sentence]);
    return {
      claimId: sha256Canonical(['claim-id-v3.0', document.revisionId, index]).slice(0, 32),
      canonicalClaimHash,
      evidenceRootId: canonicalClaimHash,
      sourceKey: document.sourceKey,
      sourceClass: document.sourceClass,
      effectiveAt: document.publishedAt ?? document.collectedAt,
      confidence: 1,
      text: sentence,
    };
  });
}

export function dedupeClaims(claims: ClaimV3[]): { unique: ClaimV3[]; duplicateCount: number } {
  const byHash = new Map<string, ClaimV3>();
  let duplicateCount = 0;
  for (const claim of claims) {
    const prior = byHash.get(claim.canonicalClaimHash);
    if (!prior) {
      byHash.set(claim.canonicalClaimHash, claim);
      continue;
    }
    duplicateCount += 1;
    if (
      claim.confidence > prior.confidence ||
      (claim.confidence === prior.confidence && claim.effectiveAt > prior.effectiveAt) ||
      (claim.confidence === prior.confidence && claim.effectiveAt === prior.effectiveAt && claim.claimId < prior.claimId)
    ) {
      byHash.set(claim.canonicalClaimHash, claim);
    }
  }
  return { unique: [...byHash.values()], duplicateCount };
}

export function linkMention(mention: MentionV3, instruments: InstrumentV3[]): LinkResultV3 {
  if (/^[0-9a-z]{1,6}[.](?:us|nyse|nasdaq|hk|hkg|jp|t|ks|kq|ss|sz)$/u.test(
    mention.token.toLocaleLowerCase('en-US'),
  )) {
    return {
      outcome: 'unsupported_instrument',
      reason: 'unsupported_market',
      symbol: null,
      confidence: 1,
    };
  }
  const active = instruments.filter((instrument) => instrument.listingStatus === 'active');
  const numeric = /^\d{4,6}$/u.test(mention.token);
  const allTickerMatches = instruments.filter((instrument) => instrument.symbol === mention.token);
  const tickerMatches = active.filter((instrument) => instrument.symbol === mention.token);
  if (mention.explicitTicker && allTickerMatches.length === 1 && tickerMatches.length === 0) {
    return { outcome: 'unsupported_instrument', reason: 'inactive_or_unknown_symbol', symbol: null, confidence: 1 };
  }
  if (mention.explicitTicker && allTickerMatches.length === 0 && numeric) {
    return { outcome: 'unsupported_instrument', reason: 'inactive_or_unknown_symbol', symbol: null, confidence: 0 };
  }
  if (mention.explicitTicker && tickerMatches.length === 1) {
    const instrument = tickerMatches[0];
    if (!mention.stockContext) return { outcome: 'rejected_low_confidence', reason: 'missing_stock_context', symbol: null, confidence: 0 };
    if (instrument.instrumentType !== 'common_stock') {
      return { outcome: 'unsupported_instrument', reason: 'non_common_stock', symbol: null, confidence: 1 };
    }
    return { outcome: 'linked_new', reason: 'explicit_ticker_context', symbol: instrument.symbol, confidence: 1 };
  }
  if (numeric) {
    return {
      outcome: 'ambiguous_symbol',
      reason: tickerMatches.length ? 'missing_stock_context' : 'ambiguous_number',
      symbol: null,
      confidence: 0,
    };
  }

  const token = normalizeAlias(mention.token);
  const aliasMatches = active.filter((instrument) =>
    [instrument.officialName ?? '', ...instrument.aliases].some((alias) => normalizeAlias(alias) === token));
  if (aliasMatches.length === 1 && mention.stockContext) {
    const instrument = aliasMatches[0];
    if (instrument.instrumentType !== 'common_stock') {
      return { outcome: 'unsupported_instrument', reason: 'unsupported_instrument_type', symbol: null, confidence: 0.9 };
    }
    return { outcome: 'linked_new', reason: 'exact_unique_alias_context', symbol: instrument.symbol, confidence: 0.9 };
  }
  if (aliasMatches.length > 1) return { outcome: 'ambiguous_symbol', reason: 'ambiguous_alias', symbol: null, confidence: 0 };
  return { outcome: 'rejected_low_confidence', reason: 'fuzzy_below_auto_threshold', symbol: null, confidence: 0 };
}

export type SourceAvailabilityInputV3 = {
  sourceKey: string;
  configured: boolean;
  access: 'authorized' | 'expired' | 'revoked' | 'unknown';
  health: 'ok' | 'degraded' | 'failed';
};

export function sourceAvailability(inputs: SourceAvailabilityInputV3[]) {
  const seen = new Set<string>();
  const sources = inputs.map((input) => {
    if (!sourcePolicy(input.sourceKey) || seen.has(input.sourceKey)) {
      throw new TypeError('invalid source availability row');
    }
    seen.add(input.sourceKey);
    const eligible = input.configured && input.access === 'authorized' && input.health !== 'failed';
    const reason = !input.configured ? 'not_configured'
      : input.access !== 'authorized' ? `access_${input.access}`
        : input.health === 'failed' ? 'connector_failed'
          : input.health === 'degraded' ? 'connector_degraded'
            : null;
    return { ...input, eligible, reason };
  });
  const eligibleCount = sources.filter((source) => source.eligible).length;
  const degraded = sources.some((source) => source.reason !== null);
  return {
    status: eligibleCount === 0 ? 'failed' as const : degraded ? 'degraded' as const : 'ok' as const,
    configuredCount: sources.filter((source) => source.configured).length,
    eligibleCount,
    excludedCount: sources.length - eligibleCount,
    sources,
  };
}
