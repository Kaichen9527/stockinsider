import fs from 'node:fs';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
const repo='Kaichen9527/stockinsider';
const expectedMain='c6bc227ccaa5309226cbb833b35a35198491cb48';
const subjects=[{pr:370,head:'3338160a43dd9c23e4ea4b079fd7761501c29786',run:38190772969},{pr:371,head:'bc1b6aff5315c0f0302cd1d2e74e7c1b238a4af3',run:38190779815},{pr:372,head:'680d0c9d10ca185013d66f034e9fc03e1d7fcd69',run:38190723740}];
const gh=args=>cp.execFileSync('gh',args,{encoding:'utf8',timeout:120000});
const json=args=>JSON.parse(gh(args));
const audit={startedAt:new Date().toISOString(),mode:'normal protected merge commits only; no admin/bypass',subjects:[],merged:[]};
const output='/tmp/stockinsider-normal-three-merge-oct12.json';
const save=()=>fs.writeFileSync(output,JSON.stringify(audit,null,2)+'\n');
function rules(){const r=json(['api','repos/'+repo+'/rulesets/20177392']);assert.equal(r.enforcement,'active');assert.deepEqual(r.bypass_actors,[]);assert.ok(r.rules.find(x=>x.type==='required_status_checks').parameters.required_status_checks.some(x=>x.context==='stockinsider-v3-gate-root'));return r;}
audit.rulesBefore=rules();
assert.equal(json(['api','repos/'+repo+'/git/ref/heads/main']).object.sha,expectedMain);
for(const s of subjects){
 const pr=json(['pr','view',String(s.pr),'--repo',repo,'--json','state,headRefOid,mergeStateStatus,statusCheckRollup']);
 assert.equal(pr.state,'OPEN');assert.equal(pr.headRefOid,s.head);
 const run=json(['run','view',String(s.run),'--repo',repo,'--json','headSha,status,conclusion,jobs']);
 assert.equal(run.headSha,s.head);assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
 for(const name of ['requirements','architecture','exact-review','model-runner-code-gate','product-runtime-code-gate','stockinsider-v3-gate-root']){
  const jobs=run.jobs.filter(x=>x.name===name);assert.equal(jobs.length,1);assert.equal(jobs[0].conclusion,'success');
 }
 assert.ok(pr.statusCheckRollup.some(x=>x.name==='stockinsider-v3-gate-root'&&x.conclusion==='SUCCESS'));
 for(const check of pr.statusCheckRollup){assert.notEqual(check.conclusion,'FAILURE',check.name+' must not fail');assert.notEqual(check.conclusion,'CANCELLED',check.name+' must not cancel');}
 audit.subjects.push({subject:s,pr,protected:run});
}
save();
try{
 for(const s of subjects){
  rules();
  const before=json(['pr','view',String(s.pr),'--repo',repo,'--json','state,headRefOid']);
  assert.equal(before.state,'OPEN');assert.equal(before.headRefOid,s.head);
  gh(['pr','merge',String(s.pr),'--repo',repo,'--merge','--match-head-commit',s.head]);
  const merged=json(['pr','view',String(s.pr),'--repo',repo,'--json','state,headRefOid,mergeCommit,mergedAt']);
  assert.equal(merged.state,'MERGED');assert.equal(merged.headRefOid,s.head);assert.match(merged.mergeCommit.oid,/^[0-9a-f]{40}$/u);
  audit.merged.push({pr:s.pr,...merged});save();
 }
 audit.rulesAfter=rules();
 audit.finalMain=json(['api','repos/'+repo+'/git/ref/heads/main']).object.sha;
 audit.completedAt=new Date().toISOString();save();console.log(JSON.stringify({merged:audit.merged,finalMain:audit.finalMain}));
}catch(e){audit.error=e.message;save();throw e;}
