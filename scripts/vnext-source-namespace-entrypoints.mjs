import assert from 'node:assert/strict';
import { SOURCE_NAMESPACE_PROFILE } from './vnext-source-namespace-candidate.mjs';

const entrypointSql = `
  SELECT
    p.oid::regprocedure::text AS signature,
    pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS "securityDefiner",
    encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') AS "definitionSha256",
    lang.lanname AS language,
    CASE p.prorettype
      WHEN 'pg_catalog.trigger'::regtype THEN 'trigger'
      WHEN 'pg_catalog.event_trigger'::regtype THEN 'event_trigger'
      ELSE 'sql_callable'
    END AS "entryKind",
    ARRAY(
      SELECT CASE WHEN entry.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(entry.grantee) END
      FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) entry
      WHERE entry.privilege_type = 'EXECUTE'
      ORDER BY 1
    )::text[] AS "executeGrantees",
    ARRAY(
      SELECT DISTINCT pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid)
      FROM pg_depend d
      WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid
        AND d.refclassid IN ('pg_catalog.pg_proc'::regclass, 'pg_catalog.pg_class'::regclass,
          'pg_catalog.pg_type'::regclass, 'pg_catalog.pg_operator'::regclass)
      ORDER BY 1
    ) AS "recordedObjectDependencies",
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'schema', n.nspname, 'relation', c.relname, 'trigger', t.tgname,
        'activationMode', t.tgenabled, 'eventMask', t.tgtype::int,
        'sourceRoleCanInsert', has_any_column_privilege($1, c.oid, 'INSERT'),
        'sourceRoleCanUpdate', has_any_column_privilege($1, c.oid, 'UPDATE'),
        'sourceRoleCanDelete', has_table_privilege($1, c.oid, 'DELETE'),
        'sourceRoleCanTruncate', has_table_privilege($1, c.oid, 'TRUNCATE'),
        'sourceRoleCanDefineTrigger', has_table_privilege($1, c.oid, 'TRIGGER')
      ) ORDER BY n.nspname, c.relname, t.tgname)
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal AND t.tgfoid = p.oid
    ), '[]'::jsonb) AS "triggerBindings"
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language lang ON lang.oid = p.prolang
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND has_function_privilege($1, p.oid, 'EXECUTE')
  ORDER BY p.oid::regprocedure::text`;

/** Observe invocation paths on the same pinned fixture snapshot as the direct ACL report.
 * PostgreSQL only records dependencies visible to its catalog. Inspect the pinned
 * routine definitions separately for body calls, casts and dynamic SQL. */
export async function inspectSourceNamespaceEntrypoints(client, direct) {
  const { target } = SOURCE_NAMESPACE_PROFILE;
  assert.equal(direct.target, target);
  assert.equal(direct.directOnly, true);
  assert.equal(direct.grantExecuted, false);
  const { rows: [transaction] } = await client.query(
    `SELECT current_setting('transaction_read_only') AS access,
       current_setting('transaction_isolation') AS isolation,
       has_schema_privilege($1, 'public', 'USAGE') AS "publicUsage"`, [target],
  );
  assert.deepEqual(transaction, { access: 'on', isolation: 'repeatable read', publicUsage: false });

  const { rows } = await client.query(entrypointSql, [target]);
  assert.equal(rows.length, direct.routines.length);
  const expected = new Map(direct.routines.map(routine => [routine.signature, routine]));
  for (const row of rows) {
    const routine = expected.get(row.signature);
    assert.ok(routine, 'unexpected source owner routine');
    assert.equal(row.owner, routine.owner);
    assert.equal(row.securityDefiner, routine.securityDefiner);
    assert.equal(row.definitionSha256, routine.definitionSha256);
    assert.ok(Array.isArray(row.executeGrantees), 'untyped execute ACL returned');
    expected.delete(row.signature);
  }
  assert.equal(expected.size, 0);
  return {
    schema: 'vnext-source-owner-entrypoints-v1',
    target, observedPublicUsage: false, routines: rows,
    catalogDependenciesArePartial: true, routineBodiesPublished: false, grantExecuted: false,
  };
}
