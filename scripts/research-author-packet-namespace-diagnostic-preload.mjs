// Diagnostic-only observation; no request/body/credential values or runtime mutation.
import fs from 'node:fs';
import path from 'node:path';
const out=process.env.RESEARCH_NAMESPACE_DIAGNOSTIC_ARTIFACTS;
if(!out||!path.isAbsolute(out)||!fs.statSync(out).isDirectory())throw Error('precreated diagnostic artifact directory required');
const root=process.cwd(),pins=JSON.parse(fs.readFileSync(root+'/openspec/changes/research-first-publication-v2/financial-adapter-files.json','utf8'));
const parents=new Set(['/','/workspace',root,root+'/docs',root+'/docs/research']);
// Public input namespace names only; metadata, never file contents.
for(const company of Object.values(pins.companies||{}))for(const pin of company){let current=path.dirname(path.join(root,pin.path));while(current.startsWith(root)){parents.add(current);if(current===root)break;current=path.dirname(current);}}
function stat(name){try{const s=fs.lstatSync(name,{bigint:true});return {dev:String(s.dev),ino:String(s.ino),size:String(s.size),mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs),directory:s.isDirectory(),symlink:s.isSymbolicLink()};}catch(e){return {error:e.code};}}
const logfile=path.join(out,`namespace-observations-${process.pid}.jsonl`),fd=fs.openSync(logfile,'wx',0o600);let total=0;
const emit=data=>{const line=JSON.stringify({clock:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString(),pid:process.pid,...data})+'\n';total+=Buffer.byteLength(line);if(total>1048576)throw Error('diagnostic observation cap');fs.writeSync(fd,line);};
const watchers=[];
for(const name of parents){emit({kind:'initial',path:name,stat:stat(name)});try{watchers.push(fs.watch(name,{persistent:false},(event,filename)=>emit({kind:'filesystem_event',path:name,event,filename:filename===null?null:String(filename),stat:stat(name),writer:'unknown_pending_syscall_correlation'})));}catch(error){emit({kind:'watch_unavailable',path:name,error:error.code});}}
const realFetch=globalThis.fetch;let n=0;
globalThis.fetch=async(url,options)=>{let action;try{action=typeof options?.body==='string'?JSON.parse(options.body).action:null;}catch{}if(!['financialSupplement','sealResearchInput','readAuthorPacket'].includes(action))return realFetch(url,options);const id=++n;emit({kind:'request_start',requestId:id,action,parentStats:[...parents].map(name=>({path:name,stat:stat(name)}))});try{const response=await realFetch(url,options);emit({kind:'request_end',requestId:id,action,status:response.status,parentStats:[...parents].map(name=>({path:name,stat:stat(name)}))});return response;}catch(error){emit({kind:'request_error',requestId:id,action,errorClass:error.name});throw error;}};
process.on('exit',()=>{for(const watcher of watchers)watcher.close();emit({kind:'observer_exit',bytesBeforeFinal:total});fs.closeSync(fd);});
