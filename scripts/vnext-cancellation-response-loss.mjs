/** Private native-test transport. No TCP listener, production connection or RPC retry.
 * Hold the complete successful SELECT response, independently observe COMMIT,
 * then destroy both owned Unix sockets. Pure frame checks are not native proof. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const {Client}=createRequire(import.meta.url)('pg');
const MAX_BYTES=4*1024*1024,MAX_FRAMES=4096,CONTAINMENT_MS=5000;
const hash=b=>createHash('sha256').update(b).digest('hex');
/** Decode only one successful SELECT JSON column. Never publish its contents. */
export function heldSelect(bytes){
 assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=MAX_BYTES,'owned_held_response_bound');
 let offset=0;const frames=[];
 while(offset<bytes.length){
  if(bytes.length-offset<5)return null;
  const length=bytes.readInt32BE(offset+1);assert.ok(length>=4&&length<=MAX_BYTES,'owned_backend_frame_length');
  if(offset+1+length>bytes.length)return null;
  frames.push({type:String.fromCharCode(bytes[offset]),payload:bytes.subarray(offset+5,offset+1+length)});
  assert.ok(frames.length<=MAX_FRAMES,'owned_backend_frame_count');offset+=1+length;
 }
 if(!frames.some(f=>f.type==='Z'))return null;
 assert.deepEqual(frames.map(f=>f.type),['T','D','C','Z'],'owned_successful_select_frame_sequence');
 assert.ok(frames[0].payload.length>=2);assert.equal(frames[0].payload.readInt16BE(0),1);
 assert.equal(frames[2].payload.toString(),'SELECT 1\0');assert.equal(frames[3].payload.toString(),'I');
 const data=frames[1].payload;assert.ok(data.length>=6);assert.equal(data.readInt16BE(0),1);
 const size=data.readInt32BE(2);assert.ok(size>0&&size===data.length-6);
 const result=JSON.parse(data.subarray(6).toString('utf8'));
 assert.ok(result&&typeof result==='object'&&!Array.isArray(result));
 return {result,frames:frames.map(f=>({type:f.type,bytes:f.payload.length+5})),bytes:bytes.length,sha256:hash(bytes),oneDataRow:true,selectOne:true,noError:true,ready:'I'};
}
export async function loseCancellationReviewResponse({fixture,principal,request,release,verifyCommitted,verifyBackendAbsent}){
 assert.equal(process.env.VNEXT_TEST_CONTAINER,'stockinsider-vnext-oct22-worker-12');
 assert.equal(process.env.VNEXT_WORKER_SOCKET_PARENT,'/tmp/stockinsider-vnext-oct22-private/worker-pg-socket-12');
 assert.ok(path.isAbsolute(fixture.output)&&!fs.lstatSync(fixture.output).isSymbolicLink());
 assert.equal(request.jobId,request.jobId.toLowerCase());assert.match(request.jobId,/^[a-f0-9-]{36}$/u);
 const directory=path.join(fixture.output,'review-response-loss');assert.equal(fs.existsSync(directory),false);fs.mkdirSync(directory,{mode:0o700});
 const socketPath=path.join(directory,'.s.PGSQL.5432');assert.ok(Buffer.byteLength(socketPath)<104);
 let downstream,upstream,armed=false,held=Buffer.alloc(0),handling=false,proxyError,queryPending=false,accepted=0,backendPid;
 let verifiedResolve,verifiedReject,closeResolve;const verified=new Promise((resolve,reject)=>{verifiedResolve=resolve;verifiedReject=reject;});verified.catch(()=>{});
 const closed=new Promise(resolve=>{closeResolve=resolve;});let closedCount=0;
 const noteClose=()=>{if(++closedCount===2)closeResolve();};
 const server=net.createServer(client=>{
  if(++accepted!==1){client.destroy();proxyError=Error('owned_single_client_required');verifiedReject(proxyError);return;}
  downstream=client;upstream=net.createConnection({path:path.join(process.env.VNEXT_WORKER_SOCKET_PARENT,'socket','.s.PGSQL.5432')});
  client.once('close',noteClose);upstream.once('close',noteClose);
  const fail=error=>{proxyError=error;verifiedReject(error);client.destroy();upstream.destroy();};
  client.on('error',fail);upstream.on('error',fail);client.on('data',chunk=>upstream.write(chunk));
  upstream.on('data',chunk=>{
   if(!armed){client.write(chunk);return;}
   try{
    assert.ok(!handling,'owned_backend_after_ready');assert.ok(held.length+chunk.length<=MAX_BYTES,'owned_held_response_bound');
    held=Buffer.concat([held,chunk]);const decoded=heldSelect(held);if(!decoded)return;handling=true;
    void (async()=>{
     try{
      fixture.save('review-held-successful-protocol-private',{base64:held.toString('base64'),sha256:hash(held),bytes:held.length});
      const observer=await verifyCommitted(decoded.result,backendPid);
      assert.equal(observer.commitVisible,true);assert.notEqual(observer.pid,backendPid);
      fixture.save('review-loss-commit-observer-private',observer);
      const witness={...decoded,result:undefined,forwardedResponseBytes:0,backendPid,observerPid:observer.pid,commitObservedBeforeSocketClose:true};
      verifiedResolve(witness);client.destroy();upstream.destroy();
     }catch(error){fail(error);}
    })();
   }catch(error){fail(error);}
  });
 });
 const client=new Client({host:directory,user:'postgres',database:'vnext_worker',ssl:false,connectionTimeoutMillis:3000,statement_timeout:30000});
 let timer,queryError,witness,primary;const clientErrors=[];client.on('error',error=>clientErrors.push(error));
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});fs.chmodSync(socketPath,0o600);
  await client.connect();backendPid=client.processID;
  await client.query('SET ROLE service_role');await client.query("SELECT set_config('request.headers',$1,false),set_config('request.jwt.claims',$2,false)",[JSON.stringify({'x-stockinsider-writer-release':release}),JSON.stringify({role:'service_role'})]);
  assert.equal(accepted,1);armed=true;queryPending=true;
  const query=client.query('SELECT public.vnext_command_v1($1,$2,$3::jsonb) AS result',[principal,'review',JSON.stringify(request)]);
  const containment=new Promise((_,reject)=>{timer=setTimeout(()=>{const error=Error('owned_loss_containment_expired');verifiedReject(error);downstream?.destroy();upstream?.destroy();reject(error);},CONTAINMENT_MS);});
  const actualQuery=query.then(value=>{queryPending=false;throw Object.assign(Error('owned_response_must_not_be_delivered'),{unexpected:value});},error=>{queryPending=false;queryError=error;return error;});
  [witness]=await Promise.race([Promise.all([verified,actualQuery,closed]),containment]);
  assert.ok(queryError);assert.equal(queryPending,false);assert.equal(proxyError,undefined);assert.equal(closedCount,2);
  fixture.save('review-response-loss-private',{...witness,actualQueryRejected:true,errorName:queryError.name,errorMessageSha256:hash(queryError.message),clientErrors:clientErrors.map(e=>({name:e.name,messageSha256:hash(e.message)})),bothOwnedSocketsClosed:true,pendingQuery:false,automaticResend:false});
  throw queryError;
 }catch(error){primary=error;throw error;}
 finally{
  clearTimeout(timer);downstream?.destroy();upstream?.destroy();await client.end().catch(error=>{if(!primary)throw error;});
  if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  // net.Server owns precisely this Unix socket and removes it on close.
  assert.equal(fs.existsSync(socketPath),false);assert.equal(queryPending,false);if(backendPid)await verifyBackendAbsent(backendPid);fs.rmdirSync(directory);
  fixture.save('review-response-loss-transport-cleanup',{accepted,backendPid,closedCount,pendingQuery:queryPending,socketAbsent:true,ownedDirectoryAbsent:!fs.existsSync(directory),source:'actual Unix PG transport; no timeout stands in for successful COMMIT'});
 }
}
