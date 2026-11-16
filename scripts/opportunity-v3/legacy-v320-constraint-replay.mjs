import { createHash } from 'node:crypto';

const v314='migrations/20260811_actionability_recovery_v3_14.sql';
const v3191='migrations/20260827_runtime_diagnostic_contract_v3_19_1.sql';
const v3196='migrations/20260828_legacy_evaluation_schema_v3_19_6.sql';
const v320='migrations/20260828_kol_first_runtime_recovery_v3_20.sql';

// The archive may already have v3.20's expanded checks. Keep the same
// validated constraint while the earlier SQL runs elsewhere in the migration.
export const evaluationConstraintReplay=Object.freeze({
  table:'public.legacy_decision_revision_evaluations_v3_13',
  constraint:'legacy_evaluation_schema_v314_check',
  definitionSha256:'25b482967b2e41aee5b1722d1bc6f313f96d9e9423d1cb732736696ce1d15606',
  firstMigration:v314,
  statements:Object.freeze({[v314]:1,[v3196]:2,[v320]:2}),
});
export const diagnosticConstraintReplay=Object.freeze({
  table:'public.legacy_runtime_failure_diagnostics_v3_14',
  constraint:'legacy_runtime_failure_diagnostics_v3_14_invariant_code_check',
  definitionSha256:'81ceee66ab91761fa0f1ad48a9e482d4f34abb2a73bb5d32c19d39b4987666c8',
  firstMigration:v3191,
  statements:Object.freeze({[v3191]:2,[v320]:2}),
});
export const v320ConstraintReplays=Object.freeze([evaluationConstraintReplay,diagnosticConstraintReplay]);

const reviewedSql=new Map([
  [v314,'43771e50c0e59d2c1e7ed310a6a204283fc782cbd7e0f10f1de87d36389874af'],
  [v3191,'c5d6f4f5bbd3705c26803adba27de62ed15130096c01f57ed849991bcab42af2'],
  [v3196,'7eaa03624dfed1548313ea745e5446248ca303cceb4762278708267b429d7093'],
  [v320,'987eafaa934c375437ca5495891148d3619f101fa538d379b221c37921edfbc2'],
]);
const v314Selector=[
  "      AND constraint_value.contype='c'",
  "      AND (constraint_value.conname IN ('legacy_revision_id_v314_check','legacy_evaluation_schema_v314_check')",
];
const hash=value=>createHash('sha256').update(value).digest('hex');

async function readValidatedV320Oid(client,profile) {
  if(!v320ConstraintReplays.includes(profile))throw Error('legacy_v320_constraint_profile_unknown');
  const {rows}=await client.query(
    "SELECT c.oid::text AS oid, pg_catalog.pg_get_constraintdef(c.oid) AS definition " +
    "FROM pg_catalog.pg_constraint c WHERE c.conrelid=pg_catalog.to_regclass($1) " +
    "AND c.conname=$2 AND c.contype='c' AND c.convalidated AND NOT c.connoinherit",
    [profile.table,profile.constraint]);
  const candidate=rows[0];
  if(rows.length!==1 || typeof candidate.oid!=='string' || typeof candidate.definition!=='string')return null;
  return hash(candidate.definition)===profile.definitionSha256 ? candidate.oid : null;
}

// The caller owns the reviewed migration transaction. The check is re-read
// under the same table lock that the pinned ALTER statements would take.
export async function lockV320Constraint(client,profile) {
  const oid=await readValidatedV320Oid(client,profile);
  if(oid===null)return null;
  await client.query('LOCK TABLE '+profile.table+' IN ACCESS EXCLUSIVE MODE');
  await verifyV320Constraint(client,profile,oid);
  return oid;
}

export async function verifyV320Constraint(client,profile,oid) {
  if(await readValidatedV320Oid(client,profile)!==oid)throw Error('legacy_v320_constraint_checkpoint_changed');
}

export function preserveV320Constraints(migration,retained) {
  const relativePath=migration.relativePath;
  const original=migration.bytes.toString('utf8');
  const affected=v320ConstraintReplays.filter(profile=>retained.has(profile)&&Object.hasOwn(profile.statements,relativePath));
  if(affected.length===0)return original;
  if(hash(migration.bytes)!==reviewedSql.get(relativePath))throw Error('legacy_v320_constraint_source_changed');

  let sql=original;
  for(const profile of affected) {
    const table=profile.table.replace('.','\\.');
    const name=profile.constraint;
    const ddl=new RegExp('^ALTER TABLE '+table+'\\n  (?:DROP CONSTRAINT IF EXISTS '+name+
      '|ADD CONSTRAINT '+name+'\\s+CHECK\\s*\\([\\s\\S]+?\\));\\n','gmu');
    if([...sql.matchAll(ddl)].length!==profile.statements[relativePath])
      throw Error('legacy_v320_constraint_replay_boundary_changed');
    sql=sql.replace(ddl,'');
  }

  if(relativePath===v314) {
    const selector=v314Selector.join('\n');
    if(sql.split(selector).length!==2)throw Error('legacy_v320_constraint_replay_boundary_changed');
    sql=sql.replace(selector,()=>[
      v314Selector[0],
      "      AND NOT (constraint_value.conrelid='public.legacy_decision_revision_evaluations_v3_13'::regclass",
      "        AND constraint_value.conname='legacy_evaluation_schema_v314_check')",
      v314Selector[1],
    ].join('\n'));
  }
  // The pinned 3.19.1 file only replaces this check. The caller has locked
  // it already and verifies its original OID and definition before commit.
  return relativePath===v3191 ? 'SELECT 1;' : sql;
}
