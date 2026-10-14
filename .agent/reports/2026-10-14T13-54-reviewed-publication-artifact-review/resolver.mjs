import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(process.cwd()+'/package.json');
const {resolveReviewedRuntimeRelease,createGitRepository}=require('./scripts/runtime/reviewed-runtime-release.js');
const options={repositoryRoot:process.cwd(),sourceCommit:'dd59817f750684b093965f539dd4de466be13077',attestationCommit:'c2b146adb6d03814f2bd9a7af72baf003bb48812'};
console.log(JSON.stringify({label:'original_resolver_real_git',result:resolveReviewedRuntimeRelease(options)}));
for(const [name,change] of Object.entries({wrongSource:{sourceCommit:'5189547f76bf24c002b8e8b11669081ba67ad2c6'},missingAttestation:{attestationCommit:'0'.repeat(40)}})){
 let error=null;try{resolveReviewedRuntimeRelease({...options,...change});}catch(e){error=e.message;}assert.ok(error);console.log(JSON.stringify({name,error}));
}
const repo=createGitRepository(process.cwd());
for(const [name,override] of Object.entries({extraDiff:{changedRows:()=>[]},wrongTree:{tree:()=>'f'.repeat(40)},changedReview:{bytes:(tree,p)=>p.endsWith('exact-commit-review-final.md')?Buffer.from('changed'):repo.bytes(tree,p)}})){
 let error=null;try{resolveReviewedRuntimeRelease(options,{...repo,...override});}catch(e){error=e.message;}assert.ok(error);console.log(JSON.stringify({name,error,overrideProbe:true}));
}
