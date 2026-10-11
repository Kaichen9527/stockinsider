import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile,writeFile,cp,rm,symlink,readdir,chmod} from 'node:fs/promises';
import {userInfo} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {copyResearchRuntimeFiles} from './research-release-artifacts.mjs';
import {financialInventory} from '../web/src/lib/research-financial-inventory.ts';
import {readPinnedFinancialFiles,FinancialDeadline} from '../web/src/lib/research-financial-file-reader.ts';
import {loadReadOnlyWorkingDraft} from '../web/src/lib/research-working-draft-loader.ts';

const repository=fileURLToPath(new URL('../',import.meta.url));
const manifestRelative='deployment/vps/research-runtime-files-v1.json';
const manifest=JSON.parse(await readFile(path.join(repository,manifestRelative),'utf8'));
async function fixture(t,entry='app'){
  // The actual reader intentionally rejects any writable ancestor, including
  // Linux /tmp (01777). Build a private fixture under the OS account's home;
  // resolving macOS physical ancestors preserves the same production guard.
  const root=await mkdtemp(path.join(userInfo().homedir,'.stockinsider-research-release-'));
  const {realpath}=await import('node:fs/promises');const physical=await realpath(root);
  t.after(()=>rm(physical,{recursive:true,force:true}));
  const sourceRoot=path.join(physical,'source'),releaseRoot=path.join(physical,'release');
  const entrypointDirectory=path.join(releaseRoot,entry);
  for(const p of [entrypointDirectory,path.join(sourceRoot,'deployment/vps'),path.join(sourceRoot,'web/src/lib')])await mkdir(p,{recursive:true});
  await cp(path.join(repository,manifestRelative),path.join(sourceRoot,manifestRelative));
  await writeFile(path.join(sourceRoot,'web/src/lib/research-complete-input.ts'),'// feature marker\n');
  for(const pin of manifest.files){const target=path.join(sourceRoot,pin.path);await mkdir(path.dirname(target),{recursive:true});await cp(path.join(repository,pin.path),target);}
  return {sourceRoot,releaseRoot,entrypointDirectory};
}
test('both runtime layouts contain only pinned research inputs and real readers load both companies',async t=>{
  for(const entry of ['app','app/web','web']){
    const config=await fixture(t,entry),result=await copyResearchRuntimeFiles(config),artifactRoot=path.dirname(config.entrypointDirectory);
    assert.equal(result.included,true);assert.equal(result.files.length,20);assert.equal(result.bytes,907264);
    const copied=(await readdir(path.join(artifactRoot,'docs'),{recursive:true})).filter(p=>p.includes('.')&&!p.endsWith('/'));
    assert.equal(copied.length,20);
    for(const symbol of ['2409','2383']){
      const loaded=await readPinnedFinancialFiles(artifactRoot,financialInventory.companies[symbol],new FinancialDeadline());
      try{assert.equal(loaded.records.size,financialInventory.companies[symbol].length);await loaded.validate();}finally{await loaded.close();}
      const draft=await loadReadOnlyWorkingDraft(artifactRoot,symbol);
      assert.equal(draft.symbol,symbol);assert.equal(draft.published,false);assert.equal(draft.strategyApproved,false);assert.ok(draft.sections.length>0);
    }
  }
});
test('missing, altered and symlinked inputs reject before any research output is created',async t=>{
  for(const kind of ['missing','altered','symlink','parent_symlink','duplicate','traversal']){
    const config=await fixture(t),first=manifest.files[0],filename=path.join(config.sourceRoot,first.path);
    if(kind==='missing')await rm(filename);
    if(kind==='altered')await writeFile(filename,'altered');
    if(kind==='symlink'){await rm(filename);await symlink(path.join(repository,first.path),filename);}
    if(kind==='parent_symlink'){await rm(path.dirname(filename),{recursive:true});await symlink(path.dirname(path.join(repository,first.path)),path.dirname(filename));}
    if(kind==='duplicate'||kind==='traversal'){const changed=structuredClone(manifest);changed.files[1]=kind==='duplicate'?changed.files[0]:{...changed.files[1],path:'docs/research/../private.json'};await writeFile(path.join(config.sourceRoot,manifestRelative),JSON.stringify(changed));}
    await assert.rejects(copyResearchRuntimeFiles(config));
    await assert.rejects(readFile(path.join(config.releaseRoot,first.path)),{code:'ENOENT'});
  }
});
test('output symlinks, existing files and escaped entrypoints cannot redirect or overwrite evidence',async t=>{
  const config=await fixture(t),outside=path.join(config.sourceRoot,'outside');await mkdir(outside);
  await symlink(outside,path.join(config.releaseRoot,'docs'));
  await assert.rejects(copyResearchRuntimeFiles(config));assert.deepEqual(await readdir(outside),[]);
  await rm(path.join(config.releaseRoot,'docs'));
  await copyResearchRuntimeFiles(config);
  const before=await readFile(path.join(config.releaseRoot,manifest.files[0].path));
  await assert.rejects(copyResearchRuntimeFiles(config),{code:'EEXIST'});
  assert.deepEqual(await readFile(path.join(config.releaseRoot,manifest.files[0].path)),before);
  await assert.rejects(copyResearchRuntimeFiles({...config,entrypointDirectory:path.join(config.sourceRoot,'app')}),/research_release_layout/);
});
test('legacy fixtures skip research; a feature-enabled release cannot omit its manifest',async t=>{
  const config=await fixture(t);await rm(path.join(config.sourceRoot,manifestRelative));
  await assert.rejects(copyResearchRuntimeFiles(config),{code:'ENOENT'});
  await rm(path.join(config.sourceRoot,'web/src/lib/research-complete-input.ts'));
  assert.deepEqual(await copyResearchRuntimeFiles(config),{included:false,files:[],bytes:0});
});

test('real financial reader still refuses a writable release ancestor',async t=>{
  const config=await fixture(t);await copyResearchRuntimeFiles(config);
  await chmod(config.releaseRoot,0o777);
  await assert.rejects(readPinnedFinancialFiles(config.releaseRoot,financialInventory.companies['2409'],new FinancialDeadline()),/financial_parent_invalid/);
  await chmod(config.releaseRoot,0o700);
  const loaded=await readPinnedFinancialFiles(config.releaseRoot,financialInventory.companies['2409'],new FinancialDeadline());
  try{assert.equal(loaded.records.size,financialInventory.companies['2409'].length);await loaded.validate();}finally{await loaded.close();}
});
