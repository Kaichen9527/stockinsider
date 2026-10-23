/** Diagnostic source contract only. No descriptor supplied to this pure function
 * establishes database authority, licensed acquisition or publication eligibility. */
export const FORECAST_DESCRIPTOR_VERSION = 'vnext-forecast-source-candidate-v1' as const;
export const FORECAST_SERVER_CHECK = 'current_issuer_revision_manifest_publisher_rights_and_numeric_receipt_required' as const;
export const FORECAST_SOURCE_MAX_AGE_DAYS = 90;
type Row = Record<string, unknown>;
export type ForecastKind = 'annual_forecast' | 'next_four_quarters' | 'ntm' | 'target_12m';
export type ForecastField = {
  path: string; rowHash: string; value: number; unit: 'TWD_per_share';
  periodStart: string; periodEnd: string; fiscalYear: number | null; fiscalQuarter: number | null;
};
export type ForecastSourceDescriptor = {
  schemaVersion: typeof FORECAST_DESCRIPTOR_VERSION;
  kind: ForecastKind;
  issuer: { stockId: string; symbol: string };
  document: { stockId: string; revisionId: string; documentId: string; contentHash: string; publicUrl: string; publishedAt: string; availableAt: string };
  publisher: { identityId: string; institutionId: string; verificationId: string; revisionId: string; contentHash: string; manifestId: string; verifiedAt: string };
  manifest: { id: string; rootHash: string; revisionId: string; contentHash: string; recordedAt: string };
  rights: { receiptId: string; publisherId: string; revisionId: string; contentHash: string; licenseBasis: 'public_issuer_guidance' | 'licensed_forecast_metadata'; permittedUse: 'structured_numeric_forecast'; validFrom: string; validUntil: string; revokedAt: string | null; recordedAt: string };
  shareBasis: { kind: 'diluted' | 'basic'; basisId: string; denominatorShares: number; numerator: 'common_shareholders_income'; adjustment: 'source_disclosed_constant_denominator' } | null;
  fiscalCalendar: { id: string; revisionHash: string; issuerStockId: string; yearStartMonth: number } | null;
  fields: ForecastField[];
};
export type DiagnosticForecastCandidate = {
  authority: 'diagnostic_only'; serverCurrentCheck: typeof FORECAST_SERVER_CHECK;
  key: 'annual_forecast_eps' | 'next_four_quarter_eps' | 'ntm_eps' | 'target_price_12m';
  kind: ForecastKind; symbol: string; stockId: string; value: number; unit: 'TWD_per_share';
  period: string; periodStart: string; periodEnd: string;
  /** Exact validated descriptor retained for a future server-current join; never a proof. */
  sourceDescriptor: ForecastSourceDescriptor;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const sha = /^[a-f0-9]{64}$/u;
function object(value: unknown): value is Row { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function closed(value: unknown, keys: string): value is Row {
  return object(value) && Object.keys(value).sort().join('|') === keys.split(' ').sort().join('|');
}
function text(value: unknown, max = 160): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/u.test(value); }
function day(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function clock(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function nextDay(value: string) { return new Date(Date.parse(value) + 86400000).toISOString().slice(0, 10); }
function monthEnd(year: number, month: number) { return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10); }
function publicUrl(value: unknown) {
  if (!text(value, 2048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && !url.search &&
      /^[a-z][a-z0-9.-]*\.[a-z]{2,}$/u.test(url.hostname) && !/(?:^|\.)(?:local|internal|localhost|test|invalid)$/u.test(url.hostname) &&
      !/(?:investanchors|telegram|t\.me)(?:\.|$)/iu.test(url.hostname) && !/(?:^|\/)(?:paid|member|premium|subscription)(?:\/|$)/iu.test(url.pathname);
  } catch { return false; }
}
function fiscalPeriod(year: number, quarter: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1 + (quarter - 1) * 3, 1));
  return { start: start.toISOString().slice(0, 10), end: monthEnd(start.getUTCFullYear(), start.getUTCMonth() + 3) };
}
function invalid(reason: string): never { throw new Error(reason); }
function descriptor(value: unknown, scope: { stockId: string; symbol: string; cutoff: string }): ForecastSourceDescriptor {
  if (!closed(value, 'schemaVersion kind issuer document publisher manifest rights shareBasis fiscalCalendar fields') || value.schemaVersion !== FORECAST_DESCRIPTOR_VERSION ||
      !['annual_forecast', 'next_four_quarters', 'ntm', 'target_12m'].includes(String(value.kind))) invalid('forecast_descriptor_schema_invalid');
  const { issuer: i, document: d, publisher: p, manifest: m, rights: r, shareBasis: b, fiscalCalendar: c } = value;
  if (!closed(i, 'stockId symbol') || typeof i.stockId !== 'string' || !uuid.test(i.stockId) || typeof i.symbol !== 'string' || !/^\d{4}$/u.test(i.symbol) || i.stockId !== scope.stockId || i.symbol !== scope.symbol) invalid('forecast_issuer_scope_mismatch');
  if (!closed(d, 'stockId revisionId documentId contentHash publicUrl publishedAt availableAt') || d.stockId !== i.stockId || !text(d.revisionId) || !text(d.documentId) || typeof d.contentHash !== 'string' || !sha.test(d.contentHash) || !publicUrl(d.publicUrl) || !clock(d.publishedAt) || !clock(d.availableAt)) invalid('forecast_original_document_missing');
  if (!closed(p, 'identityId institutionId verificationId revisionId contentHash manifestId verifiedAt') || !['identityId', 'institutionId', 'verificationId', 'manifestId'].every(k => text(p[k])) || p.revisionId !== d.revisionId || p.contentHash !== d.contentHash || !clock(p.verifiedAt)) invalid('forecast_publisher_revision_binding_missing');
  if (!closed(m, 'id rootHash revisionId contentHash recordedAt') || m.id !== p.manifestId || typeof m.rootHash !== 'string' || !sha.test(m.rootHash) || m.revisionId !== d.revisionId || m.contentHash !== d.contentHash || !clock(m.recordedAt)) invalid('forecast_manifest_binding_missing');
  if (!closed(r, 'receiptId publisherId revisionId contentHash licenseBasis permittedUse validFrom validUntil revokedAt recordedAt') || !text(r.receiptId) || r.publisherId !== p.identityId || r.revisionId !== d.revisionId || r.contentHash !== d.contentHash ||
      !['public_issuer_guidance', 'licensed_forecast_metadata'].includes(String(r.licenseBasis)) || r.permittedUse !== 'structured_numeric_forecast' || !clock(r.validFrom) || !clock(r.validUntil) || !clock(r.recordedAt) || r.revokedAt !== null && !clock(r.revokedAt)) invalid('forecast_rights_receipt_missing');
  const cutoff = Date.parse(scope.cutoff);
  if ([d.publishedAt, d.availableAt, p.verifiedAt, m.recordedAt, r.recordedAt, r.validFrom].some(t => Date.parse(t) > cutoff) || Date.parse(d.publishedAt) > Date.parse(d.availableAt) || Date.parse(d.availableAt) > Date.parse(p.verifiedAt) || Date.parse(p.verifiedAt) > Date.parse(m.recordedAt)) invalid('forecast_original_clock_invalid');
  if (r.revokedAt !== null || Date.parse(r.validUntil) <= cutoff || Date.parse(r.validFrom) >= Date.parse(r.validUntil)) invalid('forecast_rights_not_current');
  if (cutoff - Date.parse(d.publishedAt) > FORECAST_SOURCE_MAX_AGE_DAYS * 86400000) invalid('forecast_source_stale');
  if (!Array.isArray(value.fields) || value.fields.length !== (value.kind === 'next_four_quarters' ? 4 : 1)) invalid('forecast_source_vector_invalid');
  const paths = new Set<string>();
  for (const f of value.fields) {
    if (!closed(f, 'path rowHash value unit periodStart periodEnd fiscalYear fiscalQuarter') || !text(f.path, 240) || !/^\/(?:[A-Za-z0-9_~-]+\/)*[A-Za-z0-9_~-]+$/u.test(f.path) || paths.has(f.path) || typeof f.rowHash !== 'string' || !sha.test(f.rowHash) || typeof f.value !== 'number' || !Number.isFinite(f.value) || !day(f.periodStart) || !day(f.periodEnd) || f.periodStart > f.periodEnd ||
        f.unit !== 'TWD_per_share') invalid('forecast_numeric_field_invalid');
    paths.add(f.path);
    if (value.kind === 'annual_forecast' || value.kind === 'next_four_quarters') {
      if (!Number.isInteger(f.fiscalYear) || Number(f.fiscalYear) < 1900 || Number(f.fiscalYear) > 2200 || value.kind === 'next_four_quarters' && (!Number.isInteger(f.fiscalQuarter) || Number(f.fiscalQuarter) < 1 || Number(f.fiscalQuarter) > 4) || value.kind === 'annual_forecast' && f.fiscalQuarter !== null) invalid('forecast_fiscal_period_invalid');
    } else if (f.fiscalYear !== null || f.fiscalQuarter !== null) invalid('forecast_horizon_crosswired');
  }
  if (value.kind === 'target_12m') {
    if (b !== null || c !== null || Number(value.fields[0].value) <= 0) invalid('forecast_target_context_invalid');
  } else if (!closed(b, 'kind basisId denominatorShares numerator adjustment') || !['diluted', 'basic'].includes(String(b.kind)) || !text(b.basisId) || typeof b.denominatorShares !== 'number' || !Number.isFinite(b.denominatorShares) || b.denominatorShares <= 0 || b.numerator !== 'common_shareholders_income' || b.adjustment !== 'source_disclosed_constant_denominator') invalid('forecast_share_basis_missing');
  if (value.kind === 'annual_forecast' || value.kind === 'next_four_quarters') {
    if (!closed(c, 'id revisionHash issuerStockId yearStartMonth') || !text(c.id) || typeof c.revisionHash !== 'string' || !sha.test(c.revisionHash) || c.issuerStockId !== i.stockId || !Number.isInteger(c.yearStartMonth) || Number(c.yearStartMonth) < 1 || Number(c.yearStartMonth) > 12) invalid('forecast_fiscal_calendar_missing');
  } else if (c !== null) invalid('forecast_horizon_crosswired');
  return value as unknown as ForecastSourceDescriptor;
}
function candidate(d: ForecastSourceDescriptor, cutoff: string): DiagnosticForecastCandidate {
  const rows = [...d.fields].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const first = rows[0], last = rows[rows.length - 1];
  const cutoffDay = new Date(Date.parse(cutoff) + 8 * 3600000).toISOString().slice(0, 10);
  let period: string;
  if (d.kind === 'annual_forecast') {
    const expected = fiscalPeriod(first.fiscalYear!, 1, d.fiscalCalendar!.yearStartMonth);
    const end = fiscalPeriod(first.fiscalYear!, 4, d.fiscalCalendar!.yearStartMonth).end;
    if (first.periodStart !== expected.start || first.periodEnd !== end || end < cutoffDay || first.periodStart > `${Number(cutoffDay.slice(0, 4)) + 1}-12-31`) invalid('forecast_annual_period_invalid');
    period = String(first.fiscalYear);
  } else if (d.kind === 'next_four_quarters') {
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index], expected = fiscalPeriod(row.fiscalYear!, row.fiscalQuarter!, d.fiscalCalendar!.yearStartMonth);
      if (row.periodStart !== expected.start || row.periodEnd !== expected.end || index > 0 && nextDay(rows[index - 1].periodEnd) !== row.periodStart) invalid('forecast_quarters_not_consecutive');
    }
    // This profile starts with the next wholly future fiscal quarter. It never
    // infers a partial current-quarter forecast or equates rolling NTM to 4Q.
    if (first.periodStart <= cutoffDay) invalid('forecast_quarters_not_future');
    const previousQuarterEnd = new Date(Date.parse(first.periodStart) - 86400000).toISOString().slice(0, 10);
    const previousStart = new Date(Date.UTC(Number(first.periodStart.slice(0, 4)), Number(first.periodStart.slice(5, 7)) - 4, 1)).toISOString().slice(0, 10);
    if (!(previousStart <= cutoffDay && cutoffDay <= previousQuarterEnd)) invalid('forecast_quarters_not_next');
    period = `${first.fiscalYear}-Q${first.fiscalQuarter}/${last.fiscalYear}-Q${last.fiscalQuarter}`;
  } else {
    const publicationDay = new Date(Date.parse(d.document.publishedAt) + 8 * 3600000).toISOString().slice(0, 10);
    if (first.periodStart !== publicationDay || first.periodEnd < cutoffDay) invalid('forecast_rolling_horizon_start_invalid');
    const start = new Date(first.periodStart);
    const endMonth = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth() + 1, 0)).getUTCDate();
    const anniversary = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), Math.min(start.getUTCDate(), endMonth)));
    const end = new Date(anniversary.getTime() - 86400000).toISOString().slice(0, 10);
    if (first.periodEnd !== end) invalid('forecast_rolling_horizon_end_invalid');
    period = `${first.periodStart}/${first.periodEnd}`;
  }
  const value = rows.reduce((sum, row) => sum + row.value, 0);
  if (!Number.isFinite(value)) invalid('forecast_numeric_aggregation_invalid');
  const keys = { annual_forecast: 'annual_forecast_eps', next_four_quarters: 'next_four_quarter_eps', ntm: 'ntm_eps', target_12m: 'target_price_12m' } as const;
  return { authority: 'diagnostic_only', serverCurrentCheck: FORECAST_SERVER_CHECK, key: keys[d.kind], kind: d.kind, symbol: d.issuer.symbol, stockId: d.issuer.stockId, value, unit: first.unit, period, periodStart: first.periodStart, periodEnd: last.periodEnd, sourceDescriptor: structuredClone(d) };
}
/** NO IO. Inputs are untrusted source descriptions, not approved receipts.
 * Contradictory values/share bases for a metric+period suppress that candidate. */
export function projectDiagnosticForecasts(values: unknown, scope: { stockId: string; symbol: string; cutoff: string }) {
  const gaps: string[] = [FORECAST_SERVER_CHECK];
  const candidates: DiagnosticForecastCandidate[] = [];
  if (!uuid.test(scope.stockId) || !/^\d{4}$/u.test(scope.symbol) || !clock(scope.cutoff) || !Array.isArray(values) || values.length > 32) return { authority: 'diagnostic_only' as const, reportedAnnualEps: null, candidates, gaps: [...gaps, 'forecast_scope_invalid'] };
  for (const value of values) {
    try { candidates.push(candidate(descriptor(value, scope), scope.cutoff)); }
    catch (error) { gaps.push(error instanceof Error ? error.message : 'forecast_descriptor_invalid'); }
  }
  const groups = new Map<string, DiagnosticForecastCandidate[]>();
  for (const item of candidates) { const key = `${item.key}:${item.period}`; groups.set(key, [...(groups.get(key) || []), item]); }
  const result: DiagnosticForecastCandidate[] = [];
  for (const [key, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const signatures = new Set(group.map(item => JSON.stringify([item.value, item.unit, item.sourceDescriptor.shareBasis, item.sourceDescriptor.fiscalCalendar])));
    if (signatures.size !== 1) { gaps.push(`forecast_conflicting_source_rows:${key}`); continue; }
    result.push(...group.sort((a, b) => a.sourceDescriptor.document.revisionId.localeCompare(b.sourceDescriptor.document.revisionId)));
  }
  if (!result.length) gaps.push('forecast_supported_candidate_missing');
  return { authority: 'diagnostic_only' as const, reportedAnnualEps: null, candidates: result, gaps: [...new Set(gaps)].sort() };
}
