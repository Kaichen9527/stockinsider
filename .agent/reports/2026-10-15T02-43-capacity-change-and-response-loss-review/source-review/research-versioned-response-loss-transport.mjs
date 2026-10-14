// Private disposable-fixture transport. No listener is started by importing this module.
import net from 'node:net';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash}from'node:crypto';
export const LOSS_LIMIT=4194304;
export function backendFrames(onFrame){
 let pending=Buffer.alloc(0),count=0;
 return {get pendingBytes(){return pending.length;},push(chunk){
  assert.ok(Buffer.isBuffer(chunk));assert.ok(chunk.length<=LOSS_LIMIT&&pending.length+chunk.length<=LOSS_LIMIT,'backend_buffer_bound');
  const next=Buffer.concat([pending,chunk]);pending.fill(0);pending=next;
  while(pending.length>=5){const length=pending.readUInt32BE(1);assert.ok(length>=4&&length+1<=LOSS_LIMIT,'backend_frame_length');if(pending.length<length+1)break;
   assert.ok(++count<=4096,'backend_frame_count');const frame=Buffer.from(pending.subarray(0,length+1)),rest=Buffer.from(pending.subarray(length+1));pending.fill(0);pending=rest;
   try{const type=String.fromCharCode(frame[0]);assert.match(type,/^[A-Za-z0-9]$/u,'backend_frame_type');onFrame(type,frame.subarray(5),frame.length);}finally{frame.fill(0);}
  }
 },wipe(){pending.fill(0);pending=Buffer.alloc(0);}};
}
export function sealResponseGate(){
 const frames=[];let command=0,rows=0,ready=false,bytes=0;
 return {frame(type,body,size){assert.ok(!ready,'backend_after_ready');bytes+=size;assert.ok(bytes<=LOSS_LIMIT,'held_response_bound');frames.push({type,bytes:size});
  assert.notEqual(type,'E','backend_error_response');assert.ok(['1','2','T','D','C','Z','N'].includes(type),'unexpected_seal_frame');
  if(type==='D')rows++;
  if(type==='C'){assert.ok(body.equals(Buffer.from('SELECT 1\0','ascii')),'seal_command');command++;}
  if(type==='Z'){assert.equal(body.length,1);assert.equal(body[0],73,'seal_not_idle');assert.equal(command,1);assert.equal(rows,1);ready=true;}
 },get ready(){return ready;},receipt(){assert.ok(ready);return{frames,commandCount:command,dataRowCount:rows,ready:'I',errorResponse:false,framedBytes:bytes};}};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});return{promise,resolve,reject};};
// base/port originate only from withLegalVersionedFixture's freshly created cluster.
export async function createOwnedPgLossRelay({base,port,save}){
 const stat=fs.lstatSync(base);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink());assert.equal(fs.realpathSync(base),base);assert.equal(stat.mode&0o777,0o700);assert.ok(Number.isInteger(port)&&port>=58100&&port<58500);
 const upstreamPath=path.join(base,'.s.PGSQL.'+port);assert.ok(fs.lstatSync(upstreamPath).isSocket());const directory=path.join(base,'loss-relay');fs.mkdirSync(directory,{mode:0o700});const socketPath=path.join(directory,'.s.PGSQL.'+port);assert.ok(Buffer.byteLength(socketPath)<100);
 let down,up,downClosed,upClosed,phase='passthrough',lastReady=null,held=[],heldBytes=0,forwardedBytes=0,forwardedAtArm=0,confirm,gate,timer,task,primary,accepted=0;
 const done=deferred(),sockets=new Set();let server;
 const wipe=()=>{for(const b of held)b.fill(0);held=[];parser.wipe();};
 const destroy=()=>{down?.destroy();up?.destroy();};
 const fail=error=>{primary??=error;destroy();if(!task)task=finish(false);};
 const parser=backendFrames((type,body,size)=>{if(phase==='holding')gate.frame(type,body,size);else{if(type==='Z'){assert.equal(body.length,1);lastReady=String.fromCharCode(body[0]);}}});
 async function finish(success){
  try{
   if(success){const protocol=gate.receipt();assert.equal(parser.pendingBytes,0);assert.equal(forwardedBytes-forwardedAtArm,0);phase='confirming';up.pause();
    const raw=Buffer.concat(held);try{save('held-backend-response-private.json',{bytes:heldBytes,sha256:createHash('sha256').update(raw).digest('hex'),rawBase64:raw.toString('base64'),protocol});}finally{raw.fill(0);}
    await confirm();if(primary)throw primary;phase='dropping';destroy();await Promise.all([downClosed,upClosed]);if(primary)throw primary;
    done.resolve({protocol,heldBytes,forwardedAfterArm:forwardedBytes-forwardedAtArm,observerCommitConfirmed:true,clientSocketClosed:true,upstreamSocketClosed:true,actualTransportDrop:true});
   }else{destroy();await Promise.all([downClosed,upClosed].filter(Boolean));done.reject(primary??new Error('relay_closed_without_loss'));}
  }catch(error){primary??=error;destroy();await Promise.all([downClosed,upClosed].filter(Boolean));done.reject(primary);}
  finally{clearTimeout(timer);wipe();phase='closed';}
 }
 server=net.createServer(client=>{
  if(++accepted!==1){client.destroy();fail(new Error('relay_single_client'));return;}
  down=client;sockets.add(down);downClosed=new Promise(resolve=>down.once('close',()=>{sockets.delete(down);resolve();if(!['dropping','closed'].includes(phase))fail(new Error('client_closed_before_loss_confirmation'));}));
  up=net.createConnection({path:upstreamPath});sockets.add(up);upClosed=new Promise(resolve=>up.once('close',()=>{sockets.delete(up);resolve();if(!['dropping','closed'].includes(phase)&&!primary)fail(new Error('upstream_closed_before_loss_confirmation'));}));
  down.on('error',fail);up.on('error',fail);down.pipe(up); // frontend bytes opaque; no SQL rewriting
  up.on('data',chunk=>{try{
   if(phase==='holding'){assert.ok(heldBytes+chunk.length<=LOSS_LIMIT,'held_response_bound');held.push(Buffer.from(chunk));heldBytes+=chunk.length;parser.push(chunk);if(gate.ready){assert.equal(parser.pendingBytes,0);task=finish(true);}}
   else if(phase==='passthrough'){parser.push(chunk);forwardedBytes+=chunk.length;if(!down.write(chunk))up.pause();}
   else throw new Error('backend_bytes_after_ready');
  }catch(error){fail(error);}});down.on('drain',()=>{if(phase==='passthrough')up.resume();});
 });
 server.on('error',fail);
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,()=>{server.off('error',reject);resolve();});});}catch(error){await close();throw error;}
 async function close(){
  if(phase!=='closed'){primary??=new Error('relay_cleanup_before_confirmed_loss');destroy();if(!task)task=finish(false);await task;}
  await new Promise(resolve=>server.close(()=>resolve()));assert.equal(sockets.size,0);clearTimeout(timer);wipe();
  if(fs.existsSync(socketPath))fs.unlinkSync(socketPath);if(fs.existsSync(directory))fs.rmdirSync(directory);
 }
 return{directory,loss:done.promise,arm(confirmCommitted){assert.equal(phase,'passthrough');assert.equal(accepted,1);assert.ok(up&&!up.connecting&&!up.destroyed&&down&&!down.destroyed);assert.equal(parser.pendingBytes,0);assert.equal(lastReady,'I');assert.equal(typeof confirmCommitted,'function');confirm=confirmCommitted;forwardedAtArm=forwardedBytes;gate=sealResponseGate();phase='holding';timer=setTimeout(()=>fail(new Error('relay_containment_timeout')),5000);},close};
}
