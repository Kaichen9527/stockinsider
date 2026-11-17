\set ON_ERROR_STOP on
-- Synthetic persisted ranking and authority projection. The deployed
-- forecast-current validator has its own native authority tests.
DO $fixture_roles$
DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['stockinsider_vnext_owner','opportunity_v3_rpc_owner','anon','authenticated','service_role'] LOOP
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('CREATE ROLE %I NOLOGIN',role_name);
  END IF;
 END LOOP;
END $fixture_roles$;
CREATE TABLE vnext_mode_v1(enabled boolean,legacy_fenced boolean);
CREATE TABLE vnext_launch_ranking_mode_v1(enabled boolean);
CREATE TABLE vnext_launch_ranking_snapshots_v1(ranking_run_id uuid PRIMARY KEY,input_cutoff timestamptz);
CREATE TABLE vnext_launch_ranking_members_v1(ranking_run_id uuid,symbol text,rank int,research_revision uuid,input_hash text);
CREATE TABLE vnext_publications_v1(revision_id uuid PRIMARY KEY,symbol text,input_hash text,job_id uuid,published_at timestamptz,content jsonb);
CREATE TABLE vnext_preparations_v1(job_id uuid PRIMARY KEY,input_hash text,evidence jsonb,frozen_at timestamptz);
CREATE TABLE vnext_financial_preparation_protocols_v1(job_id uuid PRIMARY KEY,input_hash text,protocol text,frozen_packet jsonb,packet_digest text,recorded_at timestamptz);
CREATE TABLE vnext_forecast_rights_v1(policy_id uuid,stock_id uuid,verification_id uuid,operation text,license_basis text,
 permitted_use text,recorded_at timestamptz,valid_from timestamptz,valid_until timestamptz);
ALTER TABLE vnext_forecast_rights_v1 OWNER TO opportunity_v3_rpc_owner;
CREATE TABLE fixture_head(packet jsonb);
CREATE FUNCTION vnext_financial_wire_clock_v1(raw text) RETURNS timestamptz LANGUAGE sql STABLE AS 'SELECT raw::timestamptz';
CREATE FUNCTION vnext_catalog_canonical_v1(value jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT value::text';
CREATE FUNCTION vnext_forecast_stock_id_internal_v1(text) RETURNS uuid LANGUAGE sql STABLE AS
 $$ SELECT CASE WHEN $1='2454' THEN '00000000-0000-4000-8000-000000000010'::uuid END $$;
CREATE FUNCTION vnext_forecast_current_internal_v1(uuid,text,timestamptz) RETURNS jsonb LANGUAGE sql STABLE AS
 $$ SELECT packet FROM fixture_head WHERE $1='00000000-0000-4000-8000-000000000010' AND $2='2454' $$;
GRANT SELECT ON vnext_mode_v1,vnext_launch_ranking_mode_v1,vnext_launch_ranking_snapshots_v1,vnext_launch_ranking_members_v1,
 vnext_publications_v1,vnext_preparations_v1,vnext_financial_preparation_protocols_v1,fixture_head TO stockinsider_vnext_owner;
\ir ../migrations/20261117_41_vnext_launch_issuer_eps_estimates_v1.sql

INSERT INTO vnext_mode_v1 VALUES(true,true);
INSERT INTO vnext_launch_ranking_mode_v1 VALUES(true);
INSERT INTO vnext_launch_ranking_snapshots_v1 VALUES('00000000-0000-4000-8000-000000000011','2026-11-10T13:30Z');
INSERT INTO vnext_launch_ranking_members_v1 VALUES('00000000-0000-4000-8000-000000000011','2454',1,
 '00000000-0000-4000-8000-000000000012',repeat('a',64));
INSERT INTO vnext_forecast_rights_v1 VALUES('00000000-0000-4000-8000-000000000013',
 '00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000014',
 'allow','public_issuer_guidance','structured_numeric_forecast','2026-11-10T02:00Z','2026-10-01','2090-01-01');

WITH evidence AS (
 SELECT '{
   "id":"forecast:00000000-0000-4000-8000-000000000015:00000000-0000-4000-8000-000000000014",
   "key":"source_quarterly_diluted_eps_estimate","unit":"TWD_per_share","kind":"assumption","sourceTier":"public",
   "source":"https://mops.twse.com.tw/issuer-forecast","value":0,"period":"2026-10-01/2026-12-31",
   "eventAt":"2026-10-30T09:00:00Z","availableAt":"2026-11-10T04:00:00Z"
  }'::jsonb AS data
), tuple AS (
 SELECT data, '{
  "schemaVersion":"vnext-forecast-source-receipt-v1","classification":"source_estimate_not_reported_or_fair_value",
  "estimateKind":"analyst_estimate","estimateHorizon":"next_twelve_months","shareBasis":"source_diluted_eps_denominator_not_supplied",
  "denominatorShares":null,"annualEps":null,"nextFourQuarterEps":null,
  "stockId":"00000000-0000-4000-8000-000000000010","symbol":"2454","policyId":"00000000-0000-4000-8000-000000000013",
  "verificationId":"00000000-0000-4000-8000-000000000014","privateOriginal":"DO_NOT_RENDER"
 }'::jsonb||jsonb_build_object('evidenceHash',encode(sha256(convert_to(data::text,'UTF8')),'hex')) AS receipt FROM evidence
)
INSERT INTO fixture_head SELECT jsonb_build_object('evidence',jsonb_build_array(data),'receipts',jsonb_build_array(receipt)) FROM tuple;

INSERT INTO vnext_preparations_v1 SELECT '00000000-0000-4000-8000-000000000016',repeat('a',64),
 jsonb_build_object('cutoff','2026-11-10T09:30:00Z','evidence',packet->'evidence','forecastSourceReceipts',packet->'receipts'),
 '2026-11-10T10:00Z' FROM fixture_head;
INSERT INTO vnext_financial_preparation_protocols_v1
 SELECT job_id,input_hash,'vnext-financial-provider-input-v1',evidence,
  encode(sha256(convert_to(evidence::text,'UTF8')),'hex'),frozen_at FROM vnext_preparations_v1;
INSERT INTO vnext_publications_v1 SELECT '00000000-0000-4000-8000-000000000012','2454',repeat('a',64),
 '00000000-0000-4000-8000-000000000016','2026-11-10T12:00Z',
 jsonb_build_object('claims',jsonb_build_array(jsonb_build_object('kind','assumption',
  'numeric',jsonb_build_object('key',e->>'key','value',e->'value','unit',e->>'unit','period',e->>'period'),
  'evidenceIds',jsonb_build_array(e->>'id'))))
 FROM fixture_head CROSS JOIN LATERAL (SELECT packet->'evidence'->0 e) bind;

SET ROLE service_role;
BEGIN READ ONLY;
DO $test$
DECLARE packet jsonb;
BEGIN
 packet:=public.vnext_launch_issuer_eps_estimates_v1('00000000-0000-4000-8000-000000000011','2454');
 IF packet IS NULL OR jsonb_array_length(packet->'estimates')<>1
  OR (packet->'estimates'->0->>'amount')::numeric IS DISTINCT FROM 0
  OR packet::text~'DO_NOT_RENDER|privateOriginal|evidenceHash|policyId|verificationId'
 THEN RAISE EXCEPTION 'unexpected issuer estimate projection';END IF;
 IF public.vnext_launch_issuer_eps_estimates_v1('00000000-0000-4000-8000-000000000011','2330') IS NOT NULL
  OR public.vnext_launch_issuer_eps_estimates_v1('00000000-0000-4000-8000-000000000099','2454') IS NOT NULL
 THEN RAISE EXCEPTION 'issuer/run substitution';END IF;
END $test$;
COMMIT;
RESET ROLE;

DO $test$
BEGIN
 IF has_function_privilege('anon','public.vnext_launch_issuer_eps_estimates_v1(uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.vnext_launch_issuer_eps_estimates_v1(uuid,text)','EXECUTE')
  OR has_table_privilege('service_role','vnext_forecast_rights_v1','SELECT')
  OR has_function_privilege('service_role','public.vnext_launch_issuer_estimate_public_right_v1(uuid,uuid,uuid,timestamptz)','EXECUTE')
 THEN RAISE EXCEPTION 'unexpected issuer estimate privileges';END IF;
END $test$;

BEGIN;
UPDATE fixture_head SET packet=jsonb_set(packet,'{evidence,0,value}','99');
DO $test$
BEGIN
 IF public.vnext_launch_issuer_eps_estimates_v1('00000000-0000-4000-8000-000000000011','2454')->'estimates' IS DISTINCT FROM '[]'::jsonb
 THEN RAISE EXCEPTION 'newer evidence leaked into frozen ranking';END IF;
END $test$;
ROLLBACK;

BEGIN;
UPDATE vnext_publications_v1 SET content=jsonb_set(content,'{claims,0,numeric,value}','99');
DO $test$
BEGIN
 IF public.vnext_launch_issuer_eps_estimates_v1('00000000-0000-4000-8000-000000000011','2454')->'estimates' IS DISTINCT FROM '[]'::jsonb
 THEN RAISE EXCEPTION 'estimate absent from reviewed claims was included';END IF;
END $test$;
ROLLBACK;

BEGIN;
UPDATE vnext_forecast_rights_v1 SET license_basis='licensed_forecast_metadata';
DO $test$
BEGIN
 IF public.vnext_launch_issuer_eps_estimates_v1('00000000-0000-4000-8000-000000000011','2454')->'estimates' IS DISTINCT FROM '[]'::jsonb
 THEN RAISE EXCEPTION 'licensed private estimate projected';END IF;
END $test$;
ROLLBACK;

INSERT INTO vnext_forecast_rights_v1 SELECT gen_random_uuid(),stock_id,verification_id,'revoke',license_basis,permitted_use,
 statement_timestamp(),valid_from,valid_until FROM vnext_forecast_rights_v1 WHERE operation='allow';
DO $test$
BEGIN
 IF public.vnext_launch_issuer_eps_estimates_v1('00000000-0000-4000-8000-000000000011','2454')->'estimates' IS DISTINCT FROM '[]'::jsonb
 THEN RAISE EXCEPTION 'revoked estimate still exposed';END IF;
END $test$;

-- Fiscal projections preserve whole issuer-disclosed periods and the original
-- share denominator. Only the projected authority is synthetic here.
\ir ../migrations/20261117_45_vnext_launch_issuer_fiscal_forecasts_v1.sql
CREATE OR REPLACE FUNCTION vnext_forecast_current_internal_v1(uuid,text,timestamptz) RETURNS jsonb LANGUAGE sql STABLE AS
 $$ SELECT packet FROM fixture_head WHERE $1='00000000-0000-4000-8000-000000000010' AND $2='2454' AND $3='2026-11-10T08:00Z' $$;

INSERT INTO vnext_forecast_rights_v1
SELECT ('00000000-0000-4000-8000-00000000020'||i)::uuid,
 '00000000-0000-4000-8000-000000000010',('00000000-0000-4000-8000-00000000021'||i)::uuid,
 'allow','public_issuer_guidance','structured_numeric_forecast','2026-11-10T02:00Z','2026-10-01','2090-01-01'
FROM generate_series(0,1) AS g(i);

WITH types(i, key, amount, start_day, end_day, basis, shares) AS (
 VALUES (0,'source_annual_forecast_eps',0,'2027-01-01','2027-12-31','diluted','1000'),
        (1,'source_next_four_fiscal_quarter_eps',-2,'2027-02-01','2028-01-31','basic','2000')
), pairs AS (
 SELECT t.*, phase, jsonb_build_object(
  'id','fiscal-forecast:00000000-0000-4000-8000-00000000020'||i||':00000000-0000-4000-8000-00000000021'||i||':'||phase,
  'key',CASE phase WHEN 'eps' THEN key ELSE 'fiscal_forecast_original' END,
  'value',CASE phase WHEN 'eps' THEN to_jsonb(amount) ELSE '{"statement":"DO_NOT_RENDER"}'::jsonb END,
  'period',start_day||'/'||end_day,
  'source','https://mops.twse.com.tw/issuer-fiscal-forecast','kind','assumption','sourceTier','public',
  'eventAt','2026-10-30T09:00:00Z','availableAt','2026-11-10T04:00:00Z')
  || CASE phase WHEN 'eps' THEN '{"unit":"TWD_per_share"}'::jsonb ELSE '{}'::jsonb END AS item
 FROM types t CROSS JOIN unnest(ARRAY['eps','original']) AS stages(phase)
), receipts AS (
 SELECT i,phase,item,jsonb_build_object(
  'schemaVersion','vnext-fiscal-forecast-receipt-v1','classification','source_disclosed_forecast_assumption_not_reported',
  'stockId','00000000-0000-4000-8000-000000000010','symbol','2454',
  'policyId','00000000-0000-4000-8000-00000000020'||i,
  'verificationId','00000000-0000-4000-8000-00000000021'||i,'entryRole',phase,
  'parsed',jsonb_build_object('privateOriginal','DO_NOT_RENDER'),
  'calculation',jsonb_build_object('key',key,'value',amount,'unit','TWD_per_share','period',start_day||'/'||end_day,
   'periodStart',start_day,'periodEnd',end_day,'shareBasis',basis,'denominatorShares',shares,'reported',false),
  'evidenceHash',encode(sha256(convert_to(item::text,'UTF8')),'hex')) AS receipt
 FROM pairs
)
UPDATE fixture_head SET packet=(SELECT jsonb_build_object('evidence',jsonb_agg(item ORDER BY i,phase),
 'receipts', jsonb_agg(receipt ORDER BY i,phase)) FROM receipts);

UPDATE vnext_preparations_v1 SET evidence=jsonb_build_object('cutoff','2026-11-10T09:30:00Z',
 'forecastSourceAsOf','2026-11-10T08:00:00Z','evidence',packet->'evidence','forecastSourceReceipts',packet->'receipts')
FROM fixture_head;
UPDATE vnext_financial_preparation_protocols_v1 b SET
 frozen_packet=p.evidence, packet_digest=encode(sha256(convert_to(p.evidence::text,'UTF8')),'hex')
FROM vnext_preparations_v1 p WHERE p.job_id=b.job_id;
UPDATE vnext_publications_v1 SET content=(SELECT jsonb_build_object('claims',jsonb_agg(jsonb_build_object(
 'kind','assumption','numeric',jsonb_build_object('key',e->>'key','value',e->'value','unit',e->>'unit','period',e->>'period'),
 'evidenceIds',jsonb_build_array(e->>'id')) ORDER BY e->>'id'))
 FROM fixture_head CROSS JOIN LATERAL jsonb_array_elements(packet->'evidence') AS entries(e)
 WHERE (e->>'id') LIKE '%:eps');

SET ROLE service_role;
BEGIN READ ONLY;
DO $test$
DECLARE packet jsonb;
BEGIN
 packet:=public.vnext_launch_issuer_fiscal_forecasts_v1('00000000-0000-4000-8000-000000000011','2454');
 IF packet IS NULL OR jsonb_array_length(packet->'forecasts')<>2
  OR NOT ((packet->'forecasts'->0) @> '{"horizon":"annual","periodStart":"2027-01-01","periodEnd":"2027-12-31","shareBasis":"diluted","shares":"1000","amount":0}')
  OR NOT ((packet->'forecasts'->1) @> '{"horizon":"four_quarters","periodStart":"2027-02-01","periodEnd":"2028-01-31","shareBasis":"basic","shares":"2000","amount":-2}')
  OR packet::text~'DO_NOT_RENDER|privateOriginal|evidenceHash|policyId|verificationId'
 THEN RAISE EXCEPTION 'unexpected fiscal forecast projection';END IF;
 IF public.vnext_launch_issuer_fiscal_forecasts_v1('00000000-0000-4000-8000-000000000011','2330') IS NOT NULL
  OR public.vnext_launch_issuer_fiscal_forecasts_v1('00000000-0000-4000-8000-000000000099','2454') IS NOT NULL
 THEN RAISE EXCEPTION 'fiscal issuer/run substitution';END IF;
END $test$;
COMMIT;
RESET ROLE;

DO $test$
BEGIN
 IF has_function_privilege('anon','public.vnext_launch_issuer_fiscal_forecasts_v1(uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.vnext_launch_issuer_fiscal_forecasts_v1(uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'unexpected fiscal forecast browser privileges';END IF;
END $test$;

BEGIN;
UPDATE fixture_head SET packet=jsonb_set(packet,'{evidence,1,value}','{"statement":"revised"}');
DO $test$
BEGIN
 IF jsonb_array_length(public.vnext_launch_issuer_fiscal_forecasts_v1('00000000-0000-4000-8000-000000000011','2454')->'forecasts')<>1
  OR public.vnext_launch_issuer_fiscal_forecasts_v1('00000000-0000-4000-8000-000000000011','2454')->'forecasts'->0->>'horizon'<>'four_quarters'
 THEN RAISE EXCEPTION 'missing original pair did not suppress annual snapshot';END IF;
END $test$;
ROLLBACK;

BEGIN;
UPDATE vnext_publications_v1 SET content=jsonb_set(content,'{claims,0,numeric,value}','99');
DO $test$
BEGIN
 IF jsonb_array_length(public.vnext_launch_issuer_fiscal_forecasts_v1('00000000-0000-4000-8000-000000000011','2454')->'forecasts')<>1
 THEN RAISE EXCEPTION 'unreviewed fiscal value was projected';END IF;
END $test$;
ROLLBACK;

INSERT INTO vnext_forecast_rights_v1 SELECT gen_random_uuid(),stock_id,verification_id,'revoke',license_basis,permitted_use,
 statement_timestamp(),valid_from,valid_until FROM vnext_forecast_rights_v1
 WHERE operation='allow' AND verification_id::text LIKE '%0021_';
DO $test$
BEGIN
 IF public.vnext_launch_issuer_fiscal_forecasts_v1('00000000-0000-4000-8000-000000000011','2454')->'forecasts' IS DISTINCT FROM '[]'::jsonb
 THEN RAISE EXCEPTION 'revoked fiscal estimates leaked';END IF;
END $test$;
