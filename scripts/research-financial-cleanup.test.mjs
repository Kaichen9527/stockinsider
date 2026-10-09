import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import ts from '../web/node_modules/typescript/lib/typescript.js';
const require=createRequire(import.meta.url);
const source=await fs.readFile(new URL('../web/src/lib/research-financial-file-reader.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function harness(kind){
 const root=new URL('../.agent/financial-cleanup-'+randomUUID(),import.meta.url).pathname;await fs.mkdir(root+'/docs/research',{recursive:true,mode:0o700});await fs.writeFile(root+'/docs/research/a.json','1',{mode:0o600});
 let release;const gate=new Promise(r=>release=r);let pendingRead;let closed=0,opened=0;const exports={};
 vm.runInNewContext(compiled,{exports,require:n=>n==='node:fs/promises'?{...fs,open:async(...args)=>{
  if(kind==='lateOpen')await gate;const fd=await fs.open(...args);opened++;
  return{stat:fd.stat.bind(fd),read:(...args)=>{
   if(kind==='readFailure')return Promise.reject(new Error('synthetic_original_read_error'));
   if(kind==='readStall'){pendingRead=gate.then(()=>fd.read(...args));return pendingRead;}
   return fd.read(...args);
  },close:async()=>{
   if(kind==='readStall')await pendingRead;
   if(kind==='closeStall')await gate;
   await fd.close();closed++;
   if(kind==='readFailure')throw new Error('synthetic_close_failure');
  }};
 }}:require(n),Buffer,TextDecoder,AbortController,setTimeout,clearTimeout,performance});
 const pin={path:'docs/research/a.json',bytes:1,sha256:createHash('sha256').update('1').digest('hex')};
 const deadline=()=>{const d=new exports.FinancialDeadline();Object.defineProperty(d,'end',{value:performance.now()+30});return d;};
 return{exports,root,pin,deadline,release,get closed(){return closed;},get opened(){return opened;},finish:async()=>{release();await pause(30);await fs.rm(root,{recursive:true,force:true});}};
}
for(const kind of ['readStall','lateOpen'])test(kind+' bounded failure tracks delayed descriptor then permits confirmed recovery',{timeout:2000},async()=>{
 const h=await harness(kind);try{
  const start=performance.now();let error;await assert.rejects(h.exports.readPinnedFinancialFiles(h.root,[h.pin],h.deadline()),e=>{error=e;return e.message==='financial_deadline';});
  assert.ok(performance.now()-start<300);assert.equal(error.financialCleanup.cleanupComplete,false);assert.equal(error.financialCleanup.recoveryRequired,true);
  await assert.rejects(h.exports.readPinnedFinancialFiles(h.root,[h.pin],h.deadline()),/cleanup_or_read_in_progress/);
  h.release();await pause(60);assert.equal(h.closed,1);
  const files=await h.exports.readPinnedFinancialFiles(h.root,[h.pin],h.deadline());await files.close();assert.equal(h.closed,2);
 }finally{await h.finish();}
});
test('normal read cannot return successful cleanup while close is stalled',{timeout:2000},async()=>{
 const h=await harness('closeStall');try{const d=h.deadline(),files=await h.exports.readPinnedFinancialFiles(h.root,[h.pin],d);
  await assert.rejects(files.close(),e=>e.message==='financial_deadline'&&e.financialCleanup.cleanupComplete===false);
  await assert.rejects(h.exports.readPinnedFinancialFiles(h.root,[h.pin],h.deadline()),/cleanup_or_read_in_progress/);
  h.release();await pause(60);assert.equal(h.closed,1);
 }finally{await h.finish();}
});
test('close rejection preserves original read failure and permanently requires controlled recovery',{timeout:2000},async()=>{
 const h=await harness('readFailure');try{
  await assert.rejects(h.exports.readPinnedFinancialFiles(h.root,[h.pin],h.deadline()),e=>e.message==='synthetic_original_read_error'&&e.financialCleanup.cleanupFailed&&e.financialCleanup.recoveryRequired);
  assert.equal(h.closed,1);await assert.rejects(h.exports.readPinnedFinancialFiles(h.root,[h.pin],h.deadline()),/cleanup_or_read_in_progress/);
 }finally{await h.finish();}
});
test('success confirms all handles closed before return, duplicate close stays confirmed',{timeout:2000},async()=>{
 const h=await harness('normal');try{const f=await h.exports.readPinnedFinancialFiles(h.root,[h.pin],h.deadline());assert.equal(h.closed,0);await f.close();assert.equal(h.closed,1);await f.close();assert.equal(h.closed,1);}finally{await h.finish();}
});
test('already exhausted deadline never acquires a descriptor',{timeout:2000},async()=>{
 const h=await harness('normal');try{const d=h.deadline();Object.defineProperty(d,'end',{value:performance.now()-1});await assert.rejects(h.exports.readPinnedFinancialFiles(h.root,[h.pin],d),/financial_deadline/);assert.equal(h.opened,0);}finally{await h.finish();}
});
