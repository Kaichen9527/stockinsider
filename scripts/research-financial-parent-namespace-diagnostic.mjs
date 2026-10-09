import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
export const statShape=s=>Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs','mode'].map(k=>[k,String(s[k])]));
export function ancestorPaths(root,pins){const set=new Set();for(const pin of pins){const filename=path.join(root,pin.path);let current=path.parse(filename).root;for(const segment of filename.slice(current.length).split(path.sep).slice(0,-1)){current=path.join(current,segment);set.add(current);}}return [...set];}
export async function namespaceSnapshot(paths){return await Promise.all(paths.map(async p=>{try{return{path:p,...statShape(await fsp.lstat(p,{bigint:true}))};}catch(e){return{path:p,error:e.code};}}));}
export function changedAncestors(before,after){return before.filter((x,i)=>JSON.stringify(x)!==JSON.stringify(after[i])).map((x,i)=>({before:x,after:after.find(y=>y.path===x.path)}));}
export async function observeNamespace(paths,output){
 const events=[],changes=[],requests=[];let prior=await namespaceSnapshot(paths),polls=0,polling=false,stopped=false;const watchers=[];let failed=null;
 const clock=()=>({at:new Date().toISOString(),monotonicMs:performance.now()});
 const sample=async reason=>{if(polling||stopped)return;polling=true;try{const next=await namespaceSnapshot(paths),delta=changedAncestors(prior,next);polls++;if(delta.length){changes.push({...clock(),reason,delta});prior=next;}if(events.length+changes.length>10000)failed='namespace_observation_bound';}finally{polling=false;}};
 for(const p of paths){const watcher=fs.watch(p,{persistent:false},(kind,name)=>{events.push({...clock(),path:p,kind,name:name===null?null:String(name),writerPid:null,writerAttribution:'fs.watch does not identify writer'});void sample('watch:'+p).catch(e=>{failed=e.message;});});watchers.push(watcher);}
 const timer=setInterval(()=>void sample('20ms poll').catch(e=>{failed=e.message;}),20);timer.unref();
 return{requests,events,changes,async around(action,work){const before=await namespaceSnapshot(paths),started=clock();try{return await work();}finally{const after=await namespaceSnapshot(paths);requests.push({action,started,completed:clock(),before,after,delta:changedAncestors(before,after)});}},async stop(){stopped=true;clearInterval(timer);for(const w of watchers)w.close();while(polling)await new Promise(r=>setTimeout(r,1));const report={paths,events,changes,requests,polls,failed,observedByPid:process.pid,writerAttribution:'Only controlled writer operations have known PID; unsolicited namespace event writer remains unknown.'};const data=JSON.stringify(report,null,2)+'\n';if(Buffer.byteLength(data)>33554432)throw new Error('namespace_observation_output_bound');fs.writeFileSync(output,data,{flag:'wx',mode:0o600});return report;}};
}
