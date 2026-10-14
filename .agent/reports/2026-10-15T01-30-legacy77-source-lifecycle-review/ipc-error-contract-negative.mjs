import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createRequire,syncBuiltinESMExports} from 'node:module';
const childProcess=createRequire(import.meta.url)('node:child_process');
class Child extends EventEmitter {
 stdout=new PassThrough();stderr=new PassThrough();connected=true;pid=987654;alive=true;killCalls=0;exitEvents=0;closeEvents=0;
 send(message){if(message.kind==='start')queueMicrotask(()=>this.emit('error',new Error('isolated_ipc_transport_error_while_child_alive')));}
 kill(){this.killCalls++;this.alive=false;this.connected=false;queueMicrotask(()=>{this.exitEvents++;this.emit('exit',1,null);this.closeEvents++;this.emit('close',1,null);});return true;}
}
const child=new Child();childProcess.fork=()=>child;syncBuiltinESMExports();
const {produceHistorical77}=await import('./exact-helper.mjs');
let captured,caught;const x={symbol:'2409',roots:{'original75d-fixed8or6':'/not-used'},c:{query(){throw Error('PG must never be called in this isolated probe');}},save(name,value){captured={name,value};}};
try{await produceHistorical77(x,{realm:'/not-used'},{});}catch(error){caught=error;}
const observation={scope:'isolated mock-child lifecycle contract; not native/application/PG',caught:caught?.message,childAlive:child.alive,exitEvents:child.exitEvents,closeEvents:child.closeEvents,killCalls:child.killCalls,receiptConfirmedChildExit:captured?.value?.confirmedChildExit};
console.log(JSON.stringify(observation));
assert.equal(observation.caught,'isolated_ipc_transport_error_while_child_alive');
assert.equal(observation.receiptConfirmedChildExit,false,'must never claim child termination from error event while child remains alive');
