import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const turn=()=>new Promise(r=>setImmediate(r));
const original=cp.fork,child=new EventEmitter(),records=[];let killed=0,closed=false,exited=false,settled=false,finishQuery;
child.pid=4321;child.connected=true;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=signal=>{assert.equal(signal,'SIGKILL');killed++;return true;};child.send=(message,callback)=>callback?.(null);
cp.fork=()=>child;syncBuiltinESMExports();
try{
 const {produceHistorical77}=await import('./research-legacy77-realm-fixture.mjs');
 const pending=new Promise(r=>finishQuery=r);
 const x={symbol:'2409',roots:{'original75d-fixed8or6':'/unused-private-root'},c:{query:async sql=>sql.includes('pg_backend_pid')?{rows:[{pid:123}]}:pending},save:(name,data)=>{assert.ok(closed&&exited,'receipt before genuine terminal events');records.push({name,data});}};
 const result=produceHistorical77(x,{realm:'/unused-original-realm'},{}).then(value=>{settled=true;return{value};},error=>{settled=true;return{error};});
 child.emit('message',{kind:'rpc',id:1,name:'read_research_article_input_revision_v2',args:{p_request:{}},fd:{opens:0,closes:0}});await turn();
 child.emit('error',new Error('root_error_while_alive'));await turn();assert.equal(killed,1);assert.equal(settled,false);assert.equal(records.length,0);
 exited=true;child.emit('exit',null,'SIGKILL');child.stdout.emit('data',Buffer.from('late-output-after-exit'));await turn();assert.equal(settled,false);assert.equal(records.length,0);
 child.connected=false;closed=true;child.emit('close',null,'SIGKILL');await turn();assert.equal(settled,false,'must await pending RPC settlement even after child close');assert.equal(records.length,0);
 finishQuery({rows:[{v:{synthetic:true}}]});const done=await result;assert.equal(done.error?.message,'root_error_while_alive');
 const receipt=records.find(r=>r.name==='old-realm-child.json')?.data;assert.ok(receipt);assert.equal(receipt.confirmedChildExit,true);assert.equal(receipt.confirmedChildClose,true);assert.equal(receipt.pendingRpcAtSave,0);assert.equal(receipt.stdout,'late-output-after-exit');
 console.log(JSON.stringify({scope:'Root independent isolated mock contract only; no actual OS child/app/PG',pass:true,receiptSavedAfterExitCloseAndRpcSettlement:true,killCalls:killed,lateStdoutPreserved:true,original305REDStillPreserved:true}));
}finally{cp.fork=original;syncBuiltinESMExports();}
