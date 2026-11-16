import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {workerFixture} from './vnext-worker-fixture.mjs';
import {rosterHeadFixtureSql} from './vnext-launch-roster-head-fixture.mjs';
import {extractContentBatch} from '../web/src/lib/vnext/permitted-content.ts';
import {inputHash,taipeiDate} from '../web/src/lib/vnext/policy.ts';

const policy='stockinsider-launch-radar-v1';
const migration='migrations/20261117_35_vnext_launch_research_policy_v1.sql';
const dispatchMigration='migrations/20261117_36_vnext_launch_research_dispatch_v1.sql';
const calendarMigration='migrations/20261117_37_vnext_launch_scheduled_calendar_v1.sql';
const poolMigration='migrations/20261117_38_vnext_launch_candidate_pool_history_v1.sql';
const industryMigration='migrations/20261117_39_vnext_launch_candidate_industry_v1.sql';
const writerRelease='1'.repeat(40);
const operator='synthetic-launch-operator';
const author='synthetic-launch-author';
const distinct='synthetic-launch-other-author';

await test('launch policy is bound to the shared job and its prepared revision in PostgreSQL',{timeout:180000},async()=>{
 const x=await workerFixture();
 const service=async(sql,args=[])=>{
  const connection=await x.connect();
  try{
   await connection.query('SET ROLE service_role');
   return (await connection.query(sql,args)).rows[0]?.result;
  }finally{await x.close(connection);}
 };
 const launch=(body,principal=operator)=>service('SELECT public.vnext_launch_enqueue_research_v1($1,$2) AS result',[principal,body]);
 const resolve=(claim,principal=author,hash=claim.inputHash)=>service('SELECT public.vnext_launch_research_policy_v1($1,$2,$3,$4) AS result',
  [principal,claim.jobId,claim.executionId,hash]);
 const source=(action,body)=>service('SELECT public.vnext_analysis_command_v1($1,$2,$3) AS result',[operator,action,body]);
 const prepare=(claim,evidence)=>x.rpc(author,'prepare',{jobId:claim.jobId,executionId:claim.executionId,inputHash:inputHash(evidence),evidence});
 try{
  await x.install();
  for(const file of ['migrations/20261022_vnext_analysis_sources_v1.sql','migrations/20261022_vnext_thesis_audit_v1.sql',
   'migrations/20261022_vnext_source_withdrawals_v1.sql','migrations/20261022_vnext_cached_admission_v2.sql',migration])
   await x.writer.query(fs.readFileSync(file,'utf8'));
  const ranking=fs.readFileSync('migrations/20261115_vnext_launch_ranking_v1.sql','utf8');
  const exact=(start,end)=>{
   assert.equal(ranking.split(start).length,2);assert.equal(ranking.split(end).length,2);
   return ranking.slice(ranking.indexOf(start),ranking.indexOf(end));
  };
  await x.writer.query(exact('CREATE TABLE public.vnext_launch_ranking_mode_v1(', 'CREATE TABLE public.vnext_launch_score_evidence_v1('));
  await x.writer.query('ALTER TABLE public.vnext_launch_ranking_mode_v1 OWNER TO stockinsider_vnext_owner');
  await x.writer.query(exact('CREATE FUNCTION public.vnext_launch_today_calendar_internal_v1(', 'CREATE FUNCTION public.vnext_launch_cycle_context_v1('));
  await x.writer.query(fs.readFileSync(dispatchMigration,'utf8'));
  await x.writer.query(fs.readFileSync(calendarMigration,'utf8'));
  await x.writer.query(exact('CREATE TABLE public.vnext_launch_ranking_snapshots_v1(', 'CREATE TABLE public.vnext_launch_ranking_members_v1('));
  await x.writer.query('ALTER TABLE public.vnext_launch_ranking_snapshots_v1 OWNER TO stockinsider_vnext_owner');
  await x.writer.query('ALTER TABLE public.vnext_launch_ranking_snapshots_v1 ENABLE ROW LEVEL SECURITY');
  await x.writer.query('REVOKE ALL ON public.vnext_launch_ranking_snapshots_v1 FROM PUBLIC,anon,authenticated,service_role');
  await x.writer.query(fs.readFileSync(poolMigration,'utf8'));
  const roster=rosterHeadFixtureSql();
  await x.writer.query(roster.predecessor);
  await x.writer.query(roster.migration);
  await x.writer.query(fs.readFileSync(industryMigration,'utf8'));
  await x.writer.query("INSERT INTO public.vnext_principals_v1(principal,role,enabled) VALUES($1,'operator',true),($2,'author',true),($3,'author',true)",[operator,author,distinct]);
  const at=new Date().toISOString(),day=taipeiDate(at);
  await x.writer.query("INSERT INTO public.vnext_sessions_v1(session_date,close_at,completed) VALUES($1,clock_timestamp()-interval '1 hour',true)",[day]);
  await x.writer.query("INSERT INTO public.vnext_source_policies_v1(source,scope,license_basis,rights_subject,valid_until,enabled) VALUES('official','official_original','synthetic-launch-policy','owned-fixture',clock_timestamp()+interval '1 hour',true)");
  const url='https://mops.twse.com.tw/synthetic-launch-original';
  const extracted=await extractContentBatch([{id:'synthetic-launch-original',source:'official',scope:'official_original',
   url,eventAt:at,publishedAt:at,eventBasis:'source_publication',availableAt:at,symbols:['2409','2383'],
   originalRoot:url,authorRoot:'synthetic-official',body:'Synthetic authorized source receipt for the shared queue.'}],at,source);
  assert.equal(extracted.selected,1);
  const {clues}=await source('source-clues',{});
  const projections=await source('source-projection',{symbols:['2409','2383']});
  const request=symbol=>{
   const selected=clues.filter(clue=>clue.symbol===symbol);
   const input={cutoff:at,clues:selected,roots:selected.map(clue=>clue.root),eventAt:at,eligible:true,tradingValid:true,
    contraindication:false,evidence:projections[symbol].evidence,initialScore:{derivationVersion:'vnext-initial-cached-v2'}};
   return {symbols:[symbol],inputs:{[symbol]:{...input,hash:inputHash(input)}},requestKey:'policy-'+symbol,entrypoint:'synthetic-policy-integration'};
  };
  await assert.rejects(()=>launch(request('2409'),author),/vnext_cached_operator_mode_required/u);
  const invented=request('2409');invented.inputs['2409'].researchPolicyVersion=policy;
  await assert.rejects(()=>launch(invented),/vnext_launch_research_input_invalid/u);

  const legacy=await service("SELECT public.vnext_cached_admission_v1($1,'enqueue',$2) AS result",[operator,request('2383')]);
  const input=request('2409');
  const admitted=await launch(input),ticket=admitted.jobs[0];
  assert.equal(ticket.state,'queued');assert.ok(ticket.jobId);
  const repeated=await launch(input);
  assert.equal(repeated.jobs[0].jobId,ticket.jobId);assert.equal(repeated.jobs[0].replay,true);
  const selection=async()=>(await x.writer.query('SELECT public.vnext_launch_dispatch_selection_internal_v1() AS result')).rows[0].result;
  const context=(principal,release)=>service('SELECT public.vnext_launch_dispatch_context_v1($1,$2) AS result',[principal,release]);
  assert.deepEqual(await selection(),{queued:[{job_id:ticket.jobId}],transientFailures:[]});
  await assert.rejects(()=>service('SELECT public.vnext_launch_dispatch_selection_internal_v1() AS result'),{code:'42501'});
  assert.deepEqual(await context(operator,writerRelease),{session:null,reason:'launch_research_mode_unavailable'});
  await x.writer.query('UPDATE public.vnext_launch_ranking_mode_v1 SET enabled=true,required_writer_release=$1',[writerRelease]);
  assert.deepEqual(await context(author,writerRelease),{session:null,reason:'launch_research_mode_unavailable'});
  assert.deepEqual(await context(operator,'0'.repeat(40)),{session:null,reason:'launch_research_mode_unavailable'});
  assert.deepEqual((await x.writer.query("SELECT has_function_privilege('anon','public.vnext_launch_dispatch_context_v1(text,text)','EXECUTE') AS anonymous,has_function_privilege('authenticated','public.vnext_launch_dispatch_context_v1(text,text)','EXECUTE') AS authenticated")).rows[0],{anonymous:false,authenticated:false});
  const pool=(id=null)=>service('SELECT public.vnext_launch_candidate_pool_history_v1($1) AS result',[id]);
  assert.equal(await pool(),null);
  const oldest='00000000-0000-4000-8000-000000000101',recent='00000000-0000-4000-8000-000000000102';
  const addSnapshot=(id,previous,n,rows)=>x.writer.query(
   "INSERT INTO public.vnext_launch_ranking_snapshots_v1(ranking_run_id,previous_ranking_run_id,request_hash,input_hash,input_cutoff,session_date,published_at,snapshot) " +
   "SELECT $1,$2,repeat('7',64),repeat('8',64),(day+time'21:30') AT TIME ZONE 'Asia/Taipei',day,(day+time'21:31') AT TIME ZONE 'Asia/Taipei',$4 " +
   "FROM (SELECT (statement_timestamp() AT TIME ZONE 'Asia/Taipei')::date-$3::integer AS day) dates",
   [id,previous,n,{policyVersion:policy,candidates:rows,debug:'synthetic_private_debug'}]);
  await addSnapshot(oldest,null,3,[{symbol:'2409',state:'eligible',reasons:['synthetic_private_reason']}]);
  await addSnapshot(recent,oldest,2,[{symbol:'2383',state:'waiting',privateSource:'synthetic_private_source'}]);
  const snapshot=await pool();
  assert.equal(snapshot.current.id,recent);assert.equal(snapshot.previous.id,oldest);assert.equal(snapshot.next,null);
  assert.deepEqual(snapshot.current.rows,[{symbol:'2383',state:'waiting'}]);
  assert.deepEqual(snapshot.previous.rows,[{symbol:'2409',state:'eligible'}]);
  assert.deepEqual((await pool(oldest)).next,{id:recent,cutoff:snapshot.current.cutoff});
  assert.equal(await pool('00000000-0000-4000-8000-000000000199'),null);
  const poolIndustry=(id=null)=>service('SELECT public.vnext_launch_candidate_pool_history_v2($1) AS result',[id]);
  const issuer=(async(symbol,venue,cutoff)=>{
   const stock=(await x.writer.query("INSERT INTO public.stocks(symbol,name,market) VALUES($1,'Synthetic industry issuer','TW') RETURNING id",[symbol])).rows[0].id;
   await x.writer.query("INSERT INTO public.stock_instruments_v3(stock_id,symbol,exchange,instrument_type,listing_status,official_legal_name,provider,source_timestamp,recorded_at,valid_from,roster_version) VALUES($1,$2,$3,'common_stock','active','Synthetic industry issuer',$4,$5::timestamptz-interval '3 days',$5::timestamptz-interval '2 days',$5::timestamptz-interval '3 days','tw-instrument-roster-v3.0')",[stock,symbol,venue,venue.toLowerCase(),cutoff]);
   return stock;
  });
  const addIndustry=(stock,venue,code,sector,recordedAt,validFrom)=>x.writer.query(
   "INSERT INTO public.stock_sector_assignments_v3(stock_id,market,official_industry_code,canonical_sector_key,provider,source_timestamp,valid_from,taxonomy_version,status,recorded_at) VALUES($1,$2,$3,$4,$5,$6::timestamptz-interval '1 minute',$7,'tw-sector-taxonomy-v3.0','active',$6) RETURNING assignment_authority_id",
   [stock,venue,code,sector,venue.toLowerCase(),recordedAt,validFrom]).then(r=>r.rows[0].assignment_authority_id);
  const offset=(clock,deltaMs)=>new Date(Date.parse(clock)+deltaMs).toISOString();
  const oldStock=await issuer('2409','TWSE',snapshot.previous.cutoff);
  const newStock=await issuer('2383','TPEX',snapshot.current.cutoff);
  const oldClock=offset(snapshot.previous.cutoff,-3600000), newClock=offset(snapshot.current.cutoff,-3600000);
  const oldIndustry=await addIndustry(oldStock,'TWSE','24','semiconductor',oldClock,oldClock);
  await addIndustry(oldStock,'TWSE','33','digital_cloud',offset(snapshot.previous.cutoff,1000),oldClock);
  const currentIndustry=await addIndustry(newStock,'TPEX','28','electronic_components',newClock,newClock);
  await addIndustry(newStock,'TWSE','21','chemical',newClock,newClock);
  await addIndustry(newStock,'TPEX','24','semiconductor',offset(snapshot.current.cutoff,-1000),offset(snapshot.current.cutoff,1000));
  const withIndustry=await poolIndustry();
  assert.equal(withIndustry.current.rows[0].industrySnapshot.revisionId,currentIndustry);
  assert.equal(withIndustry.previous.rows[0].industrySnapshot.revisionId,oldIndustry);
  assert.equal(withIndustry.current.rows[0].industrySnapshot.code,'28');
  assert.equal(withIndustry.previous.rows[0].industrySnapshot.code,'24');
  await addIndustry(newStock,'TPEX','23','oil_gas_electricity',newClock,newClock);
  assert.equal((await poolIndustry()).current.rows[0].industrySnapshot,null);
  const cloudIndustry = await addIndustry(newStock,'TPEX','36','unknown',offset(newClock,1000),newClock);
  const withOfficialCode = (await poolIndustry()).current.rows[0].industrySnapshot;
  assert.equal(withOfficialCode.revisionId, cloudIndustry);
  assert.equal(withOfficialCode.code, '36');
  await addIndustry(newStock,'TPEX','91','unknown',offset(newClock,2000),newClock);
  assert.equal((await poolIndustry()).current.rows[0].industrySnapshot,null);
  await assert.rejects(()=>service('SELECT public.vnext_launch_candidate_industry_v1($1,$2) AS result',['2383',snapshot.current.cutoff]),{code:'42501'});
  assert.equal(JSON.stringify(snapshot).includes('synthetic_private'),false);
  await assert.rejects(()=>service('SELECT count(*) AS result FROM public.vnext_launch_ranking_snapshots_v1'),{code:'42501'});
  assert.deepEqual((await x.writer.query("SELECT has_function_privilege('anon','public.vnext_launch_candidate_pool_history_v1(uuid)','EXECUTE') anon,has_function_privilege('authenticated','public.vnext_launch_candidate_pool_history_v1(uuid)','EXECUTE') authenticated")).rows[0],{anon:false,authenticated:false});
  await x.writer.query('UPDATE public.vnext_launch_ranking_mode_v1 SET enabled=false');
  assert.equal(await pool(recent),null);
  assert.equal(await poolIndustry(recent),null);
  await x.writer.query('UPDATE public.vnext_launch_ranking_mode_v1 SET enabled=true');
  const deferral=await context(operator,writerRelease);
  assert.equal(deferral.session,null);
  assert.ok(['launch_research_window_closed','launch_research_both_venue_calendar_missing'].includes(deferral.reason));
  const sync=(principal,release)=>service('SELECT public.vnext_launch_sync_scheduled_calendar_v1($1,$2) AS result',[principal,release]);
  assert.deepEqual(await sync(author,writerRelease),{status:'deferred',reason:'launch_calendar_mode_unavailable'});
  assert.deepEqual(await sync(operator,'0'.repeat(40)),{status:'deferred',reason:'launch_calendar_mode_unavailable'});
  const counts=(await x.writer.query('SELECT count(*)::integer AS total FROM public.vnext_calendar_receipts_v2')).rows[0].total;
  const noRealSync=await sync(operator,writerRelease);
  assert.equal(noRealSync.status,'deferred');
  assert.ok(['launch_calendar_window_closed','launch_calendar_completed_venues_unconfirmed'].includes(noRealSync.reason));
  assert.equal((await x.writer.query('SELECT count(*)::integer AS total FROM public.vnext_calendar_receipts_v2')).rows[0].total,counts);
  const historical=(await x.writer.query("SELECT ((statement_timestamp() AT TIME ZONE 'Asia/Taipei')::date-12)::text AS day")).rows[0].day;
  const cutoff=historical+'T13:30:00Z';
  const sourceAt=historical+'T08:00:00Z';
  const closed=(knownAt=cutoff)=>x.writer.query('SELECT public.vnext_launch_completed_venue_heads_v1($1,$2)::text AS result',[historical,knownAt]).then(r=>r.rows[0].result);
  const addCalendar=(venue,status,closeAt,recordedAt=sourceAt,source='synthetic-test-two-venue-clock')=>x.writer.query(
   'INSERT INTO public.tw_trading_sessions_v3(session_authority_id,session_id,market,open_at,close_at,status,provider,source_timestamp,collected_at,recorded_at,source_ref) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$8,$6,$6,$6,$7)',
   [historical,venue,historical+'T01:00:00Z',closeAt,status,recordedAt,source,venue.toLowerCase()]);
  const regularClose=historical+'T05:30:00Z';
  await assert.rejects(()=>service('SELECT public.vnext_launch_completed_venue_heads_v1($1,$2) AS result',[historical,cutoff]),{code:'42501'});
  assert.equal(await closed(),null);
  await addCalendar('TWSE','completed',regularClose);
  assert.equal(await closed(),null);
  await addCalendar('TPEX','completed',regularClose);
  assert.equal(Date.parse(await closed()),Date.parse(regularClose));
  assert.equal(await closed(historical+'T07:59:59Z'),null);
  await addCalendar('TPEX','cancelled',regularClose,historical+'T14:00:00Z');
  assert.equal(Date.parse(await closed()),Date.parse(regularClose));
  assert.equal(await closed(historical+'T14:00:00Z'),null);
  await addCalendar('TWSE','completed',regularClose,sourceAt,'synthetic-conflicting-official-head');
  assert.equal(await closed(),null);

  const launchClaim=await x.rpc(author,'claim',{jobId:ticket.jobId});
  const legacyClaim=await x.rpc(author,'claim',{jobId:legacy.jobs[0].jobId});
  assert.equal(launchClaim.execute,true);assert.equal(legacyClaim.execute,true);
  assert.equal(launchClaim.evidence.researchPolicyVersion,policy);
  assert.equal(legacyClaim.evidence.researchPolicyVersion,undefined);
  assert.deepEqual(await selection(),{queued:[],transientFailures:[]});
  assert.deepEqual(await resolve(launchClaim),{researchPolicyVersion:policy});
  assert.equal(await resolve(launchClaim,distinct),null);
  assert.equal(await resolve(launchClaim,author,'f'.repeat(64)),null);
  assert.equal(await resolve(legacyClaim),null);
  await assert.rejects(()=>service('SELECT count(*) AS result FROM public.vnext_launch_research_admissions_v1'),{code:'42501'});

  const launchFrozen={...launchClaim.evidence,admissionHash:launchClaim.inputHash};
  const legacyFrozen={...legacyClaim.evidence,admissionHash:legacyClaim.inputHash};
  await assert.rejects(()=>prepare(launchClaim,Object.fromEntries(Object.entries(launchFrozen).filter(([key])=>key!=='researchPolicyVersion'))),
   /vnext_launch_research_preparation_policy_mismatch/u);
  await assert.rejects(()=>prepare(legacyClaim,{...legacyFrozen,researchPolicyVersion:policy}),
   /vnext_launch_research_preparation_policy_mismatch/u);
  assert.equal((await prepare(launchClaim,launchFrozen)).frozen,true);
  assert.equal((await prepare(legacyClaim,legacyFrozen)).frozen,true);
  const state=await x.snapshot();
  assert.equal(state.vnext_jobs_v1.count,2);assert.equal(state.vnext_jobs_v1.rows.filter(job=>job.started_at!==null).length,2);
  assert.equal(state.vnext_launch_research_admissions_v1.count,1);assert.equal(state.vnext_preparations_v1.count,2);
  assert.equal(state.vnext_provider_invocations_v1.count,0);
  assert.deepEqual(await resolve(launchClaim,author,inputHash(launchFrozen)),{researchPolicyVersion:policy});
 }finally{await x.finish();}
});
