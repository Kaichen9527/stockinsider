#!/usr/bin/env node
/** Offline unverified metadata diagnostic. No fetch, DB, file paths or grants. */
import { createHash } from 'node:crypto';
import { diagnoseLaunchCalendarHistory } from '../src/lib/vnext/launch-calendar-history.ts';

const MAXIMUM=1024*1024;
const chunks=[];let length=0;
try{
  if(process.argv.length!==2)throw Error('closed');
  for await(const chunk of process.stdin){length+=chunk.length;if(length>MAXIMUM)throw Error('bound');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks,length);
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const result=diagnoseLaunchCalendarHistory(JSON.parse(text));
  process.stdout.write(JSON.stringify({inputSha256:createHash('sha256').update(bytes).digest('hex'),...result})+'\n');
}catch{
  process.stdout.write(JSON.stringify({schemaVersion:'launch-calendar-history-diagnostic-v1',status:'rejected',error:'calendar_diagnostic_refused',
    sourceAuthority:false,calendarAuthority:false,publicationAuthority:false})+'\n');process.exitCode=1;
}
