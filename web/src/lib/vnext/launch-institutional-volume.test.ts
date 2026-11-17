import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { INSTITUTIONAL_VOLUME_HEADERS, INSTITUTIONAL_VOLUME_SCHEMA, INSTITUTIONAL_VOLUME_PARSER,
  parseTpexInstitutionalVolumeReplay, tpexInstitutionalVolumeCsvUrl, bindTpexInstitutionalVolumeReplay, resolveInstitutionalVolumeProof,
  institutionalRatioFixture, sumInstitutionalShares } from './launch-institutional-volume.ts';
import { loadTwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';
import { bindLaunchOfficialReplay, parseLaunchLicensedCsvReplay } from './launch-official-replay.ts';
import { parseTpexNativeShareReplay } from './launch-native-volume.ts';
import { readLaunchPatterns } from './launch-pattern-read.ts';
import { evaluateLaunchRules } from './launch-score-rules.ts';
import { nativeVolumeFixture, officialCsvForNativeFixture } from './launch-native-volume.test-fixture.ts';

type Fixture = ReturnType<typeof nativeVolumeFixture>;
const csv = (rows: unknown[][]) => '\uFEFF' + rows.map(row=>row.map(value=>`"${String(value).replace(/"/gu,'""')}"`).join(',')).join('\r\n')+'\r\n';
function body(text: string) { return { bytes:Buffer.byteLength(text),rawSha256:createHash('sha256').update(text).digest('hex'),body:{encoding:'base64',data:Buffer.from(text).toString('base64')} }; }
function row(session: string, symbol='6488', shares=50000, issued=150000000) {
  return [`${Number(session.slice(0,4))-1911}/${session.slice(5,7)}/${session.slice(8)}`,symbol,'SYNTHETIC institution, "scope"','101','0','100','102','99','100',shares,5000000,100,'100','101',issued,'100','110','90'];
}
function manifest(f: Fixture, options: { changedIndex?: number; sessions?: number } = {}) {
  const sessions=f.sessions.slice(-(options.sessions??21));
  return {schema:INSTITUTIONAL_VOLUME_SCHEMA,datasetId:11370,symbol:'6488',cutoff:f.request.cutoff,capture:structuredClone(f.manifest.capture),sessions,
    responses:sessions.map((session,index)=>({session,sourceUrl:tpexInstitutionalVolumeCsvUrl(session),observedAt:f.manifest.responses[0].observedAt,
      publisherPublishedAt:null,httpStatus:200,redirectCount:0,contentType:'text/csv',
      ...body(csv([[...INSTITUTIONAL_VOLUME_HEADERS],row(session,'6488',50000+index,index >= (options.changedIndex??99)?160000000:150000000)]))}))};
}
function replaceRows(page: ReturnType<typeof manifest>['responses'][number], rows: unknown[][]) { Object.assign(page,body(csv(rows))); }
async function prepared(f=nativeVolumeFixture(), options: Parameters<typeof manifest>[1]={}) {
  const input=manifest(f,options), replay=parseTpexInstitutionalVolumeReplay(input), official=parseLaunchLicensedCsvReplay(officialCsvForNativeFixture(f));
  const selected=await loadTwLaunchPatternReadEvidence(f.client,f.request), bound=bindTpexInstitutionalVolumeReplay(replay,official,f.request,selected);
  const flow=bindLaunchOfficialReplay(official,f.request,selected).external.chips!;
  return {f,input,replay,official,selected,bound,flow};
}
test('signed net aggregation is exact through cancellation and rejects unsafe final totals', () => {
  const max=Number.MAX_SAFE_INTEGER;
  assert.equal(sumInstitutionalShares([max,2,-max]),2);
  assert.equal(sumInstitutionalShares([max,1]),null);
  assert.equal(sumInstitutionalShares([-max,-1]),null);
  assert.equal(sumInstitutionalShares([1,.5]),null);
  assert.equal(sumInstitutionalShares([]),null);
});
test('explicit offline same-scope ratio has no source or score authority and mismatched coverage keeps only raw net', () => {
  const matching=institutionalRatioFixture([2,-1],[10,10],{flowCoverage:'synthetic_same_scope',denominatorCoverage:'synthetic_same_scope'});
  assert.equal(matching.netVolumeRatio,.05);
  assert.equal(matching.scope,'offline_same_scope_fixture_only');
  assert.equal(matching.scoreAuthority,false);assert.equal(matching.sourceAuthority,false);
  const mismatch=institutionalRatioFixture([2,-1],[10,10],{flowCoverage:'synthetic_same_scope',denominatorCoverage:'synthetic_different_scope'});
  assert.equal(mismatch.netShares,1);assert.equal(mismatch.volumeShares,null);assert.equal(mismatch.netVolumeRatio,null);
  assert.equal(institutionalRatioFixture([1,1],[Number.MAX_SAFE_INTEGER,1],
    {flowCoverage:'synthetic_same_scope',denominatorCoverage:'synthetic_same_scope'}).volumeShares,null);
});
test('11370 exact18-column all-session parser retains hashes/mapping/attribution, no acquisition or technical authority',()=>{
  const f=nativeVolumeFixture(), input=manifest(f), before=structuredClone(input), replay=parseTpexInstitutionalVolumeReplay(input);
  assert.equal(replay.parsedSessions,21); assert.equal(replay.decodedBytes,input.responses.reduce((sum,page)=>sum+page.bytes,0));
  assert.equal(replay.declaredBytes,replay.decodedBytes); assert.equal(replay.attribution.datasetId,11370);
  assert.equal(replay.attribution.datasetUrl,'https://data.gov.tw/dataset/11370'); assert.equal(replay.attribution.licenseUrl,'https://data.gov.tw/license');
  assert.equal(replay.parserVersion,INSTITUTIONAL_VOLUME_PARSER); assert.equal(replay.resourceMapping.legacyHistoricalFallback,false);
  assert.equal(replay.sourceAuthority,false); assert.equal(replay.publicationAuthority,false); assert.equal(replay.rankingAuthority,false);
  assert.deepEqual(replay.observedShareRows,input.sessions.map((session,index)=>({session,shares:50000+index,issuedShares:150000000,observedAt:input.responses[index].observedAt})));
  assert.ok(Object.isFrozen(replay.observedShareRows)&&replay.observedShareRows.every(Object.isFrozen));
  assert.ok(replay.responseReceipts.every((receipt,index)=>receipt.rawSha256===input.responses[index].rawSha256&&receipt.rawSha256!==receipt.csvRowsSha256));
  assert.deepEqual(replay.issuedShareChanges,[]); assert.deepEqual(input,before); assert.equal(f.reads.length,0);
});
test('actual selected reader/scorer uses independent all-session denominators, reaching100 weights without technical substitution',async()=>{
  const f=nativeVolumeFixture(), official=parseLaunchLicensedCsvReplay(officialCsvForNativeFixture(f)), replay=parseTpexInstitutionalVolumeReplay(manifest(f));
  const result=await readLaunchPatterns(f.client,f.request,official,parseTpexNativeShareReplay(f.manifest),replay);
  assert.ok(result.nativeVolumeOverlay); assert.equal(result.launchScore.availableWeight,100); assert.equal(result.launchScore.totalScore,100); assert.equal(result.launchScore.technicalScore,70);
  assert.equal(result.launchScore.components.chips.confirmedPoints,20); assert.equal(result.launchScore.components.chips.availableWeight,20);
  assert.equal(result.launchScore.observations!.chips!.foreign20.netShares,20);
  const denominator=Array.from({length:20},(_,i)=>50001+i).reduce((sum,value)=>sum+value,0);
  assert.equal(result.launchScore.observations!.chips!.foreign20.volumeShares,denominator);
  assert.equal(result.launchScore.observations!.chips!.foreign20.netVolumeRatio,20/denominator);
  assert.equal(result.launchScore.observations!.chips!.trust5.volumeShares,Array.from({length:5},(_,i)=>50016+i).reduce((sum,value)=>sum+value,0));
  assert.equal(result.launchScore.observations!.chips!.denominatorSource?.datasetId,11370);
  assert.ok(result.launchScore.revisions.chipDenominator); assert.ok(!result.gaps.includes('institutional_volume_same_scope_proof_missing'));
  assert.equal(result.launchScore.rankable,false); assert.equal(result.rankingAuthority,false); assert.equal(result.publicationAuthority,false);
  const rebound=bindTpexInstitutionalVolumeReplay(replay,official,f.request,result.evidence);assert.ok(rebound.proof);
  const external=bindLaunchOfficialReplay(official,f.request,result.evidence).external;
  external.institutionalVolumeProof=rebound.proof;
  const selected={evidence:result.evidence,arithmetic:result.arithmetic,nativeVolumeOverlay:result.nativeVolumeOverlay};
  assert.equal(evaluateLaunchRules(f.request,selected,external).components.chips.availableWeight,20);
  const unchangedRevision=external.chips!.revisionId;external.chips!.rows[0].foreignNetShares=2;
  const tampered=evaluateLaunchRules(f.request,selected,external);
  assert.equal(external.chips!.revisionId,unchangedRevision);assert.equal(tampered.components.chips.availableWeight,0);
  assert.equal(tampered.observations!.chips!.foreign20.netShares,21);assert.equal(tampered.observations!.chips!.foreign20.netVolumeRatio,null);
  assert.equal(tampered.totalScore,null);
});
test('only consumed20 issued-count continuity matters: missing outside predecessor and technical51 change do not erase chips',async()=>{
  const f=nativeVolumeFixture({capitalChangeIndex:210}), replay=parseTpexInstitutionalVolumeReplay(manifest(f,{sessions:20}));
  const result=await readLaunchPatterns(f.client,f.request,parseLaunchLicensedCsvReplay(officialCsvForNativeFixture(f)),parseTpexNativeShareReplay(f.manifest),replay);
  assert.equal(result.nativeVolumeOverlay,null); assert.ok(result.gaps.includes('native_share_issued_count_changed_in_selected_51'));
  assert.equal(result.arithmetic.breakout.volumeRatio,null); assert.equal(result.launchScore.components.chips.availableWeight,20);
  assert.equal(result.launchScore.components.chips.confirmedPoints,20); assert.equal(result.launchScore.observations!.chips!.foreign20.volumeShares,1000190);
});
test('consumed20 issued changes and ANY supported target event refuse proof even with factor1/cash classification',async()=>{
  const changed=await prepared(nativeVolumeFixture(),{changedIndex:10});
  assert.equal(changed.bound.proof,null); assert.deepEqual(changed.bound.gaps,['institutional_volume_issued_count_changed_in_selected_20']);
  const event=await prepared(nativeVolumeFixture({cashEvent:true}));
  assert.equal(event.bound.proof,null); assert.deepEqual(event.bound.gaps,['institutional_volume_supported_target_event_in_selected_20']);
});
test('proof binds entire authenticated11856 DTO content, selected brand and request; same revision cannot conceal changed nets or clocks',async()=>{
  const {f,selected,bound,flow}=await prepared(); assert.ok(bound.proof);
  assert.ok(resolveInstitutionalVolumeProof(bound.proof,f.request,selected,flow));
  for(const field of ['net','clock','coverage','revision','source'] as const) {
    const changed=structuredClone(flow);
    if(field==='net')changed.rows[0].foreignNetShares=2;
    if(field==='clock')changed.rows[0].availableAt='2026-11-14T11:00:00Z';
    if(field==='coverage')changed.flowCoverage='unverified_institutional_scope';
    if(field==='revision')changed.revisionId='same-dates-different-source';
    if(field==='source')changed.sourceUrl='https://www.tpex.org.tw/other';
    assert.equal(resolveInstitutionalVolumeProof(bound.proof,f.request,selected,changed),null,field);
  }
  assert.equal(resolveInstitutionalVolumeProof(structuredClone(bound.proof),f.request,selected,flow),null);
  assert.equal(resolveInstitutionalVolumeProof(bound.proof,f.request,structuredClone(selected),flow),null);
  assert.equal(resolveInstitutionalVolumeProof(bound.proof,{...f.request,symbol:'5274'},selected,flow),null);
  let hooks=0; const proxy=new Proxy(flow,{get(){hooks++;throw Error('unexpected hook');}});
  assert.equal(resolveInstitutionalVolumeProof(bound.proof,f.request,selected,proxy),null); assert.equal(hooks,0);
  selected.history.bars.at(-1)!.close+=1;
  assert.equal(resolveInstitutionalVolumeProof(bound.proof,f.request,selected,flow),null);
});
test('metadata-only, absent session, preclose evidence and cloned11856/native tokens cannot register denominator proof',async()=>{
  const {f,input,selected,official}=await prepared();
  const absent={...input,responses:input.responses.map(page=>({...page,body:{encoding:'absent'}}))};
  const metadata=parseTpexInstitutionalVolumeReplay(absent); assert.equal(metadata.parsedSessions,0); assert.equal(metadata.decodedBytes,0);
  assert.deepEqual(metadata.observedShareRows,[]);
  assert.ok(metadata.declaredBytes>0); assert.ok(metadata.gaps.includes('institutional_volume_raw_body_missing'));
  assert.equal(bindTpexInstitutionalVolumeReplay(metadata,official,f.request,selected).proof,null);
  const missing=structuredClone(input); missing.responses.pop(); assert.equal(bindTpexInstitutionalVolumeReplay(parseTpexInstitutionalVolumeReplay(missing),official,f.request,selected).proof,null);
  const early=structuredClone(input); Object.assign(early.capture,{startedAt:null}); early.responses[1].observedAt=`${early.responses[1].session}T05:29:59Z`;
  assert.deepEqual(bindTpexInstitutionalVolumeReplay(parseTpexInstitutionalVolumeReplay(early),official,f.request,selected).gaps,['institutional_volume_20_sessions_or_clock_missing']);
  const replay=parseTpexInstitutionalVolumeReplay(input);
  assert.equal(bindTpexInstitutionalVolumeReplay(replay,structuredClone(official),f.request,selected).proof,null);
  assert.equal(bindTpexInstitutionalVolumeReplay(structuredClone(replay),official,f.request,selected).proof,null);
  assert.equal(bindTpexInstitutionalVolumeReplay(parseTpexNativeShareReplay(f.manifest),official,f.request,selected).proof,null);
});
test('11370 negative byte/schema/route/date/unit/capture mutations fail closed, with no legacy historical fallback',()=>{
  for(const mode of ['header','width','date','duplicate','fractional','unsafe','null','negative','hash','route','legacy','clock','capture','cutoff_equal','partial_workflow','pagebound','pagecount'] as const) {
    const f=nativeVolumeFixture(), input=manifest(f), page=input.responses[0], values=row(page.session);
    if(mode==='header')replaceRows(page,[[...INSTITUTIONAL_VOLUME_HEADERS].reverse(),values]);
    if(mode==='width')replaceRows(page,[[...INSTITUTIONAL_VOLUME_HEADERS],values.slice(0,-1)]);
    if(mode==='date'){values[0]='115/01/01';replaceRows(page,[[...INSTITUTIONAL_VOLUME_HEADERS],values]);}
    if(mode==='duplicate')replaceRows(page,[[...INSTITUTIONAL_VOLUME_HEADERS],values,values]);
    if(['fractional','unsafe','null','negative'].includes(mode)){values[9]={fractional:'1.5',unsafe:'9007199254740992',null:'',negative:'-1'}[mode as 'fractional'|'unsafe'|'null'|'negative'];replaceRows(page,[[...INSTITUTIONAL_VOLUME_HEADERS],values]);}
    if(mode==='hash')page.rawSha256='0'.repeat(64);
    if(mode==='route')page.sourceUrl=page.sourceUrl.replace('response=data','response=json');
    if(mode==='legacy')page.sourceUrl='https://www.tpex.org.tw/web/stock/aftertrading/DAILY_CLOSE_quotes/stk_quote_result.php?l=zh-tw&o=data&date=20261113';
    if(mode==='clock')page.observedAt='2026-11-15T00:00:00Z';
    if(mode==='capture')input.capture.completedAt='2026-11-15T00:00:00Z';
    if(mode==='cutoff_equal')input.cutoff=input.capture.completedAt;
    if(mode==='partial_workflow')Object.assign(input.capture,{workflowPath:'.github/workflows/fake.yml'});
    if(mode==='pagebound')page.bytes=3*1024*1024+1;
    if(mode==='pagecount')input.responses.push(structuredClone(page));
    assert.throws(()=>parseTpexInstitutionalVolumeReplay(input),/institutional_volume_/u,mode);
  }
});
test('11370 accepts16000 data rows but rejects16001, invalid UTF8 and quote corruption under its separate3MiB cap',()=>{
  const f=nativeVolumeFixture(), input=manifest(f,{sessions:1}), page=input.responses[0];
  const records=[[...INSTITUTIONAL_VOLUME_HEADERS],row(page.session),...Array.from({length:15999},(_,i)=>{const value=row(page.session,`W${String(i).padStart(5,'0')}`);value[2]='x';return value;})];
  replaceRows(page,records); assert.ok(page.bytes<3*1024*1024); assert.equal(parseTpexInstitutionalVolumeReplay(input).parsedSessions,1);
  replaceRows(page,[...records,row(page.session,'EXTRA')]); assert.throws(()=>parseTpexInstitutionalVolumeReplay(input),/row_bound/u);
  for(const bytes of [Buffer.from([0xc0,0xaf]),Buffer.from('"unclosed')]) {
    Object.assign(page,{bytes:bytes.byteLength,rawSha256:createHash('sha256').update(bytes).digest('hex'),body:{encoding:'base64',data:bytes.toString('base64')}});
    assert.throws(()=>parseTpexInstitutionalVolumeReplay(input));
  }
});
test('raw manifest hooks and proxies reject without evaluation under the large11370 profile',()=>{
  const f=nativeVolumeFixture(), input=manifest(f);let hooks=0;
  const proxy=new Proxy(input,{get(){hooks++;throw Error('unexpected raw hook');}});
  assert.throws(()=>parseTpexInstitutionalVolumeReplay(proxy),/institutional_volume_/u);
  Object.defineProperty(input.responses[0].body,'data',{get(){hooks++;return '';},enumerable:true});
  assert.throws(()=>parseTpexInstitutionalVolumeReplay(input),/institutional_volume_/u);assert.equal(hooks,0);
});
