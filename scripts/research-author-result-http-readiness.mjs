import {performance} from 'node:perf_hooks';

// Test harness only. Never retry a business request on an arbitrary rejection.
// The existing harness RPC enforces its own 15-second request timeout. Three
// probes plus two 100ms pauses are bounded to 45.2s; no abandoned Promise race.
export async function waitForResearchReadiness(probe,{name,ready,attempts,maxCalls=3,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>3)throw new Error('readiness_calls_invalid');
 const start=performance.now();
 for(let n=0;n<maxCalls;n++){
  const response=await probe();
  const body=await response.json();
  const attempt={name,attempt:n+1,status:response.status,body,elapsedMs:performance.now()-start};
  attempts.push(attempt);
  if(ready(attempt))return;
  const startup=(response.status===503&&['PGRST000','PGRST001','PGRST002'].includes(body?.code))
   ||(response.status===503&&body?.code==='57P01'&&body.message==='terminating connection due to administrator command')
   ||(response.status===404&&body?.code==='PGRST202'&&String(body.message).includes(name));
  if(!startup)throw new Error('readiness_unexpected_response: '+JSON.stringify(attempt));
  if(n+1<maxCalls)await pause(100);
 }
 throw new Error('readiness_exhausted: '+JSON.stringify(attempts));
}

export async function readAfterResearchReadiness(probe,request,options){
 await waitForResearchReadiness(probe,options);
 return request();
}
