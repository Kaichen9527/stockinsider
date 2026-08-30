import { getSupabaseServerClient } from './supabase-server';
import type { SourceExecutionPolicy } from './source-policy';

export type SourceTerminalReason =
  | 'success'
  | 'successful_empty'
  | 'duplicate_only'
  | 'partial'
  | 'auth_failed'
  | 'license_blocked'
  | 'parser_failed'
  | 'retired'
  | 'manual_only'
  | 'failed';

export type SourceRunLedgerInput = {
  externalRunId: string | null;
  connector: string;
  expectedAt: string;
  attemptedAt: string;
  succeededAt: string | null;
  fetched: number;
  matched: number;
  written: number;
  duplicate: number;
  authStatus: 'authorized' | 'missing' | 'rejected' | 'not_applicable';
  terminalReason: SourceTerminalReason;
  terminalDetail: string | null;
  parserVersion: string;
  policy: SourceExecutionPolicy;
  nextExpectedAt: string | null;
  metadata?: Record<string, unknown>;
};

export type SourceRunLedgerView = {
  id: string;
  connector: string;
  expectedAt: string;
  attemptedAt: string;
  succeededAt: string | null;
  fetched: number;
  matched: number;
  newCount: number;
  duplicate: number;
  written: number;
  authStatus: SourceRunLedgerInput['authStatus'];
  terminalReason: SourceTerminalReason;
  terminalDetail: string | null;
  parserVersion: string;
  licenseBasis: string;
  sourceDisposition: SourceExecutionPolicy['disposition'];
  nextExpectedAt: string | null;
};

export async function recordSourceRunLedger(input: SourceRunLedgerInput): Promise<void> {
  const { error } = await getSupabaseServerClient().from('source_run_ledger').insert({
    external_run_id: input.externalRunId,
    connector: input.connector,
    expected_at: input.expectedAt,
    attempted_at: input.attemptedAt,
    succeeded_at: input.succeededAt,
    fetched: Math.max(0, input.fetched),
    matched: Math.max(0, input.matched),
    new_count: Math.max(0, input.written),
    duplicate: Math.max(0, input.duplicate),
    written: Math.max(0, input.written),
    auth_status: input.authStatus,
    terminal_reason: input.terminalReason,
    terminal_detail: input.terminalDetail,
    parser_version: input.parserVersion,
    license_basis: input.policy.licenseBasis,
    source_disposition: input.policy.disposition,
    next_expected_at: input.nextExpectedAt,
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error(`source_run_ledger_write_failed:${error.message}`);
}

export function nextExpectedAt(attemptedAt: string, cadenceHours: number | null): string | null {
  if (!cadenceHours) return null;
  return new Date(new Date(attemptedAt).getTime() + cadenceHours * 60 * 60 * 1000).toISOString();
}

export async function loadLatestSourceRunLedger(): Promise<SourceRunLedgerView[]> {
  const { data, error } = await getSupabaseServerClient()
    .from('source_run_ledger')
    .select('id,connector,expected_at,attempted_at,succeeded_at,fetched,matched,new_count,duplicate,written,auth_status,terminal_reason,terminal_detail,parser_version,license_basis,source_disposition,next_expected_at')
    .order('attempted_at', { ascending: false })
    .limit(250);
  if (error) throw new Error(`source_run_ledger_read_failed:${error.message}`);

  const latestByConnector = new Map<string, SourceRunLedgerView>();
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const connector = String(row.connector || '');
    if (!connector || latestByConnector.has(connector)) continue;
    latestByConnector.set(connector, {
      id: String(row.id || ''),
      connector,
      expectedAt: String(row.expected_at || ''),
      attemptedAt: String(row.attempted_at || ''),
      succeededAt: row.succeeded_at ? String(row.succeeded_at) : null,
      fetched: Number(row.fetched || 0),
      matched: Number(row.matched || 0),
      newCount: Number(row.new_count || 0),
      duplicate: Number(row.duplicate || 0),
      written: Number(row.written || 0),
      authStatus: String(row.auth_status || 'not_applicable') as SourceRunLedgerView['authStatus'],
      terminalReason: String(row.terminal_reason || 'failed') as SourceTerminalReason,
      terminalDetail: row.terminal_detail ? String(row.terminal_detail) : null,
      parserVersion: String(row.parser_version || ''),
      licenseBasis: String(row.license_basis || ''),
      sourceDisposition: String(row.source_disposition || 'retired') as SourceRunLedgerView['sourceDisposition'],
      nextExpectedAt: row.next_expected_at ? String(row.next_expected_at) : null,
    });
  }
  return [...latestByConnector.values()];
}
