import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {insiderGuardedPost} from './research-insider-continuation-command.mjs';
const key='local-controlled-http-fixture-only';
test('real loopback guarded adapter retains typed502, bounds bytes/UTF8 and refuses redirects',async t=>{
 let mode='typed';let requests=0;
 const server=http.createServer(async(req,res)=>{requests++;assert.equal(req.headers.authorization,`Bearer ${key}`);let bytes='';for await(const chunk of req)bytes+=chunk;assert.equal(JSON.parse(bytes).connector,'twse_insider');
  if(mode==='redirect'){res.writeHead(302,{location:'http://127.0.0.1:1/never'});res.end();return;}
  if(mode==='unknown'){res.writeHead(500);res.end('{"error":"private diagnostic never exported"}');return;}
  if(mode==='invalid_utf8'){res.writeHead(200);res.end(Buffer.from([0xff]));return;}
  if(mode==='stall'){req.on('close',()=>res.destroy());return;}
  const body=mode==='typed'?'{"ok":false,"result":{"typed":"pages_remaining"}}':`{}${' '.repeat(mode==='exact'?32766:32767)}`;
  res.writeHead(mode==='typed'?502:200,{'content-type':'application/json'});res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=new URL(`http://127.0.0.1:${server.address().port}/api/internal/source-sync`);
 const invoke=()=>insiderGuardedPost(url,{connector:'twse_insider'},key,{signal:AbortSignal.timeout(1000)});
 try{
  await t.test('actual502 body is available for strict progress validation',async()=>{const r=await invoke();assert.equal(r.status,502);assert.equal(r.body.result.typed,'pages_remaining');});
  await t.test('exact32KiB body allowed, +1 rejected without retry',async()=>{mode='exact';assert.deepEqual((await invoke()).body,{});mode='over';const before=requests;await assert.rejects(invoke(),/response_bound/);assert.equal(requests,before+1);});
  await t.test('redirect/error/invalidUTF8 rejected',async()=>{for(const m of ['redirect','unknown','invalid_utf8']){mode=m;await assert.rejects(invoke());}});
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
