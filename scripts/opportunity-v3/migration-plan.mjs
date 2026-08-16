import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const authorityArtifact = path.join(root,
  '.loop-engineering/state/changes/source-led-opportunity-engine-v3/status.json');
const authorityBytes = fs.readFileSync(authorityArtifact);
const authority = JSON.parse(authorityBytes.toString('utf8'));
const migrationPaths = [
  'migrations/20260724_source_led_opportunity_engine_v3.sql',
  'migrations/20260809_product_value_recovery_v3_12.sql',
  'migrations/20260809_decision_integrity_v3_13.sql',
  'migrations/20260811_actionability_recovery_v3_14.sql',
  'migrations/20260813_opportunity_recovery_v3_15.sql',
  'migrations/20260814_official_ingestion_chunk_apply_v3_15.sql',
  'migrations/20260816_claim_handoff_lease_v3_16.sql',
  'migrations/20260816_official_ingestion_partial_resume_v3_16.sql',
  'migrations/20260816_official_ingestion_transaction_time_v3_16_9.sql',
  'migrations/20260816_official_ingestion_same_transaction_visibility_v3_16_10.sql',
  'migrations/20260816_calendar_dependency_recovery_occurrence_v3_16_11.sql',
  'migrations/20260816_candidate_fact_plane_bound_v3_16_12.sql',
  'migrations/20260816_analysis_payload_reuse_v3_16_15.sql',
  'migrations/20260816_financial_fact_recollection_idempotency_v3_16_16.sql',
];
const migrations = migrationPaths.map((relativePath) => {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  return {
    migration: relativePath,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    additiveOnly: !/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu.test(bytes.toString('utf8')),
  };
});
const productionDatabaseMigrationAuthorized =
  authority?.authority?.v314?.productionDatabaseMigrationAuthorized === true;
const orderedChainSha256 = createHash('sha256')
  .update(JSON.stringify(migrations.map(({ migration, sha256 }) => [migration, sha256])))
  .digest('hex');

process.stdout.write(JSON.stringify({
  protocol: 'source-led-opportunity-v3-migration-plan-v2',
  migrations,
  orderedChainSha256,
  authorityArtifact: {
    path: path.relative(root, authorityArtifact),
    sha256: createHash('sha256').update(authorityBytes).digest('hex'),
    productionDatabaseMigrationAuthorized,
  },
  applyAuthorized: productionDatabaseMigrationAuthorized,
  dedicatedApplyCommand: productionDatabaseMigrationAuthorized
    ? 'npm run db:v3:apply-reviewed -- --source-commit <reviewed-commit> --attestation-commit <attestation-commit>'
    : null,
  nextCommand: 'npm run db:v3:verify',
}) + '\n');
