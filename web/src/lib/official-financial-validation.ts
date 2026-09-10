import { createHash } from 'node:crypto';
import { isCandidateFinancialFactKey } from './evidence-valuation-contract.ts';

export const OFFICIAL_FINANCIAL_VALIDATOR_VERSION = 'official-financial-v1';
export type OfficialValidationRow = Record<string, unknown>;
export type OfficialFactProvenance = { source_url?: unknown; source_sha256?: unknown; locator?: unknown };
const SHARE_KEYS = new Set(['diluted_shares', 'diluted_weighted_average_shares', 'basic_weighted_average_shares', 'shares_outstanding', 'common_shares_outstanding']);
const PER_SHARE_KEYS = new Set(['quarterly_basic_eps', 'quarterly_diluted_eps', 'book_value_per_share', 'broker_target_price']);
const RATIO_KEYS = new Set(['roe', 'pe_multiple', 'pb_multiple', 'ev_ebitda_multiple', 'ev_sales_multiple']);
const VALIDATION_METADATA = new Set(['validation_status', 'schema_valid', 'unit_valid',
  'point_in_time_valid', 'consistency_valid', 'validation_recorded_at']);

/** Eligibility is peer-dependent, so accepted subjects must also be reconsidered.
 * Terminal rejected/conflicting records remain evidence but cannot auto-resurrect.
 */
export function officialFinancialValidationSubjects(facts: OfficialValidationRow[]) {
  return facts.filter((fact) => fact.validation_status === 'pending' || fact.validation_status === 'validated');
}

function evidenceIdentity(fact: OfficialValidationRow) {
  return Object.fromEntries(Object.entries(fact).filter(([key]) => !VALIDATION_METADATA.has(key))
    .sort(([a], [b]) => a.localeCompare(b)));
}

function isoDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function officialUrl(value: unknown) {
  try { const u = new URL(String(value)); return u.protocol === 'https:' && !u.username && !u.password
    && /(?:^|\.)(twse\.com\.tw|tpex\.org\.tw)$/u.test(u.hostname); } catch { return false; }
}

/** Validation never changes a financial number or invents missing operands. */
export function validateOfficialFinancialFact(
  fact: OfficialValidationRow,
  peers: OfficialValidationRow[],
  provenance: OfficialFactProvenance | null,
  evaluatedAt: string,
) {
  const key = String(fact.fact_key || '');
  const reasons: string[] = [];
  const checks = ['source_identity', 'period_and_unit', 'availability_order', 'duplicate_consistency'];
  const schemaValid = isCandidateFinancialFactKey(key) && finite(fact.value)
    && typeof fact.stock_id === 'string' && /^[0-9a-f-]{36}$/iu.test(fact.stock_id)
    && isoDate(fact.period_end) && fact.estimate_kind === 'reported'
    && fact.authority_tier === 'official_filing' && ['mops','twse','tpex'].includes(String(fact.provider))
    && ((['instant','quarter_end'].includes(String(fact.duration_kind)) && fact.period_start == null)
      || (fact.duration_kind === 'quarterly' && isoDate(fact.period_start) && String(fact.period_start) <= String(fact.period_end)))
    && typeof fact.source_ref === 'string' && /^(?:(?:twse|tpex)-mops-inline:|(?:twse|tpex)-openapi:|issuer-document:[0-9a-f]{64}:)/u.test(fact.source_ref);
  // Issuer-document URLs require the separate document receipt/allowlist checks;
  // this validator only admits exchange-hosted acquisition provenance.
  const provenanceValid = provenance != null && officialUrl(provenance.source_url)
    && /^[0-9a-f]{64}$/u.test(String(provenance.source_sha256))
    && provenance.locator != null && typeof provenance.locator === 'object' && !Array.isArray(provenance.locator)
    && Object.keys(provenance.locator).length > 0;
  const expectedUnit = SHARE_KEYS.has(key) ? 'share' : PER_SHARE_KEYS.has(key) ? 'TWD_per_share' : RATIO_KEYS.has(key) ? 'ratio' : 'TWD';
  const unitValid = fact.unit === expectedUnit;
  const times = [fact.filing_published_at, fact.source_timestamp, fact.collected_at, fact.recorded_at].map((v) => Date.parse(String(v)));
  const cutoff = Date.parse(evaluatedAt);
  const pointInTimeValid = Number.isFinite(cutoff) && times.every((v) => Number.isFinite(v) && v <= cutoff)
    && times[0] <= times[2] && times[1] <= times[2] && times[2] <= times[3]
    && Date.parse(String(fact.period_end)) <= times[0];
  const periodPeers = peers.filter((p) => p.stock_id === fact.stock_id && p.period_end === fact.period_end
    && p.period_start === fact.period_start && p.duration_kind === fact.duration_kind
    && p.filing_restatement_id === fact.filing_restatement_id && p.provider === fact.provider);
  const same = periodPeers.filter((p) => p.fact_key === key && p.unit === fact.unit);
  let consistencyValid = !same.some((p) => !finite(p.value) || p.value !== fact.value);
  const values = new Map<string, number>();
  const conflictingOperands = new Set<string>();
  for (const peer of periodPeers) {
    const operand = String(peer.fact_key);
    if (!finite(peer.value) || (values.has(operand) && values.get(operand) !== peer.value)) conflictingOperands.add(operand);
    else values.set(operand, Number(peer.value));
  }
  if (conflictingOperands.size > 0) consistencyValid = false;
  for (const operand of conflictingOperands) values.delete(operand);
  const identities = [
    ['quarterly_operating_income','quarterly_non_operating_income','quarterly_pretax_income',1],
    ['quarterly_pretax_income','quarterly_income_tax_expense','quarterly_net_income',-1],
    ['quarterly_net_income_attributable_to_common','quarterly_noncontrolling_interest','quarterly_net_income',1],
  ] as const;
  for (const [a,b,c,sign] of identities) {
    if (!values.has(a) || !values.has(b) || !values.has(c)) continue;
    checks.push(`${a}${sign === 1 ? '+' : '-'}${b}=${c}`);
    const expected = values.get(a)! + sign * values.get(b)!;
    if (Math.abs(expected - values.get(c)!) > Math.max(2000, Math.abs(values.get(c)!) * 0.005)) consistencyValid = false;
  }
  if (SHARE_KEYS.has(key) && (!finite(fact.value) || fact.value <= 0)) consistencyValid = false;
  if (['total_assets','cash_and_equivalents','total_debt'].includes(key) && (!finite(fact.value) || fact.value < 0)) consistencyValid = false;
  if (values.has('cash_and_equivalents') && values.has('total_assets')) {
    checks.push('cash_not_above_assets');
    if (values.get('cash_and_equivalents')! > values.get('total_assets')!) consistencyValid = false;
  }
  if (!schemaValid) reasons.push('schema_invalid');
  if (!provenanceValid) reasons.push('official_provenance_missing');
  if (!unitValid) reasons.push('unit_invalid');
  if (!pointInTimeValid) reasons.push('point_in_time_invalid');
  if (!consistencyValid) reasons.push('accounting_or_duplicate_conflict');
  // Receipt timestamps/status are outputs, not new financial evidence. Excluding
  // them makes an unchanged peer set idempotent while newly arrived conflicts
  // change the hash and produce a new append-only validation receipt.
  const inputHash = createHash('sha256').update(JSON.stringify({ fact: evidenceIdentity(fact),
    peers: periodPeers.map(evidenceIdentity).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    provenance, version: OFFICIAL_FINANCIAL_VALIDATOR_VERSION })).digest('hex');
  return { schemaValid: schemaValid && provenanceValid, unitValid, pointInTimeValid, consistencyValid,
    status: reasons.length === 0 ? 'validated' as const : 'rejected' as const,
    reasons, checks, inputHash, version: OFFICIAL_FINANCIAL_VALIDATOR_VERSION };
}
