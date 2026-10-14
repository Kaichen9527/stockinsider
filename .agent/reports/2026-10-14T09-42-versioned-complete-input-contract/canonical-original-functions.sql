CREATE FUNCTION public.research_complete_canonical_v2(v jsonb,d integer DEFAULT 0) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$
DECLARE kind text; result text; n numeric;
BEGIN
 IF d>12 THEN RAISE EXCEPTION 'complete_depth_bound'; END IF;kind:=jsonb_typeof(v);
 IF kind='null' THEN RETURN '["n"]'; END IF;
 IF kind='boolean' THEN RETURN '["b",'||v::text||']'; END IF;
 IF kind='number' THEN n:=(v#>>'{}')::numeric; RETURN '["d",'||to_json(trim_scale(n)::text)::text||']'; END IF;
 IF kind='string' THEN RETURN '["s",'||v::text||']'; END IF;
 IF kind='array' THEN SELECT '["a",['||coalesce(string_agg(public.research_complete_canonical_v2(x,d+1),',' ORDER BY ord),'')||']]' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY a(x,ord);RETURN result; END IF;
 SELECT '["o",['||coalesce(string_agg('['||to_json(key)::text||','||public.research_complete_canonical_v2(value,d+1)||']',',' ORDER BY key COLLATE "C"),'')||']]' INTO result FROM jsonb_each(v);RETURN result;
END $$;
CREATE FUNCTION public.research_complete_hash_v2(v jsonb) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$ SELECT encode(sha256(convert_to(public.research_complete_canonical_v2(v),'UTF8')),'hex') $$;
CREATE FUNCTION public.research_complete_schema_check_v2(v jsonb,s jsonb,known timestamptz,d integer DEFAULT 0) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE k text; child jsonb; idx integer; t timestamptz;
BEGIN
 IF d>12 OR v IS NULL THEN RAISE EXCEPTION 'complete_schema';END IF;
 IF s ? 'const' THEN IF v IS DISTINCT FROM s->'const' THEN RAISE EXCEPTION 'complete_schema_constant';END IF;RETURN;END IF;
 IF s->>'type'='object' THEN
  IF jsonb_typeof(v)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(s->'properties') key) THEN RAISE EXCEPTION 'complete_schema_keys';END IF;
  FOR k,child IN SELECT key,value FROM jsonb_each(s->'properties') LOOP PERFORM public.research_complete_schema_check_v2(v->k,child,known,d+1);END LOOP;RETURN;
 END IF;
 IF s->>'type'='array' THEN
  IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)<>jsonb_array_length(s->'prefixItems') THEN RAISE EXCEPTION 'complete_schema_array';END IF;
  FOR idx IN 0..jsonb_array_length(v)-1 LOOP PERFORM public.research_complete_schema_check_v2(v->idx,s->'prefixItems'->idx,known,d+1);END LOOP;RETURN;
 END IF;
 IF s->>'type'<>'string' OR jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'complete_schema_string';END IF;
 IF s ? 'pattern' AND (v#>>'{}') !~ (s->>'pattern') THEN RAISE EXCEPTION 'complete_schema_pattern';END IF;
 IF s->>'format'='date-time' THEN
  IF (v#>>'{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' THEN RAISE EXCEPTION 'complete_clock_precision';END IF;
  t:=(v#>>'{}')::timestamptz;IF NOT isfinite(t) OR t IS DISTINCT FROM known THEN RAISE EXCEPTION 'complete_clock_binding';END IF;
 END IF;
END $$;
