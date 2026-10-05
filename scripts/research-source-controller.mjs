import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPublicNetworkAddress } from '../web/src/lib/pinned-https-fetch.ts';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';
import { assembleSourceControllerRun, inspectSourceBody, publicSourceGrant, sourceControllerUrl,
  SOURCE_CONTROLLER_LIMITS, validateSourceControllerInput } from '../web/src/lib/research-source-attempt-controller.ts';

const clock = () => new Date().toISOString();

/** Adds a total wall deadline (including DNS) to the existing public-address
 * validator/pinned-socket pattern. No cookie jar, redirects, arbitrary headers,
 * shell, browser execution, model calls or paid API. Body is discarded in RAM. */
export async function readPinnedPublicSource(scope, { timeoutMs = SOURCE_CONTROLLER_LIMITS.timeoutMs,
  lookup, request = https.request, now = clock } = {}) {
  const attemptedAt=now();
  if (!publicSourceGrant(scope)) throw new Error('source_controller_public_grant_missing');
  const url=sourceControllerUrl(scope.url);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const resolver=lookup ? null : new dns.Resolver({timeout:Math.max(1,timeoutMs),tries:1});
  controller.signal.addEventListener('abort',()=>resolver?.cancel(),{once:true});
  const resolveAddresses=lookup || (async(host)=>{
    const resolved=await Promise.allSettled([resolver.resolve4(host),resolver.resolve6(host)]);
    const addresses=resolved.flatMap((result)=>result.status==='fulfilled' ? result.value : []);
    if(!addresses.length) throw new Error('source_network_failed');
    return addresses.map((address)=>({address,family:net.isIP(address)}));
  });
  let status=null;
  let size=0;
  try {
    const addresses=await Promise.race([
      resolveAddresses(url.hostname,{all:true,verbatim:true}),
      new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('source_timeout')),{once:true})),
    ]);
    if (!addresses.length || !addresses.every((entry)=>isPublicNetworkAddress(entry.address)))
      throw new Error('source_private_address');
    if (controller.signal.aborted) throw new Error('source_timeout');
    const response=await new Promise((resolve,reject)=>{
      const req=request(url,{
        method:'GET',signal:controller.signal,servername:url.hostname,rejectUnauthorized:true,
        headers:{Accept:'text/html, application/json, application/rss+xml, text/csv;q=0.9',
          'Accept-Encoding':'identity','User-Agent':'StockInsider-Bounded-Source-Canary/1.0'},
        // Node's network family selection requests all answers. Return only
        // the already validated/pinned set; never perform a second DNS lookup.
        lookup:(_host,options,callback)=>options?.all
          ? callback(null,addresses.map(({address})=>({address,family:net.isIP(address)})))
          : callback(null,addresses[0].address,net.isIP(addresses[0].address)),
      },(res)=>{
        status=res.statusCode || 0;
        if (status < 200 || status >= 300) {
          res.destroy(); reject(new Error(status===401 || status===403 ? 'source_auth_required'
            : status>=300 && status<400 ? 'source_redirect_rejected' : `source_http_${status}`)); return;
        }
        const chunks=[];
        res.on('data',(chunk)=>{
          size+=Buffer.byteLength(chunk);
          if (size>SOURCE_CONTROLLER_LIMITS.bodyBytes) {
            const error=new Error('source_body_bound');reject(error);req.destroy(error);return;
          }
          chunks.push(Buffer.from(chunk));
        });
        res.on('error',reject);
        res.on('aborted',()=>reject(new Error('source_response_aborted')));
        res.on('end',()=>{
          try {
            const bytes=Buffer.concat(chunks);
            resolve({body:new TextDecoder('utf-8',{fatal:true}).decode(bytes),
              responseHash:createHash('sha256').update(bytes).digest('hex'),contentType:String(res.headers['content-type'] || '')});
          }
          catch {reject(new Error('source_decode_failed'));}
        });
      });
      req.on('error',reject);req.end();
    });
    const inspected=inspectSourceBody(scope,response.body,response.contentType);
    return {attemptedAt,completedAt:now(),httpStatus:status,bytes:size,...inspected,responseHash:response.responseHash,
      errorCode:inspected.outcome==='read_success' ? null : `source_${inspected.outcome}`};
  } catch (error) {
    // Never export exception messages: providers may echo URLs or credentials.
    const message=error instanceof Error ? error.message : '';
    const known=/^source_(?:timeout|private_address|auth_required|redirect_rejected|body_bound|decode_failed|response_aborted|http_\d{3})$/u.test(message);
    const errorCode=controller.signal.aborted ? 'source_timeout' : known ? message : 'source_network_failed';
    return {attemptedAt,completedAt:now(),outcome:errorCode==='source_auth_required' ? 'auth_required' : 'read_failed',
      httpStatus:status,bytes:Math.min(size,SOURCE_CONTROLLER_LIMITS.bodyBytes),responseHash:null,bodyPresent:false,publishedAt:null,errorCode};
  } finally {clearTimeout(timer);}
}

export async function executeSourceController(value,{reader=readPinnedPublicSource,now=clock,monotonicNow=()=>performance.now()}={}) {
  const startedAt=now();
  const input=validateSourceControllerInput(value,startedAt);
  const deadline=monotonicNow()+SOURCE_CONTROLLER_LIMITS.runMs;
  const observations=[];
  for (const scope of input.scopes) {
    const remaining=deadline-monotonicNow();
    if (remaining<=0) {
      observations.push({attemptedAt:now(),completedAt:now(),outcome:'not_attempted',httpStatus:null,
        bytes:0,responseHash:null,bodyPresent:false,publishedAt:null,errorCode:'source_run_deadline'});continue;
    }
    if (scope.method==='public_read') {
      observations.push(await reader(scope,{timeoutMs:Math.min(remaining,SOURCE_CONTROLLER_LIMITS.timeoutMs)}));
    } else {
      // Mac sends only an attested bounded summary plus actual read terminal,
      // never a browser session, provider credential or raw member body.
      const local=scope.localRead;
      observations.push({attemptedAt:local.attemptedAt,completedAt:now(),outcome:local.outcome,httpStatus:null,
        bytes:0,responseHash:null,bodyPresent:local.outcome==='read_success' && scope.contentScope!=='metadata_index',
        publishedAt:scope.summary?.publishedAt || null,errorCode:local.errorCode || null});
    }
  }
  const run=assembleSourceControllerRun(input,observations,now());
  const result={...run,startedAt,explicitRunOnly:true,inputHash:researchCanonicalHash(input)};
  return {...result,runHash:researchCanonicalHash(result)};
}

async function readPacket(filename) {
  if (!path.isAbsolute(filename || '')) throw new Error('source_controller_absolute_path_required');
  const handle=await open(filename,constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info=await handle.stat();
    if (!info.isFile() || info.size>SOURCE_CONTROLLER_LIMITS.inputBytes) throw new Error('source_controller_input_file_bound');
    const bytes=Buffer.alloc(info.size+1);
    let offset=0;
    while(offset<bytes.length) {
      const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);
      if (!bytesRead) break;offset+=bytesRead;
    }
    if(offset!==info.size) throw new Error('source_controller_input_changed');
    return JSON.parse(bytes.subarray(0,offset).toString('utf8'));
  } finally {await handle.close();}
}
export async function sourceControllerCommand(args,options={}) {
  if(args.length!==4 || args[0]!=='--input' || args[2]!=='--output'
    || !path.isAbsolute(args[3])) throw new Error('source_controller_arguments_invalid');
  const value=await readPacket(args[1]);
  validateSourceControllerInput(value,clock());
  // Refuse occupied/symlink outputs before performing public reads.
  const handle=await open(args[3],'wx',0o600);
  try {
    const result=await executeSourceController(value,options);
    const bytes=JSON.stringify(result,null,2)+'\n';
    if(Buffer.byteLength(bytes)>SOURCE_CONTROLLER_LIMITS.inputBytes) throw new Error('source_controller_output_bound');
    await handle.writeFile(bytes);await handle.sync();
    return {runId:result.runId,runHash:result.runHash,items:result.inboxRequest.items.length,
      attempts:result.priorityRequest.sourceAttempts.length,platformsEnabled:false,submitted:false};
  } finally {await handle.close();}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(await sourceControllerCommand(process.argv.slice(2))));}
  catch {console.error(JSON.stringify({ok:false,error:'source_controller_command_rejected',
    note:'Inspect validated input/output presence; no upstream exception or source text exported.'}));process.exitCode=1;}
}
