import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {lstat,open,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const manifestPath='deployment/vps/research-runtime-files-v1.json';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function bounded(root,relative,limit) {
  assert.ok(path.isAbsolute(root)&&root===path.resolve(root));
  const parts=relative.split('/');assert.ok(parts.every(p=>p&&p!=='.'&&p!=='..'));
  let parent=root;
  for(const part of parts.slice(0,-1)){
    parent=path.join(parent,part);const stat=await lstat(parent);
    assert.ok(stat.isDirectory()&&!stat.isSymbolicLink(),'research_release_parent');
  }
  const handle=await open(path.join(root,relative),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const before=await handle.stat({bigint:true});assert.ok(before.isFile()&&before.size>0n&&before.size<=BigInt(limit),'research_release_file_bound');
    const buffer=Buffer.alloc(Number(before.size)+1);let offset=0;
    while(offset<buffer.length){const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}
    const after=await handle.stat({bigint:true});
    assert.ok(BigInt(offset)===before.size&&after.size===before.size&&after.mtimeNs===before.mtimeNs&&after.ctimeNs===before.ctimeNs,'research_release_file_changed');
    return buffer.subarray(0,offset);
  }finally{await handle.close();}
}

/** Packaging only. The caller binds a clean source commit; the checked-in pins
 * are immutable release inputs, not model/source authority or financial facts. */
export async function copyResearchRuntimeFiles({sourceRoot,releaseRoot,entrypointDirectory}) {
  for(const p of [sourceRoot,releaseRoot,entrypointDirectory])assert.ok(path.isAbsolute(p)&&p===path.resolve(p));
  const artifactRoot=path.dirname(entrypointDirectory);
  assert.ok(artifactRoot===releaseRoot||artifactRoot.startsWith(releaseRoot+path.sep),'research_release_layout');
  const sourceStat=await lstat(sourceRoot);assert.ok(sourceStat.isDirectory()&&!sourceStat.isSymbolicLink(),'research_release_source_root');
  // Historical releases and original minimal packager fixtures lack this feature.
  const exists=async p=>lstat(path.join(sourceRoot,p)).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
  if(!await exists('web/src/lib/research-complete-input.ts')&&!await exists('web/src/lib/research-working-draft-loader.ts'))return {included:false,files:[],bytes:0};
  const manifest=JSON.parse((await bounded(sourceRoot,manifestPath,32768)).toString('utf8'));
  assert.equal(Object.keys(manifest).sort().join(','),'files,schemaVersion');assert.equal(manifest.schemaVersion,'research-runtime-files-v1');
  assert.ok(Array.isArray(manifest.files)&&manifest.files.length===20,'research_release_inventory');
  const seen=new Set(),pending=[];let total=0;
  for(const pin of manifest.files){
    assert.equal(Object.keys(pin).sort().join(','),'bytes,path,sha256');
    assert.ok(/^docs\/research\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/u.test(pin.path)&&!seen.has(pin.path),'research_release_path');seen.add(pin.path);
    assert.ok(Number.isSafeInteger(pin.bytes)&&pin.bytes>0&&pin.bytes<=524288&&/^[a-f0-9]{64}$/u.test(pin.sha256));
    const bytes=await bounded(sourceRoot,pin.path,524288);assert.equal(bytes.length,pin.bytes);assert.equal(digest(bytes),pin.sha256,'research_release_hash');
    total+=bytes.length;assert.ok(total<=2097152,'research_release_aggregate');pending.push({pin,bytes});
  }
  // Validate every source before creating output. New release root is caller-owned.
  const rootStat=await lstat(releaseRoot);assert.ok(rootStat.isDirectory()&&!rootStat.isSymbolicLink());
  let outputParent=releaseRoot;
  for(const part of path.relative(releaseRoot,artifactRoot).split(path.sep).filter(Boolean)){
    outputParent=path.join(outputParent,part);const stat=await lstat(outputParent);
    assert.ok(stat.isDirectory()&&!stat.isSymbolicLink(),'research_release_output_parent');
  }
  for(const {pin,bytes}of pending){
    const parts=pin.path.split('/');let parent=artifactRoot;
    for(const part of parts.slice(0,-1)){parent=path.join(parent,part);await mkdir(parent,{recursive:false}).catch(error=>{if(error.code!=='EEXIST')throw error;});const stat=await lstat(parent);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink(),'research_release_output_parent');}
    await writeFile(path.join(artifactRoot,pin.path),bytes,{flag:'wx',mode:0o644});
  }
  return {included:true,files:manifest.files,bytes:total};
}
