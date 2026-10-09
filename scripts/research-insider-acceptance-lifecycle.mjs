import {performance} from 'node:perf_hooks';

/** Test-only lifecycle. A receipt is positive only after every named check and
 * confirmed cleanup. Abort locks a negative outcome even if late work resolves. */
export function insiderAcceptanceLifecycle({signal,timeoutMs,requiredChecks,cleanupTimeoutMs=8000}) {
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||new Set(requiredChecks).size!==requiredChecks.length)throw Error('acceptance_configuration');
 const controller=new AbortController();const deadline=performance.now()+timeoutMs;
 const outcomes=Object.fromEntries(requiredChecks.map(name=>[name,'pending']));
 const resources=[];const pending=new Set();let failure=null,closing=null,cleaned=false;
 const fail=reason=>{failure??=reason instanceof Error?reason:Error(String(reason));if(!controller.signal.aborted)controller.abort(failure);};
 const remaining=()=>{const value=Math.ceil(deadline-performance.now());if(value<=0)fail(Error('acceptance_hard_deadline'));if(controller.signal.aborted)throw controller.signal.reason;return value;};
 const close=()=>{
  if(closing)return closing;
  closing=(async()=>{
   let timer;try{
    const work=async()=>{
     const results=await Promise.allSettled(resources.map(cleanup=>cleanup()));
     for(const result of results)if(result.status==='rejected')throw result.reason;
     await Promise.allSettled([...pending]);cleaned=true;
    };
    await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('acceptance_cleanup_deadline')),cleanupTimeoutMs);})]);
   }catch(error){fail(error);}finally{clearTimeout(timer);}
  })();return closing;
 };
 const cancel=reason=>{fail(reason);void close();};
 const onAbort=()=>cancel(signal.reason??Error('acceptance_cancelled'));
 const timer=setTimeout(()=>cancel(Error('acceptance_hard_deadline')),timeoutMs);
 signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();
 async function run(operation){
  remaining();const promise=Promise.resolve().then(()=>{remaining();return operation(controller.signal);});pending.add(promise);
  let onCancel;try{return await Promise.race([promise,new Promise((_,reject)=>{onCancel=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',onCancel,{once:true});if(controller.signal.aborted)onCancel();})]);}
  finally{controller.signal.removeEventListener('abort',onCancel);void promise.finally(()=>pending.delete(promise)).catch(()=>{});}
 }
 return {
  signal:controller.signal,remaining,cancel,run,
  addCleanup(cleanup){if(closing)throw Error('acceptance_resource_after_cleanup');resources.push(cleanup);},
  async check(name,operation){if(outcomes[name]!=='pending')throw Error('acceptance_unknown_or_duplicate_check');outcomes[name]='running';try{await run(operation);remaining();outcomes[name]='passed';}catch(error){outcomes[name]='failed';fail(error);throw error;}},
  boundedLog(limit=1024*1024){const chunks=[];let bytes=0;return {chunks,append(chunk){const b=Buffer.from(chunk);if(bytes+b.length>limit){cancel(Error('acceptance_log_bound'));return;}bytes+=b.length;chunks.push(b.toString());}};},
  async finish(){
   if(!failure&&performance.now()>=deadline)fail(Error('acceptance_hard_deadline'));
   if(!failure&&Object.values(outcomes).some(value=>value!=='passed'))fail(Error('acceptance_required_check_not_passed'));
   // Stop any still-running I/O before cleanup; this internal abort cannot turn
   // an incomplete check into a success, and is not itself an external failure.
   if(!controller.signal.aborted)controller.abort(Error('acceptance_finished'));
   await close();
   clearTimeout(timer);signal?.removeEventListener('abort',onAbort);
   return {passed:failure===null&&cleaned&&Object.values(outcomes).every(value=>value==='passed'),checks:{...outcomes},cleanupComplete:cleaned,failure:failure?.message??null};
  },
 };
}

/** Only signal the still-live ChildProcess object owned by this fixture. */
export async function stopInsiderAcceptanceChild(child,{graceMs=1000,killMs=2000}={}) {
 if(!child)return;
 if(!child.insiderCloseReceipt)throw Error('acceptance_child_untracked');
 if(child.insiderCloseReceipt.closed)return;
 const wait=async ms=>{let timer;try{return await Promise.race([child.insiderCloseReceipt.promise.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),ms);})]);}finally{clearTimeout(timer);}};
 if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
 if(await wait(graceMs))return;
 if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
 if(await wait(killMs))return;
 child.stdout?.destroy();child.stderr?.destroy();
 throw Error('acceptance_child_close_unconfirmed');
}
export function trackInsiderAcceptanceChild(child){
 const receipt={closed:false,promise:null};receipt.promise=new Promise(resolve=>child.once('close',()=>{receipt.closed=true;resolve();}));child.insiderCloseReceipt=receipt;return child;
}
