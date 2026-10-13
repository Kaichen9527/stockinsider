BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
SELECT jsonb_build_object('observed_at',clock_timestamp(),'database',current_database(),'server_version',current_setting('server_version_num'),'read_only',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'snapshot',pg_current_snapshot()::text,
'counts',jsonb_build_object(
'revisions',(SELECT count(*) FROM public.source_document_revisions_v3),
'source_authorities',(SELECT count(*) FROM public.source_identity_authorities_v3),
'publishers',(SELECT count(*) FROM public.publisher_verification_authorities_v3),
'registry',(SELECT count(*) FROM public.source_revision_family_registry_v3),
'verifications',(SELECT count(*) FROM public.source_publication_verifications_v3),
'runs',(SELECT count(*) FROM public.opportunity_runs),
'publisher_manifest_inputs',(SELECT count(*) FROM public.opportunity_run_manifest_inputs WHERE input_role='publisher_verification_allowlist'),
'publisher_manifests',(SELECT count(*) FROM public.opportunity_manifests_v3 WHERE manifest_kind='publisher_verification_allowlist')),
'run_groups',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY mode,run_purpose,status),'[]'::jsonb) FROM (SELECT mode,run_purpose,status,count(*) AS retained_count FROM public.opportunity_runs GROUP BY mode,run_purpose,status LIMIT 100) x));
ROLLBACK;
