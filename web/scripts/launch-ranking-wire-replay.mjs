#!/usr/bin/env node
/** Opt-in stdin-only wire validation. No PG/HTTP/provider/file/writer access.
 * A parser PASS is not proof of the input's acquisition, PG origin or rights. */
import {createHash} from 'node:crypto';
import {parseLaunchRankingRead,LAUNCH_RANKING_SCHEMA,LAUNCH_RANKING_ARITHMETIC} from '../src/lib/vnext/launch-ranking-read.ts';
try{
  if(process.version!=='v22.14.0')throw Error('runtime');
  const args=process.argv.slice(2),seen=new Set(),query={};let now;
  if(args.length%2||args.length>6)throw Error('args');
  for(let i=0;i<args.length;i+=2){
    const key=args[i],value=args[i+1];if(!['--run','--symbol','--read-at'].includes(key)||seen.has(key)||typeof value!=='string')throw Error('args');seen.add(key);
    if(key==='--run')query.rankingRunId=value;else if(key==='--symbol')query.symbol=value;else now=value;
  }
  const chunks=[];let bytes=0;
  for await(const chunk of process.stdin){bytes+=chunk.byteLength;if(bytes>2*1024*1024)throw Error('bound');chunks.push(chunk);}
  const raw=Buffer.concat(chunks),value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  const read=parseLaunchRankingRead(value,query,now??new Date().toISOString());
  process.stdout.write(JSON.stringify({schema:'launch-wire-replay-receipt-v1',scope:'parser_wire_validation_only',origin:'unverified_stdin',
    inputSha256:createHash('sha256').update(raw).digest('hex'),bytes,wireSchema:LAUNCH_RANKING_SCHEMA,arithmeticVersion:LAUNCH_RANKING_ARITHMETIC,
    rankingRunId:read.snapshot?.rankingRunId??null,members:read.snapshot?.members.length??0,rules:read.detail?.scoreEvidence.length??0,
    sourceAuthority:false,publicationAuthority:false,rankingAuthority:false,realPgExecution:'NOT_VERIFIED'})+'\n');
}catch{process.stderr.write('launch_wire_replay_refused\n');process.exitCode=1;}
