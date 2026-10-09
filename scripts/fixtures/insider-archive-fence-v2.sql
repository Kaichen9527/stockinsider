-- DISPOSABLE TEST FIXTURE ONLY. Not a migration, production registry or eviction RPC.
-- Established public relations/functions are extracted verbatim by the harness.
CREATE SCHEMA archive_fixture;
CREATE SEQUENCE archive_fixture.event_slot MINVALUE 1 MAXVALUE 128 NO CYCLE;
CREATE TABLE archive_fixture.events (
 slot bigint PRIMARY KEY DEFAULT nextval('archive_fixture.event_slot'),
 event_id uuid NOT NULL UNIQUE DEFAULT extensions.gen_random_uuid(),
 relation_name text NOT NULL, mutation text NOT NULL, binding jsonb NOT NULL
);
CREATE TABLE archive_fixture.operations (
 id uuid PRIMARY KEY, raw_hash text NOT NULL CHECK(raw_hash ~ '^[0-9a-f]{64}$'),
 current_generation bigint NOT NULL DEFAULT 0, reservation_bytes bigint NOT NULL DEFAULT 12582912
);
CREATE TABLE archive_fixture.attempts (
 id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(), operation_id uuid NOT NULL REFERENCES archive_fixture.operations,
 generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 64), backend_id uuid NOT NULL,
 lease_owner uuid NOT NULL UNIQUE, acquired_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 head jsonb NOT NULL, journal text NOT NULL, state text NOT NULL CHECK(state IN ('active','invalid','terminal')),
 verified_hash text, invalidated_at timestamptz, invalidation_reason text, terminal_at timestamptz, UNIQUE(operation_id,generation)
);
CREATE TABLE archive_fixture.payloads(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, raw bytea NOT NULL, metadata jsonb NOT NULL);
CREATE FUNCTION archive_fixture.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fixture_history_immutable'; END $$;
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE OR TRUNCATE ON archive_fixture.events FOR EACH STATEMENT EXECUTE FUNCTION archive_fixture.immutable();
CREATE FUNCTION archive_fixture.authority_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,archive_fixture AS $$
BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'fixture_authority_truncate_refused'; END IF;
 INSERT INTO archive_fixture.events(relation_name,mutation,binding)
 VALUES(TG_TABLE_NAME,TG_OP,jsonb_build_object('old',CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,'new',CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END));
 RETURN NULL;
END $$;
CREATE FUNCTION archive_fixture.lease_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,archive_fixture AS $$
BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'fixture_lease_truncate_refused'; END IF;
 UPDATE archive_fixture.attempts SET state='invalid',invalidation_reason='lease_'||lower(TG_OP)
 WHERE state='active' AND lease_owner IN (
  CASE WHEN TG_OP<>'INSERT' AND OLD.lease_key='production-data-plane' THEN OLD.owner_id END,
  CASE WHEN TG_OP<>'DELETE' AND NEW.lease_key='production-data-plane' THEN NEW.owner_id END);
 RETURN NULL;
END $$;
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['internal_principal_role_bindings_v3','stockinsider_backend_identities_v1','production_writer_releases','stockinsider_data_plane_settings_v1'] LOOP
  EXECUTE format('CREATE TRIGGER archive_authority_event AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION archive_fixture.authority_event()',rel);
  EXECUTE format('CREATE TRIGGER archive_authority_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION archive_fixture.authority_event()',rel);
 END LOOP;
END $$;
CREATE TRIGGER archive_lease_event AFTER INSERT OR UPDATE OR DELETE ON public.production_write_leases FOR EACH ROW EXECUTE FUNCTION archive_fixture.lease_event();
CREATE TRIGGER archive_lease_truncate BEFORE TRUNCATE ON public.production_write_leases FOR EACH STATEMENT EXECUTE FUNCTION archive_fixture.lease_event();
CREATE FUNCTION archive_fixture.journal() RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,public,archive_fixture,extensions AS $$
 SELECT encode(extensions.digest(convert_to(jsonb_build_object('count',count(*),'events',coalesce(jsonb_agg(jsonb_build_array(slot,event_id,relation_name,mutation,binding) ORDER BY slot),'[]'))::text,'UTF8'),'sha256'),'hex') FROM archive_fixture.events
$$;
CREATE FUNCTION archive_fixture.gate() RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,archive_fixture AS $$
DECLARE backend uuid;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'fixture_isolation_refused'; END IF;
 LOCK TABLE public.production_write_leases IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.production_writer_releases IN SHARE MODE;
 LOCK TABLE public.stockinsider_backend_identities_v1 IN SHARE MODE;
 LOCK TABLE public.stockinsider_data_plane_settings_v1 IN SHARE MODE;
 LOCK TABLE public.internal_principal_role_bindings_v3 IN SHARE MODE;
 -- Subsequent statements get fresh READ COMMITTED snapshots after lock acquisition.
 IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND t.tgenabled='O' AND (
       (t.tgname IN ('archive_authority_event','archive_authority_truncate') AND c.relname IN ('internal_principal_role_bindings_v3','stockinsider_backend_identities_v1','production_writer_releases','stockinsider_data_plane_settings_v1'))
       OR(t.tgname IN ('archive_lease_event','archive_lease_truncate') AND c.relname='production_write_leases'))))<>10 THEN RAISE EXCEPTION 'fixture_observer_uncovered'; END IF;
 backend:=public.assert_stockinsider_backend_request_v1(false);
 IF backend IS NULL THEN RAISE EXCEPTION 'fixture_backend_disabled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.production_writer_releases r JOIN public.stockinsider_backend_identities_v1 b ON b.release_id=r.release_id WHERE r.active AND b.backend_id=backend) THEN RAISE EXCEPTION 'fixture_writer_rejected'; END IF;
 RETURN backend;
END $$;
CREATE FUNCTION archive_fixture.head(p_backend uuid) RETURNS jsonb LANGUAGE sql VOLATILE SET search_path=pg_catalog,public,archive_fixture AS $$
 SELECT jsonb_build_object('backend',to_jsonb(b),'settings',(SELECT to_jsonb(s) FROM public.stockinsider_data_plane_settings_v1 s WHERE singleton),
 'writer',(SELECT to_jsonb(r) FROM public.production_writer_releases r WHERE active),
 'principal',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.binding_id) FROM public.internal_principal_role_bindings_v3 p
 WHERE p.principal_id=b.principal_id AND p.role='opportunity_runner' AND p.recorded_at=(SELECT max(q.recorded_at) FROM public.internal_principal_role_bindings_v3 q WHERE q.principal_id=b.principal_id AND q.role='opportunity_runner' AND q.recorded_at<=clock_timestamp())))
 FROM public.stockinsider_backend_identities_v1 b WHERE b.backend_id=p_backend
$$;
CREATE FUNCTION archive_fixture.acquire(p_operation uuid,p_hash text,p_expected bigint DEFAULT NULL) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,archive_fixture AS $$
DECLARE backend uuid; op archive_fixture.operations; prior archive_fixture.attempts; lease public.production_write_leases; owner uuid; binding uuid;
BEGIN
 backend:=archive_fixture.gate();
 SELECT * INTO op FROM archive_fixture.operations WHERE id=p_operation FOR UPDATE;
 IF FOUND THEN
  IF op.raw_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'fixture_source_conflict'; END IF;
  SELECT * INTO STRICT prior FROM archive_fixture.attempts WHERE operation_id=p_operation AND generation=op.current_generation;
  SELECT * INTO lease FROM public.production_write_leases WHERE lease_key='production-data-plane';
  IF prior.state='terminal' THEN
   IF p_expected IS NULL AND prior.backend_id=backend THEN RETURN prior.id; END IF;
   RAISE EXCEPTION 'fixture_terminal_immutable';
  END IF;
  IF p_expected IS NULL THEN
   IF prior.state='active' AND prior.backend_id=backend AND prior.head=archive_fixture.head(backend) AND prior.journal=archive_fixture.journal()
      AND lease.owner_id=prior.lease_owner AND lease.acquired_at=prior.acquired_at AND lease.expires_at>clock_timestamp() THEN RETURN prior.id; END IF;
   RAISE EXCEPTION 'fixture_new_attempt_required';
  END IF;
  IF p_expected<>op.current_generation THEN RAISE EXCEPTION 'fixture_attempt_cas'; END IF;
 ELSE
  IF p_expected IS NOT NULL OR (SELECT count(*) FROM archive_fixture.operations)>=32 THEN RAISE EXCEPTION 'fixture_operation_bound'; END IF;
  INSERT INTO archive_fixture.operations(id,raw_hash) VALUES(p_operation,p_hash) RETURNING * INTO op;
 END IF;
 IF (SELECT count(*) FROM archive_fixture.attempts)>=64 THEN RAISE EXCEPTION 'fixture_attempt_bound'; END IF;
 owner:=extensions.gen_random_uuid();
 IF public.acquire_production_write_lease('production-data-plane',owner,300) IS DISTINCT FROM true THEN RAISE EXCEPTION 'fixture_live_owner'; END IF;
 SELECT * INTO STRICT lease FROM public.production_write_leases WHERE lease_key='production-data-plane' FOR UPDATE;
 IF lease.owner_id<>owner OR lease.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'fixture_lease_rejected'; END IF;
 UPDATE archive_fixture.attempts SET state='invalid',invalidation_reason='new_attempt' WHERE operation_id=p_operation AND state='active';
 UPDATE archive_fixture.operations SET current_generation=current_generation+1 WHERE id=p_operation RETURNING * INTO op;
 INSERT INTO archive_fixture.attempts(operation_id,generation,backend_id,lease_owner,acquired_at,expires_at,head,journal,state)
 VALUES(p_operation,op.current_generation,backend,owner,lease.acquired_at,lease.expires_at,archive_fixture.head(backend),archive_fixture.journal(),'active') RETURNING id INTO binding;
 RETURN binding;
END $$;
CREATE FUNCTION archive_fixture.check_attempt(p_binding uuid) RETURNS archive_fixture.attempts
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,archive_fixture AS $$
DECLARE backend uuid; a archive_fixture.attempts; lease public.production_write_leases;
BEGIN
 backend:=archive_fixture.gate();
 SELECT * INTO STRICT a FROM archive_fixture.attempts WHERE id=p_binding FOR UPDATE;
 IF a.state<>'active' OR a.backend_id<>backend OR a.head IS DISTINCT FROM archive_fixture.head(backend) OR a.journal IS DISTINCT FROM archive_fixture.journal() THEN RAISE EXCEPTION 'fixture_old_verification'; END IF;
 SELECT * INTO lease FROM public.production_write_leases WHERE lease_key='production-data-plane';
 IF lease.owner_id IS DISTINCT FROM a.lease_owner OR lease.acquired_at IS DISTINCT FROM a.acquired_at OR lease.expires_at<=clock_timestamp() OR lease.expires_at IS NULL THEN RAISE EXCEPTION 'fixture_lease_rejected'; END IF;
 IF (SELECT current_generation FROM archive_fixture.operations WHERE id=a.operation_id)<>a.generation THEN RAISE EXCEPTION 'fixture_attempt_cas'; END IF;
 RETURN a;
END $$;
CREATE FUNCTION archive_fixture.verify(p_binding uuid,p_real_readback_hash text) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,archive_fixture AS $$
DECLARE a archive_fixture.attempts;
BEGIN
 a:=archive_fixture.check_attempt(p_binding);
 IF p_real_readback_hash IS DISTINCT FROM (SELECT raw_hash FROM archive_fixture.operations WHERE id=a.operation_id) THEN RAISE EXCEPTION 'fixture_readback_mismatch'; END IF;
 UPDATE archive_fixture.attempts SET verified_hash=p_real_readback_hash WHERE id=a.id; RETURN true;
END $$;
CREATE FUNCTION archive_fixture.terminal(p_binding uuid) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,archive_fixture AS $$
DECLARE a archive_fixture.attempts;
BEGIN
 a:=archive_fixture.check_attempt(p_binding);
 IF a.verified_hash IS DISTINCT FROM (SELECT raw_hash FROM archive_fixture.operations WHERE id=a.operation_id) THEN RAISE EXCEPTION 'fixture_readback_required'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'fixture_isolation_refused'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.production_write_leases WHERE lease_key='production-data-plane' AND owner_id=a.lease_owner AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'fixture_lease_rejected'; END IF;
 UPDATE archive_fixture.attempts SET state='terminal' WHERE id=a.id; RETURN true;
END $$;
CREATE FUNCTION archive_fixture.renew(p_binding uuid) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,archive_fixture AS $$
DECLARE a archive_fixture.attempts; raw_hash text;
BEGIN
 -- check_attempt holds every earlier lock before its attempt row lock; nested
 -- gate calls only reacquire this transaction's already-held relation locks.
 a:=archive_fixture.check_attempt(p_binding);
 SELECT o.raw_hash INTO raw_hash FROM archive_fixture.operations o WHERE o.id=a.operation_id;
 IF public.release_production_write_lease('production-data-plane',a.lease_owner) IS DISTINCT FROM true THEN RAISE EXCEPTION 'fixture_lease_rejected'; END IF;
 RETURN archive_fixture.acquire(a.operation_id,raw_hash,a.generation);
END $$;
CREATE FUNCTION archive_fixture.attempt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'fixture_attempt_history_immutable'; END IF;
 IF (to_jsonb(NEW)-'state'-'verified_hash'-'invalidated_at'-'invalidation_reason'-'terminal_at') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'verified_hash'-'invalidated_at'-'invalidation_reason'-'terminal_at')
  OR OLD.state<>'active' OR NEW.state NOT IN ('active','invalid','terminal')
  OR (OLD.verified_hash IS NOT NULL AND NEW.verified_hash IS DISTINCT FROM OLD.verified_hash)
 THEN RAISE EXCEPTION 'fixture_attempt_history_immutable'; END IF;
 IF NEW.state='invalid' THEN NEW.invalidated_at:=clock_timestamp();NEW.invalidation_reason:=coalesce(NEW.invalidation_reason,'explicit_invalidation');
 ELSIF NEW.state='terminal' THEN NEW.terminal_at:=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_attempt BEFORE UPDATE OR DELETE ON archive_fixture.attempts FOR EACH ROW EXECUTE FUNCTION archive_fixture.attempt_immutable();
CREATE TRIGGER immutable_attempt_truncate BEFORE TRUNCATE ON archive_fixture.attempts FOR EACH STATEMENT EXECUTE FUNCTION archive_fixture.immutable();
-- Explicit synthetic ACL profile: no production ownership/min-privilege claim.
DO $$ DECLARE rel text; BEGIN
 FOREACH rel IN ARRAY ARRAY['events','operations','attempts','payloads'] LOOP
  EXECUTE format('ALTER TABLE archive_fixture.%I ENABLE ROW LEVEL SECURITY',rel);
  EXECUTE format('REVOKE ALL ON archive_fixture.%I FROM PUBLIC,anon,authenticated,service_role',rel);
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA archive_fixture FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA archive_fixture FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA archive_fixture TO service_role;
GRANT EXECUTE ON FUNCTION archive_fixture.acquire(uuid,text,bigint),archive_fixture.renew(uuid),archive_fixture.verify(uuid,text),archive_fixture.terminal(uuid) TO service_role;
