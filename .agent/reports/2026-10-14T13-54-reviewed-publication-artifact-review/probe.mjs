import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const repo=process.cwd(), require=createRequire(repo+'/package.json');
const out='/tmp/reviewed-artifact-workflow-review-o14';
const w=fs.readFileSync(repo+'/.github/workflows/reviewed-publication-tail-artifact.yml','utf8');
const block=fs.readFileSync(out+'/inline-03-0.mjs','utf8');
const parser=block.slice(block.indexOf('assert.ok(Buffer.byteLength'),block.indexOf('const git ='));
const summary='1..155\n# tests 155\n# pass 155\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
const pcr=Array.from({length:31},(_,i)=>`ok ${i+1} - acceptance PCR-${String(i+1).padStart(3,'0')}\n`).join('');
const complete='TAP version 13\n'+pcr+Array.from({length:124},(_,i)=>`ok ${i+32} - other ${i+32}\n`).join('')+summary;
const cases={complete,only31:'TAP version 13\n'+pcr+summary,duplicateResultIds:complete.replace('ok 32 - other 32','ok 31 - other 32'),contradictoryNotOk:complete.replace('ok 32 - other 32','not ok 32 - other 32'),duplicatePlan:complete+'1..155\n',wrongPCR:complete.replace('PCR-031','PCR-030'),summaryFail:complete.replace('# fail 0','# fail 1'),summarySkip:complete.replace('# skipped 0','# skipped 1'),doubleSummary:complete+'# pass 155\n'};
for(const [name,log] of Object.entries(cases)) {let accepted=true,error=null;try{vm.runInNewContext(parser,{assert,Buffer,log},{timeout:1000});}catch(e){accepted=false;error=e.message;}console.log(JSON.stringify({kind:'extracted_exact_parser',name,accepted,error}));}
const install=w.indexOf('npx playwright install'), canonical=w.indexOf('npm run test:source-led-opportunity-v3:product-correctness');
assert.ok(install>canonical); console.log(JSON.stringify({kind:'workflow_order',canonicalOffset:canonical,browserInstallOffset:install,browserProvisionBeforeCanonical:false}));
process.env.PLAYWRIGHT_BROWSERS_PATH=out+'/empty-browser-cache';
const pkg=require('./web/node_modules/playwright-core/package.json');
const {registry}=require('./web/node_modules/playwright-core/lib/server/registry/index.js');
const e=registry.findExecutable('chromium-headless-shell');let err=null;try{e.executablePathOrDie('javascript');}catch(error){err=error.message;}
assert.match(err,/Executable doesn't exist/);console.log(JSON.stringify({kind:'no_launch_no_network_registry_probe',version:pkg.version,path:e.executablePath(),error:err}));
const {resolveReviewedRuntimeRelease}=require('./scripts/runtime/reviewed-runtime-release.js');
const opts={repositoryRoot:repo,sourceCommit:'dd59817f750684b093965f539dd4de466be13077',attestationCommit:'c2b146adb6d03814f2bd9a7af72baf003bb48812'};
console.log(JSON.stringify({kind:'real_git_resolver',result:resolveReviewedRuntimeRelease(opts)}));
for(const [name,change] of Object.entries({wrongSource:{sourceCommit:'5189547f76bf24c002b8e8b11669081ba67ad2c6'},missingAttestation:{attestationCommit:'0'.repeat(40)}})){let rejected=false,error;try{resolveReviewedRuntimeRelease({...opts,...change});}catch(e){rejected=true;error=e.message;}assert.ok(rejected);console.log(JSON.stringify({kind:'real_git_resolver_negative',name,rejected,error}));}
console.log(JSON.stringify({kind:'head_unchanged',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}));
