import {constants} from 'node:fs';
import {lstat,open,mkdir,mkdtemp,link,unlink,rmdir} from 'node:fs/promises';
import type {Stats} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {privateArtifactStore} from './private-artifact-store.ts';
import {restoreInsiderArchiveV2,validateInsiderArchiveBindingV2} from './insider-completed-archive-codec-v2.ts';

type Options={signal?:AbortSignal;timeoutMs?:number};
const fail=(code:string):never=>{throw Error(`insider_archive_${code}`);};
function guard(options:Options){const ms=options.timeoutMs??30000;if(!Number.isSafeInteger(ms)||ms<1||ms>30000)fail('deadline_invalid');const end=performance.now()+ms;return ()=>{if(options.signal?.aborted)fail('aborted');if(performance.now()>=end)fail('deadline');};}
function same(a:Stats,b:Stats){return a.dev===b.dev&&a.ino===b.ino;}
function privateDirectory(s:Stats){return s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid!()&&(s.mode&0o077)===0;}
async function rootIdentity(root:string){
 if(!path.isAbsolute(root)||root==='/'||path.resolve(root)!==root)fail('directory_invalid');
 let current=path.parse(root).root;
 for(const segment of root.slice(current.length).split(path.sep)){
  current=path.join(current,segment);const s=await lstat(current);
  if(!s.isDirectory()||s.isSymbolicLink()||(s.uid!==0&&s.uid!==process.getuid!())||((s.mode&0o022)!==0&&!(s.uid===0&&(s.mode&0o1000)!==0)))fail('directory_untrusted');
 }
 const stat=await lstat(root);if(!privateDirectory(stat))fail('directory_not_private');return stat;
}
async function directoryUnchanged(root:string,initial:Stats){const now=await rootIdentity(root);if(!same(initial,now))fail('directory_changed');}
async function shardIdentity(root:string,hash:string,create=false){
 const directory=path.join(root,hash.slice(0,2));if(create){try{await mkdir(directory,{mode:0o700});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}}
 const s=await lstat(directory);if(!privateDirectory(s))fail('directory_not_private');return {directory,stat:s,filename:path.join(directory,hash)};
}
async function readEncoded(root:string,hash:string,length:number,check:()=>void,sync=false):Promise<Buffer>{
 check();const initial=await rootIdentity(root);const shard=await shardIdentity(root,hash);check();
 // Never perform blocking O_RDONLY before descriptor classification: FIFO/device
 // paths must refuse promptly. Each allocation/read is capped at declared+1.
 const f=await open(shard.filename,constants.O_RDONLY|constants.O_NONBLOCK|constants.O_NOFOLLOW);
 let bytes:Buffer|undefined;
 try{
  const before=await f.stat();if(!before.isFile()||before.uid!==process.getuid!()||(before.mode&0o077)!==0||before.nlink<1||before.nlink>2||before.size!==length)fail('file_invalid');
  bytes=Buffer.alloc(length+1);let offset=0;
  while(offset<bytes.length){check();const {bytesRead}=await f.read(bytes,offset,Math.min(128*1024,bytes.length-offset),offset);if(!bytesRead)break;offset+=bytesRead;}
  if(offset!==length||createHash('sha256').update(bytes.subarray(0,length)).digest('hex')!==hash)fail('artifact_identity');
  if(sync){
   check();await f.sync();
   for(const [directory,expected] of [[shard.directory,shard.stat],[root,initial]] as const){
    const d=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{if(!same(await d.stat(),expected))fail('directory_changed');await d.sync();}finally{await d.close();}
   }
  }
  const after=await f.stat();const visible=await lstat(shard.filename);
  if(offset!==length||!same(before,after)||after.size!==before.size||after.ctimeMs!==before.ctimeMs||after.mtimeMs!==before.mtimeMs||!visible.isFile()||visible.isSymbolicLink()||!same(before,visible))fail('file_changed');
  await directoryUnchanged(root,initial);const sd=await lstat(shard.directory);if(!privateDirectory(sd)||!same(sd,shard.stat))fail('directory_changed');check();
  return bytes.subarray(0,length);
 }catch(error){bytes?.fill(0);throw error;}finally{await f.close();}
}
async function verifiedRaw(root:string,b:ReturnType<typeof validateInsiderArchiveBindingV2>,check:()=>void,sync=false){
 const bytes=await readEncoded(root,b.artifactSha256,b.artifactBytes,check,sync);
 try{check();const raw=await restoreInsiderArchiveV2(bytes,b,{check});try{check();return raw;}catch(error){raw.fill(0);throw error;}}finally{bytes.fill(0);}
}
/** Verified raw bytes only. No DB receipt, lease assertion or eviction permission. */
export async function readInsiderArchiveV2(root:string,value:unknown,options:Options={}):Promise<Buffer>{
 return verifiedRaw(root,validateInsiderArchiveBindingV2(value),guard(options));
}
/** Publish via the existing store in a fresh private staging directory, then
 * hard-link create-only into its normal hash layout and independently reopen.
 * Staging isolates legacy store reads from an existing adversarial final FIFO.
 * This standalone component has NO quota/DB/backend authority integration.
 * Failure retains private staging for explicit reconciliation; never erase
 * possibly needed evidence to disguise an uncertain publication outcome.
 */
export async function publishInsiderArchiveV2(root:string,input:Buffer,value:unknown,options:Options={}){
 const b=validateInsiderArchiveBindingV2(value);const check=guard(options);check();
 if(!Buffer.isBuffer(input)||input.length!==b.artifactBytes)fail('artifact_identity');
 const bytes=Buffer.from(input);let restored:Buffer|undefined;
 try{
  restored=await restoreInsiderArchiveV2(bytes,b,{check});restored.fill(0);check();
  const initial=await rootIdentity(root);const shard=await shardIdentity(root,b.artifactSha256,true);await directoryUnchanged(root,initial);check();
  let exists=false;try{await lstat(shard.filename);exists=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(exists){const raw=await verifiedRaw(root,b,check,true);raw.fill(0);await directoryUnchanged(root,initial);check();return {created:false,binding:b,evictionAuthorized:false as const};}
  const staging=await mkdtemp(path.join(root,'.insider-archive-v2-'));await directoryUnchanged(root,initial);check();
  // Existing helper retains its original contract; no shared code is modified.
  await privateArtifactStore(staging).put(b.artifactSha256,bytes);check();await directoryUnchanged(root,initial);
  const staged=await readEncoded(staging,b.artifactSha256,b.artifactBytes,check);try{const raw=await restoreInsiderArchiveV2(staged,b,{check});raw.fill(0);}finally{staged.fill(0);}
  const source=path.join(staging,b.artifactSha256.slice(0,2),b.artifactSha256);
  const currentShard=await lstat(shard.directory);if(!privateDirectory(currentShard)||!same(currentShard,shard.stat))fail('directory_changed');
  check();let created=false;try{await link(source,shard.filename);created=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  const raw=await verifiedRaw(root,b,check,true);raw.fill(0);await directoryUnchanged(root,initial);check();
  // Only this operation's known staged file/directories, after final verification.
  // Never recurse through a caller path or remove an existing final object.
  await unlink(source);await rmdir(path.dirname(source));await rmdir(staging);check();
  return {created,binding:b,evictionAuthorized:false as const};
 }finally{restored?.fill(0);bytes.fill(0);}
}
