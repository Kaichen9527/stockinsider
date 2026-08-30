import type { SourceTerminalReason } from './source-run-ledger';

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
