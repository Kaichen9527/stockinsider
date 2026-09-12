\set ON_ERROR_STOP on
\if :{?backend_id}
\else
  \echo 'backend_id is required'
  \quit 3
\endif
\if :{?principal_id}
\else
  \echo 'principal_id is required'
  \quit 3
\endif
\if :{?release_id}
\else
  \echo 'release_id is required'
  \quit 3
\endif

SELECT (:'release_id' ~ '^[0-9a-f]{40}$' AND EXISTS(SELECT 1 FROM public.production_writer_releases
  WHERE release_id=:'release_id' AND active AND writer_kind='vps'))::int AS release_ok,
  public.internal_principal_role_is_exact_v3_internal(
    :'principal_id'::uuid,'opportunity_runner',clock_timestamp())::int AS principal_ok \gset
\if :release_ok
\else
  \echo 'contabo_active_release_invalid'
  \quit 3
\endif
\if :principal_ok
\else
  \echo 'contabo_runner_principal_invalid'
  \quit 3
\endif

BEGIN;
UPDATE public.stockinsider_backend_identities_v1 SET status='retired',valid_to=clock_timestamp()
  WHERE status='active' AND backend_id<>:'backend_id'::uuid;
INSERT INTO public.stockinsider_backend_identities_v1(backend_id,principal_id,release_id,status,valid_from,metadata)
VALUES(:'backend_id'::uuid,:'principal_id'::uuid,:'release_id','active',clock_timestamp(),
  jsonb_build_object('activated_by','reviewed_cutover'))
ON CONFLICT(backend_id) DO UPDATE SET principal_id=EXCLUDED.principal_id,release_id=EXCLUDED.release_id,
  status='active',valid_from=EXCLUDED.valid_from,valid_to=NULL,metadata=EXCLUDED.metadata;
UPDATE public.stockinsider_data_plane_settings_v1 SET identity_fence_enabled=true,
  activated_at=clock_timestamp(),activated_by='reviewed_cutover' WHERE singleton;
COMMIT;
