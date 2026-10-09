import { performance } from 'node:perf_hooks';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const integer=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
function request(value) {
 if(!value||typeof value!=='object'||Array.isArray(value)||!UUID.test(value.runId||'')||Object.keys(value).some(k=>!['runId','pins'].includes(k)))throw Error('insider_continuation_request');
 if(value.pins!==undefined&&(!Array.isArray(value.pins)||value.pins.length!==5||value.pins.some((p,i)=>!p||Object.keys(p).length!==2||p.dataset!==i||!UUID.test(p.snapshotId||''))))throw Error('insider_continuation_pins');
 return structuredClone(value);
}
/** Validate a guarded response as acknowledged persisted progress, never as a retry hint. */
export function validateInsiderContinuationResponse(response,current,previous=null) {
 const body=response?.body;const result=body?.result;const progress=result?.metadata?.insider_snapshot;
 if(![200,502].includes(response?.status)||!body||typeof body.ok!=='boolean'||result?.connector!=='twse_insider'||result?.errorCode||result?.timedOut
   ||progress?.schema!=='insider_snapshot_progress_v1'||progress.runId!==current.runId)throw Error('insider_continuation_unknown_response');
 const pinned=request({runId:progress.runId,pins:progress.pins});
 if(current.pins&&JSON.stringify(current.pins)!==JSON.stringify(pinned.pins))throw Error('insider_continuation_changed_pins');
 if(!Array.isArray(progress.members)||progress.members.length!==5)throw Error('insider_continuation_members');
 for(let i=0;i<5;i++) {
  const m=progress.members[i];const old=previous?.members[i];
  if(!m||m.dataset!==i||m.snapshotId!==pinned.pins[i].snapshotId||typeof m.complete!=='boolean'||!integer(m.offset,50000)||!integer(m.totalRows,50000)
    ||m.offset>m.totalRows||!integer(m.generation,100)||!Number.isFinite(Date.parse(m.observedAt))||!Number.isFinite(Date.parse(m.attemptedAt))||Date.parse(m.attemptedAt)>Date.parse(m.observedAt)
    ||typeof m.hash!=='string'||!/^[0-9a-f]{64}$/u.test(m.hash)||m.complete!==(m.offset===m.totalRows)||m.generation!==Math.max(1,Math.ceil(m.offset/500)))throw Error('insider_continuation_progress');
  if(old&&(m.offset<old.offset||m.offset>Math.min(old.offset+500,old.totalRows)||m.totalRows!==old.totalRows||m.hash!==old.hash||m.observedAt!==old.observedAt||m.attemptedAt!==old.attemptedAt
    ||(old.complete&&(m.offset!==old.offset||m.generation!==old.generation||!m.complete))||(!old.complete&&m.generation!==old.generation+1)))throw Error('insider_continuation_progress_regressed');
 }
 const remaining=progress.members.reduce((n,m)=>n+m.totalRows-m.offset,0);const complete=progress.members.every(m=>m.complete);
 if(progress.remainingRows!==remaining||progress.outcome!==(complete?'coverage_complete':'pages_remaining'))throw Error('insider_continuation_outcome');
 if(response.status===502&&(!complete&&body.ok===false&&result.terminalReason==='partial'&&result.degradedReason==='insider_bounded_response_pages_remaining')!==true)throw Error('insider_continuation_untyped_502');
 if(response.status===200&&(!complete||body.ok!==true||result.degradedReason||!['success','successful_empty','duplicate_only'].includes(result.terminalReason)))throw Error('insider_continuation_untyped_200');
 // Private journal contains only bounded identities/progress, no source documents.
 return {request:pinned,progress:{schema:progress.schema,runId:progress.runId,pins:pinned.pins,members:progress.members.map(m=>({dataset:m.dataset,snapshotId:m.snapshotId,complete:m.complete,offset:m.offset,generation:m.generation,totalRows:m.totalRows,observedAt:m.observedAt,attemptedAt:m.attemptedAt,hash:m.hash})),outcome:progress.outcome,remainingRows:remaining}};
}
/** Existing authenticated source-sync adapter supplies invoke; no new ingest/credentials/model path.
 * saveJournal must durably persist the private summary before first HTTP and each next invocation.
 * Rejected/uncertain HTTP stops immediately. Explicit later resume uses the same request/run.
 */
export async function continueInsiderSnapshots(value,{invoke,saveJournal,monotonicNow=()=>performance.now(),maxInvocations=100,maxDurationMs=30*60*1000,previous=null}={}) {
 let current=request(value);
 if(typeof invoke!=='function'||typeof saveJournal!=='function'||!integer(maxInvocations,100)||maxInvocations<1||!integer(maxDurationMs,1800000)||maxDurationMs<1)throw Error('insider_continuation_configuration');
 let progress=previous;let invocations=0;const started=monotonicNow();const deadline=started+maxDurationMs;
 const journal=async state=>saveJournal({schema:'insider_continuation_journal_v1',request:current,progress,state,invocations});
 await journal('ready');
 while(invocations<maxInvocations&&monotonicNow()<deadline) {
  const remaining=deadline-monotonicNow();if(remaining<=0)break;
  // Adapter must bind its request abort/deadline to this signal; no retry here.
  const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('insider_continuation_deadline'));},Math.max(1,Math.floor(remaining)));});
  let response;
  try { response=await Promise.race([invoke({connector:'twse_insider',insiderSnapshot:current},{signal:controller.signal}),timeout]); }
  finally {clearTimeout(timer);controller.abort();}
  invocations++;
  const next=validateInsiderContinuationResponse(response,current,progress);current=next.request;progress=next.progress;
  await journal(progress.outcome==='coverage_complete'?'complete':'pages_remaining');
  if(progress.outcome==='coverage_complete')return {request:current,progress,invocations,stopped:'complete'};
 }
 await journal('bounded_stop');
 return {request:current,progress,invocations,stopped:'bounded_stop'};
}
