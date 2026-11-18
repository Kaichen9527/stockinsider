\set ON_ERROR_STOP on
-- Synthetic saved review graph. Actual read SQL, clock and ACL are exercised.
DO $fixture_roles$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['stockinsider_vnext_owner','anon','authenticated','service_role'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN',role_name);
    END IF;
  END LOOP;
END $fixture_roles$;

CREATE TABLE vnext_mode_v1(enabled boolean,legacy_fenced boolean);
CREATE TABLE vnext_launch_ranking_mode_v1(enabled boolean);
CREATE TABLE vnext_launch_ranking_snapshots_v1(ranking_run_id uuid PRIMARY KEY,input_cutoff timestamptz,session_date date,published_at timestamptz);
CREATE TABLE vnext_launch_ranking_members_v1(ranking_run_id uuid,symbol text,rank int,research_revision uuid,score_revision uuid,qualification_revision uuid,input_hash text);
CREATE TABLE vnext_launch_qualifications_v1(qualification_revision uuid,research_revision uuid,score_revision uuid,symbol text,input_hash text,qualified boolean,checked_at timestamptz,checks jsonb);
CREATE TABLE vnext_publications_v1(revision_id uuid PRIMARY KEY,symbol text,input_hash text,job_id uuid,published_at timestamptz,content jsonb);
CREATE TABLE vnext_jobs_v1(job_id uuid PRIMARY KEY,symbol text,input_hash text,state text,execution_id uuid,reviewer_execution uuid,
  author_principal text,reviewer_principal text,sources_read_at timestamptz,author_result jsonb,reviewer_result jsonb);
CREATE TABLE vnext_preparations_v1(job_id uuid PRIMARY KEY,input_hash text,evidence jsonb,frozen_at timestamptz);
CREATE TABLE vnext_provider_invocations_v1(job_id uuid,task text,execution_id uuid,principal text,input_hash text,state text,
  provider text,provider_response_id text,normalized_output jsonb,started_at timestamptz,deadline_at timestamptz,settled_at timestamptz);
CREATE TABLE fixture_current_rights(currently_allowed boolean);
CREATE FUNCTION vnext_input_sources_current_v1(jsonb,text) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT currently_allowed AND $2='2454' FROM fixture_current_rights $$;
CREATE FUNCTION vnext_catalog_canonical_v1(value jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS
  $$ SELECT value::text $$;
GRANT SELECT ON vnext_mode_v1,vnext_launch_ranking_mode_v1,vnext_launch_ranking_snapshots_v1,vnext_launch_ranking_members_v1,
  vnext_launch_qualifications_v1,vnext_publications_v1,vnext_jobs_v1,vnext_preparations_v1,
  vnext_provider_invocations_v1,fixture_current_rights TO stockinsider_vnext_owner;
\ir ../migrations/20261118_58_vnext_launch_reviewed_valuation_v1.sql

INSERT INTO vnext_mode_v1 VALUES(true,true);
INSERT INTO vnext_launch_ranking_mode_v1 VALUES(true);
INSERT INTO fixture_current_rights VALUES(true);
INSERT INTO vnext_launch_ranking_snapshots_v1 VALUES
 ('00000000-0000-4000-8000-000000000011','2026-11-16T13:30Z','2026-11-16','2026-11-16T13:33Z');
INSERT INTO vnext_launch_ranking_members_v1 VALUES
 ('00000000-0000-4000-8000-000000000011','2454',1,'00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000013',repeat('a',64));
INSERT INTO vnext_launch_qualifications_v1 VALUES
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000015','2454',repeat('a',64),true,'2026-11-16T13:32Z','{"review":true,"rights":true}');

CREATE TEMP TABLE fixture_packet AS
WITH amounts AS (
  SELECT * FROM (VALUES(1,'valuation_bear','valuation:bear',65),
    (2,'valuation_base','valuation:dcf',80),(3,'valuation_bull','valuation:bull',95)) q(position,key,claim_id,amount)
), packets AS (
  SELECT jsonb_agg(jsonb_build_object('id',claim_id,'kind','assumption','text','PRIVATE_AUTHOR_SENTINEL',
    'evidenceIds',jsonb_build_array(key),'numeric',jsonb_build_object(
    'key',key,'value',amount,'unit','TWD_per_share','period','2027')) ORDER BY position) AS claims,
    jsonb_agg(jsonb_build_object('id',key,'value',amount,'contentHash',repeat('b',64),'source','PRIVATE_ORIGINAL_SENTINEL',
      'eventAt','2026-11-16T05:00Z','availableAt','2026-11-16T06:00Z') ORDER BY position) AS evidence,
    jsonb_agg(jsonb_build_object('claimId',claim_id,'verdict','supported','reason','PRIVATE_REVIEW_SENTINEL',
      'sources',jsonb_build_array(jsonb_build_object('id',key,'contentHash',repeat('b',64)))) ORDER BY position) AS review_checks
  FROM amounts
), draft AS (
  SELECT *,jsonb_build_object('schemaVersion','stockinsider-vnext-research-v1','inputHash',repeat('a',64),
    'quoteDate','2026-11-13','valuationDate','2026-11-16','claims',claims) AS data
  FROM packets
), hashed AS (
  SELECT *,encode(sha256(convert_to(vnext_catalog_canonical_v1(data),'UTF8')),'hex') AS digest
  FROM draft
)
SELECT data||jsonb_build_object('outputHash',digest) AS artifact, evidence,
  jsonb_build_object('approved',true,'factsChecked',true,'valuationChecked',true,'claimsChecked',true,
    'findings','[]'::jsonb,'authorOutputHash',digest,'claimChecks',review_checks) AS review
FROM hashed;

INSERT INTO vnext_preparations_v1 SELECT '00000000-0000-4000-8000-000000000016',repeat('a',64),
  jsonb_build_object('evidence',evidence),'2026-11-16T07:00Z' FROM fixture_packet;
INSERT INTO vnext_publications_v1 SELECT '00000000-0000-4000-8000-000000000012','2454',repeat('a',64),
  '00000000-0000-4000-8000-000000000016','2026-11-16T12:00Z',artifact FROM fixture_packet;
INSERT INTO vnext_jobs_v1 SELECT '00000000-0000-4000-8000-000000000016','2454',repeat('a',64),'published',
  '00000000-0000-4000-8000-000000000017','00000000-0000-4000-8000-000000000018',
  'synthetic-author','synthetic-reviewer','2026-11-16T09:30Z',artifact,review FROM fixture_packet;
INSERT INTO vnext_provider_invocations_v1
SELECT job_id,'author',execution_id,author_principal,input_hash,'completed','openai-responses','resp_synthetic_author',
  author_result,'2026-11-16T08:00Z'::timestamptz,'2026-11-16T09:05Z'::timestamptz,'2026-11-16T09:00Z'::timestamptz FROM vnext_jobs_v1
UNION ALL
SELECT job_id,'reviewer',reviewer_execution,reviewer_principal,input_hash,'completed','openai-responses','resp_synthetic_reviewer',
  reviewer_result,'2026-11-16T10:00Z'::timestamptz,'2026-11-16T11:05Z'::timestamptz,'2026-11-16T11:00Z'::timestamptz FROM vnext_jobs_v1;

CREATE FUNCTION fixture_scenario() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT public.vnext_launch_reviewed_valuation_v1('00000000-0000-4000-8000-000000000011','2454') $$;
CREATE FUNCTION fixture_expect_unavailable(case_name text) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN
  IF fixture_scenario() IS NOT NULL THEN
    RAISE EXCEPTION 'scenario unexpectedly available: %',case_name;
  END IF;
END $test$;

SET ROLE service_role;
SELECT fixture_expect_unavailable('no explicit grant');
RESET ROLE;
INSERT INTO vnext_launch_valuation_clearance_v1
  (research_revision,output_hash,authorization_sha256,recorded_at,valid_until)
SELECT revision_id,content->>'outputHash',repeat('d',64),'2026-11-16T12:30Z','2090-01-01'
FROM vnext_publications_v1;

SET ROLE service_role;
BEGIN READ ONLY;
DO $test$
DECLARE packet jsonb := fixture_scenario();
BEGIN
  IF packet IS DISTINCT FROM jsonb_build_object(
    'schemaVersion','vnext-launch-reviewed-valuation-v1','rankingRunId','00000000-0000-4000-8000-000000000011',
    'symbol','2454','revisionId','00000000-0000-4000-8000-000000000012','inputHash',repeat('a',64),
    'cutoff',to_jsonb('2026-11-16T13:30Z'::timestamptz),'valuationDate','2026-11-16','quoteDate','2026-11-13',
    'period','2027','method','dcf','unit','TWD_per_share','bear',65,'base',80,'bull',95,'peInputs',NULL)
    OR packet::text ~ 'PRIVATE_|authorization|provider|reviewer|outputHash'
  THEN RAISE EXCEPTION 'scenario projection differs';END IF;
  IF public.vnext_launch_reviewed_valuation_v1('00000000-0000-4000-8000-000000000011','2330') IS NOT NULL
    OR public.vnext_launch_reviewed_valuation_v1('00000000-0000-4000-8000-000000000099','2454') IS NOT NULL
  THEN RAISE EXCEPTION 'symbol or run substitution';END IF;
END $test$;
COMMIT;
RESET ROLE;

DO $test$
BEGIN
  IF has_function_privilege('anon','public.vnext_launch_reviewed_valuation_v1(uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.vnext_launch_reviewed_valuation_v1(uuid,text)','EXECUTE')
    OR has_table_privilege('service_role','vnext_launch_valuation_clearance_v1','SELECT')
    OR has_table_privilege('service_role','vnext_launch_valuation_clearance_v1','INSERT')
  THEN RAISE EXCEPTION 'scenario privileges escaped';END IF;
END $test$;

BEGIN;
UPDATE vnext_launch_valuation_clearance_v1 SET withdrawn_at=clock_timestamp();
SELECT fixture_expect_unavailable('withdrawn clearance');
ROLLBACK;
BEGIN;
UPDATE vnext_launch_valuation_clearance_v1 SET valid_until='2026-11-17';
SELECT fixture_expect_unavailable('expired clearance');
ROLLBACK;
BEGIN;
UPDATE vnext_launch_valuation_clearance_v1 SET recorded_at='2026-11-16T13:31Z';
SELECT fixture_expect_unavailable('grant first known after cutoff');
ROLLBACK;
BEGIN;
UPDATE fixture_current_rights SET currently_allowed=false;
SELECT fixture_expect_unavailable('original source no longer allowed');
ROLLBACK;
BEGIN;
UPDATE vnext_launch_qualifications_v1 SET checks='{"review":false,"rights":true}';
SELECT fixture_expect_unavailable('frozen review failed');
ROLLBACK;
BEGIN;
UPDATE vnext_provider_invocations_v1 SET state='failed' WHERE task='reviewer';
SELECT fixture_expect_unavailable('review invocation did not settle');
ROLLBACK;
BEGIN;
UPDATE vnext_jobs_v1 SET reviewer_result=jsonb_set(reviewer_result,'{claimChecks,0,sources,0,contentHash}',to_jsonb(repeat('c',64)));
UPDATE vnext_provider_invocations_v1 SET normalized_output=(SELECT reviewer_result FROM vnext_jobs_v1) WHERE task='reviewer';
SELECT fixture_expect_unavailable('a reviewed evidence hash differs');
ROLLBACK;
BEGIN;
UPDATE vnext_publications_v1 SET content=jsonb_set(content,'{claims,0,numeric,value}','1');
SELECT fixture_expect_unavailable('a saved author output was changed');
ROLLBACK;
BEGIN;
INSERT INTO vnext_publications_v1 SELECT '00000000-0000-4000-8000-000000000099','2454',repeat('c',64),
  '00000000-0000-4000-8000-000000000099','2026-11-17T12:00Z','{"claims":[]}'::jsonb;
DO $test$
BEGIN
  IF fixture_scenario()->'base' IS DISTINCT FROM '80'::jsonb THEN
    RAISE EXCEPTION 'newest publication replaced the saved scenario';
  END IF;
END $test$;
ROLLBACK;

BEGIN;
DO $test$
DECLARE artifact jsonb;
        review jsonb;
        inputs jsonb;
        digest text;
BEGIN
  WITH price_rows AS (
    SELECT position, value AS claim, choices.multiplier
    FROM jsonb_array_elements((SELECT fixture_packet.artifact->'claims' FROM fixture_packet))
      WITH ORDINALITY AS claims(value,position)
    JOIN (VALUES (1,13),(2,16),(3,19)) choices(position,multiplier) USING(position)
  ), pe AS (
    SELECT position, CASE WHEN position=2 THEN 'valuation:forward_pe' ELSE claim->>'id' END AS id,
      claim, multiplier,
      jsonb_build_array('eps-original','multiple-'||position) AS sources
    FROM price_rows
  )
  SELECT jsonb_set((SELECT fixture_packet.artifact FROM fixture_packet),'{claims}',
      jsonb_agg(claim||jsonb_build_object('id',id,'kind','derived','evidenceIds',sources,
        'numeric',claim->'numeric'||jsonb_build_object('formula',jsonb_build_object(
          'operation','multiply','evidenceIds',sources))) ORDER BY position)),
    jsonb_build_array(jsonb_build_object(
      'id','eps-original','key','next_four_quarter_eps','kind','assumption','unit','TWD_per_share','period','2027',
      'value',5,'contentHash',repeat('b',64),'eventAt','2026-11-16T05:00Z','availableAt','2026-11-16T06:00Z'))
    || jsonb_agg(jsonb_build_object(
      'id','multiple-'||position,'key','scenario_pe_multiple','kind','assumption','unit','multiple','period','2027',
      'value',multiplier,'contentHash',repeat('b',64),'eventAt','2026-11-16T05:00Z','availableAt','2026-11-16T06:00Z') ORDER BY position)
  INTO artifact,inputs FROM pe;
  digest:=encode(sha256(convert_to(vnext_catalog_canonical_v1(artifact-'outputHash'),'UTF8')),'hex');
  artifact:=artifact||jsonb_build_object('outputHash',digest);
  SELECT (SELECT fixture_packet.review FROM fixture_packet)||
    jsonb_build_object('authorOutputHash',digest,'claimChecks',jsonb_agg(jsonb_build_object(
      'claimId',item->>'id','verdict','supported','sources',
      (SELECT jsonb_agg(jsonb_build_object('id',id,'contentHash',repeat('b',64)))
       FROM jsonb_array_elements_text(item->'evidenceIds') evidence(id)))))
  INTO review FROM jsonb_array_elements(artifact->'claims') claim(item);
  UPDATE vnext_preparations_v1 SET evidence=jsonb_build_object('evidence',inputs);
  UPDATE vnext_publications_v1 SET content=artifact;
  UPDATE vnext_jobs_v1 SET author_result=artifact,reviewer_result=review;
  UPDATE vnext_provider_invocations_v1 SET normalized_output=CASE WHEN task='author' THEN artifact ELSE review END;
  UPDATE vnext_launch_valuation_clearance_v1 SET output_hash=digest;
  IF fixture_scenario()->>'method' IS DISTINCT FROM 'forward_pe' THEN
    RAISE EXCEPTION 'positive EPS and reviewed multiples should supply scenarios';
  END IF;

  IF fixture_scenario()->'peInputs' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'a price grant revealed the P/E inputs';
  END IF;
  INSERT INTO vnext_launch_valuation_clearance_v1
    (research_revision,output_hash,authorization_sha256,recorded_at,valid_until,disclose_pe_inputs)
  SELECT revision_id,digest,repeat('e',64),'2026-11-16T12:40Z','2090-01-01',true
  FROM vnext_publications_v1;
  IF fixture_scenario()->'peInputs' IS DISTINCT FROM
    '{"bear":{"eps":5,"epsBasis":"next_four_quarter_eps","multiple":13},
      "base":{"eps":5,"epsBasis":"next_four_quarter_eps","multiple":16},
      "bull":{"eps":5,"epsBasis":"next_four_quarter_eps","multiple":19}}'::jsonb THEN
    RAISE EXCEPTION 'the disclosed P/E inputs differ from the frozen operands';
  END IF;
  UPDATE vnext_launch_valuation_clearance_v1 SET recorded_at='2026-11-16T13:31Z' WHERE disclose_pe_inputs;
  IF fixture_scenario()->'peInputs' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'P/E clearance after the cutoff leaked into the ranked version';
  END IF;
  UPDATE vnext_launch_valuation_clearance_v1 SET recorded_at='2026-11-16T12:40Z',withdrawn_at=clock_timestamp()
   WHERE disclose_pe_inputs;
  IF fixture_scenario()->'peInputs' IS DISTINCT FROM 'null'::jsonb OR fixture_scenario()->'base' IS DISTINCT FROM '80'::jsonb THEN
    RAISE EXCEPTION 'withdrawn P/E scope altered the independently approved prices';
  END IF;
  UPDATE vnext_launch_valuation_clearance_v1 SET withdrawn_at=NULL WHERE disclose_pe_inputs;
  UPDATE vnext_preparations_v1 SET evidence=jsonb_set(evidence,'{evidence,0,value}','0');
  PERFORM fixture_expect_unavailable('zero EPS');
  UPDATE vnext_preparations_v1 SET evidence=jsonb_set(evidence,'{evidence,0,value}','-5');
  PERFORM fixture_expect_unavailable('negative EPS');
  UPDATE vnext_preparations_v1 SET evidence=jsonb_set(evidence,'{evidence,0,value}','6');
  PERFORM fixture_expect_unavailable('target not supported by their inputs');
END $test$;
ROLLBACK;
SELECT 'frozen_reviewed_price_scenarios_verified';
