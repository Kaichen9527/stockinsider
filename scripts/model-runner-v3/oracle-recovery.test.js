'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const { runModelProcess, isOwnershipLost } = require('./processLifecycle');
const { withOracleAttempt, oracleRecoveryRoot } = require('./oracleRecovery');
async function lostOwnership() {
  let clock=0, pending;const child=new EventEmitter();child.pid=54123;
  for(const k of ['stdin','stdout','stderr']){child[k]=new EventEmitter();child[k].destroy=()=>{};}
  child.stdin.end=()=>child.stdin.emit('finish');
  const promise=runModelProcess({executable:'/synthetic',args:[],cwd:'/',env:{},input:'',timeout:60,verifyHost(){},spawnFn:()=>child,now:()=>clock,setTimer:fn=>(pending=fn,1),clearTimer(){},signalGroup(){assert.fail('dead leader must not be signalled');}}).catch(e=>e);
  child.emit('spawn');child.emit('exit',0,null);clock=5000;pending();const error=await promise;assert.ok(isOwnershipLost(error));return error;
}
function fixture(t){const parent=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'oracle-recovery-test-')));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));return path.join(parent,'ledger');}
test('actual oracle wrapper retains ownership-lost resources and refuses a restarted process before any role',async t=>{
 const root=fixture(t),loss=await lostOwnership();let calls=0;
 const wrapper={exports:{}};
 const source=fs.readFileSync(path.join(__dirname,'real-model-attempt.js'),'utf8');
 vm.runInNewContext(source,{module:wrapper,exports:wrapper.exports,__dirname,require:name=>{
   if(name==='./oracleRecovery')return {withOracleAttempt,oracleRecoveryRoot:()=>root};
   if(name==='./hostPreflight')return {loadHostPins:()=>({executables:[]})};
   if(name==='./execution')return {prepareTransport(){},executeModel:async()=>{calls++;throw loss;}};
   return require(name);
 }});
 await assert.rejects(wrapper.exports.runRealModelAttempt(),e=>e.exit===11);
 assert.equal(calls,1);const record=JSON.parse(fs.readFileSync(path.join(root,'active.json')));
 assert.equal(record.state,'recovery_required');assert.ok(fs.existsSync(path.join(record.directory,'make','view','tracked.txt')));
 await assert.rejects(wrapper.exports.runRealModelAttempt(),e=>e.exit===11);assert.equal(calls,1);
 const child=spawnSync(process.execPath,['-e',`require(${JSON.stringify(path.join(__dirname,'oracleRecovery.js'))}).withOracleAttempt(process.argv[1],()=>{process.exit(99)}).then(()=>process.exit(98),e=>process.exit(e.exit||97))`,root],{encoding:'utf8',timeout:2000});
 assert.equal(child.status,11);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'active.json'))),record);
});
test('success and proven-safe failure release only own resources; concurrent and abandoned fences refuse',async t=>{
 const root=fixture(t);let resolve,dir;
 const pending=withOracleAttempt(root,async d=>{dir=d;await new Promise(r=>resolve=r);return 42;});
 await assert.rejects(withOracleAttempt(root,()=>assert.fail('concurrent invocation')),e=>e.exit===11);
 resolve();assert.equal(await pending,42);assert.equal(fs.existsSync(dir),false);assert.equal(fs.existsSync(path.join(root,'active.json')),false);
 const safe=new Error('synthetic pre-spawn failure');await assert.rejects(withOracleAttempt(root,async()=>{throw safe}),e=>e===safe);assert.equal(fs.existsSync(path.join(root,'active.json')),false);
 fs.writeFileSync(path.join(root,'active.json'),'malformed abandoned inflight',{mode:0o600});
 await assert.rejects(withOracleAttempt(root,()=>assert.fail('abandoned invocation')),e=>e.exit===11);
 assert.equal(fs.readFileSync(path.join(root,'active.json'),'utf8'),'malformed abandoned inflight');
});
test('oracle refusal root is bound to OS account and has no HOME or environment override',()=>{
 const prior=process.env.HOME;try{process.env.HOME='/tmp/foreign';assert.equal(oracleRecoveryRoot(),path.join(os.userInfo().homedir,'.stockinsider-model-oracle-v1'));}finally{if(prior===undefined)delete process.env.HOME;else process.env.HOME=prior;}
});
test('oracle cleanup failure retains the durable refusal fence and owned bytes',async t=>{
 const root=fixture(t),original=fs.rmSync;
 fs.rmSync=()=>{throw new Error('synthetic cleanup failure');};
 try { await assert.rejects(withOracleAttempt(root,async dir=>{fs.writeFileSync(path.join(dir,'retained.txt'),'synthetic');return 42;}),e=>e.exit===11); } finally { fs.rmSync=original; }
 const record=JSON.parse(fs.readFileSync(path.join(root,'active.json')));assert.equal(record.state,'recovery_required');assert.equal(fs.readFileSync(path.join(record.directory,'retained.txt'),'utf8'),'synthetic');
 await assert.rejects(withOracleAttempt(root,()=>assert.fail('unsafe retry')),e=>e.exit===11);
});
test('real oracle worker propagates a closed IO_ERROR/11 with no success output',async()=>{
 const {RunnerError,diagnostic}=require('./artifacts');const error=new RunnerError(11);let stdout='',stderr='';
 const childProcess={stdout:{write:b=>stdout+=b},stderr:{write:b=>stderr+=b},exitCode:0};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'real-model-attempt-worker.js'),'utf8'),{process:childProcess,require:name=>name==='./real-model-attempt'?{runRealModelAttempt:async()=>{throw error;}}:require(name)});
 await new Promise(r=>setImmediate(r));assert.equal(stdout,'');assert.equal(stderr,diagnostic(error));assert.equal(childProcess.exitCode,11);
});
test('actual controller exit leaves in-progress fence that a new process cannot reclaim',async t=>{
 const root=fixture(t),module=path.join(__dirname,'oracleRecovery.js');
 const child=spawnSync(process.execPath,['-e',`require(${JSON.stringify(module)}).withOracleAttempt(process.argv[1],async d=>{require('node:fs').writeFileSync(require('node:path').join(d,'retained.txt'),'synthetic');process.exit(0)}).catch(()=>process.exit(98))`,root],{timeout:2000,encoding:'utf8'});
 assert.equal(child.status,0);const record=JSON.parse(fs.readFileSync(path.join(root,'active.json')));assert.equal(record.state,'in_progress');
 await assert.rejects(withOracleAttempt(root,()=>assert.fail('crashed attempt retry')),e=>e.exit===11);assert.equal(fs.readFileSync(path.join(record.directory,'retained.txt'),'utf8'),'synthetic');
});
test('unbranded uncertain probe failure retains fence, explicitly quiescent failure releases it',async t=>{
 const root=fixture(t),error=new Error('synthetic post-spawn probe failure');
 await assert.rejects(withOracleAttempt(root,async(d,safety)=>{safety.processStarting();throw error;}),e=>e.exit===11);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'active.json'))).state,'recovery_required');
 const safeRoot=path.join(path.dirname(root),'safe-ledger');
 await assert.rejects(withOracleAttempt(safeRoot,async(d,safety)=>{safety.processStarting();safety.quiescent();throw error;}),e=>e===error);
 assert.equal(fs.existsSync(path.join(safeRoot,'active.json')),false);
});
