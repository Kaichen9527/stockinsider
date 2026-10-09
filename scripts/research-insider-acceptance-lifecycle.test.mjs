import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {insiderAcceptanceLifecycle,stopInsiderAcceptanceChild,trackInsiderAcceptanceChild} from './research-insider-acceptance-lifecycle.mjs';

test('old unconditional receipt is a reproducible false-positive despite red TAP',async()=>{
 const child=spawn(process.execPath,['--input-type=module','-e',`import test from 'node:test';test('old fixture',async t=>{const report={};await t.test('child',async()=>{throw Error('controlled_child_failure')});report.passed=true;console.log('RECEIPT '+JSON.stringify(report));});`],{stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.resume();assert.equal(await new Promise(r=>child.on('close',r)),1);assert.match(output,/RECEIPT \{"passed":true\}/);
});

test('failed child check cannot produce positive receipt after await t.test resolves',async()=>{
 // The subprocess really uses node:test: a failed subtest resolves t.test and
 // keeps its parent callback running. Its persisted verdict must remain false.
 const helper=new URL('./research-insider-acceptance-lifecycle.mjs',import.meta.url).href;
 const child=spawn(process.execPath,['--input-type=module','-e',`import test from 'node:test';import {insiderAcceptanceLifecycle} from ${JSON.stringify(helper)};test('fixture',async t=>{const l=insiderAcceptanceLifecycle({signal:t.signal,timeoutMs:1000,requiredChecks:['one']});l.addCleanup(async()=>{});await t.test('child',()=>l.check('one',async()=>{throw Error('controlled_child_failure')}));console.log('RECEIPT '+JSON.stringify(await l.finish()));});`],{stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.resume();const code=await new Promise(r=>child.on('close',r));assert.equal(code,1);const receipt=JSON.parse(output.match(/RECEIPT (\{[^\n]+\})/)[1]);assert.equal(receipt.passed,false);assert.equal(receipt.checks.one,'failed');assert.equal(receipt.cleanupComplete,true);
});
test('real hanging HTTP aborted by hard deadline, owned child closed, late result cannot pass',async()=>{
 const l=insiderAcceptanceLifecycle({timeoutMs:80,requiredChecks:['hang']});const server=http.createServer(()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 l.addCleanup(async()=>{server.closeAllConnections();await new Promise((r,j)=>server.close(e=>e?j(e):r()));});
 const child=trackInsiderAcceptanceChild(spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','pipe','pipe']}));l.addCleanup(()=>stopInsiderAcceptanceChild(child));
 await assert.rejects(l.check('hang',signal=>fetch(`http://127.0.0.1:${server.address().port}`,{signal})),/deadline/);
 const verdict=await l.finish();assert.equal(verdict.passed,false);assert.equal(verdict.cleanupComplete,true);assert.equal(child.insiderCloseReceipt.closed,true);assert.equal(server.listening,false);
});
test('external cancellation triggers idempotent cleanup before hung operation returns',async()=>{
 const abort=new AbortController();const l=insiderAcceptanceLifecycle({signal:abort.signal,timeoutMs:1000,cleanupTimeoutMs:100,requiredChecks:['late']});let count=0,resolve;
 l.addCleanup(async()=>{count++;resolve();});const operation=l.check('late',()=>new Promise(r=>{resolve=r;}));await new Promise(r=>setImmediate(r));abort.abort(Error('controlled_cancel'));await assert.rejects(operation,/controlled_cancel/);
 const a=await l.finish(),b=await l.finish();assert.equal(a.passed,false);assert.equal(b.passed,false);assert.equal(a.cleanupComplete,true);assert.equal(count,1);assert.equal(a.checks.late,'failed');
});
test('pending, failed cleanup, log overflow and success have explicit bounded verdicts',async()=>{
 const missing=insiderAcceptanceLifecycle({timeoutMs:1000,requiredChecks:['missing']});assert.equal((await missing.finish()).passed,false);
 const bad=insiderAcceptanceLifecycle({timeoutMs:1000,requiredChecks:['ok'],cleanupTimeoutMs:20});bad.addCleanup(()=>new Promise(()=>{}));await bad.check('ok',async()=>{});assert.equal((await bad.finish()).passed,false);
 const overflow=insiderAcceptanceLifecycle({timeoutMs:1000,requiredChecks:[]});const log=overflow.boundedLog(5);log.append('12345');log.append('6');assert.equal(log.chunks.join(''),'12345');assert.equal((await overflow.finish()).passed,false);
 const good=insiderAcceptanceLifecycle({timeoutMs:1000,requiredChecks:['ok']});good.addCleanup(async()=>{});await good.check('ok',async()=>{});assert.deepEqual(await good.finish(),{passed:true,checks:{ok:'passed'},cleanupComplete:true,failure:null});
});

test('actual node:test cancellation aborts work and emits only a cleaned negative receipt',async()=>{
 const helper=new URL('./research-insider-acceptance-lifecycle.mjs',import.meta.url).href;
 const child=spawn(process.execPath,['--input-type=module','-e',`import test from 'node:test';import {insiderAcceptanceLifecycle} from ${JSON.stringify(helper)};test('timed fixture',{timeout:25},async t=>{const l=insiderAcceptanceLifecycle({signal:t.signal,timeoutMs:1000,requiredChecks:['hang']});let cleaned=false;l.addCleanup(async()=>{cleaned=true;});try{await l.check('hang',signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));}finally{console.log('RECEIPT '+JSON.stringify({...await l.finish(),fixtureCleaned:cleaned}));}});`],{stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.resume();assert.equal(await new Promise(r=>child.on('close',r)),1);const receipt=JSON.parse(output.match(/RECEIPT (\{[^\n]+\})/)[1]);assert.equal(receipt.passed,false);assert.equal(receipt.cleanupComplete,true);assert.equal(receipt.fixtureCleaned,true);
});
test('owned child ignoring TERM is killed and close confirmed within bounded cleanup',async()=>{
 const child=trackInsiderAcceptanceChild(spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.stdout.write('ready');setInterval(()=>{},1000)"],{stdio:['ignore','pipe','pipe']}));
 await new Promise(r=>child.stdout.once('data',r));await stopInsiderAcceptanceChild(child,{graceMs:20,killMs:500});assert.equal(child.signalCode,'SIGKILL');assert.equal(child.insiderCloseReceipt.closed,true);
});
