import { getSupabaseServerClient } from './supabase-server';
import type { SourceExecutionPolicy } from './source-policy';
import { collectPagedAuthorityRows } from './candidate-research-policy';
import { aggregateSourceRuns24h } from './source-run-ledger-metrics';

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
  newCount: number;
  written: number;
  duplicate: number;
  authStatus: 'authorized' | 'missing' | 'rejected' | 'not_applicable';
  terminalReason: SourceTerminalReason;
  terminalDetail: string | null;
  parserVersion: string;
  policy: SourceExecutionPolicy;
  nextExpectedAt: string | null;
  metadata?: Record<string, unknown>;
  /** Indexing can succeed even when creator permission forbids content analysis. */
  indexUpdated?: boolean | null;
  contentAnalyzable?: boolean | null;
  validMatches?: number | null;
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
  runs24h: number;
  fetched24h: number;
  matched24h: number;
  newCount24h: number;
  duplicate24h: number;
  written24h: number;
  indexUpdated: boolean;
  contentAnalyzable: boolean;
  validMatches: number;
  metadata: Record<string, unknown>;
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
    new_count: Math.max(0, input.newCount),
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
    index_updated: input.indexUpdated ?? false,
    content_analyzable: input.contentAnalyzable ?? false,
    valid_matches: Math.max(0, input.validMatches ?? input.matched),
  });
  if (error) throw new Error(`source_run_ledger_write_failed:${error.message}`);
}

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  telegram: 'Telegram',
  threads: 'Threads',
  ptt: 'PTT Stock',
  bulltalk: '股市爆料同學會',
  gdelt: 'GDELT 新聞中介資料',
  twse_insider: 'TWSE/TPEx/MOPS',
  investanchors: 'InvestAnchors',
  instagram: 'Instagram',
  youtube: 'YouTube',
  googlenews: 'Google News',
  udn: 'UDN',
  anue: '鉅亨網',
  mobile01: 'Mobile01',
  podcast: 'Podcast',
};

export async function syncSourceConnectorRegistry(policy: SourceExecutionPolicy, parserVersion: string): Promise<void> {
  const { error } = await getSupabaseServerClient().from('source_connector_registry').upsert({
    connector: policy.connector,
    lifecycle: policy.disposition,
    display_name: SOURCE_DISPLAY_NAMES[policy.connector] ?? policy.connector,
    license_basis: policy.licenseBasis,
    parser_version: parserVersion,
    retired_at: policy.disposition === 'retired' ? new Date().toISOString() : null,
    retirement_reason: policy.disposition === 'active' ? null : policy.terminalReason,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'connector' });
  if (error) throw new Error(`source_connector_registry_write_failed:${error.message}`);
}

export function nextExpectedAt(attemptedAt: string, cadenceHours: number | null): string | null {
  if (!cadenceHours) return null;
  return new Date(new Date(attemptedAt).getTime() + cadenceHours * 60 * 60 * 1000).toISOString();
}

export async function loadLatestSourceRunLedger(): Promise<SourceRunLedgerView[]> {
  const supabase = getSupabaseServerClient();
  const cutoff24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data, error }, recentRows, registry] = await Promise.all([
    supabase.from('source_run_ledger')
      .select('id,connector,expected_at,attempted_at,succeeded_at,fetched,matched,new_count,duplicate,written,index_updated,content_analyzable,valid_matches,auth_status,terminal_reason,terminal_detail,parser_version,license_basis,source_disposition,next_expected_at,metadata')
      .order('attempted_at', { ascending: false }).limit(250),
    collectPagedAuthorityRows<Record<string, unknown>>(async (from, to) => {
      const page = await supabase.from('source_run_ledger')
        .select('connector,attempted_at,fetched,matched,new_count,duplicate,written')
        .gte('attempted_at', cutoff24hIso).order('attempted_at', { ascending: true }).range(from, to);
      if (page.error) throw new Error(page.error.message);
      return (page.data as Record<string, unknown>[]) || [];
    }, { maxRows: 5000 }),
    supabase.from('source_connector_registry')
      .select('connector,lifecycle,license_basis,parser_version,retirement_reason,updated_at')
      .order('connector', { ascending: true }),
  ]);
  if (error || registry.error) throw new Error(`source_run_ledger_read_failed:${error?.message || registry.error?.message}`);

  const latestByConnector = new Map<string, SourceRunLedgerView>();
  const aggregates24h = aggregateSourceRuns24h(recentRows);
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const connector = String(row.connector || '');
    if (!connector || latestByConnector.has(connector)) continue;
    const aggregate = aggregates24h.get(connector) || { runs: 0, fetched: 0, matched: 0, newCount: 0, duplicate: 0, written: 0 };
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
      runs24h: aggregate.runs, fetched24h: aggregate.fetched, matched24h: aggregate.matched,
      newCount24h: aggregate.newCount, duplicate24h: aggregate.duplicate, written24h: aggregate.written,
      indexUpdated: row.index_updated === true,
      contentAnalyzable: row.content_analyzable === true,
      validMatches: Number(row.valid_matches ?? row.matched ?? 0),
      metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {},
    });
  }
  for (const raw of registry.data ?? []) {
    const row = raw as Record<string, unknown>;
    const connector = String(row.connector || '');
    if (!connector) continue;
    const disposition = String(row.lifecycle || 'retired') as SourceExecutionPolicy['disposition'];
    const terminalReason: SourceTerminalReason = disposition === 'manual_only'
      ? 'manual_only'
      : disposition === 'blocked_auth'
        ? 'auth_failed'
        : disposition === 'blocked_license'
          ? 'license_blocked'
          : disposition === 'retired'
            ? 'retired'
            : 'failed';
    const updatedAt = String(row.updated_at || '');
    const existing = latestByConnector.get(connector);
    if (existing && disposition === 'active') continue;
    if (existing) {
      latestByConnector.set(connector, {
        ...existing,
        authStatus: disposition === 'blocked_auth' ? 'missing' : 'not_applicable',
        terminalReason,
        terminalDetail: row.retirement_reason ? String(row.retirement_reason) : null,
        parserVersion: String(row.parser_version || existing.parserVersion),
        licenseBasis: String(row.license_basis || existing.licenseBasis),
        sourceDisposition: disposition,
        nextExpectedAt: null,
        indexUpdated: existing.indexUpdated,
        contentAnalyzable: existing.contentAnalyzable,
        validMatches: existing.validMatches,
        metadata: existing.metadata,
      });
      continue;
    }
    latestByConnector.set(connector, {
      id: `registry:${connector}`, connector, expectedAt: updatedAt, attemptedAt: updatedAt,
      succeededAt: null, fetched: 0, matched: 0, newCount: 0, duplicate: 0, written: 0,
      authStatus: disposition === 'blocked_auth' ? 'missing' : 'not_applicable', terminalReason,
      terminalDetail: row.retirement_reason ? String(row.retirement_reason) : null,
      parserVersion: String(row.parser_version || ''), licenseBasis: String(row.license_basis || ''),
      sourceDisposition: disposition, nextExpectedAt: null,
      runs24h: 0, fetched24h: 0, matched24h: 0, newCount24h: 0, duplicate24h: 0, written24h: 0,
      indexUpdated: false, contentAnalyzable: false, validMatches: 0,
      metadata: {},
    });
  }
  return [...latestByConnector.values()];
}
