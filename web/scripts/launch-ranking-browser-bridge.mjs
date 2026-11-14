/** Controlled LOOPBACK test transport, not a producer/database/publication.
 * Run explicitly with Node22 strip-types; production code never imports it. */
import http from 'node:http';
import {launchRankingFixture,LAUNCH_TEST_RUN} from '../src/lib/vnext/launch-ranking.test-fixture.ts';
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--port'||!/^\d{4,5}$/.test(args[1])||Number(args[1])<1024||Number(args[1])>65535)throw Error('launch_test_bridge_arguments');
const modes=new Set(['ready','empty','not_published','producer_unavailable','schema_unavailable','outage','expired','short_expiry','partial','private','wrong_policy']);
let mode='ready',packet=launchRankingFixture(1,true,new Date().toISOString()),reads=0,unsupported=0,controls=0;
function json(response,status,value){response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));}
async function body(request){let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>8192)throw Error('bound');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
const server=http.createServer(async(request,response)=>{
  try{
    if(request.method==='GET'&&request.url==='/__fixture/stats')return json(response,200,{synthetic:true,reads,unsupported,controls,mode});
    if(request.method==='POST'&&request.url==='/__fixture/control'){
      if(request.headers['x-test-control']!=='launch-ui-test-only')return json(response,403,{error:'synthetic_control_required'});
      const input=await body(request);if(Object.keys(input).join('|')!=='mode'||!modes.has(input.mode))return json(response,400,{error:'synthetic_mode_invalid'});
      mode=input.mode;packet=launchRankingFixture(mode==='empty'?0:1,true,new Date().toISOString());controls++;
      // Only an explicit test-control write replaces a synthetic packet.
      // Repeated RPC reads never refresh a proof, source or publication clock.
      if(mode==='expired')packet.current.members.forEach(member=>{member.expiresAt=new Date(Date.now()-1000).toISOString();});
      if(mode==='short_expiry')packet.current.members.forEach(member=>{member.expiresAt=new Date(Date.now()+5000).toISOString();});
      if(mode==='partial')Object.assign(packet.snapshot.members[0],{availableWeight:80,totalScore:null});
      if(mode==='private')Object.assign(packet,{rawOriginal:'DO_NOT_RENDER_PRIVATE_FIXTURE'});
      if(mode==='wrong_policy')packet.snapshot.policyVersion='stockinsider-vnext-20-v1';
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
        return json(response,200,{schemaVersion:result.schemaVersion,availability,reason:'synthetic_read_state',snapshot:null,current:{schemaVersion:result.current.schemaVersion,members:[]},detail:null});
      }
      if(query.p_symbol===null)result.detail=null;
      return json(response,200,result);
    }
    unsupported++;return json(response,409,{error:'synthetic_read_only_bridge'});
  }catch{return json(response,400,{error:'synthetic_read_refused'});}
});
server.listen(Number(args[1]),'127.0.0.1',()=>process.stdout.write('launch_ranking_synthetic_bridge_ready\n'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
