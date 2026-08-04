import { ACCEPTANCE_VERSION_V3, ENGINE_CONTRACT_V3, type OpportunityEngineV3 } from './contracts.ts';
import { assertWholeSecondUtc, canonicalJson, sha256Canonical } from './canonical.ts';
import { getOpportunityV3ServerClient } from './service-client.ts';
import { v3PublicEnabled } from './deployment.ts';
import { assertNoPublicSizing } from './verified-change.ts';
import { validAvailableProjectionPayload } from './public-schema.ts';
import { COMPARISON_CONTRACT_KEY_V3, PUBLIC_RUN_PURPOSE_V3 } from './config.ts';

export type ProjectionRunAtCutoffV3 = {
  run_id: string;
  mode: string;
  run_purpose: string;
  source_cutoff: string;
  comparison_contract_key: string;
  status: 'preparing' | 'running' | 'success' | 'failed' | 'converged';
  created_at: string;
  sealed_at: string | null;
  terminal_at: string | null;
};

export type ProjectionSelectionV3 =
  | { availability: 'available'; runId: string }
  | {
    availability: 'unavailable';
    reason: 'cold_start' | 'no_matching_success' | 'matching_run_in_progress' | 'latest_matching_failed';
  };

export function unavailableProjection(
  cutoff: string,
  reason: 'cold_start' | 'no_matching_success' | 'matching_run_in_progress' | 'latest_matching_failed',
  warnings: OpportunityEngineV3['engineHealth']['warnings'] = ['shadow_only'],
): OpportunityEngineV3 {
  const asOf = assertWholeSecondUtc(cutoff);
  return {
    contractVersion: ENGINE_CONTRACT_V3,
    availability: 'unavailable',
    mode: 'shadow',
    asOf,
    runId: null,
    sourceRunId: null,
    engineHealth: {
      status: reason === 'latest_matching_failed' ? 'failed' : 'pending',
      sourceCutoff: asOf,
      acceptanceVersion: ACCEPTANCE_VERSION_V3,
      modelInfluence: 'none',
      reason,
      assistiveArtifacts: [],
      warnings,
    },
  };
}

function validateStoredProjection(row: Record<string, unknown>): OpportunityEngineV3 | null {
  const payload = row.payload_json;
  if (!validAvailableProjectionPayload(payload)) return null;
  const projection = payload;
  try {
    assertNoPublicSizing(projection);
  } catch {
    return null;
  }
  const canonical = canonicalJson(projection);
  if (decodeBytea(row.payload_canonical) !== canonical) return null;
  if (typeof row.payload_hash !== 'string' || row.payload_hash !== sha256Canonical(projection)) return null;
  return projection;
}

export function selectProjectionRunAtCutoff(
  rows: ProjectionRunAtCutoffV3[],
  cutoff: string,
): ProjectionSelectionV3 {
  const cutoffMs = Date.parse(assertWholeSecondUtc(cutoff));
  const created = rows.filter((row) =>
    row.mode === 'enrich_rank' &&
    Date.parse(row.created_at) <= cutoffMs &&
    Date.parse(row.source_cutoff) <= cutoffMs);
  if (created.length === 0) return { availability: 'unavailable', reason: 'cold_start' };
  const matching = created.filter((row) =>
    row.run_purpose === PUBLIC_RUN_PURPOSE_V3 &&
    row.comparison_contract_key === COMPARISON_CONTRACT_KEY_V3);
  if (matching.length === 0) {
    return { availability: 'unavailable', reason: 'no_matching_success' };
  }
  const visibleTerminal = matching.filter((row) =>
    row.terminal_at !== null && Date.parse(row.terminal_at) <= cutoffMs);
  const successes = visibleTerminal
    .filter((row) => row.status === 'success')
    .sort(compareTerminalRuns);
  if (successes.length > 0) {
    const first = successes[0];
    const second = successes[1];
    if (
      second &&
      first.source_cutoff === second.source_cutoff &&
      first.terminal_at === second.terminal_at
    ) return { availability: 'unavailable', reason: 'latest_matching_failed' };
    return { availability: 'available', runId: first.run_id };
  }
  const active = matching.filter((row) =>
    row.terminal_at === null || Date.parse(row.terminal_at) > cutoffMs);
  if (active.length > 0) {
    return { availability: 'unavailable', reason: 'matching_run_in_progress' };
  }
  if (visibleTerminal.some((row) => row.status === 'failed')) {
    return { availability: 'unavailable', reason: 'latest_matching_failed' };
  }
  return { availability: 'unavailable', reason: 'no_matching_success' };
}

function compareTerminalRuns(left: ProjectionRunAtCutoffV3, right: ProjectionRunAtCutoffV3): number {
  const cutoffOrder = Date.parse(right.source_cutoff) - Date.parse(left.source_cutoff);
  if (cutoffOrder !== 0) return cutoffOrder;
  const terminalOrder = Date.parse(String(right.terminal_at)) - Date.parse(String(left.terminal_at));
  if (terminalOrder !== 0) return terminalOrder;
  return left.run_id.localeCompare(right.run_id, 'en', { sensitivity: 'variant' });
}

export async function loadOpportunityEngineV3(requestProjectionCutoff: string): Promise<OpportunityEngineV3 | null> {
  if (!v3PublicEnabled()) return null;
  const cutoff = assertWholeSecondUtc(requestProjectionCutoff);
  const client = getOpportunityV3ServerClient();
  const { data, error } = await client.rpc('select_opportunity_public_projection_v3', {
    request_cutoff: cutoff,
  });
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) {
    return unavailableProjection(cutoff, 'latest_matching_failed');
  }
  const row = data[0] as Record<string, unknown>;
  if (row.availability === 'unavailable') {
    if (
      !['cold_start', 'no_matching_success', 'matching_run_in_progress', 'latest_matching_failed']
        .includes(String(row.unavailable_reason)) ||
      row.selected_run_id !== null ||
      !Array.isArray(row.warnings) ||
      row.warnings.at(-1) !== 'shadow_only'
    ) return unavailableProjection(cutoff, 'latest_matching_failed');
    return unavailableProjection(
      cutoff,
      row.unavailable_reason as 'cold_start' | 'no_matching_success' | 'matching_run_in_progress' | 'latest_matching_failed',
      row.warnings as OpportunityEngineV3['engineHealth']['warnings'],
    );
  }
  if (
    row.availability !== 'available' ||
    typeof row.selected_run_id !== 'string' ||
    row.unavailable_reason !== null
  ) return unavailableProjection(cutoff, 'latest_matching_failed');
  return validateStoredProjection(row) ?? unavailableProjection(cutoff, 'latest_matching_failed');
}

function decodeBytea(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex').toString('utf8');
  return value;
}
