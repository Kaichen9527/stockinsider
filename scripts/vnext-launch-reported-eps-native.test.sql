\set ON_ERROR_STOP on
CREATE ROLE stockinsider_vnext_owner NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE vnext_mode_v1(enabled boolean,legacy_fenced boolean);
CREATE TABLE vnext_launch_ranking_mode_v1(enabled boolean);
CREATE TABLE vnext_launch_ranking_snapshots_v1(ranking_run_id uuid PRIMARY KEY,input_cutoff timestamptz);
CREATE TABLE vnext_launch_ranking_members_v1(ranking_run_id uuid,symbol text,rank int,research_revision uuid,input_hash text,PRIMARY KEY(ranking_run_id,symbol));
CREATE TABLE vnext_publications_v1(revision_id uuid PRIMARY KEY,symbol text,input_hash text,job_id uuid,published_at timestamptz);
CREATE TABLE vnext_preparations_v1(job_id uuid PRIMARY KEY,input_hash text,evidence jsonb,frozen_at timestamptz);
CREATE TABLE vnext_financial_preparation_protocols_v1(job_id uuid PRIMARY KEY,input_hash text,protocol text,frozen_packet jsonb,packet_digest text,recorded_at timestamptz);
CREATE FUNCTION vnext_financial_wire_clock_v1(raw text) RETURNS timestamptz LANGUAGE sql STABLE AS 'SELECT raw::timestamptz';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO stockinsider_vnext_owner;
\ir ../migrations/20261117_34_vnext_launch_reported_eps_v1.sql

INSERT INTO vnext_mode_v1 VALUES(true,true);
INSERT INTO vnext_launch_ranking_mode_v1 VALUES(true);
INSERT INTO vnext_launch_ranking_snapshots_v1 VALUES('00000000-0000-4000-8000-000000000001','2026-11-17T13:30Z');
INSERT INTO vnext_launch_ranking_members_v1 VALUES('00000000-0000-4000-8000-000000000001','5274',1,'00000000-0000-4000-8000-000000000002',repeat('a',64));
INSERT INTO vnext_publications_v1 VALUES('00000000-0000-4000-8000-000000000002','5274',repeat('a',64),'00000000-0000-4000-8000-000000000003','2026-11-17T13:00Z');

WITH facts(id,key,start_date,amount,known,url) AS (VALUES
 ('basic-q3','quarterly_basic_eps','2026-07-01',0.0,'2026-11-16T09:00Z',''),
 ('basic-ytd','quarterly_basic_eps','2026-01-01',4.25,'2026-11-16T09:00Z',''),
 ('diluted-q3','quarterly_diluted_eps','2026-07-01',-0.125,'2026-11-16T09:00Z',''),
 ('future','quarterly_diluted_eps','2026-01-01',10,'2026-11-17T13:30:00.000001Z',''),
 ('private','quarterly_diluted_eps','2026-01-01',99,'2026-11-16T09:00Z','https://invalid.test/private'),
 ('cross-symbol','quarterly_diluted_eps','2026-01-01',600,'2026-11-16T09:00Z','https://mopsov.twse.com.tw/server-java/FileDownLoad?step=9&functionName=t164sb01&report_id=C&co_id=2330&year=2026&season=3')
), input AS (
 SELECT *,coalesce(nullif(url,''),'https://mopsov.twse.com.tw/server-java/FileDownLoad?step=9&functionName=t164sb01&report_id=C&co_id=5274&year=2026&season=3') AS source FROM facts
), packet AS (
 SELECT jsonb_build_object('cutoff','2026-11-17T12:00Z','financialProviderInput',jsonb_build_object('facts',jsonb_agg(
  jsonb_build_object('factId',id,'receiptHash',id,'originalFact',jsonb_build_object(
   'fact_id',id,'fact_key',key,'period_start',start_date,'period_end','2026-09-30','value',amount,'unit','TWD_per_share',
   'provider','mops','authority_tier','official_filing','estimate_kind','reported','estimate_horizon','reported_period',
   'validation_status','validated','schema_valid',true,'unit_valid',true,'point_in_time_valid',true,'consistency_valid',true,
   'duration_kind','quarterly','filing_published_at','2026-11-10T08:00Z','source_ref','issuer-document:'||repeat('1',64)||':ab')))),
  'financialSourceReceipts',jsonb_agg(jsonb_build_object('factId',id,'receiptHash',id,'sourceUrl',source,'sourceSha256',repeat('1',64))),
  'evidence',jsonb_agg(jsonb_build_object('id',id,'source',source,'key',key,'value',amount,'availableAt',known,'privateBrief','withheld'))
 ) AS value FROM input
)
INSERT INTO vnext_preparations_v1 SELECT '00000000-0000-4000-8000-000000000003',repeat('a',64),value,'2026-11-17T12:30Z' FROM packet;
INSERT INTO vnext_financial_preparation_protocols_v1
SELECT job_id,input_hash,'vnext-financial-provider-input-v1',evidence,encode(sha256(convert_to(evidence::text,'UTF8')),'hex'),frozen_at FROM vnext_preparations_v1;

SET ROLE service_role;
BEGIN READ ONLY;
DO $test$
DECLARE packet jsonb;
BEGIN
 packet:=public.vnext_launch_reported_eps_v1('00000000-0000-4000-8000-000000000001','5274');
 IF packet IS NULL OR jsonb_array_length(packet->'facts')<>3 OR (packet->'facts'->0->>'amount')::numeric<>0
  OR (packet->'facts'->1->>'amount')::numeric<>-0.125 OR (packet->'facts'->2->>'amount')::numeric<>4.25
  OR packet::text~'private|receiptHash|originalFact|withheld'
 THEN RAISE EXCEPTION 'unexpected public MOPS EPS fixture output';END IF;
 IF vnext_launch_reported_eps_v1('00000000-0000-4000-8000-000000000001','2330') IS NOT NULL
  OR vnext_launch_reported_eps_v1('00000000-0000-4000-8000-000000000099','5274') IS NOT NULL
 THEN RAISE EXCEPTION 'cross-symbol or cross-run lookup returned a projection';END IF;
END $test$;
COMMIT;
RESET ROLE;

DO $test$
BEGIN
 IF has_function_privilege('anon','public.vnext_launch_reported_eps_v1(uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.vnext_launch_reported_eps_v1(uuid,text)','EXECUTE')
  OR has_table_privilege('service_role','vnext_financial_preparation_protocols_v1','SELECT')
 THEN RAISE EXCEPTION 'unexpected reader privileges';END IF;
END $test$;

BEGIN;
UPDATE vnext_financial_preparation_protocols_v1 SET packet_digest=repeat('0',64);
DO $test$
BEGIN
 IF public.vnext_launch_reported_eps_v1('00000000-0000-4000-8000-000000000001','5274') IS NOT NULL
 THEN RAISE EXCEPTION 'mismatched preparation digest accepted';END IF;
END $test$;
ROLLBACK;

BEGIN;
UPDATE vnext_publications_v1 SET published_at='2026-11-17T13:30:00.000001Z';
DO $test$
BEGIN
 IF public.vnext_launch_reported_eps_v1('00000000-0000-4000-8000-000000000001','5274') IS NOT NULL
 THEN RAISE EXCEPTION 'late research accepted';END IF;
END $test$;
ROLLBACK;

BEGIN;
UPDATE vnext_launch_ranking_members_v1 SET rank=NULL;
DO $test$
BEGIN
 IF public.vnext_launch_reported_eps_v1('00000000-0000-4000-8000-000000000001','5274') IS NOT NULL
 THEN RAISE EXCEPTION 'non-ranked research accepted';END IF;
END $test$;
ROLLBACK;

BEGIN;
UPDATE vnext_launch_ranking_mode_v1 SET enabled=false;
DO $test$
BEGIN
 IF public.vnext_launch_reported_eps_v1('00000000-0000-4000-8000-000000000001','5274') IS NOT NULL
 THEN RAISE EXCEPTION 'disabled reader returned values';END IF;
END $test$;
ROLLBACK;
SELECT 'LAUNCH_REPORTED_EPS_NATIVE_PASSED';
