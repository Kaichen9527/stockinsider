-- SOURCE CANDIDATE: public original fiscal/calendar/fixed-forecast-share producer.
-- No change to original v3 financial enums/facts, role/schema privileges or budgets.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='2s';SELECT pg_advisory_xact_lock(64221022);
CREATE TEMP TABLE vnext_fiscal_before_v1(value jsonb NOT NULL) ON COMMIT DROP;
DO $pre$
DECLARE snapshot jsonb;catalog_sql constant text:=$catalog$
 SELECT jsonb_build_object(
  'namespace',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid='public'::regnamespace),
  'routines',(SELECT coalesce(jsonb_agg(CASE WHEN p.oid=ANY($1) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid),'[]'::jsonb) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND NOT(p.oid=ANY($2))),
  'relations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_class c WHERE c.relnamespace='public'::regnamespace),
  'columns',(SELECT coalesce(jsonb_agg(CASE WHEN EXISTS(SELECT FROM jsonb_each($3) edge WHERE a.attrelid=to_regclass('public.'||edge.key) AND edge.value ? a.attname) THEN to_jsonb(a)-'attacl' ELSE to_jsonb(a) END ORDER BY a.attrelid,a.attnum),'[]'::jsonb) FROM pg_attribute a WHERE a.attrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'types',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_type t WHERE t.typnamespace='public'::regnamespace),
  'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_constraint c WHERE c.connamespace='public'::regnamespace),
  'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) FROM pg_attrdef d WHERE d.adrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid),'[]'::jsonb) FROM pg_index i WHERE i.indrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND NOT(p.polname='vnext_target_read_v1' AND EXISTS(SELECT FROM jsonb_each($3) edge WHERE p.polrelid=to_regclass('public.'||edge.key)))),
  'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'rules',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.oid),'[]'::jsonb) FROM pg_rewrite r WHERE r.ev_class IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'operators',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.oid),'[]'::jsonb) FROM pg_operator o WHERE o.oprnamespace='public'::regnamespace),
  'collations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_collation c WHERE c.collnamespace='public'::regnamespace),
  'defaultAcls',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.oid),'[]'::jsonb) FROM pg_default_acl a WHERE a.defaclnamespace IN(0,'public'::regnamespace)),
  'roleSettings',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.setdatabase,s.setrole),'[]'::jsonb) FROM pg_db_role_setting s),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rolname) FROM pg_roles r),
  'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]'::jsonb) FROM pg_auth_members m))
 $catalog$;
BEGIN
 IF EXISTS(SELECT FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('vnext_disclosed_fiscal_internal_v1','vnext_fiscal_current_internal_v1','vnext_fiscal_preparation_guard_v1')) THEN RAISE EXCEPTION 'vnext_fiscal_first_install_required';END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN('opportunity_v3_rpc_owner','stockinsider_vnext_owner') AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL)<>2 OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole IN('opportunity_v3_rpc_owner'::regrole,'stockinsider_vnext_owner'::regrole) AND setconfig IS NOT NULL) THEN RAISE EXCEPTION 'vnext_fiscal_owner_profile';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_forecast_current_internal_v1(uuid,text,timestamptz)'::regprocedure AND pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='507f6e7ffb24af6cc6a4dbd34090b79065ae566fdb3831b9a0fa3e0588268016') THEN RAISE EXCEPTION 'vnext_fiscal_exact_predecessor';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_forecast_evidence_current_internal_v1(jsonb,text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='56ceca2c904e3e00c08f424ae52cd23bc0b08e5c5a6adb4af0de8e7d4c493d5b') THEN RAISE EXCEPTION 'vnext_fiscal_exact_predecessor';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_forecast_input_current_internal_v1(jsonb,text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='73259367f3d9383e09d704bf226b0d4856cd04ea7362f44aae978a8770584f00') THEN RAISE EXCEPTION 'vnext_fiscal_exact_predecessor';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=pg_catalog, public'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='571152fe153c72656f128c5c995a726cd994f8698080cf1f8cc7d179bcf0619d') THEN RAISE EXCEPTION 'vnext_fiscal_exact_predecessor';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_forecast_current_internal_v1(uuid,text,timestamptz)'::regprocedure)<>2 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_forecast_current_internal_v1(uuid,text,timestamptz)'::regprocedure AND (a.grantee NOT IN(p.proowner,'stockinsider_vnext_owner'::regrole::oid) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_fiscal_predecessor_acl';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_forecast_evidence_current_internal_v1(jsonb,text)'::regprocedure)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_forecast_evidence_current_internal_v1(jsonb,text)'::regprocedure AND (a.grantee NOT IN(p.proowner) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_fiscal_predecessor_acl';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_forecast_input_current_internal_v1(jsonb,text)'::regprocedure)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_forecast_input_current_internal_v1(jsonb,text)'::regprocedure AND (a.grantee NOT IN(p.proowner) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_fiscal_predecessor_acl';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure AND (a.grantee NOT IN(p.proowner) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_fiscal_predecessor_acl';END IF;
 EXECUTE catalog_sql INTO snapshot USING ARRAY['public.vnext_forecast_current_internal_v1(uuid,text,timestamptz)'::regprocedure::oid,'public.vnext_forecast_evidence_current_internal_v1(jsonb,text)'::regprocedure::oid,'public.vnext_forecast_input_current_internal_v1(jsonb,text)'::regprocedure::oid,'public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure::oid],ARRAY[]::oid[],'{}'::jsonb;INSERT INTO vnext_fiscal_before_v1 VALUES(snapshot);
END $pre$;
CREATE FUNCTION public.vnext_disclosed_fiscal_internal_v1(body text,cutoff date) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fiscal_parser$
DECLARE labels constant jsonb:='{"symbol":"股票代號","yearStartMonth":"會計年度起始月","yearLabel":"財年標示","kind":"預測期間類型","shareBasis":"預測股數基礎","shares":"預測固定股數","sharesStart":"股數假設開始日期","sharesEnd":"股數假設結束日期","sharesAssumption":"期間股數假設","incomeUnit":"預估淨利單位","incomeScope":"預估淨利歸屬"}'::jsonb;
 entry record;line text;label text;field text;v jsonb:='{}';spans jsonb:='{}';rows_json jsonb:='[]';r jsonb;parsed jsonb;calculation jsonb;offset_cp integer:=0;parts text[];y integer;q integer;m integer;kind text;basis text;start_day date;end_day date;expected_start date;expected_end date;prior_end date;shares numeric;income numeric;total numeric:=0;eps numeric;key_value text;period_value text;
BEGIN
 IF body IS NULL OR octet_length(body)>307200 OR body<>normalize(body,NFKC) OR body ~ E'[\\r\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f]' OR cutoff IS NULL OR NOT isfinite(cutoff) THEN RETURN NULL;END IF;
 FOREACH line IN ARRAY string_to_array(body,E'\n') LOOP
  FOR entry IN SELECT * FROM jsonb_each_text(labels) LOOP
   label:=entry.value||':';field:=entry.key;
   IF left(line,length(label))=label THEN
    IF v ? field OR left(line,length(label)+1)<>label||' ' OR line<>rtrim(line) THEN RETURN NULL;END IF;
    v:=v||jsonb_build_object(field,substr(line,length(label)+2));spans:=spans||jsonb_build_object(field,jsonb_build_object('startCp',offset_cp,'endCp',offset_cp+length(line),'quote',line));
   END IF;
  END LOOP;
  IF left(line,4)='預估列:' THEN
   IF left(line,5)<>'預估列: ' OR jsonb_array_length(rows_json)>=4 OR line<>rtrim(line) THEN RETURN NULL;END IF;
   parts:=string_to_array(substr(line,6),'|');
   IF cardinality(parts)<>5 OR parts[1] !~ '^[0-9]{4}$' OR parts[2] !~ '^([1-4]|A)$' OR parts[3] !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR parts[4] !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR parts[5] !~ '^-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,6})?$' OR parts[5]='-0' THEN RETURN NULL;END IF;
   y:=parts[1]::integer;q:=CASE WHEN parts[2]='A' THEN NULL ELSE parts[2]::integer END;start_day:=parts[3]::date;end_day:=parts[4]::date;income:=parts[5]::numeric;
   IF y<1900 OR y>2199 OR start_day::text<>parts[3] OR end_day::text<>parts[4] THEN RETURN NULL;END IF;
   rows_json:=rows_json||jsonb_build_array(jsonb_build_object('year',y,'quarter',q,'start',start_day,'end',end_day,'commonIncome',trim_scale(income)::text));
   spans:=spans||jsonb_build_object('row'||jsonb_array_length(rows_json)::text,jsonb_build_object('startCp',offset_cp,'endCp',offset_cp+length(line),'quote',line));total:=total+income;
  END IF;
  offset_cp:=offset_cp+length(line)+1;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(v))<>11 OR v->>'symbol' !~ '^[0-9]{4}$' OR v->>'yearStartMonth' !~ '^([1-9]|1[0-2])$' OR v->>'yearLabel'<>'起始年' OR v->>'kind' NOT IN('全年度','未來四季') OR v->>'shareBasis' NOT IN('基本','稀釋') OR v->>'shares' !~ '^[1-9][0-9]{0,11}$' OR v->>'sharesStart' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v->>'sharesEnd' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR v->>'sharesAssumption'<>'明示預測期間固定股數' OR v->>'incomeUnit'<>'TWD' OR v->>'incomeScope'<>'普通股股東' THEN RETURN NULL;END IF;
 IF (v->>'sharesStart')::date::text<>v->>'sharesStart' OR (v->>'sharesEnd')::date::text<>v->>'sharesEnd' OR (v->>'sharesStart')::date>(v->>'sharesEnd')::date THEN RETURN NULL;END IF;
 kind:=CASE v->>'kind' WHEN '全年度' THEN 'annual' ELSE 'four_quarters' END;basis:=CASE v->>'shareBasis' WHEN '基本' THEN 'basic' ELSE 'diluted' END;m:=(v->>'yearStartMonth')::integer;shares:=(v->>'shares')::numeric;
 IF jsonb_array_length(rows_json)<>(CASE kind WHEN 'annual' THEN 1 ELSE 4 END) THEN RETURN NULL;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(rows_json) LOOP
  y:=(r->>'year')::integer;q:=(r->>'quarter')::integer;start_day:=(r->>'start')::date;end_day:=(r->>'end')::date;
  IF (kind='annual' AND q IS NOT NULL) OR (kind='four_quarters' AND q IS NULL) THEN RETURN NULL;END IF;
  expected_start:=(make_date(y,m,1)+make_interval(months=>3*(coalesce(q,1)-1)))::date;expected_end:=(expected_start+make_interval(months=>CASE kind WHEN 'annual' THEN 12 ELSE 3 END)-interval'1 day')::date;
  IF start_day<>expected_start OR end_day<>expected_end OR (prior_end IS NOT NULL AND start_day<>prior_end+1) OR start_day<(v->>'sharesStart')::date OR end_day>(v->>'sharesEnd')::date THEN RETURN NULL;END IF;prior_end:=end_day;
 END LOOP;
 start_day:=(rows_json->0->>'start')::date;end_day:=(rows_json->-1->>'end')::date;
 IF kind='annual' THEN
  IF end_day<cutoff OR start_day>make_date(extract(year FROM cutoff)::integer+1,12,31) THEN RETURN NULL;END IF;
 ELSE
  IF start_day<=cutoff OR cutoff<(start_day-interval'3 months')::date THEN RETURN NULL;END IF;
 END IF;
 IF mod(total*1000000,shares)<>0 THEN RETURN NULL;END IF;eps:=trim_scale(total/shares);
 IF eps<>0 AND (abs(eps)<0.000001 OR abs(eps)>=1e21) THEN RETURN NULL;END IF;
 key_value:=CASE WHEN kind='annual' THEN 'source_annual_forecast_eps' WHEN m=1 THEN 'next_four_quarter_eps' ELSE 'source_next_four_fiscal_quarter_eps' END;
 period_value:=CASE WHEN key_value='next_four_quarter_eps' THEN (rows_json->0->>'year')||'-Q'||(rows_json->0->>'quarter')||'/'||(rows_json->-1->>'year')||'-Q'||(rows_json->-1->>'quarter') ELSE start_day::text||'/'||end_day::text END;
 parsed:=jsonb_build_object('schemaVersion','vnext-disclosed-fiscal-forecast-v1','symbol',v->'symbol','kind',kind,'yearStartMonth',m,'yearLabel','starting_year','shareBasis',basis,'shares',v->'shares','sharesStart',v->'sharesStart','sharesEnd',v->'sharesEnd','sharesAssumption','source_disclosed_fixed_forecast_denominator','rows',rows_json,'spans',spans);
 calculation:=jsonb_build_object('key',key_value,'value',eps,'unit','TWD_per_share','period',period_value,'periodStart',start_day,'periodEnd',end_day,'numeratorCommonIncome',trim_scale(total)::text,'denominatorShares',v->'shares','shareBasis',basis,'reported',false);
 RETURN jsonb_build_object('parsed',parsed,'calculation',calculation);
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range OR division_by_zero THEN RETURN NULL;
END
$fiscal_parser$;
ALTER FUNCTION public.vnext_disclosed_fiscal_internal_v1(text,date) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_disclosed_fiscal_internal_v1(text,date) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_fiscal_current_internal_v1(p_stock uuid,p_symbol text,p_cutoff timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' SET timezone='UTC' AS $fiscal_reader$
DECLARE policy public.vnext_forecast_rights_v1;verification public.source_publication_verifications_v3;revision public.source_document_revisions_v3;publisher public.publisher_verification_authorities_v3;identity_row public.source_identity_authorities_v3;manifest public.opportunity_manifests_v3;payload jsonb;url text;latest_time timestamptz;canonical_hash text;parsed jsonb;calc jsonb;core jsonb;item jsonb;known_at timestamptz;observed_at timestamptz:=statement_timestamp();evidence jsonb:='[]';receipts jsonb:='[]';gaps jsonb:='[]';amount integer:=0;role_name text;conflicts text[];
BEGIN
 IF p_stock IS NULL OR p_symbol !~ '^[0-9]{4}$' OR p_cutoff IS NULL OR NOT isfinite(p_cutoff) OR p_cutoff>observed_at THEN RAISE EXCEPTION 'vnext_fiscal_scope';END IF;
 FOR policy IN SELECT r.* FROM public.vnext_forecast_rights_v1 r WHERE r.stock_id=p_stock AND r.operation='allow' AND r.license_basis='public_issuer_guidance' AND r.permitted_use='structured_numeric_forecast' AND r.recorded_at<=p_cutoff AND r.valid_from<=p_cutoff AND r.valid_until>observed_at AND NOT EXISTS(SELECT FROM public.vnext_forecast_rights_v1 revoked WHERE revoked.verification_id=r.verification_id AND revoked.operation='revoke') ORDER BY r.recorded_at,r.policy_id LIMIT 17 LOOP
  amount:=amount+1;IF amount>16 THEN RAISE EXCEPTION 'vnext_fiscal_original_bound';END IF;
  SELECT * INTO verification FROM public.source_publication_verifications_v3 WHERE verification_id=policy.verification_id AND recorded_at<=p_cutoff AND collected_at<=p_cutoff;
  IF verification.verification_id IS NULL THEN gaps:=gaps||'"fiscal_publication_binding_missing"'::jsonb;CONTINUE;END IF;
  SELECT * INTO revision FROM public.source_document_revisions_v3 d WHERE d.revision_id=verification.revision_id;
  IF revision.revision_id IS NULL OR NOT EXISTS(SELECT FROM public.source_revision_family_registry_v3 family WHERE family.source_key=revision.source_key AND family.revision_family_key=revision.revision_family_key AND family.approved_source_identity_id=revision.approved_source_identity_id AND family.stable_connector_document_id=revision.stable_connector_document_id AND family.registered_at<=p_cutoff) OR revision.acquisition_status::text<>'complete' OR revision.source_key::text<>'mops_material_event' OR revision.ingestion_canonical_content_hash_v3 IS DISTINCT FROM verification.canonical_content_hash OR revision.approved_source_identity_id IS DISTINCT FROM verification.publisher_identity_id OR revision.recorded_at>p_cutoff OR revision.collected_at>p_cutoff OR revision.published_at IS NULL OR revision.published_at>revision.collected_at OR verification.published_at IS DISTINCT FROM revision.published_at OR observed_at-verification.published_at>interval'90 days'
   OR EXISTS(SELECT FROM public.source_document_revisions_v3 newer WHERE newer.source_key=revision.source_key AND newer.revision_family_key=revision.revision_family_key AND (newer.recorded_at,newer.revision_id)>(revision.recorded_at,revision.revision_id)) THEN gaps:=gaps||'"fiscal_revision_or_source_window_unavailable"'::jsonb;CONTINUE;END IF;
  url:=revision.canonical_url_candidate;
  IF substring(url FROM '^https://([^/]+)/') NOT IN('mops.twse.com.tw','mopsov.twse.com.tw') OR url IS NULL OR url !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+/[^[:space:]@#?]*$' OR url ~* '(paid|member|premium|subscription|login|authenticate|telegram|investanchors|\.invalid|\.local|localhost)' THEN gaps:=gaps||'"fiscal_permitted_citation_missing"'::jsonb;CONTINUE;END IF;
  SELECT max(recorded_at) INTO latest_time FROM public.publisher_verification_authorities_v3 WHERE publisher_identity_id=verification.publisher_identity_id;
  IF (SELECT count(*) FROM public.publisher_verification_authorities_v3 WHERE publisher_identity_id=verification.publisher_identity_id AND recorded_at=latest_time)<>1 THEN gaps:=gaps||'"fiscal_publisher_conflict"'::jsonb;CONTINUE;END IF;
  SELECT * INTO publisher FROM public.publisher_verification_authorities_v3 WHERE publisher_identity_id=verification.publisher_identity_id AND recorded_at=latest_time;
  SELECT max(recorded_at) INTO latest_time FROM public.source_identity_authorities_v3 WHERE source_identity_id=revision.approved_source_identity_id AND source_key=revision.source_key;
  IF (SELECT count(*) FROM public.source_identity_authorities_v3 WHERE source_identity_id=revision.approved_source_identity_id AND source_key=revision.source_key AND recorded_at=latest_time)<>1 THEN gaps:=gaps||'"fiscal_identity_conflict"'::jsonb;CONTINUE;END IF;
  SELECT * INTO identity_row FROM public.source_identity_authorities_v3 WHERE source_identity_id=revision.approved_source_identity_id AND source_key=revision.source_key AND recorded_at=latest_time;
  IF publisher.status::text<>'active' OR identity_row.status::text<>'active' OR publisher.recorded_at>p_cutoff OR identity_row.recorded_at>p_cutoff OR publisher.approved_at>p_cutoff OR identity_row.approved_at>p_cutoff OR publisher.valid_from>p_cutoff OR identity_row.valid_from>p_cutoff OR publisher.valid_to<=observed_at OR identity_row.valid_to<=observed_at OR identity_row.authority_id IS DISTINCT FROM revision.source_identity_authority_id OR publisher.institution_identity IS DISTINCT FROM verification.institution_identity OR verification.institution_identity IS NULL OR publisher.source_class::text<>'official' OR identity_row.source_class IS DISTINCT FROM publisher.source_class OR NOT(substring(url FROM '^https://([^/]+)/')=ANY(publisher.domains))
   OR (policy.license_basis='public_issuer_disclosure' AND publisher.source_class::text<>'official') THEN gaps:=gaps||'"fiscal_current_publisher_or_identity_unavailable"'::jsonb;CONTINUE;END IF;
  SELECT * INTO manifest FROM public.opportunity_manifests_v3 WHERE manifest_id=verification.publisher_manifest_id;
  IF manifest.status::text IS DISTINCT FROM 'complete' OR manifest.manifest_kind::text IS DISTINCT FROM 'publisher_verification_allowlist' OR manifest.contract_version IS DISTINCT FROM 'source-publisher-allowlist-v3.0' OR manifest.terminal_at>p_cutoff OR manifest.source_cutoff>p_cutoff OR manifest.manifest_hash IS DISTINCT FROM encode(sha256(manifest.root_canonical),'hex') OR NOT EXISTS(SELECT FROM public.opportunity_manifest_rows_v3 row_item WHERE row_item.manifest_id=manifest.manifest_id AND row_item.section_key::text='rows' AND row_item.payload_json=jsonb_build_array(publisher.authority_id,publisher.publisher_identity_id,publisher.source_class,publisher.domains,publisher.feed_identity,publisher.institution_identity,publisher.valid_from,publisher.valid_to,publisher.approved_at,publisher.approving_principal_id,publisher.status,publisher.recorded_at) AND row_item.recorded_at<=p_cutoff AND row_item.payload_hash=encode(sha256(row_item.payload_canonical),'hex') AND convert_from(row_item.payload_canonical,'UTF8')::jsonb=row_item.payload_json) THEN gaps:=gaps||'"fiscal_manifest_binding_missing"'::jsonb;CONTINUE;END IF;
  payload:=revision.raw_field_payload;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'array' OR jsonb_array_length(payload)<>3 OR EXISTS(SELECT FROM jsonb_array_elements(payload) f WHERE jsonb_typeof(f)<>'string') THEN gaps:=gaps||'"fiscal_original_body_unavailable"'::jsonb;CONTINUE;END IF;
  canonical_hash:=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(jsonb_build_array(jsonb_build_array('title',normalize(regexp_replace(replace(replace(payload->>0,E'\r\n',E'\n'),E'\r',E'\n'),U&'^\FEFF',''),NFKC)),jsonb_build_array('summary',normalize(regexp_replace(replace(replace(payload->>1,E'\r\n',E'\n'),E'\r',E'\n'),U&'^\FEFF',''),NFKC)),jsonb_build_array('body',normalize(regexp_replace(replace(replace(payload->>2,E'\r\n',E'\n'),E'\r',E'\n'),U&'^\FEFF',''),NFKC)))),'UTF8')),'hex');
  IF canonical_hash IS DISTINCT FROM verification.canonical_content_hash THEN gaps:=gaps||'"fiscal_original_body_hash_mismatch"'::jsonb;CONTINUE;END IF;

  parsed:=public.vnext_disclosed_fiscal_internal_v1(payload->>2,(p_cutoff AT TIME ZONE 'Asia/Taipei')::date);
  IF parsed IS NULL OR parsed->'parsed'->>'symbol' IS DISTINCT FROM p_symbol THEN gaps:=gaps||'"fiscal_explicit_calendar_share_or_complete_period_missing"'::jsonb;CONTINUE;END IF;calc:=parsed->'calculation';
  -- A disclosed fixed forecast share basis cannot silently survive a later
  -- known capital action. Require a genuinely newer source declaration.
  IF EXISTS(SELECT FROM public.opportunity_corporate_action_events_v3 e JOIN public.opportunity_corporate_action_snapshots_v3 s USING(snapshot_id) WHERE e.symbol=p_symbol AND e.recorded_at<=p_cutoff AND s.recorded_at<=p_cutoff AND s.collected_at<=p_cutoff AND s.session_id>=(verification.published_at AT TIME ZONE 'Asia/Taipei')::date AND s.session_id<=(calc->>'periodEnd')::date) THEN gaps:=gaps||'"fiscal_share_basis_action_reconfirmation_required"'::jsonb;CONTINUE;END IF;
  known_at:=greatest(verification.recorded_at,revision.recorded_at,publisher.recorded_at,identity_row.recorded_at,policy.recorded_at,policy.valid_from,publisher.approved_at,publisher.valid_from,identity_row.approved_at,identity_row.valid_from,manifest.terminal_at);
  core:=jsonb_build_object('schemaVersion','vnext-fiscal-forecast-receipt-v1','stockId',p_stock,'symbol',p_symbol,'classification','source_disclosed_forecast_assumption_not_reported','verificationId',verification.verification_id,'revisionId',revision.revision_id,'sourceHash',verification.canonical_content_hash,'bodyHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(payload->2),'UTF8')),'hex'),'publisherAuthorityId',publisher.authority_id,'sourceAuthorityId',identity_row.authority_id,'policyId',policy.policy_id,'manifestHash',manifest.manifest_hash,'parsed',parsed->'parsed','calculation',calc);
  FOREACH role_name IN ARRAY ARRAY['eps','original'] LOOP
   item:=jsonb_build_object('id','fiscal-forecast:'||policy.policy_id::text||':'||verification.verification_id::text||':'||role_name,'key',CASE role_name WHEN 'eps' THEN calc->>'key' ELSE 'fiscal_forecast_original' END,'value',CASE role_name WHEN 'eps' THEN calc->'value' ELSE jsonb_build_object('schemaVersion','vnext-fiscal-forecast-original-v1','statement',payload->2) END,'period',CASE role_name WHEN 'eps' THEN calc->>'period' ELSE (calc->>'periodStart')||'/'||(calc->>'periodEnd') END,'source',url,'sourceTier','public','kind','assumption','eventAt',verification.published_at,'availableAt',known_at,'contentHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(core||jsonb_build_object('entryRole',role_name)),'UTF8')),'hex'));
   IF role_name='eps' THEN item:=item||jsonb_build_object('unit','TWD_per_share');END IF;
   evidence:=evidence||jsonb_build_array(item);receipts:=receipts||jsonb_build_array(core||jsonb_build_object('entryRole',role_name,'evidenceHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(item),'UTF8')),'hex')));
  END LOOP;
  IF octet_length(convert_to(evidence::text,'UTF8'))>1048576 THEN RAISE EXCEPTION 'vnext_fiscal_wire_bound';END IF;
 END LOOP;
 -- Contradictory current explicit numerators/denominators suppress BOTH rows,
 -- never choose one institution/value to manufacture a more attractive EPS.
 conflicts:=ARRAY(SELECT DISTINCT a->>'policyId' FROM jsonb_array_elements(receipts) a CROSS JOIN jsonb_array_elements(receipts) b WHERE a->>'entryRole'='eps' AND b->>'entryRole'='eps' AND a->'calculation'->>'key'=b->'calculation'->>'key' AND a->'calculation'->>'period'=b->'calculation'->>'period' AND a->'calculation'<>b->'calculation' ORDER BY a->>'policyId');
 IF cardinality(conflicts)>0 THEN
  SELECT coalesce(jsonb_agg(e ORDER BY ordinal),'[]'::jsonb) INTO evidence FROM jsonb_array_elements(evidence) WITH ORDINALITY item(e,ordinal) WHERE NOT(split_part(e->>'id',':',2)=ANY(conflicts));
  SELECT coalesce(jsonb_agg(r ORDER BY ordinal),'[]'::jsonb) INTO receipts FROM jsonb_array_elements(receipts) WITH ORDINALITY item(r,ordinal) WHERE NOT(r->>'policyId'=ANY(conflicts));gaps:=gaps||'"fiscal_conflicting_current_disclosures"'::jsonb;
 END IF;
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(evidence) e WHERE e->>'key'='source_annual_forecast_eps') THEN gaps:=gaps||'"fiscal_annual_forecast_missing"'::jsonb;END IF;
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(evidence) e WHERE e->>'key' IN('next_four_quarter_eps','source_next_four_fiscal_quarter_eps')) THEN gaps:=gaps||'"fiscal_next_four_quarter_forecast_missing"'::jsonb;END IF;
 item:=jsonb_build_object('evidence',evidence,'receipts',receipts,'gaps',(SELECT coalesce(jsonb_agg(DISTINCT value ORDER BY value),'[]'::jsonb) FROM jsonb_array_elements(gaps)));
 IF octet_length(convert_to(item::text,'UTF8'))>1048576 THEN RAISE EXCEPTION 'vnext_fiscal_wire_bound';END IF;RETURN item;
END
$fiscal_reader$;
ALTER FUNCTION public.vnext_fiscal_current_internal_v1(uuid,text,timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_fiscal_current_internal_v1(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_fiscal_preparation_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $fiscal_preparation$
DECLARE symbol_value text;started timestamptz;deadline timestamptz;
BEGIN
 SELECT symbol,started_at,deadline_at INTO symbol_value,started,deadline FROM public.vnext_jobs_v1 WHERE job_id=NEW.job_id;
 IF TG_OP<>'INSERT' OR symbol_value IS NULL OR NOT(NEW.evidence ? 'forecastSourceReceipts') OR NOT(NEW.evidence ? 'forecastSourceAsOf') OR public.vnext_forecast_input_current_internal_v1(NEW.evidence,symbol_value) IS DISTINCT FROM true THEN RAISE EXCEPTION 'vnext_fiscal_preparation_current_required';END IF;
 IF started IS NULL OR deadline IS NULL OR (NEW.evidence->>'forecastSourceAsOf')::timestamptz<started OR clock_timestamp()>deadline THEN RAISE EXCEPTION 'vnext_fiscal_preparation_window';END IF;RETURN NEW;
END
$fiscal_preparation$;
ALTER FUNCTION public.vnext_fiscal_preparation_guard_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_fiscal_preparation_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_fiscal_preparation_current BEFORE INSERT ON public.vnext_preparations_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_fiscal_preparation_guard_v1();
DO $replace0$
DECLARE target oid:='public.vnext_forecast_current_internal_v1(uuid,text,timestamptz)'::regprocedure;original text;definition text;metadata jsonb;changed constant text:=$successor0$
DECLARE fiscal jsonb;symbol_value text;fact record;verification public.source_publication_verifications_v3;revision public.source_document_revisions_v3;publisher public.publisher_verification_authorities_v3;identity_row public.source_identity_authorities_v3;policy public.vnext_forecast_rights_v1;manifest public.opportunity_manifests_v3;
 evidence jsonb:='[]'::jsonb;receipts jsonb:='[]'::jsonb;gaps jsonb:='[]'::jsonb;item jsonb;receipt jsonb;url text;term text;start_day date;end_day date;latest_time timestamptz;known_at timestamptz;observed_at timestamptz:=statement_timestamp();amount integer:=0;
BEGIN
 IF p_stock IS NULL OR p_cutoff IS NULL OR NOT isfinite(p_cutoff) OR p_cutoff>observed_at THEN RAISE EXCEPTION 'vnext_forecast_scope';END IF;
 -- Only the stock-owning private composition may supply this closed identity.
 -- The source owner receives no SELECT grant on stocks.
 symbol_value:=p_symbol;IF symbol_value IS NULL OR symbol_value !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'vnext_forecast_issuer';END IF;
 FOR fact IN SELECT f.* FROM public.opportunity_financial_facts_v3 f WHERE f.stock_id=p_stock AND f.estimate_kind IN('analyst_estimate','broker_consensus') AND f.recorded_at<=p_cutoff AND f.filing_published_at<=p_cutoff AND f.source_timestamp<=p_cutoff AND f.collected_at<=p_cutoff ORDER BY f.recorded_at DESC,f.fact_id LIMIT 201 LOOP
  amount:=amount+1;IF amount>200 THEN RAISE EXCEPTION 'vnext_forecast_fact_bound';END IF;
  -- Unknown periods/bases are not normalized to annual EPS, forward4Q or NTM.
  IF fact.unit::text<>'TWD_per_share' OR fact.value::text IN('NaN','Infinity','-Infinity') OR (fact.value<>0 AND (abs(fact.value)<0.000001 OR abs(fact.value)>=1e21)) OR fact.period_start IS NULL OR fact.period_start>fact.period_end OR fact.filing_published_at>fact.source_timestamp OR fact.source_timestamp>fact.collected_at OR fact.collected_at>fact.recorded_at THEN gaps:=gaps||'"forecast_original_period_or_unit_unavailable"'::jsonb;CONTINUE;END IF;
  IF fact.estimate_kind::text='analyst_estimate' AND fact.estimate_horizon::text='next_twelve_months' AND fact.fact_key::text='quarterly_diluted_eps' AND fact.duration_kind::text='quarterly' AND fact.period_end>(p_cutoff AT TIME ZONE 'Asia/Taipei')::date AND fact.period_end<=((fact.filing_published_at AT TIME ZONE 'Asia/Taipei')::date+interval'1 year')::date AND fact.period_start=date_trunc('quarter',fact.period_start)::date AND fact.period_end=(fact.period_start+interval'3 months'-interval'1 day')::date THEN term:='source_quarterly_diluted_eps_estimate';
  ELSIF fact.estimate_kind::text='broker_consensus' AND fact.estimate_horizon::text='target_12m' AND fact.fact_key::text='broker_target_price' AND fact.value>0 AND fact.period_end>(p_cutoff AT TIME ZONE 'Asia/Taipei')::date THEN
   start_day:=(fact.filing_published_at AT TIME ZONE 'Asia/Taipei')::date;end_day:=(start_day+interval'1 year'-interval'1 day')::date;
   IF fact.period_start IS DISTINCT FROM start_day OR fact.period_end IS DISTINCT FROM end_day THEN gaps:=gaps||'"forecast_target_horizon_unavailable"'::jsonb;CONTINUE;END IF;term:='source_target_price_12m';
  ELSE gaps:=gaps||'"forecast_horizon_not_supported"'::jsonb;CONTINUE;END IF;
  IF (SELECT count(*) FROM public.source_publication_verifications_v3 v WHERE v.evidence_ref=fact.source_ref AND v.recorded_at<=p_cutoff AND v.collected_at<=p_cutoff)<>1 THEN gaps:=gaps||'"forecast_publication_binding_missing"'::jsonb;CONTINUE;END IF;
  SELECT * INTO verification FROM public.source_publication_verifications_v3 v WHERE v.evidence_ref=fact.source_ref AND v.recorded_at<=p_cutoff AND v.collected_at<=p_cutoff;
  SELECT * INTO policy FROM public.vnext_forecast_rights_v1 r WHERE r.verification_id=verification.verification_id AND r.stock_id=p_stock AND r.operation='allow' AND r.recorded_at<=p_cutoff AND r.valid_from<=p_cutoff AND r.valid_until>observed_at AND NOT EXISTS(SELECT FROM public.vnext_forecast_rights_v1 revoked WHERE revoked.verification_id=r.verification_id AND revoked.operation='revoke');
  IF policy.policy_id IS NULL THEN gaps:=gaps||'"forecast_current_use_permission_missing"'::jsonb;CONTINUE;END IF;
  SELECT * INTO revision FROM public.source_document_revisions_v3 d WHERE d.revision_id=verification.revision_id;
  IF revision.revision_id IS NULL OR NOT EXISTS(SELECT FROM public.source_revision_family_registry_v3 family WHERE family.source_key=revision.source_key AND family.revision_family_key=revision.revision_family_key AND family.approved_source_identity_id=revision.approved_source_identity_id AND family.stable_connector_document_id=revision.stable_connector_document_id AND family.registered_at<=p_cutoff) OR revision.acquisition_status::text<>'complete' OR revision.source_key::text NOT IN('public_broker_research','earnings_call','mops_material_event') OR revision.ingestion_canonical_content_hash_v3 IS DISTINCT FROM verification.canonical_content_hash OR revision.approved_source_identity_id IS DISTINCT FROM verification.publisher_identity_id OR revision.recorded_at>p_cutoff OR revision.collected_at>p_cutoff OR revision.published_at IS NULL OR revision.published_at>revision.collected_at OR verification.published_at IS DISTINCT FROM revision.published_at OR fact.filing_published_at IS DISTINCT FROM verification.published_at OR observed_at-verification.published_at>interval'90 days'
   OR EXISTS(SELECT FROM public.source_document_revisions_v3 newer WHERE newer.source_key=revision.source_key AND newer.revision_family_key=revision.revision_family_key AND (newer.recorded_at,newer.revision_id)>(revision.recorded_at,revision.revision_id)) THEN gaps:=gaps||'"forecast_revision_or_source_window_unavailable"'::jsonb;CONTINUE;END IF;
  url:=revision.canonical_url_candidate;
  IF url IS NULL OR url !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+/[^[:space:]@#?]*$' OR url ~* '(paid|member|premium|subscription|login|authenticate|telegram|investanchors|\.invalid|\.local|localhost)' THEN gaps:=gaps||'"forecast_permitted_citation_missing"'::jsonb;CONTINUE;END IF;
  SELECT max(recorded_at) INTO latest_time FROM public.publisher_verification_authorities_v3 WHERE publisher_identity_id=verification.publisher_identity_id;
  IF (SELECT count(*) FROM public.publisher_verification_authorities_v3 WHERE publisher_identity_id=verification.publisher_identity_id AND recorded_at=latest_time)<>1 THEN gaps:=gaps||'"forecast_publisher_conflict"'::jsonb;CONTINUE;END IF;
  SELECT * INTO publisher FROM public.publisher_verification_authorities_v3 WHERE publisher_identity_id=verification.publisher_identity_id AND recorded_at=latest_time;
  SELECT max(recorded_at) INTO latest_time FROM public.source_identity_authorities_v3 WHERE source_identity_id=revision.approved_source_identity_id AND source_key=revision.source_key;
  IF (SELECT count(*) FROM public.source_identity_authorities_v3 WHERE source_identity_id=revision.approved_source_identity_id AND source_key=revision.source_key AND recorded_at=latest_time)<>1 THEN gaps:=gaps||'"forecast_identity_conflict"'::jsonb;CONTINUE;END IF;
  SELECT * INTO identity_row FROM public.source_identity_authorities_v3 WHERE source_identity_id=revision.approved_source_identity_id AND source_key=revision.source_key AND recorded_at=latest_time;
  IF publisher.status::text<>'active' OR identity_row.status::text<>'active' OR publisher.recorded_at>p_cutoff OR identity_row.recorded_at>p_cutoff OR publisher.approved_at>p_cutoff OR identity_row.approved_at>p_cutoff OR publisher.valid_from>p_cutoff OR identity_row.valid_from>p_cutoff OR publisher.valid_to<=observed_at OR identity_row.valid_to<=observed_at OR identity_row.authority_id IS DISTINCT FROM revision.source_identity_authority_id OR publisher.institution_identity IS DISTINCT FROM verification.institution_identity OR verification.institution_identity IS NULL OR publisher.source_class::text NOT IN('official','public_research') OR identity_row.source_class IS DISTINCT FROM publisher.source_class OR NOT(substring(url FROM '^https://([^/]+)/')=ANY(publisher.domains))
   OR (policy.license_basis='public_issuer_guidance' AND publisher.source_class::text<>'official') THEN gaps:=gaps||'"forecast_current_publisher_or_identity_unavailable"'::jsonb;CONTINUE;END IF;
  SELECT * INTO manifest FROM public.opportunity_manifests_v3 WHERE manifest_id=verification.publisher_manifest_id;
  IF manifest.status::text IS DISTINCT FROM 'complete' OR manifest.manifest_kind::text IS DISTINCT FROM 'publisher_verification_allowlist' OR manifest.contract_version IS DISTINCT FROM 'source-publisher-allowlist-v3.0' OR manifest.terminal_at>p_cutoff OR manifest.source_cutoff>p_cutoff OR manifest.manifest_hash IS DISTINCT FROM encode(sha256(manifest.root_canonical),'hex') OR NOT EXISTS(SELECT FROM public.opportunity_manifest_rows_v3 row_item WHERE row_item.manifest_id=manifest.manifest_id AND row_item.section_key::text='rows' AND row_item.payload_json->>0=publisher.authority_id::text AND row_item.payload_json->>1=publisher.publisher_identity_id::text AND row_item.payload_json->>5=publisher.institution_identity AND row_item.payload_json->>10='active' AND row_item.recorded_at<=p_cutoff AND row_item.payload_hash=encode(sha256(row_item.payload_canonical),'hex') AND convert_from(row_item.payload_canonical,'UTF8')::jsonb=row_item.payload_json) THEN gaps:=gaps||'"forecast_manifest_binding_missing"'::jsonb;CONTINUE;END IF;
  -- Revisions and corrections from the same institution must not coexist as
  -- selectively chosen competing scalar values for the same period.
  IF EXISTS(SELECT FROM public.opportunity_financial_facts_v3 newer JOIN public.source_publication_verifications_v3 v ON v.evidence_ref=newer.source_ref WHERE newer.stock_id=p_stock AND newer.fact_key=fact.fact_key AND newer.period_start IS NOT DISTINCT FROM fact.period_start AND newer.period_end=fact.period_end AND newer.estimate_kind=fact.estimate_kind AND v.institution_identity=verification.institution_identity AND (newer.source_timestamp,newer.recorded_at,newer.fact_id)>(fact.source_timestamp,fact.recorded_at,fact.fact_id)) THEN CONTINUE;END IF;
  IF EXISTS(SELECT FROM public.opportunity_financial_facts_v3 tied JOIN public.source_publication_verifications_v3 v ON v.evidence_ref=tied.source_ref WHERE tied.stock_id=p_stock AND tied.fact_key=fact.fact_key AND tied.period_start IS NOT DISTINCT FROM fact.period_start AND tied.period_end=fact.period_end AND tied.estimate_kind=fact.estimate_kind AND v.institution_identity=verification.institution_identity AND tied.source_timestamp=fact.source_timestamp AND tied.recorded_at=fact.recorded_at AND (tied.value IS DISTINCT FROM fact.value OR tied.unit IS DISTINCT FROM fact.unit)) THEN gaps:=gaps||'"forecast_conflicting_current_values"'::jsonb;CONTINUE;END IF;
  known_at:=greatest(fact.recorded_at,verification.recorded_at,revision.recorded_at,publisher.recorded_at,identity_row.recorded_at,policy.recorded_at,manifest.terminal_at);
  item:=jsonb_build_object('id','forecast:'||fact.fact_id::text||':'||verification.verification_id::text,'key',term,'value',fact.value,'unit','TWD_per_share','period',fact.period_start::text||'/'||fact.period_end::text,'contentHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(to_jsonb(fact)),'UTF8')),'hex'),'source',url,'sourceTier','public','kind','assumption','eventAt',fact.filing_published_at,'availableAt',known_at);
  receipt:=jsonb_build_object('schemaVersion','vnext-forecast-source-receipt-v1','stockId',p_stock,'symbol',symbol_value,'evidenceHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(item),'UTF8')),'hex'),'classification','source_estimate_not_reported_or_fair_value','verificationId',verification.verification_id,'revisionId',revision.revision_id,'sourceHash',verification.canonical_content_hash,'publisherAuthorityId',publisher.authority_id,'sourceAuthorityId',identity_row.authority_id,'policyId',policy.policy_id,'manifestHash',manifest.manifest_hash,'estimateKind',fact.estimate_kind,'estimateHorizon',fact.estimate_horizon,'shareBasis',CASE WHEN term='source_quarterly_diluted_eps_estimate' THEN 'source_diluted_eps_denominator_not_supplied' ELSE 'not_applicable_price_target' END,'denominatorShares',NULL,'annualEps',NULL,'nextFourQuarterEps',NULL);
  evidence:=evidence||jsonb_build_array(item);receipts:=receipts||jsonb_build_array(receipt);IF jsonb_array_length(evidence)>32 THEN RAISE EXCEPTION 'vnext_forecast_projection_bound';END IF;
 END LOOP;
 fiscal:=public.vnext_fiscal_current_internal_v1(p_stock,p_symbol,p_cutoff);evidence:=evidence||(fiscal->'evidence');receipts:=receipts||(fiscal->'receipts');
 IF jsonb_array_length(evidence)>32 OR octet_length(convert_to(evidence::text,'UTF8'))>1048576 THEN RAISE EXCEPTION 'vnext_forecast_projection_bound';END IF;
 RETURN jsonb_build_object('schemaVersion','vnext-current-forecasts-v1','stockId',p_stock,'symbol',symbol_value,'asOf',p_cutoff,'evidence',evidence,'receipts',receipts,'gaps',(SELECT coalesce(jsonb_agg(DISTINCT value),'[]'::jsonb) FROM jsonb_array_elements(gaps||(CASE WHEN fiscal->'evidence'='[]'::jsonb THEN '["forecast_annual_and_four_quarter_share_basis_unavailable"]'::jsonb ELSE fiscal->'gaps' END))));
END $successor0$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'507f6e7ffb24af6cc6a4dbd34090b79065ae566fdb3831b9a0fa3e0588268016' THEN RAISE EXCEPTION 'vnext_fiscal_exact_predecessor';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'vnext_fiscal_original_metadata_changed';END IF;
END $replace0$;
DO $replace1$
DECLARE target oid:='public.vnext_forecast_evidence_current_internal_v1(jsonb,text)'::regprocedure;original text;definition text;metadata jsonb;changed constant text:=$successor1$
DECLARE stock uuid; projection jsonb;
BEGIN
 IF left(item->>'id',16)='fiscal-forecast:' THEN
  IF item->>'id' !~ '^fiscal-forecast:[a-f0-9-]{36}:[a-f0-9-]{36}:(eps|original)$' OR p_symbol !~ '^[0-9]{4}$' THEN RETURN false;END IF;
  stock:=public.vnext_forecast_stock_id_internal_v1(p_symbol);IF stock IS NULL THEN RETURN false;END IF;projection:=public.vnext_forecast_current_internal_v1(stock,p_symbol,statement_timestamp());RETURN EXISTS(SELECT FROM jsonb_array_elements(projection->'evidence') e WHERE e=item);
 END IF;
 IF coalesce(item->>'id','') !~ '^forecast:[a-f0-9-]{36}:[a-f0-9-]{36}$' OR p_symbol !~ '^[0-9]{4}$' THEN RETURN false;END IF;
 stock:=public.vnext_forecast_stock_id_internal_v1(p_symbol);IF stock IS NULL THEN RETURN false;END IF;
 projection:=public.vnext_forecast_current_internal_v1(stock,p_symbol,statement_timestamp());
 RETURN EXISTS(SELECT FROM jsonb_array_elements(projection->'evidence') current_item WHERE current_item=item);
END $successor1$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'56ceca2c904e3e00c08f424ae52cd23bc0b08e5c5a6adb4af0de8e7d4c493d5b' THEN RAISE EXCEPTION 'vnext_fiscal_exact_predecessor';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'vnext_fiscal_original_metadata_changed';END IF;
END $replace1$;
DO $replace2$
DECLARE target oid:='public.vnext_forecast_input_current_internal_v1(jsonb,text)'::regprocedure;original text;definition text;metadata jsonb;changed constant text:=$successor2$
DECLARE stock uuid; current_projection jsonb;projection jsonb; frozen_items jsonb;cutoff timestamptz;
BEGIN
 IF NOT(input ? 'forecastSourceReceipts') AND NOT(input ? 'forecastSourceAsOf') THEN RETURN NOT EXISTS(SELECT FROM jsonb_array_elements(input->'evidence') e WHERE left(e->>'id',9)='forecast:' OR left(e->>'id',16)='fiscal-forecast:');END IF;
 IF jsonb_typeof(input->'forecastSourceReceipts') IS DISTINCT FROM 'array' OR jsonb_array_length(input->'forecastSourceReceipts')>32 OR jsonb_typeof(input->'forecastSourceAsOf') IS DISTINCT FROM 'string' OR input->>'forecastSourceAsOf' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' OR input->>'cutoff' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN RETURN false;END IF;
 cutoff:=(input->>'forecastSourceAsOf')::timestamptz;
 IF NOT isfinite(cutoff) OR cutoff>statement_timestamp() OR cutoff>(input->>'cutoff')::timestamptz THEN RETURN false;END IF;
 stock:=public.vnext_forecast_stock_id_internal_v1(p_symbol);IF stock IS NULL THEN RETURN false;END IF;
 projection:=public.vnext_forecast_current_internal_v1(stock,p_symbol,cutoff);
 SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO frozen_items FROM jsonb_array_elements(input->'evidence') WITH ORDINALITY item(value,ordinal) WHERE left(value->>'id',9)='forecast:' OR left(value->>'id',16)='fiscal-forecast:';
 current_projection:=public.vnext_forecast_current_internal_v1(stock,p_symbol,statement_timestamp());
 IF EXISTS(SELECT FROM jsonb_array_elements((projection->'evidence')||(current_projection->'evidence')) e WHERE left(e->>'id',16)='fiscal-forecast:') THEN
  IF projection->'evidence' IS DISTINCT FROM current_projection->'evidence' OR projection->'receipts' IS DISTINCT FROM current_projection->'receipts' THEN RETURN false;END IF;
 END IF;
 RETURN frozen_items=projection->'evidence' AND input->'forecastSourceReceipts'=projection->'receipts';
END $successor2$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'73259367f3d9383e09d704bf226b0d4856cd04ea7362f44aae978a8770584f00' THEN RAISE EXCEPTION 'vnext_fiscal_exact_predecessor';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'vnext_fiscal_original_metadata_changed';END IF;
END $replace2$;
DO $replace3$
DECLARE target oid:='public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure;original text;definition text;metadata jsonb;changed constant text:=$successor3$SELECT CASE WHEN left(item->>'id',16)='fiscal-forecast:' THEN public.vnext_forecast_evidence_current_internal_v1(item,p_symbol) ELSE (SELECT CASE WHEN left(item->>'id',7)='action:' THEN public.vnext_action_evidence_current_v1(item,p_symbol) ELSE (SELECT CASE WHEN left(item->>'id',9)='forecast:' THEN public.vnext_forecast_evidence_current_internal_v1(item,p_symbol) ELSE (
 SELECT EXISTS(SELECT FROM public.vnext_extractions_v1 receipt JOIN public.vnext_source_policies_v1 policy ON policy.source=receipt.source AND policy.scope=receipt.scope
 WHERE NOT EXISTS(SELECT FROM public.vnext_source_withdrawals_v1 withdrawal WHERE withdrawal.content_hash=receipt.content_hash) AND receipt.state='completed' AND receipt.scope IN('official_original','operator_claim') AND policy.enabled AND policy.valid_until>clock_timestamp() AND policy.rights_subject=receipt.rights_subject AND policy.license_basis=receipt.license_basis
 AND receipt.extraction->'evidence'=item AND receipt.content_hash=item->>'contentHash' AND EXISTS(SELECT FROM jsonb_array_elements(receipt.extraction->'clues') clue WHERE clue->>'symbol'=p_symbol)
 AND ((receipt.original->>'eventAt')::timestamptz>=clock_timestamp()-interval '30 days' OR (receipt.original->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months'))
) END) END) END$successor3$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'571152fe153c72656f128c5c995a726cd994f8698080cf1f8cc7d179bcf0619d' THEN RAISE EXCEPTION 'vnext_fiscal_exact_predecessor';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'vnext_fiscal_original_metadata_changed';END IF;
END $replace3$;
DO $post$
DECLARE after_snapshot jsonb;before_snapshot jsonb;new_oids oid[];catalog_sql constant text:=$catalog$
 SELECT jsonb_build_object(
  'namespace',(SELECT to_jsonb(n) FROM pg_namespace n WHERE n.oid='public'::regnamespace),
  'routines',(SELECT coalesce(jsonb_agg(CASE WHEN p.oid=ANY($1) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid),'[]'::jsonb) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND NOT(p.oid=ANY($2))),
  'relations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_class c WHERE c.relnamespace='public'::regnamespace),
  'columns',(SELECT coalesce(jsonb_agg(CASE WHEN EXISTS(SELECT FROM jsonb_each($3) edge WHERE a.attrelid=to_regclass('public.'||edge.key) AND edge.value ? a.attname) THEN to_jsonb(a)-'attacl' ELSE to_jsonb(a) END ORDER BY a.attrelid,a.attnum),'[]'::jsonb) FROM pg_attribute a WHERE a.attrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'types',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_type t WHERE t.typnamespace='public'::regnamespace),
  'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_constraint c WHERE c.connamespace='public'::regnamespace),
  'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) FROM pg_attrdef d WHERE d.adrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid),'[]'::jsonb) FROM pg_index i WHERE i.indrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND NOT(p.polname='vnext_target_read_v1' AND EXISTS(SELECT FROM jsonb_each($3) edge WHERE p.polrelid=to_regclass('public.'||edge.key)))),
  'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oid),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'rules',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.oid),'[]'::jsonb) FROM pg_rewrite r WHERE r.ev_class IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
  'operators',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.oid),'[]'::jsonb) FROM pg_operator o WHERE o.oprnamespace='public'::regnamespace),
  'collations',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]'::jsonb) FROM pg_collation c WHERE c.collnamespace='public'::regnamespace),
  'defaultAcls',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.oid),'[]'::jsonb) FROM pg_default_acl a WHERE a.defaclnamespace IN(0,'public'::regnamespace)),
  'roleSettings',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.setdatabase,s.setrole),'[]'::jsonb) FROM pg_db_role_setting s),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rolname) FROM pg_roles r),
  'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member),'[]'::jsonb) FROM pg_auth_members m))
 $catalog$;
BEGIN
 SELECT array_agg(oid ORDER BY oid) INTO new_oids FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('vnext_disclosed_fiscal_internal_v1','vnext_fiscal_current_internal_v1','vnext_fiscal_preparation_guard_v1');
 IF cardinality(new_oids)<>3 THEN RAISE EXCEPTION 'vnext_fiscal_new_routine_count';END IF;
 EXECUTE catalog_sql INTO after_snapshot USING ARRAY['public.vnext_forecast_current_internal_v1(uuid,text,timestamptz)'::regprocedure::oid,'public.vnext_forecast_evidence_current_internal_v1(jsonb,text)'::regprocedure::oid,'public.vnext_forecast_input_current_internal_v1(jsonb,text)'::regprocedure::oid,'public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure::oid],new_oids,'{}'::jsonb;SELECT value INTO before_snapshot FROM vnext_fiscal_before_v1;
 IF NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='public.vnext_preparations_v1'::regclass AND tgname='vnext_fiscal_preparation_current' AND tgfoid='public.vnext_fiscal_preparation_guard_v1()'::regprocedure AND tgtype=7 AND tgenabled='O' AND NOT tgisinternal AND tgqual IS NULL AND tgargs=''::bytea) THEN RAISE EXCEPTION 'vnext_fiscal_preparation_trigger';END IF;
 SELECT jsonb_set(after_snapshot,'{triggers}',coalesce(jsonb_agg(value ORDER BY (value->>'oid')::oid),'[]'::jsonb)) INTO after_snapshot FROM jsonb_array_elements(after_snapshot->'triggers') WHERE value->>'tgname'<>'vnext_fiscal_preparation_current' OR (value->>'tgrelid')::oid<>'public.vnext_preparations_v1'::regclass;
 IF after_snapshot IS DISTINCT FROM before_snapshot THEN RAISE EXCEPTION 'vnext_fiscal_original_catalog_changed';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.vnext_forecast_current_internal_v1(uuid,text,timestamptz)'::regprocedure) IS DISTINCT FROM '348d3ec4f6ae27d51ac9dae817a0d17f764600b93420b6e2c7a2b666b5c12982' THEN RAISE EXCEPTION 'vnext_fiscal_successor_body';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.vnext_forecast_evidence_current_internal_v1(jsonb,text)'::regprocedure) IS DISTINCT FROM '6f0e87c3d53b11ffb8bbaf86498fde0e4d68b2487e247682f0b6ad82a13bb891' THEN RAISE EXCEPTION 'vnext_fiscal_successor_body';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.vnext_forecast_input_current_internal_v1(jsonb,text)'::regprocedure) IS DISTINCT FROM 'e4a927b0cb21aaacef5939c5fdbe43cb018d01dd11b94bb49b80471677b45184' THEN RAISE EXCEPTION 'vnext_fiscal_successor_body';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure) IS DISTINCT FROM '11b898c8f3cc0cbe3ddc84fba735c57276d2f662ac7491e7d241667cf1183a9d' THEN RAISE EXCEPTION 'vnext_fiscal_successor_body';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_disclosed_fiscal_internal_v1(text,date)'::regprocedure AND pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef=false AND provolatile='i' AND prokind='f' AND NOT proretset AND NOT proisstrict AND NOT proleakproof AND proparallel='u' AND proconfig=ARRAY['search_path=pg_catalog'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='060ba53f294859a26d17285a2aa7a827396a3053d448bfd22467e41f32d3049a') THEN RAISE EXCEPTION 'vnext_fiscal_new_routine_profile';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_disclosed_fiscal_internal_v1(text,date)'::regprocedure)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_disclosed_fiscal_internal_v1(text,date)'::regprocedure AND (a.grantee<>p.proowner OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_fiscal_new_routine_acl';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_fiscal_current_internal_v1(uuid,text,timestamptz)'::regprocedure AND pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef=true AND provolatile='s' AND prokind='f' AND NOT proretset AND NOT proisstrict AND NOT proleakproof AND proparallel='u' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s','TimeZone=UTC'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='5976285327c03255b8b23e8193d86ef1733a52a35442bd037ca6fdcf2f674764') THEN RAISE EXCEPTION 'vnext_fiscal_new_routine_profile';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_fiscal_current_internal_v1(uuid,text,timestamptz)'::regprocedure)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_fiscal_current_internal_v1(uuid,text,timestamptz)'::regprocedure AND (a.grantee<>p.proowner OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_fiscal_new_routine_acl';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_fiscal_preparation_guard_v1()'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND NOT prosecdef AND provolatile='v' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='2e39bf3ad33e964fe1f3d68336052f6402cdbbf4889e5952ef7fda9f79faa344') OR (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_fiscal_preparation_guard_v1()'::regprocedure AND a.grantee=p.proowner AND a.grantor=p.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)<>1 OR (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_fiscal_preparation_guard_v1()'::regprocedure)<>1 THEN RAISE EXCEPTION 'vnext_fiscal_guard_profile';END IF;
END $post$;
COMMIT;
