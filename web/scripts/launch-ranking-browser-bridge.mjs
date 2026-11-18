/** Controlled LOOPBACK test transport, not a producer/database/publication.
 * Run explicitly with Node22 strip-types; production code never imports it. */
import http from 'node:http';
import {LAUNCH_OUTCOME_POLICY} from '../src/lib/vnext/launch-outcomes.ts';
import {outcomeFixture,outcomeCohortFixture} from '../src/lib/vnext/launch-outcome.test-fixture.ts';
import {launchRankingFixture,LAUNCH_TEST_RUN} from '../src/lib/vnext/launch-ranking.test-fixture.ts';
import {unsafeCitationUrls,unknownRightsCitationUrls} from '../src/lib/vnext/launch-citation.test-fixture.ts';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--port'||!/^\d{4,5}$/.test(args[1])||Number(args[1])<1024||Number(args[1])>65535)throw Error('launch_test_bridge_arguments');
const modes=new Set(['ready','chart','empty','not_published','producer_unavailable','schema_unavailable','outage','expired','short_expiry','partial','private','wrong_policy','reported_eps','reported_eps_private','issuer_forecasts','issuer_forecast_misbound']);
modes.add('candidate_pool');
const candidateSnapshots = [
  ['2026-11-09', 901, [['2301', 'waiting'], ['2302', 'eligible']]],
  ['2026-11-10', 902, [['2301', 'waiting'], ['2303', 'eligible', '24']]],
  ['2026-11-11', 903, [['2304', 'eligible']]],
].map(([day, id, entries]) => ({
  id: '00000000-0000-4000-8000-' + String(id).padStart(12, '0'),
  cutoff: day + 'T13:30:00Z',
  rows: entries.map(([symbol, state, code]) => ({
    symbol, state, industrySnapshot: code ? {
      revisionId:'00000000-0000-4000-8000-000000000912', code, knownAt:day + 'T13:29:00Z',
    } : null,
  })),
}));
function candidatePacket(index) {
  if (index < 0) return null;
  const successor = candidateSnapshots[index + 1];
  return {
    schemaVersion: 'launch-candidate-pool-history-v2',
    current: candidateSnapshots[index],
    previous: candidateSnapshots[index - 1] ?? null,
    next: successor ? { id: successor.id, cutoff: successor.cutoff } : null,
  };
}
modes.add('scenario_ready');
modes.add('scenario_private');
const outcomeModes=new Set(['outcome_ready','outcome_unfillable','outcome_evidence_gap','outcome_private']);
for(const name of outcomeModes)modes.add(name);
const unsafeCitations=[...unsafeCitationUrls,...unknownRightsCitationUrls];
for(let i=0;i<unsafeCitations.length;i++)modes.add(`citation_${i}`);
for(const name of ['missing_rights','wrong_license','wrong_binding','unknown_revision','private_extra','wrong_attribution'])modes.add(`citation_${name}`);
let mode='ready',packet=launchRankingFixture(1,true,new Date().toISOString()),reads=0,companionReads=0,unsupported=0,controls=0,candidateDayReads=0,candidatePinnedReads=0,candidateSourceReads=0;
function json(response,status,value){response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));}
async function body(request){let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>8192)throw Error('bound');chunks.push(chunk);}return size?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};}
const server=http.createServer(async(request,response)=>{
  try{
    if(request.method==='GET'&&request.url==='/__fixture/stats')return json(response,200,{synthetic:true,reads,companionReads,unsupported,controls,mode,candidateDayReads,candidatePinnedReads,candidateSourceReads});
    if(request.method==='POST'&&request.url==='/__fixture/control'){
      if(request.headers['x-test-control']!=='launch-ui-test-only')return json(response,403,{error:'synthetic_control_required'});
      const input=await body(request);if(Object.keys(input).join('|')!=='mode'||!modes.has(input.mode))return json(response,400,{error:'synthetic_mode_invalid'});
      mode=input.mode;
      const clock=outcomeModes.has(mode)?outcomeFixture.ref.signalSession+'T13:31:00Z':new Date().toISOString();
      packet=launchRankingFixture(mode==='empty'?0:1,true,clock,mode==='chart');controls++;
      if(mode==='chart')packet.detail.chart.candles.at(-1).high=108;
      // Only an explicit test-control write replaces a synthetic packet.
      // Repeated RPC reads never refresh a proof, source or publication clock.
      if(mode==='expired')packet.current.members.forEach(member=>{member.expiresAt=new Date(Date.now()-1000).toISOString();});
      if(mode==='short_expiry')packet.current.members.forEach(member=>{member.expiresAt=new Date(Date.now()+5000).toISOString();});
      if(mode==='partial')Object.assign(packet.snapshot.members[0],{availableWeight:80,totalScore:null});
      if(mode==='private')Object.assign(packet,{rawOriginal:'DO_NOT_RENDER_PRIVATE_FIXTURE'});
      if(mode==='wrong_policy')packet.snapshot.policyVersion='stockinsider-vnext-20-v1';
      const citation=packet.detail?.citations[0];
      if(/^citation_\d+$/u.test(mode))citation.url=unsafeCitations[Number(mode.slice('citation_'.length))];
      if(mode==='citation_missing_rights')delete citation.publicRights;
      if(mode==='citation_wrong_license')citation.publicRights.license='SYNTHETIC_UNKNOWN';
      if(mode==='citation_wrong_binding')citation.sourceRevision='00000000-0000-4000-8000-000000000999';
      if(mode==='citation_unknown_revision')citation.publicRights.rightsRevision='SYNTHETIC_UNKNOWN';
      if(mode==='citation_private_extra')citation.rawBody='SYNTHETIC_PRIVATE_ONLY';
      if(mode==='citation_wrong_attribution')citation.publicRights.attribution='SYNTHETIC_UNKNOWN';
      return json(response,200,{synthetic:true,mode});
    }
    if(request.method==='POST'&&request.url==='/rest/v1/rpc/vnext_launch_ranking_read_v1'){
      reads++;const query=await body(request);
      if(Object.keys(query).sort().join('|')!=='p_ranking_run_id|p_symbol')return json(response,400,{code:'SYNTHETIC_CLOSED_QUERY'});
      if(mode==='schema_unavailable')return json(response,404,{code:'PGRST202',message:'Synthetic missing new schema'});
      if(mode==='outage')return json(response,503,{code:'SYNTHETIC_OUTAGE'});
      const result=structuredClone(packet);
      if(['not_published','producer_unavailable'].includes(mode)||query.p_ranking_run_id!==null&&query.p_ranking_run_id!==LAUNCH_TEST_RUN||query.p_symbol!==null&&query.p_symbol!=='5274'){
        const availability=['not_published','producer_unavailable'].includes(mode)?mode:'not_found';
        return json(response,200,{schemaVersion:result.schemaVersion,arithmeticVersion:result.arithmeticVersion,availability,reason:'synthetic_read_state',snapshot:null,current:{schemaVersion:result.current.schemaVersion,arithmeticVersion:result.current.arithmeticVersion,members:[]},detail:null});
      }
      if(query.p_symbol===null)result.detail=null;
      return json(response,200,result);
    }
    if(request.method==='POST'&&request.url==='/rest/v1/rpc/vnext_launch_reported_eps_v1'){
      const query=await body(request);
      if(Object.keys(query).sort().join('|')!=='p_ranking_run_id|p_symbol'
        ||query.p_ranking_run_id!==LAUNCH_TEST_RUN||query.p_symbol!=='5274')return json(response,400,{code:'SYNTHETIC_CLOSED_QUERY'});
      companionReads++;
      if(!['reported_eps','reported_eps_private'].includes(mode))return json(response,200,null);
      const member=packet.snapshot.members[0];
      const fact={basis:'diluted',periodStart:'2026-07-01',periodEnd:'2026-09-30',amount:-0.125,filedAt:'2026-10-22T06:00:00Z',knownAt:'2026-10-22T07:00:00Z',
        sourceUrl:'https://mopsov.twse.com.tw/server-java/FileDownLoad?step=9&functionName=t164sb01&report_id=C&co_id=5274&year=2026&season=3'};
      if(mode==='reported_eps_private')fact.privateSource='SYNTHETIC_PRIVATE_FINANCIAL_ONLY';
      return json(response,200,{schemaVersion:'vnext-launch-reported-eps-v1',rankingRunId:LAUNCH_TEST_RUN,
        symbol:member.symbol,revisionId:member.revisionId,inputHash:member.inputHash,cutoff:packet.snapshot.cutoff,facts:[fact]});
    }
    const candidateDayPath = '/rest/v1/rpc/vnext_launch_candidate_pool_day_v1';
    const candidateVersionPath = '/rest/v1/rpc/vnext_launch_candidate_pool_history_v2';
    if (request.method === 'POST' && request.url === candidateDayPath) {
      const query = await body(request);
      if (Object.keys(query).join('|') !== 'p_day' || typeof query.p_day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(query.p_day))
        return json(response, 400, {code:'SYNTHETIC_CLOSED_QUERY'});
      candidateDayReads++;
      if (mode !== 'candidate_pool') return json(response, 200, null);
      if (query.p_day === '2026-11-12')
        return json(response, 200, {...candidatePacket(1), rawBody:'SYNTHETIC_PRIVATE_CANDIDATE_ONLY'});
      const index = candidateSnapshots.findIndex(snapshot => snapshot.cutoff.startsWith(query.p_day + 'T'));
      return json(response, 200, candidatePacket(index));
    }
    if (request.method === 'POST' && request.url === candidateVersionPath) {
      const query = await body(request);
      if (Object.keys(query).join('|') !== 'p_catalog_id' ||
        (query.p_catalog_id !== null && (typeof query.p_catalog_id !== 'string' || !/^[a-f0-9-]{36}$/u.test(query.p_catalog_id))))
        return json(response, 400, {code:'SYNTHETIC_CLOSED_QUERY'});
      candidatePinnedReads++;
      if (mode !== 'candidate_pool') return json(response, 200, null);
      const index = query.p_catalog_id === null ? candidateSnapshots.length - 1 :
        candidateSnapshots.findIndex(snapshot => snapshot.id === query.p_catalog_id);
      return json(response, 200, candidatePacket(index));
    }
    if (request.method === 'POST' && request.url === '/rest/v1/rpc/vnext_launch_candidate_clue_history_v1') {
      const query = await body(request);
      if (Object.keys(query).sort().join('|') !== 'p_after|p_catalog_id|p_date|p_industry|p_limit|p_source|p_status'
        || query.p_after !== null || !Number.isInteger(query.p_limit) || query.p_limit < 1 || query.p_limit > 20)
        return json(response, 400, {code:'SYNTHETIC_CLOSED_QUERY'});
      candidateSourceReads++;
      const snapshot = candidateSnapshots[1];
      if (mode !== 'candidate_pool' || query.p_catalog_id !== snapshot.id) return json(response, 200, null);
      const row = {clueId:'00000000-0000-4000-8000-000000000911', symbol:'2305', source:'ptt',
        eventAt:'2026-11-08T17:00:00Z', state:'not_in_saved_pool', industrySnapshot:null};
      const include = (query.p_date === null || query.p_date === '2026-11-09')
        && (query.p_source === null || query.p_source === row.source)
        && (query.p_status === null || query.p_status === row.state) && query.p_industry === null;
      return json(response, 200, {schemaVersion:'launch-candidate-clue-history-v1', catalogId:snapshot.id,
        cutoff:snapshot.cutoff, previousSnapshot:null, nextSnapshot:null,
        rows:include?[row]:[], nextAfter:null, sourceAuthority:false, entryAuthority:false, publicationAuthority:false});
    }

    if(request.method==='POST'&&request.url==='/rest/v1/rpc/vnext_launch_reviewed_valuation_v1'){
      const query=await body(request);
      if(Object.keys(query).sort().join('|')!=='p_ranking_run_id|p_symbol' ||
        query.p_ranking_run_id!==LAUNCH_TEST_RUN || query.p_symbol!=='5274')
        return json(response,400,{code:'SYNTHETIC_CLOSED_QUERY'});
      companionReads++;
      if(!['scenario_ready','scenario_private'].includes(mode))return json(response,200,null);
      const member=packet.snapshot.members[0];
      const {cutoff,session}=packet.snapshot;
      const value={schemaVersion:'vnext-launch-reviewed-valuation-v1',rankingRunId:LAUNCH_TEST_RUN,
        symbol:member.symbol,revisionId:member.revisionId,inputHash:member.inputHash,cutoff,
        valuationDate:session,quoteDate:session,period:String(Number(session.slice(0,4))+1),method:'dcf',
        unit:'TWD_per_share',bear:65,base:80,bull:95};
      if(mode==='scenario_private')value.rawOriginal='SYNTHETIC_PRIVATE_REVIEWED_SCENARIO';
      return json(response,200,value);
    }
    const issuerEpsPath = '/rest/v1/rpc/vnext_launch_issuer_eps_estimates_v1';
    const issuerFiscalPath = '/rest/v1/rpc/vnext_launch_issuer_fiscal_forecasts_v1';
    if (request.method === 'POST' && [issuerEpsPath, issuerFiscalPath].includes(request.url)) {
      const query = await body(request);
      if (Object.keys(query).sort().join('|') !== 'p_ranking_run_id|p_symbol' ||
        query.p_ranking_run_id !== LAUNCH_TEST_RUN || query.p_symbol !== '5274') {
        return json(response, 400, {code:'SYNTHETIC_CLOSED_QUERY'});
      }
      companionReads++;
      if (!['issuer_forecasts', 'issuer_forecast_misbound'].includes(mode)) return json(response, 200, null);
      const member = packet.snapshot.members[0];
      const { cutoff, session } = packet.snapshot;
      const year = Number(session.slice(0, 4)) + 1;
      const binding = { rankingRunId: LAUNCH_TEST_RUN, symbol: member.symbol, revisionId: member.revisionId,
        inputHash: member.inputHash, cutoff };
      const common = { periodStart: year + '-01-01', publishedAt: cutoff, knownAt: cutoff,
        sourceUrl: 'https://mops.twse.com.tw/synthetic-forecast' };
      if (request.url === issuerEpsPath) {
        return json(response, 200, {schemaVersion:'vnext-launch-issuer-eps-estimates-v1', ...binding,
          estimates:[{ ...common, periodEnd:year + '-03-31', amount:2.5 }]});
      }
      if (mode === 'issuer_forecast_misbound') binding.inputHash = 'f'.repeat(64);
      return json(response, 200, {schemaVersion:'vnext-launch-issuer-fiscal-forecasts-v1', ...binding,
        forecasts:[{ ...common, periodEnd:year + '-12-31', horizon:'annual', shareBasis:'diluted', shares:'1000000', amount:5 }]});
    }
    if(request.method==='POST'&&request.url==='/rest/v1/rpc/vnext_launch_morning_public_v1'){
      const query=await body(request);
      if(Object.keys(query).length!==0)return json(response,400,{code:'SYNTHETIC_CLOSED_QUERY'});
      companionReads++;
      return json(response,200,null);
    }
    if(request.method==='POST'&&request.url==='/rest/v1/rpc/vnext_launch_outcome_public_v1'){
      const query=await body(request);
      if(Object.keys(query).sort().join('|')!=='p_ranking_run_id|p_symbol'
        ||query.p_ranking_run_id!==LAUNCH_TEST_RUN||query.p_symbol!=='5274')return json(response,400,{code:'SYNTHETIC_CLOSED_QUERY'});
      companionReads++;
      if(outcomeModes.has(mode)){
        const outcome={...outcomeFixture.completed,rankingRunId:LAUNCH_TEST_RUN,firstRankingRunId:outcomeFixture.ref.rankingRunId,
          symbol:'5274',signalSession:packet.snapshot.session};
        if(mode==='outcome_unfillable')return json(response,200,{...outcome,execution:{status:'unfillable',nextSession:'2026-10-06',
          reason:'suspended',grossBarrier20:null,netBarrier20:null,horizons:[]}});
        if(mode==='outcome_evidence_gap')return json(response,200,{...outcome,execution:{status:'opening_evidence_gap',nextSession:'2026-10-06',
          reason:null,grossBarrier20:null,netBarrier20:null,horizons:[]}});
        if(mode==='outcome_private')return json(response,200,{...outcome,research:{...outcome.research,privateBody:'SYNTHETIC_PRIVATE_OUTCOME'}});
        return json(response,200,outcome);
      }
      return json(response,200,{schemaVersion:'vnext-launch-outcome-public-v1',policyVersion:LAUNCH_OUTCOME_POLICY,
        rankingRunId:LAUNCH_TEST_RUN,symbol:'5274',signalSession:packet.snapshot.session,state:'not_started',
        firstRankingRunId:null,asOf:null,outcomeRevision:null,research:null,execution:null});
    }
    if(request.method==='POST'&&request.url==='/rest/v1/rpc/vnext_launch_outcome_cohorts_v1'){
      if(Object.keys(await body(request)).length!==0)return json(response,400,{code:'SYNTHETIC_CLOSED_QUERY'});
      companionReads++;
      return json(response,200,outcomeCohortFixture.document);
    }
    unsupported++;console.error('Unexpected fixture method/path',request.method,request.url?.split('?')[0]);
    return json(response,409,{error:'synthetic_read_only_bridge'});
  }catch{return json(response,400,{error:'synthetic_read_refused'});}
});
server.listen(Number(args[1]),'127.0.0.1',()=>process.stdout.write('launch_ranking_synthetic_bridge_ready\n'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
