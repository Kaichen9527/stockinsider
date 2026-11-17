BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

ALTER TABLE public.podcast_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_transcripts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.podcast_episodes, public.podcast_transcripts FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM unnest(ARRAY['public.podcast_episodes', 'public.podcast_transcripts']) AS t(relation)
    CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS r(role)
    WHERE has_table_privilege(r.role, t.relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       OR has_any_column_privilege(r.role, t.relation, 'SELECT,INSERT,UPDATE,REFERENCES')
  ) OR EXISTS (
    SELECT FROM unnest(ARRAY['public.podcast_episodes', 'public.podcast_transcripts']) AS t(relation)
    WHERE NOT has_table_privilege('service_role', t.relation, 'SELECT')
       OR NOT has_table_privilege('service_role', t.relation, 'INSERT')
       OR NOT has_table_privilege('service_role', t.relation, 'UPDATE')
  ) THEN
    RAISE EXCEPTION 'podcast_private_storage_acl_mismatch';
  END IF;
END
$$;

COMMIT;
