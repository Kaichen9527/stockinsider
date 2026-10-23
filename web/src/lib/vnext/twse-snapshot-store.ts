import {captureTwseSnapshot,snapshotContext,snapshotCoverage,snapshotTransportFailure,validateSnapshotReceipt,type TwseSnapshotContext,type TwseSnapshotObservation,type TwseSnapshotSink} from './twse-snapshot.ts';
import {inputHash,vnextEnabled} from './policy.ts';
import {vnextIdentity,type VnextIdentity} from './auth.ts';
type Row=Record<string,unknown>;
async function rpc(identity:VnextIdentity,operation:'append'|'read'|'latest',request:Row){
 if(!vnextEnabled() || identity.role!=='operator')throw Error('vnext_twse_snapshot_operator_required');
 const {getSupabaseServerClient}=await import('../supabase-server.ts');const result=await getSupabaseServerClient().rpc('vnext_twse_snapshot_v1',{p_principal:identity.principal,p_operation:operation,p_request:request});
 if(result.error)throw Error('vnext_twse_snapshot_authority_unavailable',{cause:result.error});
 if(!result.data || typeof result.data!=='object' || Array.isArray(result.data))throw Error('vnext_twse_snapshot_receipt_missing');
 return result.data as Row;
}
/** Trusted transport seam only. The SQL FK proves the old run id exists, not
 * its platform or acquisition contents. The existing service-role cache read
 * checks those finite run fields; this is not hostile-service attestation. */
export function twseSnapshotSink(dependencies:{checkRun(context:TwseSnapshotContext):Promise<void>;append(observation:TwseSnapshotObservation):Promise<Row>}):TwseSnapshotSink{
 const append=async(observation:TwseSnapshotObservation)=>{
  await dependencies.checkRun(observation);
  try{const receipt=await dependencies.append(observation);const checked=validateSnapshotReceipt(receipt);if(checked.receiptHash!==inputHash(observation))throw Error('vnext_twse_snapshot_receipt_mismatch');}
  catch(cause){throw Error('vnext_twse_snapshot_write_outcome_uncertain',{cause});}
 };
 return {async response(response,context){snapshotContext(context);const captured=await captureTwseSnapshot(response,context);await append(captured.observation);if(captured.error)throw captured.error;return captured.rows!;},
  async failure(context,error){snapshotContext(context);await append(snapshotTransportFailure(context,error));}};
}
/** Caller already passed legacy auth; exact configured operator binding and
 * current mode/official rights are additionally required before acquisition.
 * The existing route owns its original lease; this adapter never nests one. */
export async function createTwseSnapshotSink(request:Request){
 const identity=vnextIdentity(request);if(!identity || identity.role!=='operator')throw Error('vnext_twse_snapshot_operator_required');
 if(!vnextEnabled())throw Error('vnext_twse_snapshot_disabled');
 const {sourceExecutionPolicy}=await import('../source-policy.ts');if(sourceExecutionPolicy('twse_insider').disposition!=='active')throw Error('vnext_twse_snapshot_source_policy_blocked');
 const {requireActiveVpsWriter}=await import('../taiwan-data-runtime');const writer=await requireActiveVpsWriter();if(!writer.ok)throw Error(writer.error);
 await rpc(identity,'latest',{}); // Read-only authority preflight, before fetch.
 return twseSnapshotSink({checkRun:async(context)=>{
  const run=await writer.supabase.from('connector_runs').select('id,connector_name,platform,started_at').eq('id',context.connectorRunId).maybeSingle();
  if(run.error || !run.data || run.data.id!==context.connectorRunId || run.data.connector_name!=='source-sync' || run.data.platform!=='twse_insider' || !Number.isFinite(Date.parse(run.data.started_at)) || Date.parse(run.data.started_at)>Date.parse(context.requestedAt))throw Error('vnext_twse_snapshot_run_link_unavailable');
 },append:observation=>rpc(identity,'append',{observation})});
}
export async function readTwseSnapshotCoverage(identity:VnextIdentity){
 try{return snapshotCoverage(await rpc(identity,'latest',{}));}
 catch{return {eventCoverage:'unknown',eventVolume:null,status:'unavailable',reason:'snapshot_receipts_or_current_rights_unavailable',observations:null};}
}
/** Explicit recovery reads by immutable run/endpoint identity. No append or
 * fetch is retried after an unknown mutation response. No HTTP principal input. */
export async function readTwseSnapshotReceipt(identity:VnextIdentity,connectorRunId:string,endpointKey:TwseSnapshotContext['endpointKey']){
 snapshotContext({connectorRunId,endpointKey,querySymbol:null,requestedAt:new Date().toISOString()});
 const result=await rpc(identity,'read',{connectorRunId,endpointKey});
 if(Object.keys(result).sort().join('|')==='absent|eventCoverage|eventVolume' && result.absent===true && result.eventCoverage==='unknown' && result.eventVolume===null)return result;
 return validateSnapshotReceipt(result);
}
