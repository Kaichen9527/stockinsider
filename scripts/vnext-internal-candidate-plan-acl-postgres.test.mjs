import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { workerFixture } from './vnext-worker-fixture.mjs';
import { installRoutineSourcePrefix } from './vnext-routine-source-prefix-fixture.mjs';
import { rosterHeadFixtureSql } from './vnext-launch-roster-head-fixture.mjs';
import { readResearchPublicationCatalog } from './opportunity-v3/research-publication-catalog.mjs';
import { readTailNamespace } from './opportunity-v3/research-publication-tail-entry-namespace.mjs';
import { tailMetadataSha } from './opportunity-v3/research-publication-tail-entry-guard.mjs';
import { inspectHardenedSourceNamespaceReview, SOURCE_SCOPE_SQL, sourceNamespaceReachability } from './vnext-source-namespace-candidate.mjs';

const planner = 'public.opportunity_candidate_plan_v3_internal(uuid,text)';
const historicalFunctionSha256 = 'ad26cb165d6a67bdb2c8e3a38d204c3af3a3be67d180a72c4012faa1b00c32db';
const principals = [
  'anon', 'authenticated', 'opportunity_v3_rpc_owner', 'service_role', 'research_source_fence_owner_v2',
];

async function readAcl(observer) {
  const { rows: [result] } = await observer.query(`
    SELECT oid::text, to_jsonb(p) - 'proacl' AS definition,
      encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') AS "functionSha256",
      ARRAY(SELECT role FROM unnest($2::text[]) role WHERE has_function_privilege(role, p.oid, 'EXECUTE')) AS executable,
      ARRAY(
        SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END
        FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.privilege_type='EXECUTE'
        ORDER BY 1
      ) AS acl
    FROM pg_proc p WHERE p.oid = $1::regprocedure`, [planner, principals]);
  return result;
}

async function privilegedCaller(fixture, role) {
  assert.ok(['service_role', 'opportunity_v3_rpc_owner'].includes(role));
  const connection = await fixture.connect();
  try {
    await connection.query('BEGIN READ ONLY');
    await connection.query('SET LOCAL ROLE ' + role);
    // The empty fixture has no such run. This fixed result confirms execution
    // reached the unchanged planner without reading any candidate data.
    await assert.rejects(connection.query(`
      SELECT count(*) FROM public.opportunity_candidate_plan_v3_internal(
        '00000000-0000-0000-0000-000000000000'::uuid, 'active'
      )`), { code: 'P0002' });
  } finally {
    await connection.query('ROLLBACK');
    await fixture.close(connection);
  }
}


const subscriberProbe = 'public.is_subscriber()';
const subscriberIdentity = '00000000-0000-4000-8000-000000000241';
const readerIdentity = '00000000-0000-4000-8000-000000000242';

async function subscriptionReaders(fixture) {
  const cases = [
    {role:'anon', subject:'', subscribed:false, reports:['public']},
    {role:'authenticated', subject:readerIdentity, subscribed:false, reports:['members','public']},
    {role:'authenticated', subject:subscriberIdentity, subscribed:true, reports:['members','public','subscribers']},
    {role:'service_role', subject:'', subscribed:false, reports:['members','public','subscribers']},
  ];
  for (const login of cases) {
    const c = await fixture.connect();
    try {
      await c.query('BEGIN READ ONLY');
      await c.query('SET LOCAL ROLE ' + login.role);
      await c.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role',$2,true)",
        [login.subject,login.role]);
      const {rows:[result]} = await c.query(
        'SELECT public.is_subscriber() AS subscribed, ARRAY (SELECT text FROM public.daily_catalysts WHERE text = ANY ($1::text[]) ORDER BY text) AS reports',
        [['members','public','subscribers']],
      );
      assert.deepEqual(result,{subscribed:login.subscribed,reports:login.reports});
    } finally {
      await c.query('ROLLBACK');
      await fixture.close(c);
    }
  }
}

async function subscriberState(fixture) {
  const query = `SELECT oid::text, to_jsonb(p)-'proacl'-'proconfig' AS definition, p.proconfig AS config,
    has_function_privilege('research_source_fence_owner_v2',p.oid,'EXECUTE') AS "sourceExecute",
    has_schema_privilege('research_source_fence_owner_v2','public','USAGE') AS "sourceUsage",
    ARRAY(
      SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.privilege_type='EXECUTE' ORDER BY 1
    ) AS grantees
  FROM pg_proc p WHERE p.oid=$1::regprocedure`;
  const {rows:[row]} = await fixture.observer.query(query,[subscriberProbe]);
  return row;
}

async function testSubscriberScope(t, fixture) {
  await fixture.writer.query('INSERT INTO auth.users(id) VALUES ($1),($2)',[subscriberIdentity,readerIdentity]);
  await fixture.writer.query(
    'INSERT INTO public.profiles(user_id,is_subscriber) VALUES ($1,true),($2,false) ON CONFLICT (user_id) DO UPDATE SET is_subscriber=EXCLUDED.is_subscriber',
    [subscriberIdentity,readerIdentity],
  );
  await fixture.writer.query(`
    WITH fixtures AS (
      INSERT INTO public.reports(report_type,visibility,title,slug,date)
      SELECT 'top10_daily', name, 'Synthetic role fixture', 'scope-fixture-' || name, DATE '2026-10-22'
      FROM unnest(ARRAY['public','members','subscribers']) AS kinds(name)
      RETURNING id,visibility
    )
    INSERT INTO public.daily_catalysts(report_id,text) SELECT id,visibility FROM fixtures`);
  const before = await subscriberState(fixture);
  const rows = await fixture.snapshot();
  assert.equal(before.config,null);
  assert.equal(before.sourceExecute,true);
  assert.equal(before.sourceUsage,false);
  assert.deepEqual(before.grantees,['PUBLIC','anon','authenticated','postgres','service_role']);

  await t.test('legacy reports preserve access for web roles and service before the ACL change',async () => {
    await subscriptionReaders(fixture);
  });
  await t.test('withdraw the inherited subscriber lookup without granting source schema access',async () => {
    const sql = readFileSync(new URL('../migrations/20261117_44_vnext_legacy_subscription_acl_v1.sql',import.meta.url),'utf8');
    await fixture.writer.query(sql);
    const after = await subscriberState(fixture);
    assert.equal(after.oid,before.oid);
    assert.deepEqual(after.definition,before.definition);
    assert.deepEqual(after.config,['search_path=pg_catalog']);
    assert.equal(after.sourceExecute,false);
    assert.equal(after.sourceUsage,false);
    assert.deepEqual(after.grantees,['anon','authenticated','postgres','service_role']);
    assert.deepEqual(await fixture.snapshot(),rows);
  });
  await t.test('legacy report RLS and subscriber lookup preserve all four caller cases',async () => {
    await subscriptionReaders(fixture);
    fixture.save('legacy-subscriber-acl-safe',{
      functionBodyRetained:true,independentSearchPath:true,sourceOwnerCanExecute:false,sourceSchemaUsage:false,
      legacyCallerCases:4,accessSurface:'report helpers and row security',synthetic:true,
    });
  });
}


async function checkAuthProfileTriggerBoundary(fixture) {
  const scope = ['anon', 'authenticated', 'service_role', 'research_source_fence_owner_v2'];
  const read = async () => {
    const { rows: [state] } = await fixture.observer.query(`
      SELECT p.oid::text, pg_get_functiondef(p.oid) AS definition,
        ARRAY(SELECT name FROM unnest($1::text[]) name WHERE has_function_privilege(name, p.oid, 'EXECUTE')) AS executable,
        ARRAY(SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END
          FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          WHERE a.privilege_type = 'EXECUTE' ORDER BY 1) AS grants,
        (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgfoid = p.oid) AS bindings
      FROM pg_proc p WHERE p.oid = 'public.handle_new_user()'::regprocedure`, [scope]);
    return state;
  };
  const signup = async () => {
    const userId = '00000000-0000-4000-8000-000000000270';
    await fixture.writer.query('BEGIN');
    try {
      await fixture.writer.query('INSERT INTO auth.users(id,raw_user_meta_data) VALUES ($1,$2::jsonb)',
        [userId, JSON.stringify({ display_name: 'Synthetic signup profile' })]);
      const { rows: [profile] } = await fixture.writer.query(
        'SELECT display_name, role, is_subscriber FROM public.profiles WHERE user_id = $1', [userId]);
      assert.deepEqual(profile, { display_name: 'Synthetic signup profile', role: 'Member', is_subscriber: false });
    } finally {
      await fixture.writer.query('ROLLBACK');
    }
  };

  const rows = await fixture.snapshot();
  const before = await read();
  assert.deepEqual(before.executable, scope);
  assert.deepEqual(before.grants, ['PUBLIC', 'anon', 'authenticated', 'postgres', 'service_role']);
  await signup();

  const migration = readFileSync(new URL('../migrations/20261117_46_vnext_auth_profile_trigger_acl_v1.sql', import.meta.url), 'utf8');
  await fixture.writer.query(migration);
  const after = await read();
  assert.deepEqual(after, { ...before, executable: [], grants: ['postgres'] });
  await signup();
  assert.deepEqual(await fixture.snapshot(), rows);
  fixture.save('auth-profile-trigger-acl-safe', {
    sourceOwnerCouldExecuteUnderFunctionAclBefore: true,
    effectiveExecuteDeniedAfter: scope,
    procedureIdentityAndBodyRetained: true,
    installedTriggerBindingsRetained: true,
    syntheticAuthProfileBeforeAfter: true,
    allPublicRowsUnchanged: true,
    sourceNamespaceGrantApplied: false,
  });
}

async function checkSourceGuardTriggerBoundary(fixture) {
  const sourceOwner = 'research_source_fence_owner_v2';
  const runtimeRoles = ['anon', 'authenticated', 'service_role', sourceOwner];
  const signatures = [
    'public.enforce_production_writer_fence()',
    'public.fence_research_paper_book_append_v1()',
    'public.fence_research_strategy_record_v1()',
  ];
  const inventory = async () => {
    const { rows } = await fixture.observer.query(`
      SELECT signatures.name, p.oid::text, pg_get_functiondef(p.oid) AS definition,
        ARRAY(SELECT name FROM unnest($2::text[]) name WHERE has_function_privilege(name, p.oid, 'EXECUTE')) AS executable,
        (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgfoid = p.oid) AS bindings
      FROM unnest($1::text[]) WITH ORDINALITY signatures(name, position)
      JOIN pg_proc p ON p.oid = to_regprocedure(signatures.name)
      ORDER BY signatures.position`, [signatures, runtimeRoles]);
    return rows;
  };
  const foreignDefiners = async () => {
    const { rows } = await fixture.observer.query(`
      SELECT p.oid::regprocedure::text AS signature FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proowner <> $1::regrole
        AND has_function_privilege($1, p.oid, 'EXECUTE')
      ORDER BY 1`, [sourceOwner]);
    return rows.map(row => row.signature);
  };
  const exerciseBusinessGuards = async () => {
    const writer = fixture.writer;
    const strategy = 'a'.repeat(64);
    const paper = 'b'.repeat(64);
    await writer.query('BEGIN');
    try {
      await writer.query('SET LOCAL ROLE service_role');
      const proposal = hash => writer.query(`
        INSERT INTO public.research_strategy_records_v1(record_hash, kind, proposal_hash, payload, input_hash, input_payload)
        VALUES ($1, 'proposal', $1, '{}'::jsonb, $1, '{}'::jsonb)`, [hash]);
      const paperRevision = (revision, parent) => writer.query(`
        INSERT INTO public.research_paper_book_revisions_v1(revision_hash, book_id, parent_hash, operation_key, input_hash, state, result)
        VALUES ($1, 'growth', $2, $1, $1, '{"bookId":"growth"}'::jsonb, '{}'::jsonb)`, [revision, parent]);
      assert.equal((await proposal(strategy)).rowCount, 1);
      assert.equal((await paperRevision(paper, null)).rowCount, 1);

      await writer.query('SAVEPOINT before_strategy_denial');
      await assert.rejects(proposal('c'.repeat(64)), { message: 'research_strategy_weekly_hypothesis_cap' });
      await writer.query('ROLLBACK TO SAVEPOINT before_strategy_denial');
      await assert.rejects(paperRevision('d'.repeat(64), null), { message: 'research_paper_book_head_changed' });
    } finally {
      await writer.query('ROLLBACK');
    }
  };

  const rows = await fixture.snapshot();
  const before = await inventory();
  assert.deepEqual(before.map(row => row.name), signatures);
  for (const row of before) {
    assert.deepEqual(row.executable, runtimeRoles);
    assert.ok(row.bindings.length > 0);
  }
  assert.deepEqual(await foreignDefiners(), signatures.map(signature => signature.replace(/^public\./u, '')));
  await exerciseBusinessGuards();

  const migration = readFileSync(new URL('../migrations/20261117_47_vnext_source_guard_trigger_acl_v1.sql', import.meta.url), 'utf8');
  await fixture.writer.query(migration);
  assert.deepEqual(await inventory(), before.map(row => ({ ...row, executable: [] })));
  assert.deepEqual(await foreignDefiners(), []);
  await exerciseBusinessGuards();
  assert.deepEqual(await fixture.snapshot(), rows);
  fixture.save('source-guard-trigger-acl-safe', {
    existingBindingsByFunction: Object.fromEntries(before.map(row => [row.name, row.bindings.length])),
    procedureIdentityDefinitionAndBindingsRetained: true,
    effectiveExecuteDeniedAfter: runtimeRoles,
    sourceOwnerNonOwnedPublicDefinersAfter: [],
    strategyWeeklyLimitAndPaperLineageRetained: true,
    allPublicRowsUnchanged: true,
    sourceNamespaceGrantApplied: false,
  });
}

async function checkSourceOwnerBoundary(fixture) {
  const observer = fixture.observer;
  await observer.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const queries = `SELECT jsonb_build_object('role',r.rolname,'login',r.rolcanlogin,'superuser',r.rolsuper,
 'bypassRls',r.rolbypassrls,
 'membershipsOut',(SELECT count(*) FROM pg_auth_members WHERE member=r.oid),
 'membershipsIn',(SELECT count(*) FROM pg_auth_members WHERE roleid=r.oid),
 'publicUsage', has_schema_privilege(r.oid,'public','USAGE'),
 'publicCreate', has_schema_privilege(r.oid,'public','CREATE'),
 'publicCallableDefiners',(SELECT jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text) FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace AND p.prosecdef AND p.prokind='f' AND p.prorettype NOT IN ('pg_catalog.trigger'::regtype,'pg_catalog.event_trigger'::regtype)
     AND has_function_privilege(r.oid,p.oid,'EXECUTE'))) FROM pg_roles r WHERE r.rolname='research_source_fence_owner_v2';
WITH rights AS MATERIALIZED (
 SELECT relname,relrowsecurity AS rls,relforcerowsecurity AS forced,relowner=(SELECT oid FROM pg_roles WHERE rolname='research_source_fence_owner_v2') as owned,
 ARRAY(SELECT p FROM unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p WHERE has_any_column_privilege('research_source_fence_owner_v2',c.oid,p))
 || ARRAY(SELECT p FROM unnest(ARRAY['DELETE','TRUNCATE','TRIGGER','MAINTAIN']) p WHERE has_table_privilege('research_source_fence_owner_v2',c.oid,p)) AS rights
 FROM pg_class c WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p','v','m','f')
)
SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY relname),'[]') FROM rights v WHERE cardinality(rights)>0;
SELECT coalesce(jsonb_agg(jsonb_build_object('name',relname,'usage',has_sequence_privilege('research_source_fence_owner_v2',c.oid,'USAGE'),
 'select',has_sequence_privilege('research_source_fence_owner_v2',c.oid,'SELECT'),'update',has_sequence_privilege('research_source_fence_owner_v2',c.oid,'UPDATE')) ORDER BY relname),'[]')
 FROM pg_class c WHERE relnamespace='public'::regnamespace AND relkind='S'
 AND CASE WHEN relkind='S' THEN has_sequence_privilege('research_source_fence_owner_v2',c.oid,'USAGE,SELECT,UPDATE') ELSE false END;
SELECT jsonb_build_object(
 'publicOperators',(SELECT count(*) FROM pg_operator WHERE oprnamespace='public'::regnamespace),
 'publicCallableCastFunctions',(SELECT count(*) FROM pg_cast c JOIN pg_proc p ON p.oid=c.castfunc WHERE p.pronamespace='public'::regnamespace),
 'publicTypesWithNonCatalogInput',(SELECT count(*) FROM pg_type t JOIN pg_proc p ON p.oid=t.typinput WHERE t.typnamespace='public'::regnamespace AND p.pronamespace<>'pg_catalog'::regnamespace));`;
    const answers = await observer.query(queries);
    const [role, relationAccess, sequences, callAdapters] = answers.map(result => Object.values(result.rows[0])[0]);
    assert.deepEqual(role, {
      role: 'research_source_fence_owner_v2',
      login: false, bypassRls: false, superuser: false,
      publicUsage: false, publicCreate: false, membershipsIn: 0, membershipsOut: 0,
      publicCallableDefiners: [
        'assert_research_source_seal_v2(uuid)',
        'research_publication_source_state_v2(uuid)',
        'seal_research_sources_v2(jsonb,timestamp with time zone)',
      ],
    });

    const ownedRights = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES', 'DELETE', 'TRUNCATE', 'TRIGGER', 'MAINTAIN'];
    const sourceRelations = [
      'research_source_fence_events_v2', 'research_source_seal_invalidations_v2', 'research_source_seals_v2',
    ];
    assert.deepEqual(relationAccess, [
      ...sourceRelations.map(relname => ({ relname, rls: true, owned: true, forced: false, rights: ownedRights })),
      { relname: 'source_raw_documents', rls: false, owned: false, forced: false, rights: ['SELECT'] },
    ]);
    assert.deepEqual(sequences, [
      { name: 'research_source_fence_events_v2_event_id_seq', usage: true, select: true, update: true },
    ]);
    assert.deepEqual(callAdapters, { publicOperators: 0, publicCallableCastFunctions: 0, publicTypesWithNonCatalogInput: 0 });
    const { rows: receiptRelations } = await observer.query(`
      SELECT c.relname AS name,
        ARRAY(SELECT a.attname::text FROM pg_attribute a
          WHERE a.attrelid = c.oid AND a.attidentity <> '' ORDER BY a.attnum) AS identities,
        ARRAY(SELECT a.attname || '=' || pg_get_expr(d.adbin, d.adrelid)
          FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
          WHERE d.adrelid = c.oid ORDER BY a.attnum) AS defaults,
        ARRAY(SELECT k.confrelid::regclass::text FROM pg_constraint k
          WHERE k.conrelid = c.oid AND k.contype = 'f' ORDER BY 1) AS "foreignKeyTargets",
        (SELECT count(*)::int FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'f'
          AND (k.confupdtype <> 'a' OR k.confdeltype <> 'a')) AS "cascadingForeignKeys",
        coalesce((SELECT jsonb_agg(jsonb_build_object('name', pol.polname, 'command', pol.polcmd,
          'roles', ARRAY(SELECT CASE WHEN role.oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role.oid)::text END
            FROM unnest(pol.polroles) role(oid) ORDER BY 1),
          'using', pg_get_expr(pol.polqual, pol.polrelid), 'check', pg_get_expr(pol.polwithcheck, pol.polrelid)) ORDER BY pol.polname)
          FROM pg_policy pol WHERE pol.polrelid = c.oid), '[]'::jsonb) AS policies,
        (SELECT count(*)::int FROM pg_rewrite rule WHERE rule.ev_class = c.oid) AS rules,
        (SELECT count(*)::int FROM pg_index i WHERE i.indrelid = c.oid
          AND (i.indexprs IS NOT NULL OR i.indpred IS NOT NULL)) AS "expressionOrPartialIndexes",
        (SELECT jsonb_agg(jsonb_build_object('function', p.oid::regprocedure::text, 'securityDefiner', p.prosecdef,
          'definitionSha256', encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex'),
          'eventMask', t.tgtype::int, 'enabled', t.tgenabled) ORDER BY t.tgname)
          FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE t.tgrelid = c.oid AND NOT t.tgisinternal) AS "userTriggers"
      FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1::text[])
      ORDER BY c.relname`, [sourceRelations]);
    assert.deepEqual(receiptRelations.map(row => row.name), sourceRelations);
    assert.deepEqual(receiptRelations.map(row => row.identities), [['event_id'], [], []]);
    assert.deepEqual(receiptRelations.map(row => row.defaults), [
      ['recorded_at=clock_timestamp()'], [], ['seal_id=gen_random_uuid()', 'received_at=clock_timestamp()'],
    ]);
    assert.deepEqual(receiptRelations.map(row => row.foreignKeyTargets), [
      [], ['research_source_fence_events_v2', 'research_source_seals_v2'], [],
    ]);
    assert.deepEqual(receiptRelations.map(row => row.policies), [[], [], [{
      name: 'input_preparation_seal_read_v2', command: 'r', roles: ['research_input_preparation_owner_v2'],
      using: 'true', check: null,
    }]]);
    for (const row of receiptRelations) {
      assert.equal(row.cascadingForeignKeys, 0);
      assert.equal(row.rules, 0);
      assert.equal(row.expressionOrPartialIndexes, 0);
      assert.equal(row.userTriggers.length, 1);
      const [{ definitionSha256, ...trigger }] = row.userTriggers;
      assert.match(definitionSha256, /^[0-9a-f]{64}$/u);
      assert.deepEqual(trigger, {
        function: 'reject_research_source_receipt_mutation_v2()', securityDefiner: false, eventMask: 27, enabled: 'O',
      });
    }
    fixture.save('source-receipt-dependencies-safe', {
      scope: 'installed catalog, read-only repeatable-read transaction',
      receiptRelations,
      nativeSourceGrantExecuted: false,
    });
    fixture.save('source-owner-boundary-safe', {
      role, relationAccess, sequences, callAdapters,
      transaction: 'repeatable read read only',
      reachesLegacySubscriberOrPlanner: false,
      namespaceGrantApplied: false,
    });
  } finally {
    await observer.query('ROLLBACK');
  }
}



// Pin the source-owner bodies used by the fence. pg_depend alone cannot
// identify the table and helper calls inside these PL/pgSQL bodies.
const sourceFencePaths = [
  {
    signature: 'assert_research_source_seal_v2(uuid)',
    definitionSha256: '06aed61305eb8754a80733518a815953c9b79160bb20b7572fb399e561498199',
    reads: ['research_source_seal_invalidations_v2', 'research_source_seals_v2', 'source_raw_documents'],
    writes: [], calls: [],
  },
  {
    signature: 'research_publication_source_state_v2(uuid)',
    definitionSha256: '0ad5b0a448cf657c188b7a099149c70b4bc0532c6a822bd8738a5a61ffe3a3c0',
    reads: ['research_source_seal_invalidations_v2'], writes: [], calls: [],
  },
  {
    signature: 'research_source_fence_record_v2()',
    definitionSha256: '52d26abb8b812beec884a8267d40a3ef547ae6e3a3a4df528c6a6d8bfe70e7f1',
    reads: ['research_source_seals_v2'],
    writes: ['research_source_fence_events_v2', 'research_source_seal_invalidations_v2'],
    calls: ['research_source_root_v2(jsonb)'],
  },
  {
    signature: 'research_source_fence_write_v2()',
    definitionSha256: 'fe8339c551f7c809da1f67fb438787bb296133fead41f4f07b3284196aa81522',
    reads: [], writes: [], calls: [],
  },
  {
    signature: 'seal_research_sources_v2(jsonb,timestamp with time zone)',
    definitionSha256: 'ff4eb006af3bde82a86a640ac8126083d78684ea6bc2947100d0f8a2ed618479',
    reads: ['research_source_seal_invalidations_v2', 'research_source_seals_v2', 'source_raw_documents'],
    writes: ['research_source_seals_v2'], calls: ['research_source_root_v2(jsonb)'],
  },
];
const sourceRootHelper = {
  signature: 'research_source_root_v2(jsonb)',
  definitionSha256: 'ada9281b7cd0673b2d4adb9e2c7be673f3959bbff3733117e50d362a569159bc',
  securityDefiner: false,
  settings: ['search_path=pg_catalog'],
};

async function checkSourceFenceExecutionPaths(fixture, observer, candidate) {
  const { rows: ownedRoutines } = await observer.query(`
    SELECT p.oid::regprocedure::text AS signature, p.prosecdef AS "securityDefiner",
      p.proconfig AS settings,
      encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') AS "definitionSha256"
    FROM pg_proc p
    WHERE p.proowner = $1::regrole AND p.prokind = 'f'
    ORDER BY signature`, [candidate.reviewedTarget]);
  assert.deepEqual(ownedRoutines, sourceFencePaths.map(({ signature, definitionSha256 }) => ({
    signature, definitionSha256, securityDefiner: true, settings: ['search_path=pg_catalog, public'],
  })));

  const { rows: [helper] } = await observer.query(`
    SELECT p.oid::regprocedure::text AS signature, p.prosecdef AS "securityDefiner",
      p.proconfig AS settings,
      encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') AS "definitionSha256"
    FROM pg_proc p WHERE p.oid = 'public.research_source_root_v2(jsonb)'::regprocedure`);
  assert.deepEqual(helper, sourceRootHelper);
  const { rows: inbound } = await observer.query(`
    SELECT p.proname AS routine, t.tgname AS trigger, t.tgenabled AS enabled, t.tgtype::int AS mask
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.source_raw_documents'::regclass
      AND p.proowner = $1::regrole ORDER BY t.tgname`, [candidate.reviewedTarget]);
  assert.deepEqual(inbound, [
    { routine: 'research_source_fence_record_v2', trigger: 'research_source_fence_record_v2', enabled: 'O', mask: 29 },
    { routine: 'research_source_fence_write_v2', trigger: 'research_source_fence_truncate_v2', enabled: 'O', mask: 34 },
    { routine: 'research_source_fence_write_v2', trigger: 'research_source_fence_write_v2', enabled: 'O', mask: 31 },
  ]);

  const { rows: checks } = await observer.query(`
    SELECT c.confrelid::regclass::text AS "references",
      n.nspname AS schema, p.proname AS handler, l.lanname AS language, t.tgenabled AS enabled
    FROM pg_constraint c
    JOIN pg_trigger t ON t.tgconstraint = c.oid AND t.tgrelid = c.conrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE c.conrelid = 'public.research_source_seal_invalidations_v2'::regclass
      AND c.contype = 'f' AND t.tgisinternal AND (t.tgtype & 4) <> 0
    ORDER BY "references"`);
  assert.deepEqual(checks, ['research_source_fence_events_v2', 'research_source_seals_v2'].map(relation => ({
    references: relation, schema: 'pg_catalog', handler: 'RI_FKey_check_ins', language: 'internal', enabled: 'O',
  })));

  const roles = ['anon', 'authenticated', 'service_role'];
  const { rows: capabilities } = await observer.query(`
    SELECT p.oid::regprocedure::text AS signature,
      ARRAY(SELECT name FROM unnest($2::text[]) name
        WHERE has_function_privilege(name, p.oid, 'EXECUTE') ORDER BY name) AS callers
    FROM pg_proc p
    WHERE p.proowner = $1::regrole AND p.prokind = 'f' ORDER BY signature`, [candidate.reviewedTarget, roles]);
  assert.deepEqual(capabilities, sourceFencePaths.map(({ signature }) => ({
    signature, callers: signature.startsWith('seal_research_sources_v2(') ? ['service_role'] : [],
  })));

  fixture.save('source-fence-execution-paths-safe', {
    scope: 'read-only exact hardened routine fixture',
    routineBodiesBoundBySha256: sourceFencePaths,
    helper, inbound, insertForeignKeyHandlers: checks, browserAndBackendCallers: capabilities,
    schemaGrantExecuted: false, independentReviewAccepted: false,
  });
}

async function checkRawWriteRequiresNamespace(fixture) {
  const release = 'a'.repeat(40);
  const lease = '00000000-0000-4000-8000-000000000260';
  const before = await fixture.snapshot();
  const writer = await fixture.connect();
  try {
    await writer.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await writer.query(
      "INSERT INTO public.production_writer_releases(release_id,writer_kind,active,activated_at) VALUES($1,'vps',true,clock_timestamp())",
      [release],
    );
    await writer.query('SET LOCAL ROLE service_role');
    await writer.query("SELECT set_config('request.headers',$1,true), set_config('request.jwt.claims',$2,true)", [
      JSON.stringify({'x-stockinsider-writer-release':release}), JSON.stringify({role:'service_role'}),
    ]);
    const { rows: [acquire] } = await writer.query(
      "SELECT current_user AS role, public.acquire_production_write_lease('production-data-plane',$1::uuid,300) AS acquired",
      [lease],
    );
    assert.deepEqual(acquire, { role: 'service_role', acquired: true });

    const write = writer.query(`
      INSERT INTO public.source_raw_documents(platform,document_url,title,content_text,published_at,collected_at,symbols,metadata)
      VALUES('twse_insider','https://www.twse.com.tw/synthetic-acl-boundary-only','Synthetic ACL regression fixture',
        'Synthetic source used only in the local transaction.',clock_timestamp(),clock_timestamp(),'["2409"]'::jsonb,
        jsonb_build_object('original_event_at',clock_timestamp()))`);
    await assert.rejects(write, error => {
      assert.equal(error.code, '42501');
      assert.equal(error.message, 'permission denied for schema public');
      assert.match(error.where, /PL\/pgSQL function (?:public\.)?research_source_fence_record_v2\(\) line /u);
      assert.match(error.internalQuery, /public\.research_source_root_v2\(/u);
      return true;
    });
  } finally {
    await writer.query('ROLLBACK');
    await fixture.close(writer);
  }
  assert.deepEqual(await fixture.snapshot(), before);

  const names = [
    'public.research_source_fence_write_v2()', 'public.research_source_fence_record_v2()',
    'public.research_source_root_v2(jsonb)', 'public.seal_research_sources_v2(jsonb,timestamptz)',
    'public.assert_research_source_seal_v2(uuid)', 'public.research_publication_source_state_v2(uuid)',
  ];
  const { rows: definitions } = await fixture.observer.query(`
    SELECT name, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS "securityDefiner",
      p.prorettype::regtype::text AS "resultType", p.proconfig AS settings,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS "definitionSha256"
    FROM unnest($1::text[]) WITH ORDINALITY calls(name,position)
    JOIN pg_proc p ON p.oid=to_regprocedure(name)
    ORDER BY position`, [names]);
  assert.deepEqual(definitions.map(definition => definition.name), names);
  assert.deepEqual(definitions.filter(definition => definition.resultType === 'trigger').map(definition => definition.name),
    names.slice(0,2));
  for (const definition of definitions) {
    assert.equal(definition.securityDefiner, definition.name !== 'public.research_source_root_v2(jsonb)');
    if (definition.securityDefiner) assert.equal(definition.owner, 'research_source_fence_owner_v2');
  }
  fixture.save('source-writer-namespace-block-safe', {
    scope: 'Contabo PostgreSQL 17.11 disposable synthetic original',
    writerRole: 'service_role', writerLeaseAcquired: true, errorCode: '42501',
    missingPrivilege: 'public schema USAGE for the source trigger owner',
    trigger: 'research_source_fence_record_v2',
    firstRejectedCall: 'public.research_source_root_v2(jsonb)',
    transactionRolledBack: true, allPublicTableRowsUnchanged: true, definitions,
    sourceGrantExecuted: false, realSourceProcessed: false,
  });
}

async function checkPodcastStorageBoundary(fixture) {
  const writer = fixture.writer;
  const episodeId = '00000000-0000-4000-8000-000000000280';
  const privatePhrase = 'synthetic private transcript';
  const serviceRoundTrip = async () => {
    await writer.query('BEGIN');
    try {
      await writer.query('SET LOCAL ROLE service_role');
      await writer.query(`
        INSERT INTO public.podcast_episodes(id, platform, podcast_name, episode_title, episode_url)
        VALUES ($1, 'rss', 'Synthetic podcast', 'Synthetic episode', 'https://creator.example/episode/1')`, [episodeId]);
      await writer.query(`
        INSERT INTO public.podcast_transcripts(podcast_episode_id, transcript_text, transcript_source)
        VALUES ($1, $2, 'manual')`, [episodeId, privatePhrase]);
      const { rows: [row] } = await writer.query(`
        UPDATE public.podcast_transcripts SET confidence = 0.7
        WHERE podcast_episode_id = $1 RETURNING transcript_text`, [episodeId]);
      assert.deepEqual(row, { transcript_text: privatePhrase });
      const { rows: [episode] } = await writer.query(
        'SELECT platform FROM public.podcast_episodes WHERE id = $1', [episodeId]);
      assert.deepEqual(episode, { platform: 'rss' });
    } finally {
      await writer.query('ROLLBACK');
    }
  };

  const before = await fixture.snapshot();
  await serviceRoundTrip();
  const migration = readFileSync(new URL('../migrations/20261117_48_vnext_podcast_private_acl_v1.sql', import.meta.url), 'utf8');
  await writer.query(migration);
  const { rows: rls } = await fixture.observer.query(`
    SELECT relname AS name, relrowsecurity AS enabled FROM pg_class
    WHERE oid IN ('public.podcast_episodes'::regclass, 'public.podcast_transcripts'::regclass) ORDER BY relname`);
  assert.deepEqual(rls, [
    { name: 'podcast_episodes', enabled: true }, { name: 'podcast_transcripts', enabled: true },
  ]);
  for (const role of ['anon', 'authenticated']) {
    const reader = await fixture.connect();
    try {
      await reader.query('SET ROLE ' + role);
      await assert.rejects(reader.query('SELECT metadata FROM public.podcast_episodes LIMIT 1'), { code: '42501' });
      await assert.rejects(reader.query('SELECT transcript_text FROM public.podcast_transcripts LIMIT 1'), { code: '42501' });
    } finally {
      await fixture.close(reader);
    }
  }
  await serviceRoundTrip();
  assert.deepEqual(await fixture.snapshot(), before);
  fixture.save('podcast-storage-private-acl-safe', {
    tablesWithRls: rls.map(table => table.name),
    deniedTableReads: 4,
    serviceReadWriteBeforeAndAfter: true,
    allPublicRowsUnchanged: true,
    productionApplied: false,
  });
}

async function readPredecessorCatalog(observer) {
  await observer.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const { rows: [{ scope }] } = await observer.query(SOURCE_SCOPE_SQL);
    return { scope, namespace: await readTailNamespace(observer), catalog: await readResearchPublicationCatalog(observer, scope) };
  } finally {
    await observer.query('ROLLBACK');
  }
}

function assertSourceHardeningCatalogDelta(fixture, before, after) {
  const expectedSignatures = [
    'enforce_production_writer_fence()',
    'fence_research_paper_book_append_v1()',
    'fence_research_strategy_record_v1()',
    'handle_new_user()',
    'is_subscriber()',
    'opportunity_candidate_plan_v3_internal(uuid,text)',
  ];
  const allowedFields = (row, namespace) => {
    const fields = namespace ? ['acl'] : ['acl', 'effectiveAcl'];
    if (row.signature === 'is_subscriber()') {
      fields.push('config');
      if (!namespace) fields.push('definitionSha256');
    }
    return fields;
  };

  const normalize = (previous, current, namespace) => {
    const changed = [];
    const restored = current.map((row, index) => {
      if ((namespace && row.schema !== 'public') || !expectedSignatures.includes(row.signature)) return row;
      const old = previous[index];
      assert.equal(row.signature, old.signature);
      const fields = allowedFields(row, namespace);
      assert.notDeepEqual(row.acl, old.acl, 'expected the targeted execute ACL to change');
      changed.push(row.signature);
      return { ...row, ...Object.fromEntries(fields.map(field => [field, old[field]])) };
    });
    assert.deepEqual(changed.sort(), expectedSignatures);
    return restored;
  };

  assert.deepEqual(after.scope, before.scope);
  assert.deepEqual({
    ...after.namespace, routines: normalize(before.namespace.routines, after.namespace.routines, true),
  }, before.namespace);
  assert.deepEqual({
    ...after.catalog, functions: normalize(before.catalog.functions, after.catalog.functions, false),
  }, before.catalog);
  assert.deepEqual(after.catalog.functions.find(row => row.signature === 'is_subscriber()').config,
    ['search_path=pg_catalog']);

  const digests = snapshot => Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key + 'Hash', tailMetadataSha(value)]));
  fixture.save('source-exact-predecessor-acl-delta-safe', {
    before: digests(before), after: digests(after),
    changedSignatures: expectedSignatures,
    rowAndTableAccessMetadataRetained: true,
    triggerBindingMetadataRetained: true,
    roleAndSchemaAccessRetained: true,
    sourceNamespaceGrantApplied: false,
    scope: 'isolated synthetic full routine predecessor with roster fixtures',
  });
}

test('planner and legacy report ACLs preserve their existing web and backend calls', async t => {
  const fixture = await workerFixture();
  try {
    await fixture.install();
    await installRoutineSourcePrefix(fixture);
    sourceNamespaceReachability(await readPredecessorCatalog(fixture.observer));
    const rosterHead = rosterHeadFixtureSql();
    await fixture.writer.query(rosterHead.predecessor);
    await fixture.writer.query(rosterHead.migration);
    const predecessor = await readPredecessorCatalog(fixture.observer);
    const before = await readAcl(fixture.observer);
    assert.equal(before.functionSha256, historicalFunctionSha256);
    assert.ok(before.acl.includes('PUBLIC'));
    const original = await fixture.snapshot();
    await t.test('both existing trusted identities reach the fixed synthetic empty-run check', async () => {
      await privilegedCaller(fixture, 'service_role');
      await privilegedCaller(fixture, 'opportunity_v3_rpc_owner');
    });

    await t.test('only the exact planner ACL changes in the tested function', async () => {
      const migration = readFileSync(new URL('../migrations/20261117_42_vnext_internal_candidate_plan_acl_v1.sql', import.meta.url), 'utf8');
      await fixture.writer.query(migration);
      const after = await readAcl(fixture.observer);
      assert.equal(after.oid, before.oid);
      assert.deepEqual(after.definition, before.definition);
      assert.deepEqual(after.executable, ['opportunity_v3_rpc_owner', 'service_role']);
      assert.ok(!after.acl.includes('PUBLIC'));
      assert.deepEqual(await fixture.snapshot(), original);
      fixture.save('candidate-planner-acl-safe', {
        originalFunctionSha256: before.functionSha256,
        functionIdentityAndDefinitionRetained: true, tableRowsRetained: true,
        beforeEffective: before.executable, afterEffective: after.executable,
        publicExecuteAfter: false, synthetic: true,
      });
    });

    await t.test('both backend identities still execute the unchanged planner', async () => {
      await privilegedCaller(fixture, 'service_role');
      await privilegedCaller(fixture, 'opportunity_v3_rpc_owner');
    });
    await testSubscriberScope(t, fixture);
    await t.test('auth profile hook remains attached with runtime execution privileges removed', async () => {
      await checkAuthProfileTriggerBoundary(fixture);
    });
    await t.test('existing writer and research triggers retain their bindings while restricting execution', async () => {
      await checkSourceGuardTriggerBoundary(fixture);
    });
    await t.test('source role retains only its known public schema capabilities', async () => {
      await checkSourceOwnerBoundary(fixture);
    });
    await t.test('the complete predecessor catalog changes only the six targeted routines', async () => {
      assertSourceHardeningCatalogDelta(fixture, predecessor, await readPredecessorCatalog(fixture.observer));
    });
    await t.test('the hardened predecessor projects only non-grantable source schema usage with a read-only observer', async () => {
      await assert.rejects(inspectHardenedSourceNamespaceReview(fixture.observer), { code: 'ERR_ASSERTION' });
      await fixture.observer.query('BEGIN READ ONLY');
      try {
        await assert.rejects(inspectHardenedSourceNamespaceReview(fixture.observer), { code: 'ERR_ASSERTION' });
      } finally {
        await fixture.observer.query('ROLLBACK');
      }
      await fixture.observer.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const result = await inspectHardenedSourceNamespaceReview(fixture.observer);
        assert.equal(result.grantExecuted, false);
        assert.equal(result.independentReviewAccepted, false);
        assert.equal(result.forecast.namespaceHash, result.predecessor.namespaceHash);
        assert.notEqual(result.forecast.catalogHash, result.predecessor.catalogHash);
        assert.deepEqual(result.proposedPermission, ['public', 'USAGE']);
        fixture.save('source-namespace-hardened-review-safe', result);
        await checkSourceFenceExecutionPaths(fixture, fixture.observer, result);
      } finally {
        await fixture.observer.query('ROLLBACK');
      }
    });
    await t.test('podcast creator and member artifacts are private while the worker still writes', async () => {
      await checkPodcastStorageBoundary(fixture);
    });
    await t.test('an authorized source writer rolls back when the source trigger lacks the namespace prerequisite', async () => {
      await checkRawWriteRequiresNamespace(fixture);
    });
  } finally {
    await fixture.finish();
  }
});
