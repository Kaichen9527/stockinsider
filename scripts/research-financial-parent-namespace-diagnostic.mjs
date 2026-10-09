import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
export const statShape=s=>Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs','mode'].map(k=>[k,String(s[k])]));
export function ancestorPaths(root,pins){const set=new Set();for(const pin of pins){const filename=path.join(root,pin.path);let current=path.parse(filename).root;for(const segment of filename.slice(current.length).split(path.sep).slice(0,-1)){current=path.join(current,segment);set.add(current);}}return [...set];}
export async function namespaceSnapshot(paths){return await Promise.all(paths.map(async p=>{try{return{path:p,...statShape(await fsp.lstat(p,{bigint:true}))};}catch(e){return{path:p,error:e.code};}}));}
export function changedAncestors(before,after){return before.filter((x,i)=>JSON.stringify(x)!==JSON.stringify(after[i])).map((x,i)=>({before:x,after:after.find(y=>y.path===x.path)}));}
export async function observeNamespace(paths,output){
 const events=[],changes=[],requests=[];
 let prior=await namespaceSnapshot(paths),polls=0,polling=false,stopped=false,failed=null,timer;
 const watchers=[],maximum=10000;
 const clock=()=>({at:new Date().toISOString(),monotonicMs:performance.now()});
 const halt=()=>{stopped=true;clearInterval(timer);for(const w of watchers)w.close();};
 const fail=reason=>{failed ||= reason;halt();};
 const append=(list,value)=>{
  if(stopped)return;
  if(events.length+changes.length>=maximum || requests.length>=maximum){fail('namespace_observation_bound');return;}
  list.push(value);
 };
 const sample=async reason=>{
  if(polling||stopped)return;
  polling=true;
  try{
   const next=await namespaceSnapshot(paths);
   if(stopped)return;
   const delta=changedAncestors(prior,next);polls++;
   if(delta.length){append(changes,{...clock(),reason,delta});prior=next;}
  }finally{polling=false;}
 };
 try{
  for(const p of paths){
   const watcher=fs.watch(p,{persistent:false},(kind,name)=>{
    if(stopped)return;
    append(events,{...clock(),path:p,kind,name:name===null?null:String(name),writerPid:null,writerAttribution:'fs.watch does not identify writer'});
    void sample('watch:'+p).catch(e=>fail(e.message));
   });
   watcher.on('error',e=>fail(e.message));watchers.push(watcher);
  }
  timer=setInterval(()=>void sample('20ms poll').catch(e=>fail(e.message)),20);timer.unref();
 }catch(error){halt();throw error;}
 return{
  requests,events,changes,
  async around(action,work){
   if(stopped)throw new Error(failed || 'namespace_observer_stopped');
   const before=await namespaceSnapshot(paths),started=clock();
   if(stopped)throw new Error(failed || 'namespace_observer_stopped');
   try{return await work();}
   finally{
    const after=await namespaceSnapshot(paths);
    append(requests,{action,started,completed:clock(),before,after,delta:changedAncestors(before,after)});
   }
  },
  async stop(){
   halt();while(polling)await new Promise(r=>setTimeout(r,1));
   const report={paths,events,changes,requests,polls,failed,observedByPid:process.pid,writerAttribution:'Only controlled writer operations have known PID; unsolicited namespace event writer remains unknown.'};
   let data=JSON.stringify(report,null,2)+'\n';
   if(Buffer.byteLength(data)>33554432){
    failed='namespace_observation_output_bound';
    // Preserve a small explicit failure receipt, never write an oversized report.
    data=JSON.stringify({paths,failed,eventCount:events.length,changeCount:changes.length,requestCount:requests.length,observedByPid:process.pid})+'\n';
   }
   fs.writeFileSync(output,data,{flag:'wx',mode:0o600});
   if(failed)throw new Error(failed);
   return report;
  }
 };
}
