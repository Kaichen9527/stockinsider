BEGIN;

CREATE TABLE IF NOT EXISTS public.stockinsider_data_plane_settings_v1 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  identity_fence_enabled boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  activated_by text,
  CHECK ((NOT identity_fence_enabled AND activated_at IS NULL AND activated_by IS NULL)
    OR (identity_fence_enabled AND activated_at IS NOT NULL AND activated_by IS NOT NULL))
);
INSERT INTO public.stockinsider_data_plane_settings_v1(singleton) VALUES(true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.stockinsider_backend_identities_v1 (
  backend_id uuid PRIMARY KEY,
  principal_id uuid NOT NULL,
  release_id text NOT NULL CHECK (release_id ~ '^[0-9a-f]{40}$'),
  status text NOT NULL CHECK (status IN ('staged','active','retired')),
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stockinsider_backend_active_v1
  ON public.stockinsider_backend_identities_v1((status)) WHERE status='active';

CREATE OR REPLACE FUNCTION public.assert_stockinsider_backend_request_v1(p_require_lease boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE headers jsonb; claims jsonb; supplied_backend uuid; supplied_principal uuid; supplied_release text; matched uuid;
BEGIN
  IF NOT COALESCE((SELECT identity_fence_enabled FROM public.stockinsider_data_plane_settings_v1 WHERE singleton),false)
  THEN RETURN NULL; END IF;
  BEGIN
    headers:=COALESCE(NULLIF(current_setting('request.headers',true),''),'{}')::jsonb;
    claims:=COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
    supplied_backend:=(headers->>'x-stockinsider-backend-id')::uuid;
    supplied_principal:=(headers->>'x-stockinsider-runner-principal')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='stockinsider_backend_identity_rejected';
  END;
  supplied_release:=headers->>'x-stockinsider-writer-release';
  IF claims->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='stockinsider_backend_role_rejected';
  END IF;
  SELECT backend_id INTO matched FROM public.stockinsider_backend_identities_v1
  WHERE backend_id=supplied_backend AND principal_id=supplied_principal AND release_id=supplied_release
    AND status='active' AND valid_from<=clock_timestamp()
    AND (valid_to IS NULL OR valid_to>clock_timestamp());
  IF matched IS NULL OR NOT public.internal_principal_role_is_exact_v3_internal(
      supplied_principal,'opportunity_runner',clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='stockinsider_backend_identity_rejected';
  END IF;
  IF p_require_lease AND NOT EXISTS(SELECT 1 FROM public.production_write_leases
      WHERE lease_key='production-data-plane' AND expires_at>clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='stockinsider_backend_lease_required';
  END IF;
  RETURN matched;
END
$function$;

-- Strengthen the existing fence only after an operator stages an identity and
-- flips the singleton during the reviewed cutover. Supabase operation before
-- cutover retains the prior release+lease behavior.
CREATE OR REPLACE FUNCTION public.enforce_production_writer_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE required_release text; supplied_release text; headers jsonb;
BEGIN
  SELECT release_id INTO required_release FROM public.production_writer_releases
    WHERE active ORDER BY activated_at DESC LIMIT 1;
  IF required_release IS NULL THEN RETURN NEW; END IF;
  BEGIN headers:=COALESCE(NULLIF(current_setting('request.headers',true),''),'{}')::jsonb;
  EXCEPTION WHEN OTHERS THEN headers:='{}'::jsonb; END;
  supplied_release:=headers->>'x-stockinsider-writer-release';
  IF supplied_release IS DISTINCT FROM required_release THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='production_writer_release_rejected';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.production_write_leases WHERE lease_key='production-data-plane'
      AND expires_at>clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='production_writer_lease_required';
  END IF;
  PERFORM public.assert_stockinsider_backend_request_v1(true);
  RETURN NEW;
END
$function$;

CREATE TABLE IF NOT EXISTS public.provider_credentials_encrypted_v1 (
  provider text PRIMARY KEY CHECK(provider IN ('threads','finmind')),
  credential_id uuid NOT NULL,
  generation bigint NOT NULL CHECK(generation>=1),
  key_version text NOT NULL CHECK(key_version ~ '^[A-Za-z0-9_-]{1,64}$'),
  iv text, tag text, ciphertext text, token_sha256 text CHECK(token_sha256 IS NULL OR token_sha256 ~ '^[0-9a-f]{64}$'),
  owner_user_id_hash text CHECK(owner_user_id_hash IS NULL OR owner_user_id_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK(status IN ('valid','revoked')),
  expires_at timestamptz,
  refreshed_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status='valid' AND iv IS NOT NULL AND tag IS NOT NULL AND ciphertext IS NOT NULL
    AND token_sha256 IS NOT NULL AND revoked_at IS NULL)
    OR (status='revoked' AND iv IS NULL AND tag IS NULL AND ciphertext IS NULL
      AND token_sha256 IS NULL AND revoked_at IS NOT NULL))
);

CREATE OR REPLACE FUNCTION public.read_provider_credential_envelope_v1(p_provider text)
RETURNS TABLE(provider text,credential_id uuid,generation bigint,key_version text,iv text,tag text,
  ciphertext text,token_sha256 text,owner_user_id_hash text,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
BEGIN
  PERFORM public.assert_stockinsider_backend_request_v1(false);
  IF p_provider NOT IN ('threads','finmind') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='provider_invalid'; END IF;
  RETURN QUERY SELECT c.provider,c.credential_id,c.generation,c.key_version,c.iv,c.tag,c.ciphertext,
    c.token_sha256,c.owner_user_id_hash,c.expires_at FROM public.provider_credentials_encrypted_v1 c
    WHERE c.provider=p_provider AND c.status='valid';
END
$function$;

CREATE OR REPLACE FUNCTION public.read_provider_credential_state_v1(p_provider text)
RETURNS TABLE(credential_id uuid,generation bigint,status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
BEGIN
  PERFORM public.assert_stockinsider_backend_request_v1(false);
  IF p_provider NOT IN ('threads','finmind') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='provider_invalid'; END IF;
  RETURN QUERY SELECT c.credential_id,c.generation,c.status FROM public.provider_credentials_encrypted_v1 c
    WHERE c.provider=p_provider;
END
$function$;

CREATE OR REPLACE FUNCTION public.replace_provider_credential_cas_v1(
  p_provider text,p_expected_generation bigint,p_credential_id uuid,p_key_version text,
  p_iv text,p_tag text,p_ciphertext text,p_token_sha256 text,p_expires_at timestamptz,
  p_owner_user_id_hash text DEFAULT NULL)
RETURNS TABLE(generation bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE prior public.provider_credentials_encrypted_v1%ROWTYPE; next_generation bigint;
BEGIN
  PERFORM public.assert_stockinsider_backend_request_v1(true);
  IF p_provider NOT IN ('threads','finmind') OR p_expected_generation<0
    OR p_key_version !~ '^[A-Za-z0-9_-]{1,64}$' OR p_token_sha256 !~ '^[0-9a-f]{64}$'
    OR char_length(COALESCE(p_iv,'')) NOT BETWEEN 16 AND 32 OR char_length(COALESCE(p_tag,'')) NOT BETWEEN 20 AND 32
    OR char_length(COALESCE(p_ciphertext,'')) NOT BETWEEN 16 AND 22000
    OR (p_owner_user_id_hash IS NOT NULL AND p_owner_user_id_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='provider_credential_payload_invalid';
  END IF;
  SELECT * INTO prior FROM public.provider_credentials_encrypted_v1 WHERE provider=p_provider FOR UPDATE;
  IF (NOT FOUND AND p_expected_generation<>0) OR (FOUND AND prior.generation<>p_expected_generation)
    OR (FOUND AND prior.status='revoked' AND prior.generation<>p_expected_generation) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='provider_credential_generation_conflict';
  END IF;
  next_generation:=p_expected_generation+1;
  INSERT INTO public.provider_credentials_encrypted_v1(provider,credential_id,generation,key_version,iv,tag,
    ciphertext,token_sha256,owner_user_id_hash,status,expires_at,refreshed_at,revoked_at,updated_at)
  VALUES(p_provider,p_credential_id,next_generation,p_key_version,p_iv,p_tag,p_ciphertext,p_token_sha256,
    p_owner_user_id_hash,'valid',p_expires_at,clock_timestamp(),NULL,clock_timestamp())
  ON CONFLICT(provider) DO UPDATE SET credential_id=EXCLUDED.credential_id,generation=EXCLUDED.generation,
    key_version=EXCLUDED.key_version,iv=EXCLUDED.iv,tag=EXCLUDED.tag,ciphertext=EXCLUDED.ciphertext,
    token_sha256=EXCLUDED.token_sha256,owner_user_id_hash=EXCLUDED.owner_user_id_hash,status='valid',
    expires_at=EXCLUDED.expires_at,refreshed_at=EXCLUDED.refreshed_at,revoked_at=NULL,updated_at=EXCLUDED.updated_at;
  INSERT INTO public.source_credentials_registry(platform,status,credential_ref,last_validated_at,error_message,metadata,updated_at)
  VALUES(p_provider,'valid','CONTABO_ENVELOPE:'||p_provider||':'||p_credential_id::text,clock_timestamp(),NULL,
    jsonb_build_object('mode',CASE WHEN p_provider='threads' THEN 'threads_official_keyword_api' ELSE 'finmind_api' END,
      'credential_generation',next_generation,'key_version',p_key_version,'token_hash',p_token_sha256,
      'last_refreshed_at',clock_timestamp(),'expires_at',p_expires_at,'owner_user_id_hash',p_owner_user_id_hash),clock_timestamp())
  ON CONFLICT(platform) DO UPDATE SET status='valid',credential_ref=EXCLUDED.credential_ref,
    last_validated_at=EXCLUDED.last_validated_at,error_message=NULL,
    metadata=COALESCE(public.source_credentials_registry.metadata,'{}'::jsonb)||EXCLUDED.metadata,
    updated_at=EXCLUDED.updated_at;
  RETURN QUERY SELECT next_generation;
END
$function$;

CREATE OR REPLACE FUNCTION public.revoke_provider_credential_cas_v1(
  p_provider text,p_expected_generation bigint,p_owner_user_id_hash text,p_request_kind text,
  p_confirmation_code_hash text,p_request_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE prior public.provider_credentials_encrypted_v1%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM public.assert_stockinsider_backend_request_v1(false);
  IF p_provider<>'threads' OR p_expected_generation<1 OR p_owner_user_id_hash !~ '^[0-9a-f]{64}$'
    OR p_request_kind NOT IN ('deauthorize','data_deletion') OR p_confirmation_code_hash !~ '^[0-9a-f]{64}$'
    OR p_request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='provider_revocation_payload_invalid';
  END IF;
  IF EXISTS(SELECT 1 FROM public.threads_data_deletion_requests WHERE request_digest=p_request_digest) THEN
    RETURN jsonb_build_object('status','completed','replayed',true);
  END IF;
  SELECT * INTO prior FROM public.provider_credentials_encrypted_v1 WHERE provider=p_provider FOR UPDATE;
  IF NOT FOUND OR prior.generation<>p_expected_generation OR prior.status<>'valid'
    OR prior.owner_user_id_hash IS DISTINCT FROM p_owner_user_id_hash THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='provider_credential_revocation_conflict';
  END IF;
  UPDATE public.provider_credentials_encrypted_v1 SET generation=generation+1,status='revoked',iv=NULL,tag=NULL,
    ciphertext=NULL,token_sha256=NULL,expires_at=NULL,refreshed_at=NULL,revoked_at=now_at,updated_at=now_at
    WHERE provider=p_provider;
  UPDATE public.source_credentials_registry SET status='invalid',credential_ref=NULL,
    error_message='threads_user_revoked_authorization',
    metadata=(COALESCE(metadata,'{}'::jsonb)-'token_hash'-'last_refreshed_at'-'expires_at'-'non_self_public_search_canary')
      ||jsonb_build_object('credential_generation',p_expected_generation+1,'revoked_at',now_at,
        'revocation_kind',p_request_kind,'storage','contabo_envelope_v1'),updated_at=now_at
    WHERE platform=p_provider;
  UPDATE public.source_connector_registry SET lifecycle='blocked_auth',updated_at=now_at WHERE connector=p_provider;
  INSERT INTO public.threads_data_deletion_requests(confirmation_code_hash,threads_user_id_hash,request_digest,
    request_kind,status,requested_at,completed_at,metadata)
  VALUES(p_confirmation_code_hash,p_owner_user_id_hash,p_request_digest,p_request_kind,'completed',now_at,now_at,
    jsonb_build_object('credential_deleted',true,'credential_owner_matched',true,'storage','contabo_envelope_v1'));
  RETURN jsonb_build_object('status','completed','credential_deleted',true,'generation',p_expected_generation+1);
END
$function$;

CREATE TABLE IF NOT EXISTS public.private_artifact_receipts_v1 (
  artifact_hash text PRIMARY KEY CHECK(artifact_hash ~ '^[0-9a-f]{64}$'),
  byte_length bigint NOT NULL CHECK(byte_length BETWEEN 1 AND 67108864),
  media_type text NOT NULL CHECK(char_length(media_type) BETWEEN 3 AND 200),
  purpose text NOT NULL CHECK(purpose IN ('financial_document','diagnostic_attachment')),
  created_by_backend_id uuid NOT NULL REFERENCES public.stockinsider_backend_identities_v1(backend_id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE OR REPLACE FUNCTION public.register_private_artifact_receipt_v1(
  p_artifact_hash text,p_byte_length bigint,p_media_type text,p_purpose text,p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(artifact_hash text,idempotent_replay boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE backend uuid; existing public.private_artifact_receipts_v1%ROWTYPE;
BEGIN
  backend:=public.assert_stockinsider_backend_request_v1(true);
  IF p_artifact_hash !~ '^[0-9a-f]{64}$' OR p_byte_length NOT BETWEEN 1 AND 67108864
    OR char_length(COALESCE(p_media_type,'')) NOT BETWEEN 3 AND 200
    OR p_purpose NOT IN ('financial_document','diagnostic_attachment') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='private_artifact_receipt_invalid';
  END IF;
  SELECT * INTO existing FROM public.private_artifact_receipts_v1 WHERE private_artifact_receipts_v1.artifact_hash=p_artifact_hash;
  IF FOUND THEN
    IF existing.byte_length<>p_byte_length OR existing.media_type<>p_media_type OR existing.purpose<>p_purpose THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='private_artifact_receipt_conflict';
    END IF;
    RETURN QUERY SELECT p_artifact_hash,true; RETURN;
  END IF;
  INSERT INTO public.private_artifact_receipts_v1(artifact_hash,byte_length,media_type,purpose,created_by_backend_id,metadata)
    VALUES(p_artifact_hash,p_byte_length,p_media_type,p_purpose,backend,COALESCE(p_metadata,'{}'::jsonb));
  RETURN QUERY SELECT p_artifact_hash,false;
END
$function$;

ALTER TABLE public.stockinsider_data_plane_settings_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stockinsider_backend_identities_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_credentials_encrypted_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_artifact_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stockinsider_data_plane_settings_v1,public.stockinsider_backend_identities_v1,
  public.provider_credentials_encrypted_v1,public.private_artifact_receipts_v1 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.assert_stockinsider_backend_request_v1(boolean),
  public.read_provider_credential_envelope_v1(text),
  public.read_provider_credential_state_v1(text),
  public.replace_provider_credential_cas_v1(text,bigint,uuid,text,text,text,text,text,timestamptz,text),
  public.revoke_provider_credential_cas_v1(text,bigint,text,text,text,text),
  public.register_private_artifact_receipt_v1(text,bigint,text,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_stockinsider_backend_request_v1(boolean),
  public.read_provider_credential_envelope_v1(text),
  public.read_provider_credential_state_v1(text),
  public.replace_provider_credential_cas_v1(text,bigint,uuid,text,text,text,text,text,timestamptz,text),
  public.revoke_provider_credential_cas_v1(text,bigint,text,text,text,text),
  public.register_private_artifact_receipt_v1(text,bigint,text,text,jsonb)
  TO service_role;

COMMIT;
