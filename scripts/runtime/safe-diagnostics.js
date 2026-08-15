'use strict';

const { sha256 } = require('./codec');

const ALLOWED_SQLSTATES=new Set(['22000','22023','23502','23503','23505','23514','40001','40P01','PT403','PT409']);
const ALLOWED_CONSTRAINT=/^[a-z][a-z0-9_]{0,95}$/u;
const STAGES=new Set(['source_sync','mention_claim_extraction','candidate_funnel','facts_refresh','analysis_revision','compact_radar_projection','worker_terminal']);
const ORIGINS=new Set(['handler','rpc_validation','persistence','provider','runtime']);
const JOB_KINDS=new Set(['source_root','revision_shard','stage_barrier','candidate_batch','analysis_batch','projection_batch','terminal']);
const INVARIANT_CODES=new Set(['candidate_seed_membership_missing','database_constraint_rejected','provider_timeout',
  'authentication_rejected','data_integrity_failure']);
function text(value){return typeof value==='string'?value:String(value??'');}
function invariantCode(error){
  if(INVARIANT_CODES.has(text(error?.invariantCode)))return text(error.invariantCode);
  const raw=text(error?.code||error?.message||'data_integrity_failure').toLowerCase();
  if(raw.includes('seed')&&raw.includes('membership'))return 'candidate_seed_membership_missing';
  if(raw.includes('constraint'))return 'database_constraint_rejected';
  if(raw.includes('timeout'))return 'provider_timeout';
  if(raw.includes('auth'))return 'authentication_rejected';
  return 'data_integrity_failure';
}
function safeFailureDiagnostic(error,{runId=null,jobId=null,stage='worker_terminal',jobKind='terminal',origin='runtime',
  failureCode='data_integrity_failure',itemOrdinal=null,fieldPath=null,inputHash=null,producerSha=null,recordedAt=null}={}){
  const sqlstate=ALLOWED_SQLSTATES.has(text(error?.code))?text(error.code):null;
  const constraint=ALLOWED_CONSTRAINT.test(text(error?.constraint))?text(error.constraint):null;
  const selectedStage=STAGES.has(stage)?stage:'worker_terminal';const selectedOrigin=ORIGINS.has(origin)?origin:'runtime';
  const selectedJobKind=JOB_KINDS.has(jobKind)?jobKind:'terminal';
  return Object.freeze({schema:'typed-runtime-failure-v3.14.0',runId:/^[0-9a-f-]{36}$/u.test(text(runId))?runId:null,
    jobId:/^[0-9a-f-]{36}$/u.test(text(jobId))?jobId:null,stage:selectedStage,jobKind:selectedJobKind,
    failureCode:['provider_unavailable','data_integrity_failure','authentication_rejected'].includes(failureCode)
      ?failureCode:'data_integrity_failure',origin:selectedOrigin,
    invariantCode:invariantCode(error),sqlstate,constraint,itemOrdinal:Number.isSafeInteger(itemOrdinal)&&itemOrdinal>=0?itemOrdinal:null,
    fieldPath:/^[A-Za-z][A-Za-z0-9_.]{0,127}$/u.test(text(fieldPath))?fieldPath:null,
    inputHash:/^[0-9a-f]{64}$/u.test(text(inputHash))?inputHash:null,
    producerSha:/^[0-9a-f]{40}$/u.test(text(producerSha))?producerSha:null,recordedAt:typeof recordedAt==='string'
      &&Number.isFinite(Date.parse(recordedAt))?new Date(recordedAt).toISOString():null,
    diagnosticHash:sha256(JSON.stringify([stage,origin,invariantCode(error),sqlstate,constraint,itemOrdinal,inputHash,producerSha]))});
}
module.exports={safeFailureDiagnostic};
