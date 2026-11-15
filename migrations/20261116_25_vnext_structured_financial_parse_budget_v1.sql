BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);

-- The structured parse attempt and its receipt lease share the same deadline.
-- Stage validation runs outside the global production write lease.
DO $budget$
DECLARE
 target regprocedure:='public.vnext_financial_preparation_v1(text,text,jsonb,uuid)'::regprocedure;
 original text; definition text; changed text; catalog jsonb; previous_constraint name;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO STRICT original,definition,catalog
 FROM pg_proc p WHERE oid=target AND prosecdef AND prokind='f'
 AND proowner=(SELECT relowner FROM pg_class WHERE oid='public.financial_preparation_attempts_v1'::regclass);
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>'1fd877e855b90343ad9adba775110a301c9c038a384e98bb03558b74d3e73f8d' THEN
  RAISE EXCEPTION 'financial_parse_budget_predecessor_changed';
 END IF;
 changed:=replace(original,$old_0$a public.financial_preparation_attempts_v1;j public.candidate_financial_acquisition_jobs_v4;r public.candidate_financial_document_receipts_v6;$old_0$,$new_0$a public.financial_preparation_attempts_v1;j public.candidate_financial_acquisition_jobs_v4;r public.candidate_financial_document_receipts_v6;
 attempt_duration interval:=interval '90 seconds';$new_0$);
 changed:=replace(changed,$old_1$   UPDATE public.candidate_financial_document_receipts_v6 SET parser_status='running',parser_owner=attempt::text,parser_lease_expires_at=at+interval '90 seconds' WHERE$old_1$,$new_1$   IF lower(split_part(r.content_type,';',1)) IN ('application/xml','text/xml','application/xhtml+xml','text/html') THEN
    attempt_duration:=interval '180 seconds';
   END IF;
   UPDATE public.candidate_financial_document_receipts_v6 SET parser_status='running',parser_owner=attempt::text,parser_lease_expires_at=at+attempt_duration WHERE$new_1$);
 changed:=replace(changed,$old_2$artifact,at,at+interval '90 seconds') RETURNING * INTO a;$old_2$,$new_2$artifact,at,at+attempt_duration) RETURNING * INTO a;$new_2$);
 IF encode(sha256(convert_to(changed,'UTF8')),'hex')<>'a025bdd483d08b3f54937c70ce07fe870d6dbbf5a354e04031a47ffd86876b85' THEN
  RAISE EXCEPTION 'financial_parse_budget_successor_changed';
 END IF;

 SELECT conname INTO STRICT previous_constraint
 FROM pg_constraint WHERE conrelid='public.financial_preparation_attempts_v1'::regclass
 AND contype='c' AND convalidated
 AND translate(pg_get_expr(conbin,conrelid),'() ', '')=
  'deadline>claimed_atANDdeadline<=claimed_at+''00:01:30''::interval';
 EXECUTE format('ALTER TABLE public.financial_preparation_attempts_v1 DROP CONSTRAINT %I',previous_constraint);
 ALTER TABLE public.financial_preparation_attempts_v1 ADD CONSTRAINT financial_preparation_attempts_deadline_profile_v1
 CHECK (deadline>claimed_at AND deadline<=claimed_at+CASE
  WHEN operation='parse' AND lower(split_part(artifact->>'mediaType',';',1)) IN ('application/xml','text/xml','application/xhtml+xml','text/html')
  THEN interval '180 seconds' ELSE interval '90 seconds' END);
 EXECUTE replace(definition,original,changed);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=target) IS DISTINCT FROM catalog THEN
  RAISE EXCEPTION 'financial_parse_budget_catalog_changed';
 END IF;
END $budget$;
COMMIT;
