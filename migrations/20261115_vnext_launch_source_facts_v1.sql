-- SOURCE CANDIDATE ONLY. No installation/activation/native acceptance implied.
-- Licensed bytes become DB-derived facts, never a serialized JS capability.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $preflight$
DECLARE dependency record; artifact_owner oid;
BEGIN
 IF to_regclass('public.vnext_launch_csv_bindings_v1') IS NOT NULL THEN RAISE EXCEPTION 'launch_csv_first_install_required'; END IF;
 IF to_regclass('public.taiwan_data_refresh_queue_v5') IS NULL OR to_regclass('public.private_artifact_receipts_v1') IS NULL
 OR to_regprocedure('public.assert_stockinsider_backend_request_v1(boolean)') IS NULL
 OR to_regprocedure('public.enforce_production_writer_fence()') IS NULL
 OR to_regprocedure('public.vnext_catalog_canonical_v1(jsonb)') IS NULL
 OR NOT EXISTS(SELECT FROM pg_roles r WHERE rolname='stockinsider_vnext_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL
  AND NOT EXISTS(SELECT FROM pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid)
  AND NOT EXISTS(SELECT FROM pg_db_role_setting s WHERE s.setrole=r.oid AND s.setconfig IS NOT NULL))
 THEN RAISE EXCEPTION 'launch_csv_existing_authority_required'; END IF;
 SELECT relowner INTO artifact_owner FROM pg_class WHERE oid='public.private_artifact_receipts_v1'::regclass;
 FOR dependency IN SELECT * FROM (VALUES
  ('public.assert_stockinsider_backend_request_v1(boolean)','23f9db45de277921113fc088fb3f9fe2e46474fe7aafbc84163f89351188e453','uuid',false,1),
  ('public.register_private_artifact_receipt_v1(text,bigint,text,text,jsonb)','0e4c72c288d5041b770f78315018b0a724b1814a51c75eb10c06b4606644798f','record',true,1),
  ('public.enforce_production_writer_fence()','8230515bef78902c9f955f5c87a77f8b04ef02fa22525a5c4828849f56a9273a','trigger',false,0)
 )expected(signature,body_hash,result_type,returns_set,defaults) LOOP
  IF NOT EXISTS(SELECT FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure(dependency.signature)
   AND p.proowner=artifact_owner AND p.prosecdef AND p.prokind='f' AND l.lanname='plpgsql' AND p.proretset=dependency.returns_set
   AND p.prorettype=to_regtype(dependency.result_type) AND p.pronargdefaults=dependency.defaults AND p.provariadic=0
   AND p.provolatile='v' AND p.proparallel='u' AND NOT p.proisstrict AND NOT p.proleakproof
   AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=dependency.body_hash)
   THEN RAISE EXCEPTION 'launch_csv_guard_predecessor_changed:%',dependency.signature;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_catalog_canonical_v1(jsonb)')
  AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND NOT prosecdef
  AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='597081dda160ac0e369b5f5306bee102caac5b78b19cd82583e0e9408cc4f464')
 THEN RAISE EXCEPTION 'launch_csv_canonical_predecessor_changed';END IF;
END $preflight$;

CREATE TABLE public.vnext_launch_csv_mode_v1(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 required_writer_release text CHECK(required_writer_release IS NULL OR required_writer_release ~ '^[a-f0-9]{40}$'),
 profile_version text NOT NULL DEFAULT 'licensed-launch-csv-v1' CHECK(profile_version='licensed-launch-csv-v1')
);
INSERT INTO public.vnext_launch_csv_mode_v1 DEFAULT VALUES;
CREATE TABLE public.vnext_launch_csv_bindings_v1(
 job_id uuid PRIMARY KEY REFERENCES public.taiwan_data_refresh_queue_v5(job_id),
 dataset_id integer NOT NULL CHECK(dataset_id IN(11370,11371,11856,11391,11755)),
 request_key text NOT NULL, capture_generation date NOT NULL, profile_version text NOT NULL CHECK(profile_version='licensed-launch-csv-v1'),
 source_url text NOT NULL, binding_hash text NOT NULL UNIQUE CHECK(binding_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.vnext_launch_csv_attempts_v1(
 attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES public.vnext_launch_csv_bindings_v1,
 attempt_order integer NOT NULL CHECK(attempt_order BETWEEN 1 AND 3), queue_owner text NOT NULL,
 lease_owner uuid NOT NULL, backend_id uuid NOT NULL REFERENCES public.stockinsider_backend_identities_v1,
 started_at timestamptz NOT NULL, deadline_at timestamptz NOT NULL, UNIQUE(job_id,attempt_order),
 CHECK(deadline_at>started_at AND deadline_at<=started_at+interval '300 seconds')
);
CREATE TABLE public.vnext_launch_csv_captures_v1(
 capture_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), attempt_id uuid NOT NULL UNIQUE REFERENCES public.vnext_launch_csv_attempts_v1,
 artifact_hash text NOT NULL REFERENCES public.private_artifact_receipts_v1(artifact_hash),
 dataset_id integer NOT NULL CHECK(dataset_id IN(11370,11371,11856,11391,11755)), request_key text NOT NULL,
 source_url text NOT NULL, provider text NOT NULL CHECK(provider IN('twse','tpex')),
 observed_at timestamptz NOT NULL, publisher_published_at timestamptz CHECK(publisher_published_at IS NULL),
 byte_length integer NOT NULL, header_hash text NOT NULL CHECK(header_hash ~ '^[a-f0-9]{64}$'),
 reported_content_type text NOT NULL CHECK(length(reported_content_type) BETWEEN 1 AND 128),
 parser_version text NOT NULL CHECK(parser_version='licensed-launch-csv-sql-v1'),
 coverage text NOT NULL, row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 16000),
 rights_binding_hash text NOT NULL CHECK(rights_binding_hash ~ '^[a-f0-9]{64}$'),
 pool_revision text NOT NULL CHECK(pool_revision ~ '^[a-f0-9]{64}$'),
 pool_targets jsonb NOT NULL CHECK(jsonb_typeof(pool_targets)='array' AND jsonb_array_length(pool_targets)<=20),
 created_xid bigint NOT NULL DEFAULT txid_current(),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), available_at timestamptz NOT NULL,
 CHECK(available_at>=recorded_at AND available_at>=observed_at),
 CHECK(byte_length BETWEEN 2 AND CASE WHEN dataset_id=11370 THEN 3145728 ELSE 500000 END)
);
CREATE TABLE public.vnext_launch_csv_facts_v1(
 capture_id uuid NOT NULL REFERENCES public.vnext_launch_csv_captures_v1,
 session_date date NOT NULL, symbol text NOT NULL CHECK(symbol='INDEX' OR symbol ~ '^[0-9]{4}$'),
 raw_open numeric,raw_high numeric,raw_low numeric,raw_close numeric,
 shares bigint CHECK(shares BETWEEN 0 AND 9007199254740991),
 traded_ntd bigint CHECK(traded_ntd BETWEEN 0 AND 9007199254740991),
 issued_shares bigint CHECK(issued_shares BETWEEN 1 AND 9007199254740991),
 foreign_net_shares bigint CHECK(foreign_net_shares BETWEEN -9007199254740991 AND 9007199254740991),
 trust_net_shares bigint CHECK(trust_net_shares BETWEEN -9007199254740991 AND 9007199254740991),
 fact_hash text NOT NULL CHECK(fact_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(capture_id,session_date,symbol)
);
CREATE TABLE public.vnext_launch_csv_outcomes_v1(
 attempt_id uuid PRIMARY KEY REFERENCES public.vnext_launch_csv_attempts_v1,
 capture_id uuid UNIQUE REFERENCES public.vnext_launch_csv_captures_v1,
 outcome text NOT NULL CHECK(outcome IN('complete','failed')), reason text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((outcome='complete')=(capture_id IS NOT NULL))
);
-- A second RPC, after the append RPC returns, witnesses that the source facts
-- were committed/visible before this DB clock. No commit-timestamp extension.
CREATE TABLE public.vnext_launch_csv_ready_acks_v1(
 capture_id uuid PRIMARY KEY REFERENCES public.vnext_launch_csv_captures_v1,
 ack_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), backend_id uuid NOT NULL REFERENCES public.stockinsider_backend_identities_v1,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION public.vnext_launch_csv_immutable_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'launch_csv_immutable'; END $$;
ALTER FUNCTION public.vnext_launch_csv_immutable_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_csv_immutable_v1() FROM PUBLIC,anon,authenticated,service_role;
DO $tables$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['vnext_launch_csv_mode_v1','vnext_launch_csv_bindings_v1','vnext_launch_csv_attempts_v1','vnext_launch_csv_captures_v1','vnext_launch_csv_facts_v1','vnext_launch_csv_outcomes_v1','vnext_launch_csv_ready_acks_v1'] LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO stockinsider_vnext_owner',name);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',name);
  EXECUTE format('CREATE TRIGGER launch_csv_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence()',name);
  IF name<>'vnext_launch_csv_mode_v1' THEN
   EXECUTE format('CREATE TRIGGER launch_csv_no_mutation BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1()',name);
   EXECUTE format('CREATE TRIGGER launch_csv_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.vnext_launch_csv_immutable_v1()',name);
  END IF;
 END LOOP;
END $tables$;

-- Byte-oriented RFC4180. Scan ASCII delimiter bytes in O(n); UTF8 is checked
-- before scanning. Quoted commas/newlines/doubled quotes remain actual fields.
CREATE FUNCTION public.vnext_launch_csv_rows_v1(body bytea,maximum_rows integer) RETURNS SETOF text[]
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $csv$
DECLARE size integer:=octet_length(body); pos integer:=0; first integer:=0; ch integer; quoted boolean:=false; closed boolean:=false;
 field bytea:=''::bytea; fields text[]:=ARRAY[]::text[]; decoded text; rows integer:=0; end_field boolean; end_row boolean;
BEGIN
 IF size NOT BETWEEN 2 AND 3145728 OR maximum_rows NOT BETWEEN 2 AND 16001 THEN RAISE EXCEPTION 'launch_csv_raw_bound'; END IF;
 decoded:=convert_from(body,'UTF8');
 IF size>=3 AND substring(body FROM 1 FOR 3)=decode('efbbbf','hex') THEN pos:=3;first:=3; END IF;
 WHILE pos<size LOOP
  ch:=get_byte(body,pos);end_field:=false;end_row:=false;
  IF quoted THEN
   IF ch=34 THEN
    field:=field||substring(body FROM first+1 FOR pos-first);
    IF pos+1<size AND get_byte(body,pos+1)=34 THEN field:=field||decode('22','hex');pos:=pos+2;first:=pos;CONTINUE;
    ELSE quoted:=false;closed:=true;pos:=pos+1;first:=pos;CONTINUE;END IF;
   END IF;
  ELSIF ch IN(44,10,13) THEN
   IF NOT closed THEN field:=field||substring(body FROM first+1 FOR pos-first);END IF;
   end_field:=true;end_row:=ch<>44;
   IF ch=13 THEN IF pos+1>=size OR get_byte(body,pos+1)<>10 THEN RAISE EXCEPTION 'launch_csv_line_ending_invalid';END IF;pos:=pos+1;END IF;
  ELSIF closed THEN RAISE EXCEPTION 'launch_csv_quote_invalid';
  ELSIF ch=34 THEN
   IF pos<>first OR octet_length(field)<>0 THEN RAISE EXCEPTION 'launch_csv_quote_invalid';END IF;
   quoted:=true;pos:=pos+1;first:=pos;CONTINUE;
  END IF;
  IF end_field THEN
   decoded:=convert_from(field,'UTF8');IF char_length(decoded)>1024 THEN RAISE EXCEPTION 'launch_csv_cell_bound';END IF;
   fields:=array_append(fields,decoded);IF cardinality(fields)>32 THEN RAISE EXCEPTION 'launch_csv_column_bound';END IF;
   field:=''::bytea;closed:=false;first:=pos+1;
   IF end_row THEN rows:=rows+1;IF rows>maximum_rows THEN RAISE EXCEPTION 'launch_csv_row_bound';END IF;RETURN NEXT fields;fields:=ARRAY[]::text[];END IF;
  END IF;
  IF octet_length(field)+pos-first>4096 THEN RAISE EXCEPTION 'launch_csv_cell_bound';END IF;
  pos:=pos+1;
 END LOOP;
 IF quoted THEN RAISE EXCEPTION 'launch_csv_quote_invalid';END IF;
 IF NOT closed THEN field:=field||substring(body FROM first+1 FOR size-first);END IF;
 IF closed OR octet_length(field)>0 OR cardinality(fields)>0 THEN
  decoded:=convert_from(field,'UTF8');IF char_length(decoded)>1024 OR cardinality(fields)>=32 THEN RAISE EXCEPTION 'launch_csv_cell_bound';END IF;
  fields:=array_append(fields,decoded);rows:=rows+1;IF rows>maximum_rows THEN RAISE EXCEPTION 'launch_csv_row_bound';END IF;RETURN NEXT fields;
 END IF;
END $csv$;

CREATE FUNCTION public.vnext_launch_csv_integer_v1(value text,signed_value boolean DEFAULT false) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n numeric;
BEGIN
 IF length(value)>30 OR btrim(value) !~ '^-?([0-9]+|[0-9]{1,3}(,[0-9]{3})+)$' THEN RAISE EXCEPTION 'launch_csv_integer_invalid';END IF;
 n:=replace(btrim(value),',','')::numeric;
 IF n>9007199254740991 OR n<CASE WHEN signed_value THEN -9007199254740991 ELSE 0 END THEN RAISE EXCEPTION 'launch_csv_integer_invalid';END IF;
 RETURN n::bigint;
END $$;
CREATE FUNCTION public.vnext_launch_csv_decimal_v1(value text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n numeric;
BEGIN
 IF length(value)>32 OR btrim(value) !~ '^([0-9]+(\.[0-9]+)?|[0-9]{1,3}(,[0-9]{3})+(\.[0-9]+)?)$' THEN RAISE EXCEPTION 'launch_csv_decimal_invalid';END IF;
 n:=replace(btrim(value),',','')::numeric;IF n<=0 OR n>9007199254740991 THEN RAISE EXCEPTION 'launch_csv_decimal_invalid';END IF;RETURN n;
END $$;
CREATE FUNCTION public.vnext_launch_csv_date_v1(value text) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE parts text[]; result date; year_no integer;
BEGIN
 IF value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN result:=value::date;IF to_char(result,'YYYY-MM-DD')<>value THEN RAISE EXCEPTION 'launch_csv_date_invalid';END IF;RETURN result;END IF;
 parts:=regexp_match(btrim(value),'^([0-9]{3,4})[/-]?([0-9]{2})[/-]?([0-9]{2})$');
 IF parts IS NULL THEN RAISE EXCEPTION 'launch_csv_date_invalid';END IF;year_no:=parts[1]::integer;
 IF year_no<1911 THEN year_no:=year_no+1911;END IF;
 RETURN make_date(year_no,parts[2]::integer,parts[3]::integer);
END $$;

CREATE FUNCTION public.vnext_launch_csv_profile_v1(dataset integer,request_key text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $profile$
DECLARE day date; month_profile boolean:=dataset IN(11391,11755); headers text[]; url text; coverage text;
BEGIN
 IF dataset NOT IN(11370,11371,11856,11391,11755) OR request_key IS NULL THEN RAISE EXCEPTION 'launch_csv_profile_invalid';END IF;
 IF month_profile THEN
  IF request_key !~ '^20[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'launch_csv_request_invalid';END IF;day:=(request_key||'-01')::date;
 ELSE IF request_key !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'launch_csv_request_invalid';END IF;day:=request_key::date;END IF;
 IF to_char(day,CASE WHEN month_profile THEN 'YYYY-MM' ELSE 'YYYY-MM-DD' END)<>request_key THEN RAISE EXCEPTION 'launch_csv_request_invalid';END IF;
 CASE dataset
 WHEN 11370 THEN
  headers:=ARRAY['資料日期','代號','名稱','收盤','漲跌','開盤','最高','最低','均價','成交股數','成交金額','成交筆數','最後買價','最後賣價','發行股數','次日參考價','次日漲停價','次日跌停價'];
  url:='https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date='||replace(to_char(day,'YYYY-MM-DD'),'-','%2F')||'&response=data&type=DailyClose';coverage:='tpex_11370_all_sessions_v1';
 WHEN 11371 THEN
  headers:=ARRAY['資料日期','代號','名稱','收盤','漲跌','開盤','最高','最低','成交股數','成交金額','成交筆數','最後買價','最後賣價','發行股數','次日漲停價','次日跌停價'];
  url:='https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430_result.php?l=zh-tw&o=data&se=EW&d='||(extract(year FROM day)::integer-1911)::text||'%2F'||to_char(day,'MM')||'%2F'||to_char(day,'DD');coverage:='tpex_11371_report_excluding_fixed_price_v1';
 WHEN 11856 THEN
  headers:=ARRAY['資料日期','代號','名稱','外資及陸資不含外資自營商買進股數','外資及陸資不含外資自營商賣出股數','外資及陸資不含外資自營商買賣超股數','外資自營商買進股數','外資自營商賣出股數','外資自營商買賣超股數','外資及陸資買進股數','外資及陸資賣出股數','外資及陸資買賣超股數','投信買進股數','投信賣出股數','投信買賣超股數','自營商自行買賣買進股數','自營商自行買賣賣出股數','自營商自行買賣買賣超股數','自營商避險買進股數','自營商避險賣出股數','自營商避險買賣超股數','自營商買進股數','自營商賣出股數','自營商買賣超股數','三大法人買賣超股數合計'];
  url:='https://www.tpex.org.tw/web/stock/3insti/DAILY_TradE/3itrade_hedge_result.php?l=zh-tw&o=data&se=EW&t=D&d='||(extract(year FROM day)::integer-1911)::text||'%2F'||to_char(day,'MM')||'%2F'||to_char(day,'DD');coverage:='tpex_11856_combined_sessions_v1';
 WHEN 11391 THEN headers:=ARRAY['資料日期','開市','最高價','最低價','收市','漲跌'];url:='https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?response=data&date='||replace(to_char(day,'YYYY-MM-DD'),'-','%2F');coverage:='tpex_official_index_v1';
 WHEN 11755 THEN headers:=ARRAY['日期','開盤指數','最高指數','最低指數','收盤指數'];url:='https://www.twse.com.tw/indicesReport/MI_5MINS_HIST?response=open_data&date='||to_char(day,'YYYYMMDD');coverage:='twse_official_index_v1';
 END CASE;
 RETURN jsonb_build_object('datasetId',dataset,'requestKey',request_key,'sourceUrl',url,'provider',CASE WHEN dataset=11755 THEN 'twse' ELSE 'tpex' END,
  'exchange',CASE WHEN dataset=11755 THEN 'TWSE' ELSE 'TPEX' END,'queueDataset',CASE WHEN dataset IN(11391,11755) THEN 'market_index' WHEN dataset=11856 THEN 'institutional_flow' ELSE 'daily_price' END,
  'sessionDate',day,'header',headers,'maximumBytes',CASE WHEN dataset=11370 THEN 3145728 ELSE 500000 END,
  'maximumRows',CASE WHEN dataset=11370 THEN 16001 WHEN month_profile THEN 32 ELSE 5001 END,'coverage',coverage,
  'datasetUrl','https://data.gov.tw/dataset/'||dataset::text,'licenseUrl','https://data.gov.tw/license',
  'owner','Securities and Futures Bureau, Financial Supervisory Commission','license','Taiwan Open Government Data License 1.0','licenseVersion','1.0',
  'resourceMappingVersion',CASE WHEN dataset=11370 THEN 'tpex-11370-dated-csv-resource-map-v1' ELSE 'licensed-launch-csv-resource-map-v1' END,
  'resourceMappingEvidence',CASE WHEN dataset=11370 THEN '20c961ba458428800d4234e7c33d92ebf06228a0' ELSE 'licensed-launch-csv-reviewed-source-v1' END);
END $profile$;

-- Membership scope is copied into each immutable capture. A later pool/input
-- change never changes that capture's parse scope or rewrites its facts.
-- This is NOT ordinary-instrument/venue/liquidity/qualification authority.
CREATE FUNCTION public.vnext_launch_csv_pool_v1() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE targets jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('symbol',symbol,'inputHash',input_hash,'admittedSession',admitted_session,
  'state',state,'memberUpdatedAt',updated_at) ORDER BY symbol),'[]'::jsonb) INTO targets FROM public.vnext_members_v1 WHERE state<>'exited';
 IF jsonb_array_length(targets)>20 OR EXISTS(SELECT FROM jsonb_array_elements(targets) t WHERE t->>'symbol' !~ '^[0-9]{4}$') THEN RAISE EXCEPTION 'launch_csv_active_pool_bound';END IF;
 RETURN jsonb_build_object('targets',targets,'revision',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(targets),'UTF8')),'hex'));
END $$;
ALTER FUNCTION public.vnext_launch_csv_pool_v1() OWNER TO stockinsider_vnext_owner;

CREATE FUNCTION public.vnext_launch_csv_derive_v1(dataset integer,request_key text,body bytea) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $derive$
DECLARE profile jsonb:=public.vnext_launch_csv_profile_v1(dataset,request_key); pool jsonb:=public.vnext_launch_csv_pool_v1(); records jsonb; row_item jsonb; fields text[]; day date;
 facts jsonb:='[]'::jsonb; fact jsonb; code text; o numeric;h numeric;l numeric;c numeric; shares bigint;amount bigint;issued bigint;buy bigint;sell bigint;net bigint;trust bigint;
BEGIN
 IF octet_length(body)>(profile->>'maximumBytes')::integer THEN RAISE EXCEPTION 'launch_csv_profile_byte_bound';END IF;
 SELECT jsonb_agg(to_jsonb(item) ORDER BY ordinal) INTO records FROM public.vnext_launch_csv_rows_v1(body,(profile->>'maximumRows')::integer) WITH ORDINALITY AS parsed(item,ordinal);
 IF jsonb_array_length(records)<2 OR records->0 IS DISTINCT FROM profile->'header'
 OR EXISTS(SELECT FROM jsonb_array_elements(records) r WHERE jsonb_array_length(r)<>jsonb_array_length(profile->'header')) THEN RAISE EXCEPTION 'launch_csv_header_or_width_invalid';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(records) WITH ORDINALITY r(item,ordinal) WHERE ordinal>1 GROUP BY item->>0,CASE WHEN dataset IN(11391,11755) THEN 'INDEX' ELSE item->>1 END HAVING count(*)>1) THEN RAISE EXCEPTION 'launch_csv_duplicate_identity';END IF;
 FOR row_item IN SELECT item FROM jsonb_array_elements(records) WITH ORDINALITY r(item,ordinal) WHERE ordinal>1 LOOP
  SELECT array_agg(value ORDER BY ordinal) INTO fields FROM jsonb_array_elements_text(row_item) WITH ORDINALITY f(value,ordinal);
  day:=public.vnext_launch_csv_date_v1(fields[1]);
  IF CASE WHEN dataset IN(11391,11755) THEN to_char(day,'YYYY-MM')<>request_key ELSE to_char(day,'YYYY-MM-DD')<>request_key END THEN RAISE EXCEPTION 'launch_csv_row_session_mismatch';END IF;
  code:=CASE WHEN dataset IN(11391,11755) THEN 'INDEX' ELSE fields[2] END;
  IF code<>'INDEX' AND code !~ '^[0-9A-Za-z]{2,12}$' THEN RAISE EXCEPTION 'launch_csv_symbol_invalid';END IF;
  IF dataset NOT IN(11391,11755) AND (code !~ '^[0-9]{4}$' OR NOT EXISTS(SELECT FROM jsonb_array_elements(pool->'targets') t WHERE t->>'symbol'=code)) THEN CONTINUE;END IF;
  fact:=jsonb_build_object('session',day,'symbol',code);o:=NULL;h:=NULL;l:=NULL;c:=NULL;
  IF dataset IN(11391,11755) THEN
   o:=public.vnext_launch_csv_decimal_v1(fields[2]);h:=public.vnext_launch_csv_decimal_v1(fields[3]);l:=public.vnext_launch_csv_decimal_v1(fields[4]);c:=public.vnext_launch_csv_decimal_v1(fields[5]);
  ELSIF dataset IN(11370,11371) THEN
   shares:=public.vnext_launch_csv_integer_v1(fields[CASE WHEN dataset=11370 THEN 10 ELSE 9 END]);
   amount:=public.vnext_launch_csv_integer_v1(fields[CASE WHEN dataset=11370 THEN 11 ELSE 10 END]);
   issued:=public.vnext_launch_csv_integer_v1(fields[CASE WHEN dataset=11370 THEN 15 ELSE 14 END]);
   IF issued<=0 THEN RAISE EXCEPTION 'launch_csv_issued_shares_invalid';END IF;
   -- Missing/nontraded OHLC remains null. It cannot qualify a price window.
   IF fields[4] NOT IN('--','-','') OR fields[6] NOT IN('--','-','') OR fields[7] NOT IN('--','-','') OR fields[8] NOT IN('--','-','') THEN
    c:=public.vnext_launch_csv_decimal_v1(fields[4]);o:=public.vnext_launch_csv_decimal_v1(fields[6]);h:=public.vnext_launch_csv_decimal_v1(fields[7]);l:=public.vnext_launch_csv_decimal_v1(fields[8]);
   END IF;
   fact:=fact||jsonb_build_object('shares',shares,'tradedNtd',amount,'issuedShares',issued);
  ELSE
   buy:=public.vnext_launch_csv_integer_v1(fields[4]);sell:=public.vnext_launch_csv_integer_v1(fields[5]);net:=public.vnext_launch_csv_integer_v1(fields[6],true);
   IF buy-sell<>net THEN RAISE EXCEPTION 'launch_csv_foreign_net_invalid';END IF;
   buy:=public.vnext_launch_csv_integer_v1(fields[13]);sell:=public.vnext_launch_csv_integer_v1(fields[14]);trust:=public.vnext_launch_csv_integer_v1(fields[15],true);
   IF buy-sell<>trust THEN RAISE EXCEPTION 'launch_csv_trust_net_invalid';END IF;
   fact:=fact||jsonb_build_object('foreignNetShares',net,'trustNetShares',trust);
  END IF;
  IF c IS NOT NULL AND (h<greatest(o,c) OR l>least(o,c) OR h<l) THEN RAISE EXCEPTION 'launch_csv_ohlc_invalid';END IF;
  IF dataset<>11856 THEN fact:=fact||jsonb_build_object('rawOpen',o,'rawHigh',h,'rawLow',l,'rawClose',c);END IF;
  facts:=facts||jsonb_build_array(fact);
 END LOOP;
 RETURN jsonb_build_object('profile',profile,'pool',pool,'rowCount',jsonb_array_length(records)-1,'headerHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(records->0),'UTF8')),'hex'),'facts',facts);
END $derive$;

-- This guard reads only the old vNext authority owned by the existing owner.
CREATE FUNCTION public.vnext_launch_csv_policy_v1(principal text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE mode public.vnext_launch_csv_mode_v1; policy public.vnext_source_policies_v1;
BEGIN
 SELECT * INTO mode FROM public.vnext_launch_csv_mode_v1 WHERE singleton;
 IF NOT mode.enabled OR mode.required_writer_release IS NULL
 OR NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced)
 OR NOT EXISTS(SELECT FROM public.vnext_principals_v1 p WHERE p.principal=vnext_launch_csv_policy_v1.principal AND p.enabled AND p.role='operator') THEN RAISE EXCEPTION 'launch_csv_operator_mode_required';END IF;
 SELECT * INTO policy FROM public.vnext_source_policies_v1 WHERE source='official' AND scope='official_original' AND enabled AND valid_until>statement_timestamp();
 IF policy.source IS NULL THEN RAISE EXCEPTION 'launch_csv_current_official_rights_required';END IF;
 RETURN jsonb_build_object('requiredWriterRelease',mode.required_writer_release,'rightsBindingHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(to_jsonb(policy)),'UTF8')),'hex'));
END $$;
ALTER FUNCTION public.vnext_launch_csv_policy_v1(text) OWNER TO stockinsider_vnext_owner;

-- Owner is set to the EXISTING private-artifact owner below. No old table ACL
-- is widened. Receipt registration is durability, not source/score approval.
CREATE FUNCTION public.vnext_launch_csv_backend_v1(lease_owner uuid,artifact_hash text DEFAULT NULL,byte_length integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE backend uuid; receipt public.private_artifact_receipts_v1; lease_expiry timestamptz; headers jsonb;
BEGIN
 backend:=public.assert_stockinsider_backend_request_v1(true);
 IF backend IS NULL OR lease_owner IS NULL THEN RAISE EXCEPTION 'launch_csv_active_backend_required';END IF;
 SELECT expires_at INTO lease_expiry FROM public.production_write_leases WHERE lease_key='production-data-plane'
 AND owner_id::text=lease_owner::text AND expires_at>clock_timestamp() FOR SHARE;
 IF lease_expiry IS NULL THEN RAISE EXCEPTION 'launch_csv_exact_owned_lease_required';END IF;
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 IF (SELECT count(*) FROM public.production_writer_releases WHERE active)<>1 OR NOT EXISTS(SELECT FROM public.production_writer_releases
  WHERE active AND writer_kind='vps' AND release_id=headers->>'x-stockinsider-writer-release') THEN RAISE EXCEPTION 'launch_csv_active_writer_release_required';END IF;
 IF artifact_hash IS NOT NULL THEN
  SELECT * INTO receipt FROM public.private_artifact_receipts_v1 a WHERE a.artifact_hash=vnext_launch_csv_backend_v1.artifact_hash;
  IF receipt.artifact_hash IS NULL OR receipt.byte_length IS DISTINCT FROM byte_length OR receipt.purpose<>'diagnostic_attachment'
  OR receipt.media_type<>'text/csv' THEN RAISE EXCEPTION 'launch_csv_artifact_receipt_mismatch';END IF;
 END IF;
 RETURN jsonb_build_object('backendId',backend,'writerRelease',headers->>'x-stockinsider-writer-release','leaseExpiresAt',lease_expiry,
  'artifactRecordedAt',receipt.recorded_at);
END $$;

-- Guard both legacy completion and old canonical persistence. An old binary
-- may claim a bound job, but can never complete/relabel it or mutate history.
CREATE FUNCTION public.vnext_launch_csv_legacy_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT FROM public.vnext_launch_csv_bindings_v1 b WHERE b.job_id=NEW.job_id) THEN
  IF TG_TABLE_NAME='taiwan_data_canonical_results_v5' THEN RAISE EXCEPTION 'launch_csv_legacy_completion_forbidden';END IF;
  IF NEW.status='terminal' AND (current_setting('stockinsider.launch_csv_completion',true) IS DISTINCT FROM NEW.job_id::text
   OR NOT EXISTS(SELECT FROM public.vnext_launch_csv_outcomes_v1 outcome JOIN public.vnext_launch_csv_attempts_v1 attempt USING(attempt_id)
    WHERE attempt.job_id=NEW.job_id AND attempt.attempt_order=NEW.attempts
    AND CASE WHEN outcome.outcome='complete' THEN NEW.terminal_status='complete' AND NEW.terminal_result->>'captureId'=outcome.capture_id::text
      ELSE NEW.terminal_status='schema_invalid' AND NEW.terminal_result->>'terminal'='failed' END)) THEN RAISE EXCEPTION 'launch_csv_legacy_completion_forbidden';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER launch_csv_legacy_terminal_guard BEFORE UPDATE ON public.taiwan_data_refresh_queue_v5 FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_legacy_guard_v1();
CREATE TRIGGER launch_csv_legacy_canonical_guard BEFORE INSERT ON public.taiwan_data_canonical_results_v5 FOR EACH ROW EXECUTE FUNCTION public.vnext_launch_csv_legacy_guard_v1();

CREATE FUNCTION public.vnext_launch_csv_hash_v1(value jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to(public.vnext_catalog_canonical_v1(value),'UTF8')),'hex')
$$;
ALTER FUNCTION public.vnext_launch_csv_hash_v1(jsonb) OWNER TO stockinsider_vnext_owner;

-- Classification only. It grants no capture/source/lease authority. Every
-- claimed job is classified before legacy provider IO, including when OFF.
CREATE FUNCTION public.vnext_launch_csv_dispatch_v1(p_job_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN EXISTS(SELECT FROM public.vnext_launch_csv_bindings_v1 WHERE job_id=p_job_id)
  THEN jsonb_build_object('bound',true,'configured',coalesce((SELECT enabled FROM public.vnext_launch_csv_mode_v1 WHERE singleton),false))
  ELSE jsonb_build_object('bound',false) END
$$;
ALTER FUNCTION public.vnext_launch_csv_dispatch_v1(uuid) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_launch_csv_dispatch_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_launch_csv_dispatch_v1(uuid) TO service_role;

CREATE FUNCTION public.vnext_launch_csv_command_v1(p_principal text,p_lease_owner uuid,p_operation text,p_request jsonb,p_body bytea DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='30s' SET lock_timeout='2s' AS $command$
DECLARE policy jsonb; backend jsonb; profile jsonb; binding public.vnext_launch_csv_bindings_v1; job public.taiwan_data_refresh_queue_v5;
 attempt public.vnext_launch_csv_attempts_v1; outcome public.vnext_launch_csv_outcomes_v1; capture public.vnext_launch_csv_captures_v1; ack public.vnext_launch_csv_ready_acks_v1;
 at timestamptz:=clock_timestamp(); digest text; queue_key text; queue_owner text; picked uuid; results jsonb:='[]';
 result jsonb; derived jsonb; fact jsonb; observed timestamptz; artifact text; available timestamptz; maximum integer;
 session_day date; planned integer:=0; target_market text; date_key text;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'launch_csv_read_committed_required';END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>8192 THEN RAISE EXCEPTION 'launch_csv_closed_request';END IF;
 PERFORM pg_advisory_xact_lock(610091002);PERFORM pg_advisory_xact_lock(2409,6002);PERFORM pg_advisory_xact_lock(64221022);
 at:=clock_timestamp();
 policy:=public.vnext_launch_csv_policy_v1(p_principal);backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
 IF backend->>'writerRelease' IS DISTINCT FROM policy->>'requiredWriterRelease' THEN RAISE EXCEPTION 'launch_csv_cutover_release_required';END IF;
 queue_owner:='launch-csv:'||p_lease_owner::text;
 IF p_operation='lease-check' THEN
  IF p_request<>'{}'::jsonb OR p_body IS NOT NULL THEN RAISE EXCEPTION 'launch_csv_closed_lease_check';END IF;
  IF NOT EXISTS(SELECT FROM public.vnext_members_v1 WHERE state<>'exited') THEN RAISE EXCEPTION 'launch_csv_admission_required';END IF;
  RETURN jsonb_build_object('owned',true,'owner',p_lease_owner,'backendId',backend->>'backendId');
 ELSIF p_operation='enqueue-current' THEN
  IF p_request<>'{}'::jsonb OR p_body IS NOT NULL THEN RAISE EXCEPTION 'launch_csv_closed_plan';END IF;
  IF NOT EXISTS(SELECT FROM public.vnext_members_v1 WHERE state<>'exited') THEN RETURN jsonb_build_object('schemaVersion','licensed-launch-csv-plan-v1','jobs',0,'session',NULL,'sourceAuthority',false);END IF;
  IF (SELECT count(*) FROM public.vnext_members_v1 WHERE state<>'exited')>20 THEN RAISE EXCEPTION 'launch_csv_active_pool_bound';END IF;
  SELECT session_date INTO session_day FROM public.vnext_sessions_v1 WHERE completed AND close_at<=at ORDER BY session_date DESC LIMIT 1;
  IF session_day IS NULL OR session_day<>(at AT TIME ZONE 'Asia/Taipei')::date THEN RAISE EXCEPTION 'launch_csv_completed_current_session_required';END IF;
  FOR target_market IN SELECT unnest(ARRAY['TWSE','TPEX']) LOOP
   FOR date_key IN SELECT DISTINCT to_char(session_id,'YYYY-MM') FROM(
    SELECT session_id FROM(SELECT DISTINCT ON(session_id) session_id,status,close_at FROM public.tw_trading_sessions_v3
     WHERE market::text=target_market AND provider::text=lower(target_market) AND session_id<=session_day AND source_timestamp<=at AND collected_at<=at AND recorded_at<=at
     ORDER BY session_id,recorded_at DESC,session_authority_id)heads WHERE status::text='completed' AND close_at<=at ORDER BY session_id DESC LIMIT 240)days LOOP
    PERFORM public.vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue',jsonb_build_object('datasetId',CASE WHEN target_market='TWSE' THEN 11755 ELSE 11391 END,'requestKey',date_key),NULL);planned:=planned+1;
   END LOOP;
  END LOOP;
  FOR date_key IN SELECT session_id::text FROM(SELECT DISTINCT ON(session_id) session_id,status,close_at FROM public.tw_trading_sessions_v3
    WHERE market::text='TPEX' AND provider::text='tpex' AND session_id<=session_day AND source_timestamp<=at AND collected_at<=at AND recorded_at<=at
    ORDER BY session_id,recorded_at DESC,session_authority_id)heads WHERE status::text='completed' AND close_at<=at ORDER BY session_id DESC LIMIT 57 LOOP
   PERFORM public.vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue',jsonb_build_object('datasetId',11371,'requestKey',date_key),NULL);planned:=planned+1;
   IF planned>200 THEN RAISE EXCEPTION 'launch_csv_plan_bound';END IF;
  END LOOP;
  FOR date_key IN SELECT session_id::text FROM(SELECT DISTINCT ON(session_id) session_id,status,close_at FROM public.tw_trading_sessions_v3
    WHERE market::text='TPEX' AND provider::text='tpex' AND session_id<=session_day AND source_timestamp<=at AND collected_at<=at AND recorded_at<=at
    ORDER BY session_id,recorded_at DESC,session_authority_id)heads WHERE status::text='completed' AND close_at<=at ORDER BY session_id DESC LIMIT 21 LOOP
   PERFORM public.vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue',jsonb_build_object('datasetId',11370,'requestKey',date_key),NULL);
   PERFORM public.vnext_launch_csv_command_v1(p_principal,p_lease_owner,'enqueue',jsonb_build_object('datasetId',11856,'requestKey',date_key),NULL);planned:=planned+2;
   IF planned>200 THEN RAISE EXCEPTION 'launch_csv_plan_bound';END IF;
  END LOOP;
  RETURN jsonb_build_object('schemaVersion','licensed-launch-csv-plan-v1','jobs',planned,'session',session_day,'sourceAuthority',false);
 ELSIF p_operation='enqueue' THEN
  IF NOT EXISTS(SELECT FROM public.vnext_members_v1 WHERE state<>'exited') THEN RAISE EXCEPTION 'launch_csv_admission_required';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_request))<>2 OR NOT(p_request ?& ARRAY['datasetId','requestKey'])
  OR jsonb_typeof(p_request->'datasetId') IS DISTINCT FROM 'number' OR (p_request->>'datasetId')::numeric<>trunc((p_request->>'datasetId')::numeric)
  OR jsonb_typeof(p_request->'requestKey') IS DISTINCT FROM 'string' OR p_body IS NOT NULL THEN RAISE EXCEPTION 'launch_csv_closed_enqueue';END IF;
  profile:=public.vnext_launch_csv_profile_v1((p_request->>'datasetId')::integer,p_request->>'requestKey');
  IF (profile->>'sessionDate')::date>(at AT TIME ZONE 'Asia/Taipei')::date THEN RAISE EXCEPTION 'launch_csv_future_request';END IF;
  -- At most one immutable capture generation per resource and real Taipei day.
  -- Later corrections get a new job/capture; old facts are never overwritten.
  digest:=public.vnext_launch_csv_hash_v1(jsonb_build_array('licensed-launch-csv-binding-v1',profile,(at AT TIME ZONE 'Asia/Taipei')::date));queue_key:=digest;
  SELECT * INTO binding FROM public.vnext_launch_csv_bindings_v1 WHERE binding_hash=digest;
  IF binding.job_id IS NOT NULL THEN RETURN jsonb_build_object('bound',true,'jobId',binding.job_id,'bindingHash',digest,'replay',true);END IF;
  INSERT INTO public.taiwan_data_refresh_queue_v5(queue_key,dataset,symbol,exchange,refresh_phase,requested_session_date,status,next_attempt_at,queued_at,updated_at)
   VALUES(queue_key,profile->>'queueDataset',NULL,profile->>'exchange','final',(profile->>'sessionDate')::date,'queued',at,at,at) RETURNING * INTO job;
  INSERT INTO public.vnext_launch_csv_bindings_v1(job_id,dataset_id,request_key,capture_generation,profile_version,source_url,binding_hash)
   VALUES(job.job_id,(profile->>'datasetId')::integer,profile->>'requestKey',(at AT TIME ZONE 'Asia/Taipei')::date,'licensed-launch-csv-v1',profile->>'sourceUrl',digest);
  RETURN jsonb_build_object('bound',true,'jobId',job.job_id,'bindingHash',digest,'replay',false);
 ELSIF p_operation='claim' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_request))<>1 OR jsonb_typeof(p_request->'limit') IS DISTINCT FROM 'number'
  OR (p_request->>'limit')::numeric<>trunc((p_request->>'limit')::numeric) OR p_body IS NOT NULL THEN RAISE EXCEPTION 'launch_csv_closed_claim';END IF;
  maximum:=(p_request->>'limit')::integer;IF maximum NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'launch_csv_claim_bound';END IF;
  IF NOT EXISTS(SELECT FROM public.vnext_members_v1 WHERE state<>'exited') THEN RETURN jsonb_build_object('schemaVersion','licensed-launch-csv-claims-v1','jobs','[]'::jsonb);END IF;
  FOR picked IN SELECT q.job_id FROM public.taiwan_data_refresh_queue_v5 q JOIN public.vnext_launch_csv_bindings_v1 b USING(job_id)
   WHERE q.attempts<3 AND ((q.status='queued' AND coalesce(q.next_attempt_at,q.queued_at)<=at) OR (q.status='running' AND q.lease_expires_at<at))
   ORDER BY q.queued_at,q.job_id FOR UPDATE OF q SKIP LOCKED LIMIT maximum LOOP
   UPDATE public.taiwan_data_refresh_queue_v5 SET status='running',attempts=attempts+1,lease_owner=queue_owner,
    lease_expires_at=least(at+interval '120 seconds',(backend->>'leaseExpiresAt')::timestamptz),updated_at=at WHERE job_id=picked RETURNING * INTO job;
   SELECT * INTO binding FROM public.vnext_launch_csv_bindings_v1 WHERE job_id=picked;
   INSERT INTO public.vnext_launch_csv_attempts_v1(job_id,attempt_order,queue_owner,lease_owner,backend_id,started_at,deadline_at)
    VALUES(picked,job.attempts,queue_owner,p_lease_owner,(backend->>'backendId')::uuid,at,job.lease_expires_at) RETURNING * INTO attempt;
   results:=results||jsonb_build_array(jsonb_build_object('jobId',picked,'attemptId',attempt.attempt_id,'datasetId',binding.dataset_id,
    'requestKey',binding.request_key,'sourceUrl',binding.source_url,'deadlineAt',attempt.deadline_at));
  END LOOP;
  RETURN jsonb_build_object('schemaVersion','licensed-launch-csv-claims-v1','jobs',results);
 ELSIF p_operation='adopt' THEN
  IF NOT EXISTS(SELECT FROM public.vnext_members_v1 WHERE state<>'exited') THEN RAISE EXCEPTION 'launch_csv_admission_required';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_request))<>2 OR NOT(p_request ?& ARRAY['jobId','queueOwner']) OR p_body IS NOT NULL
  OR jsonb_typeof(p_request->'queueOwner')<>'string' OR length(p_request->>'queueOwner') NOT BETWEEN 16 AND 200 THEN RAISE EXCEPTION 'launch_csv_closed_adopt';END IF;
  SELECT * INTO job FROM public.taiwan_data_refresh_queue_v5 WHERE job_id=(p_request->>'jobId')::uuid FOR UPDATE;
  SELECT * INTO binding FROM public.vnext_launch_csv_bindings_v1 WHERE job_id=job.job_id;
  IF binding.job_id IS NULL OR job.status<>'running' OR job.lease_owner IS DISTINCT FROM p_request->>'queueOwner'
  OR job.lease_expires_at<=clock_timestamp() OR job.attempts NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'launch_csv_genuine_claim_required';END IF;
  UPDATE public.taiwan_data_refresh_queue_v5 SET lease_owner=queue_owner,lease_expires_at=least(at+interval '120 seconds',(backend->>'leaseExpiresAt')::timestamptz),updated_at=at
   WHERE job_id=job.job_id RETURNING * INTO job;
  INSERT INTO public.vnext_launch_csv_attempts_v1(job_id,attempt_order,queue_owner,lease_owner,backend_id,started_at,deadline_at)
   VALUES(job.job_id,job.attempts,queue_owner,p_lease_owner,(backend->>'backendId')::uuid,at,job.lease_expires_at) RETURNING * INTO attempt;
  RETURN jsonb_build_object('jobId',job.job_id,'attemptId',attempt.attempt_id,'datasetId',binding.dataset_id,'requestKey',binding.request_key,'sourceUrl',binding.source_url,'deadlineAt',attempt.deadline_at);
 ELSIF p_operation='lookup' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_request))<>1 OR NOT(p_request ? 'jobId') OR p_body IS NOT NULL THEN RAISE EXCEPTION 'launch_csv_closed_lookup';END IF;
  SELECT * INTO binding FROM public.vnext_launch_csv_bindings_v1 WHERE job_id=(p_request->>'jobId')::uuid;
  IF binding.job_id IS NULL THEN RETURN jsonb_build_object('bound',false);END IF;
  RETURN jsonb_build_object('bound',true,'jobId',binding.job_id,'datasetId',binding.dataset_id,'requestKey',binding.request_key,'sourceUrl',binding.source_url);
 ELSIF p_operation='ready' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_request))<>2 OR NOT(p_request ?& ARRAY['attemptId','captureId']) OR p_body IS NOT NULL THEN RAISE EXCEPTION 'launch_csv_closed_ready';END IF;
  SELECT * INTO capture FROM public.vnext_launch_csv_captures_v1 WHERE capture_id=(p_request->>'captureId')::uuid AND attempt_id=(p_request->>'attemptId')::uuid;
  IF capture.capture_id IS NULL OR capture.created_xid=txid_current() OR NOT EXISTS(SELECT FROM public.vnext_launch_csv_outcomes_v1 o JOIN public.vnext_launch_csv_attempts_v1 a USING(attempt_id)
   JOIN public.taiwan_data_refresh_queue_v5 q ON q.job_id=a.job_id WHERE o.capture_id=capture.capture_id AND o.outcome='complete' AND q.status='terminal'
   AND q.terminal_result->>'captureId'=capture.capture_id::text) THEN RAISE EXCEPTION 'launch_csv_committed_capture_missing';END IF;
  backend:=public.vnext_launch_csv_backend_v1(p_lease_owner);
  at:=clock_timestamp();
  INSERT INTO public.vnext_launch_csv_ready_acks_v1(capture_id,backend_id,recorded_at) VALUES(capture.capture_id,(backend->>'backendId')::uuid,at)
   ON CONFLICT(capture_id) DO NOTHING;
  GET DIAGNOSTICS maximum=ROW_COUNT;
  SELECT * INTO ack FROM public.vnext_launch_csv_ready_acks_v1 WHERE capture_id=capture.capture_id;
  IF maximum=1 THEN INSERT INTO public.vnext_audit_v1(principal,command,request,result)
   VALUES(p_principal,'launch-source-ready',jsonb_build_object('attemptId',capture.attempt_id,'captureId',capture.capture_id),jsonb_build_object('readyAckId',ack.ack_id,'recordedAt',ack.recorded_at));END IF;
  RETURN jsonb_build_object('schema','licensed-launch-csv-ready-v1','captureId',capture.capture_id,'readyAckId',ack.ack_id,'availableAt',greatest(capture.available_at,ack.recorded_at));
 ELSIF p_operation='receipt' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_request))<>1 OR NOT(p_request ? 'attemptId') OR p_body IS NOT NULL THEN RAISE EXCEPTION 'launch_csv_closed_receipt';END IF;
  SELECT * INTO outcome FROM public.vnext_launch_csv_outcomes_v1 WHERE attempt_id=(p_request->>'attemptId')::uuid;
  IF outcome.attempt_id IS NULL THEN RETURN jsonb_build_object('recorded',false);END IF;
  RETURN jsonb_build_object('recorded',true,'outcome',outcome.outcome,'captureId',outcome.capture_id,'reason',outcome.reason,'historicalReceipt',true);
 ELSIF p_operation NOT IN('complete','fail') THEN RAISE EXCEPTION 'launch_csv_operation_invalid';END IF;

 SELECT * INTO attempt FROM public.vnext_launch_csv_attempts_v1 WHERE attempt_id=(p_request->>'attemptId')::uuid;
 IF attempt.attempt_id IS NULL THEN RAISE EXCEPTION 'launch_csv_attempt_missing';END IF;
 SELECT * INTO job FROM public.taiwan_data_refresh_queue_v5 WHERE job_id=attempt.job_id FOR UPDATE;
 SELECT * INTO binding FROM public.vnext_launch_csv_bindings_v1 WHERE job_id=attempt.job_id;
 IF job.status<>'running' OR job.lease_owner<>attempt.queue_owner OR attempt.queue_owner<>queue_owner OR attempt.lease_owner<>p_lease_owner
 OR attempt.backend_id<>(backend->>'backendId')::uuid OR job.lease_expires_at<=clock_timestamp() OR attempt.deadline_at<=clock_timestamp()
 OR job.attempts<>attempt.attempt_order THEN RAISE EXCEPTION 'launch_csv_attempt_owner_or_deadline_lost';END IF;
 IF EXISTS(SELECT FROM public.vnext_launch_csv_outcomes_v1 WHERE attempt_id=attempt.attempt_id) THEN RAISE EXCEPTION 'launch_csv_attempt_already_settled';END IF;
 profile:=public.vnext_launch_csv_profile_v1(binding.dataset_id,binding.request_key);
 IF binding.source_url<>profile->>'sourceUrl' OR binding.binding_hash<>public.vnext_launch_csv_hash_v1(jsonb_build_array('licensed-launch-csv-binding-v1',profile,binding.capture_generation)) THEN RAISE EXCEPTION 'launch_csv_binding_changed';END IF;
 IF p_operation='fail' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_request))<>2 OR NOT(p_request ?& ARRAY['attemptId','reason']) OR p_body IS NOT NULL
  OR p_request->>'reason' NOT IN('transport_failed','response_rejected','artifact_failed','parser_rejected') THEN RAISE EXCEPTION 'launch_csv_closed_failure';END IF;
  INSERT INTO public.vnext_launch_csv_outcomes_v1(attempt_id,outcome,reason) VALUES(attempt.attempt_id,'failed',p_request->>'reason');
  result:=jsonb_build_object('schema','licensed-launch-csv-completion-v1','terminal','failed','actionEligible',false,'captureId',NULL);
 ELSE
  IF (SELECT count(*) FROM jsonb_object_keys(p_request))<>7 OR NOT(p_request ?& ARRAY['attemptId','artifactHash','observedAt','httpStatus','redirectCount','contentType','responseUrl'])
  OR p_request->'httpStatus' IS DISTINCT FROM '200'::jsonb OR p_request->'redirectCount' IS DISTINCT FROM '0'::jsonb
  OR jsonb_typeof(p_request->'contentType') IS DISTINCT FROM 'string' OR jsonb_typeof(p_request->'observedAt') IS DISTINCT FROM 'string'
  OR length(p_request->>'contentType') NOT BETWEEN 1 AND 128
  OR position(chr(10) IN p_request->>'contentType')>0 OR position(chr(13) IN p_request->>'contentType')>0
  OR lower(btrim(split_part(p_request->>'contentType',';',1))) NOT IN('text/csv','application/csv')
  OR p_request->>'responseUrl' IS DISTINCT FROM binding.source_url OR p_body IS NULL THEN RAISE EXCEPTION 'launch_csv_closed_transport';END IF;
  artifact:=encode(sha256(p_body),'hex');observed:=(p_request->>'observedAt')::timestamptz;
  IF artifact IS DISTINCT FROM p_request->>'artifactHash' OR NOT isfinite(observed) OR observed<attempt.started_at OR observed>clock_timestamp()
  OR octet_length(p_body)>(profile->>'maximumBytes')::integer THEN RAISE EXCEPTION 'launch_csv_raw_capture_invalid';END IF;
  backend:=public.vnext_launch_csv_backend_v1(p_lease_owner,artifact,octet_length(p_body));
  derived:=public.vnext_launch_csv_derive_v1(binding.dataset_id,binding.request_key,p_body);
  -- Recheck the exact owner AFTER bounded parsing and before any new fact write.
  backend:=public.vnext_launch_csv_backend_v1(p_lease_owner,artifact,octet_length(p_body));at:=clock_timestamp();
  IF attempt.deadline_at<=at OR job.lease_expires_at<=at THEN RAISE EXCEPTION 'launch_csv_attempt_owner_or_deadline_lost';END IF;
  available:=greatest(at,observed,(backend->>'artifactRecordedAt')::timestamptz);
  INSERT INTO public.vnext_launch_csv_captures_v1(attempt_id,artifact_hash,dataset_id,request_key,source_url,provider,observed_at,publisher_published_at,
   byte_length,header_hash,reported_content_type,parser_version,coverage,row_count,rights_binding_hash,pool_revision,pool_targets,recorded_at,available_at)
   VALUES(attempt.attempt_id,artifact,binding.dataset_id,binding.request_key,binding.source_url,profile->>'provider',observed,NULL,
    octet_length(p_body),derived->>'headerHash',p_request->>'contentType','licensed-launch-csv-sql-v1',profile->>'coverage',(derived->>'rowCount')::integer,policy->>'rightsBindingHash',
    derived->'pool'->>'revision',derived->'pool'->'targets',at,available) RETURNING * INTO capture;
  FOR fact IN SELECT value FROM jsonb_array_elements(derived->'facts') LOOP
   INSERT INTO public.vnext_launch_csv_facts_v1(capture_id,session_date,symbol,raw_open,raw_high,raw_low,raw_close,shares,traded_ntd,issued_shares,foreign_net_shares,trust_net_shares,fact_hash)
    VALUES(capture.capture_id,(fact->>'session')::date,fact->>'symbol',(fact->>'rawOpen')::numeric,(fact->>'rawHigh')::numeric,(fact->>'rawLow')::numeric,(fact->>'rawClose')::numeric,
     (fact->>'shares')::bigint,(fact->>'tradedNtd')::bigint,(fact->>'issuedShares')::bigint,(fact->>'foreignNetShares')::bigint,(fact->>'trustNetShares')::bigint,public.vnext_launch_csv_hash_v1(fact));
  END LOOP;
  INSERT INTO public.vnext_launch_csv_outcomes_v1(attempt_id,capture_id,outcome,reason) VALUES(attempt.attempt_id,capture.capture_id,'complete','sql_derived_licensed_csv');
  result:=jsonb_build_object('schema','licensed-launch-csv-completion-v1','terminal','complete','actionEligible',false,
   'legacyCanonical','not_applicable','captureId',capture.capture_id,'facts',(SELECT count(*) FROM public.vnext_launch_csv_facts_v1 WHERE capture_id=capture.capture_id));
 END IF;
 PERFORM public.vnext_launch_csv_backend_v1(p_lease_owner);
 PERFORM set_config('stockinsider.launch_csv_completion',job.job_id::text,true);
 UPDATE public.taiwan_data_refresh_queue_v5 SET status='terminal',terminal_status=CASE WHEN p_operation='complete' THEN 'complete' ELSE 'schema_invalid' END,
  terminal_result=result,completed_at=clock_timestamp(),lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=NULL,updated_at=clock_timestamp() WHERE job_id=job.job_id;
 INSERT INTO public.vnext_audit_v1(principal,command,request,result) VALUES(p_principal,'launch-source-'||p_operation,jsonb_build_object('attemptId',attempt.attempt_id,'jobId',job.job_id),result);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 -- Malformed external CSV/date/numeric values never appear in RPC errors.
 RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='launch_csv_command_rejected';
END $command$;

-- Only NEW object ACLs are granted. Cross-owner guards keep old private tables
-- private; no old function body, table ACL or policy is modified.
DO $owners$
DECLARE artifact_owner text; queue_owner text; signature text; table_name text;
BEGIN
 SELECT pg_get_userbyid(relowner) INTO artifact_owner FROM pg_class WHERE oid='public.private_artifact_receipts_v1'::regclass;
 SELECT pg_get_userbyid(relowner) INTO queue_owner FROM pg_class WHERE oid='public.taiwan_data_refresh_queue_v5'::regclass;
 EXECUTE format('ALTER FUNCTION public.vnext_launch_csv_backend_v1(uuid,text,integer) OWNER TO %I',artifact_owner);
 EXECUTE format('ALTER FUNCTION public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea) OWNER TO %I',queue_owner);
 ALTER FUNCTION public.vnext_launch_csv_legacy_guard_v1() OWNER TO stockinsider_vnext_owner;
 FOREACH signature IN ARRAY ARRAY['vnext_launch_csv_rows_v1(bytea,integer)','vnext_launch_csv_integer_v1(text,boolean)','vnext_launch_csv_decimal_v1(text)','vnext_launch_csv_date_v1(text)','vnext_launch_csv_profile_v1(integer,text)'] LOOP
  EXECUTE 'ALTER FUNCTION public.'||signature||' OWNER TO stockinsider_vnext_owner';
 END LOOP;
 ALTER FUNCTION public.vnext_launch_csv_derive_v1(integer,text,bytea) OWNER TO stockinsider_vnext_owner;
 ALTER FUNCTION public.vnext_launch_csv_derive_v1(integer,text,bytea) SECURITY DEFINER;
 FOREACH signature IN ARRAY ARRAY['vnext_launch_csv_rows_v1(bytea,integer)','vnext_launch_csv_integer_v1(text,boolean)','vnext_launch_csv_decimal_v1(text)','vnext_launch_csv_date_v1(text)','vnext_launch_csv_profile_v1(integer,text)','vnext_launch_csv_pool_v1()','vnext_launch_csv_derive_v1(integer,text,bytea)','vnext_launch_csv_policy_v1(text)','vnext_launch_csv_hash_v1(jsonb)','vnext_launch_csv_backend_v1(uuid,text,integer)','vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea)','vnext_launch_csv_legacy_guard_v1()'] LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||signature||' FROM PUBLIC,anon,authenticated,service_role';
  IF signature<>'vnext_launch_csv_legacy_guard_v1()' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO %I',signature,queue_owner);END IF;
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['vnext_launch_csv_bindings_v1','vnext_launch_csv_attempts_v1','vnext_launch_csv_captures_v1','vnext_launch_csv_facts_v1','vnext_launch_csv_outcomes_v1','vnext_launch_csv_ready_acks_v1'] LOOP
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO %I',table_name,queue_owner);
 END LOOP;
 -- The existing audit owner retains the writer fence; grant only a NEW narrow
 -- audit adapter in the subsequent ranking migration if owners differ.
 IF queue_owner<>'stockinsider_vnext_owner' AND NOT EXISTS(SELECT FROM pg_roles WHERE rolname=queue_owner AND rolsuper) THEN
  RAISE EXCEPTION 'launch_csv_queue_owner_private_audit_adapter_required';
 END IF;
 GRANT EXECUTE ON FUNCTION public.vnext_launch_csv_command_v1(text,uuid,text,jsonb,bytea) TO service_role;
END $owners$;
COMMIT;
