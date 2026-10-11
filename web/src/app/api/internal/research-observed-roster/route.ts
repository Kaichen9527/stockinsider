import {NextResponse} from 'next/server';
import {requireInternalAuth} from '@/lib/internal-auth';
import {getSupabaseServerClient} from '@/lib/supabase-server';
import {prepareObservedRosterAdmission} from '@/lib/research-observed-roster';

export async function POST(request:Request) {
 const auth=requireInternalAuth(request);
 if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
 let input:unknown;
 try {
  const reader=request.body?.getReader();if(!reader)throw Error('observed_packet_missing');
  let size=0;const chunks:Uint8Array[]=[];
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw Error('observed_packet_size_limit');chunks.push(value);}}
  finally{await reader.cancel();reader.releaseLock();}
  input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 }catch{return NextResponse.json({ok:false,error:'observed_packet_invalid'},{status:400});}
 let prepared;
 try {prepared=prepareObservedRosterAdmission(input);}catch{return NextResponse.json({ok:false,error:'observed_roster_validation_failed'},{status:400});}
 const {data,error}=await getSupabaseServerClient().rpc('admit_research_observed_roster_v1',{
  p_snapshot_hash:prepared.snapshotHash,p_canonical_packet:prepared.canonicalPacket,
 });
 if(error)return NextResponse.json({ok:false,error:'observed_roster_admission_rejected'},{status:409});
 return NextResponse.json({ok:true,receipt:data,scope:'research_observed_v1',researchQualified:false,strategyApproved:false,entryEligible:false});
}
