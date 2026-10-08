import {constants} from 'node:fs';
import {open,mkdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {continueInsiderSnapshots} from './research-insider-continuation.mjs';

const MAX=32768;
async function input(filename){
 if(!path.isAbsolute(filename||''))throw Error('insider_command_absolute_input');
 const f=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const before=await f.stat();if(!before.isFile()||before.size>MAX)throw Error('insider_command_input_bound');const bytes=await f.readFile();const after=await f.stat();if(bytes.length!==before.size||before.ctimeMs!==after.ctimeMs||before.ino!==after.ino)throw Error('insider_command_input_changed');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}finally{await f.close();}
}
function origin(raw){const u=new URL(raw);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||Number(u.port)<1024||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('insider_command_loopback_required');return u;}
export async function insiderGuardedPost(url,body,key,{signal},transport=fetch){
 const response=await transport(url,{method:'POST',redirect:'error',signal,headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(body)});
 if(response.redirected||![200,502].includes(response.status)){await response.body?.cancel();throw Error('insider_command_http_rejected');}
 if(!response.body||Number(response.headers.get('content-length'))>MAX){await response.body?.cancel();throw Error('insider_command_response_bound');}
 const reader=response.body.getReader();const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX)throw Error('insider_command_response_bound');chunks.push(value);}}
 finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
 return {status:response.status,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))};
}
/** Explicit development loopback adapter, never a production endpoint override.
 * Each invocation owns a new private journal directory. To resume after bounded
 * stop/crash, pass the original immutable input or a prior journal's request,
 * with a NEW journal directory; DB reconstructs only that run's pinned map.
 */
export async function insiderContinuationCommand(args,{env=process.env,post=insiderGuardedPost}={}){
 if(args.length!==6)throw Error('insider_command_arguments');const flags=new Map();for(let i=0;i<args.length;i+=2){if(!['--input','--origin','--journal'].includes(args[i])||flags.has(args[i]))throw Error('insider_command_arguments');flags.set(args[i],args[i+1]);}
 const base=origin(flags.get('--origin'));const journal=flags.get('--journal');if(!path.isAbsolute(journal||''))throw Error('insider_command_absolute_journal');
 const key=env.INTERNAL_API_KEY;if(typeof key!=='string'||key.length<16||/\s/u.test(key)||[env.CRON_SECRET,env.RESEARCH_REVIEW_KEY,env.STRATEGY_APPROVAL_KEY].includes(key))throw Error('insider_command_distinct_internal_key');
 const value=await input(flags.get('--input'));const request=value.schema==='insider_continuation_journal_v1'?value.request:value;
 // Fresh directory only. No uncertain journal is silently retried/overwritten.
 await mkdir(journal,{mode:0o700});const directory=await open(journal,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{
  const identity=await directory.stat();if(identity.mode&0o077)throw Error('insider_command_journal_permissions');
  // Linux FD anchoring follows the existing VM private-journal convention.
  const anchor=`/proc/self/fd/${directory.fd}`;let sequence=0;
  const saveJournal=async value=>{
   const visible=await lstat(journal);if(visible.isSymbolicLink()||visible.ino!==identity.ino||visible.dev!==identity.dev)throw Error('insider_command_journal_changed');
   const bytes=JSON.stringify(value)+'\n';if(Buffer.byteLength(bytes)>MAX||sequence>101)throw Error('insider_command_journal_bound');
   const f=await open(path.join(anchor,`${String(sequence++).padStart(3,'0')}.json`),'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}await directory.sync();
  };
  return await continueInsiderSnapshots(request,{saveJournal,invoke:(body,options)=>post(new URL('/api/internal/source-sync',base),body,key,options)});
 }finally{await directory.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await insiderContinuationCommand(process.argv.slice(2));console.log(JSON.stringify({stopped:result.stopped,runId:result.request.runId,invocations:result.invocations,remainingRows:result.progress?.remainingRows??null,production:false}));}
 catch{console.error(JSON.stringify({ok:false,error:'insider_continuation_stopped',note:'No automatic retry. Preserve the private journal and explicitly resume the same run.'}));process.exitCode=1;}
}
