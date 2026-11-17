import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const sql=read('migrations/20261107_vnext_ranking_snapshot_v1.sql');
const profile=JSON.parse(read('scripts/opportunity-v3/vnext-ranking-snapshot-profile-v1.json'));
const body=sql.split('AS $ranking$')[1].split('END $ranking$')[0];
const reader=sql.split('AS $read$')[1].split('$read$;')[0];

test('candidate is exact source-bound and explicitly native unverified',()=>{
 assert.equal(profile.migrationSha256,sha(sql));assert.equal(profile.nativeVerified,false);assert.equal(profile.nativeHOLD,true);
 assert.deepEqual(profile.modifiedExistingRoutines,[]);assert.deepEqual(profile.newRoles,[]);
 assert.equal(/CREATE OR REPLACE|ALTER ROLE|UPDATE public\.vnext_|DELETE FROM public\.vnext_/u.test(sql),false);
});
test('same-name authority drift rejects using exact source-derived dependency profiles and complete SET lists',()=>{
 assert.equal(profile.dependencies.length,6);
 for(const r of profile.dependencies){
  let expected;
  if(r.sourceProfile.startsWith('migrations/')){
   const source=read(r.sourceProfile);const start=source.indexOf('CREATE FUNCTION '+r.signature.split('(')[0]+'(');assert.ok(start>=0);
   const begin=source.indexOf(' AS $$',start)+6;expected=sha(source.slice(begin,source.indexOf('$$;',begin)));
  }else{
   const source=JSON.parse(read('scripts/opportunity-v3/'+r.sourceProfile));const original=(source.modifiedRoutines||source.routines).find(x=>x.signature===r.signature);assert.ok(original);expected=original.successorBodySha256;
  }
  assert.equal(r.bodySha256,expected);
  assert.ok(sql.includes("oid=to_regprocedure('"+r.signature+"') AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND prosecdef="+r.securityDefiner+" AND proconfig=ARRAY["+r.proconfig.map(x=>"'"+x+"'").join(',')+"] AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='"+expected+"'"));
 }
});
test('both append-only private tables have original writer fence, RLS, no direct grantee and truncate/mutation rejection',()=>{
 for(const table of ['vnext_ranking_snapshots_v1','vnext_ranking_members_v1']){
  assert.ok(sql.includes('ALTER TABLE public.'+table+' ENABLE ROW LEVEL SECURITY'));
  assert.ok(sql.includes('REVOKE ALL ON public.'+table+' FROM PUBLIC,anon,authenticated,service_role'));
  assert.ok(sql.includes('BEFORE INSERT OR UPDATE OR DELETE ON public.'+table+' FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence()'));
  assert.ok(sql.includes('BEFORE UPDATE OR DELETE ON public.'+table));assert.ok(sql.includes('BEFORE TRUNCATE ON public.'+table));
 }
 assert.ok(sql.includes("RAISE EXCEPTION 'vnext_ranking_snapshot_immutable'"));
 assert.ok(sql.includes('revision_id uuid REFERENCES public.vnext_publications_v1(revision_id)'));
 assert.equal(/GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL|USAGE) /u.test(sql),false);
});
test('command only accepts exact run identity and CAS predecessor; caller scores/review/rights never accepted',()=>{
 assert.ok(body.includes("ARRAY['rankingRunId','expectedPreviousRankingRunId']"));assert.ok(body.includes('jsonb_object_keys(p_request))<>2'));
 assert.ok(body.includes("role='operator' AND enabled"));assert.ok(body.includes("enabled AND legacy_fenced"));
 assert.equal(/p_request->>?\s*'(?:members|ranks|score|qualified|review|rights|cutoff)'/u.test(body),false);
});
test('same original locks precede replay, CAS, source reads and both atomic inserts',()=>{
 const positions=['pg_advisory_xact_lock(610091002)','pg_advisory_xact_lock(2409,6002)','pg_advisory_xact_lock(64221022)','SELECT * INTO replay','SELECT * INTO prior','home:=public.vnext_read_v1(NULL)','INSERT INTO public.vnext_ranking_snapshots_v1','INSERT INTO public.vnext_ranking_members_v1','INSERT INTO public.vnext_audit_v1'].map(x=>body.indexOf(x));
 positions.forEach(x=>assert.ok(x>=0));assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
 assert.ok(body.includes("'vnext_ranking_compare_and_swap_conflict'"));assert.ok(body.includes("'vnext_ranking_idempotency_conflict'"));assert.ok(body.includes('prior.ranking_run_id IS DISTINCT FROM expected'));
 assert.ok(sql.includes('CREATE UNIQUE INDEX vnext_ranking_single_successor_v1'));assert.ok(sql.includes("coalesce(previous_ranking_run_id,'00000000-0000-0000-0000-000000000000'::uuid)"));
});
test('actual DB source ledger determines complete bounded active pool and canonical deep score',()=>{
 assert.ok(body.includes("FROM public.vnext_members_v1 WHERE state<>'exited' ORDER BY symbol"));
 assert.ok(body.includes('count_active>20'));assert.ok(body.includes('jsonb_array_length(candidates)<>count_active'));
 assert.ok(body.includes("score:=public.vnext_current_deep_score_v1(report->'deepInputs',publication.revision_id,member.input_hash)"));
 assert.ok(body.includes("(score->>'availableWeight')::numeric<>100"));assert.ok(body.includes("points<0 OR points>100"));
 assert.ok(body.includes("publication.input_hash IS DISTINCT FROM member.input_hash"));assert.ok(body.includes("audit.session_date=session_day"));
});
test('independent execution/current rights/actual price observation and original 120second qualification stay failclosed',()=>{
 for(const marker of ['job.execution_id=job.reviewer_execution','job.author_principal=job.reviewer_principal','public.vnext_input_sources_current_v1(frozen,member.symbol)','public.vnext_target_current_v1(member.symbol,publication.revision_id,member.input_hash)',"target->'currentPrice'->>'observationId'","target->'currentPrice'->>'session' IS DISTINCT FROM session_day::text","proof->'financialCoverage'->>'status' IS DISTINCT FROM 'complete'","(proof->>'expiresAt')::timestamptz<=cutoff_at","interval '120 seconds'"]){assert.ok(body.includes(marker),marker);}
 assert.ok(body.includes("public.vnext_catalog_canonical_v1(target->'currentPrice')"));
 assert.ok(body.includes("'retained',true,'reason',block_reason,'snapshot',prior.snapshot"));
});
test('market gaps/unknown/stale retain former snapshot while riskoff/breakdown can rank but never create entry eligibility',()=>{
 for(const marker of ["market->>'risk','') NOT IN('risk_on','selective','risk_off','breakdown')","(market->>'expiresAt')::timestamptz<=cutoff_at","market->>'continuity' IS DISTINCT FROM 'true'","market->'gaps'","gap NOT LIKE 'overseas_unavailable:%' AND gap NOT LIKE 'supplemental_unavailable:%'","allowed:=member.state='eligible' AND market->>'risk' IN('risk_on','selective')","WHEN market->>'risk' IN('risk_off','breakdown') THEN 'market_wait'"]){assert.ok(body.includes(marker),marker);}
});
test('deterministic score-completeness-time-symbol order limits zero-to-ten without fill or renormalization',()=>{
 assert.ok(body.includes("ORDER BY (value->>'confirmedPoints')::numeric DESC,(value->>'availableWeight')::numeric DESC,(value->>'eventAt')::timestamptz DESC NULLS LAST,value->>'symbol'"));
 assert.ok(body.includes('WHERE rank_position<=10'));assert.ok(body.includes("ranked jsonb:='[]'::jsonb"));
 assert.equal(/random\(|confirmedPoints.*\/[ ]*availableWeight|legacy.*UNION/iu.test(body),false);
});
test('immutable snapshot stores revision pointers/change reasons and no private evidence or execution payload',()=>{
 const document=body.slice(body.indexOf("document:=jsonb_build_object"),body.indexOf('run_input:='));
 for(const name of ['rankingRunId','previousRankingRunId','cutoff','policyVersion','marketRevision','members','candidates','exclusions','changes','sourceVersion'])assert.ok(document.includes("'"+name+"'"));
 assert.ok(body.includes("'research',publication.revision_id"));assert.ok(body.includes("'financial',proof->>'proofHash'"));
 assert.equal(document.includes("'evidence'"),false);assert.equal(document.includes('author_result'),false);
});
test('readonly exact-version reader does no writes/work/locks and separately observes current home/detail',()=>{
 assert.equal(/INSERT|UPDATE|DELETE|advisory|command_v1|prepare|provider|enqueue/iu.test(reader),false);
 assert.ok(reader.includes('ranking_run_id=p_ranking_run_id'));assert.ok(reader.includes("'snapshot'"));assert.ok(reader.includes("'current'"));
 assert.ok(reader.includes('public.vnext_read_v1(NULL)'));assert.ok(reader.includes('public.vnext_read_v1(p_symbol)'));
 assert.ok(sql.includes('LANGUAGE sql STABLE SECURITY DEFINER'));
});
