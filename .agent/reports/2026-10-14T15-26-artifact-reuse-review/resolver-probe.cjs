const assert=require('node:assert/strict');
const {resolveReviewedRuntimeRelease}=require('/tmp/si-pubtail-o14/scripts/runtime/reviewed-runtime-release.js');
const args={repositoryRoot:'/tmp/si-pubtail-o14',sourceCommit:'dd59817f750684b093965f539dd4de466be13077',attestationCommit:'c2b146adb6d03814f2bd9a7af72baf003bb48812'};
const r=resolveReviewedRuntimeRelease(args);
assert.equal(r.treeSha,'6a9a08af70fb94b50ed2b5eee6aaf3686f648b99');assert.equal(r.reviewAttestationSha256,'e0fed54595dda6ad3be4dfe8a9f4714b9912c754b13842ea28bdff99b9f8ebd3');
assert.throws(()=>resolveReviewedRuntimeRelease({...args,sourceCommit:'5189547f76bf24c002b8e8b11669081ba67ad2c6'}),/attestation_commit_not_direct_child/);
assert.throws(()=>resolveReviewedRuntimeRelease({...args,attestationCommit:args.sourceCommit}),/attestation_commit_not_direct_child/);
console.log(JSON.stringify({checks:3,pass:3,result:r,scope:'readonly original Git resolver, no approval created'}));
