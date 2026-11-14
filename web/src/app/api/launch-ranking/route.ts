import {NextResponse} from 'next/server';
import {launchRankingEnabled,readLaunchRankingSnapshot} from '@/lib/vnext/launch-ranking-read';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'cache-control':'no-store'};
const reply=(value:unknown,status:number)=>NextResponse.json(value,{status,headers});
/** Public readonly projection; no source, queue, author, model or write path. */
export async function GET(request:Request){
  if(!launchRankingEnabled())return reply({ok:false,error:'launch_ranking_disabled'},503);
  let query:{rankingRunId?:string;symbol?:string};
  try{
    const params=new URL(request.url).searchParams;
    if([...params.keys()].some(key=>!['rankingRunId','symbol'].includes(key)||params.getAll(key).length!==1))
      return reply({ok:false,error:'launch_ranking_query_invalid'},400);
    const rankingRunId=params.get('rankingRunId'),symbol=params.get('symbol');
    if(rankingRunId!==null&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(rankingRunId)
      ||symbol!==null&&!/^\d{4}$/u.test(symbol))return reply({ok:false,error:'launch_ranking_query_invalid'},400);
    query={...(rankingRunId===null?{}:{rankingRunId}),...(symbol===null?{}:{symbol})};
  }catch{return reply({ok:false,error:'launch_ranking_query_invalid'},400);}
  try{
    const result=await readLaunchRankingSnapshot(query);
    const status=result.availability==='not_found'?404:['schema_unavailable','unavailable','producer_unavailable'].includes(result.availability)?503:200;
    return reply({ok:status===200,result},status);
  }catch{return reply({ok:false,error:'launch_ranking_read_unavailable'},503);}
}
