import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical.ts';

type ValueValidator = (value: unknown) => boolean;
type ValueSchema = Record<string, ValueValidator>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

const text: ValueValidator = (value) => typeof value === 'string';
const nonemptyText: ValueValidator = (value) => typeof value === 'string' && value.length > 0;
const uuid: ValueValidator = (value) => typeof value === 'string' && UUID.test(value);
const date: ValueValidator = (value) => {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const timestamp: ValueValidator = (value) => {
  if (typeof value !== 'string' || !TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value.replace('Z', '.000Z');
};
const finite: ValueValidator = (value) => typeof value === 'number' && Number.isFinite(value);
const integer: ValueValidator = (value) => Number.isSafeInteger(value);
const boundedInteger = (minimum: number, maximum: number): ValueValidator =>
  (value) => Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum;
const positiveFinite: ValueValidator =
  (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const nonnegativeFinite: ValueValidator =
  (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const boolean: ValueValidator = (value) => typeof value === 'boolean';
const sha256: ValueValidator = (value) => typeof value === 'string' && SHA256.test(value);
const textArray: ValueValidator = (value) => Array.isArray(value) && value.every(text);
const nullable = (validator: ValueValidator): ValueValidator =>
  (value) => value === null || validator(value);
const oneOf = (...values: string[]): ValueValidator =>
  (value) => typeof value === 'string' && values.includes(value);
const exchange = oneOf('TWSE', 'TPEX');
const rosterProvider = oneOf('twse', 'tpex');
const boundedTrimmedText = (minimum: number, maximum: number): ValueValidator =>
  (value) => typeof value === 'string' &&
    [...value].length >= minimum &&
    [...value].length <= maximum &&
    value.trim() === value;
const boundedCanonicalText = (minimum: number, maximum: number): ValueValidator =>
  (value) => boundedTrimmedText(minimum, maximum)(value) &&
    (value as string).normalize('NFC') === value;
const canonicalSector = oneOf(
  'steel', 'rubber', 'auto', 'construction', 'shipping_transport', 'tourism',
  'finance_insurance', 'department_store', 'other', 'chemical', 'biotech_medical',
  'oil_gas_electricity', 'semiconductor', 'computer_peripheral', 'optoelectronics',
  'communications_network', 'electronic_components', 'electronic_distribution',
  'information_service', 'other_electronics', 'green_energy_environment',
  'digital_cloud', 'sports_leisure', 'home_living', 'cement', 'food', 'plastics',
  'textile', 'electrical_machinery', 'electrical_cable', 'glass_ceramic',
  'paper_pulp', 'unknown',
);

function exactSchema(value: Record<string, unknown>, schema: ValueSchema): boolean {
  const expected = Object.keys(schema);
  return Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key) && schema[key](value[key]));
}

const ingestionSchemas: Record<string, ValueSchema> = {
  append_source_document_revision_v3: {
    sourceIdentityAuthorityId: uuid,
    stableConnectorDocumentId: nonemptyText,
    canonicalUrlCandidate: nullable(text),
    publishedAt: nullable(timestamp),
    collectedAt: timestamp,
    adapterVersion: oneOf('source-adapter-v3.3'),
    acquisitionStatus: oneOf('complete', 'invalid_utf8', 'required_field_missing', 'content_overflow'),
    rawFieldPayload: nullable((value) => Array.isArray(value)),
    rawCodePointCount: boundedInteger(0, 100_001),
    rawFieldPayloadAlgorithmVersion: nonemptyText,
    ingestionContentRevisionSha256: nullable(sha256),
    canonicalContentAlgorithmVersion: nonemptyText,
    ingestionCanonicalContentHashV3: nullable(sha256),
    supersedesRevisionId: nullable(uuid),
  },
  append_instrument_roster_authority_v3: {
    stockId: uuid,
    symbol: (value) => typeof value === 'string' && /^[0-9]{4}$/u.test(value),
    exchange,
    instrumentType: oneOf(
      'common_stock', 'etf', 'etn', 'warrant', 'preferred_share',
      'depositary_receipt', 'bond', 'other',
    ),
    listingStatus: oneOf('active', 'suspended', 'delisted'),
    officialLegalName: boundedCanonicalText(2, 120),
    officialShortName: nullable(boundedCanonicalText(2, 40)),
    provider: rosterProvider,
    sourceTimestamp: timestamp,
    validFrom: timestamp,
    validTo: nullable(timestamp),
    rosterVersion: nonemptyText,
  },
  append_stock_sector_assignment_v3: {
    stockId: uuid,
    market: exchange,
    officialIndustryCode: nonemptyText,
    canonicalSectorKey: canonicalSector,
    provider: rosterProvider,
    sourceTimestamp: timestamp,
    validFrom: timestamp,
    validTo: nullable(timestamp),
    taxonomyVersion: nonemptyText,
    status: oneOf('active', 'inactive'),
  },
  append_trading_session_v3: {
    sessionId: date,
    market: exchange,
    openAt: timestamp,
    closeAt: timestamp,
    status: oneOf('completed', 'cancelled'),
    provider: rosterProvider,
    sourceTimestamp: timestamp,
    collectedAt: timestamp,
    sourceRef: nonemptyText,
  },
  append_market_observation_v3: {
    factKey: oneOf(
      'taiex_close', 'otc_close', 'above_ma20', 'above_ma60', 'foreign_cash_5d',
      'trust_cash_5d', 'margin_change_5d', 'foreign_futures_oi', 'put_call_ratio',
      'taiwan_vix', 'sox_return_5d', 'nasdaq_return_5d', 'usd_twd_return_5d',
    ),
    scopeKey: oneOf(
      'TAIEX', 'OTC', 'TWSE_ACTIVE_COMMON', 'TPEX_ACTIVE_COMMON', 'TAIFEX',
      'SOX', 'NASDAQ', 'USD_TWD',
    ),
    sessionId: nullable(date),
    sessionAuthorityId: nullable(uuid),
    value: finite,
    unit: oneOf('index_points', 'percentage_points', 'TWD', 'contracts', 'ratio', 'fx_rate'),
    provider: oneOf('twse', 'tpex', 'taifex', 'finmind', 'node_twstock', 'global_allowlisted'),
    providerIdentity: nullable(nonemptyText),
    breadthNumeratorCount: nullable(integer),
    breadthObservedCount: nullable(integer),
    breadthEligibleCount: nullable(integer),
    breadthRosterManifestId: nullable(uuid),
    breadthRosterManifestHash: nullable(sha256),
    observedAt: timestamp,
    collectedAt: timestamp,
    sourceRef: nonemptyText,
    providerRevision: nonemptyText,
  },
  append_stock_flow_observation_v3: {
    stockId: uuid,
    exchange,
    sessionId: date,
    sessionAuthorityId: uuid,
    factKey: oneOf(
      'foreign_net_twd', 'trust_net_twd', 'margin_financing_balance_twd',
      'sbl_short_balance_shares',
    ),
    value: finite,
    unit: oneOf('shares', 'TWD'),
    provider: oneOf('twse', 'tpex', 'finmind'),
    sourceTimestamp: timestamp,
    collectedAt: timestamp,
    sourceRef: nonemptyText,
    providerRevision: nonemptyText,
  },
  append_financial_fact_v3: {
    stockId: uuid,
    factKey: oneOf(
      'monthly_revenue', 'quarterly_revenue', 'quarterly_gross_profit',
      'quarterly_operating_income', 'quarterly_net_income', 'quarterly_diluted_eps',
      'quarterly_ebitda', 'depreciation_amortization', 'diluted_shares',
      'book_value_per_share', 'roe', 'net_debt', 'pe_multiple', 'pb_multiple',
      'ev_ebitda_multiple', 'ev_sales_multiple', 'broker_target_price',
    ),
    periodStart: nullable(date),
    periodEnd: date,
    durationKind: oneOf('instant', 'monthly', 'quarterly', 'ttm', 'quarter_end'),
    value: finite,
    unit: oneOf(
      'TWD', 'TWD_thousand', 'TWD_million', 'share', 'thousand_shares',
      'TWD_per_share', 'percentage_points', 'dimensionless',
    ),
    provider: oneOf('mops', 'twse', 'tpex', 'finmind'),
    authorityTier: oneOf('official_filing', 'finmind_mirror'),
    estimateKind: oneOf('reported', 'analyst_estimate', 'broker_consensus'),
    estimateHorizon: oneOf('reported_period', 'next_twelve_months', 'target_12m'),
    filingPublishedAt: timestamp,
    sourceTimestamp: timestamp,
    collectedAt: timestamp,
    filingRestatementId: nullable(text),
    sourceRef: nonemptyText,
  },
};

const rawPriceSchema: ValueSchema = {
  stockId: uuid,
  exchange,
  sessionId: date,
  sessionAuthorityId: uuid,
  rawOpen: positiveFinite,
  rawHigh: positiveFinite,
  rawLow: positiveFinite,
  rawClose: positiveFinite,
  volume: nonnegativeFinite,
  turnoverTwd: nonnegativeFinite,
  provider: oneOf('twse', 'tpex', 'finmind'),
  sourceTimestamp: timestamp,
  collectedAt: timestamp,
  sourceRef: nonemptyText,
};

const feedEvidenceSchema: ValueSchema = {
  feedIdentity: nonemptyText,
  responseByteCount: boundedInteger(0, 8_388_608),
  responseSha256: sha256,
  parsedRowCount: boundedInteger(0, 20_000),
};

const eventSchema: ValueSchema = {
  symbol: nonemptyText,
  eventKind: oneOf('ex_right_dividend', 'capital_reduction', 'par_value_change'),
  preActionReferencePrice: positiveFinite,
  postActionReferencePrice: positiveFinite,
  feedIdentity: nonemptyText,
  sourceRowRef: nonemptyText,
};

const corporateActionSchema: ValueSchema = {
  exchange,
  sessionId: date,
  sessionAuthorityId: uuid,
  corporateActionVersion: nonemptyText,
  provider: rosterProvider,
  collectedAt: timestamp,
  feedEvidence: (value) =>
    Array.isArray(value) &&
    value.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row) &&
      exactSchema(row as Record<string, unknown>, feedEvidenceSchema)),
  declaredEventCount: boundedInteger(0, 20_000),
  events: (value) =>
    Array.isArray(value) &&
    value.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row) &&
      exactSchema(row as Record<string, unknown>, eventSchema)),
};

const exchangeReportedPeSchema: ValueSchema = {
  stockId: uuid,
  exchange,
  sessionDate: date,
  close: positiveFinite,
  reportedPe: finite,
  publishedAt: timestamp,
  sourceTimestamp: timestamp,
  collectedAt: timestamp,
  sourceRef: nonemptyText,
};

function validatePriceAuthority(value: Record<string, unknown>): boolean {
  if (!exactSchema(value, {
    kind: oneOf('raw_price', 'corporate_action_snapshot', 'exchange_reported_pe'),
    rawPrice: nullable((item) => item !== null && typeof item === 'object' && !Array.isArray(item)),
    corporateActionSnapshot: nullable((item) => item !== null && typeof item === 'object' && !Array.isArray(item)),
    exchangeReportedPe: nullable((item) => item !== null && typeof item === 'object' && !Array.isArray(item)),
  })) return false;
  if (value.kind === 'raw_price') {
    if (
      value.corporateActionSnapshot !== null ||
      value.exchangeReportedPe !== null ||
      value.rawPrice === null ||
      !exactSchema(value.rawPrice as Record<string, unknown>, rawPriceSchema)
    ) return false;
    const raw = value.rawPrice as Record<string, unknown>;
    return (
      (raw.provider === 'finmind' ||
        (raw.exchange === 'TWSE' && raw.provider === 'twse') ||
        (raw.exchange === 'TPEX' && raw.provider === 'tpex')) &&
      (raw.rawLow as number) <= (raw.rawOpen as number) &&
      (raw.rawLow as number) <= (raw.rawClose as number) &&
      (raw.rawHigh as number) >= (raw.rawOpen as number) &&
      (raw.rawHigh as number) >= (raw.rawClose as number) &&
      (raw.sourceTimestamp as string) <= (raw.collectedAt as string) &&
      validTrimmedText(raw.sourceRef, 120)
    );
  }
  if (value.kind === 'corporate_action_snapshot') {
    if (
      value.rawPrice !== null ||
      value.exchangeReportedPe !== null ||
      value.corporateActionSnapshot === null ||
      !exactSchema(
        value.corporateActionSnapshot as Record<string, unknown>,
        corporateActionSchema,
      )
    ) return false;
    return validateCorporateActionSnapshot(
      value.corporateActionSnapshot as Record<string, unknown>,
    );
  }
  if (
    value.rawPrice !== null ||
    value.corporateActionSnapshot !== null ||
    value.exchangeReportedPe === null ||
    !exactSchema(
      value.exchangeReportedPe as Record<string, unknown>,
      exchangeReportedPeSchema,
    )
  ) return false;
  const reported = value.exchangeReportedPe as Record<string, unknown>;
  const expectedSourcePrefix = reported.exchange === 'TWSE' ? 'twse:' : 'tpex:';
  return (
    (reported.publishedAt as string) <= (reported.sourceTimestamp as string) &&
    (reported.sourceTimestamp as string) <= (reported.collectedAt as string) &&
    (reported.sourceRef as string).startsWith(expectedSourcePrefix) &&
    validTrimmedText(reported.sourceRef, 120)
  );
}

const corporateFeeds = {
  TWSE: ['twse:twt49u:v1', 'twse:twtauu:v1', 'twse:twtb8u:v1'],
  TPEX: ['tpex:exright-cal:v1', 'tpex:reduction-reference:v1', 'tpex:change-reference:v1'],
} as const;

const feedForEvent = {
  ex_right_dividend: 0,
  capital_reduction: 1,
  par_value_change: 2,
} as const;

function validTrimmedText(value: unknown, maximum: number): boolean {
  return typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value;
}

function sourceRowRef(
  snapshot: Record<string, unknown>,
  event: Record<string, unknown>,
): string {
  return createHash('sha256').update(canonicalJson([
    'corporate-action-source-row-v3.1',
    snapshot.exchange,
    snapshot.sessionId,
    event.symbol,
    event.eventKind,
    event.preActionReferencePrice,
    event.postActionReferencePrice,
    event.feedIdentity,
  ])).digest('hex');
}

function validateCorporateActionSnapshot(snapshot: Record<string, unknown>): boolean {
  const exchangeKey = snapshot.exchange as keyof typeof corporateFeeds;
  const expectedFeeds = corporateFeeds[exchangeKey];
  const feeds = snapshot.feedEvidence as Record<string, unknown>[];
  const events = snapshot.events as Record<string, unknown>[];
  if (
    snapshot.corporateActionVersion !== 'tw-corporate-action-v3.1' ||
    snapshot.provider !== exchangeKey.toLowerCase() ||
    feeds.length !== 3 ||
    events.length !== snapshot.declaredEventCount ||
    feeds.reduce((sum, feed) => sum + (feed.parsedRowCount as number), 0) !==
      snapshot.declaredEventCount ||
    events.length > 20_000 ||
    !feeds.every((feed, index) => feed.feedIdentity === expectedFeeds[index])
  ) return false;
  let priorSymbol: string | null = null;
  for (const event of events) {
    const symbol = event.symbol;
    const eventKind = event.eventKind as keyof typeof feedForEvent;
    if (
      typeof symbol !== 'string' ||
      !/^[0-9]{4}$/u.test(symbol) ||
      (priorSymbol !== null && symbol <= priorSymbol) ||
      event.feedIdentity !== expectedFeeds[feedForEvent[eventKind]] ||
      event.sourceRowRef !== sourceRowRef(snapshot, event)
    ) return false;
    priorSymbol = symbol;
  }
  return true;
}

const marketProviderTuples = new Set([
  'taiex_close|TAIEX|index_points|twse|',
  'taiex_close|TAIEX|index_points|finmind|',
  'taiex_close|TAIEX|index_points|node_twstock|',
  'otc_close|OTC|index_points|tpex|',
  'otc_close|OTC|index_points|finmind|',
  'otc_close|OTC|index_points|node_twstock|',
  'above_ma20|TWSE_ACTIVE_COMMON|percentage_points|twse|',
  'above_ma20|TWSE_ACTIVE_COMMON|percentage_points|finmind|',
  'above_ma20|TPEX_ACTIVE_COMMON|percentage_points|tpex|',
  'above_ma20|TPEX_ACTIVE_COMMON|percentage_points|finmind|',
  'above_ma60|TWSE_ACTIVE_COMMON|percentage_points|twse|',
  'above_ma60|TWSE_ACTIVE_COMMON|percentage_points|finmind|',
  'above_ma60|TPEX_ACTIVE_COMMON|percentage_points|tpex|',
  'above_ma60|TPEX_ACTIVE_COMMON|percentage_points|finmind|',
  'foreign_cash_5d|TWSE_ACTIVE_COMMON|TWD|twse|',
  'foreign_cash_5d|TWSE_ACTIVE_COMMON|TWD|finmind|',
  'foreign_cash_5d|TPEX_ACTIVE_COMMON|TWD|tpex|',
  'foreign_cash_5d|TPEX_ACTIVE_COMMON|TWD|finmind|',
  'trust_cash_5d|TWSE_ACTIVE_COMMON|TWD|twse|',
  'trust_cash_5d|TWSE_ACTIVE_COMMON|TWD|finmind|',
  'trust_cash_5d|TPEX_ACTIVE_COMMON|TWD|tpex|',
  'trust_cash_5d|TPEX_ACTIVE_COMMON|TWD|finmind|',
  'margin_change_5d|TWSE_ACTIVE_COMMON|TWD|twse|',
  'margin_change_5d|TWSE_ACTIVE_COMMON|TWD|finmind|',
  'margin_change_5d|TPEX_ACTIVE_COMMON|TWD|tpex|',
  'margin_change_5d|TPEX_ACTIVE_COMMON|TWD|finmind|',
  'foreign_futures_oi|TAIFEX|contracts|taifex|',
  'foreign_futures_oi|TAIFEX|contracts|finmind|',
  'put_call_ratio|TAIFEX|ratio|taifex|',
  'put_call_ratio|TAIFEX|ratio|finmind|',
  'taiwan_vix|TAIFEX|index_points|taifex|',
  'taiwan_vix|TAIFEX|index_points|finmind|',
  'sox_return_5d|SOX|percentage_points|global_allowlisted|stooq:sox:daily:v1',
  'nasdaq_return_5d|NASDAQ|percentage_points|global_allowlisted|stooq:nasdaq:daily:v1',
  'usd_twd_return_5d|USD_TWD|percentage_points|global_allowlisted|stooq:usd-twd:daily:v1',
]);

function normalizedSourceText(value: string): string {
  return value
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/gu, '\n')
    .normalize('NFKC');
}

function normalizedPayloadCodePointCount(payload: unknown[]): number | null {
  let total = 0;
  for (const field of payload) {
    if (typeof field === 'string') {
      total += [...normalizedSourceText(field)].length;
      continue;
    }
    if (!Array.isArray(field)) return null;
    for (const segment of field) {
      if (
        !Array.isArray(segment) ||
        segment.length !== 3 ||
        !Number.isSafeInteger(segment[0]) ||
        typeof segment[1] !== 'string' ||
        typeof segment[2] !== 'string'
      ) return null;
      total += [...normalizedSourceText(segment[2])].length;
    }
  }
  return total;
}

function validateSourceRevision(value: Record<string, unknown>): boolean {
  const complete = value.acquisitionStatus === 'complete';
  const payload = value.rawFieldPayload;
  const expectedRawHash = Array.isArray(payload)
    ? createHash('sha256').update(canonicalJson({
      version: 'raw-field-payload-v3.0',
      adapterVersion: value.adapterVersion,
      fields: payload,
    })).digest('hex')
    : null;
  const measuredCodePoints = Array.isArray(payload)
    ? normalizedPayloadCodePointCount(payload)
    : null;
  return (
    (complete
      ? Array.isArray(payload) &&
        payload.length === 3 &&
        (value.rawCodePointCount as number) <= 100_000 &&
        measuredCodePoints === value.rawCodePointCount &&
        value.ingestionContentRevisionSha256 === expectedRawHash &&
        sha256(value.ingestionCanonicalContentHashV3)
      : payload === null &&
        value.ingestionContentRevisionSha256 === null &&
        value.ingestionCanonicalContentHashV3 === null &&
        (value.acquisitionStatus === 'content_overflow'
          ? value.rawCodePointCount === 100_001
          : (value.rawCodePointCount as number) <= 100_000)) &&
    validTrimmedText(value.stableConnectorDocumentId, 512) &&
    (value.publishedAt === null || (value.publishedAt as string) <= (value.collectedAt as string)) &&
    value.rawFieldPayloadAlgorithmVersion === 'raw-field-payload-v3.0' &&
    value.canonicalContentAlgorithmVersion === 'canonical-content-v3.0'
  );
}

function validInterval(from: unknown, to: unknown): boolean {
  return typeof from === 'string' && (to === null || (typeof to === 'string' && to > from));
}

function validateInstrumentRoster(value: Record<string, unknown>): boolean {
  return (
    value.provider === String(value.exchange).toLowerCase() &&
    validInterval(value.validFrom, value.validTo) &&
    value.rosterVersion === 'tw-instrument-roster-v3.0'
  );
}

const sectorByOfficialCode: Readonly<Record<string, string>> = {
  '01': 'cement',
  '02': 'food',
  '03': 'plastics',
  '04': 'textile',
  '05': 'electrical_machinery',
  '06': 'electrical_cable',
  '08': 'glass_ceramic',
  '09': 'paper_pulp',
  '10': 'steel',
  '11': 'rubber',
  '12': 'auto',
  '14': 'construction',
  '15': 'shipping_transport',
  '16': 'tourism',
  '17': 'finance_insurance',
  '18': 'department_store',
  '20': 'other',
  '21': 'chemical',
  '22': 'biotech_medical',
  '23': 'oil_gas_electricity',
  '24': 'semiconductor',
  '25': 'computer_peripheral',
  '26': 'optoelectronics',
  '27': 'communications_network',
  '28': 'electronic_components',
  '29': 'electronic_distribution',
  '30': 'information_service',
  '31': 'other_electronics',
  '32': 'green_energy_environment',
  '33': 'digital_cloud',
  '34': 'sports_leisure',
  '35': 'home_living',
};

function validateSectorAssignment(value: Record<string, unknown>): boolean {
  const officialCode = value.officialIndustryCode as string;
  return (
    value.provider === String(value.market).toLowerCase() &&
    value.taxonomyVersion === 'tw-sector-taxonomy-v3.0' &&
    validTrimmedText(value.officialIndustryCode, 120) &&
    value.canonicalSectorKey === (sectorByOfficialCode[officialCode] ?? 'unknown') &&
    validInterval(value.validFrom, value.validTo)
  );
}

function taipeiCivilDate(value: string): string {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function validateTradingSession(value: Record<string, unknown>): boolean {
  return (
    value.provider === String(value.market).toLowerCase() &&
    (value.openAt as string) < (value.closeAt as string) &&
    taipeiCivilDate(value.openAt as string) === value.sessionId &&
    taipeiCivilDate(value.closeAt as string) === value.sessionId &&
    (value.sourceTimestamp as string) <= (value.collectedAt as string) &&
    validTrimmedText(value.sourceRef, 120)
  );
}

const sessionBoundMarketScopes = new Set([
  'TAIEX', 'OTC', 'TWSE_ACTIVE_COMMON', 'TPEX_ACTIVE_COMMON',
]);

function validateMarketObservation(value: Record<string, unknown>): boolean {
  const identity = value.providerIdentity === null ? '' : value.providerIdentity;
  const tuple = [
    value.factKey, value.scopeKey, value.unit, value.provider, identity,
  ].join('|');
  if (
    !marketProviderTuples.has(tuple) ||
    (value.sessionId === null) !== (value.sessionAuthorityId === null) ||
    sessionBoundMarketScopes.has(value.scopeKey as string) !== (value.sessionId !== null) ||
    (
      (value.factKey === 'taiex_close' || value.factKey === 'otc_close') &&
      !(typeof value.value === 'number' && value.value > 0)
    ) ||
    (value.observedAt as string) > (value.collectedAt as string) ||
    !validTrimmedText(value.sourceRef, 120) ||
    !validTrimmedText(value.providerRevision, 120)
  ) return false;
  const breadth = value.factKey === 'above_ma20' || value.factKey === 'above_ma60';
  const breadthValues = [
    value.breadthNumeratorCount, value.breadthObservedCount,
    value.breadthEligibleCount, value.breadthRosterManifestId,
    value.breadthRosterManifestHash,
  ];
  if (!breadth) return breadthValues.every((item) => item === null);
  if (
    !boundedInteger(0, 20_000)(value.breadthNumeratorCount) ||
    !boundedInteger(1, 20_000)(value.breadthObservedCount) ||
    !boundedInteger(1, 20_000)(value.breadthEligibleCount) ||
    !uuid(value.breadthRosterManifestId) ||
    !sha256(value.breadthRosterManifestHash)
  ) return false;
  const numerator = value.breadthNumeratorCount as number;
  const observed = value.breadthObservedCount as number;
  const eligible = value.breadthEligibleCount as number;
  const expected = Math.floor((100 * numerator / observed) * 100 + 0.5) / 100;
  return numerator <= observed && observed <= eligible && value.value === expected;
}

function validateStockFlow(value: Record<string, unknown>): boolean {
  const sbl = value.factKey === 'sbl_short_balance_shares';
  return (
    value.provider === 'finmind' ||
      value.provider === String(value.exchange).toLowerCase()
  ) &&
    value.unit === (sbl ? 'shares' : 'TWD') &&
    (value.sourceTimestamp as string) <= (value.collectedAt as string) &&
    validTrimmedText(value.sourceRef, 120) &&
    validTrimmedText(value.providerRevision, 120);
}

function validateFinancialFact(value: Record<string, unknown>): boolean {
  const duration = value.durationKind;
  const fact = value.factKey as string;
  const unit = value.unit;
  if (
    (duration === 'instant' && value.periodStart !== null) ||
    (duration !== 'instant' &&
      (typeof value.periodStart !== 'string' || value.periodStart > (value.periodEnd as string))) ||
    (
      (value.provider === 'mops' || value.provider === 'twse' || value.provider === 'tpex') &&
      value.authorityTier !== 'official_filing'
    ) ||
    (value.provider === 'finmind' && value.authorityTier !== 'finmind_mirror') ||
    (
      [
        'monthly_revenue', 'quarterly_revenue', 'quarterly_gross_profit',
        'quarterly_operating_income', 'quarterly_net_income', 'quarterly_ebitda',
        'depreciation_amortization', 'net_debt',
      ].includes(fact) &&
      !['TWD', 'TWD_thousand', 'TWD_million'].includes(unit as string)
    ) ||
    (
      fact === 'diluted_shares' &&
      !['share', 'thousand_shares'].includes(unit as string)
    ) ||
    (
      ['quarterly_diluted_eps', 'book_value_per_share', 'broker_target_price'].includes(fact) &&
      unit !== 'TWD_per_share'
    ) ||
    (fact === 'roe' && unit !== 'percentage_points') ||
    (
      ['pe_multiple', 'pb_multiple', 'ev_ebitda_multiple', 'ev_sales_multiple'].includes(fact) &&
      unit !== 'dimensionless'
    ) ||
    (value.filingPublishedAt !== null &&
      (value.filingPublishedAt as string) > (value.sourceTimestamp as string)) ||
    (value.sourceTimestamp as string) > (value.collectedAt as string) ||
    !validTrimmedText(value.sourceRef, 120)
  ) return false;
  const estimate = value.estimateKind;
  const horizon = value.estimateHorizon;
  if (estimate === 'reported') {
    return horizon === 'reported_period' && fact !== 'broker_target_price';
  }
  if (estimate === 'analyst_estimate') {
    return horizon === 'next_twelve_months' && [
      'quarterly_diluted_eps', 'quarterly_ebitda', 'quarterly_revenue',
      'book_value_per_share',
    ].includes(fact as string);
  }
  return estimate === 'broker_consensus' &&
    horizon === 'target_12m' &&
    fact === 'broker_target_price';
}

export function validateIngestionValuesV3(
  rpc: string,
  value: Record<string, unknown>,
): boolean {
  if (rpc === 'append_price_authority_v3') return validatePriceAuthority(value);
  const schema = ingestionSchemas[rpc];
  if (schema === undefined || !exactSchema(value, schema)) return false;
  switch (rpc) {
    case 'append_source_document_revision_v3': return validateSourceRevision(value);
    case 'append_instrument_roster_authority_v3': return validateInstrumentRoster(value);
    case 'append_stock_sector_assignment_v3': return validateSectorAssignment(value);
    case 'append_trading_session_v3': return validateTradingSession(value);
    case 'append_market_observation_v3': return validateMarketObservation(value);
    case 'append_stock_flow_observation_v3': return validateStockFlow(value);
    case 'append_financial_fact_v3': return validateFinancialFact(value);
    default: return false;
  }
}

const humanSchemas: Record<string, ValueSchema> = {
  append_source_identity_authority_v3: {
    sourceIdentityId: uuid,
    sourceKey: nonemptyText,
    sourceClass: oneOf('official', 'public_research', 'curated_thesis', 'community'),
    distributionIdentity: nonemptyText,
    validFrom: timestamp,
    validTo: nullable(timestamp),
    status: oneOf('active', 'inactive'),
  },
  append_publisher_verification_authority_v3: {
    publisherIdentityId: uuid,
    sourceClass: oneOf('official', 'public_research', 'curated_thesis', 'community'),
    domains: textArray,
    feedIdentity: nullable(text),
    institutionIdentity: nullable(text),
    validFrom: timestamp,
    validTo: nullable(timestamp),
    status: oneOf('active', 'inactive'),
  },
  append_manual_stock_alias_authority_v3: {
    stockId: uuid,
    proposedAlias: nonemptyText,
    sourceTimestamp: timestamp,
    validFrom: timestamp,
    validTo: nullable(timestamp),
    status: oneOf('active', 'inactive'),
  },
  append_peer_reviewer_authority_v3: {
    reviewerPrincipalId: uuid,
    validFrom: timestamp,
    validTo: nullable(timestamp),
    status: oneOf('active', 'inactive'),
  },
  append_peer_relationship_authority_v3: {
    supplierInstrumentAuthorityId: uuid,
    customerInstrumentAuthorityId: uuid,
    sourceTimestamp: timestamp,
    validFrom: timestamp,
    validTo: nullable(timestamp),
    status: oneOf('active', 'inactive'),
    evidenceRef: nonemptyText,
  },
  append_valuation_verification_v3: {
    symbol: (value) => typeof value === 'string' && /^[0-9]{4}$/u.test(value),
    inputHash: sha256,
    decision: oneOf('approved', 'rejected'),
    reasonCodes: textArray,
    evidenceRefs: textArray,
    rationale: nonemptyText,
    valuationComputedAt: timestamp,
  },
  append_assistive_artifact_registration_v3: {
    artifactRef: nonemptyText,
    artifactHash: sha256,
    artifactKind: oneOf('news_sentiment', 'embedding', 'time_series'),
    licenseId: nonemptyText,
    licenseEvidenceRef: nonemptyText,
    trainingCutoff: timestamp,
    evaluationManifestId: uuid,
    comparisonBaselineKey: sha256,
    oosPrecisionAt20: finite,
    oosNdcgAt20: finite,
    oosWorstDecileMae20Pct: finite,
    status: oneOf('registered', 'revoked'),
    supersedesRegistrationId: nullable(uuid),
  },
};

export function validateHumanAuthorityValuesV3(
  rpc: string,
  value: Record<string, unknown>,
): boolean {
  const schema = humanSchemas[rpc];
  return schema !== undefined && exactSchema(value, schema);
}

export function validateBlindedReviewValuesV3(
  kind: 'assignment' | 'label',
  adjudicator: boolean,
  value: Record<string, unknown>,
): boolean {
  if (!uuid(value.sampleManifestId) || !nonemptyText(value.sampleId)) return false;
  if (kind === 'assignment') {
    return exactSchema(value, {
      sampleManifestId: uuid,
      sampleId: nonemptyText,
    });
  }
  const role = adjudicator
    ? oneOf('adjudicator')
    : oneOf('reviewer_1', 'reviewer_2');
  return exactSchema(value, {
    sampleManifestId: uuid,
    sampleId: nonemptyText,
    labelRole: role,
    canonicalSymbol: nullable((item) => typeof item === 'string' && /^[0-9]{4}$/u.test(item)),
    noLink: boolean,
  }) &&
    ((value.noLink === true && value.canonicalSymbol === null) ||
      (value.noLink === false && typeof value.canonicalSymbol === 'string'));
}
