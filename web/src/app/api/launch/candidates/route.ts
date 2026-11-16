import {NextResponse} from 'next/server';
import {launchCandidateQuery,readLaunchCandidateCatalog} from '@/lib/vnext/launch-candidate-catalog';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const reply=(body:unknown,status:number)=>NextResponse.json(body,{status,headers:{'cache-control':'no-store'}});
/** Read-only public projection from saved launch snapshots. */
export async function GET(request:Request){
 try{
  // Keep fixed call boundaries: production optimizer inlining of the combined
  // initializer previously emitted use-before-let bindings and turned503into400.
  const query:ReturnType<typeof launchCandidateQuery>=Reflect.apply(launchCandidateQuery,undefined,[new URL(request.url).searchParams]);
  const result:Awaited<ReturnType<typeof readLaunchCandidateCatalog>>=await Reflect.apply(readLaunchCandidateCatalog,undefined,[query]);
  const ready=String(result.availability)==='ready';
  return reply({ok:ready,result},ready?200:503);
 }catch{return reply({ok:false,error:'launch_candidate_query_invalid'},400);}
}
