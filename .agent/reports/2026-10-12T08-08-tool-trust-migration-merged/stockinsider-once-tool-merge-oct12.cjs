'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const repo='repos/Kaichen9527/stockinsider',rule=repo+'/rulesets/20177392';
const head='9b74e535d3dfb698043a53eb0b24cfa14f6563a3',base='169aad1b6cfa747f78ae3464b614f43c0749d806';
const dir='/tmp/stockinsider-tool373-once-merge-oct12';fs.mkdirSync(dir,{mode:0o700});
const audit={schema:'human-authorized-tool-only-once-merge-v1',startedAt:new Date().toISOString(),pr:373,head,expectedBase:base,humanAuthorization:'同意，只限發布工具修復 PR；網站仍須全部檢查',protectedPassClaim:false};
function api(endpoint,method='GET',body){const args=['api',endpoint,'--method',method,'-H','Accept: application/vnd.github+json','-H','X-GitHub-Api-Version: 2026-03-10'];if(body!==undefined){const p=dir+'/request-'+(++api.n)+'.json';fs.writeFileSync(p,JSON.stringify(body)+'\n',{mode:0o600});args.push('--input',p);}const r=cp.spawnSync('gh',args,{encoding:'utf8',timeout:30000});if(r.status!==0)throw Error((r.stderr||r.stdout).slice(0,3000));return JSON.parse(r.stdout);}
api.n=0;const keys=['name','target','enforcement','bypass_actors','conditions','rules'];const payload=x=>Object.fromEntries(keys.filter(k=>x[k]!==undefined).map(k=>[k,x[k]]));
let changed=false,original,primary;
try{
 const me=api('user');assert.equal(me.login,'Kaichen9527');assert.equal(me.id,205199640);
 const pr=api(repo+'/pulls/373');assert.equal(pr.head.sha,head);assert.equal(pr.base.sha,base);assert.equal(pr.base.ref,'main');assert.equal(pr.state,'open');assert.equal(pr.draft,false);assert.equal(pr.mergeable,true);
 original=api(rule);const saved=JSON.parse(fs.readFileSync('/Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/.agent/reports/2026-10-12T07-25-human-trust-migration-authorization/original-ruleset.json'));assert.deepEqual(payload(original),payload(saved));assert.deepEqual(original.bypass_actors,[]);assert.equal(original.enforcement,'active');fs.writeFileSync(dir+'/original-ruleset.json',JSON.stringify(original,null,2)+'\n');
 const limited={...payload(original),bypass_actors:[{actor_id:me.id,actor_type:'User',bypass_mode:'pull_request'}]};
 api(rule,'PUT',limited);changed=true;
 const check=api(rule);assert.deepEqual(payload(check),limited);audit.temporaryRuleConfirmedAt=new Date().toISOString();
 const fresh=api(repo+'/pulls/373');assert.equal(fresh.head.sha,head);assert.equal(fresh.base.sha,base);assert.equal(fresh.state,'open');
 const merge=api(repo+'/pulls/373/merge','PUT',{sha:head,merge_method:'merge',commit_title:'Merge pull request #373: restore pinned publication runner',commit_message:'Human-authorized one-time initial trust migration, solely release tools. Independent exact review and genuine three-role live validation completed; old protected failures remain failed. Normal application checks remain mandatory.'});audit.mergeResponse=merge;assert.equal(merge.merged,true);audit.mergedAt=new Date().toISOString();
}catch(error){primary=error;audit.error=error.message;}
finally{
 if(changed){try{api(rule,'PUT',payload(original));const restored=api(rule);assert.deepEqual(payload(restored),payload(original));audit.originalRulesRestored=true;audit.restoredAt=new Date().toISOString();fs.writeFileSync(dir+'/restored-ruleset.json',JSON.stringify(restored,null,2)+'\n');}catch(error){audit.originalRulesRestored=false;audit.restorationError=error.message;primary=primary||error;}}
 audit.completedAt=new Date().toISOString();fs.writeFileSync(dir+'/audit.json',JSON.stringify(audit,null,2)+'\n');
}
if(audit.mergeResponse?.merged){const pr=api(repo+'/pulls/373'),main=api(repo+'/branches/main');audit.finalPr={merged:pr.merged,head:pr.head.sha,mergeCommit:pr.merge_commit_sha};audit.finalMain=main.commit.sha;fs.writeFileSync(dir+'/audit.json',JSON.stringify(audit,null,2)+'\n');}
console.log(JSON.stringify(audit));if(primary)process.exitCode=1;
