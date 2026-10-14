from pathlib import Path
import subprocess
old='15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb'
s=subprocess.check_output(['git','show',old+':migrations/20261009_research_complete_input_v2.sql']).decode(); seal=s[s.index('CREATE FUNCTION public.seal_research_article_input_revision_v2'):s.index('DO $$ BEGIN\n IF (SELECT encode')]
seal=seal.replace('seal_research_article_input_revision_v2(p_request jsonb,p_calculation jsonb)','seal_research_article_input_candidate_v3(p_request jsonb,p_calculation jsonb,p_context_hash text)')
seal=seal.replace('DECLARE parent jsonb;', 'DECLARE ctx jsonb; b jsonb; c jsonb; parent jsonb;')
seal=seal.replace('public.read_research_article_input_revision_v2(p_request)','public.read_research_article_input_candidate_v3(p_request)')
seal=seal.replace("parent:=existing->'preparation';p:=parent->'payload';m:=public.research_complete_mapping_v2(p->>'symbol');", "ctx:=public.assert_research_input_candidate_v3(p_request,p_context_hash);parent:=ctx->'preparation';p:=parent->'payload';b:=ctx->'binding';c:=b->'core';m:=b->'registration';")
seal=seal.replace("m->'schema'","m->'schemaTemplate'")
seal=seal.replace(" IF p_calculation->>'sourceClosureHash' IS DISTINCT FROM m->>'sourceClosureHash' OR p_calculation->>'artifactInventoryHash' IS DISTINCT FROM m->>'inventoryHash' THEN RAISE EXCEPTION 'complete_calculation_mapping';END IF;", " IF c->>'wireVersion'='research-article-input-v2' THEN\n  IF p_calculation->>'sourceClosureHash' IS DISTINCT FROM c->>'sourceExecutionHash' OR p_calculation->>'artifactInventoryHash' IS DISTINCT FROM c->>'inventoryHash' THEN RAISE EXCEPTION 'complete_calculation_mapping';END IF;\n ELSE\n  IF p_calculation->>'candidateArtifactInventoryHash' IS DISTINCT FROM c->>'inventoryHash' OR p_calculation->>'financialProfile' IS DISTINCT FROM c->>'financialProfile' OR p_calculation->>'symbol' IS DISTINCT FROM c->>'symbol' THEN RAISE EXCEPTION 'complete_calculation_mapping';END IF;\n END IF;")
seal=seal.replace('parent:=public.research_complete_parent_v2(p_request);n:=clock_timestamp();', "ctx:=public.assert_research_input_candidate_v3(p_request,p_context_hash);parent:=ctx->'preparation';n:=clock_timestamp();")
seal=seal.replace("known<(m->>'modelCutoff')::timestamptz","known<(m->>'knownFloor')::timestamptz")
seal=seal.replace("'schemaVersion','research-article-input-v2'","'schemaVersion',c->>'wireVersion'")
seal=seal.replace("'financial',jsonb_build_object('artifactInventory',m->'inventory','material',f),", "'financial',jsonb_build_object('artifactInventory',m->'inventory','material',f)||CASE WHEN c->>'wireVersion'='research-article-input-v3' THEN jsonb_build_object('candidate',p_calculation-'financialMaterial','protocol',c||jsonb_build_object('bindingCapsuleIdentity',b->>'bindingCapsuleIdentity')) ELSE '{}'::jsonb END,")
seal=seal.replace("'sourceClosureHash',m->'sourceClosureHash'", "'sourceClosureHash',c->'sourceExecutionHash'")
p=Path('migrations/20261014_research_versioned_input_candidate_v3.sql');p.write_text(p.read_text()+seal)
funcs=[('research_input_binding_immutable_candidate_v3',''),('research_input_binding_candidate_v3','text,text,text,boolean'),('research_complete_parent_candidate_v3','jsonb'),('read_research_article_input_candidate_v3','jsonb'),('assert_research_input_candidate_v3','jsonb,text'),('prepare_research_input_candidate_v3','jsonb,text,text'),('seal_research_article_input_candidate_v3','jsonb,jsonb,text')]
with p.open('a')as f:
 for n,a in funcs:
  f.write(f'ALTER FUNCTION public.{n}({a}) OWNER TO research_input_preparation_owner_v2;\nREVOKE ALL ON FUNCTION public.{n}({a}) FROM PUBLIC,anon,authenticated,service_role;\n')
 for n,a in funcs[3:]:f.write(f'GRANT EXECUTE ON FUNCTION public.{n}({a}) TO service_role;\n')
 f.write('COMMIT;\n')
