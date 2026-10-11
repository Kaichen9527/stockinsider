import { createHash } from 'node:crypto';

// These exact files contain protective trigger/comment TRUNCATE references.
// This is a lexical-policy exception, not production execution authority.
// Any byte change requires a new exact code review; callers cannot add pins.
const PROTECTIVE_SQL_PINS = new Map([
  ['migrations/20261008_research_observed_roster_v1.sql', '082641ec74a06e67162d3575a5d3d0f1324d7fa95e62316421a599478069221b'],
  ['migrations/20261009_research_author_assignments_v2.sql', '91629781ad52191ae4ef096d2f56af020066973556988713305bc7c10a80b99c'],
  ['migrations/20261009_research_author_results_v2.sql', '894cd214aa60678c2c4475abbf194ea59e4a7a23677b296eda61b52fab6ce3e5'],
  ['migrations/20261009_research_complete_input_v2.sql', 'fa15705e9eed6717f9fdb5f80b3f5ba0731a320ae46e8a3216c6b145dec8b84c'],
  ['migrations/20261009_research_input_preparations_v2.sql', 'af08bdafd1ea13ad9351e7aa66bb3abaa605c3d0c123cf582793f2684fbfc41e'],
  ['migrations/20261009_research_publication_lineage_v2.sql', '37a885ac77ef1c97196c197d6804300fd18843eebb31629da19f9d10f6d6449d'],
  ['migrations/20261009_research_publication_source_fence_v2.sql', 'b2db643e99f8ee1fcca4b8755f1e272996a84e1a228d785554d0643293880621'],
  ['migrations/20261009_research_reviewer_assignments_v2.sql', '43c0a0525c38c73cf5277c23031bae2acb88ace1b5db25cd440c01932f14bc86'],
  ['migrations/20261009_research_reviewer_results_v2.sql', 'af72171444c6c67a754f33099da704e78bb2d2bb7454ef356c4c8753ea26f934'],
  ['migrations/20261010_research_atomic_publication_v2.sql', 'ed2334dc46cf73fd33f61bd00d1034b50924d5e2213474372da5b121c4f3128a'],
]);
const BLOCKED_SQL = /\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu;

export function classifyReviewedMigrationSql(relativePath, bytes) {
  if (typeof relativePath !== 'string' || !Buffer.isBuffer(bytes) || !bytes.length)
    throw new Error('migration_sql_input_invalid');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const additiveOnly = !BLOCKED_SQL.test(bytes.toString('utf8'));
  const protectiveSqlException = !additiveOnly && PROTECTIVE_SQL_PINS.get(relativePath) === sha256;
  return Object.freeze({ sha256, additiveOnly, protectiveSqlException,
    allowed: additiveOnly || protectiveSqlException });
}
export function assertReviewedMigrationSql(relativePath, bytes) {
  const result = classifyReviewedMigrationSql(relativePath, bytes);
  if (!result.allowed) throw new Error('non_additive_migration_rejected');
  return result;
}
