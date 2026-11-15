/** Controlled LOOPBACK test transport, not a producer/database/publication.
 * Run explicitly with Node22 strip-types; production code never imports it. */
import http from 'node:http';
import {LAUNCH_OUTCOME_POLICY} from '../src/lib/vnext/launch-outcomes.ts';
import {outcomeFixture,outcomeCohortFixture} from '../src/lib/vnext/launch-outcome.test-fixture.ts';
import {launchRankingFixture,LAUNCH_TEST_RUN} from '../src/lib/vnext/launch-ranking.test-fixture.ts';
import {unsafeCitationUrls,unknownRightsCitationUrls} from '../src/lib/vnext/launch-citation.test-fixture.ts';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--port'||!/^\d{4,5}$/.test(args[1])||Number(args[1])<1024||Number(args[1])>65535)throw Error('launch_test_bridge_arguments');
const modes=new Set(['ready','chart','empty','not_published','producer_unavailable','schema_unavailable','outage','expired','short_expiry','partial','private','wrong_policy']);
const outcomeModes=new Set(['outcome_ready','outcome_unfillable','outcome_evidence_gap','outcome_private']);
for(const name of outcomeModes)modes.add(name);
const unsafeCitations=[...unsafeCitationUrls,...unknownRightsCitationUrls];
for(let i=0;i<unsafeCitations.length;i++)modes.add(`citation_${i}`);
for(const name of ['missing_rights','wrong_license','wrong_binding','unknown_revision','private_extra','wrong_attribution'])modes.add(`citation_${name}`);
let mode='ready',packet=launchRankingFixture(1,true,new Date().toISOString()),reads=0,companionReads=0,unsupported=0,controls=0;
function json(response,status,value){response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));}
async function body(request){let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>8192)throw Error('bound');chunks.push(chunk);}return size?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};}
const server=http.createServer(async(request,response)=>{
  try{
    if(request.method==='GET'&&request.url==='/__fixture/stats')return json(response,200,{synthetic:true,reads,companionReads,unsupported,controls,mode});
    if(request.method==='POST'&&request.url==='/__fixture/control'){
      if(request.headers['x-test-control']!=='launch-ui-test-only')return json(response,403,{error:'synthetic_control_required'});
      const input=await body(request);if(Object.keys(input).join('|')!=='mode'||!modes.has(input.mode))return json(response,400,{error:'synthetic_mode_invalid'});
      mode=input.mode;
      const clock=outcomeModes.has(mode)?outcomeFixture.ref.signalSession+'T13:31:00Z':new Date().toISOString();
      packet=launchRankingFixture(mode==='empty'?0:1,true,clock,mode==='chart');controls++;
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
