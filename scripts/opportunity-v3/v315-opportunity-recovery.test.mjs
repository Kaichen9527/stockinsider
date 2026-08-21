import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const runtime=(file)=>require(path.join(root,'scripts/runtime',file));

test('V315 analysis transport stays below the durable bound without dropping facts or candidates',()=>{
  const {compactAnalysisOfficialAuthority,immutableAnalysisFacts,projectionDecision}=runtime('auth-source-worker-cli.js');
  const largeFact=(symbol,index)=>{const evidence=[{url:`https://example.test/${symbol}`,
    sourceUrl:`https://legacy.example.test/${symbol}`,
    excerpt:'x'.repeat(index===0?180_000:35_000)}];return {symbol,materialChangeHash:symbol.padEnd(64,'f'),
    officialFactAudit:'x'.repeat(index===0?10_000:20_000),evidence,
    sourceEvidence:evidence.map((row)=>({...row,url:row.url,sourceName:'official-authority',
      sourceUrl:`https://official.example.test/${symbol}`,sourceCollectedAt:'2026-08-14T00:00:00Z'}))};};
  const facts=Array.from({length:20},(_,index)=>largeFact(String(8000+index),index));
  const decisions=facts.map((fact,index)=>({symbol:fact.symbol,materialChangeHash:fact.materialChangeHash,
    decisionRevisionId:`revision-${index}`,analysisRevision:{revisionId:`revision-${index}`,
      materialChangeHash:fact.materialChangeHash,analysisGeneratedAt:'2026-08-14T00:00:00Z',facts:fact}}));
  const compactFacts=facts.map(immutableAnalysisFacts);
  const decisionPayloads=compactFacts.map((fact)=>({symbol:fact.symbol,materialChangeHash:fact.materialChangeHash,
    bundle:{json:fact}}));
  const authority={calendar:{authorityHash:'a'.repeat(64),sessions:Array.from({length:960},(_,ordinal)=>({
    ordinal,session:`2026-${String(1+(ordinal%12)).padStart(2,'0')}-01`,sourceRef:'official-calendar'.repeat(8)}))},
    coverage:{completedSessions:300,ready:true,blockers:[],rows:Array.from({length:1440},(_,ordinal)=>({
      ordinal,sourceRef:'official-valuation'.repeat(8)}))}};
  const sourceCandidates=Array.from({length:40},(_,index)=>({symbol:String(9000+index),
    sourceEvidence:[{url:`https://example.test/source/${index}`,excerpt:'evidence'.repeat(100)}]}));
  const duplicated={decisions,decisionPayloads,sourceCandidates,officialAuthority:authority};
  assert.ok(Buffer.byteLength(JSON.stringify(duplicated))>3*1024*1024,
    'the production-shaped legacy transport reproduces the durable result overflow');
  const bounded={decisions:decisions.map((decision,index)=>projectionDecision({...compactFacts[index],
    analysisRevision:{...decision.analysisRevision,facts:compactFacts[index]}})),decisionPayloads,sourceCandidates,
    officialAuthority:compactAnalysisOfficialAuthority(authority)};
  assert.ok(Buffer.byteLength(JSON.stringify(bounded))<3*1024*1024);
  assert.equal(bounded.decisions.length,20);assert.equal(bounded.decisionPayloads.length,20);
  assert.equal(bounded.sourceCandidates.length,40);
  assert.equal(bounded.decisions[0].analysisRevision.facts,undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(facts[0]))>262_144,
    'the production-shaped duplicate evidence payload reproduces the per-revision bound failure');
  assert.ok(Buffer.byteLength(JSON.stringify(bounded.decisionPayloads[0].bundle.json))<262_144);
  assert.equal(bounded.decisionPayloads[0].bundle.json.evidence,undefined);
  assert.deepEqual(bounded.decisionPayloads[0].bundle.json.sourceEvidence,facts[0].sourceEvidence,
    'the enriched authoritative evidence is retained byte-for-byte');
  const conflictingEvidence={symbol:'9999',evidence:[{claimId:'claim-1',excerpt:'original'}],
    sourceEvidence:[{claimId:'claim-1',excerpt:'different'}]};
  assert.equal(immutableAnalysisFacts(conflictingEvidence),conflictingEvidence,
    'non-provenance evidence divergence retains both representations and fails closed at the existing bound');
  assert.deepEqual(bounded.officialAuthority,{calendar:{authorityHash:'a'.repeat(64)},
    coverage:{completedSessions:300,ready:true,blockers:[]}});
  assert.equal(authority.calendar.sessions.length,960,
    'compaction does not mutate the complete official authority retained by the facts result');
});

test('V315 official TPEX history uses Gregorian query authority and scales lots/thousands to base units',async()=>{
  const official=runtime('official-twse-valuation.js');const requested=[];
  const fetchImpl=async(url)=>{
    requested.push(String(url));
    if(String(url).includes('/web/stock/aftertrading/peratio_analysis')&&String(url).includes('d=')){
      return new Response(JSON.stringify({stat:'ok',tables:[{data:[
        ['8299','群聯','12','1','1','1','3'],
        ['8101','華冠','18','1','1','1','2'],
      ]}]}),{status:200});
    }
    if(String(url).includes('/afterTrading/tradingStock')&&String(url).includes('code=8299')){
      return new Response(JSON.stringify({stat:'ok',tables:[{data:[
        ['115/08/03','6,128','10,757,327','1,675.00','1,800.00','1,670.00','1,760.00'],
      ]}]}),{status:200});
    }
    return new Response('{}',{status:200});
  };
  const snapshot=await official.loadOfficialTwMarketSnapshot({cutoff:'2026-08-13T10:20:00Z',
    collectedAt:'2026-08-13T10:21:00Z',
    candidates:[{symbol:'8299',exchange:'TPEX',canonicalSector:'semiconductor'}],
    peerCandidates:[{symbol:'8101',exchange:'TPEX',canonicalSector:'semiconductor'}],
    valuationBackfillSessions:[['TPEX','2026-08-03']],
    priceBackfillSymbols:[['8299','TPEX']],fetchImpl});
  assert.ok(requested.some((url)=>url.includes('date=2026%2F08%2F01')&&url.includes('code=8299')));
  assert.equal(requested.some((url)=>url.includes('date=115%2F08%2F01')),false);
  assert.equal(snapshot.priceObservations.length,1);
  assert.equal(snapshot.priceObservations[0].volume,6_128_000);
  assert.equal(snapshot.priceObservations[0].turnoverTwd,10_757_327_000);
  assert.equal(snapshot.priceObservations[0].collectedAt,'2026-08-13T10:21:00Z',
    'the authority loader must preserve the real acquisition time supplied by the frozen envelope');
  assert.ok(snapshot.valuationHistory.some((row)=>row.symbol==='8101'&&row.session==='2026-08-03'),
    `same-sector peer history must survive the authoritative loader filter: ${JSON.stringify(requested)}`);
});

test('V315 TPEX corporate-action range accepts the official compact ROC date form',()=>{
  const official=runtime('official-twse-valuation.js');const feed=official.CORPORATE_ACTION_FEEDS.TPEX[1];
  const bytes=Buffer.from(JSON.stringify({stat:'ok',tables:[{fields:feed.header,
    data:[['1150203','8299','群聯','100','95']]}]}));
  const parsed=official.parseCorporateActionResponse(bytes,{exchange:'TPEX',session:'2026-02-03',feed});
  assert.equal(parsed.length,1);assert.equal(parsed[0].symbol,'8299');
});

test('V316 TWSE corporate-action history uses the report-serving wwwc authority alias',async()=>{
  const official=runtime('official-twse-valuation.js');
  const feed=official.CORPORATE_ACTION_FEEDS.TWSE[0];
  const url=official.corporateActionRangeUrl('TWSE','2026-02-03','2026-08-14',feed);
  assert.equal(new URL(url).hostname,'wwwc.twse.com.tw');
  assert.equal(new URL(url).searchParams.get('startDate'),'20260203');
  assert.equal(new URL(url).searchParams.get('endDate'),'20260814');
  const requested=[];
  const snapshots=await official.loadCorporateActionSnapshotsRange({calendarSessions:[
    {market:'TWSE',session:'2026-08-13',status:'completed'},
  ],collectedAt:'2026-08-14T00:00:00Z',fetchImpl:async(requestUrl)=>{
    requested.push(String(requestUrl));
    const matching=official.CORPORATE_ACTION_FEEDS.TWSE.find((member)=>String(requestUrl).includes(member.path));
    return new Response(JSON.stringify({stat:'OK',fields:matching.header,data:[]}),{status:200});
  }});
  assert.equal(snapshots.length,1);assert.equal(snapshots[0].declaredEventCount,0);
  assert.equal(snapshots[0].feedEvidence.length,3);
  assert.ok(requested.every((requestUrl)=>new URL(requestUrl).hostname==='wwwc.twse.com.tw'));
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

test('V315 PE bridge derives a bounded diluted-share denominator from official cumulative EPS when MOPS omits the share concept',()=>{
  const {valuationFactInput}=runtime('auth-source-worker-cli.js');
  const periods=['2025-06-30','2025-09-30','2025-12-31','2026-03-31','2026-06-30'];
  const series={
    quarterly_revenue:[200,300,400,120,250],quarterly_gross_profit:[80,120,160,50,105],
    quarterly_operating_expense:[30,45,60,20,42],quarterly_operating_income:[50,75,100,30,63],
    quarterly_non_operating_income:[5,7,10,3,6],quarterly_pretax_income:[55,82,110,33,69],
    quarterly_income_tax_expense:[10,15,20,6,13],quarterly_net_income:[45,67,90,27,56],
    quarterly_noncontrolling_interest:[2,3,4,1,2],
    quarterly_net_income_attributable_to_common:[43,64,86,26,54],
    quarterly_diluted_eps:[4.3,6.4,8.6,2.6,5.4],
  };
  const rows=Object.entries(series).flatMap(([factKey,values])=>periods.map((period,index)=>[
    '2330',factKey,`${period.slice(0,4)}-01-01`,period,'quarterly',values[index],
    factKey==='quarterly_diluted_eps'?'TWD_per_share':'TWD','official_filing',
    '2026-08-01T00:00:00Z','2026-08-01T00:00:00Z','2026-08-01T01:00:00Z','2026-08-01T01:00:00Z',
    `twse-mops-inline:${period}:2330:${factKey}:${'a'.repeat(64)}`,null,'reported','reported_period',
  ]));
  const facts=valuationFactInput(rows,'2026-08-14T00:00:00Z');
  assert.equal(facts.periodReadiness,'ttm_from_four_official_quarters',JSON.stringify({missingFacts:facts.missingFacts}));
  assert.equal(facts.dilutedSharesAuthority,'implied_from_official_eps');
  assert.ok(Math.abs(facts.dilutedShares-10)<1e-9);
  assert.ok(Math.abs(facts.netIncome/facts.dilutedShares-9.7)<1e-9);
  assert.deepEqual(facts.missingFacts.sort(),['book_value_per_share','cash_and_equivalents','total_assets','total_debt','total_equity']);
  const bridge=runtime('valuation-operating-bridge.js').buildPointInTimeOperatingBridge(facts);
  assert.equal(bridge.availability,'available');
  assert.ok(Math.abs(bridge.eps-9.7)<1e-9);
});

test('V316 live acquisition collected after the scheduled cutoff keeps point-in-time facts but rejects future source timestamps',()=>{
  const {validOfficialFactRow}=runtime('auth-source-worker-cli.js');
  const row=['8299','quarterly_revenue','2026-01-01','2026-06-30','quarterly',100,'TWD','official_filing',
    '2026-08-13T00:00:00Z','2026-08-13T00:00:00Z','2026-08-14T00:01:00Z','2026-08-14T00:01:00Z',
    `tpex-mops-inline:2026-06-30:8299:${'c'.repeat(64)}`,null,'reported','reported_period'];
  assert.equal(validOfficialFactRow(row,'2026-08-14T00:00:00Z'),true,
    'the source boundary must not make every newly collected live fact unreachable');
  const future=[...row];future[8]='2026-08-14T00:00:01Z';future[9]='2026-08-14T00:00:01Z';
  assert.equal(validOfficialFactRow(future,'2026-08-14T00:00:00Z'),false);
});

test('V316 MOPS retention keeps the prior cumulative anchor needed to derive four consecutive quarters',()=>{
  const {selectLatestMopsFacts}=runtime('official-mops-v314.js');
  const periods=['2025-06-30','2025-09-30','2025-12-31','2026-03-31','2026-06-30'];
  const rows=periods.map((period,index)=>({symbol:'8299',exchange:'TPEX',factKey:'quarterly_operating_income',
    periodStart:`${period.slice(0,4)}-01-01`,periodEnd:period,durationKind:'quarterly',value:index+1,unit:'TWD',
    authorityTier:'official_filing',filingPublishedAt:'2026-08-13T00:00:00Z',sourceTimestamp:'2026-08-13T00:00:00Z',
    collectedAt:'2026-08-14T00:01:00Z',sourceRef:`tpex-mops-inline:${period}:8299:${'d'.repeat(64)}`}));
  assert.deepEqual(selectLatestMopsFacts(rows).map((row)=>row.periodEnd),periods);
});

test('V315 fundamental quality derives ROE directly from official attributable income and equity',()=>{
  const row=(key,value,unit='TWD')=>['2330',key,key==='total_equity'?null:'2026-01-01','2026-06-30',
    key==='total_equity'?'instant':'quarterly',value,unit,'official_filing','2026-08-01T00:00:00Z',
    '2026-08-01T00:00:00Z','2026-08-01T01:00:00Z','2026-08-01T01:00:00Z',
    `twse-mops-inline:2026-06-30:2330:${key}:${'b'.repeat(64)}`];
  const input=runtime('auth-source-worker-cli.js').legacyQualityInput([
    row('quarterly_revenue',1000),row('quarterly_operating_income',300),
    row('quarterly_net_income_attributable_to_common',200),row('total_equity',2000),
  ]);
  assert.ok(Math.abs(input.roe-.2)<1e-12);
  assert.ok(Math.abs(input.operatingMargin-.3)<1e-12);
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
  assert.match(phison.claimId,/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
  assert.match(phison.mentionId,/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
  assert.equal(phison.factorEvidence.coverage,.8);assert.ok(phison.factorEvidence.relativeDiscountPct>40);
  const peerMedian=[...valuations.slice(1).map((row)=>row.peRatio)].sort((left,right)=>left-right)[4];
  assert.ok(Math.abs(phison.factorEvidence.relativeDiscountPct-(1-12/peerMedian)*100)<1e-12,
    'reported discount is the percentage below reference, not an exaggerated reciprocal premium');
  assert.equal('userAction' in phison,false);assert.equal('newPositionAction' in phison,false);
  const missingFundamental=buildOfficialFactorCandidatesV315({snapshot:{schema:'official-coarse-market-snapshot-v3.15',
    universe,valuations,revenues:[],collectedAt:'2026-08-13T10:00:00Z',sourceFailures:[]},
    cutoff:'2026-08-13T10:20:00Z'}).candidates.find((row)=>row.symbol==='8299');
  assert.ok(!missingFundamental||missingFundamental.factorEvidence.rankingScore<=phison.factorEvidence.rankingScore);
});

test('V317 candidate funnel keeps official full-market factors out of the source-led 60-30-20 selection',async()=>{
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
    readHash:sha256(readCanonical),runId:'72000000-0000-4000-8000-000000000001',
    jobId:'72000000-0000-4000-8000-000000000002',ownerToken:'72000000-0000-4000-8000-000000000003'});
  assert.equal(result.json.candidates.find((row)=>row.symbol==='8299'),undefined);
  assert.ok(result.json.factorDiscovery.selected>=1);assert.equal(result.json.candidates.length,0);
});

test('V316 shallow official research can reach the near-buy lane without minting a buy action',()=>{
  const {researchRankingFromScore}=runtime('auth-source-worker-cli.js');
  const candidate={symbol:'2408',sourcePriority:82};
  const score={axes:{
    discovery:{score:82,trustworthy:true},fundamental:{score:88,trustworthy:true},
    valuation:{score:84,trustworthy:true},priceDislocation:{score:78,trustworthy:true},
    timing:{score:74,trustworthy:true},
  }};
  const shallow=researchRankingFromScore(candidate,score,{softBlockers:['deep_research_not_selected']});
  assert.equal(shallow.lane,'near_buy');assert.equal(shallow.coverage,.9);
  assert.ok(shallow.rankingScore>=70);
  const deferred=researchRankingFromScore(candidate,score,
    {softBlockers:['shallow_research_not_selected','deep_research_not_selected']});
  assert.equal(deferred.lane,'waiting');
  assert.equal('userAction' in shallow,false);assert.equal('recommendationAuthority' in shallow,false);
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
  const {COMPLETION_RPC_TIMEOUT_MS,DEFAULT_RPC_TIMEOUT_MS,MAX_RPC_RESPONSE_BYTES,
    createSupabaseRestLegacyProducerAdapter,rpcTimeoutMs}=runtime('supabase-rest-legacy-producer-adapter.js');
  assert.equal(DEFAULT_RPC_TIMEOUT_MS,120_000);
  assert.equal(COMPLETION_RPC_TIMEOUT_MS,600_000);
  assert.equal(rpcTimeoutMs('complete_legacy_producer_job_rest_v3_15'),COMPLETION_RPC_TIMEOUT_MS);
  assert.equal(rpcTimeoutMs('claim_legacy_producer_job_rest_v3_15'),DEFAULT_RPC_TIMEOUT_MS);
  const secret='service-role-secret-'.padEnd(40,'x');const calls=[];let claimCount=0;
  const adapter=createSupabaseRestLegacyProducerAdapter({supabaseUrl:'https://fixture.supabase.co',serviceRoleKey:secret,
    fetchImpl:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});
      if(String(url).endsWith('/claim_legacy_producer_job_rest_v3_15')){
        claimCount+=1;const hasPages=claimCount===2;
        return new Response(JSON.stringify({run_id:'run',job_id:'job',stage:'candidate_funnel',job_kind:'candidate_batch',
          read_kind:'candidate_funnel_input',read_canonical:'\\x7b7d',read_json:hasPages
            ?{authorityHash:'b'.repeat(64),authorityPages:[['instrument',0,'c'.repeat(64),[]]]}
            :{authorityHash:'b'.repeat(64),authorityPages:[]},read_hash:'a'.repeat(64),authority_hash:'b'.repeat(64)}),
        {status:200});}
      if(String(url).endsWith('/complete_legacy_producer_job_rest_v3_15'))return new Response(JSON.stringify({
        status:'running',next_job:{jobId:'next'}}),{status:200});
      return new Response(JSON.stringify({code:'42501',message:`do not echo ${secret}`}),{status:403});}});
  const claim=await adapter.claimLegacyProducerJob({runId:'run',jobId:'job',ownerToken:'token',leaseSeconds:120});
  assert.equal(claim.readCanonical.toString('utf8'),'{}');
  assert.equal(calls[0].body.p_authority_hash,'');
  const completion=await adapter.completeLegacyProducerJob({runId:'run',jobId:'job',ownerToken:'token',
    resultCanonical:Buffer.from('{}'),resultJson:{},resultHash:'c'.repeat(64)});
  assert.equal(completion.status,'running');
  assert.equal(calls[1].body.p_authority_hash,'b'.repeat(64));
  await adapter.claimLegacyProducerJob({runId:'run',jobId:'job-2',ownerToken:'token',leaseSeconds:120});
  assert.equal(calls[2].body.p_authority_hash,'');
  await adapter.claimLegacyProducerJob({runId:'run',jobId:'job-3',ownerToken:'token',leaseSeconds:120});
  assert.equal(calls[3].body.p_authority_hash,'b'.repeat(64));
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

test('V315 resumed facts completion retains the run authority identity from lease acquisition',async()=>{
  const {createSupabaseRestLegacyProducerAdapter}=runtime('supabase-rest-legacy-producer-adapter.js');
  const authorityHash='d'.repeat(64);const calls=[];
  const adapter=createSupabaseRestLegacyProducerAdapter({
    supabaseUrl:'https://fixture.supabase.co',serviceRoleKey:'resume-service-role-key'.padEnd(40,'x'),
    fetchImpl:async(url,init)=>{
      const body=JSON.parse(init.body);calls.push({url:String(url),body});
      if(String(url).endsWith('/acquire_legacy_producer_lease_v3_11'))return new Response(JSON.stringify({
        run_id:'run',job_id:'facts',disposition:'acquired',source_cutoff:'2026-08-13T00:00:00Z',
        authority_hash:authorityHash}),{status:200});
      if(String(url).endsWith('/claim_legacy_producer_job_rest_v3_15'))return new Response(JSON.stringify({
        run_id:'run',job_id:'facts',stage:'facts_refresh',job_kind:'stage_barrier',read_kind:'candidate_fact_plane',
        read_canonical:'\\x7b7d',read_json:{officialIngestionResume:{}},read_hash:'a'.repeat(64),authority_hash:null}),
      {status:200});
      if(String(url).endsWith('/complete_legacy_producer_job_rest_v3_15'))return new Response(JSON.stringify({
        status:'running',next_job:{jobId:'analysis'}}),{status:200});
      throw new Error('unexpected fixture RPC');
    },
  });
  const lease=await adapter.acquireLegacyProducerLease({ownerLabel:'fixture',sourceCommitSha:'a'.repeat(40),
    workerSha256:'b'.repeat(64),configBytes:Buffer.from('{}'),configSha256:'c'.repeat(64),
    ownerToken:'token',leaseSeconds:120});
  assert.equal(lease.authorityHash,authorityHash);
  await adapter.claimLegacyProducerJob({runId:'run',jobId:'facts',ownerToken:'token',leaseSeconds:120});
  await adapter.completeLegacyProducerJob({runId:'run',jobId:'facts',ownerToken:'token',
    resultCanonical:Buffer.from('{}'),resultJson:{},resultHash:'e'.repeat(64)});
  assert.equal(calls.find(({url})=>url.endsWith('/claim_legacy_producer_job_rest_v3_15')).body.p_authority_hash,'');
  assert.equal(calls.find(({url})=>url.endsWith('/complete_legacy_producer_job_rest_v3_15')).body.p_authority_hash,
    authorityHash);
});

test('V315 official ingestion retries only idempotent transient chunk transport failures',async()=>{
  const {OFFICIAL_INGESTION_RPC_ATTEMPTS,createSupabaseRestLegacyProducerAdapter}=
    runtime('supabase-rest-legacy-producer-adapter.js');
  assert.equal(OFFICIAL_INGESTION_RPC_ATTEMPTS,3);
  const secret='service-role-secret-'.padEnd(40,'x');let attempts=0;
  const adapter=createSupabaseRestLegacyProducerAdapter({supabaseUrl:'https://fixture.supabase.co',serviceRoleKey:secret,
    fetchImpl:async()=>{attempts+=1;return attempts===1
      ?new Response(JSON.stringify({code:'PGRST',message:`do not echo ${secret}`}),{status:503})
      :new Response('true',{status:200});}});
  const input={runId:'run',jobId:'job',ownerToken:'token',kind:'financial_facts',ordinal:0,items:[],
    chunkHash:'a'.repeat(64),producerSha:'b'.repeat(40),sourceCutoff:'2026-08-14T00:00:00Z'};
  assert.equal(await adapter.appendLegacyOfficialIngestionChunk(input),true);
  assert.equal(attempts,2);
  let rejectedAttempts=0;
  const rejected=createSupabaseRestLegacyProducerAdapter({supabaseUrl:'https://fixture.supabase.co',serviceRoleKey:secret,
    fetchImpl:async()=>{rejectedAttempts+=1;return new Response(JSON.stringify({code:'PT409',
      message:`do not echo ${secret}`}),{status:409});}});
  await assert.rejects(()=>rejected.appendLegacyOfficialIngestionChunk(input),(error)=>
    error.message==='supabase_rpc_rejected:append_legacy_official_ingestion_chunk_rest_v3_15:PT409'
      &&error.code==='PT409'&&error.itemOrdinal===0&&error.fieldPath==='officialIngestion.financial_facts'
      &&error.failureOrigin==='persistence'&&error.invariantCode==='official_ingestion_chunk_rejected'
      &&!error.message.includes(secret));
  assert.equal(rejectedAttempts,1);
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

test('V315 migration is additive, bounded, upgrade-safe, and binds authority to REST claim and completion',()=>{
  const sql=readFileSync(path.join(root,'migrations/20260813_opportunity_recovery_v3_15.sql'),'utf8');
  const v314=readFileSync(path.join(root,'migrations/20260811_actionability_recovery_v3_14.sql'),'utf8');
  assert.doesNotMatch(sql,/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(sql,/LIMIT 3000/u);assert.match(sql,/octet_length\(v_claim\.read_canonical\)>3145728/u);
  assert.match(sql,/claim_legacy_producer_job_authoritative_v3_15/u);
  assert.match(sql,/claim_legacy_producer_job_rest_v3_15/u);
  assert.match(sql,/complete_legacy_producer_job_rest_v3_15/u);
  assert.match(sql,/read_legacy_runtime_health_rest_v3_15/u);
  assert.match(sql,/p_authority_hash/u);
  assert.match(sql,/ALTER TYPE public[.]source_key_v3 ADD VALUE IF NOT EXISTS 'official_market_factor'/u);
  assert.match(v314,/legacy_runtime_failure_diagnostics_v3_14_job_kind_check[\s\S]*'stage_barrier'/u);
  assert.match(sql,/GRANT EXECUTE[\s\S]*claim_legacy_producer_job_rest_v3_15[\s\S]*TO service_role/u);
  assert.match(sql,/complete_legacy_producer_job_rest_v3_15[\s\S]*set_config\('stockinsider\.legacy_authority_hash',p_authority_hash,true\)[\s\S]*complete_legacy_producer_job_v3_14/u);
  assert.match(sql,/GRANT EXECUTE[\s\S]*complete_legacy_producer_job_rest_v3_15[\s\S]*TO service_role/u);
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
  assert.match(sql,/v_claim\.predecessor_result_canonical:=NULL;[\s\S]*?v_claim\.predecessor_result_json:=NULL;[\s\S]*?v_claim\.predecessor_result_hash:=NULL;/u);
  assert.match(sql,/mention_barrier_transport_bound/u);
  assert.match(sql,/LIMIT 4001/u);
  assert.match(sql,/OWNER TO legacy_correctness_rpc_owner/u);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.read_legacy_mention_barrier_transport_v3_15\(uuid\)[\s\S]*TO opportunity_v3_rpc_owner/u);
  assert.match(sql,/ALTER FUNCTION public\.claim_legacy_mention_barrier_transport_v3_15\(uuid,uuid,uuid,integer\)[\s\S]*OWNER TO legacy_correctness_rpc_owner/u);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.claim_legacy_mention_barrier_transport_v3_15\(uuid,uuid,uuid,integer\)[\s\S]*TO opportunity_v3_rpc_owner/u);
  assert.doesNotMatch(sql,/v_claim\.read_json:=jsonb_build_object\('results'/u);
});

test('V315 production repair pre-applies bounded official chunks and makes terminal completion constant-work',async()=>{
  const repairSql=readFileSync(path.join(root,'migrations/20260814_official_ingestion_chunk_apply_v3_15.sql'),'utf8');
  const handoffSql=readFileSync(path.join(root,'migrations/20260816_claim_handoff_lease_v3_16.sql'),'utf8');
  assert.doesNotMatch(repairSql,/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(repairSql,/legacy_official_ingestion_applications_v3_15/u);
  assert.match(repairSql,/apply_legacy_official_ingestion_chunk_base_v3_15/u);
  assert.match(repairSql,/append_legacy_official_ingestion_chunk_rest_v3_15/u);
  assert.match(repairSql,/official_ingestion_preapply_incomplete/u);
  assert.match(repairSql,/chunk[.]chunk_kind<>'terminal'[\s\S]*legacy_official_ingestion_applications_v3_15/u);
  assert.match(repairSql,/REVOKE ALL[\s\S]*FROM PUBLIC,anon,authenticated,service_role/u);
  assert.match(repairSql,/GRANT EXECUTE[\s\S]*append_legacy_official_ingestion_chunk_rest_v3_15[\s\S]*TO service_role/u);
  assert.doesNotMatch(handoffSql,/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.match(handoffSql,/v_claim:=public[.]claim_legacy_producer_job_authoritative_v3_16[\s\S]*?v_now:=date_trunc\('second',clock_timestamp\(\)\)/u);
  assert.match(handoffSql,/run[.]status='running'[\s\S]*?run[.]owner_token_hash=v_owner_hash FOR UPDATE[\s\S]*?job[.]status='leased'[\s\S]*?job[.]owner_token_hash=v_owner_hash FOR UPDATE/u);
  assert.match(handoffSql,/SET heartbeat_at=v_now,lease_expires_at=v_now\+interval '120 seconds'/u);
  assert.doesNotMatch(handoffSql,/lease_expires_at\s*>=\s*v_now/u);
  assert.match(handoffSql,/claim_legacy_producer_job_v3_11\(uuid,uuid,uuid,integer\)[\s\S]*OWNER TO legacy_correctness_rpc_owner/u);
  const adapterSource=readFileSync(path.join(root,'scripts/runtime/supabase-rest-legacy-producer-adapter.js'),'utf8');
  const postgresSource=readFileSync(path.join(root,'scripts/runtime/postgres-legacy-producer-adapter.js'),'utf8');
  assert.match(adapterSource,/rpc\('append_legacy_official_ingestion_chunk_rest_v3_15'/u);
  assert.match(postgresSource,/append_legacy_official_ingestion_chunk_rest_v3_15/u);
  const {streamOfficialIngestionV314}=runtime('auth-source-worker-cli.js');const seen=[];
  const rows=(length)=>Array.from({length},(_,ordinal)=>({ordinal}));
  await streamOfficialIngestionV314({claim:{runId:'run',jobId:'job'},sourceCutoff:'2026-08-14T00:00:00Z',
    producerSha:'a'.repeat(40),snapshot:{calendarSessions:rows(300),financialFacts:rows(41),priceObservations:rows(41),
      corporateActionSnapshots:rows(11),valuations:rows(21),valuationHistory:rows(20)},persistChunk:async(row)=>seen.push(row)});
  for(const kind of ['financial_facts','price_observations','corporate_action_snapshots','reported_valuations'])
    assert.ok(seen.filter((row)=>row.kind===kind).every((row)=>row.items.length<=20),`${kind} gateway-safe apply`);
  assert.equal(seen.filter((row)=>row.kind==='reported_valuations').length,3,
    'bounded batches remain below the observed lease-starvation threshold');
  assert.ok(seen.filter((row)=>row.kind==='trading_sessions').every((row)=>row.items.length<=20));
  const workerSource=readFileSync(path.join(root,'scripts/runtime/auth-source-worker-cli.js'),'utf8');
  assert.match(workerSource,/persistOfficialIngestionChunk:async\(input\)=>\{[\s\S]*appendLegacyOfficialIngestionChunk\(input\)[\s\S]*heartbeatLegacyProducerJob/u,
    'each applied chunk synchronously renews the same durable lease before the next chunk');
});

test('V316 direct claim transaction raises only its local statement timeout and always closes the transaction',async()=>{
  const {CLAIM_STATEMENT_TIMEOUT_MS,claimWithBoundedStatementTimeout}=
    runtime('postgres-legacy-producer-adapter.js');
  assert.equal(CLAIM_STATEMENT_TIMEOUT_MS,1_200_000);
  const successfulQueries=[];
  const successfulClient={
    query:async(text,values)=>{successfulQueries.push([text,values]);
      return text.startsWith('select claimed.*')?{rows:[{job_id:'facts-barrier'}]}:{rows:[]};},
    release:()=>successfulQueries.push(['RELEASE']),
  };
  const claimed=await claimWithBoundedStatementTimeout({connect:async()=>successfulClient},
    'select claimed.* from fixture_claim($1) claimed',['run']);
  assert.equal(claimed.job_id,'facts-barrier');
  assert.deepEqual(successfulQueries.map(([text])=>text),[
    'BEGIN',"SET LOCAL statement_timeout = '1200s'",'select claimed.* from fixture_claim($1) claimed','COMMIT','RELEASE',
  ]);
  const failedQueries=[];
  const failedClient={
    query:async(text)=>{failedQueries.push(text);if(text.startsWith('select claimed.*')){
      const error=new Error('canceling statement due to statement timeout');error.code='57014';throw error;}return {rows:[]};},
    release:()=>failedQueries.push('RELEASE'),
  };
  await assert.rejects(()=>claimWithBoundedStatementTimeout({connect:async()=>failedClient},
    'select claimed.* from fixture_claim($1) claimed',['run']),{code:'57014'});
  assert.deepEqual(failedQueries,[
    'BEGIN',"SET LOCAL statement_timeout = '1200s'",'select claimed.* from fixture_claim($1) claimed','ROLLBACK','RELEASE',
  ]);
  let discarded=null;
  const brokenClient={
    query:async(text)=>{if(text==='ROLLBACK')throw new Error('connection_lost_during_rollback');
      if(text.startsWith('select claimed.*')){const error=new Error('authoritative_claim_error');error.code='57014';throw error;}
      return {rows:[]};},
    release:(discard)=>{discarded=discard;},
  };
  await assert.rejects(()=>claimWithBoundedStatementTimeout({connect:async()=>brokenClient},
    'select claimed.* from fixture_claim($1) claimed',['run']),(error)=>error.code==='57014');
  assert.equal(discarded,true,'a client whose rollback fails must be destroyed instead of re-entering the pool');
});

test('V315 official ingestion keeps valid PB when the exchange PE exceeds the authority range',async()=>{
  const {streamOfficialIngestionV314}=runtime('auth-source-worker-cli.js');const seen=[];
  const observation={symbol:'1711',exchange:'TWSE',session:'2026-08-13',sourceRef:'twse-openapi:BWIBBU_ALL:2026-08-13:1711',
    close:40,closeSourceRef:'twse-openapi:official-close:2026-08-13:1711'};
  const summary=await streamOfficialIngestionV314({claim:{runId:'run',jobId:'job'},
    sourceCutoff:'2026-08-14T00:00:00Z',producerSha:'a'.repeat(40),snapshot:{valuations:[
      {...observation,peRatio:23.4,pbRatio:1.47},
      {...observation,symbol:'1712',sourceRef:'twse-openapi:BWIBBU_ALL:2026-08-13:1712',
        closeSourceRef:'twse-openapi:official-close:2026-08-13:1712',peRatio:305.38,pbRatio:2.44},
      {...observation,symbol:'1713',sourceRef:'twse-openapi:BWIBBU_ALL:2026-08-13:1713',
        closeSourceRef:'twse-openapi:official-close:2026-08-13:1713',peRatio:305.38,pbRatio:140},
    ]},persistChunk:async(row)=>seen.push(row)});
  const rows=seen.filter((row)=>row.kind==='reported_valuations').flatMap((row)=>row.items);
  assert.equal(summary.counts.reported_valuations,2);
  assert.deepEqual(rows.map((row)=>[row.symbol,row.peRatio,row.pbRatio]),[
    ['1711',23.4,1.47],['1712',null,2.44],
  ]);
});

test('V31613 reported valuations defer rows without an official same-session close dependency',async()=>{
  const {streamOfficialIngestionV314}=runtime('auth-source-worker-cli.js');const seen=[];
  const snapshot={
    priceObservations:[{symbol:'2330',exchange:'TWSE',session:'2026-08-13',close:100,
      sourceRef:'twse-rwd:STOCK_DAY:2026-08-13:2330'}],
    valuations:[{symbol:'2317',exchange:'TWSE',session:'2026-08-13',peRatio:18,pbRatio:2.1,
      sourceRef:'twse-openapi:BWIBBU_ALL:2026-08-13:2317',close:105,
      closeSourceRef:'twse-openapi:official-close:2026-08-13:2317'}],
    valuationHistory:[
      {symbol:'2330',session:'2026-08-13',peRatio:22,pbRatio:5,
        sourceRef:'twse-rwd:BWIBBU_d:2026-08-13:2330'},
      {symbol:'2303',session:'2026-08-13',peRatio:20,pbRatio:3,
        sourceRef:'twse-rwd:BWIBBU_d:2026-08-13:2303'},
    ],
  };
  const summary=await streamOfficialIngestionV314({claim:{runId:'run',jobId:'job'},
    sourceCutoff:'2026-08-14T00:00:00Z',producerSha:'a'.repeat(40),snapshot,
    persistChunk:async(row)=>seen.push(row)});
  const rows=seen.filter((row)=>row.kind==='reported_valuations').flatMap((row)=>row.items);
  assert.deepEqual(rows.map((row)=>[row.symbol,row.close]),[['2317',105],['2330',100]]);
  assert.equal(summary.counts.reported_valuations,2);
  assert.deepEqual(summary.deferred,{reportedValuationPriceDependencyUnavailable:1});
});
