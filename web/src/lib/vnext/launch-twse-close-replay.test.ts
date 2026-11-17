import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseTwseHistoricalCloseReplay,TWSE_CLOSE_REPLAY_SCHEMA,TWSE_CLOSE_HEADERS,twseHistoricalCloseCsvUrl,
 parseTpexBreadthReplay,BREADTH_REPLAY_SCHEMA } from './launch-breadth-replay.ts';
import { NATIVE_SHARE_HEADERS,tpexNativeShareCsvUrl } from './launch-native-volume.ts';

function fixture(market:'TWSE'|'TPEX'='TWSE',count=2){
 const sessions=Array.from({length:30},(_,i)=>new Date(Date.UTC(2026,10,13-29+i)).toISOString().slice(0,10));
 const symbols=Array.from({length:count},(_,i)=>String(1000+i)),at='2026-11-15T03:00:00Z';
 const responses=sessions.map((session,index)=>{
  const rows=symbols.map((symbol,n)=>{
   // Synthetic geometry only; neither official calendar nor retained raw bytes.
   const absent=market==='TWSE'&&count===1089&&(n>=1079&&n<1088&&index===29||n===1088&&index<15||n>=1053&&n<1079&&index===25)
    ||market==='TPEX'&&count===890&&(n>=858&&n<882&&index===29||n>=882&&index<15||n>=747&&n<858&&index===25);
   const close=absent?'--':String(100+index);
   return market==='TWSE'?[session.replaceAll('-',''),symbol,'PRIVATE_RAW_NAME_DO_NOT_EMIT',close,'UNPROVEN_DIVIDEND','UNKNOWN_YEAR','UNPROVEN_PE','UNPROVEN_PB','UNKNOWN_PERIOD']
    :[session.replaceAll('-','/').replace('2026','115'),symbol,'PRIVATE_RAW_NAME_DO_NOT_EMIT',close,'0','100','200','90','1,000','100,000','10','100','101','1,000,000','110','90'];
  });
  const bytes=Buffer.from('\uFEFF'+[market==='TWSE'?TWSE_CLOSE_HEADERS:NATIVE_SHARE_HEADERS,...rows].map(row=>row.map(cell=>`"${cell}"`).join(',')).join('\r\n')+'\r\n');
  return {session,sourceUrl:market==='TWSE'?twseHistoricalCloseCsvUrl(session):tpexNativeShareCsvUrl(session),observedAt:at,publisherPublishedAt:null,
   httpStatus:200,redirectCount:0,contentType:'text/csv',bytes:bytes.length,rawSha256:createHash('sha256').update(bytes).digest('hex'),body:{encoding:'base64',data:bytes.toString('base64')}};
 });
 return {schema:market==='TWSE'?TWSE_CLOSE_REPLAY_SCHEMA:BREADTH_REPLAY_SCHEMA,datasetId:market==='TWSE'?11764:11371,
  throughSession:sessions.at(-1)!,cutoff:'2026-11-15T04:00:00Z',capture:{repository:'fixture/offline',sourceCommit:'a'.repeat(40),workflowPath:null,runId:null,runAttempt:null,
   startedAt:'2026-11-15T02:00:00Z' as string|null,completedAt:at},sessions,roster:{revision:'b'.repeat(64),availableAt:'2026-11-13T13:00:00Z',symbols},responses};
}
function rewrite(page:ReturnType<typeof fixture>['responses'][number],change:(text:string)=>string){
 const bytes=Buffer.from(change(Buffer.from(page.body.data,'base64').toString('utf8')));Object.assign(page,{bytes:bytes.length,
  rawSha256:createHash('sha256').update(bytes).digest('hex'),body:{encoding:'base64',data:bytes.toString('base64')}});
}
test('original11371 parser prefix stays byte-identical and both synthetic controls yield1937of1979 raw presence only',async()=>{
 const source=await readFile(new URL('./launch-breadth-replay.ts',import.meta.url));
 assert.equal(createHash('sha256').update(source.subarray(0,11336)).digest('hex'),'7e9a650a8efd21f99b7a29b3930f07535332f6d075901c022df1aab1f04f34be');
 const twse=parseTwseHistoricalCloseReplay(fixture('TWSE',1089)),tpex=parseTpexBreadthReplay(fixture('TPEX',890));
 assert.equal(twse.rawPricePresence.strictLast20Present,1053);assert.equal(twse.rawPricePresence.observed,1079);
 assert.equal(twse.rawPricePresence.missingSignalClose,9);assert.equal(twse.rawPricePresence.shortHistory,1);
 assert.equal(tpex.rawPricePresence.observed,858);assert.equal(tpex.datasetId,11371);
 const observed=twse.rawPricePresence.observed+tpex.rawPricePresence.observed,eligible=twse.rawPricePresence.eligible+tpex.rawPricePresence.eligible;
 assert.equal(observed,1937);assert.equal(eligible,1979);assert.equal(observed/eligible*100,1937/1979*100);
 assert.equal(twse.aggregateMarketGate,null);assert.equal(tpex.aggregateMarketGate,null);assert.equal(twse.qualifiedBreadth,null);
});
test('11764 is close-only with explicitlynull license/owner/rights, never11549 OHLC or valuation authority',()=>{
 assert.equal(twseHistoricalCloseCsvUrl('2026-11-13'),'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?response=open_data&date=20261113');
 const result=parseTwseHistoricalCloseReplay(fixture());assert.equal(result.parsedSessions,30);assert.equal(result.fieldBasis,'reported_close_only');
 for(const key of ['owner','license','licenseUrl','licenseVersion','rightsRevision'] as const)assert.equal(result.attribution[key],null);
 for(const key of ['rightsAuthority','sourceAuthority','publicationAuthority','marketAuthority','rosterAuthority','calendarAuthority','institutionalDenominatorAuthority'] as const)assert.equal(result[key],false);
 assert.equal(result.attribution.datasetId,11764);assert.equal(result.attribution.datasetUrl,'https://data.gov.tw/dataset/11764');
 assert.equal(result.caComparableCoverage,null);assert.ok(result.gaps.includes('twse_11764_resource_license_owner_snapshot_unverified'));
 for(const key of ['open','high','low','volume','shares','pe','cash','flow'])assert.equal(Object.hasOwn(result,key),false);
 const text=JSON.stringify(result);for(const marker of ['PRIVATE_RAW_NAME_DO_NOT_EMIT','UNPROVEN_PE','UNPROVEN_PB','UNPROVEN_DIVIDEND'])assert.equal(text.includes(marker),false);
 assert.notEqual(result.responseReceipts[0].rawSha256,result.responseReceipts[0].csvRowsSha256);
});
test('collector-exact wholly empty records are skipped; no nonempty partial footer or empty-only report is accepted',()=>{
 const f=fixture();rewrite(f.responses[0],text=>text+'\r\n,,\r\n');
 const result=parseTwseHistoricalCloseReplay(f);assert.equal(result.parsedSessions,30);assert.equal(result.responseReceipts[0].reportedRows,2);
 for(const change of [(text:string)=>text.split('\r\n')[0]+'\r\n,,,,,,,,\r\n',
  (text:string)=>text+'NONEMPTY,PARTIAL\r\n']){
  const negative=fixture();rewrite(negative.responses[0],change);assert.throws(()=>parseTwseHistoricalCloseReplay(negative),/breadth_replay_invalid/u);
 }
});
test('payload-date mismatch/latest-only result, exactheader/width/duplicate/hash/closed-day HTTP200bytes reject',()=>{
 const changes=[(f:ReturnType<typeof fixture>)=>rewrite(f.responses[0],text=>text.replace(f.sessions[0].replaceAll('-',''),'20261113')),
  (f:ReturnType<typeof fixture>)=>rewrite(f.responses[0],text=>text.replace('收盤價','close')),
  (f:ReturnType<typeof fixture>)=>rewrite(f.responses[0],()=> '\r\n'),
  (f:ReturnType<typeof fixture>)=>rewrite(f.responses[0],text=>text+text.split('\r\n')[1]+'\r\n'),
  (f:ReturnType<typeof fixture>)=>rewrite(f.responses[0],text=>text.replace('"UNKNOWN_PERIOD"','"UNKNOWN_PERIOD","EXTRA"')),
  (f:ReturnType<typeof fixture>)=>{f.responses[0].rawSha256='0'.repeat(64);},
  (f:ReturnType<typeof fixture>)=>{f.responses[0].sourceUrl=f.responses[0].sourceUrl.replace('open_data','json');}];
 for(const change of changes){const f=fixture();change(f);assert.throws(()=>parseTwseHistoricalCloseReplay(f),/breadth_replay_invalid/u);}
});
test('late capture, equal instant timezone, preclose and publisher clock invention remain closed',()=>{
 for(const change of [(f:ReturnType<typeof fixture>)=>{f.cutoff='2026-11-13T13:30:00Z';},
  (f:ReturnType<typeof fixture>)=>{f.cutoff='2026-11-15T11:00:00+08:00';},
  (f:ReturnType<typeof fixture>)=>{f.responses[0].observedAt='2026-11-15T03:00:00.000001Z';},
  (f:ReturnType<typeof fixture>)=>{f.capture.startedAt=null;f.responses[0].observedAt=f.sessions[0]+'T05:29:59Z';}]){
  const f=fixture();change(f);assert.throws(()=>parseTwseHistoricalCloseReplay(f),/breadth_replay_invalid/u);
 }
 const f=fixture();assert.throws(()=>parseTwseHistoricalCloseReplay({...f,responses:[{...f.responses[0],publisherPublishedAt:f.responses[0].observedAt}]}),/breadth_replay_invalid/u);
});
test('missing bodies/nullable signal/short30window retain explicit gaps without manufacturing a close or closure',()=>{
 const f=fixture();for(const page of f.responses)Object.assign(page,{body:{encoding:'absent'}});
 const absent=parseTwseHistoricalCloseReplay(f);assert.equal(absent.decodedBytes,0);assert.equal(absent.rawPricePresence.observed,0);
 assert.ok(absent.gaps.includes('breadth_raw_body_or_planned_response_missing'));assert.equal(absent.qualifiedBreadth,null);
 const short=fixture();short.sessions=short.sessions.slice(-20);short.responses=short.responses.slice(-20);
 assert.ok(parseTwseHistoricalCloseReplay(short).gaps.includes('breadth_30_session_warmup_incomplete'));
 rewrite(short.responses.at(-1)!,text=>text.replaceAll('"129"','"--"'));const noTarget=parseTwseHistoricalCloseReplay(short);
 assert.equal(noTarget.rawPricePresence.missingSignalClose,2);assert.equal(noTarget.rawPricePresence.observed,0);
 assert.equal(Object.hasOwn(noTarget,'cancelledSessions'),false);
});
test('bounds/closed objects/no hooks and wrong profile identities reject without expanding caps or rights',()=>{
 let hooks=0;const f=fixture(),body={};Object.defineProperty(body,'encoding',{enumerable:true,get(){hooks++;return 'absent';}});
 for(const input of [{...f,datasetId:11549},{...f,schema:BREADTH_REPLAY_SCHEMA},{...f,license:'GovOpenDataV1'},new Proxy(f,{}),
  {...f,responses:[...f.responses,f.responses[0]]},{...f,responses:[{...f.responses[0],body}]},
  {...f,responses:[{...f.responses[0],contentType:'application/json'}]},
  {...f,responses:[{...f.responses[0],bytes:500001,body:{encoding:'absent'}}]}])assert.throws(()=>parseTwseHistoricalCloseReplay(input),/breadth_replay_invalid/u);
 assert.equal(hooks,0);
});
