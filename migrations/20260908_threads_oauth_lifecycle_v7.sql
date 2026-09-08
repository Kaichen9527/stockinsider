BEGIN;

CREATE TABLE IF NOT EXISTS public.threads_data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_code_hash TEXT NOT NULL UNIQUE
    CHECK (confirmation_code_hash ~ '^[0-9a-f]{64}$'),
  threads_user_id_hash TEXT NOT NULL
    CHECK (threads_user_id_hash ~ '^[0-9a-f]{64}$'),
  request_digest TEXT NOT NULL UNIQUE
    CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  request_kind TEXT NOT NULL
    CHECK (request_kind IN ('deauthorize','data_deletion')),
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('accepted','processing','completed','rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_threads_data_deletion_requested
  ON public.threads_data_deletion_requests (requested_at DESC);

CREATE OR REPLACE FUNCTION public.refresh_threads_source_secret_v7(
  p_secret TEXT,
  p_token_hash TEXT,
  p_owner_user_id_hash TEXT,
  p_refreshed_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  IF p_secret IS NULL OR p_secret = ''
    OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_owner_user_id_hash IS NULL OR p_owner_user_id_hash !~ '^[0-9a-f]{64}$'
    OR p_refreshed_at IS NULL OR p_expires_at IS NULL OR p_expires_at <= p_refreshed_at THEN
    RAISE EXCEPTION 'invalid_threads_refresh_payload' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('threads_access_token', 0));
  SELECT id INTO v_secret_id
  FROM vault.decrypted_secrets
  WHERE name = 'threads_access_token'
  ORDER BY updated_at DESC
  LIMIT 1;
  IF v_secret_id IS NULL THEN
    SELECT vault.create_secret(p_secret, 'threads_access_token', 'StockInsider official Threads API long-lived token')
      INTO v_secret_id;
  ELSE
    PERFORM vault.update_secret(v_secret_id, p_secret, 'threads_access_token', 'StockInsider official Threads API long-lived token');
  END IF;
  INSERT INTO public.source_credentials_registry (
    platform,status,credential_ref,last_validated_at,error_message,metadata,updated_at
  ) VALUES (
    'threads','valid','SUPABASE_VAULT:threads_access_token',p_refreshed_at,NULL,
    jsonb_build_object(
      'mode','threads_official_keyword_api',
      'last_refreshed_at',p_refreshed_at,
      'expires_at',p_expires_at,
      'token_hash',p_token_hash,
      'owner_user_id_hash',p_owner_user_id_hash
    ),p_refreshed_at
  )
  ON CONFLICT (platform) DO UPDATE SET
    status = EXCLUDED.status,
    credential_ref = EXCLUDED.credential_ref,
    last_validated_at = EXCLUDED.last_validated_at,
    error_message = NULL,
    metadata = EXCLUDED.metadata,
    updated_at = EXCLUDED.updated_at;
  RETURN v_secret_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.revoke_threads_source_credential_v7(
  p_threads_user_id_hash TEXT,
  p_request_kind TEXT,
  p_confirmation_code_hash TEXT,
  p_request_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $function$
DECLARE
  v_secret_id UUID;
  v_now TIMESTAMPTZ := NOW();
  v_owner_user_id_hash TEXT;
  v_owner_matches BOOLEAN := FALSE;
  v_existing_status TEXT;
BEGIN
  IF p_threads_user_id_hash IS NULL OR p_threads_user_id_hash !~ '^[0-9a-f]{64}$'
    OR p_confirmation_code_hash IS NULL OR p_confirmation_code_hash !~ '^[0-9a-f]{64}$'
    OR p_request_digest IS NULL OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR p_request_kind NOT IN ('deauthorize','data_deletion') THEN
    RAISE EXCEPTION 'invalid_threads_revocation_payload' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_digest, 0));
  SELECT status INTO v_existing_status
  FROM public.threads_data_deletion_requests
  WHERE request_digest = p_request_digest;
  IF v_existing_status IS NOT NULL THEN
    RETURN jsonb_build_object('status',v_existing_status,'credential_deleted',FALSE,'replayed',TRUE);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('threads_access_token', 0));
  SELECT metadata->>'owner_user_id_hash' INTO v_owner_user_id_hash
  FROM public.source_credentials_registry
  WHERE platform = 'threads';
  v_owner_matches := v_owner_user_id_hash IS NOT NULL
    AND v_owner_user_id_hash = p_threads_user_id_hash;

  SELECT id INTO v_secret_id
  FROM vault.decrypted_secrets
  WHERE name = 'threads_access_token'
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_owner_matches AND v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  INSERT INTO public.threads_data_deletion_requests (
    confirmation_code_hash, threads_user_id_hash, request_digest, request_kind,
    status, requested_at, completed_at, metadata
  ) VALUES (
    p_confirmation_code_hash, p_threads_user_id_hash, p_request_digest, p_request_kind,
    'completed', v_now, v_now,
    jsonb_build_object('credential_deleted', v_owner_matches AND v_secret_id IS NOT NULL, 'credential_owner_matched', v_owner_matches)
  );

  IF v_owner_matches THEN
  INSERT INTO public.source_credentials_registry (
    platform, credential_ref, status, last_validated_at,
    error_message, metadata, updated_at
  ) VALUES (
    'threads', NULL, 'invalid', v_now,
    'threads_user_revoked_authorization',
    jsonb_build_object('mode','threads_official_keyword_api','revoked_at',v_now,'revocation_kind',p_request_kind),
    v_now
  )
  ON CONFLICT (platform) DO UPDATE SET
    credential_ref = NULL,
    status = 'invalid',
    last_validated_at = EXCLUDED.last_validated_at,
    error_message = EXCLUDED.error_message,
    metadata = (COALESCE(public.source_credentials_registry.metadata, '{}'::jsonb)
      - 'token_hash' - 'last_refreshed_at' - 'expires_at' - 'non_self_public_search_canary')
      || EXCLUDED.metadata,
    updated_at = EXCLUDED.updated_at;

  UPDATE public.source_connector_registry
  SET lifecycle = 'blocked_auth', updated_at = v_now
  WHERE connector = 'threads';
  END IF;

  RETURN jsonb_build_object(
    'status','completed',
    'credential_deleted',v_owner_matches AND v_secret_id IS NOT NULL,
    'credential_owner_matched',v_owner_matches,
    'completed_at',v_now
  );
END
$function$;

ALTER TABLE public.threads_data_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.threads_data_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.threads_data_deletion_requests TO service_role;

REVOKE ALL ON FUNCTION public.revoke_threads_source_credential_v7(TEXT,TEXT,TEXT,TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_threads_source_credential_v7(TEXT,TEXT,TEXT,TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.refresh_threads_source_secret_v7(TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_threads_source_secret_v7(TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.refresh_threads_source_secret(TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ)
  FROM service_role;

COMMIT;
