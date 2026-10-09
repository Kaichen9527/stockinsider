import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {ancestorPaths,statShape,namespaceSnapshot,changedAncestors} from './research-financial-parent-namespace-diagnostic.mjs';
const root=process.cwd(),output=process.env.FINANCIAL_NAMESPACE_ARTIFACTS;assert.ok(path.isAbsolute(output));
const {financialInventory}=await import('../web/src/lib/research-financial-inventory.ts');const pins=financialInventory.companies['2409'],parents=ancestorPaths(root,pins),traces=[];let label=null;
const realLstat=fs.lstat;fs.lstat=async(...args)=>{const value=await realLstat(...args);if(label&&parents.includes(String(args[0])))traces.push({label,path:String(args[0]),at:new Date().toISOString(),monotonicMs:performance.now(),stat:statShape(value)});return value;};syncBuiltinESMExports();
const {readPinnedFinancialFiles,FinancialDeadline}=await import('../web/src/lib/research-financial-file-reader.ts');
const cases=[],operations=[],marker=path.join(root,'.financial-namespace-controlled-'+process.pid),inner=path.join(output,'controls/existing/inner-'+process.pid+'.txt');
try{for(const kind of ['stable','existing-sibling-inner-write','common-ancestor-new-entry']){
 label=kind;const before=await namespaceSnapshot(parents);let opened,primary;const start=new Date().toISOString();
 try{opened=await readPinnedFinancialFiles(root,pins,new FinancialDeadline(),async name=>{
  if(name!=='after_read:'+pins.at(-1).path)return;
  if(kind==='existing-sibling-inner-write'){operations.push({kind,pid:process.pid,path:inner,at:new Date().toISOString(),monotonicMs:performance.now()});await fs.writeFile(inner,'test-only namespace control',{flag:'wx',mode:0o600});}
  if(kind==='common-ancestor-new-entry'){operations.push({kind,pid:process.pid,path:marker,at:new Date().toISOString(),monotonicMs:performance.now()});await fs.mkdir(marker,{mode:0o700});}
 });await opened.close();}catch(e){primary={message:e.message,cleanup:e.financialCleanup??null};}
 const after=await namespaceSnapshot(parents);const captures=traces.filter(x=>x.label===kind);cases.push({kind,start,completedAt:new Date().toISOString(),accepted:Boolean(opened),error:primary,before,after,changedAncestors:changedAncestors(before,after),trueFilesystemLstatCaptureCount:captures.length,captures});
 if(kind==='common-ancestor-new-entry'){assert.equal(primary?.message,'financial_parent_replaced');await fs.rmdir(marker);}else{assert.ok(opened,JSON.stringify(primary));assert.equal(primary,undefined);}
 if(kind==='existing-sibling-inner-write')await fs.unlink(inner);
 }}finally{fs.lstat=realLstat;syncBuiltinESMExports();label=null;for(const p of [inner,marker])try{const s=await fs.lstat(p);if(s.isDirectory())await fs.rmdir(p);else await fs.unlink(p);}catch(e){if(e.code!=='ENOENT')throw e;}}
assert.ok(cases.every(x=>x.trueFilesystemLstatCaptureCount>0),'passthrough recorder must capture actual reader calls');
const bytes=await fs.readFile(path.join(root,'web/src/lib/research-financial-file-reader.ts'));
const report={sourceReaderSha256:createHash('sha256').update(bytes).digest('hex'),runtimeModified:false,fsRecorder:'Process-local lstat passthrough records real returned stats; no mock values or guard changes.',pins: pins.map(x=>({...x})),cases,operations,historicalWriterProven:false,historicalAncestorChangedPathKnown:false,limitation:'Original RED retained no capture-time ancestor stats. Controlled mechanism evidence cannot identify the earlier writer.'};await fs.writeFile(path.join(output,'real-fs-controls.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({cases:cases.map(c=>({kind:c.kind,accepted:c.accepted,error:c.error?.message,changedPaths:c.changedAncestors.map(x=>x.before.path),captures:c.trueFilesystemLstatCaptureCount})),historicalWriterProven:false}));
