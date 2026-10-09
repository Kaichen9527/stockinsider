// Diagnostic only: run the unchanged production reader against owned real files.
// This establishes a reproducible mechanism, not the historical VM R1 cause.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
const sourceRoot=path.resolve(process.argv[2]);
const ts=(await import(pathToFileURL(path.join(sourceRoot,'web/node_modules/typescript/lib/typescript.js')).href)).default;
const source=await fs.readFile(path.join(sourceRoot,'web/src/lib/research-financial-file-reader.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const require=createRequire(import.meta.url),exports={};
vm.runInNewContext(compiled,{exports,require,Buffer,TextDecoder,AbortController,setTimeout,clearTimeout,performance});
const base=path.resolve(path.dirname(new URL(import.meta.url).pathname),'owned-'+randomUUID());
await fs.mkdir(base,{mode:0o700});
const stat=async name=>{const s=await fs.lstat(name,{bigint:true});return Object.fromEntries(['dev','ino','size','mtimeNs','ctimeNs'].map(k=>[k,s[k].toString()]));};
const pin={path:'docs/research/pinned.json',bytes:14,sha256:createHash('sha256').update('{"value":1234}').digest('hex')};
const cases=[];
try {
 for(const kind of ['nested-scratch-write','new-sibling-entry','replace-research-parent']){
  const common=path.join(base,kind),root=path.join(common,'repository'),scratch=path.join(common,'scratch');
  await fs.mkdir(root+'/docs/research',{recursive:true,mode:0o700});await fs.mkdir(scratch,{mode:0o700});
  await fs.writeFile(root+'/'+pin.path,'{"value":1234}',{mode:0o600});
  const before={common:await stat(common),root:await stat(root),parent:await stat(root+'/docs/research'),file:await stat(root+'/'+pin.path)};
  let mutated=false,error=null;
  const startedAt=new Date().toISOString();
  try {
   const read=await exports.readPinnedFinancialFiles(root,[pin],new exports.FinancialDeadline(),async name=>{
    if(!name.startsWith('after_read:')||mutated)return;mutated=true;
    if(kind==='nested-scratch-write')await fs.writeFile(scratch+'/unrelated.txt','scratch',{mode:0o600});
    if(kind==='new-sibling-entry')await fs.mkdir(common+'/unrelated',{mode:0o700});
    if(kind==='replace-research-parent'){
     await fs.rename(root+'/docs/research',root+'/docs/original');await fs.mkdir(root+'/docs/research',{mode:0o700});
     await fs.copyFile(root+'/docs/original/pinned.json',root+'/'+pin.path);
    }
   });
   assert.equal(read.records.get(pin.path).value.value,1234);await read.validate();await read.close();
  }catch(e){error=e.message;}
  const after={common:await stat(common),root:await stat(root),parent:await stat(root+'/docs/research'),file:await stat(root+'/'+pin.path)};
  assert.equal(mutated,true);
  if(kind==='nested-scratch-write'){assert.equal(error,null);assert.deepEqual(after.common,before.common);}
  else assert.equal(error,'financial_parent_replaced');
  if(kind==='new-sibling-entry'){
   assert.equal(after.common.dev,before.common.dev);assert.equal(after.common.ino,before.common.ino);
   assert.notDeepEqual(after.common,before.common);assert.deepEqual(after.root,before.root);assert.deepEqual(after.parent,before.parent);assert.deepEqual(after.file,before.file);
  }
  if(kind==='replace-research-parent')assert.notEqual(after.parent.ino,before.parent.ino);
  cases.push({kind,startedAt,completedAt:new Date().toISOString(),expectedRejection:kind!=='nested-scratch-write',observedError:error,before,after});
 }
 // Both rejected reads must release their process-owned slot after real cleanup.
 const root=path.join(base,'nested-scratch-write/repository');
 const recovery=await exports.readPinnedFinancialFiles(root,[pin],new exports.FinancialDeadline());await recovery.close();
 console.log(JSON.stringify({schemaVersion:'financial-parent-mechanism-diagnostic-v1',sourceRoot,readerSha256:createHash('sha256').update(source).digest('hex'),filesystemCallsMocked:false,runtimeChanged:false,historicalR1CauseEstablished:false,cases,postFailureReadAndCleanupPassed:true,ownedScratchRemovedOnExit:true},null,2));
}finally{await fs.rm(base,{recursive:true,force:true});}
