-- SOURCE CANDIDATE; not a production install or permission approval.
-- Actual disclosed shares/cash/rights, never reference-price-factor inference.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
CREATE TEMP TABLE vnext_action_install_before_v1(value jsonb NOT NULL) ON COMMIT DROP;
DO $action_pre$
DECLARE state jsonb;
 catalog_sql constant text:=$catalog$
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
 IF to_regclass('public.vnext_action_terms_rights_v1') IS NOT NULL THEN RAISE EXCEPTION 'vnext_action_first_install_required';END IF;
 IF current_setting('transaction_isolation')<>'read committed' OR NOT has_function_privilege('opportunity_v3_rpc_owner','public.vnext_catalog_canonical_v1(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'vnext_action_prerequisites';END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname IN('opportunity_v3_rpc_owner','stockinsider_vnext_owner') AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolconfig IS NOT NULL)) THEN RAISE EXCEPTION 'vnext_action_owner_changed';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='440d0dcee04334f57a2ee9e8fdc920b09d3329d3c3c26e859c7a19e9789c292b' AND octet_length(convert_to(prosrc,'UTF8'))=1083) THEN RAISE EXCEPTION 'vnext_action_predecessor_changed';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_input_sources_current_v1(jsonb,text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='ce58e3b7f1a98fcac4dbcb537ba4336e7bbb3c9c7247e1354d6a07bf2bcc8008' AND octet_length(convert_to(prosrc,'UTF8'))=1222) THEN RAISE EXCEPTION 'vnext_action_predecessor_changed';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_target_quote_v1(uuid,text,text,date,timestamptz)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='92f1112444ddcacebce692fbc8c0897eb309c33babee28f9dcff3215f7243325' AND octet_length(convert_to(prosrc,'UTF8'))=12216) THEN RAISE EXCEPTION 'vnext_action_predecessor_changed';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_target_current_v1(text,uuid,text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='36c4904a11c58981e11264294500d161a86655495f512868a712ded08a30f3fb' AND octet_length(convert_to(prosrc,'UTF8'))=14418) THEN RAISE EXCEPTION 'vnext_action_predecessor_changed';END IF;
 EXECUTE catalog_sql INTO state USING ARRAY['public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure::oid,'public.vnext_input_sources_current_v1(jsonb,text)'::regprocedure::oid,'public.vnext_target_quote_v1(uuid,text,text,date,timestamptz)'::regprocedure::oid,'public.vnext_target_current_v1(text,uuid,text)'::regprocedure::oid],ARRAY[]::oid[],'{}'::jsonb;
 INSERT INTO vnext_action_install_before_v1 VALUES(state);
END $action_pre$;
CREATE TABLE public.vnext_action_terms_rights_v1(
 policy_id uuid PRIMARY KEY,stock_id uuid NOT NULL REFERENCES public.stocks(id),
 verification_id uuid NOT NULL REFERENCES public.source_publication_verifications_v3(verification_id),
 snapshot_id uuid NOT NULL,event_ordinal integer NOT NULL CHECK(event_ordinal BETWEEN 0 AND 9999),
 operation text NOT NULL CHECK(operation IN('allow','revoke')),
 license_basis text NOT NULL CHECK(license_basis='public_issuer_disclosure'),
 permitted_use text NOT NULL CHECK(permitted_use='structured_corporate_action_terms'),
 rights_evidence_ref text NOT NULL CHECK(rights_evidence_ref ~ '^https://[^[:space:]@#?]+/[^[:cntrl:]]*$' AND octet_length(rights_evidence_ref)<=2048),
 valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,CHECK(valid_until>valid_from),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT vnext_action_terms_event_use_unique UNIQUE(verification_id,stock_id,snapshot_id,event_ordinal,operation),
 FOREIGN KEY(snapshot_id,event_ordinal) REFERENCES public.opportunity_corporate_action_events_v3(snapshot_id,event_ordinal)
);
ALTER TABLE public.vnext_action_terms_rights_v1 OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.vnext_action_terms_rights_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_action_terms_rights_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_action_terms_rights_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $rights_guard$
BEGIN
 PERFORM pg_advisory_xact_lock(64221022);
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'vnext_action_rights_append_only';END IF;
 NEW.recorded_at:=clock_timestamp();
 IF NEW.operation='allow' AND EXISTS(SELECT FROM public.vnext_action_terms_rights_v1 WHERE verification_id=NEW.verification_id AND stock_id=NEW.stock_id AND snapshot_id=NEW.snapshot_id AND event_ordinal=NEW.event_ordinal AND operation='revoke') THEN RAISE EXCEPTION 'vnext_action_rights_revoked';END IF;
 RETURN NEW;
END $rights_guard$;
ALTER FUNCTION public.vnext_action_terms_rights_guard_v1() OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_action_terms_rights_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_action_terms_rights_append_only BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_action_terms_rights_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_action_terms_rights_guard_v1();
CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_action_terms_rights_v1 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE FUNCTION public.vnext_disclosed_action_terms_internal_v1(body text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $terms_parser$
DECLARE labels constant jsonb:='{"symbol":"股票代號","effectiveOn":"生效日期","kind":"公司行動類型","oldShares":"換發前股數","newShares":"換發後股數","cashDividendPerOldShare":"每舊股現金股利","cashReturnPerOldShare":"每舊股退還現金","subscriptionCashPerOldShare":"每舊股認購價款","currency":"計價幣別"}'::jsonb;
 entry record;line text;label text;field text;values_json jsonb:='{}';spans jsonb:='{}';terms jsonb:='{}';offset_cp integer:=0;n numeric;kind text;
BEGIN
 IF body IS NULL OR octet_length(body)>307200 OR body<>normalize(body,NFKC) OR body ~ E'[\\r\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f]' THEN RETURN NULL;END IF;
 FOREACH line IN ARRAY string_to_array(body,E'\n') LOOP
  FOR entry IN SELECT * FROM jsonb_each_text(labels) LOOP
   label:=entry.value||':';field:=entry.key;
   IF left(line,length(label))=label THEN
    IF spans ? field OR left(line,length(label)+1)<>label||' ' OR line<>rtrim(line) THEN RETURN NULL;END IF;
    values_json:=values_json||jsonb_build_object(field,substr(line,length(label)+2));
    spans:=spans||jsonb_build_object(field,jsonb_build_object('startCp',offset_cp,'endCp',offset_cp+length(line),'quote',line));
   END IF;
  END LOOP;
  offset_cp:=offset_cp+length(line)+1;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(spans))<>9 OR values_json->>'symbol' !~ '^[0-9]{4}$' OR values_json->>'effectiveOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR values_json->>'currency'<>'TWD' THEN RETURN NULL;END IF;
 BEGIN
  IF (values_json->>'effectiveOn')::date::text<>values_json->>'effectiveOn' THEN RETURN NULL;END IF;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN NULL;
 END;
 kind:=CASE values_json->>'kind' WHEN '每股面額變更' THEN 'par_value_change' WHEN '除權息' THEN 'ex_right_dividend' WHEN '減資' THEN 'capital_reduction' END;
 IF kind IS NULL THEN RETURN NULL;END IF;
 FOREACH field IN ARRAY ARRAY['oldShares','newShares','cashDividendPerOldShare','cashReturnPerOldShare','subscriptionCashPerOldShare'] LOOP
  IF values_json->>field !~ '^(0|[1-9][0-9]{0,14})(\.[0-9]{1,6})?$' THEN RETURN NULL;END IF;
  n:=(values_json->>field)::numeric;
  IF field IN('oldShares','newShares') AND (n<=0 OR n<>trunc(n)) THEN RETURN NULL;END IF;
  IF field NOT IN('oldShares','newShares') AND n>=100000000 THEN RETURN NULL;END IF;
  terms:=terms||jsonb_build_object(field,trim_scale(n));
 END LOOP;
 RETURN jsonb_build_object('symbol',values_json->'symbol','effectiveOn',values_json->'effectiveOn','kind',kind,'terms',terms||'{"currency":"TWD"}'::jsonb,'spans',spans);
END $terms_parser$;
ALTER FUNCTION public.vnext_disclosed_action_terms_internal_v1(text) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_disclosed_action_terms_internal_v1(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_action_terms_current_internal_v1(p_stock uuid,p_symbol text,p_cutoff timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $terms_current$
DECLARE event_row record;policy public.vnext_action_terms_rights_v1;verification public.source_publication_verifications_v3;revision public.source_document_revisions_v3;publisher public.publisher_verification_authorities_v3;identity_row public.source_identity_authorities_v3;manifest public.opportunity_manifests_v3;
 receipts jsonb:='[]';evidence jsonb:='[]';gaps jsonb:='[]';parsed jsonb;receipt jsonb;item jsonb;field text;payload jsonb;url text;latest_time timestamptz;known_at timestamptz;observed_at timestamptz:=statement_timestamp();amount integer:=0;canonical_hash text;
BEGIN
 IF p_stock IS NULL OR p_symbol IS NULL OR p_symbol !~ '^[0-9]{4}$' OR p_cutoff IS NULL OR NOT isfinite(p_cutoff) OR p_cutoff>observed_at THEN RAISE EXCEPTION 'vnext_action_current_scope';END IF;
 FOR event_row IN
  SELECT e.*,s.session_id,s.collected_at,s.recorded_at AS snapshot_recorded_at FROM public.opportunity_corporate_action_events_v3 e JOIN public.opportunity_corporate_action_snapshots_v3 s USING(snapshot_id)
  WHERE e.symbol=p_symbol AND e.recorded_at<=p_cutoff AND s.collected_at<=p_cutoff AND s.recorded_at<=p_cutoff AND s.session_id BETWEEN (p_cutoff AT TIME ZONE 'Asia/Taipei')::date-900 AND (p_cutoff AT TIME ZONE 'Asia/Taipei')::date
   AND NOT EXISTS(SELECT FROM public.opportunity_corporate_action_snapshots_v3 newer WHERE newer.exchange=s.exchange AND newer.session_id=s.session_id AND newer.recorded_at<=p_cutoff AND (newer.collected_at,newer.recorded_at,newer.snapshot_id)>(s.collected_at,s.recorded_at,s.snapshot_id))
  ORDER BY s.session_id,s.snapshot_id,e.event_ordinal LIMIT 129 LOOP
  amount:=amount+1;IF amount>128 THEN RAISE EXCEPTION 'vnext_action_current_bound';END IF;
  SELECT * INTO policy FROM public.vnext_action_terms_rights_v1 r WHERE r.stock_id=p_stock AND r.snapshot_id=event_row.snapshot_id AND r.event_ordinal=event_row.event_ordinal AND r.operation='allow' AND r.recorded_at<=p_cutoff AND r.valid_from<=p_cutoff AND r.valid_until>observed_at AND NOT EXISTS(SELECT FROM public.vnext_action_terms_rights_v1 revoked WHERE revoked.stock_id=r.stock_id AND revoked.snapshot_id=r.snapshot_id AND revoked.event_ordinal=r.event_ordinal AND revoked.verification_id=r.verification_id AND revoked.operation='revoke');
  IF policy.policy_id IS NULL THEN gaps:=gaps||'"action_current_use_permission_or_disclosed_terms_missing"'::jsonb;CONTINUE;END IF;
  IF (SELECT count(*) FROM public.vnext_action_terms_rights_v1 r WHERE r.stock_id=p_stock AND r.snapshot_id=event_row.snapshot_id AND r.event_ordinal=event_row.event_ordinal AND r.operation='allow' AND r.recorded_at<=p_cutoff AND NOT EXISTS(SELECT FROM public.vnext_action_terms_rights_v1 revoked WHERE revoked.stock_id=r.stock_id AND revoked.snapshot_id=r.snapshot_id AND revoked.event_ordinal=r.event_ordinal AND revoked.verification_id=r.verification_id AND revoked.operation='revoke'))<>1 THEN gaps:=gaps||'"action_disclosed_source_conflict"'::jsonb;CONTINUE;END IF;
  SELECT * INTO verification FROM public.source_publication_verifications_v3 WHERE verification_id=policy.verification_id AND recorded_at<=p_cutoff AND collected_at<=p_cutoff;
  IF verification.verification_id IS NULL THEN gaps:=gaps||'"action_publication_binding_missing"'::jsonb;CONTINUE;END IF;
  SELECT * INTO revision FROM public.source_document_revisions_v3 d WHERE d.revision_id=verification.revision_id;
  IF revision.revision_id IS NULL OR NOT EXISTS(SELECT FROM public.source_revision_family_registry_v3 family WHERE family.source_key=revision.source_key AND family.revision_family_key=revision.revision_family_key AND family.approved_source_identity_id=revision.approved_source_identity_id AND family.stable_connector_document_id=revision.stable_connector_document_id AND family.registered_at<=p_cutoff) OR revision.acquisition_status::text<>'complete' OR revision.source_key::text<>'mops_material_event' OR revision.ingestion_canonical_content_hash_v3 IS DISTINCT FROM verification.canonical_content_hash OR revision.approved_source_identity_id IS DISTINCT FROM verification.publisher_identity_id OR revision.recorded_at>p_cutoff OR revision.collected_at>p_cutoff OR revision.published_at IS NULL OR revision.published_at>revision.collected_at OR verification.published_at IS DISTINCT FROM revision.published_at OR observed_at-verification.published_at>interval'90 days'
   OR EXISTS(SELECT FROM public.source_document_revisions_v3 newer WHERE newer.source_key=revision.source_key AND newer.revision_family_key=revision.revision_family_key AND (newer.recorded_at,newer.revision_id)>(revision.recorded_at,revision.revision_id)) THEN gaps:=gaps||'"action_revision_or_source_window_unavailable"'::jsonb;CONTINUE;END IF;
  url:=revision.canonical_url_candidate;
  IF substring(url FROM '^https://([^/]+)/') NOT IN('mops.twse.com.tw','mopsov.twse.com.tw') OR url IS NULL OR url !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]+/[^[:space:]@#?]*$' OR url ~* '(paid|member|premium|subscription|login|authenticate|telegram|investanchors|\.invalid|\.local|localhost)' THEN gaps:=gaps||'"action_permitted_citation_missing"'::jsonb;CONTINUE;END IF;
  SELECT max(recorded_at) INTO latest_time FROM public.publisher_verification_authorities_v3 WHERE publisher_identity_id=verification.publisher_identity_id;
  IF (SELECT count(*) FROM public.publisher_verification_authorities_v3 WHERE publisher_identity_id=verification.publisher_identity_id AND recorded_at=latest_time)<>1 THEN gaps:=gaps||'"action_publisher_conflict"'::jsonb;CONTINUE;END IF;
  SELECT * INTO publisher FROM public.publisher_verification_authorities_v3 WHERE publisher_identity_id=verification.publisher_identity_id AND recorded_at=latest_time;
  SELECT max(recorded_at) INTO latest_time FROM public.source_identity_authorities_v3 WHERE source_identity_id=revision.approved_source_identity_id AND source_key=revision.source_key;
  IF (SELECT count(*) FROM public.source_identity_authorities_v3 WHERE source_identity_id=revision.approved_source_identity_id AND source_key=revision.source_key AND recorded_at=latest_time)<>1 THEN gaps:=gaps||'"action_identity_conflict"'::jsonb;CONTINUE;END IF;
  SELECT * INTO identity_row FROM public.source_identity_authorities_v3 WHERE source_identity_id=revision.approved_source_identity_id AND source_key=revision.source_key AND recorded_at=latest_time;
  IF publisher.status::text<>'active' OR identity_row.status::text<>'active' OR publisher.recorded_at>p_cutoff OR identity_row.recorded_at>p_cutoff OR publisher.approved_at>p_cutoff OR identity_row.approved_at>p_cutoff OR publisher.valid_from>p_cutoff OR identity_row.valid_from>p_cutoff OR publisher.valid_to<=observed_at OR identity_row.valid_to<=observed_at OR identity_row.authority_id IS DISTINCT FROM revision.source_identity_authority_id OR publisher.institution_identity IS DISTINCT FROM verification.institution_identity OR verification.institution_identity IS NULL OR publisher.source_class::text<>'official' OR identity_row.source_class IS DISTINCT FROM publisher.source_class OR NOT(substring(url FROM '^https://([^/]+)/')=ANY(publisher.domains))
   OR (policy.license_basis='public_issuer_disclosure' AND publisher.source_class::text<>'official') THEN gaps:=gaps||'"action_current_publisher_or_identity_unavailable"'::jsonb;CONTINUE;END IF;
  SELECT * INTO manifest FROM public.opportunity_manifests_v3 WHERE manifest_id=verification.publisher_manifest_id;
  IF manifest.status::text IS DISTINCT FROM 'complete' OR manifest.manifest_kind::text IS DISTINCT FROM 'publisher_verification_allowlist' OR manifest.contract_version IS DISTINCT FROM 'source-publisher-allowlist-v3.0' OR manifest.terminal_at>p_cutoff OR manifest.source_cutoff>p_cutoff OR manifest.manifest_hash IS DISTINCT FROM encode(sha256(manifest.root_canonical),'hex') OR NOT EXISTS(SELECT FROM public.opportunity_manifest_rows_v3 row_item WHERE row_item.manifest_id=manifest.manifest_id AND row_item.section_key::text='rows' AND row_item.payload_json=jsonb_build_array(publisher.authority_id,publisher.publisher_identity_id,publisher.source_class,publisher.domains,publisher.feed_identity,publisher.institution_identity,publisher.valid_from,publisher.valid_to,publisher.approved_at,publisher.approving_principal_id,publisher.status,publisher.recorded_at) AND row_item.recorded_at<=p_cutoff AND row_item.payload_hash=encode(sha256(row_item.payload_canonical),'hex') AND convert_from(row_item.payload_canonical,'UTF8')::jsonb=row_item.payload_json) THEN gaps:=gaps||'"action_manifest_binding_missing"'::jsonb;CONTINUE;END IF;
  payload:=revision.raw_field_payload;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'array' OR jsonb_array_length(payload)<>3 OR EXISTS(SELECT FROM jsonb_array_elements(payload) f WHERE jsonb_typeof(f)<>'string') THEN gaps:=gaps||'"action_original_body_unavailable"'::jsonb;CONTINUE;END IF;
  canonical_hash:=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(jsonb_build_array(jsonb_build_array('title',normalize(regexp_replace(replace(replace(payload->>0,E'\r\n',E'\n'),E'\r',E'\n'),U&'^\FEFF',''),NFKC)),jsonb_build_array('summary',normalize(regexp_replace(replace(replace(payload->>1,E'\r\n',E'\n'),E'\r',E'\n'),U&'^\FEFF',''),NFKC)),jsonb_build_array('body',normalize(regexp_replace(replace(replace(payload->>2,E'\r\n',E'\n'),E'\r',E'\n'),U&'^\FEFF',''),NFKC)))),'UTF8')),'hex');
  IF canonical_hash IS DISTINCT FROM verification.canonical_content_hash THEN gaps:=gaps||'"action_original_body_hash_mismatch"'::jsonb;CONTINUE;END IF;
  parsed:=public.vnext_disclosed_action_terms_internal_v1(payload->>2);
  IF parsed IS NULL OR parsed->>'symbol' IS DISTINCT FROM p_symbol OR parsed->>'effectiveOn' IS DISTINCT FROM event_row.session_id::text OR parsed->>'kind' IS DISTINCT FROM event_row.event_kind::text THEN gaps:=gaps||'"action_disclosed_terms_or_event_binding_missing"'::jsonb;CONTINUE;END IF;
  known_at:=greatest(event_row.recorded_at,event_row.snapshot_recorded_at,verification.recorded_at,revision.recorded_at,publisher.recorded_at,identity_row.recorded_at,policy.recorded_at,manifest.terminal_at);
  receipt:=jsonb_build_object('schemaVersion','vnext-corporate-action-terms-v1','stockId',p_stock,'symbol',p_symbol,'event',jsonb_build_object('snapshotId',event_row.snapshot_id,'ordinal',event_row.event_ordinal,'session',event_row.session_id,'kind',event_row.event_kind,'sourceRowRef',event_row.source_row_ref),'source',jsonb_build_object('verificationId',verification.verification_id,'revisionId',revision.revision_id,'contentHash',verification.canonical_content_hash,'bodyHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(payload->2),'UTF8')),'hex'),'publisherAuthorityId',publisher.authority_id,'sourceAuthorityId',identity_row.authority_id,'manifestHash',manifest.manifest_hash,'policyId',policy.policy_id,'url',url,'publishedAt',verification.published_at,'knownAt',known_at),'terms',parsed->'terms','spans',parsed->'spans');
  receipt:=receipt||jsonb_build_object('receiptHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(receipt),'UTF8')),'hex'));receipts:=receipts||jsonb_build_array(receipt);
  IF jsonb_array_length(receipts)>32 THEN RAISE EXCEPTION 'vnext_action_receipt_bound';END IF;
  FOREACH field IN ARRAY ARRAY['oldShares','newShares','cashDividendPerOldShare','cashReturnPerOldShare','subscriptionCashPerOldShare'] LOOP
   item:=jsonb_build_object('id','action:'||policy.policy_id::text||':'||field,'key','corporate_action_'||field,'value',parsed->'terms'->field,'unit',(CASE WHEN field IN('oldShares','newShares') THEN 'share' ELSE 'TWD_per_old_share' END),'period',event_row.session_id,'source',url,'sourceTier','official','kind','fact','eventAt',verification.published_at,'availableAt',known_at,'contentHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(jsonb_build_object('receiptHash',receipt->'receiptHash','key',field)),'UTF8')),'hex'));
   evidence:=evidence||jsonb_build_array(item);
  END LOOP;
  -- Full permitted original body accompanies finite numeric spans, so an
  -- independent reviewer sees contradictions/context, not cherry-picked lines.
  item:=jsonb_build_object('id','action:'||policy.policy_id::text||':originalBody','key','corporate_action_original','period',event_row.session_id,'value',jsonb_build_object('schemaVersion','vnext-corporate-action-original-v1','statement',payload->2),'source',url,'sourceTier','official','kind','fact','eventAt',verification.published_at,'availableAt',known_at,'contentHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(jsonb_build_object('receiptHash',receipt->'receiptHash','key','originalBody')),'UTF8')),'hex'));
  evidence:=evidence||jsonb_build_array(item);
 END LOOP;
 RETURN jsonb_build_object('schemaVersion','vnext-current-action-terms-v1','stockId',p_stock,'symbol',p_symbol,'asOf',p_cutoff,'receipts',receipts,'evidence',evidence,'gaps',(SELECT coalesce(jsonb_agg(DISTINCT value ORDER BY value),'[]'::jsonb) FROM jsonb_array_elements(gaps)));
END $terms_current$;
ALTER FUNCTION public.vnext_action_terms_current_internal_v1(uuid,text,timestamptz) OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.vnext_action_terms_current_internal_v1(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vnext_action_terms_current_internal_v1(uuid,text,timestamptz) TO stockinsider_vnext_owner;
CREATE FUNCTION public.vnext_action_terms_read_v1(p_principal text,p_job uuid,p_execution uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $terms_read$
DECLARE context jsonb;job public.vnext_jobs_v1;stock uuid;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required';END IF;
 PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND enabled AND role='author') THEN RAISE EXCEPTION 'vnext_action_author_required';END IF;
 context:=public.vnext_command_v1(p_principal,'work-context',jsonb_build_object('jobId',p_job,'executionId',p_execution));
 SELECT * INTO job FROM public.vnext_jobs_v1 WHERE job_id=p_job;
 IF job.state IS DISTINCT FROM 'running' OR job.execution_id IS DISTINCT FROM p_execution OR job.author_principal IS DISTINCT FROM p_principal OR job.deadline_at<=clock_timestamp() OR context->>'inputHash' IS DISTINCT FROM job.input_hash THEN RAISE EXCEPTION 'vnext_action_active_execution_required';END IF;
 stock:=public.vnext_forecast_stock_id_internal_v1(job.symbol);
 RETURN public.vnext_action_terms_current_internal_v1(stock,job.symbol,statement_timestamp());
END $terms_read$;
ALTER FUNCTION public.vnext_action_terms_read_v1(text,uuid,uuid) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_action_terms_read_v1(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_action_terms_read_v1(text,uuid,uuid) TO service_role;
CREATE FUNCTION public.vnext_action_terms_input_current_v1(input jsonb,p_symbol text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $terms_input$
DECLARE projection jsonb;items jsonb;stock uuid;
BEGIN
 stock:=public.vnext_forecast_stock_id_internal_v1(p_symbol);IF stock IS NULL THEN RETURN false;END IF;
 projection:=public.vnext_action_terms_current_internal_v1(stock,p_symbol,statement_timestamp());
 IF NOT(input ? 'actionTermsReceipts') AND NOT(input ? 'actionTermsAsOf') AND NOT(input ? 'actionTermsGaps') THEN RETURN NOT EXISTS(SELECT FROM jsonb_array_elements(input->'evidence') e WHERE left(e->>'id',7)='action:') AND
  (NOT EXISTS(SELECT FROM public.vnext_preparations_v1 stored WHERE stored.evidence=input) OR (projection->'receipts'='[]'::jsonb AND projection->'gaps'='[]'::jsonb));END IF;
 IF jsonb_typeof(input->'actionTermsReceipts') IS DISTINCT FROM 'array' OR jsonb_typeof(input->'actionTermsGaps') IS DISTINCT FROM 'array' OR jsonb_typeof(input->'actionTermsAsOf') IS DISTINCT FROM 'string' OR input->>'actionTermsAsOf' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' OR jsonb_typeof(input->'cutoff') IS DISTINCT FROM 'string' OR input->>'cutoff' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' OR NOT isfinite((input->>'actionTermsAsOf')::timestamptz) OR NOT isfinite((input->>'cutoff')::timestamptz) OR (input->>'cutoff')::timestamptz>statement_timestamp() OR (input->>'actionTermsAsOf')::timestamptz>statement_timestamp() OR (input->>'actionTermsAsOf')::timestamptz>(input->>'cutoff')::timestamptz THEN RETURN false;END IF;
 stock:=public.vnext_forecast_stock_id_internal_v1(p_symbol);IF stock IS NULL THEN RETURN false;END IF;
 -- CURRENT, not the old frozen cutoff: activation, source correction or a
 -- revocation after preparation invalidates use before provider/publication.
 projection:=public.vnext_action_terms_current_internal_v1(stock,p_symbol,statement_timestamp());
 SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO items FROM jsonb_array_elements(input->'evidence') WITH ORDINALITY e(value,ordinal) WHERE left(value->>'id',7)='action:';
 RETURN input->'actionTermsReceipts'=projection->'receipts' AND input->'actionTermsGaps'=projection->'gaps' AND items=projection->'evidence';
END $terms_input$;
ALTER FUNCTION public.vnext_action_terms_input_current_v1(jsonb,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_action_terms_input_current_v1(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.vnext_action_evidence_current_v1(item jsonb,p_symbol text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $terms_evidence$
DECLARE stock uuid;projection jsonb;
BEGIN
 IF coalesce(item->>'id','') !~ '^action:[a-f0-9-]{36}:(oldShares|newShares|cashDividendPerOldShare|cashReturnPerOldShare|subscriptionCashPerOldShare|originalBody)$' THEN RETURN false;END IF;
 stock:=public.vnext_forecast_stock_id_internal_v1(p_symbol);IF stock IS NULL THEN RETURN false;END IF;
 projection:=public.vnext_action_terms_current_internal_v1(stock,p_symbol,statement_timestamp());
 RETURN EXISTS(SELECT FROM jsonb_array_elements(projection->'evidence') e WHERE e=item);
END $terms_evidence$;
ALTER FUNCTION public.vnext_action_evidence_current_v1(jsonb,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_action_evidence_current_v1(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
-- The lifecycle distinction is stored-row/trigger authority, never a caller
-- 'prepared' flag. Admission/work-context can read terms before freezing; every
-- NEW preparation (including direct service RPCs) must contain the exact current
-- terms projection. Existing historical rows are preserved and read-fenced.
CREATE FUNCTION public.vnext_action_preparation_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $preparation_guard$
DECLARE symbol_value text;
BEGIN
 SELECT symbol INTO symbol_value FROM public.vnext_jobs_v1 WHERE job_id=NEW.job_id;
 IF TG_OP<>'INSERT' OR symbol_value IS NULL OR NOT(NEW.evidence ? 'actionTermsReceipts') OR NOT(NEW.evidence ? 'actionTermsAsOf') OR NOT(NEW.evidence ? 'actionTermsGaps') OR public.vnext_action_terms_input_current_v1(NEW.evidence,symbol_value) IS DISTINCT FROM true THEN RAISE EXCEPTION 'vnext_action_preparation_terms_required';END IF;
 RETURN NEW;
END $preparation_guard$;
ALTER FUNCTION public.vnext_action_preparation_guard_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_action_preparation_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_action_preparation_current BEFORE INSERT ON public.vnext_preparations_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_action_preparation_guard_v1();
CREATE FUNCTION public.vnext_target_baseline_sources_current_v1(input jsonb,p_symbol text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $baseline_sources$SELECT public.vnext_forecast_input_current_internal_v1(input,p_symbol) AND (
 SELECT coalesce(jsonb_typeof(input->'evidence')='array' AND NOT EXISTS(SELECT FROM jsonb_array_elements(input->'evidence') source_item WHERE
  CASE WHEN source_item->>'sourceTier'='official' THEN
   coalesce(source_item->>'source','') !~ '^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(/|$)' AND NOT EXISTS(
    SELECT FROM jsonb_array_elements(coalesce(input->'financialSourceReceipts','[]'::jsonb)) descriptor WHERE descriptor->>'sourceKind'='approved_issuer_ir' AND descriptor->>'factId'=source_item->>'id'
     AND public.vnext_provider_json_codec_v1(jsonb_path_query_array(descriptor->'originalFact','$.*')) AND source_item->>'contentHash'=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(descriptor->'originalFact'),'UTF8')),'hex')
     AND public.vnext_issuer_financial_evidence_current_v1(source_item,input,p_symbol))
  ELSE NOT public.vnext_source_evidence_current_v1(source_item,p_symbol) END),false)
 AND NOT EXISTS(SELECT FROM public.vnext_members_v1 current_member WHERE current_member.symbol=p_symbol AND public.vnext_trading_invalid_current_v1(current_member.symbol,current_member.input_hash) ? 'proofHash')
)$baseline_sources$;
ALTER FUNCTION public.vnext_target_baseline_sources_current_v1(jsonb,text) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_target_baseline_sources_current_v1(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
DO $action_patch_0$
DECLARE target oid:='public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure;original text;changed text;definition text;metadata jsonb;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'440d0dcee04334f57a2ee9e8fdc920b09d3329d3c3c26e859c7a19e9789c292b' THEN RAISE EXCEPTION 'vnext_action_predecessor_changed';END IF;
 changed:=$successor0$SELECT CASE WHEN left(item->>'id',7)='action:' THEN public.vnext_action_evidence_current_v1(item,p_symbol) ELSE (SELECT CASE WHEN left(item->>'id',9)='forecast:' THEN public.vnext_forecast_evidence_current_internal_v1(item,p_symbol) ELSE (
 SELECT EXISTS(SELECT FROM public.vnext_extractions_v1 receipt JOIN public.vnext_source_policies_v1 policy ON policy.source=receipt.source AND policy.scope=receipt.scope
 WHERE NOT EXISTS(SELECT FROM public.vnext_source_withdrawals_v1 withdrawal WHERE withdrawal.content_hash=receipt.content_hash) AND receipt.state='completed' AND receipt.scope IN('official_original','operator_claim') AND policy.enabled AND policy.valid_until>clock_timestamp() AND policy.rights_subject=receipt.rights_subject AND policy.license_basis=receipt.license_basis
 AND receipt.extraction->'evidence'=item AND receipt.content_hash=item->>'contentHash' AND EXISTS(SELECT FROM jsonb_array_elements(receipt.extraction->'clues') clue WHERE clue->>'symbol'=p_symbol)
 AND ((receipt.original->>'eventAt')::timestamptz>=clock_timestamp()-interval '30 days' OR (receipt.original->>'catalystUntil')::timestamptz BETWEEN clock_timestamp() AND clock_timestamp()+interval '3 months'))
) END) END$successor0$;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex')<>'571152fe153c72656f128c5c995a726cd994f8698080cf1f8cc7d179bcf0619d' THEN RAISE EXCEPTION 'vnext_action_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata OR to_regprocedure('public.vnext_source_evidence_current_v1(jsonb,text)')::oid IS DISTINCT FROM target THEN RAISE EXCEPTION 'vnext_action_existing_metadata_changed';END IF;
END $action_patch_0$;
DO $action_patch_1$
DECLARE target oid:='public.vnext_input_sources_current_v1(jsonb,text)'::regprocedure;original text;changed text;definition text;metadata jsonb;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'ce58e3b7f1a98fcac4dbcb537ba4336e7bbb3c9c7247e1354d6a07bf2bcc8008' THEN RAISE EXCEPTION 'vnext_action_predecessor_changed';END IF;
 changed:=$successor1$SELECT public.vnext_action_terms_input_current_v1(input,p_symbol) AND (SELECT public.vnext_forecast_input_current_internal_v1(input,p_symbol) AND (
 SELECT coalesce(jsonb_typeof(input->'evidence')='array' AND NOT EXISTS(SELECT FROM jsonb_array_elements(input->'evidence') source_item WHERE
  CASE WHEN source_item->>'sourceTier'='official' THEN
   coalesce(source_item->>'source','') !~ '^https://([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(/|$)' AND NOT EXISTS(
    SELECT FROM jsonb_array_elements(coalesce(input->'financialSourceReceipts','[]'::jsonb)) descriptor WHERE descriptor->>'sourceKind'='approved_issuer_ir' AND descriptor->>'factId'=source_item->>'id'
     AND public.vnext_provider_json_codec_v1(jsonb_path_query_array(descriptor->'originalFact','$.*')) AND source_item->>'contentHash'=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(descriptor->'originalFact'),'UTF8')),'hex')
     AND public.vnext_issuer_financial_evidence_current_v1(source_item,input,p_symbol))
  ELSE NOT public.vnext_source_evidence_current_v1(source_item,p_symbol) END),false)
 AND NOT EXISTS(SELECT FROM public.vnext_members_v1 current_member WHERE current_member.symbol=p_symbol AND public.vnext_trading_invalid_current_v1(current_member.symbol,current_member.input_hash) ? 'proofHash')
))$successor1$;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex')<>'912b039211f3624f82fa1940740b9cb47a8f0ed46817e108504b29d5a528b8e4' THEN RAISE EXCEPTION 'vnext_action_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata OR to_regprocedure('public.vnext_input_sources_current_v1(jsonb,text)')::oid IS DISTINCT FROM target THEN RAISE EXCEPTION 'vnext_action_existing_metadata_changed';END IF;
END $action_patch_1$;
DO $action_patch_2$
DECLARE target oid:='public.vnext_target_quote_v1(uuid,text,text,date,timestamptz)'::regprocedure;original text;changed text;definition text;metadata jsonb;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'92f1112444ddcacebce692fbc8c0897eb309c33babee28f9dcff3215f7243325' THEN RAISE EXCEPTION 'vnext_action_predecessor_changed';END IF;
 changed:=$successor2$
DECLARE cutoff timestamptz:=p_cutoff; calendar_rows jsonb; sessions jsonb; calendar_row jsonb; snapshot_rows jsonb; snapshot jsonb; feeds jsonb; events jsonb; feed_tuple jsonb; event_tuple jsonb; chain jsonb:='[]'::jsonb; expected_feeds text[]; current_day date; baseline_calendar jsonb; quote_row jsonb; price_rows jsonb; event_item jsonb; ordinal integer; total_events integer:=0; total_feeds integer:=0; snapshot_hash text; timestamp_text text; action_projection jsonb; action_receipt jsonb; action_receipts jsonb:='[]';
BEGIN
 IF cutoff IS NULL OR NOT isfinite(cutoff) OR cutoff>statement_timestamp() OR p_symbol !~ '^[0-9]{4}$' OR p_stock IS NULL OR p_exchange NOT IN('TWSE','TPEX') OR p_baseline IS NULL OR p_baseline<(cutoff AT TIME ZONE 'Asia/Taipei')::date-900 THEN RETURN jsonb_build_object('deferred','target_price_scope_unavailable'); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(row_item)),'[]'::jsonb) INTO calendar_rows FROM(SELECT session_authority_id,session_id,market,open_at,close_at,status,provider,source_timestamp,collected_at,source_ref,recorded_at FROM public.tw_trading_sessions_v3 WHERE market::text=p_exchange AND session_id BETWEEN p_baseline AND (cutoff AT TIME ZONE 'Asia/Taipei')::date AND source_timestamp<=cutoff AND collected_at<=cutoff AND recorded_at<=cutoff ORDER BY session_id,recorded_at DESC LIMIT 20001)row_item;
 IF jsonb_array_length(calendar_rows)=0 OR jsonb_array_length(calendar_rows)>20000 OR EXISTS(SELECT FROM jsonb_array_elements(calendar_rows) cr WHERE cr->>'provider' IS DISTINCT FROM lower(p_exchange) OR cr->>'status' NOT IN('completed','cancelled') OR nullif(cr->>'source_ref','') IS NULL OR (cr->>'source_timestamp')::timestamptz>(cr->>'collected_at')::timestamptz OR (cr->>'collected_at')::timestamptz>(cr->>'recorded_at')::timestamptz OR (cr->>'open_at')::timestamptz>=(cr->>'close_at')::timestamptz OR ((cr->>'open_at')::timestamptz AT TIME ZONE 'Asia/Taipei')::date<>(cr->>'session_id')::date OR ((cr->>'close_at')::timestamptz AT TIME ZONE 'Asia/Taipei')::date<>(cr->>'session_id')::date) THEN RETURN jsonb_build_object('deferred','target_official_calendar_unavailable'); END IF;
 IF EXISTS(WITH ranked AS(SELECT value,dense_rank() OVER(PARTITION BY value->>'session_id' ORDER BY (value->>'recorded_at')::timestamptz DESC) AS rank FROM jsonb_array_elements(calendar_rows))SELECT FROM ranked WHERE rank=1 GROUP BY value->>'session_id' HAVING count(DISTINCT(value-'session_authority_id'))>1) THEN RETURN jsonb_build_object('deferred','target_official_calendar_conflict');END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'session_id'),'[]'::jsonb) INTO sessions FROM(SELECT DISTINCT ON(value->>'session_id') value FROM jsonb_array_elements(calendar_rows) ORDER BY value->>'session_id',(value->>'recorded_at')::timestamptz DESC,value->>'session_authority_id')heads WHERE value->>'status'='completed' AND (value->>'close_at')::timestamptz<=cutoff;
 IF jsonb_array_length(sessions)=0 OR jsonb_array_length(sessions)>240 THEN RETURN jsonb_build_object('deferred','target_action_interval_unavailable_or_unbounded');END IF;
 SELECT value INTO baseline_calendar FROM jsonb_array_elements(sessions) WHERE value->>'session_id'=p_baseline::text;
 current_day:=(sessions->-1->>'session_id')::date;
 IF baseline_calendar IS NULL OR current_day IS DISTINCT FROM(SELECT max(session_date) FROM public.vnext_sessions_v1 WHERE completed AND close_at<=cutoff) OR NOT EXISTS(SELECT FROM public.vnext_sessions_v1 private_calendar WHERE private_calendar.session_date=current_day AND private_calendar.close_at=(sessions->-1->>'close_at')::timestamptz AND private_calendar.completed) THEN RETURN jsonb_build_object('deferred','target_current_completed_session_unavailable');END IF;
 expected_feeds:=CASE p_exchange WHEN 'TWSE' THEN ARRAY['twse:twt49u:v1','twse:twtauu:v1','twse:twtb8u:v1'] ELSE ARRAY['tpex:exright-cal:v1','tpex:reduction-reference:v1','tpex:change-reference:v1'] END;
 FOR calendar_row IN SELECT value FROM jsonb_array_elements(sessions) WHERE (value->>'session_id')::date>p_baseline LOOP
  SELECT coalesce(jsonb_agg(to_jsonb(row_item)),'[]'::jsonb) INTO snapshot_rows FROM(SELECT snapshot_id,exchange,session_id,session_authority_id,corporate_action_version,provider,collected_at,declared_event_count,dataset_hash,recorded_at FROM public.opportunity_corporate_action_snapshots_v3 WHERE exchange::text=p_exchange AND session_id=(calendar_row->>'session_id')::date AND session_authority_id=(calendar_row->>'session_authority_id')::uuid AND collected_at<=cutoff AND recorded_at<=cutoff ORDER BY collected_at DESC,recorded_at DESC,snapshot_id LIMIT 1001)row_item;
  IF jsonb_array_length(snapshot_rows)=0 OR jsonb_array_length(snapshot_rows)>1000 THEN RETURN jsonb_build_object('deferred','target_action_interval_snapshot_missing');END IF;
  snapshot:=snapshot_rows->0;
  IF EXISTS(SELECT FROM jsonb_array_elements(snapshot_rows) sr WHERE sr->>'collected_at'=snapshot->>'collected_at' AND sr->>'recorded_at'=snapshot->>'recorded_at' AND (sr-'snapshot_id') IS DISTINCT FROM(snapshot-'snapshot_id')) OR snapshot->>'corporate_action_version' IS DISTINCT FROM 'tw-corporate-action-v3.1' OR snapshot->>'provider' IS DISTINCT FROM lower(p_exchange) OR (snapshot->>'collected_at')::timestamptz>(snapshot->>'recorded_at')::timestamptz OR coalesce(snapshot->>'dataset_hash','') !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('deferred','target_action_snapshot_conflict');END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(row_item) ORDER BY row_item.feed_ordinal),'[]'::jsonb) INTO feeds FROM(SELECT feed_ordinal,feed_identity,response_byte_count,response_sha256,parsed_row_count,recorded_at FROM public.opportunity_corporate_action_feed_evidence_v3 WHERE snapshot_id=(snapshot->>'snapshot_id')::uuid AND recorded_at<=cutoff ORDER BY feed_ordinal LIMIT 4)row_item;
  SELECT coalesce(jsonb_agg(to_jsonb(row_item) ORDER BY row_item.event_ordinal),'[]'::jsonb) INTO events FROM(SELECT event_ordinal,symbol,event_kind,pre_action_reference_price,post_action_reference_price,feed_identity,source_row_ref,daily_adjustment_factor,recorded_at FROM public.opportunity_corporate_action_events_v3 WHERE snapshot_id=(snapshot->>'snapshot_id')::uuid AND recorded_at<=cutoff ORDER BY event_ordinal LIMIT 30001)row_item;
  total_events:=total_events+jsonb_array_length(events);total_feeds:=total_feeds+jsonb_array_length(feeds);
  IF jsonb_array_length(feeds)<>3 OR total_events>30000 OR total_feeds>720 OR jsonb_array_length(events)<>(snapshot->>'declared_event_count')::integer OR (SELECT sum((f->>'parsed_row_count')::integer) FROM jsonb_array_elements(feeds) f)<>jsonb_array_length(events) THEN RETURN jsonb_build_object('deferred','target_action_interval_evidence_incomplete');END IF;
  FOR ordinal IN 0..2 LOOP
   IF feeds->ordinal->>'feed_identity' IS DISTINCT FROM expected_feeds[ordinal+1] OR (feeds->ordinal->>'feed_ordinal')::integer<>ordinal OR coalesce(feeds->ordinal->>'response_sha256','') !~ '^[a-f0-9]{64}$' OR (feeds->ordinal->>'response_byte_count')::integer NOT BETWEEN 0 AND 8388608 OR (feeds->ordinal->>'parsed_row_count')::integer<0 THEN RETURN jsonb_build_object('deferred','target_action_interval_evidence_incomplete');END IF;
  END LOOP;
  ordinal:=0;
  FOR event_item IN SELECT value FROM jsonb_array_elements(events) LOOP
   IF (event_item->>'event_ordinal')::integer<>ordinal OR event_item->>'symbol' !~ '^[0-9]{4}$' OR (ordinal>0 AND event_item->>'symbol'<=events->(ordinal-1)->>'symbol') OR event_item->>'event_kind' NOT IN('ex_right_dividend','capital_reduction','par_value_change') OR event_item->>'feed_identity' IS DISTINCT FROM expected_feeds[array_position(ARRAY['ex_right_dividend','capital_reduction','par_value_change'],event_item->>'event_kind')] OR event_item->>'pre_action_reference_price' IN('NaN','Infinity','-Infinity') OR event_item->>'post_action_reference_price' IN('NaN','Infinity','-Infinity') OR event_item->>'daily_adjustment_factor' IN('NaN','Infinity','-Infinity') OR (event_item->>'pre_action_reference_price')::numeric<=0 OR (event_item->>'post_action_reference_price')::numeric<=0 OR abs((event_item->>'daily_adjustment_factor')::numeric-(event_item->>'post_action_reference_price')::numeric/(event_item->>'pre_action_reference_price')::numeric)>0.0000000001 THEN RETURN jsonb_build_object('deferred','target_action_event_invalid');END IF;
   IF event_item->>'source_row_ref' IS DISTINCT FROM encode(sha256(convert_to(public.vnext_catalog_canonical_v1(jsonb_build_array('corporate-action-source-row-v3.1',p_exchange,snapshot->>'session_id',event_item->>'symbol',event_item->>'event_kind',event_item->'pre_action_reference_price',event_item->'post_action_reference_price',event_item->>'feed_identity')),'UTF8')),'hex') THEN RETURN jsonb_build_object('deferred','target_action_hash_or_numeric_codec_unavailable');END IF;
   IF event_item->>'symbol'=p_symbol THEN
    IF action_projection IS NULL THEN action_projection:=public.vnext_action_terms_current_internal_v1(p_stock,p_symbol,cutoff);END IF;
    SELECT value INTO action_receipt FROM jsonb_array_elements(action_projection->'receipts') r WHERE r->'event'->>'snapshotId'=snapshot->>'snapshot_id' AND r->'event'->'ordinal'=event_item->'event_ordinal';
    IF action_receipt IS NULL THEN RETURN jsonb_build_object('deferred','target_current_action_terms_incomplete');END IF;
    IF action_receipt->'event'->>'kind'<>'par_value_change' OR (action_receipt->'terms'->>'cashDividendPerOldShare')::numeric<>0 OR (action_receipt->'terms'->>'cashReturnPerOldShare')::numeric<>0 OR (action_receipt->'terms'->>'subscriptionCashPerOldShare')::numeric<>0 THEN RETURN jsonb_build_object('deferred','target_cash_or_rights_intent_decision_required');END IF;
    action_receipts:=action_receipts||jsonb_build_array(action_receipt);
   END IF;
   ordinal:=ordinal+1;
  END LOOP;
  SELECT jsonb_agg(jsonb_build_array(f->>'feed_identity',f->'response_byte_count',f->>'response_sha256',f->'parsed_row_count') ORDER BY (f->>'feed_ordinal')::integer) INTO feed_tuple FROM jsonb_array_elements(feeds) f;
  SELECT coalesce(jsonb_agg(jsonb_build_array(e->>'symbol',e->>'event_kind',e->'pre_action_reference_price',e->'post_action_reference_price',e->>'feed_identity',e->>'source_row_ref') ORDER BY(e->>'event_ordinal')::integer),'[]'::jsonb) INTO event_tuple FROM jsonb_array_elements(events)e;
  timestamp_text:=regexp_replace(snapshot->>'collected_at','\.(\d*?)0+(?=\+00:00$)', '.\1');timestamp_text:=replace(timestamp_text,'.+00:00','+00:00');
  snapshot_hash:=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(jsonb_build_array('corporate-action-snapshot-v3.1',p_exchange,snapshot->>'session_id',snapshot->>'session_authority_id',snapshot->>'corporate_action_version',snapshot->>'provider',timestamp_text,feed_tuple,event_tuple)),'UTF8')),'hex');
  IF snapshot_hash IS DISTINCT FROM snapshot->>'dataset_hash' THEN RETURN jsonb_build_object('deferred','target_action_hash_or_numeric_codec_unavailable');END IF;
  chain:=chain||jsonb_build_array(jsonb_build_object('session',calendar_row->'session_id','authority',calendar_row->'session_authority_id','snapshot',snapshot->'snapshot_id','hash',snapshot->'dataset_hash'));
 END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(row_item)),'[]'::jsonb) INTO price_rows FROM(SELECT observation_id,stock_id,exchange,session_id,session_authority_id,raw_close,provider,source_timestamp,collected_at,source_ref,recorded_at FROM public.opportunity_price_observations_v3 WHERE stock_id=p_stock AND exchange::text=p_exchange AND session_id=current_day AND source_timestamp<=cutoff AND collected_at<=cutoff AND recorded_at<=cutoff ORDER BY source_timestamp DESC,collected_at DESC,recorded_at DESC,observation_id LIMIT 4001)row_item;
 IF jsonb_array_length(price_rows)=0 OR jsonb_array_length(price_rows)>4000 THEN RETURN jsonb_build_object('deferred','target_current_official_quote_missing');END IF;
 quote_row:=price_rows->0;
 IF quote_row->>'provider' IS DISTINCT FROM lower(p_exchange) OR quote_row->>'session_authority_id' IS DISTINCT FROM sessions->-1->>'session_authority_id' OR quote_row->>'raw_close' IN('NaN','Infinity','-Infinity') OR (quote_row->>'raw_close')::numeric<=0 OR (quote_row->>'source_timestamp')::timestamptz<(sessions->-1->>'close_at')::timestamptz OR (quote_row->>'source_timestamp')::timestamptz>(quote_row->>'collected_at')::timestamptz OR (quote_row->>'collected_at')::timestamptz>(quote_row->>'recorded_at')::timestamptz OR quote_row->>'source_ref' NOT LIKE lower(p_exchange)||'-%' OR EXISTS(SELECT FROM jsonb_array_elements(price_rows) pr WHERE pr->>'source_timestamp'=quote_row->>'source_timestamp' AND pr->>'collected_at'=quote_row->>'collected_at' AND pr->>'recorded_at'=quote_row->>'recorded_at' AND (pr-'observation_id') IS DISTINCT FROM(quote_row-'observation_id')) THEN RETURN jsonb_build_object('deferred','target_current_official_quote_conflict');END IF;
 RETURN jsonb_build_object('session',current_day,'quote',quote_row,'baselineCalendar',baseline_calendar,'currentCalendar',sessions->-1,'actionChain',chain,'actionChainHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(chain),'UTF8')),'hex'))||CASE WHEN jsonb_array_length(action_receipts)>0 THEN jsonb_build_object('corporateActionReceipts',action_receipts) ELSE '{}'::jsonb END;
END $successor2$;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex')<>'f78c879d15d5e9ccce1a15207f9a0f6543e0cf10f58c51bb48ff37d664058320' THEN RAISE EXCEPTION 'vnext_action_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata OR to_regprocedure('public.vnext_target_quote_v1(uuid,text,text,date,timestamptz)')::oid IS DISTINCT FROM target THEN RAISE EXCEPTION 'vnext_action_existing_metadata_changed';END IF;
END $action_patch_2$;
DO $action_patch_3$
DECLARE target oid:='public.vnext_target_current_v1(text,uuid,text)'::regprocedure;original text;changed text;definition text;metadata jsonb;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO original,definition,metadata FROM pg_proc p WHERE oid=target;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'36c4904a11c58981e11264294500d161a86655495f512868a712ded08a30f3fb' THEN RAISE EXCEPTION 'vnext_action_predecessor_changed';END IF;
 changed:=$successor3$
DECLARE pub public.vnext_publications_v1; job public.vnext_jobs_v1; member public.vnext_members_v1; frozen jsonb; original_quote jsonb; quote_source jsonb; artifact jsonb; review jsonb; claim jsonb; checked jsonb; quote_claim jsonb; scenario jsonb; scenarios jsonb:='{}'::jsonb; key_name text; method text; base numeric; bear numeric; bull numeric; original_price numeric; instrument_rows jsonb; instrument jsonb; price jsonb; receipt jsonb;
 author_call public.vnext_provider_invocations_v1; reviewer_call public.vnext_provider_invocations_v1; author_input jsonb; reviewer_input jsonb; action_receipt jsonb; share_gcd numeric; share_numerator numeric:=1; share_denominator numeric:=1; original_scenarios jsonb; rebasing jsonb;
BEGIN
 IF p_symbol !~ '^[0-9]{4}$' OR p_revision IS NULL OR coalesce(p_input_hash,'') !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('deferred','target_current_identity_missing');END IF;
 SELECT * INTO pub FROM public.vnext_publications_v1 WHERE revision_id=p_revision AND symbol=p_symbol;
 SELECT * INTO member FROM public.vnext_members_v1 WHERE symbol=p_symbol;
 SELECT * INTO job FROM public.vnext_jobs_v1 WHERE job_id=pub.job_id;
 SELECT preparation.evidence INTO frozen FROM public.vnext_preparations_v1 preparation WHERE preparation.job_id=pub.job_id;
 IF pub.revision_id IS NULL OR member.state='exited' OR member.contraindication OR member.input_hash IS DISTINCT FROM p_input_hash OR pub.input_hash IS DISTINCT FROM p_input_hash OR job.input_hash IS DISTINCT FROM p_input_hash OR job.symbol IS DISTINCT FROM p_symbol OR job.state IS DISTINCT FROM 'published' OR pub.content IS DISTINCT FROM job.author_result OR frozen IS DISTINCT FROM member.evidence OR public.vnext_target_baseline_sources_current_v1(frozen,p_symbol) IS DISTINCT FROM true THEN RETURN jsonb_build_object('deferred','target_current_revision_input_or_rights_unavailable');END IF;
 IF EXISTS(SELECT FROM public.vnext_publications_v1 newer WHERE newer.symbol=p_symbol AND (newer.published_at,newer.revision_id)>(pub.published_at,pub.revision_id)) THEN RETURN jsonb_build_object('deferred','target_newer_publication_exists');END IF;
 IF EXISTS(SELECT FROM public.vnext_jobs_v1 pending WHERE pending.symbol=p_symbol AND pending.state IN('queued','running','authored','reviewing')) OR EXISTS(SELECT FROM public.vnext_provider_invocations_v1 unresolved JOIN public.vnext_jobs_v1 unresolved_job ON unresolved_job.job_id=unresolved.job_id WHERE unresolved_job.symbol=p_symbol AND unresolved.state IN('dispatching','pending','uncertain')) OR EXISTS(SELECT FROM public.vnext_thesis_audits_v1 audit WHERE audit.symbol=p_symbol AND audit.created_at>pub.published_at AND audit.report->'materialReasons' ?| ARRAY['verified_financial_inputs_changed','new_permitted_original_content','published_claim_or_period_changed']) THEN RETURN jsonb_build_object('deferred','target_pending_fundamental_or_source_work');END IF;
 artifact:=pub.content;review:=job.reviewer_result;
 IF artifact->>'outputHash' IS DISTINCT FROM encode(sha256(convert_to(public.vnext_catalog_canonical_v1(artifact-'outputHash'),'UTF8')),'hex') OR review->>'factsChecked' IS DISTINCT FROM 'true' OR review->>'valuationChecked' IS DISTINCT FROM 'true' OR review->>'claimsChecked' IS DISTINCT FROM 'true' OR jsonb_array_length(coalesce(review->'findings','[]'::jsonb))<>0 OR review->>'approved' IS DISTINCT FROM 'true' OR review->>'authorOutputHash' IS DISTINCT FROM artifact->>'outputHash' OR job.author_principal IS NULL OR job.reviewer_principal IS NULL OR job.author_principal=job.reviewer_principal OR job.execution_id IS NULL OR job.reviewer_execution IS NULL OR job.execution_id=job.reviewer_execution OR job.sources_read_at IS NULL THEN RETURN jsonb_build_object('deferred','target_original_independent_review_missing');END IF;
 SELECT * INTO author_call FROM public.vnext_provider_invocations_v1 WHERE job_id=job.job_id AND task='author';SELECT * INTO reviewer_call FROM public.vnext_provider_invocations_v1 WHERE job_id=job.job_id AND task='reviewer';
 IF author_call.state IS DISTINCT FROM 'completed' OR reviewer_call.state IS DISTINCT FROM 'completed' OR author_call.invocation_id=reviewer_call.invocation_id OR coalesce(author_call.provider_response_id,'') !~ '^resp_[A-Za-z0-9_-]{1,160}$' OR coalesce(reviewer_call.provider_response_id,'') !~ '^resp_[A-Za-z0-9_-]{1,160}$' OR author_call.provider_response_id=reviewer_call.provider_response_id OR author_call.principal IS DISTINCT FROM job.author_principal OR reviewer_call.principal IS DISTINCT FROM job.reviewer_principal OR author_call.execution_id IS DISTINCT FROM job.execution_id OR reviewer_call.execution_id IS DISTINCT FROM job.reviewer_execution OR author_call.input_hash IS DISTINCT FROM p_input_hash OR reviewer_call.input_hash IS DISTINCT FROM p_input_hash OR author_call.normalized_output IS DISTINCT FROM artifact OR reviewer_call.normalized_output IS DISTINCT FROM review OR author_call.settled_at IS NULL OR reviewer_call.settled_at IS NULL OR author_call.settled_at>author_call.deadline_at OR reviewer_call.settled_at>reviewer_call.deadline_at OR author_call.settled_at<author_call.started_at OR reviewer_call.settled_at<reviewer_call.started_at OR author_call.settled_at>job.sources_read_at OR job.sources_read_at>reviewer_call.started_at OR reviewer_call.settled_at>pub.published_at OR author_call.request_hash IS DISTINCT FROM encode(sha256(convert_to(public.vnext_catalog_canonical_v1(author_call.frozen_request),'UTF8')),'hex') OR reviewer_call.request_hash IS DISTINCT FROM encode(sha256(convert_to(public.vnext_catalog_canonical_v1(reviewer_call.frozen_request),'UTF8')),'hex') THEN RETURN jsonb_build_object('deferred','target_original_provider_receipts_missing');END IF;
 author_input:=(author_call.frozen_request->>'input')::jsonb;reviewer_input:=(reviewer_call.frozen_request->>'input')::jsonb;
 IF author_input IS DISTINCT FROM (jsonb_build_object('schemaVersion','vnext-worker-input-v1','task','author','jobId',job.job_id,'executionId',job.execution_id,'inputHash',job.input_hash,'evidence',jsonb_build_object('cutoff',frozen->'cutoff','evidence',frozen->'evidence'))||CASE WHEN author_call.prompt_version IN('vnext-research-worker-v3','vnext-research-worker-v5') THEN jsonb_build_object('symbol',p_symbol) ELSE '{}'::jsonb END) OR reviewer_input IS DISTINCT FROM (jsonb_build_object('schemaVersion','vnext-worker-input-v1','task','reviewer','jobId',job.job_id,'executionId',job.reviewer_execution,'inputHash',job.input_hash,'evidence',jsonb_build_object('cutoff',frozen->'cutoff','evidence',frozen->'evidence'),'authorArtifact',artifact)||CASE WHEN reviewer_call.prompt_version IN('vnext-research-worker-v3','vnext-research-worker-v5') THEN jsonb_build_object('symbol',p_symbol) ELSE '{}'::jsonb END) THEN RETURN jsonb_build_object('deferred','target_frozen_review_request_mismatch');END IF;
 PERFORM public.vnext_validate_claims_v1(artifact,frozen->'evidence');
 IF (SELECT count(*) FROM jsonb_array_elements(artifact->'claims') c WHERE c->'numeric'->>'key'='current_price')<>1 THEN RETURN jsonb_build_object('deferred','target_original_reviewed_quote_missing');END IF;
 SELECT value INTO quote_claim FROM jsonb_array_elements(artifact->'claims') c WHERE c.value->'numeric'->>'key'='current_price';
 IF quote_claim->'numeric'->>'period' IS DISTINCT FROM artifact->>'quoteDate' OR artifact->>'quoteDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR artifact->>'valuationDate'<artifact->>'quoteDate' OR (artifact->>'valuationDate')::date>(pub.published_at AT TIME ZONE 'Asia/Taipei')::date THEN RETURN jsonb_build_object('deferred','target_original_valuation_dates_invalid');END IF;
 original_price:=(quote_claim->'numeric'->>'value')::numeric;
 FOREACH key_name IN ARRAY ARRAY['valuation_bear','valuation_base','valuation_bull'] LOOP
  IF (SELECT count(*) FROM jsonb_array_elements(artifact->'claims') c WHERE c->'numeric'->>'key'=key_name)<>1 THEN RETURN jsonb_build_object('deferred','target_original_scenario_missing');END IF;
  SELECT value INTO scenario FROM jsonb_array_elements(artifact->'claims') c WHERE c.value->'numeric'->>'key'=key_name;
  IF quote_claim->'numeric'->>'unit' NOT IN('TWD','TWD_per_share','TWD/share') OR scenario->'numeric'->>'unit' NOT IN('TWD','TWD_per_share','TWD/share') OR (scenario->'numeric'->>'value')::numeric<=0 THEN RETURN jsonb_build_object('deferred','target_original_scenario_unit_invalid');END IF;
  scenarios:=scenarios||jsonb_build_object(key_name,scenario);
 END LOOP;
 IF (SELECT count(*) FROM jsonb_each(scenarios) c GROUP BY c.value->'numeric'->>'period' LIMIT 1)<>3 THEN RETURN jsonb_build_object('deferred','target_original_scenario_period_invalid');END IF;
 SELECT substr(c->>'id',11) INTO method FROM jsonb_array_elements(artifact->'claims') c WHERE c->>'id' IN('valuation:forward_pe','valuation:forward_pb','valuation:normalized_pe','valuation:ev_ebitda','valuation:dcf');
 IF method IS NULL OR (SELECT count(*) FROM jsonb_array_elements(artifact->'claims') c WHERE c->>'id' IN('valuation:forward_pe','valuation:forward_pb','valuation:normalized_pe','valuation:ev_ebitda','valuation:dcf'))<>1 THEN RETURN jsonb_build_object('deferred','target_original_method_missing');END IF;
 FOR claim IN SELECT value FROM jsonb_array_elements(artifact->'claims') c WHERE c.value->'numeric'->>'key' IN('current_price','valuation_bear','valuation_base','valuation_bull') OR c.value->>'id'='valuation:'||method LOOP
  IF (SELECT count(*) FROM jsonb_array_elements(review->'claimChecks') rc WHERE rc->>'claimId'=claim->>'id' AND rc->>'verdict'='supported')<>1 THEN RETURN jsonb_build_object('deferred','target_original_claim_unreviewed');END IF;
  SELECT value INTO checked FROM jsonb_array_elements(review->'claimChecks') rc WHERE rc.value->>'claimId'=claim->>'id';
  IF EXISTS(SELECT FROM jsonb_array_elements(frozen->'evidence') original WHERE claim->'evidenceIds' ? (original->>'id') AND NOT EXISTS(SELECT FROM jsonb_array_elements(checked->'sources') checked_source WHERE checked_source->>'id'=original->>'id' AND checked_source->>'contentHash'=original->>'contentHash')) THEN RETURN jsonb_build_object('deferred','target_original_claim_source_hash_missing');END IF;
 END LOOP;
 bear:=(scenarios->'valuation_bear'->'numeric'->>'value')::numeric;base:=(scenarios->'valuation_base'->'numeric'->>'value')::numeric;bull:=(scenarios->'valuation_bull'->'numeric'->>'value')::numeric;
 IF NOT(bear>0 AND bear<original_price AND bear<=base AND base<=bull AND base>original_price) THEN RETURN jsonb_build_object('deferred','target_original_reviewed_scenario_unusable');END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(row_item)),'[]'::jsonb) INTO instrument_rows FROM(SELECT instrument_authority_id,stock_id,symbol,exchange,instrument_type,listing_status,provider,source_timestamp,valid_from,valid_to,roster_version,recorded_at FROM public.stock_instruments_v3 WHERE symbol=p_symbol AND instrument_type::text='common_stock' AND source_timestamp<=statement_timestamp() AND recorded_at<=statement_timestamp() AND valid_from<=statement_timestamp() AND (valid_to IS NULL OR valid_to>statement_timestamp()) ORDER BY recorded_at DESC,instrument_authority_id LIMIT 101) row_item;
 IF jsonb_array_length(instrument_rows)=0 OR jsonb_array_length(instrument_rows)>100 THEN RETURN jsonb_build_object('deferred','target_current_instrument_missing');END IF;
 instrument:=instrument_rows->0;
 IF (instrument->>'source_timestamp')::timestamptz>(instrument->>'recorded_at')::timestamptz OR instrument->>'listing_status' IS DISTINCT FROM 'active' OR instrument->>'exchange' NOT IN('TWSE','TPEX') OR instrument->>'provider' IS DISTINCT FROM lower(instrument->>'exchange') OR instrument->>'roster_version' IS DISTINCT FROM 'tw-instrument-roster-v3.0' OR EXISTS(SELECT FROM jsonb_array_elements(instrument_rows) ir WHERE ir->>'recorded_at'=instrument->>'recorded_at' AND (ir-'instrument_authority_id') IS DISTINCT FROM(instrument-'instrument_authority_id')) THEN RETURN jsonb_build_object('deferred','target_current_instrument_conflict');END IF;
 original_quote:=public.vnext_target_quote_v1((instrument->>'stock_id')::uuid,p_symbol,instrument->>'exchange',(artifact->>'quoteDate')::date,pub.published_at);
 IF original_quote ? 'deferred' OR original_quote->>'session' IS DISTINCT FROM artifact->>'quoteDate' OR (original_quote->'quote'->>'raw_close')::numeric IS DISTINCT FROM original_price THEN RETURN jsonb_build_object('deferred','target_original_quote_authority_missing');END IF;
 SELECT value INTO quote_source FROM jsonb_array_elements(frozen->'evidence') original WHERE quote_claim->'evidenceIds' ? (original->>'id') AND original->>'key'='current_price' AND original->>'kind'='fact' AND original->>'sourceTier'='official' AND original->>'id'=original_quote->'quote'->>'observation_id' AND original->'value'=original_quote->'quote'->'raw_close' AND original->>'period'=artifact->>'quoteDate';
 IF quote_source IS NULL OR (quote_source->>'availableAt')::timestamptz>pub.published_at THEN RETURN jsonb_build_object('deferred','target_original_quote_source_binding_missing');END IF;
 IF quote_source->>'contentHash' IS DISTINCT FROM encode(sha256(convert_to(public.vnext_catalog_canonical_v1(jsonb_build_object('observationId',original_quote->'quote'->'observation_id','session',original_quote->'quote'->'session_id','rawClose',original_quote->'quote'->'raw_close','sourceTimestamp',original_quote->'quote'->'source_timestamp','recordedAt',original_quote->'quote'->'recorded_at','sourceUrl',CASE WHEN instrument->>'exchange'='TWSE' THEN 'https://www.twse.com.tw/' ELSE 'https://www.tpex.org.tw/' END)),'UTF8')),'hex') THEN RETURN jsonb_build_object('deferred','target_original_quote_hash_or_numeric_codec_unavailable');END IF;
 price:=public.vnext_target_quote_v1((instrument->>'stock_id')::uuid,p_symbol,instrument->>'exchange',(artifact->>'quoteDate')::date,statement_timestamp());
 IF price ? 'deferred' THEN RETURN price;END IF;
 original_scenarios:=jsonb_build_object('base',base,'bear',bear,'bull',bull,'unit',quote_claim->'numeric'->'unit','quoteAt',artifact->'quoteDate');
 IF price ? 'corporateActionReceipts' THEN
  FOR action_receipt IN SELECT value FROM jsonb_array_elements(price->'corporateActionReceipts') LOOP
   share_numerator:=share_numerator*(action_receipt->'terms'->>'newShares')::numeric;share_denominator:=share_denominator*(action_receipt->'terms'->>'oldShares')::numeric;share_gcd:=gcd(share_numerator,share_denominator);share_numerator:=trim_scale(share_numerator/share_gcd);share_denominator:=trim_scale(share_denominator/share_gcd);
   IF share_numerator*1000000<share_denominator OR share_numerator>share_denominator*1000000 THEN RETURN jsonb_build_object('deferred','target_share_ratio_unusable');END IF;
  END LOOP;
  IF base*1000000<>trunc(base*1000000) OR bear*1000000<>trunc(bear*1000000) OR bull*1000000<>trunc(bull*1000000) OR mod(base*1000000*share_denominator,share_numerator)<>0 OR mod(bear*1000000*share_denominator,share_numerator)<>0 OR mod(bull*1000000*share_denominator,share_numerator)<>0 THEN RETURN jsonb_build_object('deferred','target_exact_decimal_rebase_unavailable');END IF;
  base:=trim_scale(base*share_denominator/share_numerator);bear:=trim_scale(bear*share_denominator/share_numerator);bull:=trim_scale(bull*share_denominator/share_numerator);
  IF bear<0.000001 OR bull>=1e21 THEN RETURN jsonb_build_object('deferred','target_exact_decimal_rebase_unavailable');END IF;
  rebasing:=jsonb_build_object('schemaVersion','vnext-per-share-target-rebase-v1','symbol',p_symbol,'revisionId',p_revision,'originalBaselineHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(original_scenarios||jsonb_build_object('inputHash',p_input_hash,'outputHash',artifact->'outputHash')),'UTF8')),'hex'),'originalInputHash',p_input_hash,'originalOutputHash',artifact->'outputHash','original',original_scenarios,'shareRatio',jsonb_build_object('numerator',share_numerator::text,'denominator',share_denominator::text),'rebased',jsonb_build_object('base',base,'bear',bear,'bull',bull,'unit','TWD_per_share'),'actionReceiptHashes',(SELECT jsonb_agg(value->'receiptHash' ORDER BY ordinality) FROM jsonb_array_elements(price->'corporateActionReceipts') WITH ORDINALITY));
 END IF;
 IF (price->'quote'->>'raw_close')::numeric<base THEN RETURN jsonb_build_object('deferred','target_not_reached');END IF;
 receipt:=jsonb_build_object('schemaVersion','vnext-target-exit-proof-v1','symbol',p_symbol,'revisionId',p_revision,'inputHash',p_input_hash,'authorOutputHash',artifact->'outputHash','base',base,'quote',price,'baselineQuoteDate',artifact->'quoteDate','valuationDate',artifact->'valuationDate','instrumentAuthority',instrument->'instrument_authority_id','newerThesisScope','current_server_publication_input_and_work');
 IF rebasing IS NOT NULL THEN receipt:=receipt||jsonb_build_object('rebasing',rebasing||jsonb_build_object('receiptHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(rebasing),'UTF8')),'hex')));END IF;
 RETURN receipt||jsonb_build_object('proofHash',encode(sha256(convert_to(public.vnext_catalog_canonical_v1(receipt),'UTF8')),'hex'));
END $successor3$;
 IF encode(sha256(convert_to(changed,'UTF8')),'hex')<>'2cb716f773f8e5069c56f7f85aa20677bd7c83cfa6a12ecc2784ca8ffb8c393f' THEN RAISE EXCEPTION 'vnext_action_successor_changed';END IF;
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM metadata OR to_regprocedure('public.vnext_target_current_v1(text,uuid,text)')::oid IS DISTINCT FROM target THEN RAISE EXCEPTION 'vnext_action_existing_metadata_changed';END IF;
END $action_patch_3$;

DO $action_post$
DECLARE before_state jsonb;after_state jsonb;entry record;old_row jsonb;new_row jsonb;relation oid:='public.vnext_action_terms_rights_v1'::regclass;
 catalog_sql constant text:=$catalog$
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
 SELECT value INTO STRICT before_state FROM vnext_action_install_before_v1;
 EXECUTE catalog_sql INTO after_state USING ARRAY['public.vnext_source_evidence_current_v1(jsonb,text)'::regprocedure::oid,'public.vnext_input_sources_current_v1(jsonb,text)'::regprocedure::oid,'public.vnext_target_quote_v1(uuid,text,text,date,timestamptz)'::regprocedure::oid,'public.vnext_target_current_v1(text,uuid,text)'::regprocedure::oid],ARRAY[]::oid[],'{}'::jsonb;
 FOR entry IN SELECT * FROM jsonb_each(before_state) LOOP
  IF jsonb_typeof(entry.value)<>'array' THEN IF after_state->entry.key IS DISTINCT FROM entry.value THEN RAISE EXCEPTION 'vnext_action_original_catalog_changed:%',entry.key;END IF;CONTINUE;END IF;
  FOR old_row IN SELECT value FROM jsonb_array_elements(entry.value) LOOP
   IF NOT(after_state->entry.key @> jsonb_build_array(old_row)) THEN RAISE EXCEPTION 'vnext_action_original_catalog_changed:%',entry.key;END IF;
  END LOOP;
  FOR new_row IN SELECT value FROM jsonb_array_elements(after_state->entry.key) WHERE NOT(entry.value @> jsonb_build_array(value)) LOOP
   IF entry.key='routines' AND new_row->>'proname' IN('vnext_action_terms_rights_guard_v1','vnext_disclosed_action_terms_internal_v1','vnext_action_terms_current_internal_v1','vnext_action_terms_read_v1','vnext_action_terms_input_current_v1','vnext_action_evidence_current_v1','vnext_target_baseline_sources_current_v1','vnext_action_preparation_guard_v1') THEN CONTINUE;
   ELSIF entry.key='relations' AND new_row->>'relname' IN('vnext_action_terms_rights_v1','vnext_action_terms_rights_v1_pkey','vnext_action_terms_event_use_unique') THEN CONTINUE;
   ELSIF entry.key='types' AND new_row->>'typname' IN('vnext_action_terms_rights_v1','_vnext_action_terms_rights_v1') THEN CONTINUE;
   ELSIF entry.key='columns' AND (new_row->>'attrelid')::oid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN('vnext_action_terms_rights_v1','vnext_action_terms_rights_v1_pkey','vnext_action_terms_event_use_unique')) THEN CONTINUE;
   ELSIF entry.key='constraints' AND (new_row->>'conrelid')::oid=relation THEN CONTINUE;
   ELSIF entry.key='defaults' AND (new_row->>'adrelid')::oid=relation THEN CONTINUE;
   ELSIF entry.key='indexes' AND (new_row->>'indrelid')::oid=relation THEN CONTINUE;
   ELSIF entry.key='triggers' AND new_row->>'tgname'='vnext_action_preparation_current' AND (new_row->>'tgrelid')::oid='public.vnext_preparations_v1'::regclass AND (new_row->>'tgfoid')::oid='public.vnext_action_preparation_guard_v1()'::regprocedure THEN CONTINUE;
   ELSIF entry.key='triggers' AND ((new_row->>'tgrelid')::oid=relation OR (new_row->>'tgconstraint')::oid IN(SELECT oid FROM pg_constraint WHERE conrelid=relation AND contype='f')) THEN CONTINUE;
   ELSE RAISE EXCEPTION 'vnext_action_undeclared_catalog_delta:%',entry.key;END IF;
  END LOOP;
 END LOOP;
 IF NOT EXISTS(SELECT FROM pg_class WHERE oid=relation AND relowner='opportunity_v3_rpc_owner'::regrole AND relrowsecurity AND NOT relforcerowsecurity) OR EXISTS(SELECT FROM pg_policy WHERE polrelid=relation) OR EXISTS(SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=relation AND (a.grantee<>c.relowner OR a.grantor<>c.relowner OR a.is_grantable)) OR EXISTS(SELECT FROM pg_attribute WHERE attrelid=relation AND attacl IS NOT NULL) THEN RAISE EXCEPTION 'vnext_action_private_rights_profile';END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('vnext_action_terms_rights_guard_v1','vnext_disclosed_action_terms_internal_v1','vnext_action_terms_current_internal_v1','vnext_action_terms_read_v1','vnext_action_terms_input_current_v1','vnext_action_evidence_current_v1','vnext_target_baseline_sources_current_v1','vnext_action_preparation_guard_v1'))<>8 THEN RAISE EXCEPTION 'vnext_action_new_routine_count';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_action_terms_rights_guard_v1()'::regprocedure AND pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef=false AND provolatile='v' AND prokind='f' AND NOT proretset AND NOT proisstrict AND NOT proleakproof AND proparallel='u' AND proconfig=ARRAY['search_path=pg_catalog, public'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='6108b878208979236a4ec71439606a69196df09d72f4a4bf42a73f57dac258bf') THEN RAISE EXCEPTION 'vnext_action_new_body_profile';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_action_terms_rights_guard_v1()'::regprocedure)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_action_terms_rights_guard_v1()'::regprocedure AND (a.grantee NOT IN('opportunity_v3_rpc_owner'::regrole::oid) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_action_new_routine_acl';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_disclosed_action_terms_internal_v1(text)'::regprocedure AND pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef=false AND provolatile='i' AND prokind='f' AND NOT proretset AND NOT proisstrict AND NOT proleakproof AND proparallel='u' AND proconfig=ARRAY['search_path=pg_catalog'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='2405f04908c4e644b993921f613d5e5eedd1ea4ccb32d494edee750f244482b1') THEN RAISE EXCEPTION 'vnext_action_new_body_profile';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_disclosed_action_terms_internal_v1(text)'::regprocedure)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_disclosed_action_terms_internal_v1(text)'::regprocedure AND (a.grantee NOT IN('opportunity_v3_rpc_owner'::regrole::oid) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_action_new_routine_acl';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_action_terms_current_internal_v1(uuid,text,timestamptz)'::regprocedure AND pg_get_userbyid(proowner)='opportunity_v3_rpc_owner' AND prosecdef=true AND provolatile='s' AND prokind='f' AND NOT proretset AND NOT proisstrict AND NOT proleakproof AND proparallel='u' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='d945d76fcc1bf622d02b4615e45858033260fd303d0ff89303dbff4d15a91bc2') THEN RAISE EXCEPTION 'vnext_action_new_body_profile';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_action_terms_current_internal_v1(uuid,text,timestamptz)'::regprocedure)<>2 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_action_terms_current_internal_v1(uuid,text,timestamptz)'::regprocedure AND (a.grantee NOT IN('opportunity_v3_rpc_owner'::regrole::oid,'stockinsider_vnext_owner'::regrole::oid) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_action_new_routine_acl';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_action_terms_read_v1(text,uuid,uuid)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef=true AND provolatile='v' AND prokind='f' AND NOT proretset AND NOT proisstrict AND NOT proleakproof AND proparallel='u' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='4ccddbda3b926c73ddf35228f2652eb8bfa83390f0adb1c4eed8143a5f9e8c74') THEN RAISE EXCEPTION 'vnext_action_new_body_profile';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_action_terms_read_v1(text,uuid,uuid)'::regprocedure)<>2 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_action_terms_read_v1(text,uuid,uuid)'::regprocedure AND (a.grantee NOT IN('stockinsider_vnext_owner'::regrole::oid,'service_role'::regrole::oid) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_action_new_routine_acl';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_action_terms_input_current_v1(jsonb,text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef=true AND provolatile='s' AND prokind='f' AND NOT proretset AND NOT proisstrict AND NOT proleakproof AND proparallel='u' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='4b0f64a1a87931564a50354d8ffa9275e1b719fa0e35836da67ba41c9af4765f') THEN RAISE EXCEPTION 'vnext_action_new_body_profile';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_action_terms_input_current_v1(jsonb,text)'::regprocedure)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_action_terms_input_current_v1(jsonb,text)'::regprocedure AND (a.grantee NOT IN('stockinsider_vnext_owner'::regrole::oid) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_action_new_routine_acl';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_action_evidence_current_v1(jsonb,text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef=true AND provolatile='s' AND prokind='f' AND NOT proretset AND NOT proisstrict AND NOT proleakproof AND proparallel='u' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='b16002c239b1f9d90e468b5f4bfc16761c873c74318f02fa90f6bd03a7fc9426') THEN RAISE EXCEPTION 'vnext_action_new_body_profile';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_action_evidence_current_v1(jsonb,text)'::regprocedure)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_action_evidence_current_v1(jsonb,text)'::regprocedure AND (a.grantee NOT IN('stockinsider_vnext_owner'::regrole::oid) OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_action_new_routine_acl';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_target_baseline_sources_current_v1(jsonb,text)'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=pg_catalog, public'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='ce58e3b7f1a98fcac4dbcb537ba4336e7bbb3c9c7247e1354d6a07bf2bcc8008') THEN RAISE EXCEPTION 'vnext_action_target_baseline_profile';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_target_baseline_sources_current_v1(jsonb,text)'::regprocedure)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_target_baseline_sources_current_v1(jsonb,text)'::regprocedure AND (a.grantee<>p.proowner OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_action_target_baseline_acl';END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid='public.vnext_action_preparation_guard_v1()'::regprocedure AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND NOT prosecdef AND provolatile='v' AND proconfig=ARRAY['search_path=pg_catalog, public','statement_timeout=30s','lock_timeout=2s'] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='4e6ecb8467234210e4f18511a43cd646fb6029de608c1865ec45314461567a07') THEN RAISE EXCEPTION 'vnext_action_preparation_guard_profile';END IF;
 IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_action_preparation_guard_v1()'::regprocedure)<>1 OR EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.vnext_action_preparation_guard_v1()'::regprocedure AND (a.grantee<>p.proowner OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'vnext_action_preparation_guard_acl';END IF;
 IF NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='public.vnext_preparations_v1'::regclass AND tgname='vnext_action_preparation_current' AND tgfoid='public.vnext_action_preparation_guard_v1()'::regprocedure AND tgtype=7 AND tgenabled='O' AND NOT tgisinternal AND tgqual IS NULL AND tgargs=''::bytea) THEN RAISE EXCEPTION 'vnext_action_preparation_trigger_profile';END IF;
END $action_post$;
COMMIT;
