import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp,readFile,writeFile,rm,stat,symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readPinnedPublicSource,executeSourceController,sourceControllerCommand } from './research-source-controller.mjs';
import { SOURCE_CONTROLLER_LIMITS } from '../web/src/lib/research-source-attempt-controller.ts';

const url='https://openapi.twse.com.tw/v1/opendata/t187ap03_L';
function scope(overrides={}) {
  return {id:'issuer-data',platform:'official',url,scope:'one GET of reviewed official issuer dataset',
    method:'public_read',contentScope:'official_document',rights:{basis:'official_public_document',
      checkedAt:new Date(Date.now()-1000).toISOString(),checkedBy:'reviewed-issuer-domain'},...overrides};
}
const input=(scopes=[scope()])=>({runId:'11111111-1111-4111-8111-111111111111',scopes});
const lookup=async()=>[{address:'203.66.75.1',family:4}];
function transport({status=200,body='[{"symbol":"2409"}]',contentType='application/json',linger=false,chunkBytes=null}={}) {
  const calls=[];
  const request=(actualUrl,options,callback)=>{
    calls.push({url:actualUrl.toString(),options});
    const req=new EventEmitter();
    req.destroy=(error)=>{if(error) req.emit('error',error);};
    options.signal.addEventListener('abort',()=>req.destroy(new Error('abort')),{once:true});
    req.end=()=>queueMicrotask(()=>{
      const res=new EventEmitter();res.statusCode=status;res.headers={'content-type':contentType};res.destroy=()=>{};
      callback(res);
      if(status>=200 && status<300) {
        res.emit('data',chunkBytes || Buffer.from(body));
        if(!linger) res.emit('end');
      }
    });
    return req;
  };
  return {request,calls};
}

test('SCT01 pins a validated public address, one page, no credentials, and keeps only hashes/metadata',async()=>{
  const mocked=transport();
  const result=await readPinnedPublicSource(scope(),{lookup,request:mocked.request});
  assert.equal(result.outcome,'read_success');assert.equal(result.httpStatus,200);assert.equal(result.bodyPresent,true);
  assert.match(result.responseHash,/^[a-f0-9]{64}$/u);
  assert.equal('body' in result,false);assert.equal(mocked.calls.length,1);
  assert.equal(mocked.calls[0].options.headers.Cookie,undefined);
  assert.equal(mocked.calls[0].options.headers.Authorization,undefined);
  mocked.calls[0].options.lookup('ignored',{},(error,address,family)=>{
    assert.equal(error,null);assert.equal(address,'203.66.75.1');assert.equal(family,4);
  });
  mocked.calls[0].options.lookup('ignored',{all:true},(error,addresses)=>{
    assert.equal(error,null);assert.deepEqual(addresses,[{address:'203.66.75.1',family:4}]);
  });
});

test('SCT02 private/mixed DNS answers reject before HTTP; no DNS-rebinding fallback',async()=>{
  for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1','192.0.2.1']) {
    const mocked=transport();
    const result=await readPinnedPublicSource(scope(),{lookup:async()=>[{address:'203.66.75.1'},{address}],request:mocked.request});
    assert.equal(result.errorCode,'source_private_address');assert.equal(mocked.calls.length,0);
  }
});

test('SCT03 404, upstream failure, login and redirects stay failed without following links',async()=>{
  for(const [status,errorCode,outcome] of [[404,'source_http_404','read_failed'],[500,'source_http_500','read_failed'],
    [302,'source_redirect_rejected','read_failed'],[401,'source_auth_required','auth_required'],[403,'source_auth_required','auth_required']]) {
    const mocked=transport({status});const result=await readPinnedPublicSource(scope(),{lookup,request:mocked.request});
    assert.equal(result.outcome,outcome);assert.equal(result.errorCode,errorCode);assert.equal(mocked.calls.length,1);
    assert.equal(result.responseHash,null);assert.equal(result.bodyPresent,false);
  }
  const mocked=transport({contentType:'text/html',body:'<form><input type="password"></form>'});
  assert.equal((await readPinnedPublicSource(scope(),{lookup,request:mocked.request})).outcome,'auth_required');
});

test('SCT04 body bound, total DNS/read deadlines and invalid UTF8 reject',async()=>{
  const large=transport({chunkBytes:Buffer.alloc(SOURCE_CONTROLLER_LIMITS.bodyBytes+1)});
  assert.equal((await readPinnedPublicSource(scope(),{lookup,request:large.request})).errorCode,'source_body_bound');
  const dnsTimeout=await readPinnedPublicSource(scope(),{timeoutMs:10,lookup:()=>new Promise(()=>{})});
  assert.equal(dnsTimeout.errorCode,'source_timeout');
  const stalled=transport({linger:true});
  assert.equal((await readPinnedPublicSource(scope(),{lookup,request:stalled.request,timeoutMs:10})).errorCode,'source_timeout');
  const bad=transport({chunkBytes:Buffer.from([0xff,0xfe])});
  assert.equal((await readPinnedPublicSource(scope(),{lookup,request:bad.request})).errorCode,'source_decode_failed');
});

test('SCT05 no irrelevant inference or summary fabrication; exact scope sourceAttempts retain failures',async()=>{
  const mocked=transport();
  const reader=(s,o)=>readPinnedPublicSource(s,{...o,lookup,request:mocked.request});
  const run=await executeSourceController(input(),{reader});
  assert.equal(run.inboxRequest.items.length,0);assert.equal(run.receipts[0].outcome,'awaiting_summary');
  assert.equal(run.priorityRequest.sourceAttempts[0].status,'failed');
  assert.equal(run.priorityRequest.sourceAttempts[0].errorCode,'source_awaiting_summary');
  assert.equal(run.priorityRequest.sourceAttempts[0].scope.includes(url),true);
  assert.equal(run.authoritativePublication,false);assert.equal(run.strategyApproved,false);
  assert.match(run.runHash,/^[a-f0-9]{64}$/u);
});

test('SCT06 controller consumes authorized local summaries without public HTTP or paid/model dispatch',async()=>{
  const now=new Date().toISOString();
  const local=scope({platform:'threads',url:'https://www.threads.net/@analyst/post/example',method:'local_authorized_summary',
    contentScope:'article_body',rights:{basis:'authorized_local_summary',checkedAt:now,checkedBy:'Mac operator'},
    localRead:{attemptedAt:now,outcome:'read_success'},summary:{sourcePlatform:'threads',sourceUrl:'https://www.threads.net/@analyst/post/example',
      author:'local analyst',publishedAt:new Date(Date.now()-60_000).toISOString(),observedAt:now,symbols:['2409'],
      shortSummary:'僅有一項合成傳聞，等待官方驗證。',catalyst:'合成測試線索。',risk:'不是官方事實。',claimStatus:'rumor',
      visibility:'authenticated_summary',contentForm:'research_summary',acquisitionMethod:'authenticated_browser_summary'}});
  const run=await executeSourceController(input([local]),{reader:()=>{throw new Error('public reader must not run');}});
  assert.equal(run.inboxRequest.items.length,1);assert.equal(run.inboxRequest.items[0].claimStatus,'rumor');
  assert.equal(JSON.stringify(run).includes('cookie'),false);
});

test('SCT07 CLI bounds files, rejects symlinks/URL injection, writes mode0600 and cannot overwrite',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'source-controller-'));
  try {
    const packet=path.join(root,'input.json');const output=path.join(root,'receipt.json');
    await writeFile(packet,JSON.stringify(input()));
    let reads=0;
    const reader=async(s,o)=>{reads++;const mocked=transport();return readPinnedPublicSource(s,{...o,lookup,request:mocked.request});};
    await sourceControllerCommand(['--input',packet,'--output',output],{reader});
    const before=await readFile(output);
    assert.equal((await stat(output)).mode & 0o777,0o600);
    await assert.rejects(sourceControllerCommand(['--input',packet,'--output',output],{reader}),/EEXIST/);
    assert.equal(reads,1);assert.deepEqual(await readFile(output),before);
    await assert.rejects(sourceControllerCommand(['--input','relative','--output',path.join(root,'relative.json')]),/absolute_path/);
    const link=path.join(root,'link.json');await symlink(packet,link);
    await assert.rejects(sourceControllerCommand(['--input',link,'--output',path.join(root,'symlink-result.json')]),/ELOOP/);
    await writeFile(packet,JSON.stringify(input([scope({url:url+'?redirect=https://127.0.0.1'})])));
    await assert.rejects(sourceControllerCommand(['--input',packet,'--output',path.join(root,'injection.json')]),/url_rejected/);
    assert.equal(reads,1);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('SCT08 run deadline does not pretend remaining scopes were attempted',async()=>{
  const ticks=[0,0,SOURCE_CONTROLLER_LIMITS.runMs+1,SOURCE_CONTROLLER_LIMITS.runMs+1];let reads=0;
  const earlier=new Date(Date.now()-1000).toISOString();
  const local=scope({id:'local-after-deadline',platform:'threads',url:'https://www.threads.net/@analyst/post/example',
    method:'local_authorized_summary',contentScope:'article_body',
    rights:{basis:'authorized_local_summary',checkedAt:earlier,checkedBy:'Mac operator'},
    localRead:{attemptedAt:earlier,outcome:'read_failed',errorCode:'source_read_failed'}});
  const run=await executeSourceController(input([scope(),scope({id:'second'}),local]),{
    monotonicNow:()=>ticks.shift(),reader:async(s,o)=>{
      reads++;const mocked=transport();return readPinnedPublicSource(s,{...o,lookup,request:mocked.request});
    },
  });
  assert.equal(reads,1);assert.equal(run.priorityRequest.sourceAttempts[1].status,'not_attempted');
  assert.equal(run.receipts[1].readAttempted,false);assert.equal(run.receipts[1].errorCode,'source_run_deadline');
  assert.equal(run.receipts[2].outcome,'not_attempted');assert.equal(run.receipts[2].readAttempted,false);
  assert.equal(run.inboxRequest.items.length,0);
});

test('SCT09 response hash binds exact wire bytes, including UTF8 BOM; TLS remains verified',async()=>{
  const bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('[{"symbol":"2409"}]')]);
  const mocked=transport({chunkBytes:bytes});
  const read=await readPinnedPublicSource(scope(),{lookup,request:mocked.request});
  assert.equal(read.outcome,'read_success');
  assert.equal(read.responseHash,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(read.bytes,bytes.length);
  assert.equal(mocked.calls[0].options.rejectUnauthorized,true);
  assert.equal(mocked.calls[0].options.headers['Accept-Encoding'],'identity');
});

// SCT-POD01: hostile future feed links do not become another request.
test('SCT-POD01 controller-only publisher RSS cannot follow transcript, chapters or audio',async()=>{
 const url='https://feeds.soundon.fm/podcasts/06e16cf5-5b45-4863-bcdf-9343aa584f73.xml';
 const s=scope({id:'investanchors-index',platform:'podcast',url,scope:'exact public publisher RSS metadata only',contentScope:'metadata_index',rights:{basis:'creator_published_index',checkedAt:new Date(Date.now()-1000).toISOString(),checkedBy:'public-directory-review'}});
 const mocked=transport({contentType:'application/rss+xml',body:'<rss xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><item><title>index</title><podcast:transcript url="https://feeds.soundon.fm/transcript.json" type="application/json"/><podcast:chapters url="https://feeds.soundon.fm/chapters.json" type="application/json"/><enclosure url="https://filesb.soundon.fm/audio.mp3" type="audio/mpeg"/></item></channel></rss>'});
 const reader=(scope,options)=>readPinnedPublicSource(scope,{...options,lookup,request:mocked.request});
 const run=await executeSourceController(input([s]),{reader});
 assert.equal(mocked.calls.length,1);assert.equal(mocked.calls[0].url,url);
 assert.equal(run.receipts[0].outcome,'metadata_only');assert.equal(run.receipts[0].bodyPresent,false);
 assert.equal(run.inboxRequest.items.length,0);assert.equal(run.authoritativePublication,false);assert.equal(run.strategyApproved,false);
});
