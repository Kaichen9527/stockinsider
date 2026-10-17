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
 const code=readFileSync(fileURLToPath(url),'utf8');
 const m=new vm.SourceTextModule(code,{context,identifier:url,initializeImportMeta(meta){meta.url=url;}});cache.set(url,m);
 await m.link((specifier,parent)=>moduleAt(specifier.startsWith('node:')?specifier:new URL(specifier,parent.identifier).href));return m;
}
const m=await moduleAt(pathToFileURL(path.join(root,relative)).href,true);await m.evaluate();
const base='93e44475cbb0c27beb26e4dcb68e382096a4e212';
const subject='32ab771736fc18535ccd08113836c850aabb2bd0';
const baseListing=m.namespace.modelOracleListing(root,base);
const subjectListing=m.namespace.modelOracleListing(root,subject);
assert.equal(baseListing,subjectListing);
assert.equal(m.namespace.modelOracleListingSha256(baseListing),'080db93a9b98e75b4b2bcb14e4097e25cb745f449d2c6c3c0b022dc204afd027');
const rows=[];
rows.push({case:'unchanged current listing',authority:m.namespace.trustedModelOracleAuthorityForListings(baseListing,subjectListing),hostPin:m.namespace.hostPinForModelOracleListing(subjectListing)});
const mutatedListing=subjectListing.replace(/blob [a-f0-9]{40}/u,'blob 1111111111111111111111111111111111111111');
assert.notEqual(mutatedListing,subjectListing);
for(const [name,fn]of [['changed listing authority',()=>m.namespace.trustedModelOracleAuthorityForListings(baseListing,mutatedListing)],['changed listing pin selector',()=>m.namespace.hostPinForModelOracleListing(mutatedListing)]]){
 try{fn();throw Error('unexpected acceptance');}catch(e){if(e.message==='unexpected acceptance')throw e;rows.push({case:name,status:'REJECTED',error:e.message});}
}
assert.equal(rows[0].authority,'protected_base');assert.equal(rows[0].hostPin,'model-runner-host-pins-v3.25');
assert.equal(rows[1].error,'model oracle successor requires protected-base approval');
assert.equal(rows[2].error,'model runner host pin requires an exact protected listing');
const out={observedAtUtc:new Date().toISOString(),base,subject,workerSha256:sha(source),workerBytes:source.length,scope:'Original complete unchanged base-owned worker evaluated in VM memory, main never invoked. Only exported pure listing authority and selector functions called. Deliberately mutated listing is an in-memory negative control, not a new source/fixture or approved candidate. No hosted envelopes, credentials, model, network, profile or App changes.',listingSha256:m.namespace.modelOracleListingSha256(baseListing),rows,status:'PASS_EXPECTED_REJECTIONS'};
writeFileSync('/tmp/stockinsider-hostpin-custody-policy-oct17/original-worker-authority-control.json',JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(out));
