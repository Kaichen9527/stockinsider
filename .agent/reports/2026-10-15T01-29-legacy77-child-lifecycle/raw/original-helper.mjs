// Private test helper. Does not register tests or enable a production execution realm.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fork} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
const directory=fileURLToPath(new URL('../fixtures/research-legacy77/',import.meta.url));
export function extractHistorical77Realm(secure){
 const index=JSON.parse(fs.readFileSync(path.join(directory,'source-index.json'),'utf8'));
 const gz=fs.readFileSync(path.join(directory,'source-realm-15d4.json.gz'));assert.equal(sha(gz),index.fixture.sha256);assert.equal(gz.length,index.fixture.bytes);
 const expanded=gunzipSync(gz,{maxOutputLength:2000000});assert.equal(expanded.length,index.fixture.expandedBytes);const capsule=JSON.parse(expanded);
 assert.equal(capsule.sourceClosureHash,index.closureRecomputed);assert.equal(capsule.files.length,index.files.length);
 const realm=path.join(secure,'historical77-realm');fs.mkdirSync(realm,{mode:0o700});
 for(let i=0;i<capsule.files.length;i++){
  const file=capsule.files[i],pin=index.files[i];assert.deepEqual(file.pin,pin);assert.match(pin.file,/^(?:web\/|package\.json$|\.nvmrc$)/);assert.ok(!pin.file.split('/').includes('..'));
  const bytes=Buffer.from(file.rawBase64,'base64');assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256);
  const target=path.join(realm,pin.file);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});
 }
 return {realm,mapping:JSON.parse(fs.readFileSync(path.join(realm,'web/src/lib/research-complete-mapping.json'),'utf8')),index};
}
export async function produceHistorical77(x,material,request){
 const trace=[],queries=new Set();let result,reportedFailure,transportError;const stdout=[],stderr=[];
 const child=fork(fileURLToPath(new URL('./research-legacy77-child-driver.mjs',import.meta.url)),[],{execPath:process.execPath,execArgv:['--import',fileURLToPath(new URL('./research-versioned-prerequisite-fs-witness.mjs',import.meta.url)),'--experimental-strip-types'],silent:true,serialization:'json'});
 child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));
 const exit=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',error=>{transportError=error;resolve({code:null,signal:null});});});
 child.on('message',message=>{
  if(message.kind==='success'){result=message;return;}if(message.kind==='failure'){reportedFailure=message;return;}if(message.kind!=='rpc')return;
  const work=(async()=>{
   const signatures={read_research_article_input_revision_v2:['p_request'],assert_research_input_preparation_v2:['p_request','p_preparation_id','p_input_hash'],seal_research_article_input_revision_v2:['p_request','p_calculation']};
   try{assert.ok(signatures[message.name]);assert.deepEqual(Object.keys(message.args).sort(),signatures[message.name].slice().sort());
    trace.push({ordinal:trace.length,name:message.name,fd:message.fd,writerPid:(await x.c.query('SELECT pg_backend_pid() pid')).rows[0].pid});
    const data=(await x.c.query(`SELECT public.${message.name}(${signatures[message.name].map((_,i)=>'$'+(i+1)).join(',')}) v`,signatures[message.name].map(k=>message.args[k]))).rows[0].v;
    if(child.connected)child.send({kind:'rpc-result',id:message.id,data});
   }catch(error){x.save('old-rpc-error.json',{name:message.name,code:error.code,message:error.message,where:error.where});if(child.connected)child.send({kind:'rpc-result',id:message.id,error:{code:error.code,message:error.message}});}
  })();queries.add(work);void work.finally(()=>queries.delete(work));
 });
 // Harness watchdog is not an extension to the original in-module 10s deadline.
 const watchdog=setTimeout(()=>{transportError=new Error('historical_child_watchdog');child.kill('SIGKILL');},30000);
 child.send({kind:'start',realm:material.realm,root:x.roots['original75d-fixed8or6'],symbol:x.symbol,request});
 const terminal=await exit;clearTimeout(watchdog);await Promise.allSettled([...queries]);
 x.save('old-realm-child.json',{terminal,result,reportedFailure,trace,stdout:Buffer.concat(stdout).toString(),stderr:Buffer.concat(stderr).toString(),pid:child.pid,confirmedChildExit:true,transportError:transportError?.message});
 if(transportError)throw transportError;assert.equal(terminal.code,0,reportedFailure?.error?.message);assert.ok(result);assert.equal(reportedFailure,undefined);
 const n=x.symbol==='2409'?8:6,checks=trace.filter(v=>v.name==='assert_research_input_preparation_v2'),seal=trace.filter(v=>v.name==='seal_research_article_input_revision_v2');
 assert.equal(checks.length,2);assert.deepEqual(checks[0].fd,{opens:0,closes:0});assert.deepEqual(checks[1].fd,{opens:n,closes:0});assert.equal(seal.length,1);assert.deepEqual(seal[0].fd,{opens:n,closes:n});
 return result;
}
