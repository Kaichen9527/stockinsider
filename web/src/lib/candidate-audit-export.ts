/** Read-only operator audit. A consistent terminal run is not publication authority. */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export type AuditRow = Record<string, unknown>;
export type CandidateAuditReader = {
  run: (id: string | null) => Promise<AuditRow | null>;
  items: (runId: string, offset: number, limit: number) => Promise<AuditRow[]>;
  details: (ids: string[], offset: number, limit: number) => Promise<AuditRow[]>;
  instruments: (stockIds: string[], cutoff: string, offset: number, limit: number) => Promise<AuditRow[]>;
};
export const AUDIT_PAGE = 250;
export const AUDIT_BOUND = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const auditUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const object = (value: unknown): value is AuditRow => value !== null && typeof value === 'object' && !Array.isArray(value);
function at(value: unknown): number {
  if (typeof value !== 'string') return NaN;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (!parts || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59) return NaN;
  const day = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  if (day.toISOString().slice(0, 10) !== value.slice(0, 10)) return NaN;
  return Date.parse(value);
}
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= AUDIT_BOUND;
const ordered = (rows: AuditRow[]) => [...rows].sort((a, b) => String(a.id ?? a.instrument_authority_id).localeCompare(String(b.id ?? b.instrument_authority_id)));
function hash(value: unknown): string {
  const stable = (item: unknown): unknown => Array.isArray(item) ? item.map(stable) : object(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, stable(item[key])])) : item;
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

async function pages(read: (offset: number, limit: number) => Promise<AuditRow[]>): Promise<AuditRow[]> {
  const rows: AuditRow[] = [];
  for (let offset = 0; offset <= AUDIT_BOUND; offset += AUDIT_PAGE) {
    const page = await read(offset, AUDIT_PAGE);
    if (!Array.isArray(page) || page.length > AUDIT_PAGE || page.some((row) => !object(row))) throw new Error('candidate_audit_page_shape');
    rows.push(...page);
    if (rows.length > AUDIT_BOUND) throw new Error('candidate_audit_row_bound');
    if (page.length < AUDIT_PAGE) return rows;
  }
  throw new Error('candidate_audit_page_bound');
}

async function batched(keys: string[], read: (ids: string[], offset: number, limit: number) => Promise<AuditRow[]>): Promise<AuditRow[]> {
  const rows: AuditRow[] = [];
  for (let offset = 0; offset < keys.length; offset += 100) {
    const ids = keys.slice(offset, offset + 100);
    rows.push(...await pages((start, limit) => read(ids, start, limit)));
    if (rows.length > AUDIT_BOUND) throw new Error('candidate_audit_row_bound');
  }
  return ordered(rows);
}

function uniqueRows(rows: AuditRow[], key: string): void {
  const values = rows.map((row) => row[key]);
  if (values.some((value) => !auditUuid(value)) || new Set(values).size !== values.length) throw new Error('candidate_audit_duplicate_or_invalid_identity');
}

function validateRun(run: AuditRow, now: string): string {
  if (!auditUuid(run.id) || !['success', 'partial', 'failed'].includes(String(run.status))) throw new Error('candidate_audit_terminal_run_required');
  const cutoff = at(run.evaluation_at); const finished = at(run.finished_at); const started = at(run.started_at);
  if (![cutoff, finished, started, at(now)].every(Number.isFinite) || cutoff > at(now) || finished > at(now) || finished < started || finished < cutoff) throw new Error('candidate_audit_run_time_invalid');
  if (![run.candidate_count, run.completed_count, run.failed_count, run.partial_count].every(count)
    || Number(run.completed_count) + Number(run.failed_count) + Number(run.partial_count) !== run.candidate_count) throw new Error('candidate_audit_run_counts_invalid');
  return String(run.evaluation_at);
}

export function projectCandidateAudit(run: AuditRow, items: AuditRow[], details: AuditRow[], instruments: AuditRow[], now: string) {
  const cutoff = validateRun(run, now);
  uniqueRows(items, 'id'); uniqueRows(items, 'stock_id'); uniqueRows(details, 'id'); uniqueRows(instruments, 'instrument_authority_id');
  if (items.length !== run.candidate_count || new Set(items.map((row) => row.symbol)).size !== items.length) throw new Error('candidate_audit_item_cardinality');
  if (items.some((row) => row.run_id !== run.id || !/^\d{4}$/u.test(String(row.symbol)) || !['success', 'partial', 'failed'].includes(String(row.status))
    || !Number.isFinite(at(row.finished_at)) || at(row.finished_at) > at(run.finished_at))) throw new Error('candidate_audit_item_identity');
  for (const [status, key] of [['success', 'completed_count'], ['partial', 'partial_count'], ['failed', 'failed_count']] as const) {
    if (items.filter((row) => row.status === status).length !== run[key]) throw new Error('candidate_audit_status_counts_mismatch');
  }
  const wantedDetails = new Set(items.map((row) => row.detail_revision_id).filter(auditUuid));
  const wantedStocks = new Set(items.map((row) => row.stock_id));
  if (details.some((row) => !wantedDetails.has(String(row.id))) || instruments.some((row) => !wantedStocks.has(row.stock_id))) throw new Error('candidate_audit_unrequested_rows');
  const detailById = new Map(details.map((row) => [row.id, row]));
  const candidates = [...items].sort((a, b) => String(a.symbol).localeCompare(String(b.symbol))).map((item) => {
    const reasons: string[] = [];
    const detail = auditUuid(item.detail_revision_id) ? detailById.get(item.detail_revision_id) : undefined;
    if (!detail) reasons.push('immutable_revision_missing');
    else if (detail.stock_id !== item.stock_id || detail.research_run_id !== run.id || !Number.isFinite(at(detail.available_at))
      || at(detail.available_at) > at(run.finished_at) || !Number.isFinite(at(detail.as_of)) || at(detail.as_of) > at(run.finished_at)) reasons.push('immutable_revision_binding_invalid');
    const eligible = instruments.filter((row) => row.stock_id === item.stock_id && row.symbol === item.symbol
      && row.instrument_type === 'common_stock' && row.listing_status === 'active'
      && ((row.exchange === 'TWSE' && row.provider === 'twse') || (row.exchange === 'TPEX' && row.provider === 'tpex'))
      && [row.source_timestamp, row.recorded_at, row.valid_from].every((value) => Number.isFinite(at(value)) && at(value) <= at(cutoff))
      && (row.valid_to === null || (Number.isFinite(at(row.valid_to)) && at(row.valid_to) > at(cutoff))));
    const names = new Set(eligible.map((row) => `${row.exchange}:${row.official_name}`));
    const instrument = [...eligible].sort((a, b) => at(b.recorded_at) - at(a.recorded_at) || at(b.source_timestamp) - at(a.source_timestamp)
      || String(a.instrument_authority_id).localeCompare(String(b.instrument_authority_id)))[0];
    if (!instrument || names.size !== 1 || typeof instrument.official_name !== 'string' || instrument.official_name.length < 2
      || instrument.official_name.length > 40 || /[\x00-\x1f\x7f]/u.test(instrument.official_name)) reasons.push('official_common_stock_identity_unverified_or_conflicting');
    if (item.status !== 'success') reasons.push('terminal_research_not_complete');
    const detailBound = detail && !reasons.some((reason) => reason.startsWith('immutable_revision'));
    const identityBound = instrument && !reasons.some((reason) => reason.startsWith('official_common'));
    return { symbol: String(item.symbol), name: identityBound ? String(instrument.official_name) : null,
      stock_id: String(item.stock_id), revision: detailBound ? String(detail.id) : null,
      security_type: identityBound ? 'common_stock' : null, instrument_authority_id: identityBound ? String(instrument.instrument_authority_id) : null,
      exchange: identityBound ? String(instrument.exchange) : null, research_status: item.status,
      revision_available_at: detailBound ? detail.available_at : null, session_date: detailBound ? detail.session_date : null,
      reason_codes: reasons, publication_authorized: false };
  });
  const identity = { schema: 'candidate-run-audit-identity-v1', run, items: ordered(items), details: ordered(details), instruments: ordered(instruments) };
  return { schema_version: 'candidate-terminal-run-audit-v1', revision: hash(identity), as_of: cutoff, observed_at: now,
    scope: 'one_terminal_candidate_research_run_not_full_current_app_universe', expected_count: run.candidate_count,
    complete: false, terminal_run_accounted_for: true, authoritative_snapshot_available: false,
    database_run_evidence_available: true, full_app_coverage_verified: false, production_updated: false, publish_allowed: false,
    consistency_mode: 'two_matching_reads_not_a_serializable_database_snapshot',
    run: { id: run.id, status: run.status, evaluation_at: cutoff, finished_at: run.finished_at },
    freshness: at(now) - at(run.finished_at) > 26 * 3600000 ? 'older_than_26h_audit_only' : 'within_26h_not_trading_freshness_proof',
    candidates, blockers: ['full_current_candidate_universe_not_attested', 'publication_authority_not_granted'],
    evidence_hashes: { run: hash(run), items: hash(ordered(items)), details: hash(ordered(details)), instruments: hash(ordered(instruments)) } };
}

export async function exportCandidateAudit(reader: CandidateAuditReader, runId: string | null, now: string) {
  if (runId !== null && !auditUuid(runId)) throw new Error('candidate_audit_run_id_invalid');
  const run = await reader.run(runId);
  if (!run) throw new Error('candidate_audit_run_unavailable');
  if (runId !== null && run.id !== runId) throw new Error('candidate_audit_wrong_run');
  const cutoff = validateRun(run, now);
  const collect = async () => {
    const items = ordered(await pages((offset, limit) => reader.items(String(run.id), offset, limit)));
    const details = await batched([...new Set(items.map((row) => row.detail_revision_id).filter(auditUuid))].sort(), reader.details);
    const instruments = await batched([...new Set(items.map((row) => row.stock_id).filter(auditUuid))].sort(),
      (ids, offset, limit) => reader.instruments(ids, cutoff, offset, limit));
    return { items, details, instruments };
  };
  const first = await collect();
  const second = await collect();
  const after = await reader.run(String(run.id));
  if (!isDeepStrictEqual(run, after) || !isDeepStrictEqual(first, second)) throw new Error('candidate_audit_changed_during_read');
  return projectCandidateAudit(run, first.items, first.details, first.instruments, now);
}
