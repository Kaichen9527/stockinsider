import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { parseTpexBreadthReplay,BREADTH_REPLAY_SCHEMA } from './launch-breadth-replay.ts';
import { NATIVE_SHARE_HEADERS,tpexNativeShareCsvUrl } from './launch-native-volume.ts';

function fixture(count=2){
 const sessions=Array.from({length:30},(_,i)=>new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10)),observedAt='2026-11-15T01:00:00Z';
 const symbols=Array.from({length:count},(_,i)=>String(1000+i));
 const csv=(day:string,index:number)=>[NATIVE_SHARE_HEADERS,...symbols.map((symbol,n)=>{
  // SYNTHETIC890-row control geometry, not external raw bytes or roster proof.
  const absent=count===890&&(n>=858&&n<882&&index===29||n>=882&&index<15||n>=747&&n<858&&index===25);
  return [day.replaceAll('-','/').replace('2026','115'),symbol,'SYNTHETIC_PRIVATE_ROW_DO_NOT_EMIT',absent?'--':String(100+index),'0','100','200','90','1,000','100,000','10','100','101','1,000,000','110','90'];
 })].map(row=>row.map(cell=>`"${cell}"`).join(',')).join('\r\n')+'\r\n';
 const responses=sessions.map((session,index)=>{
  const bytes=Buffer.from('\uFEFF'+csv(session,index));
  return {session,sourceUrl:tpexNativeShareCsvUrl(session),observedAt,publisherPublishedAt:null,httpStatus:200,redirectCount:0,contentType:'application/csv',bytes:bytes.length,
   rawSha256:createHash('sha256').update(bytes).digest('hex'),body:{encoding:'base64',data:bytes.toString('base64')}};
 });
 return {schema:BREADTH_REPLAY_SCHEMA,datasetId:11371,throughSession:sessions.at(-1)!,cutoff:'2026-11-15T02:00:00Z',
  capture:{repository:'fixture/offline',sourceCommit:'a'.repeat(40),workflowPath:null,runId:null,runAttempt:null,startedAt:'2026-11-15T00:00:00Z' as string|null,completedAt:observedAt},
  sessions,roster:{revision:'b'.repeat(64),availableAt:'2026-11-13T13:00:00Z',symbols},responses};
}
function rewrite(page:ReturnType<typeof fixture>['responses'][number],change:(csv:string)=>string){
 const bytes=Buffer.from(change(Buffer.from(page.body.data,'base64').toString('utf8')));
 page.body.data=bytes.toString('base64');page.bytes=bytes.length;page.rawSha256=createHash('sha256').update(bytes).digest('hex');
}
test('synthetic890 roster reproduces747 strict +111 signal-present20of30 while all qualified breadth staysnull',()=>{
 const input=fixture(890),result=parseTpexBreadthReplay(input),raw=result.rawPricePresence;
 assert.equal(raw.eligible,890);assert.equal(raw.strictLast20Present,747);assert.equal(raw.observed,858);
 assert.equal(raw.missingSignalClose,24);assert.equal(raw.shortHistory,8);assert.equal(raw.coveragePct,858/890*100);
 assert.equal(result.parsedSessions,30);assert.equal(result.decodedBytes,result.declaredBytes);assert.equal(result.caComparableCoverage,null);
 assert.equal(result.qualifiedBreadth,null);assert.equal(result.aggregateMarketGate,null);assert.equal(result.marketAuthority,false);
 assert.equal(result.institutionalDenominatorAuthority,false);assert.equal(result.attribution.datasetId,11371);
 assert.equal(result.sourceAuthority,false);assert.equal(result.rosterAuthority,false);assert.equal(result.calendarAuthority,false);
 assert.ok(result.gaps.includes('breadth_ca_comparability_not_proven'));assert.ok(result.gaps.includes('twse_historical_breadth_producer_not_connected'));
 assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE_ROW_DO_NOT_EMIT'),false);assert.equal(JSON.stringify(result).includes('"close"'),false);
 assert.ok(Object.isFrozen(result.rawPricePresence));
});
test('missing bodies/response outage retain explicit gaps and0actualdecodedbytes without healthy breadth',()=>{
 const f=fixture();for(const page of f.responses)Object.assign(page,{body:{encoding:'absent'}});
 const absent=parseTpexBreadthReplay(f);assert.equal(absent.decodedBytes,0);assert.equal(absent.rawPricePresence.observed,0);
 assert.ok(absent.gaps.includes('breadth_raw_body_or_planned_response_missing'));assert.equal(absent.qualifiedBreadth,null);
 f.responses.length=0;assert.equal(parseTpexBreadthReplay(f).parsedSessions,0);
 const short=fixture();short.sessions=short.sessions.slice(-20);short.responses=short.responses.slice(-20);
 const subset=parseTpexBreadthReplay(short);assert.equal(subset.rawPricePresence.observed,2);
 assert.ok(subset.gaps.includes('breadth_30_session_warmup_incomplete'));assert.equal(subset.qualifiedBreadth,null);
});
test('wrong requesteddate/headers/duplicate row/nativefraction/hash/redirect reject, not guess or scale units',()=>{
 const changes=[(f:ReturnType<typeof fixture>)=>{f.responses[0].rawSha256='0'.repeat(64);},
  (f:ReturnType<typeof fixture>)=>{f.responses[0].redirectCount=1;},
  (f:ReturnType<typeof fixture>)=>rewrite(f.responses[0],text=>text.replace('115/10/01','115/10/02')),
  (f:ReturnType<typeof fixture>)=>rewrite(f.responses[0],text=>text.replace('成交股數','成交仟股')),
  (f:ReturnType<typeof fixture>)=>rewrite(f.responses[0],text=>text.replaceAll('"1,000"','"1.5"')),
  (f:ReturnType<typeof fixture>)=>rewrite(f.responses[0],text=>text+text.split('\r\n')[1]+'\r\n')];
 for(const change of changes){const f=fixture();change(f);assert.throws(()=>parseTpexBreadthReplay(f),/breadth_replay_invalid/u);}
});
test('lateNov15 observations cannot qualifyNov13 or preclose/equal-microsecond cutoffs',()=>{
 for(const amend of [
  (f:ReturnType<typeof fixture>)=>{f.cutoff='2026-11-13T13:30:00Z';},
  (f:ReturnType<typeof fixture>)=>{f.cutoff='2026-11-15T09:00:00+08:00';},
  (f:ReturnType<typeof fixture>)=>{f.responses[0].observedAt='2026-10-01T05:29:59Z';f.capture.startedAt=null;},
  (f:ReturnType<typeof fixture>)=>{f.responses[0].observedAt='2026-11-15T01:00:00.000001Z';},
  (f:ReturnType<typeof fixture>)=>{f.roster.availableAt='2026-11-15T02:00:00.000001Z';}]){
  const f=fixture();amend(f);assert.throws(()=>parseTpexBreadthReplay(f),/breadth_replay_invalid/u);
 }
 const f=fixture();f.cutoff='2026-11-15T01:00:00.000001Z';assert.equal(parseTpexBreadthReplay(f).parsedSessions,30);
});
test('nullable close or missing nativefield remains explicit; issued changes do not become price factors or CA proof',()=>{
 const f=fixture();rewrite(f.responses[29],text=>text.replaceAll('"129"','"--"').replaceAll('"1,000"','"--"'));
 rewrite(f.responses[0],text=>text.replaceAll('"1,000,000"','"2,000,000"'));
 const result=parseTpexBreadthReplay(f);assert.equal(result.rawPricePresence.observed,0);assert.equal(result.rawPricePresence.missingSignalClose,2);
 assert.equal(result.nativeUnitGaps,2);assert.equal(result.caComparableCoverage,null);
 assert.ok(result.gaps.includes('breadth_reported_close_missing_or_unparseable'));
});
test('closed bounds/sortedroster/sessions/partialcapture/URL/schema reject; no input hooks executed',()=>{
 let hooks=0;const f=fixture(),body={};Object.defineProperty(body,'encoding',{enumerable:true,get(){hooks++;return 'absent';}});
 for(const changed of [{...f,responses:[...f.responses,f.responses[0]]},{...f,roster:{...f.roster,symbols:['1001','1000']}},
  {...f,sessions:[...f.sessions,f.sessions[29]]},{...f,capture:{...f.capture,runId:'1'}},{...f,schema:'launch-official-public-replay-v1'},
  {...f,responses:[{...f.responses[0],sourceUrl:f.responses[0].sourceUrl.replace('&d=','&date=')}]},
  {...f,responses:[{...f.responses[0],bytes:500001,body:{encoding:'absent'}}]},
  {...f,responses:[{...f.responses[0],body}]},new Proxy(f,{})])assert.throws(()=>parseTpexBreadthReplay(changed),/breadth_replay_invalid/u);
 assert.equal(hooks,0);
});
