-- Execute only against a disposable isolated server. This file creates synthetic support tables and roles.
\set ON_ERROR_STOP on
SET client_min_messages = WARNING;
SET statement_timeout = '12s';
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TYPE public.listing_status_v3 AS ENUM ('active','suspended','delisted');
CREATE TYPE public.stock_exchange_v3 AS ENUM ('TWSE','TPEX');
CREATE TYPE public.instrument_type_v3 AS ENUM ('common_stock','etf','etn','warrant','preferred_share','depositary_receipt','bond','other');
CREATE TYPE public.authority_status_v3 AS ENUM ('active','inactive');
CREATE TYPE public.official_roster_provider_v3 AS ENUM ('twse','tpex');
CREATE TYPE public.instrument_authority_input_v3 AS (stock_id uuid, symbol text, exchange stock_exchange_v3, instrument_type instrument_type_v3, listing_status listing_status_v3, official_legal_name text, official_short_name text, provider official_roster_provider_v3, source_timestamp timestamp with time zone, valid_from timestamp with time zone, valid_to timestamp with time zone, roster_version text);
CREATE TABLE public.stocks(id uuid PRIMARY KEY);
CREATE TABLE public.stock_instruments_v3(
 instrument_authority_id uuid PRIMARY KEY,stock_id uuid NOT NULL REFERENCES public.stocks(id),symbol text NOT NULL,
 exchange stock_exchange_v3 NOT NULL,instrument_type instrument_type_v3 NOT NULL,listing_status listing_status_v3 NOT NULL,
 official_legal_name text NOT NULL,official_short_name text,provider official_roster_provider_v3 NOT NULL,
 source_timestamp timestamptz NOT NULL,valid_from timestamptz NOT NULL,valid_to timestamptz,
 roster_version text NOT NULL,recorded_at timestamptz NOT NULL,
 CHECK (((valid_to IS NULL) OR (valid_to > valid_from))),
 CHECK ((((exchange = 'TWSE'::stock_exchange_v3) AND (provider = 'twse'::official_roster_provider_v3)) OR ((exchange = 'TPEX'::stock_exchange_v3) AND (provider = 'tpex'::official_roster_provider_v3)))),
 CHECK (((char_length(official_legal_name) >= 2) AND (char_length(official_legal_name) <= 120))),
 CHECK (((official_short_name IS NULL) OR ((char_length(official_short_name) >= 2) AND (char_length(official_short_name) <= 40)))),
 CHECK ((roster_version = 'tw-instrument-roster-v3.0'::text)),
 CHECK ((symbol ~ '^[0-9]{4}$'::text))
);
CREATE TABLE public.opportunity_authority_stream_registry_v3(
 family text,stream_key_hash text,stream_key_canonical bytea,registered_at timestamptz,
 PRIMARY KEY(family,stream_key_hash,stream_key_canonical)
);
CREATE TABLE public.stock_aliases_v3(
 alias_authority_id uuid PRIMARY KEY,stock_id uuid,normalized_alias text,source text,source_timestamp timestamptz,
 approved_by_principal_id uuid,approved_at timestamptz,valid_from timestamptz,valid_to timestamptz,status authority_status_v3,
 normalization_version text,recorded_at timestamptz
);
CREATE TABLE public.opportunity_rpc_audit_v3(function_name text,caller_principal_id uuid,subject_kind text,
 subject_id uuid,input_hash text,disposition text,recorded_at timestamptz);

-- Only the role and support catalog are synthetic. The procedure below is copied byte-for-byte from the live definition.
CREATE FUNCTION public.internal_principal_role_is_exact_v3_internal(uuid,text,timestamptz) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT $1='20000000-0000-4000-8000-000000000001'::uuid AND $2='opportunity_runner' $$;
CREATE OR REPLACE FUNCTION public.append_instrument_roster_authority_v3(input instrument_authority_input_v3, caller_principal uuid)
 RETURNS TABLE(instrument_authority_id uuid, official_alias_authority_ids uuid[], recorded_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_now timestamptz:=clock_timestamp(); v_id uuid:=extensions.gen_random_uuid();
  v_aliases uuid[]:='{}'::uuid[]; v_alias uuid; v_existing uuid;
  v_existing_recorded timestamptz; v_registry_count integer; v_revision_count integer;
  v_stream_canonical bytea; v_stream_hash text; v_alias_canonical bytea;
  v_alias_hash text; v_alias_text text; v_alias_status public.authority_status_v3;
BEGIN
  IF NOT public.internal_principal_role_is_exact_v3_internal($2,'opportunity_runner',v_now)
  THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='principal_role_unavailable'; END IF;
  IF ($1).roster_version<>'tw-instrument-roster-v3.0'
    OR (($1).exchange='TWSE') IS DISTINCT FROM (($1).provider='twse')
  THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='invalid_authority_request'; END IF;
  v_stream_canonical:=convert_to(regexp_replace(jsonb_build_array(
    'instrument_roster',($1).stock_id
  )::text,', ', ',', 'g'),'utf8');
  v_stream_hash:=encode(extensions.digest(v_stream_canonical,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('authority-registry|instrument_roster',0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_stream_hash,0));
  IF NOT EXISTS (
    SELECT 1 FROM public.opportunity_authority_stream_registry_v3 registry
    WHERE registry.family='instrument_roster'
      AND registry.stream_key_hash=v_stream_hash
      AND registry.stream_key_canonical=v_stream_canonical
  ) THEN
    SELECT count(*) INTO v_registry_count FROM (
      SELECT registry.stream_key_hash
      FROM public.opportunity_authority_stream_registry_v3 registry
      WHERE registry.family='instrument_roster'
      ORDER BY registry.stream_key_hash,registry.stream_key_canonical
      LIMIT 20001
    ) bounded;
    IF v_registry_count>=20000 THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='bound_violation';
    END IF;
    INSERT INTO public.opportunity_authority_stream_registry_v3(
      family,stream_key_hash,stream_key_canonical,registered_at
    ) VALUES('instrument_roster',v_stream_hash,v_stream_canonical,v_now);
  END IF;
  SELECT retained.instrument_authority_id,retained.recorded_at
  INTO v_existing,v_existing_recorded
  FROM public.stock_instruments_v3 retained
  WHERE retained.stock_id=($1).stock_id
    AND retained.symbol=($1).symbol
    AND retained.exchange=($1).exchange
    AND retained.instrument_type=($1).instrument_type
    AND retained.listing_status=($1).listing_status
    AND retained.official_legal_name=($1).official_legal_name
    AND retained.official_short_name IS NOT DISTINCT FROM ($1).official_short_name
    AND retained.provider=($1).provider
    AND retained.source_timestamp=($1).source_timestamp
    AND retained.valid_from=($1).valid_from
    AND retained.valid_to IS NOT DISTINCT FROM ($1).valid_to
    AND retained.roster_version=($1).roster_version
  ORDER BY retained.instrument_authority_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    INSERT INTO public.opportunity_rpc_audit_v3(
      function_name,caller_principal_id,subject_kind,subject_id,input_hash,disposition,recorded_at
    ) VALUES(
      'append_instrument_roster_authority_v3',$2,'instrument',v_existing,
      encode(extensions.digest(convert_to(jsonb_build_array(
        ($1).stock_id,($1).source_timestamp,($1).roster_version
      )::text,'utf8'),'sha256'),'hex'),'idempotent',v_now
    );
    RETURN QUERY SELECT v_existing,v_aliases,v_existing_recorded;
    RETURN;
  END IF;
  SELECT count(*) INTO v_revision_count FROM (
    SELECT retained.instrument_authority_id
    FROM public.stock_instruments_v3 retained
    WHERE retained.stock_id=($1).stock_id
    ORDER BY retained.recorded_at DESC,retained.instrument_authority_id
    LIMIT 65
  ) bounded;
  IF v_revision_count>=64 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='bound_violation';
  END IF;
  INSERT INTO public.stock_instruments_v3(
    instrument_authority_id,stock_id,symbol,exchange,instrument_type,listing_status,
    official_legal_name,official_short_name,provider,source_timestamp,valid_from,valid_to,roster_version,recorded_at
  ) VALUES(v_id,($1).stock_id,($1).symbol,($1).exchange,($1).instrument_type,($1).listing_status,
    ($1).official_legal_name,($1).official_short_name,($1).provider,($1).source_timestamp,
    ($1).valid_from,($1).valid_to,($1).roster_version,v_now);
  PERFORM pg_advisory_xact_lock(hashtextextended('authority-registry|stock_alias',0));
  FOR v_alias_text,v_alias_status IN
    WITH normalized(alias,status) AS (
      SELECT btrim(regexp_replace(
          translate(
            regexp_replace(btrim(normalize(($1).official_legal_name,NFKC)),
              '[[:space:]]+',' ','g'),
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'
          ),
          '(股份有限公司|有限公司|公司)$',''
        )),
        CASE WHEN ($1).listing_status='active'
          THEN 'active'::public.authority_status_v3 ELSE 'inactive'::public.authority_status_v3 END
      UNION
      SELECT btrim(regexp_replace(
          translate(
            regexp_replace(btrim(normalize(($1).official_short_name,NFKC)),
              '[[:space:]]+',' ','g'),
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'
          ),
          '(股份有限公司|有限公司|公司)$',''
        )),
        CASE WHEN ($1).listing_status='active'
          THEN 'active'::public.authority_status_v3 ELSE 'inactive'::public.authority_status_v3 END
      WHERE ($1).official_short_name IS NOT NULL
    ), requested(alias,status) AS (
      SELECT alias,status FROM normalized
      WHERE char_length(alias) BETWEEN 2 AND 40
    ), latest_alias AS (
      SELECT DISTINCT ON (alias.normalized_alias)
        alias.normalized_alias,alias.status
      FROM public.stock_aliases_v3 alias
      WHERE alias.stock_id=($1).stock_id
        AND alias.source='official_roster_seed'
      ORDER BY alias.normalized_alias,alias.recorded_at DESC,alias.alias_authority_id
    ), revoked(alias,status) AS (
      SELECT latest_alias.normalized_alias,'inactive'::public.authority_status_v3
      FROM latest_alias
      WHERE latest_alias.status='active'
        AND NOT EXISTS (
          SELECT 1 FROM requested
          WHERE requested.alias=latest_alias.normalized_alias
            AND requested.status='active'
        )
    )
    SELECT alias,status FROM requested
    UNION
    SELECT alias,status FROM revoked
    ORDER BY alias,status
  LOOP
    v_alias_canonical:=convert_to(regexp_replace(jsonb_build_array(
      'stock_alias',($1).stock_id,v_alias_text,'official_roster_seed'
    )::text,', ', ',', 'g'),'utf8');
    v_alias_hash:=encode(extensions.digest(v_alias_canonical,'sha256'),'hex');
    PERFORM pg_advisory_xact_lock(hashtextextended(v_alias_hash,0));
    IF NOT EXISTS (
      SELECT 1 FROM public.opportunity_authority_stream_registry_v3 registry
      WHERE registry.family='stock_alias'
        AND registry.stream_key_hash=v_alias_hash
        AND registry.stream_key_canonical=v_alias_canonical
    ) THEN
      SELECT count(*) INTO v_registry_count FROM (
        SELECT registry.stream_key_hash
        FROM public.opportunity_authority_stream_registry_v3 registry
        WHERE registry.family='stock_alias'
        ORDER BY registry.stream_key_hash,registry.stream_key_canonical
        LIMIT 100001
      ) bounded;
      IF v_registry_count>=100000 THEN
        RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='bound_violation';
      END IF;
      INSERT INTO public.opportunity_authority_stream_registry_v3(
        family,stream_key_hash,stream_key_canonical,registered_at
      ) VALUES('stock_alias',v_alias_hash,v_alias_canonical,v_now);
    END IF;
    SELECT count(*) INTO v_revision_count FROM (
      SELECT alias.alias_authority_id
      FROM public.stock_aliases_v3 alias
      WHERE alias.stock_id=($1).stock_id
        AND alias.normalized_alias=v_alias_text
        AND alias.source='official_roster_seed'
      ORDER BY alias.recorded_at DESC,alias.alias_authority_id
      LIMIT 65
    ) bounded;
    IF v_revision_count>=64 THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='bound_violation';
    END IF;
    v_alias:=extensions.gen_random_uuid();
    INSERT INTO public.stock_aliases_v3(alias_authority_id,stock_id,normalized_alias,source,source_timestamp,
      approved_by_principal_id,approved_at,valid_from,valid_to,status,normalization_version,recorded_at)
    VALUES(v_alias,($1).stock_id,v_alias_text,'official_roster_seed',($1).source_timestamp,
      $2,v_now,($1).valid_from,($1).valid_to,v_alias_status,
      'entity-link-v3.1',v_now);
    v_aliases:=array_append(v_aliases,v_alias);
  END LOOP;
  INSERT INTO public.opportunity_rpc_audit_v3(
    function_name,caller_principal_id,subject_kind,subject_id,input_hash,disposition,recorded_at
  ) VALUES(
    'append_instrument_roster_authority_v3',$2,'instrument',v_id,
    encode(extensions.digest(convert_to(jsonb_build_array(
      ($1).stock_id,($1).source_timestamp,($1).roster_version
    )::text,'utf8'),'sha256'),'hex'),'appended',v_now
  );
  RETURN QUERY SELECT v_id,v_aliases,v_now;
END
$function$;
CREATE FUNCTION public.fixture_instrument(p_id uuid,p_symbol text,p_exchange stock_exchange_v3,p_type instrument_type_v3,
 p_source timestamptz,p_effective timestamptz,p_status listing_status_v3 DEFAULT 'active')
RETURNS instrument_authority_input_v3 LANGUAGE sql IMMUTABLE AS $$
 SELECT row(p_id,p_symbol,p_exchange,p_type,p_status,'研究對照股份有限公司','研究對照',
  lower(p_exchange::text)::official_roster_provider_v3,p_source,p_effective,null,'tw-instrument-roster-v3.0')::instrument_authority_input_v3
$$;
CREATE TEMP TABLE report(label text PRIMARY KEY,passed boolean);
DO $checks$
DECLARE principal uuid:='20000000-0000-4000-8000-000000000001';
 move_id uuid:='10000000-0000-4000-8000-000000000001'; tdr_id uuid:='10000000-0000-4000-8000-000000000002';
 full_id uuid:='10000000-0000-4000-8000-000000000003';
 old_payload instrument_authority_input_v3; new_payload instrument_authority_input_v3;
 annual_payload instrument_authority_input_v3; old_record record; new_record record; retry record; moved_aliases bigint;
 blocked boolean:=false; wrong_principal boolean:=false;
BEGIN
 INSERT INTO public.stocks VALUES(move_id),(tdr_id),(full_id);
 old_payload:=public.fixture_instrument(move_id,'8908','TPEX','common_stock','2026-08-15 08:00+08','1997-02-14 08:00+08');
 new_payload:=public.fixture_instrument(move_id,'8908','TWSE','common_stock','2026-11-14 18:00+08','2026-10-16 09:00+08');
 SELECT * INTO old_record FROM public.append_instrument_roster_authority_v3(old_payload,principal);
 SELECT * INTO new_record FROM public.append_instrument_roster_authority_v3(new_payload,principal);
 INSERT INTO report VALUES('stock_id_stable_venue_changes',(SELECT count(*)=2 AND count(DISTINCT exchange)=2 FROM public.stock_instruments_v3 WHERE stock_id=move_id));
 INSERT INTO report VALUES('asof_previous_venue_preserved',(SELECT exchange='TPEX' FROM public.stock_instruments_v3 WHERE stock_id=move_id AND recorded_at<=old_record.recorded_at ORDER BY recorded_at DESC LIMIT 1));
 INSERT INTO report VALUES('asof_new_venue_selected',(SELECT exchange='TWSE' FROM public.stock_instruments_v3 WHERE stock_id=move_id ORDER BY recorded_at DESC LIMIT 1));
 SELECT count(*) INTO moved_aliases FROM public.stock_aliases_v3 WHERE stock_id=move_id;
 SELECT * INTO retry FROM public.append_instrument_roster_authority_v3(old_payload,principal);
 INSERT INTO report VALUES('exact_old_replay_no_new_authority_or_alias',old_record.instrument_authority_id=retry.instrument_authority_id AND
   (SELECT count(*)=2 FROM public.stock_instruments_v3 WHERE stock_id=move_id) AND
   (SELECT count(*)=moved_aliases FROM public.stock_aliases_v3 WHERE stock_id=move_id));
 INSERT INTO report VALUES('exact_replay_records_idempotent_audit',(SELECT count(*)=1 FROM public.opportunity_rpc_audit_v3 WHERE disposition='idempotent'));
 old_payload.source_timestamp:='2026-11-15 10:00+08';
 PERFORM public.append_instrument_roster_authority_v3(old_payload,principal);
 INSERT INTO report VALUES('new_timestamp_on_obsolete_venue_can_become_latest',(SELECT exchange='TPEX' FROM public.stock_instruments_v3 WHERE stock_id=move_id ORDER BY recorded_at DESC LIMIT 1));

 PERFORM public.append_instrument_roster_authority_v3(public.fixture_instrument(tdr_id,'9105','TWSE','common_stock','2026-08-15 08:00+08','2003-09-22 09:00+08'),principal);
 PERFORM public.append_instrument_roster_authority_v3(public.fixture_instrument(tdr_id,'9105','TWSE','depositary_receipt','2026-11-14 18:00+08','2003-09-22 09:00+08'),principal);
 INSERT INTO report VALUES('type_correction_retains_old_authority',(SELECT count(*)=2 FROM public.stock_instruments_v3 WHERE stock_id=tdr_id) AND
   (SELECT instrument_type='depositary_receipt' FROM public.stock_instruments_v3 WHERE stock_id=tdr_id ORDER BY recorded_at DESC LIMIT 1));

 FOR i IN 0..63 LOOP
  annual_payload:=public.fixture_instrument(full_id,'2330','TWSE','common_stock','2025-01-01T00:00Z'::timestamptz+i*interval '1 day','1994-09-05 09:00+08');
  PERFORM public.append_instrument_roster_authority_v3(annual_payload,principal);
 END LOOP;
 BEGIN
  annual_payload.source_timestamp:='2025-05-01T00:00Z';
  PERFORM public.append_instrument_roster_authority_v3(annual_payload,principal);
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
  blocked:=SQLERRM='bound_violation';
 END;
 INSERT INTO report VALUES('sixty_fifth_distinct_revision_blocked_no_mutation',blocked AND
   (SELECT count(*)=64 FROM public.stock_instruments_v3 WHERE stock_id=full_id) AND
   (SELECT count(*)=64 FROM public.stock_aliases_v3 WHERE stock_id=full_id));
 BEGIN
  PERFORM public.append_instrument_roster_authority_v3(new_payload,'00000000-0000-4000-8000-000000000000');
 EXCEPTION WHEN SQLSTATE 'PT403' THEN
  wrong_principal:=SQLERRM='principal_role_unavailable';
 END;
 INSERT INTO report VALUES('wrong_fixture_principal_refused',wrong_principal);
 IF EXISTS (SELECT FROM report WHERE NOT passed) THEN RAISE EXCEPTION 'fixture_assertion_failed'; END IF;
END $checks$;
SELECT jsonb_build_object('engine',current_setting('server_version_num'),'socketOnly',current_setting('listen_addresses')='',
 'isolatedSandbox',true,'functionBodyMd5',(SELECT md5(prosrc) FROM pg_proc WHERE proname='append_instrument_roster_authority_v3'),
 'checks',(SELECT jsonb_object_agg(label,passed ORDER BY label) FROM report),'fixtureRoleOnly',true);
