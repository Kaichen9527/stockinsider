import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { hash } from './vnext-worker-fixture.mjs';

const migrationPaths = [
  'migrations/20261022_vnext_analysis_sources_v1.sql',
  'migrations/20261022_vnext_thesis_audit_v1.sql',
  'migrations/20261022_vnext_source_withdrawals_v1.sql',
  'migrations/20261022_vnext_cached_admission_v2.sql',
  'migrations/20261022_vnext_terminal_failure_slots_v1.sql',
  'migrations/20261022_vnext_financial_status_text_v1.sql',
  'migrations/20261022_vnext_issuer_ir_sources_v1.sql',
  'migrations/20261022_vnext_semantic_score_fence_v1.sql',
  'migrations/20261022_vnext_catalyst_criteria_v1.sql',
  'migrations/20261022_vnext_dimensionless_arithmetic_v1.sql',
  'migrations/20261022_vnext_target_exit_v1.sql',
  'migrations/20261022_vnext_preparation_read_v1.sql',
  'migrations/20261023_vnext_trading_invalidity_exit_v1.sql',
  'migrations/20261023_vnext_roster_current_fence_v1.sql',
  'migrations/20261023_vnext_forecast_sources_v1.sql',
  'migrations/20261023_vnext_forecast_active_v1.sql',
];

export async function installRoutineSourcePrefix(fixture) {
  for (const candidate of migrationPaths) {
    const bytes = readFileSync(new URL('../' + candidate, import.meta.url));
    await fixture.writer.query(bytes.toString());
    fixture.save('prefix-' + basename(candidate), { sha256: hash(bytes), bytes: bytes.length });
  }
}
