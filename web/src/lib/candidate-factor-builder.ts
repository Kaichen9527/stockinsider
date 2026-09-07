/** Evidence availability is intentionally coarse so it is auditable rather than falsely precise. */
export type EvidenceGrade = 0 | 25 | 50 | 75 | 100;
export type FactorEvidence = {
  score: number;
  status: 'available' | 'partial' | 'missing';
  evidenceCount: number;
  asOf: string | null;
  reasons: string[];
  /** Percentage of the factor's required evidence weight actually covered. */
  coveredWeight: number;
  evidenceGrade: EvidenceGrade;
};

function clamp(value: number) { return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)); }

export function evidenceGrade(coveredWeight: number): EvidenceGrade {
  const weight = clamp(coveredWeight);
  if (weight <= 0) return 0;
  if (weight <= 25) return 25;
  if (weight <= 50) return 50;
  if (weight <= 75) return 75;
  return 100;
}

function factor(input: Omit<FactorEvidence, 'evidenceGrade' | 'status'>): FactorEvidence {
  const coveredWeight = clamp(input.coveredWeight);
  return {
    ...input,
    coveredWeight,
    evidenceGrade: evidenceGrade(coveredWeight),
    status: coveredWeight >= 100 ? 'available' : coveredWeight > 0 ? 'partial' : 'missing',
  };
}

export function officialResearchEvidenceFactor(input: {
  factKeys: string[];
  hasPriceHistory: boolean;
  hasInstitutionalFlow: boolean;
  hasMarketEvidence: boolean;
  /** Defaults to false: a counter-evidence review must be recorded, never presumed. */
  hasCounterEvidenceReview?: boolean;
  asOf: string;
}): FactorEvidence {
  const required = ['quarterly_revenue', 'quarterly_gross_profit', 'quarterly_operating_income', 'quarterly_net_income_attributable_to_common', 'quarterly_diluted_eps'];
  const present = new Set(input.factKeys);
  const checks: Array<[string, boolean]> = [
    ...required.map((key): [string, boolean] => [key, present.has(key)]),
    ['official_price_history', input.hasPriceHistory],
    ['official_institutional_flow', input.hasInstitutionalFlow],
    ['official_market_evidence', input.hasMarketEvidence],
    ['official_counter_evidence_review', input.hasCounterEvidenceReview ?? false],
  ];
  const evidenceCount = checks.filter(([, available]) => available).length;
  const coveredWeight = checks.length ? evidenceCount / checks.length * 100 : 0;
  return factor({
    score: evidenceGrade(coveredWeight), evidenceCount, coveredWeight, asOf: input.asOf,
    reasons: checks.filter(([, available]) => !available).map(([key]) => `missing:${key}`),
  });
}

export type BrokerEvidenceRow = { sourceCount: number; freshness: string; asOf: string | null; lawful?: boolean; licenseStatus?: 'licensed' | 'permitted' | 'unknown' | 'blocked' };

/** Maps an imported broker snapshot to the factor contract. A report can only
 * earn evidence when its actual ingestion mode is within an explicit license;
 * a software package license is not evidence of redistribution rights. */
export function brokerEvidenceRowsFromSnapshots(rows: Array<{
  sourceCount: number | null | undefined;
  freshnessStatus: string | null | undefined;
  asOfDate: string | null | undefined;
  permittedSourceModes?: string[] | null;
  licenseStatus?: BrokerEvidenceRow['licenseStatus'];
}>): BrokerEvidenceRow[] {
  const allowedModes = new Set(['manual_pdf', 'manual_csv', 'imported_pdf']);
  return rows.map((row) => {
    const modes = (row.permittedSourceModes || []).filter((mode): mode is string => typeof mode === 'string');
    const explicitlyLicensed = row.licenseStatus === 'licensed' || row.licenseStatus === 'permitted';
    return {
      sourceCount: Math.max(0, Number(row.sourceCount) || 0),
      freshness: String(row.freshnessStatus || 'missing'),
      asOf: row.asOfDate || null,
      licenseStatus: row.licenseStatus,
      lawful: explicitlyLicensed || (modes.length > 0 && modes.every((mode) => allowedModes.has(mode))),
    };
  });
}

function brokerIsLawful(row: BrokerEvidenceRow): boolean {
  // `freshness_status=licensed` is the legacy storage representation of an
  // explicit permitted report. It is the only compatibility interpretation.
  return row.lawful === true || row.licenseStatus === 'licensed' || row.licenseStatus === 'permitted' || row.freshness === 'licensed';
}

/** Lawful, fresh broker evidence only; unlicensed reports never contribute. */
export function brokerResearchFactor(rows: BrokerEvidenceRow[]): FactorEvidence {
  const fresh = rows.filter((row) => brokerIsLawful(row) && !['stale', 'missing'].includes(row.freshness) && row.sourceCount > 0);
  const sources = fresh.reduce((sum, row) => sum + row.sourceCount, 0);
  const coveredWeight = Math.min(100, sources / 3 * 100);
  return factor({
    score: evidenceGrade(coveredWeight), evidenceCount: sources, coveredWeight,
    asOf: fresh.map((row) => row.asOf).filter((value): value is string => Boolean(value)).sort().at(-1) || null,
    reasons: sources === 0
      ? [rows.some((row) => row.sourceCount > 0) ? 'missing:lawful_broker_evidence' : 'missing:licensed_broker_evidence']
      : [],
  });
}

export type RelationshipEvidenceRow = { market: string; score: number; weight: number; asOf: string | null; evidenceKind?: 'fundamental' | 'price' };

export type PeerRelationship = {
  id: string;
  peerMarket: string;
  relationshipType: 'product' | 'product_peer' | 'customer' | 'supplier' | 'competitor';
  productSubcategory: string | null;
  /** positive/inverse applies to the issuer's exposure; negative_catchdown
   * permits a material negative peer move to block a new entry. */
  directionality: 'positive' | 'inverse' | 'negative_catchdown' | null;
  weight: number | null;
};

export type PeerMarketSnapshot = {
  peerRelationshipId: string;
  asOf: string | null;
  availableAt: string | null;
  availabilityStatus: 'available' | 'unknown' | 'blocked' | 'missing';
  fundamentalSignal: number | null;
  priceReturn20d: number | null;
  catchdownBlock: boolean;
  /** External price data must have its own lawful use scope. Unknown is not
   * assumed legal, current or positive. */
  priceLicenseStatus: 'licensed' | 'permitted' | 'unknown' | 'blocked' | null;
};

export type PeerEvidenceBuild = {
  fundamentalRows: RelationshipEvidenceRow[];
  priceRows: RelationshipEvidenceRow[];
  peerCatchdownBlock: boolean;
  missing: string[];
};

function directedScore(value: number, directionality: PeerRelationship['directionality']) {
  const normalized = value >= -1 && value <= 1 ? value : (clamp(value) - 50) / 50;
  return directionality === 'inverse' ? -normalized : normalized;
}

/**
 * Converts relationship records and snapshots into factor rows. It keeps
 * product classes separate (for example DRAM/NAND/NOR) by requiring the
 * stored product subcategory, and does not invent a price signal when a
 * licensed overseas close is unavailable.
 */
export function buildPeerRelationshipEvidence(relationships: PeerRelationship[], snapshots: PeerMarketSnapshot[]): PeerEvidenceBuild {
  const latest = new Map<string, PeerMarketSnapshot>();
  for (const snapshot of [...snapshots].sort((left, right) => String(right.availableAt || '').localeCompare(String(left.availableAt || '')))) {
    if (!latest.has(snapshot.peerRelationshipId)) latest.set(snapshot.peerRelationshipId, snapshot);
  }
  const fundamentalRows: RelationshipEvidenceRow[] = [];
  const priceRows: RelationshipEvidenceRow[] = [];
  const missing: string[] = [];
  let peerCatchdownBlock = false;
  for (const relationship of relationships) {
    if (!relationship.id || !relationship.productSubcategory?.trim()) {
      missing.push(`missing:peer_product_subcategory:${relationship.id || 'unknown'}`);
      continue;
    }
    const snapshot = latest.get(relationship.id);
    if (!snapshot || snapshot.availabilityStatus !== 'available') {
      missing.push(`missing:peer_snapshot:${relationship.id}`);
      continue;
    }
    const weight = relationship.weight != null && Number.isFinite(relationship.weight) && relationship.weight > 0 ? relationship.weight : 0;
    if (weight === 0) {
      missing.push(`missing:peer_weight:${relationship.id}`);
      continue;
    }
    if (snapshot.fundamentalSignal != null && Number.isFinite(snapshot.fundamentalSignal)) {
      fundamentalRows.push({ market: relationship.peerMarket, score: directedScore(snapshot.fundamentalSignal, relationship.directionality), weight, asOf: snapshot.asOf, evidenceKind: 'fundamental' });
    }
    const licensedPrice = snapshot.priceLicenseStatus === 'licensed' || snapshot.priceLicenseStatus === 'permitted';
    if (licensedPrice && snapshot.priceReturn20d != null && Number.isFinite(snapshot.priceReturn20d)) {
      const priceScore = directedScore(Math.max(-1, Math.min(1, snapshot.priceReturn20d / 20)), relationship.directionality);
      priceRows.push({ market: relationship.peerMarket, score: priceScore, weight, asOf: snapshot.asOf, evidenceKind: 'price' });
      if (relationship.directionality === 'negative_catchdown' && snapshot.catchdownBlock && snapshot.priceReturn20d < 0) peerCatchdownBlock = true;
    } else if (snapshot.priceReturn20d != null || snapshot.priceLicenseStatus !== 'licensed') {
      missing.push(`missing:licensed_peer_price:${relationship.id}`);
    }
  }
  return { fundamentalRows, priceRows, peerCatchdownBlock, missing: [...new Set(missing)].sort() };
}

function relationshipScore(value: number): number {
  // Relationship snapshots historically store a signed -1..1 signal. New
  // factor builders may pass a direct 0..100 score; both representations are
  // explicit and neither gets a free positive floor.
  return value >= -1 && value <= 1 ? 50 + value * 50 : clamp(value);
}

/** Fundamental peer/industry evidence; price confirmation has a separate actionability factor. */
export function relationshipFactor(input: RelationshipEvidenceRow[], kind: 'domestic_rotation' | 'overseas_peer'): FactorEvidence {
  const eligible = input.filter((row) => (kind === 'domestic_rotation' ? row.market === 'TW' : row.market !== 'TW')
    && (row.evidenceKind == null || row.evidenceKind === 'fundamental') && Number.isFinite(row.score) && row.weight > 0);
  const weight = eligible.reduce((sum, row) => sum + Math.max(0, row.weight), 0);
  const weighted = weight > 0 ? eligible.reduce((sum, row) => sum + relationshipScore(row.score) * Math.max(0, row.weight), 0) / weight : null;
  const coveredWeight = Math.min(100, eligible.length / 2 * 100);
  return factor({
    score: weighted == null ? 0 : Math.round(weighted * evidenceGrade(coveredWeight) / 100 * 10) / 10,
    evidenceCount: eligible.length, coveredWeight,
    asOf: eligible.map((row) => row.asOf).filter((value): value is string => Boolean(value)).sort().at(-1) || null,
    reasons: eligible.length === 0 ? [`missing:${kind}_fundamentals`] : [],
  });
}

function priceRelationshipFactor(rows: RelationshipEvidenceRow[], market: 'TW' | 'overseas', missingReason: string): FactorEvidence {
  const eligible = rows.filter((row) => (market === 'TW' ? row.market === 'TW' : row.market !== 'TW')
    && row.evidenceKind === 'price' && Number.isFinite(row.score) && row.weight > 0);
  const weight = eligible.reduce((sum, row) => sum + row.weight, 0);
  const score = weight > 0 ? eligible.reduce((sum, row) => sum + relationshipScore(row.score) * row.weight, 0) / weight : 0;
  const coveredWeight = Math.min(100, eligible.length / 2 * 100);
  return factor({
    score: Math.round(score * evidenceGrade(coveredWeight) / 100 * 10) / 10,
    evidenceCount: eligible.length, coveredWeight,
    asOf: eligible.map((row) => row.asOf).filter((value): value is string => Boolean(value)).sort().at(-1) || null,
    reasons: eligible.length === 0 ? [missingReason] : [],
  });
}

/** Actionability rotation is price confirmation, distinct from research's domestic fundamentals. */
export function industryRotationActionabilityFactor(rows: RelationshipEvidenceRow[]): FactorEvidence {
  return priceRelationshipFactor(rows, 'TW', 'missing:industry_rotation_price_confirmation');
}

/** Explicitly separate the overseas price 10% Actionability component from Research fundamentals. */
export function overseasPriceActionabilityFactor(rows: RelationshipEvidenceRow[]): FactorEvidence {
  return priceRelationshipFactor(rows, 'overseas', 'missing:overseas_price_confirmation');
}
