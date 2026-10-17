import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root='/tmp/stockinsider-pr383-handoff-current-oct17';
const relative='scripts/opportunity-v3/protected-external-gate-worker.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=readFileSync(path.join(root,relative));
assert.deepEqual(source,execFileSync('/usr/bin/git',['show','93e44475cbb0c27beb26e4dcb68e382096a4e212:'+relative],{cwd:root}));
const processView={argv:[],env:process.env,stdout:process.stdout,stderr:process.stderr,cwd:()=>root};
const context=vm.createContext({Buffer,process:processView,URL,console});
const cache=new Map();
async function moduleAt(url,entry=false){
 if(cache.has(url))return cache.get(url);
 if(url.startsWith('node:')){
  const obj=await import(url);const keys=Object.keys(obj);const m=new vm.SyntheticModule(keys,function(){for(const k of keys)this.setExport(k,obj[k]);},{context,identifier:url});cache.set(url,m);return m;
 }
 const code=readFileSync(fileURLToPath(url),'utf8')+(entry?'\nexport { captureReview };\n':'');
 const m=new vm.SourceTextModule(code,{context,identifier:url,initializeImportMeta(meta){meta.url=url;}});cache.set(url,m);
 await m.link((specifier,parent)=>moduleAt(specifier.startsWith('node:')?specifier:new URL(specifier,parent.identifier).href));return m;
}
const m=await moduleAt(pathToFileURL(path.join(root,relative)).href,true);await m.evaluate();
const subject=process.argv[2]??'939d6438d157114c6ef33b9d99362156c36624f1';
const tree=execFileSync('/usr/bin/git',['rev-parse',subject+'^{tree}'],{cwd:root,encoding:'utf8'}).trim();
const identity=m.namespace.treeIdentity(root,tree);
let result;
try{result={status:'PASS',review:m.namespace.captureReview(root,'exact-review',identity,{subjectCommitSha:subject,subjectTreeSha:tree})};}
catch(e){result={status:'REJECTED',error:e.message};}
const out={subject,tree,workerSha256:sha(source),adaptation:'Original complete base-owned worker bytes evaluated in memory with only one export statement appended; no disk worker change, no main entrypoint, no hosted authority or envelope minted.',scope:'Local read-only grammar/tree/evidence/attestation binding preflight; not protected hosted checks or native/production approval.',...result};
writeFileSync(process.argv[3]??'/tmp/stockinsider-pr383-handoff-audit-oct17/old-review-grammar-control.json',JSON.stringify(out,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({subject,status:out.status,error:out.error,workerSha256:out.workerSha256}));
if(subject==='939d6438d157114c6ef33b9d99362156c36624f1')assert.equal(result.error,'exact-review reviewed commit/tree');
else assert.equal(result.status,'PASS');
