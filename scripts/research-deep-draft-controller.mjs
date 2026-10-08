import { open, lstat, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';
import { buildPrivateDeepDraft, privateDraftEligibility } from '../web/src/lib/research-deep-draft.ts';

const MAX=2*1024*1024;
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
async function plainPath(filename) {
  if(!path.isAbsolute(filename) || path.resolve(filename)!==filename) throw new Error('deep_draft_absolute_path_required');
  const pieces=filename.split(path.sep).filter(Boolean);let current=path.parse(filename).root;
  for(const piece of pieces) {
    current=path.join(current,piece);
    try {if((await lstat(current)).isSymbolicLink()) throw new Error('deep_draft_symlink_rejected');}
    catch(error) {if(error.code==='ENOENT' && current===filename) return;throw error;}
  }
}
async function privateDirectory(dirname) {
  await plainPath(dirname);const s=await lstat(dirname);
  if(!s.isDirectory() || s.uid!==process.getuid() || s.mode&0o077) throw new Error('deep_draft_private_directory_required');
}
async function directorySync(dirname) {
  const fd=await open(dirname,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try {await fd.sync();} finally {await fd.close();}
}
/** No-follow all components, finite reads, stable inode/size/ctime, single link. */
export async function readPrivateDraftFile(filename,max=MAX) {
  await plainPath(filename);
  const fd=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const before=await fd.stat({bigint:true});
    if(!before.isFile() || before.uid!==BigInt(process.getuid()) || before.nlink!==1n
      || before.mode&0o077n || before.mode&0o111n || before.size<1n || before.size>BigInt(max)) throw new Error('deep_draft_input_bounds_or_permissions');
    const raw=Buffer.alloc(Number(before.size));let offset=0;
    while(offset<raw.length) {const read=await fd.read(raw,offset,raw.length-offset,offset);if(!read.bytesRead) break;offset+=read.bytesRead;}
    const extra=await fd.read(Buffer.alloc(1),0,1,raw.length),after=await fd.stat({bigint:true}),named=await lstat(filename,{bigint:true});
    const identity=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode,s.nlink].join(':');
    if(offset!==raw.length || extra.bytesRead || identity(before)!==identity(after) || identity(before)!==identity(named)
      || raw.at(-1)!==10) throw new Error('deep_draft_input_changed_or_incomplete');
    new TextDecoder('utf-8',{fatal:true}).decode(raw);
    return {raw,identity:identity(before)};
  } finally {await fd.close();}
}
async function writePrivate(dirname,name,raw) {
  const fd=await open(path.join(dirname,name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try {await fd.writeFile(raw);await fd.sync();} finally {await fd.close();}
}
async function loadCommitted(dirname,expectedHash) {
  await privateDirectory(dirname);
  const commit=JSON.parse((await readPrivateDraftFile(path.join(dirname,'commit.json'))).raw);
  const {receiptHash,...material}=commit;
  if(Object.keys(commit).sort().join(',')!=='acceptedAt,controllerSourceCommit,files,receiptHash,schemaVersion'
    || !/^[a-f0-9]{40}$/u.test(commit.controllerSourceCommit || '')
    || commit.schemaVersion!=='research-deep-draft-commit-v1' || receiptHash!==researchCanonicalHash(material)
    || expectedHash && receiptHash!==expectedHash
    || !Array.isArray(commit.files) || commit.files.map(f=>f.name).join(',')!=='prepared-input.json,model-output.json,original-claim.jsonl,draft.json,handoff.json')
    throw new Error('deep_draft_commit_invalid');
  const files={};
  for(const entry of commit.files) {
    if(Object.keys(entry).sort().join(',')!=='bytes,name,sha256' || !Number.isInteger(entry.bytes)
      || entry.bytes<1 || entry.bytes>MAX || !/^[a-f0-9]{64}$/u.test(entry.sha256 || '')) throw new Error('deep_draft_commit_invalid');
    const read=await readPrivateDraftFile(path.join(dirname,entry.name));
    if(read.raw.length!==entry.bytes || sha(read.raw)!==entry.sha256) throw new Error('deep_draft_artifact_hash_mismatch');
    files[entry.name]=read;
  }
  return {commit,files};
}
function parseFlags(action,tail) {
  const names=action==='draft' ? ['--origin','--owner','--request-journal','--prepared-input','--prepared-hash','--model-output','--output']
    : ['--output','--receipt-hash'];
  if(tail.length!==names.length*2) throw new Error('deep_draft_arguments_invalid');
  const flags=new Map();for(let i=0;i<tail.length;i+=2) {
    if(!names.includes(tail[i]) || flags.has(tail[i])) throw new Error('deep_draft_arguments_invalid');flags.set(tail[i],tail[i+1]);
  }
  return flags;
}
export async function privateDraftCommand(args,{source,now,recoverOriginal,checkpoint=async()=>{}}) {
  const [action,...tail]=args,flags=parseFlags(action,tail),out=flags.get('--output');
  if(action==='draft') {
    const origin=new URL(flags.get('--origin'));
    if(origin.username || origin.password || origin.search || origin.hash || origin.pathname!=='/'
      || (origin.protocol!=='https:' && !(origin.protocol==='http:' && origin.hostname==='127.0.0.1')))
      throw new Error('deep_draft_origin_invalid');
    flags.set('--origin',origin.href);
  }
  if(source.dirty || !/^[a-f0-9]{40}$/u.test(source.commit)) throw new Error('deep_draft_clean_source_required');
  await plainPath(out);
  const rebuild=async(files,controllerSourceCommit,acceptedAt)=>{
    const prepared=JSON.parse(files['prepared-input.json'].raw);
    const original=await recoverOriginal(path.join(out,'original-claim.jsonl'),flags.get('--owner'),flags.get('--origin'),prepared.sourceCommit);
    return buildPrivateDeepDraft({prepared,model:JSON.parse(files['model-output.json'].raw),expectedPreparedHash:prepared.receiptHash,
      original,controllerSourceCommit,now:acceptedAt});
  };
  if(action==='inspectDraft') {
    if(!/^[a-f0-9]{64}$/u.test(flags.get('--receipt-hash') || '')) throw new Error('deep_draft_receipt_hash_required');
    const saved=await loadCommitted(out,flags.get('--receipt-hash'));
    // Original worker/origin come from the hashed private journal, never model text.
    const first=JSON.parse(saved.files['original-claim.jsonl'].raw.toString().split('\n')[0]);
    flags.set('--owner',first.request.workerOwner);flags.set('--origin',first.request.origin);
    const draft=await rebuild(saved.files,saved.commit.controllerSourceCommit,saved.commit.acceptedAt);
    if(!encode(draft).equals(saved.files['draft.json'].raw) || !encode(draft.handoff).equals(saved.files['handoff.json'].raw))
      throw new Error('deep_draft_rebuild_mismatch');
    return {receiptHash:saved.commit.receiptHash,draftPersisted:true,replayed:true,
      ...privateDraftEligibility(draft,now())};
  }
  if(action!=='draft' || !/^[a-f0-9]{64}$/u.test(flags.get('--prepared-hash') || '')) throw new Error('deep_draft_arguments_invalid');
  const names=['--prepared-input','--model-output','--request-journal'];
  const paths=names.map(n=>flags.get(n));
  if(new Set(paths).size!==paths.length || paths.some(p=>p===out || p.startsWith(out+path.sep))) throw new Error('deep_draft_distinct_paths_required');
  await privateDirectory(path.dirname(out));
  const reads=await Promise.all(paths.map((p,i)=>readPrivateDraftFile(p,i===2 ? 131072 : MAX)));
  const prepared=JSON.parse(reads[0].raw),model=JSON.parse(reads[1].raw);
  const original=await recoverOriginal(paths[2],flags.get('--owner'),flags.get('--origin'),prepared.sourceCommit);
  const draft=buildPrivateDeepDraft({prepared,model,expectedPreparedHash:flags.get('--prepared-hash'),original,
    controllerSourceCommit:source.commit,now:now()});
  const raws=[reads[0].raw,reads[1].raw,reads[2].raw,encode(draft),encode(draft.handoff)];
  const filenames=['prepared-input.json','model-output.json','original-claim.jsonl','draft.json','handoff.json'];
  try {await mkdir(out,{mode:0o700});}
  catch(error) {
    if(error.code!=='EEXIST') throw error;
    const saved=await loadCommitted(out);
    if(names.some((_,i)=>!saved.files[filenames[i]].raw.equals(reads[i].raw))) throw new Error('deep_draft_replay_mismatch');
    const previous=await rebuild(saved.files,saved.commit.controllerSourceCommit,saved.commit.acceptedAt);
    if(!encode(previous).equals(saved.files['draft.json'].raw) || !encode(previous.handoff).equals(saved.files['handoff.json'].raw))
      throw new Error('deep_draft_rebuild_mismatch');
    return {receiptHash:saved.commit.receiptHash,draftPersisted:true,replayed:true,...privateDraftEligibility(previous,now())};
  }
  await directorySync(path.dirname(out));
  for(let i=0;i<filenames.length;i++) {await writePrivate(out,filenames[i],raws[i]);await checkpoint(filenames[i]);}
  // Detect producer rewrites between initial read and durable commit.
  for(let i=0;i<paths.length;i++) {
    const fresh=await readPrivateDraftFile(paths[i],i===2 ? 131072 : MAX);
    if(fresh.identity!==reads[i].identity || !fresh.raw.equals(reads[i].raw)) throw new Error('deep_draft_producer_changed');
  }
  const material={schemaVersion:'research-deep-draft-commit-v1',controllerSourceCommit:source.commit,acceptedAt:draft.acceptedAt,
    files:filenames.map((name,i)=>({name,bytes:raws[i].length,sha256:sha(raws[i])}))};
  const commit={...material,receiptHash:researchCanonicalHash(material)};
  await directorySync(out);await checkpoint('before_commit');
  await writePrivate(out,'commit.json',encode(commit));await directorySync(out);await directorySync(path.dirname(out));
  return {receiptHash:commit.receiptHash,draftPersisted:true,replayed:false,...privateDraftEligibility(draft,now())};
}
