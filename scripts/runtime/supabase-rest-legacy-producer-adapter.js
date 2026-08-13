'use strict';

const {invariant}=require('./codec');

function decodeBytea(value){
  if(Buffer.isBuffer(value))return value;
  if(typeof value==='string'&&/^\\x[0-9a-f]*$/iu.test(value))return Buffer.from(value.slice(2),'hex');
  return value===null||value===undefined?null:Buffer.from(String(value),'utf8');
}

function createSupabaseRestLegacyProducerAdapter({supabaseUrl,serviceRoleKey,fetchImpl=globalThis.fetch}={}){
  invariant(typeof supabaseUrl==='string'&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/u.test(supabaseUrl),
    'supabase REST URL invalid');
  invariant(typeof serviceRoleKey==='string'&&serviceRoleKey.length>=32&&!/[\r\n\0]/u.test(serviceRoleKey),
    'supabase REST credential invalid');
  invariant(typeof fetchImpl==='function','supabase REST transport unavailable');
  let cachedAuthorityHash='';
  const rpc=async(name,body)=>{
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),120000);
    try{
      const response=await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`,{method:'POST',signal:controller.signal,
        headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`,'Content-Type':'application/json',
          Accept:'application/json','X-Client-Info':'stockinsider-reviewed-producer-v3.15'},body:JSON.stringify(body)});
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>4_194_304)throw new Error(`supabase_rpc_response_bound:${name}`);
      let value=null;try{value=bytes.length?JSON.parse(bytes.toString('utf8')):null;}catch{throw new Error(`supabase_rpc_json:${name}`);}
      if(!response.ok){const code=typeof value?.code==='string'&&/^[A-Z0-9]{4,5}$/u.test(value.code)?value.code:'unknown';
        throw new Error(`supabase_rpc_rejected:${name}:${code}`);}
      return Array.isArray(value)?value[0]??null:value;
    }finally{clearTimeout(timeout);}
  };
  const lease=(row)=>row&&Object.freeze({runId:row.run_id,job:row.job_id?{jobId:row.job_id}:null,
    disposition:row.disposition,status:row.disposition==='retained_success'?'succeeded':'running',
    sourceCutoff:row.source_cutoff,authorityHash:row.authority_hash});
  const claim=(row)=>row&&Object.freeze({runId:row.run_id,jobId:row.job_id,stage:row.stage,jobKind:row.job_kind,
    stageOrdinal:row.stage_ordinal,shardOrdinal:row.shard_ordinal,executionOrdinal:row.execution_ordinal,
    revisionId:row.revision_id,attempt:row.attempt,payloadCanonical:decodeBytea(row.payload_canonical),
    payloadJson:row.payload_json,payloadHash:row.payload_hash,predecessorResultCanonical:decodeBytea(row.predecessor_result_canonical),
    predecessorResultJson:row.predecessor_result_json,predecessorResultHash:row.predecessor_result_hash,
    authorityKind:row.authority_kind,authorityCanonical:decodeBytea(row.authority_canonical),authorityJson:row.authority_json,
    authorityHash:row.authority_hash,frozenRevisionCanonical:decodeBytea(row.frozen_revision_canonical),
    frozenRevisionJson:row.frozen_revision_json,frozenRevisionHash:row.frozen_revision_hash,readKind:row.read_kind,
    readCanonical:decodeBytea(row.read_canonical),readJson:row.read_json,readHash:row.read_hash,
    readRowCount:row.read_row_count,leaseExpiresAt:row.lease_expires_at});
  const completion=(row)=>row&&Object.freeze({status:row.status==='success'?'succeeded':row.status,nextJob:row.next_job});
  const bytea=(value)=>`\\x${Buffer.from(value).toString('hex')}`;
  return Object.freeze({
    acquireLegacyProducerLease:async(input)=>lease(await rpc('acquire_legacy_producer_lease_v3_11',{
      p_owner:input.ownerLabel,p_commit:input.sourceCommitSha,p_worker:input.workerSha256,p_config:bytea(input.configBytes),
      p_config_hash:input.configSha256,p_token:input.ownerToken,p_lease:input.leaseSeconds})),
    claimLegacyProducerJob:async(input)=>{
      const row=await rpc('claim_legacy_producer_job_rest_v3_15',{p_run:input.runId,p_job:input.jobId,
        p_token:input.ownerToken,p_lease:input.leaseSeconds,p_authority_hash:cachedAuthorityHash});
      const value=claim(row);
      if(Array.isArray(value?.readJson?.authorityPages)&&value.readJson.authorityPages.length>0
          &&/^[0-9a-f]{64}$/u.test(value.readJson.authorityHash??''))cachedAuthorityHash=value.readJson.authorityHash;
      return value;
    },
    heartbeatLegacyProducerJob:async(input)=>Boolean(await rpc('heartbeat_legacy_producer_job_v3_11',{
      p_run:input.runId,p_job:input.jobId,p_token:input.ownerToken,p_lease:input.leaseSeconds})),
    completeLegacyProducerJob:async(input)=>completion(await rpc('complete_legacy_producer_job_v3_14',{
      p_run_id:input.runId,p_job_id:input.jobId,p_owner_token:input.ownerToken,p_result:bytea(input.resultCanonical),
      p_json:input.resultJson,p_hash:input.resultHash})),
    appendLegacyRuntimeFailureDiagnostic:async(input)=>Boolean(await rpc('append_legacy_runtime_failure_diagnostic_v3_14',{
      p_run_id:input.runId,p_job_id:input.jobId,p_owner_token:input.ownerToken,p_stage:input.stage,p_job_kind:input.jobKind,
      p_failure_code:input.failureCode,p_failure_origin:input.origin,p_invariant_code:input.invariantCode,
      p_sqlstate:input.sqlstate,p_constraint_name:input.constraint,p_item_ordinal:input.itemOrdinal,
      p_field_path:input.fieldPath,p_input_hash:input.inputHash,p_producer_sha:input.producerSha,
      p_diagnostic_hash:input.diagnosticHash,p_recorded_at:input.recordedAt})),
    appendLegacyOfficialIngestionChunk:async(input)=>Boolean(await rpc('append_legacy_official_ingestion_chunk_v3_14',{
      p_run_id:input.runId,p_job_id:input.jobId,p_owner_token:input.ownerToken,p_kind:input.kind,p_ordinal:input.ordinal,
      p_items:input.items,p_chunk_hash:input.chunkHash,p_producer_sha:input.producerSha,p_source_cutoff:input.sourceCutoff})),
    failLegacyProducerJob:async(input)=>completion(await rpc('fail_legacy_producer_job_v3_11',{
      p_run:input.runId,p_job:input.jobId,p_token:input.ownerToken,p_failure:input.failure})),
    close:async()=>{},
  });
}

module.exports={createSupabaseRestLegacyProducerAdapter,decodeBytea};
