import type { SourceTerminalReason } from './source-run-ledger';
import type { SourceSyncResult } from './types';

const SUCCESSFUL_TERMINALS = new Set<SourceTerminalReason>([
  'success',
  'successful_empty',
  'duplicate_only',
]);

export type SourceHealthRun = {
  connector: string;
  attemptedAt: string;
  nextExpectedAt?: string | null;
  terminalReason: SourceTerminalReason;
  authStatus: 'authorized' | 'missing' | 'rejected' | 'not_applicable';
};

export type SourceHealthFailure = {
  connector: string;
  reason: 'missing_history' | 'missed_deadline' | 'auth_failed' | 'parser_failed' | 'consecutive_failures';
  latestTerminalReason: SourceTerminalReason | null;
  failedRunCount: number;
};

/**
 * Classify an ingestion result without comparing document counts to symbol-hit
 * counts. A single candidate document can legitimately contain several symbols.
 */
export function classifySourceSyncTerminal(
  result: Pick<SourceSyncResult, 'fetchedPosts' | 'recordsWritten' | 'duplicatesSkipped' | 'matchedDirectHits' | 'matchedIndustryHits' | 'candidateDocuments' | 'errorCode' | 'degradedReason' | 'timedOut'>,
): SourceTerminalReason {
  const fetched = Number(result.fetchedPosts || 0);
  const written = Number(result.recordsWritten || 0);
  const duplicates = Number(result.duplicatesSkipped || 0);
  const candidates = Number(result.candidateDocuments || 0);
  const matched = Number(result.matchedDirectHits || 0) + Number(result.matchedIndustryHits || 0);
  const reason = `${result.errorCode || ''} ${result.degradedReason || ''}`;
  if (/auth|oauth|credential|login|vault|token/iu.test(reason)) return 'auth_failed';
  if (/parser|parse_zero|zero_messages/iu.test(reason)) return 'parser_failed';
  if (result.timedOut) return 'failed';
  if (written > 0 && reason.trim()) return 'partial';
  if (written > 0) return 'success';
  if (candidates > 0 && duplicates >= candidates) return 'duplicate_only';
  if (fetched > 0 && duplicates >= fetched) return 'duplicate_only';
  if (candidates > 0 || matched > 0) return 'parser_failed';
  if (fetched > 0) return 'successful_empty';
  if (reason.trim()) return 'failed';
  return 'successful_empty';
}

export function activeSourceHealthFailures(
  activeConnectors: readonly string[],
  runs: readonly SourceHealthRun[],
  nowMs = Date.now(),
): SourceHealthFailure[] {
  const activeSet = new Set(activeConnectors);
  const rowsByConnector = new Map<string, SourceHealthRun[]>();
  for (const run of runs) {
    if (!activeSet.has(run.connector)) continue;
    const existing = rowsByConnector.get(run.connector) ?? [];
    existing.push(run);
    rowsByConnector.set(run.connector, existing);
  }

  const failures: SourceHealthFailure[] = [];
  for (const connector of activeConnectors) {
    const connectorRuns = (rowsByConnector.get(connector) ?? [])
      .slice()
      .sort((left, right) => Date.parse(right.attemptedAt) - Date.parse(left.attemptedAt));
    const latest = connectorRuns[0];
    if (!latest) {
      failures.push({ connector, reason: 'missing_history', latestTerminalReason: null, failedRunCount: 0 });
      continue;
    }
    if (latest.terminalReason === 'auth_failed' || latest.authStatus === 'missing' || latest.authStatus === 'rejected') {
      failures.push({ connector, reason: 'auth_failed', latestTerminalReason: latest.terminalReason, failedRunCount: 1 });
      continue;
    }
    if (latest.terminalReason === 'parser_failed') {
      failures.push({ connector, reason: 'parser_failed', latestTerminalReason: latest.terminalReason, failedRunCount: 1 });
      continue;
    }
    const nextExpectedMs = latest.nextExpectedAt ? Date.parse(latest.nextExpectedAt) : Number.NaN;
    if (Number.isFinite(nextExpectedMs) && nextExpectedMs < nowMs) {
      failures.push({ connector, reason: 'missed_deadline', latestTerminalReason: latest.terminalReason, failedRunCount: 0 });
      continue;
    }
    const latestTwo = connectorRuns.slice(0, 2);
    if (latestTwo.length === 2 && latestTwo.every((run) => !SUCCESSFUL_TERMINALS.has(run.terminalReason))) {
      failures.push({
        connector,
        reason: 'consecutive_failures',
        latestTerminalReason: latest.terminalReason,
        failedRunCount: 2,
      });
    }
  }
  return failures;
}
