import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {verifyFinancialHistoryPostconditions} from './financial-history-install-guard.mjs';
import {readFinancialHistoryCatalog} from './financial-history-catalog.mjs';
const {Client}=createRequire(import.meta.url)('pg');
export function registerFinancialCatalogCases({psql,cluster,financialHistorySql,mode,artifacts}) {
 async function withClient(run) {const c=cluster();const client=new Client({host:c.socket,port:c.port,user:c.user,database:'postgres',statement_timeout:10000,query_timeout:12000});await client.connect();try{return await run(client);}finally{await client.end();}}
 test('financial catalog legal successor applies twice and captures actual catalog',async()=>{
  // Seed nonempty data through the original predecessor RPC, not immutable-row INSERT.
  psql(`INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at)
    VALUES('a11d4e67-7d0a-4c44-8a9d-1d5c3b875003','opportunity_runner','2026-01-01',NULL,'active',repeat('9',64),clock_timestamp());
    INSERT INTO public.stocks(id,symbol) VALUES('71300000-0000-4000-8000-000000000083','9183');
    SELECT * FROM public.append_financial_fact_v3(ROW(
      '71300000-0000-4000-8000-000000000083','net_asset_value',NULL,'2025-01-01','instant',100,
      'TWD','twse','official_filing','reported','reported_period','2025-01-02T00:00:00Z',
      '2025-01-02T00:00:00Z','2025-01-02T01:00:00Z',NULL,'twse-openapi:synthetic-atomic-rollback')::public.financial_fact_input_v3,
      'a11d4e67-7d0a-4c44-8a9d-1d5c3b875003');`);
  psql(`SET ROLE stockinsider_managed_migrator; ${financialHistorySql}`);
  const rows=()=>JSON.parse(psql(`SELECT jsonb_build_object(
    'facts',(SELECT jsonb_agg(to_jsonb(f) ORDER BY fact_id) FROM public.opportunity_financial_facts_v3 f),
    'observations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY observation_id) FROM public.opportunity_financial_observations_v1 o))::text;`,['-At']).trim());
  const before=rows();assert.equal(before.facts.length,1);assert.equal(before.observations.length,1);
  psql(`SET ROLE stockinsider_managed_migrator; ${financialHistorySql}`);
  assert.deepEqual(rows(),before,'tail replay retains full nonempty row identity/bytes/clocks');
  fs.writeFileSync(path.join(artifacts,'tail-replay-rows.json'),JSON.stringify(before,null,2)+'\n');
  await withClient(async client=>{const catalog=await readFinancialHistoryCatalog(client);if(mode!=='capture')await verifyFinancialHistoryPostconditions(client);fs.writeFileSync(path.join(artifacts,'observed-catalog.json'),JSON.stringify(catalog,null,2)+'\n');assert.equal(catalog.functions.length,5);assert.equal(catalog.indexes.length,2);});
 });
 const append='public.append_financial_fact_pre_history_v1(public.financial_fact_input_v3,uuid)';
 const drifts=[
  ['search_path',"ALTER FUNCTION public.append_financial_fact_v3(public.financial_fact_input_v3,uuid) SET search_path=public"],
  ['missing_history_index','DROP INDEX public.opportunity_financial_facts_v3_history_page_v1'],
  ['private_body',`CREATE OR REPLACE FUNCTION ${append.replace('public.financial_fact_input_v3,uuid','input public.financial_fact_input_v3,caller_principal uuid')} RETURNS TABLE(fact_id uuid,recorded_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN; END $$`],
  ['private_owner',`ALTER FUNCTION ${append} OWNER TO stockinsider_managed_migrator`],
  ['missing_period_index','DROP INDEX public.opportunity_financial_facts_v3_period_revisions_v1'],
  ['missing_both_indexes','DROP INDEX public.opportunity_financial_facts_v3_history_page_v1; DROP INDEX public.opportunity_financial_facts_v3_period_revisions_v1'],
  ['wrong_index_definition','DROP INDEX public.opportunity_financial_facts_v3_history_page_v1; CREATE INDEX opportunity_financial_facts_v3_history_page_v1 ON public.opportunity_financial_facts_v3(stock_id)'],
  ['column_nullability','ALTER TABLE public.opportunity_financial_observations_v1 ALTER COLUMN collected_at DROP NOT NULL'],
  ['column_type','ALTER TABLE public.opportunity_financial_observations_v1 ALTER COLUMN input_hash TYPE varchar(64)'],
  ['missing_column','ALTER TABLE public.opportunity_financial_observations_v1 DROP COLUMN caller_principal_id CASCADE'],
  ['check_constraint','ALTER TABLE public.opportunity_financial_observations_v1 DROP CONSTRAINT opportunity_financial_observations_v1_check'],
  ['unique_constraint','ALTER TABLE public.opportunity_financial_observations_v1 DROP CONSTRAINT financial_observation_identity_v1'],
  ['foreign_key','ALTER TABLE public.opportunity_financial_observations_v1 DROP CONSTRAINT opportunity_financial_observations_v1_fact_id_fkey'],
  ['rls','ALTER TABLE public.opportunity_financial_observations_v1 DISABLE ROW LEVEL SECURITY'],
  ['table_owner','ALTER TABLE public.opportunity_financial_observations_v1 OWNER TO stockinsider_managed_migrator'],
  ['column_acl','GRANT INSERT(input_hash) ON public.opportunity_financial_observations_v1 TO service_role'],
  ['unexpected_overload',"CREATE FUNCTION public.append_financial_fact_v3(uuid) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path='' AS 'SELECT $1'"],
  ['table_acl','GRANT INSERT ON public.opportunity_financial_observations_v1 TO service_role'],
  ['trigger_type',"DROP TRIGGER opportunity_financial_observations_v1_immutable ON public.opportunity_financial_observations_v1; CREATE TRIGGER opportunity_financial_observations_v1_immutable AFTER UPDATE OR DELETE ON public.opportunity_financial_observations_v1 FOR EACH ROW EXECUTE FUNCTION public.legacy_correctness_immutable_v3_11()"],
  ['invalid_index',"UPDATE pg_catalog.pg_index SET indisvalid=false WHERE indexrelid='public.opportunity_financial_facts_v3_history_page_v1'::regclass"],
  ['not_ready_index',"UPDATE pg_catalog.pg_index SET indisready=false WHERE indexrelid='public.opportunity_financial_facts_v3_period_revisions_v1'::regclass"],
  ['immutable_function_body',"CREATE OR REPLACE FUNCTION public.legacy_correctness_immutable_v3_11() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN NEW; END $$"],
  ['column_collation',"ALTER TABLE public.opportunity_financial_observations_v1 ALTER COLUMN input_hash TYPE text COLLATE \"C\""],
  ['trigger_disabled','ALTER TABLE public.opportunity_financial_observations_v1 DISABLE TRIGGER opportunity_financial_observations_v1_immutable'],
 ];
 const signatures=[
  'public.prepare_opportunity_financial_fact_series_v3()',
  'public.append_financial_fact_v3(public.financial_fact_input_v3,uuid)',
  'public.read_financial_history_page_v1(uuid,public.financial_fact_key_v3,public.financial_duration_kind_v3,public.financial_estimate_kind_v3,public.financial_estimate_horizon_v3,date,date,timestamptz,uuid,integer,uuid)',append];
 signatures.forEach((signature,index)=>{
  drifts.push([`config_${index}`,`ALTER FUNCTION ${signature} SET search_path=public`]);
  drifts.push([`invoker_${index}`,`ALTER FUNCTION ${signature} SECURITY INVOKER`]);
  drifts.push([`owner_${index}`,`ALTER FUNCTION ${signature} OWNER TO stockinsider_managed_migrator`]);
 });
 for(const [label,sql] of (mode==='capture'?[]:mode==='red'?drifts.slice(0,4):drifts))test(`financial catalog rejects ${label} drift`,async()=>withClient(async client=>{
  const original=await readFinancialHistoryCatalog(client);
  const data=async()=> (await client.query("SELECT jsonb_build_object('facts',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY fact_id),'[]'::jsonb) FROM public.opportunity_financial_facts_v3 f),'observations',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY observation_id),'[]'::jsonb) FROM public.opportunity_financial_observations_v1 o)) AS data")).rows[0].data;
  const originalData=await data();
  await client.query('BEGIN');try{const before=await readFinancialHistoryCatalog(client);await client.query(sql);const drift=await readFinancialHistoryCatalog(client);fs.writeFileSync(path.join(artifacts,`${label}-catalog.json`),JSON.stringify(drift,null,2)+'\n');assert.notDeepEqual(drift,before);await assert.rejects(verifyFinancialHistoryPostconditions(client),/financial_history_postcondition_failed/u);}finally{await client.query('ROLLBACK');}assert.deepEqual(await readFinancialHistoryCatalog(client),original,'catalog after rollback');assert.deepEqual(await data(),originalData,'full fact/observation rows after rollback');await verifyFinancialHistoryPostconditions(client);
 }));
}
