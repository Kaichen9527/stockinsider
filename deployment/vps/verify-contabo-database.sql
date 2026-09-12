\set ON_ERROR_STOP on

DO $verification$
BEGIN
  IF current_database()<>'stockinsider_stage'
    OR current_setting('listen_addresses')<>''
    OR (SELECT count(*) FROM pg_roles WHERE rolname='stockinsider' AND rolcanlogin
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)<>1
    OR (SELECT count(*) FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)<>1
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY(ARRAY[
        'source_run_ledger','candidate_source_mentions','candidate_research_runs',
        'candidate_research_run_items','official_price_history','candidate_detail_snapshots',
        'radar_public_snapshots']))<>7
    OR (SELECT count(DISTINCT p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=ANY(ARRAY[
        'source_document_coverage','publish_radar_public_snapshots',
        'candidate_research_stock_authority_page']))<>3
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY(ARRAY[
        'stockinsider_data_plane_settings_v1','stockinsider_backend_identities_v1',
        'provider_credentials_encrypted_v1','private_artifact_receipts_v1']))<>4
    OR to_regnamespace('vault') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_extension WHERE extname='supabase_vault')
  THEN
    RAISE EXCEPTION 'stockinsider_restored_database_contract_failed';
  END IF;
END
$verification$;

SELECT json_build_object(
  'schema','stockinsider-contabo-production-restore-v1',
  'postgresVersion',current_setting('server_version'),
  'databaseBytes',pg_database_size(current_database()),
  'publicTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')),
  'publicFunctions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'),
  'userTriggers',(SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal),
  'rlsTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relrowsecurity),
  'policies',(SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
  'identityFenceEnabled',(SELECT identity_fence_enabled
    FROM public.stockinsider_data_plane_settings_v1 WHERE singleton),
  'vaultExcluded',to_regnamespace('vault') IS NULL
);
