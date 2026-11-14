import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parseTpexNativeShareReplay, bindTpexNativeShareReplay, resolveNativeVolumeOverlay, nativeVolumeContext } from './launch-native-volume.ts';
import { loadTwLaunchPatternReadEvidence, prepareTwLaunchNativeVolumeBinding } from '../tw-entry-plan-authority.ts';
import { readLaunchPatterns } from './launch-pattern-read.ts';
import { parseLaunchLicensedCsvReplay, bindLaunchOfficialReplay } from './launch-official-replay.ts';
import { evaluateLaunchRules } from './launch-score-rules.ts';
import { nativeVolumeFixture, nativeTables, officialCsvForNativeFixture } from './launch-native-volume.test-fixture.ts';

type Fixture = ReturnType<typeof nativeVolumeFixture>;
function changeCsv(f: Fixture, index: number, change: (text: string) => string) {
  const page = f.manifest.responses[index], text = change(Buffer.from(page.body.data,'base64').toString('utf8'));
  page.body.data = Buffer.from(text).toString('base64'); page.bytes = Buffer.byteLength(text); page.rawSha256 = createHash('sha256').update(text).digest('hex');
}
async function prepared(f = nativeVolumeFixture()) {
  const proof = parseTpexNativeShareReplay(f.manifest), selected = await loadTwLaunchPatternReadEvidence(f.client,f.request);
  const readiness = await prepareTwLaunchNativeVolumeBinding(f.client,f.request,selected); assert.equal(readiness.ready,true,readiness.gaps.join(','));
  return { f, proof, selected, bound: bindTpexNativeShareReplay(proof,f.request,selected) };
}

test('11371 exact57 CSV rows retain native units, issued-share intervals and unjoined next-day limits without DB', () => {
  const f = nativeVolumeFixture({capitalChangeIndex:220}), before = structuredClone(f.manifest), proof = parseTpexNativeShareReplay(f.manifest);
  assert.equal(proof.parsedSessions,57); assert.equal(f.reads.length,0); assert.equal(proof.sourceAuthority,false);
  assert.deepEqual(proof.issuedShareChanges,[{ previousSession:f.sessions[219],currentSession:f.sessions[220],previousIssuedShares:100000000,
    currentIssuedShares:150000000,deltaShares:50000000,effectiveSession:null,eventKind:null,adjustmentFactor:null }]);
  assert.ok(proof.nextDayLimitQuotes.every(row=>row.targetSession===null && row.currentLimitAuthority===false && row.onePriceLocked===null));
  assert.deepEqual(f.manifest,before);
});
test('standalone11371 target is same-request four-digit stock rather than a hardcoded6488 identity', () => {
  const f=nativeVolumeFixture(); f.manifest.symbol='5274';
  for(let index=0;index<57;index++)changeCsv(f,index,text=>text.replace('"6488"','"5274"'));
  const proof=parseTpexNativeShareReplay(f.manifest); assert.equal(proof.symbol,'5274'); assert.equal(proof.parsedSessions,57);
  assert.equal(proof.instrumentQualificationAuthority,false);
});
test('stable synthetic technical proof feeds70 technical points while20 aligned net rows lack same-scope denominator', async () => {
  const f = nativeVolumeFixture(), before = structuredClone(f.data), native = parseTpexNativeShareReplay(f.manifest);
  const official = parseLaunchLicensedCsvReplay(officialCsvForNativeFixture(f));
  const result = await readLaunchPatterns(f.client,f.request,official,native);
  assert.ok(result.nativeVolumeOverlay); assert.equal(result.evidence.shareVolume,null,'old TPEx loader meaning stays unchanged');
  assert.ok(result.evidence.missingData.includes('launch_tpex_exact_native_share_volume_51_not_proven'));
  assert.ok(!result.gaps.includes('launch_tpex_exact_native_share_volume_51_not_proven'));
  assert.equal(result.evidence.history.bars.at(-1)!.volume,14000,'rounded original is retained');
  assert.equal(result.arithmetic.nativeVolumeRevision,result.nativeVolumeOverlay.revisionId);
  const priorMean = f.sessions.slice(-51,-1).reduce((sum,session)=>sum+f.nativeShares(f.sessions.indexOf(session)),0)/50;
  assert.equal(result.arithmetic.breakout.prior50MeanVolume,priorMean);
  assert.equal(result.arithmetic.breakout.volumeRatio,14002/priorMean);
  assert.equal(result.launchScore.rules.length,16); assert.equal(result.launchScore.availableWeight,80);
  assert.equal(result.launchScore.totalScore,null); assert.equal(result.launchScore.technicalScore,70);
  assert.equal(result.launchScore.observations!.chips!.foreign5.volumeShares,null);
  assert.equal(result.launchScore.observations!.chips!.foreign5.netVolumeRatio,null);
  assert.equal(result.launchScore.observations!.chips!.denominatorSource,null);
  assert.ok(result.launchScore.gaps.includes('institutional_volume_same_scope_proof_missing'));
  assert.equal(result.nativeVolumeOverlay.purpose,'technical_turnover');
  assert.equal(result.nativeVolumeOverlay.coverage,'tpex_11371_report_excluding_fixed_price_v1');
  assert.equal(result.nativeVolumeOverlay.institutionalDenominatorAuthority,false);
  assert.equal(result.launchScore.observations!.chips!.foreign5.netShares,5);
  assert.equal(result.launchScore.rankable,false); assert.equal(result.publicationAuthority,false);
  const flows = bindLaunchOfficialReplay(official,f.request,result.evidence,result.nativeVolumeOverlay).external.chips!;
  assert.equal(flows.rows.length,20); assert.equal(flows.rows[0].foreignNetShares,1);
  assert.equal(flows.rows[0].sourceTimestamp,f.manifest.responses[0].observedAt);
  assert.equal(flows.shareVolumeRevision,undefined); assert.equal(flows.flowCoverage,'tpex_11856_combined_sessions_v1');
  assert.deepEqual(f.data,before);
});
test('observed issued-share change blocks native overlay despite empty supported feeds, raw OHLC and factor1', async () => {
  const {f,bound,selected} = await prepared(nativeVolumeFixture({capitalChangeIndex:220}));
  assert.equal(bound.overlay,null); assert.deepEqual(bound.gaps,['native_share_issued_count_changed_in_selected_51']);
  const result = await readLaunchPatterns(f.client,f.request,parseLaunchLicensedCsvReplay(officialCsvForNativeFixture(f)),parseTpexNativeShareReplay(f.manifest));
  assert.equal(result.arithmetic.breakout.volumeRatio,null); assert.equal(result.arithmetic.contraction.volumeContractionRatio,null);
  assert.equal(result.arithmetic.close,101); assert.equal(selected.history.missingData.length,0);
  assert.equal(result.launchScore.observations!.chips!.foreign20.netShares,20);
  assert.equal(result.launchScore.observations!.chips!.foreign20.netVolumeRatio,null);
});
test('predecessor boundary change or absent predecessor refuses the consumed51 capital regime', async () => {
  assert.equal((await prepared(nativeVolumeFixture({capitalChangeIndex:189}))).bound.overlay,null);
  const f = nativeVolumeFixture(); f.manifest.sessions = f.manifest.sessions.slice(-51); f.manifest.responses = f.manifest.responses.slice(-51);
  const {bound} = await prepared(f); assert.equal(bound.overlay,null); assert.deepEqual(bound.gaps,['native_share_issued_regime_predecessor_missing']);
});
test('predecessor publication/acquisition before its official close cannot prove continuity', async () => {
  const f=nativeVolumeFixture(); Object.assign(f.manifest.capture,{startedAt:null});
  f.manifest.responses[5].observedAt=`${f.sessions[188]}T05:29:59Z`;
  const {bound}=await prepared(f); assert.equal(bound.overlay,null);
  assert.deepEqual(bound.gaps,['native_share_issued_regime_predecessor_clock_invalid']);
});
test('factor1 cash event remains a binding refusal; native shares never waive the supported event guard', async () => {
  const f = nativeVolumeFixture({cashEvent:true}), selected = await loadTwLaunchPatternReadEvidence(f.client,f.request);
  const readiness = await prepareTwLaunchNativeVolumeBinding(f.client,f.request,selected);
  assert.equal(readiness.ready,false); assert.deepEqual(readiness.gaps,['native_volume_supported_feed_target_event']);
  assert.equal(bindTpexNativeShareReplay(parseTpexNativeShareReplay(f.manifest),f.request,selected).overlay,null);
});
test('metadata-only counts, fake/cloned parser tokens and cloned selected results cannot create a binding', async () => {
  const f = nativeVolumeFixture(), manifest = structuredClone(f.manifest) as unknown as {responses:Array<{body:unknown}>};
  for (const page of manifest.responses) page.body={encoding:'absent'};
  const absent=parseTpexNativeShareReplay(manifest); assert.equal(absent.parsedSessions,0); assert.equal(absent.decodedBytes,0);
  const {proof,selected} = await prepared(f); const calls=f.reads.length;
  assert.equal((await prepareTwLaunchNativeVolumeBinding(f.client,f.request,structuredClone(selected))).ready,false);
  assert.equal(f.reads.length,calls);
  for (const fake of [{},structuredClone(proof)]) assert.equal(bindTpexNativeShareReplay(fake,f.request,selected).overlay,null);
});
test('optional undefined request data may refuse native registration but preserves ordinary price/history reads', async () => {
  const f=nativeVolumeFixture();f.request.forwardCalendar=undefined;
  const selected=await loadTwLaunchPatternReadEvidence(f.client,f.request);
  assert.equal(selected.history.bars.length,240);assert.equal(selected.history.bars.at(-1)!.close,101);
  assert.ok(selected.missingData.includes('native_volume_selected_registration_invalid'));
  assert.equal((await prepareTwLaunchNativeVolumeBinding(f.client,f.request,selected)).ready,false);
});
test('serialization/accessor hooks cannot hide changed selected data or reach the native raw query', async () => {
  for(const mode of ['toJSON','accessor','root_accessor'] as const){
    const f=nativeVolumeFixture(), selected=await loadTwLaunchPatternReadEvidence(f.client,f.request), before=structuredClone(selected);
    let hooks=0;
    if(mode==='toJSON'){
      Object.defineProperty(selected,'toJSON',{value:()=>{hooks++;return before;},enumerable:false});
      selected.history.bars.at(-1)!.close+=1;
    }else if(mode==='accessor') Object.defineProperty(selected.history.bars.at(-1)!,'close',{get(){hooks++;return 101;},enumerable:true});
    else {const history=selected.history;Object.defineProperty(selected,'history',{get(){hooks++;return history;},enumerable:true});}
    const reads=f.reads.length; assert.equal((await prepareTwLaunchNativeVolumeBinding(f.client,f.request,selected)).ready,false);
    assert.equal(nativeVolumeContext(selected,f.request),null);
    assert.equal(f.reads.length,reads); assert.equal(hooks,0);
  }
});
test('nested Proxy bars cannot report old descriptors while supplying changed price getters', async () => {
  const f=nativeVolumeFixture(), selected=await loadTwLaunchPatternReadEvidence(f.client,f.request);
  let traps=0; const original=selected.history.bars.at(-1)!;
  selected.history.bars[selected.history.bars.length-1]=new Proxy(original,{get(target,key,receiver){traps++;return key==='close'?999:Reflect.get(target,key,receiver);}});
  const reads=f.reads.length; assert.equal((await prepareTwLaunchNativeVolumeBinding(f.client,f.request,selected)).ready,false);
  assert.equal(f.reads.length,reads);assert.equal(traps,0);
  const next=await prepared();assert.ok(next.bound.overlay);
  const bar=next.selected.history.bars.at(-1)!; next.selected.history.bars[next.selected.history.bars.length-1]=new Proxy(bar,{});
  assert.equal(resolveNativeVolumeOverlay(next.bound.overlay,nativeVolumeContext(next.selected,next.f.request)),null);
});
test('row/sourceRef/public-history mutations fail closed after native preparation; no forged overlay or rounded fallback', async () => {
  const {f,selected,bound} = await prepared(); assert.ok(bound.overlay);
  const context=nativeVolumeContext(selected,f.request);
  assert.equal(resolveNativeVolumeOverlay(structuredClone(bound.overlay),context),null);
  assert.equal(resolveNativeVolumeOverlay(bound.overlay,nativeVolumeContext(selected,{...f.request,symbol:'5274'})),null);
  assert.equal(resolveNativeVolumeOverlay(bound.overlay,nativeVolumeContext(selected,{...f.request,exchange:'TWSE'})),null);
  selected.history.bars.at(-1)!.volume+=1;
  assert.equal(resolveNativeVolumeOverlay(bound.overlay,nativeVolumeContext(selected,f.request)),null);
  const fresh = await prepared(); fresh.f.data[nativeTables.prices].at(-1)!.source_ref='tpex-edited';
  assert.equal((await prepareTwLaunchNativeVolumeBinding(fresh.f.client,fresh.f.request,fresh.selected)).ready,false);
});
test('exact native OHLC mismatch and missing51 body cannot be repaired from selected adjusted prices', async () => {
  for (const mode of ['ohlc','missing'] as const) {
    const f=nativeVolumeFixture();
    if(mode==='ohlc') changeCsv(f,56,text=>text.replace('"101","0","101","101","101"','"102","0","102","102","102"'));
    else {f.manifest.responses=f.manifest.responses.slice(0,-1);}
    const {bound}=await prepared(f); assert.equal(bound.overlay,null,mode);
  }
});
test('individually safe daily shares cannot feed volume arithmetic when the51-row aggregate is unsafe', async () => {
  const f=nativeVolumeFixture();
  for(let index=0;index<57;index++)changeCsv(f,index,text=>text.replace(/"(?:10001|2001|14002)"/u,'"9007199254740991"'));
  const {proof,bound}=await prepared(f);assert.equal(proof.parsedSessions,57);assert.equal(bound.overlay,null);
  assert.deepEqual(bound.gaps,['native_share_51_aggregate_overflow']);
});
test('native parser rejects header/date/unit/integer/hash/capture defects and exact future microsecond clocks', () => {
  for(const mode of ['header','fractional','issued_zero','date','hash','clock','capture_cutoff'] as const){
    const f=nativeVolumeFixture();
    if(mode==='header')changeCsv(f,0,text=>text.replace('成交股數','成交張數'));
    if(mode==='fractional')changeCsv(f,0,text=>text.replace('"10001"','"10001.5"'));
    if(mode==='issued_zero')changeCsv(f,0,text=>text.replace('"100000000"','"0"'));
    if(mode==='date')changeCsv(f,0,text=>text.replace(/"115\/\d{2}\/\d{2}"/u,'"115/02/30"'));
    if(mode==='hash')f.manifest.responses[0].rawSha256='0'.repeat(64);
    if(mode==='clock')f.manifest.responses[0].observedAt=f.manifest.capture.completedAt.replace('.000001Z','.000002Z');
    if(mode==='capture_cutoff')f.manifest.capture.completedAt=f.manifest.cutoff;
    assert.throws(()=>parseTpexNativeShareReplay(f.manifest),/native_share_|official_csv_/u,mode);
  }
});
test('raw exact nets survive technical coverage mismatch while fractional nets and source binding changes fail closed', async () => {
  const f=nativeVolumeFixture(), official=parseLaunchLicensedCsvReplay(officialCsvForNativeFixture(f));
  const result=await readLaunchPatterns(f.client,f.request,official,parseTpexNativeShareReplay(f.manifest));
  const base=bindLaunchOfficialReplay(official,f.request,result.evidence,result.nativeVolumeOverlay).external;
  for(const mode of ['fractional','impossible','missing','units','price_revision'] as const){
    const external=structuredClone(base);
    if(mode==='fractional')external.chips!.rows.at(-1)!.foreignNetShares=.5;
    if(mode==='impossible')external.chips!.rows.at(-1)!.foreignNetShares=14003;
    if(mode==='missing')external.chips!.rows.at(-1)!.foreignNetShares=null;
    if(mode==='units')Object.assign(external.chips!,{unit:'lots'});
    if(mode==='price_revision')external.chips!.priceRevision='wrong-price';
    const score=evaluateLaunchRules(f.request,result,external);
    assert.equal(score.components.chips.availableWeight,0,mode);
    if(mode==='units'||mode==='price_revision')assert.equal(score.observations!.chips,null,mode);
    else {assert.equal(score.observations!.chips!.foreign5.netShares,mode==='impossible'?14007:null);
      assert.equal(score.observations!.chips!.trust5.netShares,10);assert.equal(score.observations!.chips!.foreign5.netVolumeRatio,null);}
  }
});
test('native revision binds row inventory and technical overlay/public same-coverage DTO cannot authorize chip ratios', async () => {
  const a=await prepared(), f=nativeVolumeFixture(); changeCsv(f,0,text=>text.replace('"1000000"','"1000001"'));
  const b=await prepared(f); assert.ok(a.bound.overlay&&b.bound.overlay); assert.notEqual(a.bound.overlay.revisionId,b.bound.overlay.revisionId);
  const official=parseLaunchLicensedCsvReplay(officialCsvForNativeFixture(a.f));
  const result=await readLaunchPatterns(a.f.client,a.f.request,official,a.proof); assert.ok(result.nativeVolumeOverlay);
  const external=bindLaunchOfficialReplay(official,a.f.request,result.evidence,result.nativeVolumeOverlay).external;
  for(const fake of [result.nativeVolumeOverlay,structuredClone(result.nativeVolumeOverlay),
    {sameCoverage:true,coverage:'tpex_11856_combined_sessions_v1',datasetId:11370,sourceVersion:'invented',rows:external.chips!.rows},
    {...result.nativeVolumeOverlay,coverage:'tpex_11856_combined_sessions_v1',institutionalDenominatorAuthority:true}]) {
    external.institutionalVolumeProof=fake;
    const score=evaluateLaunchRules(a.f.request,result,external); assert.equal(score.components.chips.availableWeight,0);
    assert.equal(score.observations!.chips!.foreign5.netShares,5);
    assert.equal(score.observations!.chips!.foreign5.volumeShares,null);
    assert.equal(score.revisions.chipDenominator,null);
  }
});
