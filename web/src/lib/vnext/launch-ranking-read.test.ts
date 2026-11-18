import assert from 'node:assert/strict';
import test from 'node:test';
import {parseLaunchRankingRead,parseLaunchReportedEps,parseLaunchIssuerEpsEstimates,parseLaunchIssuerFiscalForecasts,parseLaunchReviewedValuation,parseLaunchReviewedFalsifier,launchForwardPeReference,readLaunchRankingTransport,launchRankingMemberCurrent,launchDetailQuery} from './launch-ranking-read.ts';
import {launchRankingFixture,LAUNCH_TEST_NOW,LAUNCH_TEST_RUN} from './launch-ranking.test-fixture.ts';

test('new launch read acceptsTop0/1/10 and nullablefinancials under its own exact policy, neverlegacy or partial80',()=>{
  for(const size of [0,1,10]){const packet=launchRankingFixture(size),read=parseLaunchRankingRead(packet,{},LAUNCH_TEST_NOW);assert.equal(read.snapshot!.members.length,size);if(size)assert.equal(read.snapshot!.members[0].financial,null);}
  assert.throws(()=>parseLaunchRankingRead(launchRankingFixture(11),{},LAUNCH_TEST_NOW),/contract_invalid/u);
  for(const mutation of [(p:ReturnType<typeof launchRankingFixture>)=>{Object.assign(p.snapshot,{policyVersion:'stockinsider-vnext-20-v1'});},
    (p:ReturnType<typeof launchRankingFixture>)=>{Object.assign(p.snapshot,{rulesVersion:'launch-radar-comparisons-v4'});},
    (p:ReturnType<typeof launchRankingFixture>)=>{p.snapshot.members[0].availableWeight=80;},
    (p:ReturnType<typeof launchRankingFixture>)=>{Object.assign(p.snapshot.members[0],{totalScore:null});},
    (p:ReturnType<typeof launchRankingFixture>)=>{p.snapshot.members[0].revisions.institutionalVolume='';}]){
    const packet=launchRankingFixture();mutation(packet);assert.throws(()=>parseLaunchRankingRead(packet,{},LAUNCH_TEST_NOW),/contract_invalid/u);
  }
});
test('score totals,technicaltie/RS63/symbol order and21:30 session context are checked without changing frozenversions',()=>{
  const packet=launchRankingFixture(2),before=structuredClone(packet);assert.deepEqual(parseLaunchRankingRead(packet,{},LAUNCH_TEST_NOW).snapshot!.members.map(m=>m.symbol),['5274','5275']);assert.deepEqual(packet,before);
  for(const mode of ['technical','total','fraction','rsorder','symbolorder','inputcutoff','time','revision'] as const){
    const p=launchRankingFixture(2);
    if(mode==='technical')p.snapshot.members[0].technicalScore=65;
    if(mode==='total')p.snapshot.members[0].totalScore=95;
    if(mode==='fraction')p.snapshot.members[0].components.chips=19.5;
    if(mode==='rsorder')p.snapshot.members[1].relativeStrength63=1;
    if(mode==='symbolorder'){p.snapshot.members.reverse();p.snapshot.members.forEach((m,i)=>{m.rank=i+1;});}
    if(mode==='inputcutoff')p.snapshot.inputCutoff='2026-11-13T13:29:00Z';
    if(mode==='time'){p.snapshot.cutoff='2026-11-13T13:29:59Z';p.snapshot.inputCutoff=p.snapshot.cutoff;}
    if(mode==='revision')p.snapshot.members[0].revisions.score='wrong-source-version';
    assert.throws(()=>parseLaunchRankingRead(p,{},LAUNCH_TEST_NOW),/contract_invalid/u,mode);
  }
  const zero=launchRankingFixture();Object.assign(zero.snapshot.members[0],{totalScore:0,technicalScore:0,components:{trendRelativeStrength:0,consolidation:0,breakoutHold:0,chips:0,market:0}});
  assert.equal(parseLaunchRankingRead(zero,{},LAUNCH_TEST_NOW).snapshot!.members[0].totalScore,0);
});
test('fixedslot cutoff is microexact21:30Taipei; equivalentZ/offset pass and publication mayoccur later',()=>{
  const now='2026-11-13T16:00:00Z';
  for(const cutoff of ['2026-11-13T13:30:00Z','2026-11-13T21:30:00+08:00']){
    const p=launchRankingFixture();Object.assign(p.snapshot,{cutoff,inputCutoff:cutoff,publishedAt:'2026-11-13T13:31:00Z'});
    assert.equal(parseLaunchRankingRead(p,{},now).snapshot!.cutoff,cutoff);
  }
  for(const cutoff of ['2026-11-13T13:29:59Z','2026-11-13T13:30:00.000001Z','2026-11-13T14:30:00Z']){
    const p=launchRankingFixture();Object.assign(p.snapshot,{cutoff,inputCutoff:cutoff,publishedAt:cutoff});
    assert.throws(()=>parseLaunchRankingRead(p,{},now),/contract_invalid/u,cutoff);
  }
});
test('current rights/review/venue/liquidity/source/fullweight and exactsourcebindings/120s neverrenew historicalentry flags',()=>{
  const packet=launchRankingFixture(),read=parseLaunchRankingRead(packet,{},LAUNCH_TEST_NOW),m=read.snapshot!.members[0],before=structuredClone(read.snapshot);
  assert.equal(launchRankingMemberCurrent(m,read.current,LAUNCH_TEST_NOW),true);
  for(const key of ['rights','review','venue','liquidity','price','actions','source','completeWeight'] as const){const changed=structuredClone(read.current);changed[0].checks[key]=false;assert.equal(launchRankingMemberCurrent(m,changed,LAUNCH_TEST_NOW),false,key);}
  for(const mode of ['expired','future','longttl','mixedsource','wrongresearch','missing'] as const){
    const changed=structuredClone(read.current);
    if(mode==='expired')changed[0].expiresAt=LAUNCH_TEST_NOW;
    if(mode==='future')changed[0].checkedAt='2026-11-13T13:30:31Z';
    if(mode==='longttl')changed[0].expiresAt='2026-11-13T13:33:00Z';
    if(mode==='mixedsource')changed[0].revisions.flow='changed';
    if(mode==='wrongresearch')changed[0].revisionId='00000000-0000-4000-8000-000000000999';
    if(mode==='missing')changed.length=0;
    assert.equal(launchRankingMemberCurrent(m,changed,LAUNCH_TEST_NOW),false,mode);
  }
  assert.deepEqual(read.snapshot,before);assert.equal(launchRankingMemberCurrent(m,read.current,'2026-11-13T13:32:00Z'),false);
});
test('detail is exactrun/research/score16closedrules, including booleanhold and ISOendpoint, with safepubliccitations only',()=>{
  const packet=launchRankingFixture(1,true),q={rankingRunId:LAUNCH_TEST_RUN,symbol:'5274'},read=parseLaunchRankingRead(packet,q,LAUNCH_TEST_NOW);
  assert.equal(read.detail!.scoreEvidence.length,16);assert.equal(read.detail!.scoreEvidence[9].operands.breakout,true);assert.equal(read.detail!.scoreEvidence[9].operands.closingHold,null);
  assert.equal(typeof read.detail!.scoreEvidence[2].operands.priorEndpoint,'string');assert.equal(read.detail!.chart,null);
  for(const mode of ['run','research','score','rule','weight','group','operand','unknown_operand','false_comparison','rs','url','private','chart'] as const){
    const p=launchRankingFixture(1,true),d=p.detail!;
    if(mode==='run')d.rankingRunId='00000000-0000-4000-8000-000000000999';
    if(mode==='research')d.revisionId='00000000-0000-4000-8000-000000000999';
    if(mode==='score')d.scoreRevision='00000000-0000-4000-8000-000000000999';
    if(mode==='rule')Object.assign(d.scoreEvidence[0],{id:'unapproved'});
    if(mode==='weight')Object.assign(d.scoreEvidence[0],{weight:6});
    if(mode==='group')Object.assign(d.scoreEvidence[0],{group:'chips'});
    if(mode==='operand')Object.assign(d.scoreEvidence[0].operands,{privateText:'never-expose'});
    if(mode==='unknown_operand')Object.assign(d.scoreEvidence[0].operands,{close:null});
    if(mode==='false_comparison')Object.assign(d.scoreEvidence[0].operands,{close:90});
    if(mode==='rs')Object.assign(d.scoreEvidence[4].operands,{excessReturn:1});
    if(mode==='url')d.citations[0].url='https://user:secret@www.tpex.org.tw/';
    if(mode==='private')Object.assign(d,{rawOriginal:'PRIVATE_MARKER'});
    if(mode==='chart')Object.assign(d,{chart:{rows:932,priceBasis:'raw'}});
    assert.throws(()=>parseLaunchRankingRead(p,q,LAUNCH_TEST_NOW),/contract_invalid/u,mode);
  }
});
test('a three-year adjusted chart binds to the frozen score price, calendar and action versions',()=>{
  const packet=launchRankingFixture(1,true,undefined,true),query={rankingRunId:LAUNCH_TEST_RUN,symbol:'5274'};
  const chart=packet.detail!.chart!;
  const historical=structuredClone(packet);
  historical.current.members[0].checks.price=false;
  const decoded=parseLaunchRankingRead(historical,query,LAUNCH_TEST_NOW).detail!.chart!;
  assert.deepEqual(decoded,chart);
  assert.equal(decoded.displayFrom,'2023-11-13');
  assert.equal(decoded.candles.filter(row=>row.time<decoded.displayFrom).length,239);
  assert.equal(decoded.candles.at(-1)!.time,'2026-11-13');
  assert.equal(decoded.candles.at(-1)!.volume,null);
  for(const [key,value] of Object.entries({seriesRevision:'unknown',priceRevision:'1'.repeat(64),calendarRevision:'1'.repeat(64),
    actionsRevision:'1'.repeat(64),cutoff:'2026-11-12T13:30:00Z',throughSession:'2026-11-12',
    displayFrom:'2024-11-13',warmupSessions:238,priceBasis:'raw'})){
    const changed=structuredClone(packet);
    Object.assign(changed.detail!.chart!,{[key]:value});
    assert.throws(()=>parseLaunchRankingRead(changed,query,LAUNCH_TEST_NOW),/launch_ranking_contract_invalid/u,key);
  }
  for(const mutate of [
    (rows:typeof chart.candles)=>rows.shift(),
    (rows:typeof chart.candles)=>rows.pop(),
    (rows:typeof chart.candles)=>rows[1].time=rows[0].time,
    (rows:typeof chart.candles)=>rows[0].low=0,
    (rows:typeof chart.candles)=>rows[0].volume=0.5,
    (rows:typeof chart.candles)=>Object.assign(rows[0],{source_ref:'private'}),
  ]){
    const changed=structuredClone(packet);
    mutate(changed.detail!.chart!.candles);
    assert.throws(()=>parseLaunchRankingRead(changed,query,LAUNCH_TEST_NOW),/launch_ranking_contract_invalid/u);
  }
});
test('onefixed newRPC preserves explicitmissing/versionerrors and sourceunavailability without legacyfetch or backgroundwork',async()=>{
  const calls:unknown[]=[];const client={rpc(name:string,args:unknown){calls.push({name,args});return Promise.resolve({data:launchRankingFixture(),error:null});}};
  const oldFetch=globalThis.fetch;let fetches=0;globalThis.fetch=async()=>{fetches++;throw Error('unexpected read IO');};
  try{
    assert.equal((await readLaunchRankingTransport(client,{rankingRunId:LAUNCH_TEST_RUN},LAUNCH_TEST_NOW)).availability,'ready');
    assert.deepEqual(calls,[{name:'vnext_launch_ranking_read_v1',args:{p_ranking_run_id:LAUNCH_TEST_RUN,p_symbol:null}}]);
    for(const code of ['42883','PGRST202'])assert.equal((await readLaunchRankingTransport({rpc:async()=>({data:null,error:{code}})}, {},LAUNCH_TEST_NOW)).availability,'schema_unavailable');
    const missing={schemaVersion:'vnext-launch-ranking-read-v2',arithmeticVersion:'binary64-v1',availability:'not_found',reason:'specified_run_not_found',snapshot:null,current:{schemaVersion:'vnext-launch-current-validity-v2',arithmeticVersion:'binary64-v1',members:[]},detail:null};
    assert.equal((await readLaunchRankingTransport({rpc:async()=>({data:missing,error:null})},{rankingRunId:LAUNCH_TEST_RUN},LAUNCH_TEST_NOW)).availability,'not_found');
    await assert.rejects(readLaunchRankingTransport(client,{rankingRunId:'00000000-0000-4000-8000-000000000999'},LAUNCH_TEST_NOW),/contract_invalid/u);
    assert.equal(fetches,0);
  }finally{globalThis.fetch=oldFetch;}
});
test('explicitlaunch detail selection rejects arrays,partialtuples andmixedlegacy selectors before anylatestread',()=>{
  const q={launchRunId:LAUNCH_TEST_RUN,launchResearchRevision:'00000000-0000-4000-8000-000000000010',launchScoreRevision:'00000000-0000-4000-8000-000000000100'};
  assert.equal(launchDetailQuery(q).status,'bound');assert.equal(launchDetailQuery({}).status,'latest');
  for(const bad of [{...q,launchRunId:[LAUNCH_TEST_RUN]}, {launchRunId:LAUNCH_TEST_RUN}, {...q,rankingRunId:LAUNCH_TEST_RUN},{...q,vnextRevision:q.launchResearchRevision}])assert.equal(launchDetailQuery(bad).status,'invalid');
});
test('nonplain/proxy/accessor RPC objects refuse without runninghooks or leakingraw/privatefields',()=>{
  const packet=launchRankingFixture();let hooks=0;
  assert.throws(()=>parseLaunchRankingRead(new Proxy(packet,{get(){hooks++;throw Error('hook');}}),{},LAUNCH_TEST_NOW),/contract_invalid/u);
  Object.defineProperty(packet.snapshot.members[0],'totalScore',{get(){hooks++;return 100;},enumerable:true});
  assert.throws(()=>parseLaunchRankingRead(packet,{},LAUNCH_TEST_NOW),/contract_invalid/u);assert.equal(hooks,0);
});

test('reported MOPS EPS holds exact ranking and research bindings, dates and public endpoints',()=>{
  const fixture=launchRankingFixture(1);
  const snapshot=fixture.snapshot!;
  const member=snapshot.members[0];
  const binding={rankingRunId:snapshot.rankingRunId,cutoff:snapshot.cutoff,session:snapshot.session,symbol:member.symbol,revisionId:member.revisionId,inputHash:member.inputHash};
  const eps={basis:'basic',periodStart:'2026-07-01',periodEnd:'2026-09-30',amount:0,filedAt:'2026-11-03T06:00:00Z',knownAt:'2026-11-03T07:00:00Z',
    sourceUrl:'https://mopsov.twse.com.tw/server-java/FileDownLoad?step=9&functionName=t164sb01&report_id=C&co_id='+member.symbol+'&year=2026&season=3'};
  const facts=[eps,{...eps,basis:'diluted',amount:-0.125},{...eps,periodStart:'2026-01-01',amount:4}];
  const packet={schemaVersion:'vnext-launch-reported-eps-v1',rankingRunId:binding.rankingRunId,cutoff:binding.cutoff,symbol:binding.symbol,
    revisionId:binding.revisionId,inputHash:binding.inputHash,facts};
  assert.deepEqual(parseLaunchReportedEps(packet,binding),facts);
  assert.deepEqual(parseLaunchReportedEps(null,binding),[]);
  for(const changed of [
    {...packet,rankingRunId:member.revisionId},{...packet,revisionId:snapshot.rankingRunId},{...packet,inputHash:'b'.repeat(64)},
    {...packet,cutoff:'2026-11-13T13:29:59Z'},{...packet,privateBrief:'redacted'},
    {...packet,facts:[eps,eps]},{...packet,facts:[eps,{...eps,periodStart:'2026-04-01'},facts[2]]},
    {...packet,facts:[{...eps,sourceUrl:eps.sourceUrl+'&tracking=private'}]},
    {...packet,facts:[{...eps,knownAt:'2026-11-13T13:30:00.000001Z'}]},
    {...packet,facts:[{...eps,filedAt:'2026-09-29T07:00:00Z'}]},
    {...packet,facts:[{...eps,receiptId:'redacted'}]},
  ])assert.throws(()=>parseLaunchReportedEps(changed,binding),/launch_ranking_contract_invalid/u);
});


test('issuer EPS forecast is pinned to the researched quarter and rejects substituted or private values',()=>{
 const binding={rankingRunId:'00000000-0000-4000-8000-000000000011',symbol:'2454',
   revisionId:'00000000-0000-4000-8000-000000000012',inputHash:'a'.repeat(64),cutoff:'2026-11-16T13:30:00Z',session:'2026-11-16'};
 const estimate={periodStart:'2026-10-01',periodEnd:'2026-12-31',amount:0,publishedAt:'2026-10-30T09:00:00Z',
   knownAt:'2026-11-16T09:00:00Z',sourceUrl:'https://mops.twse.com.tw/issuer-forecast'};
 const packet={schemaVersion:'vnext-launch-issuer-eps-estimates-v1',rankingRunId:binding.rankingRunId,
   symbol:binding.symbol,revisionId:binding.revisionId,inputHash:binding.inputHash,cutoff:binding.cutoff,estimates:[estimate]};
 assert.deepEqual(parseLaunchIssuerEpsEstimates(packet,binding),[estimate]);
 assert.deepEqual(parseLaunchIssuerEpsEstimates({...packet,estimates:[{...estimate,amount:-0.25}]},binding)[0].amount,-0.25);
 assert.deepEqual(parseLaunchIssuerEpsEstimates(null,binding),[]);
 for(const invalid of [
   {...packet,revisionId:'00000000-0000-4000-8000-000000000013'},
   {...packet,cutoff:'2026-11-16T13:31:00Z'},
   {...packet,estimates:[estimate,estimate]},
   ...[
     {sourceUrl:'https://mops.twse.com.tw/member/forecast'},
     {sourceUrl:'https://mops.twse.com.tw@private.example/forecast'},
     {sourceUrl:'https://mops.twse.com.tw/forecast?private_token=synthetic'},
     {knownAt:'2026-11-16T13:30:00.000001Z'},
     {periodEnd:'2026-09-30'},
     {internalNotes:'private evidence'},
   ].map(changes=>({...packet,estimates:[{...estimate,...changes}]})),
 ]){
   assert.throws(()=>parseLaunchIssuerEpsEstimates(invalid,binding),/launch_ranking_contract_invalid/);
 }
});


test('fiscal forecasts preserve exact issuer periods and disclosed share assumptions', () => {
  const binding = {
    rankingRunId: LAUNCH_TEST_RUN, symbol: '2454', revisionId: '00000000-0000-4000-8000-000000000012',
    inputHash: 'a'.repeat(64), cutoff: '2026-11-16T13:30:00Z', session: '2026-11-16',
  };
  const annual = {
    horizon: 'annual', periodStart: '2027-01-01', periodEnd: '2027-12-31',
    shareBasis: 'diluted', shares: '1000', amount: 0, publishedAt: '2026-10-30T09:00:00Z',
    knownAt: '2026-11-16T09:00:00Z', sourceUrl: 'https://mops.twse.com.tw/issuer-fiscal-forecast',
  };
  const four = {
    ...annual, horizon: 'four_quarters', periodStart: '2027-02-01', periodEnd: '2028-01-31',
    shareBasis: 'basic', shares: '2000', amount: -2,
  };
  const packet = {
    schemaVersion: 'vnext-launch-issuer-fiscal-forecasts-v1', rankingRunId: binding.rankingRunId,
    symbol: binding.symbol, revisionId: binding.revisionId, inputHash: binding.inputHash,
    cutoff: binding.cutoff, forecasts: [annual, four],
  };
  assert.deepEqual(parseLaunchIssuerFiscalForecasts(packet, binding), [annual, four]);
  assert.deepEqual(parseLaunchIssuerFiscalForecasts(null, binding), []);
  for (const invalid of [
    { ...packet, symbol: '2330' },
    { ...packet, rankingRunId: binding.revisionId },
    { ...packet, revisionId: binding.rankingRunId },
    { ...packet, cutoff: '2026-11-16T13:31:00Z' },
    { ...packet, forecasts: [annual, annual] },
    { ...packet, forecasts: [four, annual] },
    ...[
      { shares: '0' }, { shares: 1000 }, { shareBasis: 'unknown' },
      { periodEnd: '2027-09-30' }, { periodStart: '2027-01-02' },
      { knownAt: '2026-11-16T13:30:00.000001Z' },
      { sourceUrl: 'https://mops.twse.com.tw/issuer-forecast?token=private' },
      { rawOriginal: 'private' }, { priceTarget: 45 },
    ].map(alteration => ({ ...packet, forecasts: [{ ...annual, ...alteration }] })),
  ]) assert.throws(() => parseLaunchIssuerFiscalForecasts(invalid, binding), /launch_ranking_contract_invalid/u);
});


test('implied forward P/E uses the original score close and the exact positive fiscal EPS', () => {
  const packet = launchRankingFixture(1, true);
  const query = { symbol: packet.snapshot.members[0].symbol, rankingRunId: LAUNCH_TEST_RUN };
  const detail = parseLaunchRankingRead(packet, query, LAUNCH_TEST_NOW).detail!;
  const base = {
    horizon: 'annual' as const, periodStart: '2027-01-01', periodEnd: '2027-12-31',
    shareBasis: 'diluted' as const, shares: '1000', amount: 5,
    publishedAt: '2026-10-30T09:00:00Z', knownAt: '2026-11-10T04:00:00Z',
    sourceUrl: 'https://mops.twse.com.tw/issuer-fiscal-forecast',
  };
  const four = { ...base, horizon: 'four_quarters' as const, periodStart: '2027-02-01', periodEnd: '2028-01-31', amount: 4 };
  const before = structuredClone(detail);
  const reference = launchForwardPeReference(detail, [base, four]);
  assert.equal(reference?.close, 110);
  assert.equal(reference?.session, packet.snapshot.session);
  assert.equal(reference?.cutoff, packet.snapshot.cutoff);
  assert.equal(reference?.priceRevision, packet.snapshot.members[0].revisions.price);
  assert.deepEqual(reference?.periods, [
    { horizon: 'annual', periodStart: base.periodStart, periodEnd: base.periodEnd, multiple: 22 },
    { horizon: 'four_quarters', periodStart: four.periodStart, periodEnd: four.periodEnd, multiple: 27.5 },
  ]);
  assert.deepEqual(detail, before);
  for (const amount of [0, -2, Infinity, Number.MIN_VALUE]) {
    assert.equal(launchForwardPeReference(detail, [{ ...base, amount }])?.periods[0].multiple, null);
  }
  assert.equal(launchForwardPeReference(detail, []), null);
  const chartPacket = launchRankingFixture(1, true, undefined, true);
  const chartDetail = parseLaunchRankingRead(chartPacket, query, LAUNCH_TEST_NOW).detail!;
  const close = chartDetail.chart!.candles.at(-1)!;
  assert.equal(close.close, 102);
  assert.equal(launchForwardPeReference(chartDetail, [base]), null);
  close.close = 110;
  close.high = 110;
  assert.equal(launchForwardPeReference(chartDetail, [base])?.periods[0].multiple,22);
  chartDetail.chart!.priceRevision='e0';
  assert.equal(launchForwardPeReference(chartDetail, [base]), null);
});

test('frozen price highs separate 25 sessions, the exact 52-week boundary, and visible known history', () => {
  const packet = launchRankingFixture(1, true, undefined, true);
  const chart = packet.detail!.chart!;
  const current = chart.candles.at(-1)!;
  current.high = 122;
  chart.candles.find(candle => candle.time === '2025-11-14')!.high = 121;
  chart.candles.find(candle => candle.time === '2025-11-13')!.high = 140;
  chart.candles[0].high = 900;
  const high = parseLaunchRankingRead(packet, {symbol:'5274'}, LAUNCH_TEST_NOW).detail!.priceHighs!;
  assert.equal(high.schemaVersion, 'launch-frozen-price-highs-v1');
  assert.equal(high.seriesRevision, chart.seriesRevision);
  assert.equal(high.throughSession, chart.throughSession);
  assert.equal(high.currentHigh, 122);
  const visible = chart.candles.filter(candle => candle.time >= chart.displayFrom);
  assert.deepEqual(high.prior25Sessions, {fromDate:visible.at(-26)!.time, previousHigh:106, isNewHigh:true});
  assert.deepEqual(high.trailing52Weeks, {fromDate:'2025-11-14', previousHigh:121, isNewHigh:true});
  assert.deepEqual(high.knownPeriod, {fromDate:visible[0].time, previousHigh:140, isNewHigh:false});
  assert.equal(high.isAllTimeHigh, null);

  current.high = 121;
  const tied = parseLaunchRankingRead(packet, {symbol:'5274'}, LAUNCH_TEST_NOW).detail!.priceHighs!;
  assert.equal(tied.trailing52Weeks!.isNewHigh, false);
  Object.assign(packet.detail!, {priceHighs:{isAllTimeHigh:true}});
  assert.throws(() => parseLaunchRankingRead(packet, {symbol:'5274'}, LAUNCH_TEST_NOW), /contract_invalid/u);
});

test('missing charts and short display observations preserve unavailable high comparisons', () => {
  const query = {symbol:'5274'};
  const unavailable = launchRankingFixture(1, true);
  assert.equal(parseLaunchRankingRead(unavailable, query, LAUNCH_TEST_NOW).detail!.priceHighs, null);
  const packet = launchRankingFixture(1, true, undefined, true);
  const chart = packet.detail!.chart!;
  chart.candles = chart.candles.filter(candle => candle.time < chart.displayFrom || candle.time >= '2026-11-12');
  const partial = parseLaunchRankingRead(packet, query, LAUNCH_TEST_NOW).detail!.priceHighs!;
  assert.equal(partial.prior25Sessions, null);
  assert.equal(partial.trailing52Weeks, null);
  assert.deepEqual(partial.knownPeriod, {fromDate:'2026-11-12', previousHigh:106, isNewHigh:false});
  assert.equal(partial.isAllTimeHigh, null);
});

test('reviewed scenario projection accepts ordered prices under the frozen binding', () => {
  const packet=launchRankingFixture(1,true);
  const {snapshot,detail}=packet;
  const binding={...detail!,cutoff:snapshot.cutoff,session:snapshot.session};
  assert.equal(parseLaunchReviewedValuation(null,binding),null);
  const scenario={
    schemaVersion:'vnext-launch-reviewed-valuation-v1',rankingRunId:snapshot.rankingRunId,
    revisionId:detail!.revisionId,inputHash:detail!.inputHash,symbol:detail!.symbol,cutoff:snapshot.cutoff,
    valuationDate:'2026-11-10',quoteDate:'2026-11-09',period:'2027-Q1/2027-Q4',method:'forward_pe',
    unit:'TWD_per_share',bear:65,base:80,bull:95,
  };
  assert.deepEqual(parseLaunchReviewedValuation(scenario,binding),{
    valuationDate:'2026-11-10',quoteDate:'2026-11-09',period:'2027-Q1/2027-Q4',method:'forward_pe',
    unit:'TWD_per_share',bear:65,base:80,bull:95,peInputs:null,
  });
  for (const patch of [
    {rankingRunId:'00000000-0000-4000-8000-000000000999'}, {inputHash:'f'.repeat(64)},
    {revisionId:'00000000-0000-4000-8000-000000000999'}, {cutoff:'2026-11-13T13:30:01Z'},
    {valuationDate:'2026-11-14'}, {quoteDate:'2026-11-11'}, {period:'2027-02-30'},
    {period:'2027-Q4/2027-Q1'}, {method:'raw_broker_report'}, {unit:'TWD'},
    {bear:0}, {base:96}, {bull:Number.MAX_SAFE_INTEGER+1}, {privateOriginal:'PRIVATE'},
  ]) assert.throws(()=>parseLaunchReviewedValuation({...scenario,...patch},binding),/contract_invalid/u);
});

test('disclosed P/E inputs are closed, compatible with the reviewed method and reproduce all three prices',()=>{
  const packet=launchRankingFixture(1,true);
  const {snapshot,detail}=packet;
  const binding={...detail!,cutoff:snapshot.cutoff,session:snapshot.session};
  const wire={schemaVersion:'vnext-launch-reviewed-valuation-v1',rankingRunId:snapshot.rankingRunId,
    revisionId:detail!.revisionId,inputHash:detail!.inputHash,symbol:detail!.symbol,cutoff:snapshot.cutoff,
    valuationDate:'2026-11-10',quoteDate:'2026-11-09',period:'2027',method:'forward_pe',
    unit:'TWD_per_share',bear:65,base:80,bull:95};
  const peInputs={bear:{epsBasis:'next_four_quarter_eps',eps:5,multiple:13},
    base:{epsBasis:'source_annual_forecast_eps',eps:5,multiple:16},
    bull:{epsBasis:'source_next_four_fiscal_quarter_eps',eps:5,multiple:19}};
  assert.deepEqual(parseLaunchReviewedValuation({...wire,peInputs},binding)!.peInputs,peInputs);
  assert.equal(parseLaunchReviewedValuation({...wire,peInputs:null},binding)!.peInputs,null);
  const withBear=(change:object)=>({...peInputs,bear:{...peInputs.bear,...change}});
  for(const invalid of [
    {...wire,method:'dcf',peInputs},
    {...wire,method:'normalized_pe',peInputs},
    {...wire,peInputs:{bear:peInputs.bear,base:peInputs.base}},
    {...wire,peInputs:withBear({eps:0})},
    {...wire,peInputs:withBear({eps:-5,multiple:-13})},
    {...wire,peInputs:withBear({multiple:12})},
    {...wire,peInputs:withBear({epsBasis:'normalized_eps'})},
    {...wire,peInputs:withBear({source:'PRIVATE'})},
  ]) assert.throws(()=>parseLaunchReviewedValuation(invalid,binding),/contract_invalid/u);
});

test('frozen falsifier exposes the reviewed inference and safe original URL only',()=>{
  const packet=launchRankingFixture(1,true);
  const {snapshot,detail}=packet;
  const binding={...detail!,cutoff:snapshot.cutoff,session:snapshot.session};
  const original={schemaVersion:'vnext-launch-reviewed-falsifier-v1',rankingRunId:snapshot.rankingRunId,
    revisionId:detail!.revisionId,inputHash:detail!.inputHash,symbol:detail!.symbol,cutoff:snapshot.cutoff,
    statement:'如果公司未完成原定的認證，相關營收假設需要重新評估。',
    catalystDate:'2026-11-30',sourceUrl:'https://www.twse.com.tw/docs/falsifier',
    sourcePublishedAt:'2026-11-13T05:00:00Z'};
  assert.equal(parseLaunchReviewedFalsifier(null,binding),null);
  assert.deepEqual(parseLaunchReviewedFalsifier(original,binding),{
    statement:original.statement,catalystDate:original.catalystDate,sourceUrl:original.sourceUrl,sourcePublishedAt:original.sourcePublishedAt,
  });
  for(const patch of [
    {revisionId:'00000000-0000-4000-8000-000000000099'}, {symbol:'2330'},
    {cutoff:'2026-11-13T13:31:00Z'}, {sourcePublishedAt:'2026-11-13T14:00:00Z'}, {catalystDate:'2026-11-12'},
    {sourceUrl:'https://www.twse.com.tw/docs/../company'}, {sourceUrl:'https://www.twse.com.tw/docs/falsifier?secret=value'},
    {sourceUrl:'https://www.twse.com.tw/member/research'}, {sourceUrl:'https://www.twse.com.tw.invalid.test/docs/falsifier'},
    {statement:'查看這份未公開的內容 https://example.test/article。'}, {statement:original.statement.repeat(50)},
    {reviewerNote:'PRIVATE'}, {quote:'PRIVATE ORIGINAL'},
  ]) assert.throws(()=>parseLaunchReviewedFalsifier({...original,...patch},binding),/contract_invalid/u);
});
