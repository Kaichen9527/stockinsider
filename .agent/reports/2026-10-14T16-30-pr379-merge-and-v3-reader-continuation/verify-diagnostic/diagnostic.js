'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const cp = require('node:child_process');
const root = process.cwd(), out = '/tmp/stockinsider-pr379-verify-process-diagnostic-oct14';
const write = v => fs.appendFileSync(path.join(out, 'witness.jsonl'), JSON.stringify({...v, at:new Date().toISOString()})+'\n', {mode:0o600});
if(process.env.OPPORTUNITY_V3_PROTECTED_NO_LIVE_AUTH==='1') throw Error('noncredential flag present');
const lifecycle = require(path.join(root, 'scripts/model-runner-v3/processLifecycle'));
const originalRun = lifecycle.runModelProcess;
const messageClass = m => {
  const text = typeof m==='string'?m:'';
  const patterns={rate_limit:/rate.?limit|usage.?limit|quota|429/i,connection:/connection|network|stream.*(?:fail|error)|error sending request/i,timeout:/time.?out|deadline/i,auth:/unauthori[sz]ed|forbidden|401|403/i,server:/500|502|503|internal server/i,sandbox:/sandbox|permission|operation not permitted/i};
  return Object.fromEntries(Object.entries(patterns).map(([k,p])=>[k,p.test(text)]));
};
function event(line) {
  try {
    const e=JSON.parse(line), type=String(e.type);
    if(!['thread.started','turn.started','turn.completed','turn.failed','error','item.started','item.updated','item.completed'].includes(type)) {write({stage:'model_event_unknown_type'});return;}
    const v={stage:'model_event',type};
    if(type==='error'||type==='turn.failed') v.messageClasses=messageClass(type==='error'?e.message:e.error?.message);
    if(e.item && typeof e.item==='object') {
      v.itemType=['agent_message','reasoning','command_execution','tool_call','web_search'].includes(e.item.type)?e.item.type:'other';
      if(type==='item.completed'&&e.item.type==='agent_message') {
        const text=typeof e.item.text==='string'?e.item.text:'';
        v.textBytes=Buffer.byteLength(text);v.textSha256=crypto.createHash('sha256').update(text).digest('hex');
        try {const terminal=JSON.parse(text);if(terminal&&typeof terminal==='object'&&!Array.isArray(terminal)) {
          const keys=Object.keys(terminal);
          v.closedOracleKeys=keys.length===2&&keys.every(k=>['modelAttempt','operation'].includes(k));
          if(v.closedOracleKeys){v.keyOrder=keys;v.completed=terminal.modelAttempt==='completed';v.verify=terminal.operation==='verify';v.originalStrictStringifyPredicate=JSON.stringify(terminal)===JSON.stringify({modelAttempt:'completed',operation:'verify'});}
        }}catch{}
      }
    }
    write(v);
  }catch {write({stage:'model_event_not_json',bytes:Buffer.byteLength(line),sha256:crypto.createHash('sha256').update(line).digest('hex')});}
}
function observedSpawn(executable,args,options) {
  const child=cp.spawn(executable,args,options);
  const counts={stdout:0,stderr:0}, hashes={stdout:crypto.createHash('sha256'),stderr:crypto.createHash('sha256')};
  let partial='', stderrPrefix='', observerTruncated=false;
  child.on('spawn',()=>write({stage:'model_spawned',detached:options.detached===true}));
  child.on('error',e=>write({stage:'model_spawn_error',code:['ENOENT','EACCES','EPERM','EMFILE','ENFILE','EAGAIN'].includes(e.code)?e.code:'other'}));
  for(const name of ['stdout','stderr'])child[name].on('data',chunk=>{
    try {
      counts[name]+=chunk.length;hashes[name].update(chunk);
      if(name==='stderr') {if(stderrPrefix.length<65536)stderrPrefix+=(chunk.toString('utf8')).slice(0,65536-stderrPrefix.length);}
      else if(!observerTruncated) {
        partial+=chunk.toString('utf8');
        if(Buffer.byteLength(partial)>65536){partial='';observerTruncated=true;write({stage:'observer_line_cap_exceeded'});return;}
        let newline;while((newline=partial.indexOf('\n'))>=0){const line=partial.slice(0,newline);partial=partial.slice(newline+1);if(line.trim())event(line);}
      }
    }catch{write({stage:'observer_error_no_execution_change'});}
  });
  child.on('exit',(code,signal)=>write({stage:'model_process_exit',code,signal}));
  child.on('close',(code,signal)=>{
    try {if(partial.trim())event(partial);write({stage:'model_process_close',code,signal,counts,stdoutSha256:hashes.stdout.digest('hex'),stderrSha256:hashes.stderr.digest('hex'),stderrClasses:messageClass(stderrPrefix),observerTruncated});}catch{write({stage:'observer_close_error'});}
  });
  return child; // Original child streams/events, no rewrite, kill, retry or environment change.
}
lifecycle.runModelProcess = async options => {
  write({stage:'original_run_model_process_start',timeout:options.timeout});
  try {const result=await originalRun({...options,spawnFn:observedSpawn});write({stage:'original_run_model_process_success',stdoutBytes:result.length});return result;}
  catch(e){write({stage:'original_run_model_process_rejected',exit:Number.isInteger(e.exit)?e.exit:null,code:typeof e.code==='string'?e.code:null});throw e;}
};
const {loadHostPins}=require(path.join(root,'scripts/model-runner-v3/hostPreflight'));
const {executeModel,prepareTransport}=require(path.join(root,'scripts/model-runner-v3/execution'));
const {routeOperation}=require(path.join(root,'scripts/model-runner-v3/routing'));
const {oracleRecoveryRoot,withOracleAttempt}=require(path.join(root,'scripts/model-runner-v3/oracleRecovery'));
async function diagnose() {
  const pins=loadHostPins(path.join(root,'.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json'));
  return withOracleAttempt(oracleRecoveryRoot(),async(attemptRoot,safety)=>{
    const operation='verify',directory=path.join(attemptRoot,operation);
    fs.mkdirSync(directory,{mode:0o700});const view=path.join(directory,'view'),scratch=path.join(directory,'scratch'),transport=path.join(directory,'transport');
    fs.mkdirSync(view,{mode:0o700});fs.mkdirSync(scratch,{mode:0o700});fs.writeFileSync(path.join(view,'tracked.txt'),'tracked\n',{mode:0o400});
    const source={view};prepareTransport({source,scratch,transport});const route=routeOperation(operation,'sol61-make-astra-review');
    const terminal={modelAttempt:'completed',operation};safety.processStarting();
    const result=await executeModel({onQuiescent:safety.quiescent,pins,source,scratch,transport,route,request:{protocol:'loop-model-v3.5',operation,role:'verifier',model:route.model,reasoningEffort:route.reasoningEffort,strategy:'sol61-make-astra-review',terraWaiver:null,task:`Do not call tools. Return exactly ${JSON.stringify(terminal)} as the final JSON object.`,acceptanceCriteria:['One exact JSON object and no tool call.']},timeout:90,terminalProtocol:'model-runner-oracle-v2'});
    if(JSON.stringify(result)!==JSON.stringify(terminal))throw Error('real model attempt returned an unexpected terminal object');
    return {verifyOnly:true,originalStrictTerminal:true,fullOracleAcceptance:false,protectedEnvelopeProduced:false};
  });
}
diagnose().then(result=>{write({stage:'diagnostic_verify_pass',...result});console.log(JSON.stringify(result));},e=>{
  const exit=Number.isInteger(e.exit)?e.exit:12;write({stage:'diagnostic_verify_failed',exit,code:typeof e.code==='string'?e.code:null,unexpectedTerminal:e.message==='real model attempt returned an unexpected terminal object'});
  console.log(JSON.stringify({verifyOnly:true,status:'failed',exit,fullOracleAcceptance:false,protectedEnvelopeProduced:false}));process.exitCode=exit;
});
