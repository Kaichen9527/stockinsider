// Hermetic child lifecycle only: no PG, app modules, fixture extraction or real producer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {produceHistorical77} from './research-legacy77-realm-fixture.mjs';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(options,body){
 const original=childProcess.fork,saves=[],events=[];const child=new EventEmitter();
 child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.connected=true;child.pid=options.spawnFailure?undefined:12345;
 child.kill=signal=>{events.push(['kill',signal]);return true;};
 let request;
 child.send=(message,callback)=>{events.push(['send',message.kind]);if(message.kind==='start')request=message;callback?.(null);};
 childProcess.fork=()=>child;syncBuiltinESMExports();
 let settled=false;
 const x={
  symbol:'2409',roots:{'original75d-fixed8or6':'/unused-owned-root'},
  save:(name,data)=>{events.push(['save',name]);saves.push({name,data});},
  c:{query:async sql=>{
   events.push(['query',sql.startsWith('SELECT pg_backend_pid')?'pid':'rpc']);
   if(sql.startsWith('SELECT pg_backend_pid'))return{rows:[{pid:999}]};
   return options.query?options.query():{rows:[{v:{fixture:true}}]};
  }}
 };
 const run=produceHistorical77(x,{realm:'/unused-owned-realm'},{}).then(value=>{settled=true;return{value};},error=>{settled=true;return{error};});
 const ctx={child,saves,events,run,isSettled:()=>settled,request:()=>request};
 try{await body(ctx);}finally{
  // Contain even an assertion failure; fake close is never mistaken for a real OS observation.
  child.connected=false;child.emit('exit',1,null);child.emit('close',1,null);await run;
  childProcess.fork=original;syncBuiltinESMExports();
 }
}
function report(x){return x.saves.find(s=>s.name==='old-realm-child.json')?.data;}
async function successfulMessages(x){
 for(const[id,name,args,fd]of[
  [1,'assert_research_input_preparation_v2',{p_request:{},p_preparation_id:'synthetic',p_input_hash:'synthetic'},{opens:0,closes:0}],
  [2,'assert_research_input_preparation_v2',{p_request:{},p_preparation_id:'synthetic',p_input_hash:'synthetic'},{opens:8,closes:0}],
  [3,'seal_research_article_input_revision_v2',{p_request:{},p_calculation:{}},{opens:8,closes:8}],
 ]){x.child.emit('message',{kind:'rpc',id,name,args,fd});await turn();}
 x.child.emit('message',{kind:'success',saved:{lifecycleMock:true},fd:{opens:8,closes:8}});
}
await test('error while child alive must not claim termination or return before close',async()=>{
 await harness({},async x=>{
  x.child.emit('error',new Error('injected_child_error'));await turn();
  assert.equal(x.isSettled(),false,'error is not child termination');assert.equal(report(x),undefined,'no cleanup receipt before close');
  assert.deepEqual(x.events.filter(e=>e[0]==='kill'),[['kill','SIGKILL']]);
  x.child.emit('exit',null,'SIGKILL');await turn();assert.equal(x.isSettled(),false,'exit still awaits stdio close');
  x.child.stderr.emit('data',Buffer.from('late error drain'));x.child.connected=false;x.child.emit('close',null,'SIGKILL');
  const result=await x.run;assert.equal(result.error.message,'injected_child_error');assert.equal(report(x).confirmedChildExit,true);assert.equal(report(x).confirmedChildClose,true);assert.equal(report(x).stderr,'late error drain');
 });
});
await test('spawn failure has close but no invented exit or running child',async()=>{
 await harness({spawnFailure:true},async x=>{
  x.child.emit('error',Object.assign(new Error('spawn ENOENT'),{code:'ENOENT'}));await turn();assert.equal(x.isSettled(),false);assert.equal(report(x),undefined);assert.equal(x.events.some(e=>e[0]==='kill'),false);
  x.child.connected=false;x.child.emit('close',-2,null);const result=await x.run;
  assert.equal(result.error.code,'ENOENT');assert.equal(report(x).spawnFailed,true);assert.equal(report(x).confirmedChildExit,false);assert.equal(report(x).confirmedChildClose,true);
 });
});
await test('exit before late stdout drain waits for actual close',async()=>{
 await harness({},async x=>{
  await successfulMessages(x);x.child.emit('exit',0,null);await turn();assert.equal(x.isSettled(),false);assert.equal(report(x),undefined);
  x.child.stdout.emit('data',Buffer.from('after exit output'));x.child.stderr.emit('data',Buffer.from('after exit stderr'));
  x.child.connected=false;x.child.emit('close',0,null);const result=await x.run;assert.ok(result.value);assert.equal(report(x).stdout,'after exit output');assert.equal(report(x).stderr,'after exit stderr');assert.equal(report(x).confirmedChildClose,true);
 });
});
await test('normal exit and close records confirmed terminal success',async()=>{
 await harness({},async x=>{
  await successfulMessages(x);x.child.emit('exit',0,null);x.child.connected=false;x.child.emit('close',0,null);
  const result=await x.run;assert.ok(result.value);assert.equal(result.error,undefined);assert.equal(report(x).confirmedChildExit,true);assert.equal(report(x).confirmedChildClose,true);assert.equal(report(x).spawnFailed,false);assert.equal(x.events.some(e=>e[0]==='kill'),false);
 });
});
await test('closed child still waits for outstanding real-query promise settlement',async()=>{
 let finishQuery;const pending=new Promise(resolve=>{finishQuery=resolve;});
 await harness({query:()=>pending},async x=>{
  x.child.emit('message',{kind:'rpc',id:1,name:'read_research_article_input_revision_v2',args:{p_request:{}},fd:{opens:0,closes:0}});await turn();assert.ok(x.events.some(e=>e[0]==='query'&&e[1]==='rpc'));
  x.child.emit('error',new Error('pending_rpc_transport_error'));x.child.emit('exit',null,'SIGKILL');x.child.connected=false;x.child.emit('close',null,'SIGKILL');await turn();
  assert.equal(x.isSettled(),false,'RPC settlement remains owned after close');assert.equal(report(x),undefined);
  finishQuery({rows:[{v:{fixture:true}}]});const result=await x.run;assert.equal(result.error.message,'pending_rpc_transport_error');assert.equal(report(x).confirmedChildClose,true);assert.equal(report(x).pendingRpcAtSave,0);
 });
});
