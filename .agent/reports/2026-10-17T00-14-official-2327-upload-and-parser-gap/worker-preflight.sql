BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $$ BEGIN
 IF current_database()<>'stockinsider' OR current_user<>'postgres' OR current_setting('data_directory')<>'/var/lib/postgresql/17/stockinsider' THEN RAISE EXCEPTION 'database_identity_mismatch';END IF;
 IF (SELECT count(*) FROM public.production_writer_releases WHERE active)<>1 OR EXISTS(SELECT FROM public.production_writer_releases WHERE active AND (release_id IS DISTINCT FROM 'dd59817f750684b093965f539dd4de466be13077' OR writer_kind IS DISTINCT FROM 'vps')) THEN RAISE EXCEPTION 'writer_identity_mismatch';END IF;
 IF EXISTS(SELECT FROM public.production_write_leases WHERE lease_key='production-data-plane') THEN RAISE EXCEPTION 'data_plane_lease_not_empty';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.claim_candidate_financial_document_receipts_v6(integer,text,timestamptz,timestamptz)'::regprocedure) IS DISTINCT FROM '830fffbb0cacbebd329d79d0a48ff39c5bb8d8637c4f1b1e4848001c47bb55f5' THEN RAISE EXCEPTION 'claim_source_mismatch';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='public.reconcile_pending_financial_document_jobs_v9(uuid,integer,uuid)'::regprocedure) IS DISTINCT FROM '1eb9cfa2beb10de0b07ed0759c5d0b5f925b55dd715017f2551b406a1086f7cd' THEN RAISE EXCEPTION 'reconcile_source_mismatch';END IF;
END $$;
SELECT json_build_object('observedAt',clock_timestamp(),
 'receipt',(SELECT json_build_object('receiptId',receipt_id,'stockId',stock_id,'jobId',acquisition_job_id,'periodEnd',period_end,'sha256',document_sha256,'bytes',byte_length,'contentType',content_type,'receiptStatus',receipt_status,'parserStatus',parser_status,'publishedAt',published_at,'financialValidationStatus',financial_validation_status) FROM public.candidate_financial_document_receipts_v6 WHERE receipt_id='c5b6ccf0-25d5-4fa3-b257-4f0b194c0090'),
 'parserEligibleCount',(SELECT count(*) FROM public.candidate_financial_document_receipts_v6 WHERE parser_status='queued' OR (parser_status='running' AND parser_lease_expires_at<clock_timestamp())),
 'parserEligibleFirst',(SELECT receipt_id FROM public.candidate_financial_document_receipts_v6 WHERE parser_status='queued' OR (parser_status='running' AND parser_lease_expires_at<clock_timestamp()) ORDER BY accepted_at,receipt_id LIMIT 1),
 'dueValidationCount',(SELECT count(*) FROM public.candidate_financial_document_receipts_v6 WHERE financial_validation_status='pending' AND (financial_validation_next_attempt_at IS NULL OR financial_validation_next_attempt_at<=clock_timestamp())),
 'dueReconciliations',COALESCE((SELECT json_agg(row_to_json(x)) FROM (SELECT l.receipt_id,l.job_id FROM public.candidate_financial_document_job_links_v9 l JOIN public.candidate_financial_acquisition_jobs_v4 j ON j.job_id=l.job_id JOIN public.candidate_financial_document_receipts_v6 r ON r.receipt_id=l.receipt_id WHERE r.parser_status='complete' AND j.status IN ('queued','running') AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=clock_timestamp()) ORDER BY j.updated_at,l.linked_at,l.receipt_id,l.job_id LIMIT 41) x),'[]'::json));
ROLLBACK;
