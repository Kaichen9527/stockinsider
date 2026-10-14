BEGIN;
-- Historical display only. No new claim, role assignment or durable write.
CREATE INDEX research_dossier_company_publication_v2_idx
 ON public.candidate_research_dossiers(research_company_id,published_at DESC,id DESC)
 WHERE revision_kind='research_input_v2' AND validation_status='valid';

CREATE FUNCTION public.read_research_company_publication_v2(p_company uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE d public.candidate_research_dossiers;c public.candidate_dossier_submission_receipts;
 i public.research_article_input_revisions_v2;a public.research_author_assignments_v2;
 ra public.research_reviewer_assignments_v2;ar public.research_author_results_v2;
 rr public.research_reviewer_results_v2;company public.research_observed_companies_v1;v jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR p_company IS NULL
 THEN RAISE EXCEPTION 'research_publication_view_request';END IF;
 -- Acquire the original order BEFORE selecting the latest version. A withdrawal
 -- must never make the reader silently select an older positive article.
 PERFORM pg_advisory_xact_lock(610091002::bigint);PERFORM pg_advisory_xact_lock(2409,6002);
 SELECT * INTO company FROM public.research_observed_companies_v1 WHERE research_company_id=p_company;
 IF company.research_company_id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO d FROM public.candidate_research_dossiers WHERE research_company_id=p_company
  AND revision_kind='research_input_v2' AND validation_status='valid'
  ORDER BY published_at DESC,id DESC LIMIT 1;
 IF d.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO c FROM public.candidate_dossier_submission_receipts WHERE dossier_id=d.id;
 SELECT * INTO i FROM public.research_article_input_revisions_v2 WHERE revision_id=d.research_input_revision_id;
 SELECT * INTO ar FROM public.research_author_results_v2 WHERE result_id=d.research_author_result_id;
 SELECT * INTO rr FROM public.research_reviewer_results_v2 WHERE result_id=d.research_reviewer_result_id;
 SELECT * INTO a FROM public.research_author_assignments_v2 WHERE assignment_id=ar.assignment_id;
 SELECT * INTO ra FROM public.research_reviewer_assignments_v2 WHERE assignment_id=rr.assignment_id;
 IF c.submission_id IS NULL OR c.status IS DISTINCT FROM 'accepted' OR i.revision_id IS NULL
  OR d.published_at IS NULL OR NOT isfinite(d.published_at)
  OR i.research_company_id IS DISTINCT FROM p_company OR c.research_company_id IS DISTINCT FROM p_company
  OR ar.result_id IS NULL OR rr.result_id IS NULL OR a.assignment_id IS NULL OR ra.assignment_id IS NULL
 THEN RAISE EXCEPTION 'research_publication_view_lineage';END IF;
 v:=public.read_completed_research_publication_v2(i.canonical_request,i.revision_id,i.input_hash,
  a.controller_principal,ra.reviewer_principal,ar.result_id,ar.result_hash,rr.result_id,rr.result_hash);
 IF v IS NULL OR v->'receipt'->>'dossierId' IS DISTINCT FROM d.id::text
  OR v->'receipt'->>'submissionId' IS DISTINCT FROM c.submission_id::text
  OR v->'content'->'deepResearch'->'article'->>'researchCompanyId' IS DISTINCT FROM p_company::text
  OR v->'content'->'deepResearch'->'article'->>'symbol' IS DISTINCT FROM company.symbol
 THEN RAISE EXCEPTION 'research_publication_view_lineage';END IF;
 RETURN jsonb_build_object('schemaVersion','research-company-publication-v2',
  'researchCompanyId',p_company,'symbol',company.symbol,'publishedAt',d.published_at,'publication',v);
END $$;
ALTER FUNCTION public.read_research_company_publication_v2(uuid) OWNER TO research_observed_rpc_owner;
REVOKE ALL ON FUNCTION public.read_research_company_publication_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_research_company_publication_v2(uuid) TO service_role;
COMMIT;
