import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const runtime=(file)=>require(path.join(root,'scripts/runtime',file));

test('V315 official TPEX history uses Gregorian query authority and scales lots/thousands to base units',async()=>{
  const official=runtime('official-twse-valuation.js');const requested=[];
  const fetchImpl=async(url)=>{
    requested.push(String(url));
    if(String(url).includes('/afterTrading/tradingStock')&&String(url).includes('code=8299')){
      return new Response(JSON.stringify({stat:'ok',tables:[{data:[
        ['115/08/03','6,128','10,757,327','1,675.00','1,800.00','1,670.00','1,760.00'],
      ]}]}),{status:200});
    }
    return new Response('{}',{status:200});
  };
  const snapshot=await official.loadOfficialTwMarketSnapshot({cutoff:'2026-08-13T10:20:00Z',
    candidates:[{symbol:'8299',exchange:'TPEX',canonicalSector:'semiconductor'}],
    priceBackfillSymbols:[['8299','TPEX']],fetchImpl});
  assert.ok(requested.some((url)=>url.includes('date=2026%2F08%2F01')&&url.includes('code=8299')));
  assert.equal(requested.some((url)=>url.includes('date=115%2F08%2F01')),false);
  assert.equal(snapshot.priceObservations.length,1);
  assert.equal(snapshot.priceObservations[0].volume,6_128_000);
  assert.equal(snapshot.priceObservations[0].turnoverTwd,10_757_327_000);
});

test('V315 TPEX corporate-action range accepts the official compact ROC date form',()=>{
  const official=runtime('official-twse-valuation.js');const feed=official.CORPORATE_ACTION_FEEDS.TPEX[1];
  const bytes=Buffer.from(JSON.stringify({stat:'ok',tables:[{fields:feed.header,
    data:[['1150203','8299','群聯','100','95']]}]}));
  const parsed=official.parseCorporateActionResponse(bytes,{exchange:'TPEX',session:'2026-02-03',feed});
  assert.equal(parsed.length,1);assert.equal(parsed[0].symbol,'8299');
});

test('V315 official monthly revenue carries filing time and a persistable monthly fact period',()=>{
  const official=runtime('official-twse-valuation.js');
  const rows=official.parseRevenueRows([{'出表日期':'1150813','資料年月':'11507','公司代號':'8299',
    '公司名稱':'群聯','營業收入-當月營收':'27161687','營業收入-去年同月增減(%)':'377.5',
    '營業收入-上月比較增減(%)':'9.29'}],{exchange:'TPEX',collectedAt:'2026-08-13T10:00:00Z'});
  assert.deepEqual({periodStart:rows[0].periodStart,periodEnd:rows[0].periodEnd,
    filingPublishedAt:rows[0].filingPublishedAt,monthlyRevenue:rows[0].monthlyRevenue},
  {periodStart:'2026-07-01',periodEnd:'2026-07-31',filingPublishedAt:'2026-08-13T00:00:00Z',monthlyRevenue:27161687});
});

test('V315 official coarse research rejects revenue filed after the point-in-time cutoff',async()=>{
  const official=runtime('official-twse-valuation.js');
  const universe=[{stockId:'00000000-0000-4000-8000-000000008299',symbol:'8299',exchange:'TPEX',
    canonicalSector:'semiconductor',name:'群聯'}];
  const fetchImpl=async(url)=>new Response(JSON.stringify(String(url).includes('peratio_analysis')
    ?[{Date:'1150813',SecuritiesCompanyCode:'8299',CompanyName:'群聯',PriceEarningRatio:'12',PriceBookRatio:'3',YieldRatio:'1'}]
    :String(url).includes('mopsfin_t187ap05_O')?[{'出表日期':'1150814','公司代號':'8299','公司名稱':'群聯',
      '資料年月':'11507','營業收入-當月營收':'27161687','營業收入-去年同月增減(%)':'377.5',
      '營業收入-上月比較增減(%)':'9.29'}]
      :String(url).includes('tpex_mainboard_quotes')?[{Date:'1150813',SecuritiesCompanyCode:'8299',Close:'2280'}]:[]),
  {status:200});
  const snapshot=await official.loadOfficialCoarseMarketSnapshot({cutoff:'2026-08-13T10:20:00Z',universe,fetchImpl});
  assert.equal(snapshot.valuations.length,1);assert.equal(snapshot.revenues.length,0);
});

test('V315 official factor discovery admits out-of-source undervaluation research without minting an action',()=>{
  const {buildOfficialFactorCandidatesV315}=runtime('official-factor-discovery-v315.js');
  const universe=Array.from({length:10},(_,index)=>({stockId:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
    symbol:index===0?'8299':String(8100+index),exchange:'TPEX',canonicalSector:'semiconductor',name:index===0?'群聯':`同業${index}`}));
  const valuations=universe.map((row,index)=>({stockId:row.stockId,symbol:row.symbol,exchange:row.exchange,
    canonicalSector:row.canonicalSector,session:'2026-08-13',close:index===0?2280:100,peRatio:index===0?12:24+index,
    sourceRef:`tpex-openapi:peratio:2026-08-13:${row.symbol}`,closeSourceRef:`tpex-openapi:official-close:2026-08-13:${row.symbol}`,
    sourceUrl:'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis'}));
  const revenues=universe.map((row)=>({stockId:row.stockId,symbol:row.symbol,asOf:'2026-07-01',yoyGrowth:25,momGrowth:5,
    sourceRef:`tpex-openapi:monthly-revenue:2026-07-01:${row.symbol}`}));
  const output=buildOfficialFactorCandidatesV315({snapshot:{schema:'official-coarse-market-snapshot-v3.15',
    universe,valuations,revenues,collectedAt:'2026-08-13T10:00:00Z',sourceFailures:[]},
    cutoff:'2026-08-13T10:20:00Z'});
  const phison=output.candidates.find((row)=>row.symbol==='8299');
  assert.ok(phison);assert.equal(phison.sourceKey,'official_market_factor');
  assert.equal(phison.factorEvidence.coverage,.8);assert.ok(phison.factorEvidence.relativeDiscountPct>40);
  assert.equal('userAction' in phison,false);assert.equal('newPositionAction' in phison,false);
  const missingFundamental=buildOfficialFactorCandidatesV315({snapshot:{schema:'official-coarse-market-snapshot-v3.15',
    universe,valuations,revenues:[],collectedAt:'2026-08-13T10:00:00Z',sourceFailures:[]},
    cutoff:'2026-08-13T10:20:00Z'}).candidates.find((row)=>row.symbol==='8299');
  assert.ok(!missingFundamental||missingFundamental.factorEvidence.rankingScore<=phison.factorEvidence.rankingScore);
});

test('V315 candidate funnel combines source-led and official full-market candidates before 60-30-20 selection',async()=>{
  const {canonicalJson,sha256}=runtime('codec.js');
  const config=runtime('source-run-config.js').validateAuthSourceDagConfig(
    readFileSync(path.join(root,'config/runtime/auth-source-dag.json')));
  const universe=Array.from({length:10},(_,index)=>[`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,
    index===0?'8299':String(8100+index),'TPEX','semiconductor',index===0?'群聯':`同業${index}`]);
  const tpexValuations=universe.map((row,index)=>({Date:'1150813',SecuritiesCompanyCode:row[1],CompanyName:row[4],
    PriceEarningRatio:String(index===0?12:24+index),PriceBookRatio:'3',YieldRatio:'1'}));
  const tpexRevenue=universe.map((row)=>({'出表日期':'1150813','公司代號':row[1],'公司名稱':row[4],'資料年月':'11507',
    '營業收入-當月營收':'1000000','營業收入-去年同月增減(%)':'25','營業收入-上月比較增減(%)':'5'}));
  const tpexQuotes=universe.map((row,index)=>({Date:'1150813',SecuritiesCompanyCode:row[1],Close:String(index===0?2280:100)}));
  const fetchImpl=async(url)=>new Response(JSON.stringify(String(url).includes('peratio_analysis')?tpexValuations
    :String(url).includes('mopsfin_t187ap05_O')?tpexRevenue:String(url).includes('tpex_mainboard_quotes')?tpexQuotes:[]),{status:200});
  const handlers=runtime('auth-source-worker-cli.js').buildStageHandlers(config,'a'.repeat(40),'b'.repeat(64),{
    fetchImpl,internalApiKey:'fixture-internal-api-key-000000'});
  const readJson={mentionResult:{candidates:[]},seedSymbols:[],priorLedger:[],sourceCutoff:'2026-08-13T10:20:00Z',
    coarseUniverseRows:universe,coarseUniverseSchema:'official-coarse-universe-v3.15'};
  const readCanonical=Buffer.from(canonicalJson(readJson));
  const result=await handlers.candidate_funnel({readKind:'candidate_funnel_input',readJson,readCanonical,
    readHash:sha256(readCanonical)});
  const phison=result.json.candidates.find((row)=>row.symbol==='8299');
  assert.ok(phison);assert.equal(phison.deepSelected,true);assert.equal(phison.seedMembership,'out_of_seed');
  assert.ok(result.json.factorDiscovery.selected>=1);assert.ok(result.json.candidates.length<=60);
});

test('V315 duplicate authority roster heads emit one persistence identity per stock and revision',()=>{
  const parser=runtime('auth-source-worker-cli.js');
  const rosterRow=['25bfd69c-3df6-4e00-9779-865cc05b89f9','2472','TWSE','common_stock','active',
    '立隆電子工業','立隆電'];
  const parsed=parser.extractRevisionCandidates({frozenRevision:{
    revisionId:'bace13e5-19fc-4954-991c-3d2273289c24',sourceKey:'bulltalk',
    sourceCollectedAt:'2026-05-23T12:36:43.497Z',
    rawFieldPayload:{text:'立隆電 2472 股價與財報更新。'},
  },authorityPages:[['roster',0,'a'.repeat(64),[rosterRow]],['roster',1,'b'.repeat(64),[rosterRow]]]});
  assert.equal(parsed.candidates.length,1);
  assert.equal(parsed.claimOutcomes.filter((row)=>row.outcome==='linked').length,1);
  assert.equal(parsed.entityOutcomes.filter((row)=>row.outcome==='linked').length,1);
  assert.equal(new Set(parsed.claimOutcomes.map((row)=>row.claimId)).size,parsed.claimOutcomes.length);
  assert.equal(new Set(parsed.entityOutcomes.map((row)=>row.entityOutcomeId)).size,parsed.entityOutcomes.length);
});

test('V315 mention barrier consumes the compact candidate-only authoritative transport',async()=>{
  const {canonicalJson,sha256}=runtime('codec.js');
  const config=runtime('source-run-config.js').validateAuthSourceDagConfig(
    readFileSync(path.join(root,'config/runtime/auth-source-dag.json')));
  const handlers=runtime('auth-source-worker-cli.js').buildStageHandlers(config,'a'.repeat(40),'b'.repeat(64),{
    fetchImpl:async()=>new Response('{}',{status:200}),internalApiKey:'fixture-internal-api-key-000000'});
  const candidates=Array.from({length:2_121},(_,index)=>({claimId:`claim-${index}`,symbol:String(1000+index)}));
  const readJson={candidates};const readCanonical=Buffer.from(canonicalJson(readJson));
  const result=await handlers.mention_claim_extraction({jobKind:'stage_barrier',readKind:'mention_shard_results',
    readJson,readCanonical,readHash:sha256(readCanonical)});
  assert.equal(result.json.candidates.length,2_121);
  assert.equal(result.json.candidates[0].claimId,'claim-0');
  assert.equal('results' in readJson,false);
  const oversized={candidates:Array.from({length:4_001},()=>({claimId:'overflow'}))};
  const oversizedCanonical=Buffer.from(canonicalJson(oversized));
  await assert.rejects(()=>handlers.mention_claim_extraction({jobKind:'stage_barrier',readKind:'mention_shard_results',
    readJson:oversized,readCanonical:oversizedCanonical,readHash:sha256(oversizedCanonical)}),
  {message:'mention barrier candidate transport unavailable'});
});

test('V315 REST producer adapter maps canonical bytea and never exposes its service credential in failures',async()=>{
  const {MAX_RPC_RESPONSE_BYTES,createSupabaseRestLegacyProducerAdapter}=runtime('supabase-rest-legacy-producer-adapter.js');
  const secret='service-role-secret-'.padEnd(40,'x');const calls=[];
  const adapter=createSupabaseRestLegacyProducerAdapter({supabaseUrl:'https://fixture.supabase.co',serviceRoleKey:secret,
    fetchImpl:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});
      if(String(url).endsWith('/claim_legacy_producer_job_rest_v3_15'))return new Response(JSON.stringify({
        run_id:'run',job_id:'job',stage:'candidate_funnel',job_kind:'candidate_batch',read_kind:'candidate_funnel_input',
        read_canonical:'\\x7b7d',read_json:{},read_hash:'a'.repeat(64)}),{status:200});
      return new Response(JSON.stringify({code:'42501',message:`do not echo ${secret}`}),{status:403});}});
  const claim=await adapter.claimLegacyProducerJob({runId:'run',jobId:'job',ownerToken:'token',leaseSeconds:120});
  assert.equal(claim.readCanonical.toString('utf8'),'{}');
  assert.equal(calls[0].body.p_authority_hash,'');
  await assert.rejects(()=>adapter.heartbeatLegacyProducerJob({runId:'run',jobId:'job',ownerToken:'token',leaseSeconds:120}),
    (error)=>error.message==='supabase_rpc_rejected:heartbeat_legacy_producer_job_v3_11:42501'
      &&!error.message.includes(secret));
  const boundedClaim=JSON.stringify({run_id:'run',job_id:'job',stage:'candidate_funnel',job_kind:'candidate_batch',
    read_kind:'candidate_funnel_input',read_canonical:'\\x7b7d',read_json:{padding:'x'.repeat(5_000_000)},
    read_hash:'a'.repeat(64)});
  const boundedAdapter=createSupabaseRestLegacyProducerAdapter({supabaseUrl:'https://fixture.supabase.co',serviceRoleKey:secret,
    fetchImpl:async()=>new Response(boundedClaim,{status:200})});
  assert.equal((await boundedAdapter.claimLegacyProducerJob({runId:'run',jobId:'job',ownerToken:'token',leaseSeconds:120})).jobId,'job');
  const oversizedAdapter=createSupabaseRestLegacyProducerAdapter({supabaseUrl:'https://fixture.supabase.co',serviceRoleKey:secret,
    fetchImpl:async()=>new Response('x'.repeat(MAX_RPC_RESPONSE_BYTES+1),{status:200})});
  await assert.rejects(()=>oversizedAdapter.claimLegacyProducerJob({runId:'run',jobId:'job',ownerToken:'token',leaseSeconds:120}),
    {message:'supabase_rpc_response_bound:claim_legacy_producer_job_rest_v3_15'});
});

test('V315 REST doctor reads private producer state only through the bounded health RPC',async()=>{
  const observer=runtime('runtime-health-observer.js');const calls=[];
  const fetchImpl=async(url)=>{calls.push(String(url));
    if(String(url).includes('/rpc/read_legacy_runtime_health_rest_v3_15'))return new Response(JSON.stringify({
      lastRun:{status:'success',started_at:'2026-08-13T09:00:00Z',terminal_at:'2026-08-13T09:10:00Z',
        producer_commit_sha:'a'.repeat(40),worker_sha256:'b'.repeat(64),scheduler_config_sha256:'c'.repeat(64)},
      leases:[],stuckRunCount:0}),{status:200});
    return new Response('[]',{status:200});};
  const resolver=(reference)=>reference.endsWith('supabase-url')?'https://fixture.supabase.co':'s'.repeat(40);
  const result=await observer.observeDatabase(root,{},resolver,undefined,fetchImpl);
  assert.equal(result.lastTerminalStatus,'success');assert.equal(result.stuckRunCount,0);
  assert.ok(calls.some((url)=>url.includes('/rpc/read_legacy_runtime_health_rest_v3_15')));
  assert.equal(calls.some((url)=>url.includes('/legacy_producer_runs_v3_11?')),false);
  assert.equal(calls.some((url)=>url.includes('/legacy_producer_jobs_v3_11?')),false);
});

test('V315 migration is additive, bounded, upgrade-safe, and exposes only the authority-carrying REST claim',()=>{
  const sql=readFileSync(path.join(root,'migrations/20260813_opportunity_recovery_v3_15.sql'),'utf8');
  assert.doesNotMatch(sql,/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(sql,/LIMIT 3000/u);assert.match(sql,/octet_length\(v_claim\.read_canonical\)>3145728/u);
  assert.match(sql,/claim_legacy_producer_job_authoritative_v3_15/u);
  assert.match(sql,/claim_legacy_producer_job_rest_v3_15/u);
  assert.match(sql,/read_legacy_runtime_health_rest_v3_15/u);
  assert.match(sql,/p_authority_hash/u);
  assert.match(sql,/GRANT EXECUTE[\s\S]*claim_legacy_producer_job_rest_v3_15[\s\S]*TO service_role/u);
  assert.match(sql,/REVOKE CREATE ON SCHEMA public/u);
  assert.match(sql,/connector_rank<=1000/u);
  assert.match(sql,/connector_rank<=2000/u);
  assert.match(sql,/connector_rank>1000/u);
  assert.match(sql,/connector_rank>2000/u);
  assert.match(sql,/discovery_authority_bound_predecessor_conflict/u);
  assert.match(sql,/read_legacy_mention_barrier_transport_v3_15/u);
  assert.match(sql,/jsonb_build_object\('candidates'/u);
  assert.match(sql,/ORDER BY job\.shard_ordinal,candidate\.ordinality/u);
  assert.match(sql,/v_job\.stage<>'mention_claim_extraction' OR v_job\.job_kind<>'stage_barrier'/u);
  assert.match(sql,/SELECT run\.\* INTO v_run[\s\S]*?FOR UPDATE[\s\S]*?SELECT job\.\* INTO v_job[\s\S]*?FOR UPDATE/u);
  assert.match(sql,/v_barrier_json:=public\.read_legacy_mention_barrier_transport_v3_15\(p_run\)[\s\S]*?RETURN ROW/u);
  assert.ok(sql.indexOf("v_barrier_json:=public.read_legacy_mention_barrier_transport_v3_15(p_run)")
    <sql.indexOf('v_claim:=public.claim_legacy_producer_job_authoritative_v3_15'),
  'compact barrier must bypass predecessor materialization before its 3 MiB bound');
  assert.match(sql,/mention_barrier_transport_bound/u);
  assert.match(sql,/LIMIT 4001/u);
  assert.match(sql,/OWNER TO legacy_correctness_rpc_owner/u);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.read_legacy_mention_barrier_transport_v3_15\(uuid\)[\s\S]*TO opportunity_v3_rpc_owner/u);
  assert.match(sql,/ALTER FUNCTION public\.claim_legacy_mention_barrier_transport_v3_15\(uuid,uuid,uuid,integer\)[\s\S]*OWNER TO legacy_correctness_rpc_owner/u);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.claim_legacy_mention_barrier_transport_v3_15\(uuid,uuid,uuid,integer\)[\s\S]*TO opportunity_v3_rpc_owner/u);
  assert.doesNotMatch(sql,/v_claim\.read_json:=jsonb_build_object\('results'/u);
});
