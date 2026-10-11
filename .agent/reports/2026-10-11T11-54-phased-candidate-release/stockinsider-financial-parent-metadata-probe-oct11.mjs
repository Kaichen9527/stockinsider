import {readFile,mkdir,rmdir,lstat,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root='/Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09';
const {FinancialDeadline,readPinnedFinancialFiles}=await import(pathToFileURL(root+'/web/src/lib/research-financial-file-reader.ts'));
const relative='docs/research/2026-10-08-emc-company-model/model-results.json';
const bytes=await readFile(root+'/'+relative); const hash=b=>createHash('sha256').update(b).digest('hex');
const pins=[{path:relative,bytes:bytes.length,sha256:hash(bytes)}];
const metadata=s=>({dev:String(s.dev),ino:String(s.ino),size:String(s.size),mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs)});
const results=[];
for(const mutation of [false,true,false]){
 const sibling=root+'/docs/research/.parent-metadata-probe-'+randomUUID();let created=false,before,after;let result;
 try{
  const reader=await readPinnedFinancialFiles(root,pins,new FinancialDeadline(),async stage=>{
   if(mutation && stage.startsWith('after_read:')){before=metadata(await lstat(root+'/docs/research',{bigint:true}));await mkdir(sibling,{mode:0o700});created=true;after=metadata(await lstat(root+'/docs/research',{bigint:true}));}
  });
  await reader.close();result={mutation,status:'read_success'};
 }catch(error){result={mutation,status:'rejected',error:error.message,cleanup:error.financialCleanup??null};}
 finally{if(created)await rmdir(sibling);}
 assert.equal(hash(await readFile(root+'/'+relative)),pins[0].sha256);
 if(mutation){assert.equal(result.error,'financial_parent_replaced');assert.equal(before.dev,after.dev);assert.equal(before.ino,after.ino);result.directoryBefore=before;result.directoryAfter=after;}
 else assert.equal(result.status,'read_success');
 results.push(result);
}
const receipt={schema:'financial-parent-metadata-isolated-probe-v1',observedAt:new Date().toISOString(),results,pinnedFileSha256:pins[0].sha256,pinnedBytes:pins[0].bytes,pinnedFileUnchanged:true,interpretation:'Existing strict guard also rejects same-directory-identity metadata changes from unrelated sibling creation. This is a deterministic mechanism reproduction, not proof which path changed during GitHub run38130038830. No guard relaxed or production patch made.'};
await writeFile('/tmp/stockinsider-financial-parent-metadata-probe-oct11.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
