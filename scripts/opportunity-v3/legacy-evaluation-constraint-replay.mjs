import { createHash } from 'node:crypto';

export const V314_ACTIONABILITY_MIGRATION='migrations/20260811_actionability_recovery_v3_14.sql';
const V3196_EVALUATION_MIGRATION='migrations/20260828_legacy_evaluation_schema_v3_19_6.sql';
const V320_RUNTIME_MIGRATION='migrations/20260828_kol_first_runtime_recovery_v3_20.sql';
const definitionSha256='25b482967b2e41aee5b1722d1bc6f313f96d9e9423d1cb732736696ce1d15606';

// The 9/19 backup already holds the validated v3.20 check. These three
// original migration files are immutable, including their other DDL.
const reviewedSql=new Map([
  [V314_ACTIONABILITY_MIGRATION, {
    sha256:'43771e50c0e59d2c1e7ed310a6a204283fc782cbd7e0f10f1de87d36389874af', evaluationStatements:1,
  }],
  [V3196_EVALUATION_MIGRATION, {
    sha256:'7eaa03624dfed1548313ea745e5446248ca303cceb4762278708267b429d7093', evaluationStatements:2,
  }],
  [V320_RUNTIME_MIGRATION, {
    sha256:'987eafaa934c375437ca5495891148d3619f101fa538d379b221c37921edfbc2', evaluationStatements:2,
  }],
]);
const v314ConstraintSelector=[
  "      AND constraint_value.contype='c'",
  "      AND (constraint_value.conname IN ('legacy_revision_id_v314_check','legacy_evaluation_schema_v314_check')",
].join('\n');
const v314RetainCheck=[
  "      AND NOT (constraint_value.conrelid='public.legacy_decision_revision_evaluations_v3_13'::regclass",
  "        AND constraint_value.conname='legacy_evaluation_schema_v314_check')",
].join('\n');
const evaluationDdl=/^ALTER TABLE public\.legacy_decision_revision_evaluations_v3_13\n  (?:DROP CONSTRAINT IF EXISTS legacy_evaluation_schema_v314_check|ADD CONSTRAINT legacy_evaluation_schema_v314_check\s+CHECK\s*\([\s\S]+?\));\n/gmu;
const hash=value=>createHash('sha256').update(value).digest('hex');

async function readValidatedV320Oid(client) {
  const {rows}=await client.query(
    "SELECT c.oid::text AS oid, pg_catalog.pg_get_constraintdef(c.oid) AS definition " +
    "FROM pg_catalog.pg_constraint c " +
    "WHERE c.conrelid=pg_catalog.to_regclass('public.legacy_decision_revision_evaluations_v3_13') " +
    "AND c.conname='legacy_evaluation_schema_v314_check' AND c.contype='c' " +
    "AND c.convalidated AND NOT c.connoinherit");
  const candidate=rows[0];
  if(rows.length!==1 || typeof candidate.oid!=='string' || typeof candidate.definition!=='string')return null;
  return hash(candidate.definition)===definitionSha256 ? candidate.oid : null;
}

// The caller owns the reviewed migration transaction. Lock the same table the
// original ALTER statements would lock, then recheck before preserving its OID.
export async function lockInstalledV320EvaluationCheck(client) {
  const oid=await readValidatedV320Oid(client);
  if(oid===null)return null;
  await client.query('LOCK TABLE public.legacy_decision_revision_evaluations_v3_13 IN ACCESS EXCLUSIVE MODE');
  await verifyV320EvaluationCheck(client,oid);
  return oid;
}

export async function verifyV320EvaluationCheck(client,oid) {
  if(await readValidatedV320Oid(client)!==oid)throw Error('legacy_evaluation_v320_checkpoint_changed');
}

export function preserveV320EvaluationCheck(migration) {
  const profile=reviewedSql.get(migration.relativePath);
  const original=migration.bytes.toString('utf8');
  if(!profile)return original;
  if(hash(migration.bytes)!==profile.sha256)throw Error('legacy_evaluation_replay_source_changed');
  if([...original.matchAll(evaluationDdl)].length!==profile.evaluationStatements)
    throw Error('legacy_evaluation_replay_boundary_changed');
  let retained=original.replace(evaluationDdl,'');
  if(migration.relativePath===V314_ACTIONABILITY_MIGRATION) {
    if(retained.split(v314ConstraintSelector).length!==2)throw Error('legacy_evaluation_replay_boundary_changed');
    retained=retained.replace(v314ConstraintSelector,()=>[
      "      AND constraint_value.contype='c'",
      v314RetainCheck,
      v314ConstraintSelector.split('\n')[1],
    ].join('\n'));
  }
  return retained;
}
