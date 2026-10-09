// True filesystem controls using the original reader/checkpoint; synthetic JSON pin.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readPinnedFinancialFiles,FinancialDeadline} from '../web/src/lib/research-financial-file-reader.ts';
const out=process.env.RESEARCH_NAMESPACE_DIAGNOSTIC_ARTIFACTS;
assert.ok(out&&path.isAbsolute(out));const namespace=path.join(out,'controls'),root=path.join(namespace,'reader-root'),sibling=path.join(namespace,'existing-sibling');
await fs.mkdir(root,{recursive:true,mode:0o700});await fs.mkdir(sibling,{mode:0o700});await fs.mkdir(root+'/docs/research/synthetic-controls',{recursive:true,mode:0o700});
const raw=Buffer.from('{"meaning":"synthetic reader namespace control, not financial evidence"}');const pin={path:'docs/research/synthetic-controls/pin.json',bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')};await fs.writeFile(path.join(root,pin.path),raw,{flag:'wx',mode:0o600});
const stat=async p=>{const s=await fs.lstat(p,{bigint:true});return {dev:String(s.dev),ino:String(s.ino),size:String(s.size),mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs)};};
const cases=[];
for(const kind of ['write_within_existing_sibling','add_sibling_entry_to_common_ancestor']){
 const before=await stat(namespace),rootBefore=await stat(root);let called=false,result,error;
 try{const files=await readPinnedFinancialFiles(root,[pin],new FinancialDeadline(),async checkpoint=>{if(checkpoint==='after_read:'+pin.path&&!called){called=true;if(kind==='write_within_existing_sibling')await fs.writeFile(sibling+'/file.txt','synthetic',{flag:'wx',mode:0o600});else await fs.mkdir(namespace+'/new-sibling',{mode:0o700});}});try{assert.deepEqual(files.records.get(pin.path).value,JSON.parse(raw.toString()));result='success';}finally{await files.close();}}catch(e){error=e.message;result='rejected';}
 const after=await stat(namespace),rootAfter=await stat(root);cases.push({kind,checkpointCalled:called,before,after,rootBefore,rootAfter,result,error:error||null,writer:{pid:process.pid,operation:kind},historicalR1CauseProven:false});
 assert.equal(called,true);assert.deepEqual(rootAfter,rootBefore);
 if(kind==='write_within_existing_sibling'){assert.equal(result,'success');assert.deepEqual(after,before);}else{assert.equal(result,'rejected');assert.equal(error,'financial_parent_replaced');assert.equal(after.dev,before.dev);assert.equal(after.ino,before.ino);assert.notDeepEqual(after,before);}
}
await fs.writeFile(out+'/ancestor-controls.json',JSON.stringify({syntheticPin:pin,cases,guardChanged:false,realFilesystem:true,historicalR1CauseProven:false},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({controls:cases.map(({kind,result,error})=>({kind,result,error})),historicalR1CauseProven:false}));
