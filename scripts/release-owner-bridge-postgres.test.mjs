import assert from 'node:assert/strict';
import { execFileSync,spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrationBodyInAtomicTransaction } from './opportunity-v3/atomic-migration-chain.mjs';
import { reviewedMigrationIsSuperseded,assertExistingRuntimeRoleContract } from './opportunity-v3/apply-reviewed-migrations.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=spawnSync('pg_config',['--bindir'],{encoding:'utf8'});
const binaries=config.status===0 ? config.stdout.trim() : '';
const available=!!binaries && ['initdb','pg_ctl','psql'].every((name)=>fs.existsSync(path.join(binaries,name)));
const bridge=migrationBodyInAtomicTransaction(fs.readFileSync(path.join(root,
  'migrations/20261005_release_function_ownership_bridge_v1.sql'),'utf8'));
const signatures=[
  'read_legacy_release_checkpoints_v3_19()',
  'append_legacy_source_shard_v3_19(uuid,uuid,text,jsonb)',
  'schedule_legacy_source_shard_successor_v3_19(uuid,uuid,uuid,text,integer,uuid)',
  'append_legacy_expired_producer_diagnostic_v3_20(uuid,uuid,text,text,text,text,text,timestamptz)',
];
const fixture=signatures.map((signature,index)=>{
  const name=signature.slice(0,signature.indexOf('('));
  const source=fs.readFileSync(path.join(root,'migrations',index<3
    ? '20260823_release_reconciliation_v3_19.sql':'20260828_kol_first_runtime_recovery_v3_20.sql'),'utf8');
  const match=source.match(new RegExp('CREATE OR REPLACE FUNCTION public[.]'+name
    +'\\([\\s\\S]*?\\)\\s*RETURNS[\\s\\S]*?\\bAS\\s+(\\$[a-z_]*\\$)[\\s\\S]*?\\1;','iu'));
  assert.ok(match,'tracked fixture definition missing');
  return match[0]+`\nALTER FUNCTION public.${signature} OWNER TO postgres;
    REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`;
}).join('\n');

test('exact ownership bridge rejects drift and preserves transaction/role boundaries in real PostgreSQL',
  {skip:!available && 'local PostgreSQL tools unavailable'},async(t)=>{
    const temporary=fs.mkdtempSync('/tmp/si-owner-pg-');
    const cluster=path.join(temporary,'data');const port=55179;
    const user=os.userInfo().username;
    const run=(bin,args)=>execFileSync(path.join(binaries,bin),args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    const sql=(query,actor=user)=>run('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',temporary,
      '-p',String(port),'-U',actor,'-d','postgres','-c',query]);
    let started=false;
    try {
      run('initdb',['-D',cluster,'--auth=trust','--no-locale','--encoding=UTF8','-U',user]);
      run('pg_ctl',['-D',cluster,'-l',path.join(temporary,'postgres.log'),'-o',`-h '' -k ${temporary} -p ${port}`,'-w','start']);started=true;
      sql(`CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
        CREATE ROLE postgres NOLOGIN;CREATE ROLE legacy_correctness_rpc_owner NOLOGIN;
        CREATE ROLE opportunity_v3_rpc_owner NOLOGIN;CREATE ROLE service_role NOLOGIN;
        CREATE ROLE unprivileged_migrator LOGIN NOSUPERUSER NOCREATEROLE NOBYPASSRLS;
        GRANT USAGE ON SCHEMA public,extensions TO unprivileged_migrator;`);
      const owners=()=>sql(`SELECT string_agg(pg_get_userbyid(proowner),',' ORDER BY proname)
        FROM pg_proc WHERE pronamespace='public'::regnamespace`);
      await t.test('fresh missing profiles are no-op; absent supersession detection is safe',async()=>{
        assert.equal(sql(`BEGIN;${bridge} COMMIT;SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace`),'0');
        const result=await reviewedMigrationIsSuperseded({query:async(query)=>({rows:[JSON.parse(sql(`SELECT row_to_json(r) FROM (${query}) r`))]})},
          'migrations/20260827_decision_revision_dossier_projection_v3_19_2.sql');
        assert.equal(result,false);
      });
      await t.test('existing runtime role bootstrap is checked without silently activating the login',async()=>{
        const client={query:async(query)=>({rows:sql(`SELECT row_to_json(r) FROM (${query}) r`).split('\n').filter(Boolean).map(JSON.parse)})};
        await assertExistingRuntimeRoleContract(client);
        sql('CREATE ROLE stockinsider_runtime_v319 NOLOGIN;');
        await assert.rejects(assertExistingRuntimeRoleContract(client),/runtime_role_bootstrap_required/);
        assert.equal(sql("SELECT rolcanlogin FROM pg_roles WHERE rolname='stockinsider_runtime_v319'"),'f');
        sql('ALTER ROLE stockinsider_runtime_v319 LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 6;');
        await assertExistingRuntimeRoleContract(client);
      });
      // Fixtures use exact tracked bodies with compilation deferred; routines
      // are never invoked without their separate full prerequisite schema.
      sql('SET check_function_bodies=false;'+fixture);
      const original=owners();
      await t.test('known owners transfer only exact functions, no CREATE remains, replay is idempotent',()=>{
        const result=sql(`BEGIN;${bridge}${bridge}
          SELECT string_agg(pg_get_userbyid(proowner),',' ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace;
          SELECT has_schema_privilege('legacy_correctness_rpc_owner','public','CREATE') OR has_schema_privilege('opportunity_v3_rpc_owner','public','CREATE');
          ROLLBACK;`);
        assert.match(result,/legacy_correctness_rpc_owner/);assert.match(result,/opportunity_v3_rpc_owner/);
        assert.match(result,/\nf$/);assert.equal(owners(),original);
      });
      await t.test('actual non-owner login cannot transfer or borrow superuser capability',()=>{
        assert.throws(()=>sql(`BEGIN;${bridge} COMMIT;`,'unprivileged_migrator'),/owner_authority_missing/);
        assert.equal(owners(),original);
      });
      await t.test('body and security/profile changes fail before any transfer',()=>{
        for(const mutation of [
          `CREATE OR REPLACE FUNCTION public.read_legacy_release_checkpoints_v3_19() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT '{}'::jsonb $$;`,
          'ALTER FUNCTION public.read_legacy_release_checkpoints_v3_19() SECURITY INVOKER;',
          'ALTER FUNCTION public.read_legacy_release_checkpoints_v3_19() SET search_path=public;',
        ]) assert.throws(()=>sql(`BEGIN;${mutation}${bridge}COMMIT;`),/unknown_profile/);
        assert.equal(owners(),original);
      });
      await t.test('public execution and powerful target roles are rejected',()=>{
        assert.throws(()=>sql(`BEGIN;GRANT EXECUTE ON FUNCTION public.read_legacy_release_checkpoints_v3_19() TO PUBLIC;${bridge}COMMIT;`),/acl_invalid/);
        assert.throws(()=>sql(`BEGIN;ALTER ROLE opportunity_v3_rpc_owner LOGIN;${bridge}COMMIT;`),/target_role_invalid/);
        assert.equal(owners(),original);
      });
      await t.test('failure after owner changes rolls back all changes and temporary privileges',()=>{
        assert.throws(()=>sql(`BEGIN;${bridge}SELECT 1/0;COMMIT;`),/division by zero/);
        assert.equal(owners(),original);
        assert.equal(sql("SELECT has_schema_privilege('opportunity_v3_rpc_owner','public','CREATE')"),'f');
      });
    } finally {
      if(started)run('pg_ctl',['-D',cluster,'-m','immediate','stop']);
      fs.rmSync(temporary,{recursive:true,force:true});
    }
  });
