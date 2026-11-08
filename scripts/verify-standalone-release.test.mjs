/** Structural source fixtures only: no Next server, production bundle or rollback. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chmod,link,mkdir,mkdtemp,readFile,realpath,rename,rm,symlink,truncate,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyStandaloneRelease,MAX_STANDALONE_MANIFEST_BYTES,MAX_STANDALONE_FILES,MAX_STANDALONE_TREE_MEMBERS} from './verify-standalone-release.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const verifier=fileURLToPath(new URL('./verify-standalone-release.mjs',import.meta.url));
async function receipt(fixture,change=()=>{}){
 const manifest=structuredClone(fixture.manifest);change(manifest);
 await writeFile(path.join(fixture.release,'release-manifest.json'),JSON.stringify({manifest,manifestSha256:digest(JSON.stringify(manifest))}),{mode:0o644});
 await chmod(path.join(fixture.release,'release-manifest.json'),0o644);
 return manifest;
}
async function fixture(t,nested=false){
 const parent=await mkdtemp(path.join(await realpath(tmpdir()),'standalone-structural-fixture-'));
 t.after(()=>rm(parent,{recursive:true,force:true}));
 const sourceCommit='a'.repeat(40),release=path.join(parent,sourceCommit),app=nested?'app/project/web':'app';
 const contents={
  [app+'/server.js']:'// structural fixture; never executed',
  [app+'/.next/BUILD_ID']:'synthetic_build_id',
  [app+'/.next/static/chunks/fixture.js']:'synthetic_static',
  [app+'/node_modules/next/package.json']:'{"name":"next","version":"synthetic"}',
 };
 const files=[];
 for(const [name,body] of Object.entries(contents)){
  await mkdir(path.dirname(path.join(release,name)),{recursive:true});await writeFile(path.join(release,name),body,{mode:0o644});
  // Fixture manifest declares0644; create mode alone is narrowed by VM umask.
  await chmod(path.join(release,name),0o644);
  files.push({path:name,bytes:Buffer.byteLength(body),mode:0o644,sha256:digest(body)});
 }
 const result={parent,release,manifest:{schema:'stockinsider-standalone-release-v2',releaseId:sourceCommit,sourceCommit,packagerCommit:'b'.repeat(40),createdAt:'2026-11-08T00:00:00Z',
  entrypoint:app+'/server.js',fileCount:files.length,bytes:files.reduce((sum,file)=>sum+file.bytes,0),files}};
 await receipt(result);return result;
}
test('unchanged V2 schema accepts root/nested app layout and physical release alias, structurally only',async t=>{
 for(const nested of [false,true]){
  const f=await fixture(t,nested),result=await verifyStandaloneRelease(f.release);
  assert.equal(result.releaseVerified,true);assert.equal(result.sourceCommit,'a'.repeat(40));assert.equal(result.entrypoint,f.manifest.entrypoint);
  assert.deepEqual(Object.keys(result).sort(),['releaseVerified','releaseId','sourceCommit','packagerCommit','manifestSha256','bytes','entrypoint'].sort());
  const alias=path.join(f.parent,'current');await symlink(f.release,alias);assert.deepEqual(await verifyStandaloneRelease(alias),result);
 }
});
test('entrypoint cannot escape, bypass manifest membership, or name an internal Next/dependency script',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.parent,'outside.js'),'NONEXECUTED structural fixture');
 for(const entrypoint of ['../outside.js','app/../../outside.js','/outside.js','app\\server.js','app/./server.js','app//server.js','app/nonmember/server.js','scripts/server.js',null]){
  await receipt(f,m=>{m.entrypoint=entrypoint;});await assert.rejects(verifyStandaloneRelease(f.release),/release_entrypoint_invalid/);
 }
 for(const folder of ['node_modules/next','.next/server']){
  await receipt(f,m=>{m.files.push({...m.files[0],path:`app/${folder}/server.js`});m.fileCount++;m.bytes+=m.files[0].bytes;m.entrypoint=`app/${folder}/server.js`;});
  await assert.rejects(verifyStandaloneRelease(f.release),/release_entrypoint_invalid/);
 }
});
test('manifest final-component symlink and multiply linked manifest are rejected before parsing',async t=>{
 const linked=await fixture(t),original=path.join(linked.parent,'manifest-copy.json');
 await rename(path.join(linked.release,'release-manifest.json'),original);await symlink(original,path.join(linked.release,'release-manifest.json'));
 await assert.rejects(verifyStandaloneRelease(linked.release),/release_manifest_file_invalid/);
 const hard=await fixture(t);await link(path.join(hard.release,'release-manifest.json'),path.join(hard.parent,'manifest-hard-copy.json'));
 await assert.rejects(verifyStandaloneRelease(hard.release),/release_manifest_file_invalid/);
 const privileged=await fixture(t);for(const mode of [0o4755,0o2755,0o1755]){
  await chmod(path.join(privileged.release,'release-manifest.json'),mode);await assert.rejects(verifyStandaloneRelease(privileged.release),/release_manifest_file_invalid/);
 }
});
test('manifest is bounded and regular before bytes are parsed; oversized member inventory is bounded',async t=>{
 assert.equal(MAX_STANDALONE_MANIFEST_BYTES,16*1024**2);assert.equal(MAX_STANDALONE_FILES,100000);assert.equal(MAX_STANDALONE_TREE_MEMBERS,200000);
 const oversized=await fixture(t);await truncate(path.join(oversized.release,'release-manifest.json'),MAX_STANDALONE_MANIFEST_BYTES+1);
 await assert.rejects(verifyStandaloneRelease(oversized.release),/release_manifest_file_invalid/);
 const directory=await fixture(t);await rm(path.join(directory.release,'release-manifest.json'));await mkdir(path.join(directory.release,'release-manifest.json'));
 await assert.rejects(verifyStandaloneRelease(directory.release),/release_manifest_file_invalid/);
 const inventory=await fixture(t);await receipt(inventory,m=>{m.files=Array.from({length:MAX_STANDALONE_FILES+1},()=>({}));m.fileCount=m.files.length;m.bytes=0;});
 await assert.rejects(verifyStandaloneRelease(inventory.release),/release_manifest_invalid/);
});
test('self-consistent manifest hashes do not excuse forbidden env/backup components or unsafe paths',async t=>{
 const f=await fixture(t);
 for(const name of ['app/.env','app/.env.production','app/.ENV.example','app/backup/item','app/BACKUP/item','../escape','app\\escape','app/./escape','app/\u0000escape','app/line\nescape']){
  await receipt(f,m=>{m.files[0].path=name;});await assert.rejects(verifyStandaloneRelease(f.release),/release_member_path_or_metadata_invalid/);
 }
 await receipt(f);await mkdir(path.join(f.release,'app','backup'));await assert.rejects(verifyStandaloneRelease(f.release),/release_member_path_or_metadata_invalid/);
});
test('duplicate paths, malformed metadata and invalid identity/aggregates reject before member reads',async t=>{
 const f=await fixture(t);
 for(const mutate of [
  m=>{m.files.push(m.files[0]);m.fileCount++;m.bytes+=m.files[0].bytes;},m=>{m.files[0].mode=0o1000;},m=>{m.files[0].bytes=-1;},m=>{m.files[0].bytes=1.5;},
  m=>{m.files[0].sha256='A'.repeat(64);},m=>{m.fileCount++;},m=>{m.bytes++;},m=>{m.sourceCommit='short';},m=>{m.releaseId='b'.repeat(40);},m=>{m.files=null;},
 ]){await receipt(f,mutate);await assert.rejects(verifyStandaloneRelease(f.release),/release_(?:manifest|aggregate|member_path_or_metadata)_invalid/);}
});
test('static/BUILD_ID bytes and dependency metadata remain hash-bound but do not attest a runnable Next build',async t=>{
 for(const suffix of ['.next/static/chunks/fixture.js','.next/BUILD_ID','node_modules/next/package.json']){
  const f=await fixture(t),file=f.manifest.files.find(item=>item.path.endsWith(suffix));
  const original=await readFile(path.join(f.release,file.path));await writeFile(path.join(f.release,file.path),Buffer.alloc(original.length,120));
  await assert.rejects(verifyStandaloneRelease(f.release),/release_member_hash_mismatch/);
 }
});
test('unlisted files, symlink/hardlinked members and special mode bits do not verify',async t=>{
 const extra=await fixture(t);await writeFile(path.join(extra.release,'app','extra.js'),'synthetic');await assert.rejects(verifyStandaloneRelease(extra.release),/release_member_set_mismatch/);
 const symbolic=await fixture(t);await rm(path.join(symbolic.release,'app/server.js'));await symlink(path.join(symbolic.parent,'outside.js'),path.join(symbolic.release,'app/server.js'));
 await assert.rejects(verifyStandaloneRelease(symbolic.release),/release_symlink_rejected/);
 const hard=await fixture(t);await link(path.join(hard.release,'app/server.js'),path.join(hard.parent,'hard-file'));
 await assert.rejects(verifyStandaloneRelease(hard.release),/release_member_metadata_invalid/);
 const privileged=await fixture(t);for(const mode of [0o4644,0o2644,0o1644]){
  await chmod(path.join(privileged.release,'app/server.js'),mode);await assert.rejects(verifyStandaloneRelease(privileged.release),/release_member_metadata_invalid/);
 }
});
test('invalid manifest and unavailable release CLI reports fixed codes without echoing payload or paths',async t=>{
 const f=await fixture(t),sentinel='ANONYMOUS_SYNTHETIC_PARSE_SENTINEL';await writeFile(path.join(f.release,'release-manifest.json'),`{"${sentinel}":`);
 await assert.rejects(verifyStandaloneRelease(f.release),/^Error: release_manifest_invalid$/);
 for(const root of [f.release,path.join(f.parent,'nonexistent')]){
  const result=spawnSync(process.execPath,[verifier,root],{encoding:'utf8'});assert.equal(result.status,1);assert.equal(result.stdout,'');
  assert.equal(JSON.parse(result.stderr).releaseVerified,false);assert.match(JSON.parse(result.stderr).reason,/^release_[a-z0-9_]+$/);
  assert.equal(result.stderr.includes(sentinel),false);assert.equal(result.stderr.includes(f.parent),false);
 }
});
