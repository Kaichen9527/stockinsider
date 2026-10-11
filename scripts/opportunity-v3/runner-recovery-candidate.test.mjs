import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { candidateSandboxPolicy } from './protected-external-gate-worker.mjs';
const require=createRequire(import.meta.url);
const { loadRecoveryCandidatePins }=require('../model-runner-v3/recoveryCandidate');
const { routeOperation }=require('../model-runner-v3/routing');
const { codexArgs }=require('../model-runner-v3/codexAdapter');
const { terminalResultFromJsonl }=require('../model-runner-v3/execution');
const { canonicalJson,sha256 }=require('../model-runner-v3/canonicalJson');
const runner=require('../model-runner-v3/runner');
const base='169aad1b6cfa747f78ae3464b614f43c0749d806';
test('measured candidate is inactive, separate from unchanged frozen active authority',()=>{
 const pins=loadRecoveryCandidatePins();assert.equal(pins.approvalAuthority,null);
 assert.equal(pins.executables[0].version,'codex-cli 0.162.0-alpha.17.2');
 for(const p of ['.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json','.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.json','.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-tests.md','.github/workflows/source-led-opportunity-external-gate.yml'])assert.deepEqual(readFileSync(p),execFileSync('/usr/bin/git',['show',`${base}:${p}`]));
 const s=readFileSync('scripts/model-runner-v3/runner.js','utf8');assert.match(s,/Inactive recovery candidate:[\s\S]+assert\(false, 5\);[^\n]*\n  const pins = verifyExecutionHost/);
});
test('candidate route rejects legacy strategy and operation/model swaps',()=>{
 for(const op of ['make','review','verify']){
  const r=routeOperation(op,'sol61-make-astra-review');assert.equal(r.model,op==='make'?'gpt-6.1-sol':'gpt-6-astra');assert.equal(r.reasoningEffort,'high');
  assert.ok(codexArgs({operation:op,...r,viewPath:'/tmp/view'}).includes(r.model));
  assert.throws(()=>codexArgs({operation:op,model:op==='make'?'gpt-6-astra':'gpt-6.1-sol',reasoningEffort:'high',viewPath:'/tmp/view'}));
 }
 for(const strategy of ['hybrid','sol-only','terra-only','astra-only'])assert.throws(()=>routeOperation('make',strategy));
});
test('actual execution parser rejects terminal transcript without thread/turn start',()=>{
 const raw='{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{}"}}\n{"type":"turn.completed","usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1}}\n';
 assert.throws(()=>terminalResultFromJsonl(raw));
});
test('worker policy extraction preserves all legacy bytes for ordinary canonical roots',()=>{
 const values={subjectRoot:'/tmp/subject',scratch:'/tmp/scratch',policyRoot:'/tmp/policy',nodeToolchainRoot:'/opt/node',pinnedNodeExecutable:'/usr/local/bin/node',developerRoot:'/Library/Developer/CommandLineTools'};
 const original=execFileSync('/usr/bin/git',['show',`${base}:scripts/opportunity-v3/protected-external-gate-worker.mjs`],{encoding:'utf8'});
 const a=original.indexOf('    const escaped =',original.indexOf('function candidateSandbox(')),b=original.indexOf('    writeFileSync(',a);
 const fn=Function('subjectRoot','scratch','policyRoot','nodeToolchainRoot','pinnedNodeExecutable','appleDeveloperToolchain','writableSource','network',original.slice(a,b)+'return profile;');
 for(const network of [false,true])for(const writableSource of [false,true])assert.equal(candidateSandboxPolicy({...values,network,writableSource}),fn(...Object.values(values).slice(0,5),{root:values.developerRoot},writableSource,network));
 assert.throws(()=>candidateSandboxPolicy({...values,subjectRoot:'/tmp/evil\nkey'}));
 assert.throws(()=>candidateSandboxPolicy({...values,network:'true'}));
});

test('actual candidate CLI validate/route works while all model operations stop at inactive fence',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'inactive-runner-test-'));
 try {
  const manifest={protocol:'loop-model-manifest-v3.7',checkpoint:'model_runner_v3',changeId:'source-led-opportunity-engine-v3',base:'a'.repeat(40),inputHead:'b'.repeat(40),defaultStrategy:'sol61-make-astra-review',tasks:[{id:'candidate',sequence:0,assurance:'critical',dependsOn:[],task:'Synthetic candidate.',acceptanceCriteria:['No model invocation.'],allowedPaths:['scripts/model-runner-v3/**'],inspectionPaths:['scripts/**'],promptFiles:['.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-contract.md'],timeLimits:{makeSeconds:60,reviewSeconds:60,verifySeconds:60}}]};
  const file=path.join(dir,'manifest.json');writeFileSync(file,canonicalJson(manifest)+'\n',{mode:0o600});
  const routed=await runner.execute(['route','--manifest',file]);assert.equal(routed.routes[0].make.model,'gpt-6.1-sol');
  for(const command of ['run','review','verify'])await assert.rejects(runner.execute([command,'--manifest',file,'--task','candidate']),e=>e.exit===5);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('candidate real oracle refuses before authentication transport or provider launch',async()=>{
 const {runRealModelAttempt}=require('../model-runner-v3/real-model-attempt');
 await assert.rejects(runRealModelAttempt(),/inactive recovery candidate: live oracle not authorized/);
});
