import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { parseLaunchLicensedCsvReplay, bindLaunchOfficialReplay, LICENSED_CSV_PARSER, LICENSED_CSV_5274_PARSER } from './launch-official-replay.ts';
import { nativeVolumeFixture, officialCsvForNativeFixture } from './launch-native-volume.test-fixture.ts';
import { loadTwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';

function profile() {
  const f=nativeVolumeFixture(), manifest=officialCsvForNativeFixture(f);
  manifest.parserContract=LICENSED_CSV_5274_PARSER;manifest.targets[1].symbol='5274';f.request.symbol='5274';
  for(const page of manifest.responses)if(page.datasetId===11856){
    const body=page.body as {encoding:string;data:string};
    const bytes=Buffer.from(Buffer.from(body.data,'base64').toString('utf8').replace('"6488"','"5274"'));
    page.bytes=bytes.length;page.rawSha256=createHash('sha256').update(bytes).digest('hex');
    body.data=bytes.toString('base64');
  }
  return {f,manifest};
}
test('closed5274 CSV profile retains same licensed11856 scope and authentic selected-reader source lineage', async () => {
  const {f,manifest}=profile(), before=structuredClone(manifest), parsed=parseLaunchLicensedCsvReplay(manifest);
  const selected=await loadTwLaunchPatternReadEvidence(f.client,f.request), bound=bindLaunchOfficialReplay(parsed,f.request,selected);
  assert.equal(parsed.parserVersion,LICENSED_CSV_5274_PARSER);assert.equal(bound.external.chips!.symbol,'5274');
  assert.equal(bound.external.chips!.flowCoverage,'tpex_11856_combined_sessions_v1');
  assert.equal(bound.external.chips!.sourceRef,LICENSED_CSV_5274_PARSER);
  assert.equal(bound.external.chips!.rows.length,20);assert.equal(bound.external.chips!.rows[0].foreignNetShares,1);
  assert.equal(bound.external.index!.rows.length,200);assert.equal(bound.external.institutionalVolumeProof,undefined);
  assert.deepEqual(manifest,before);assert.equal(parsed.sourceAuthority,false);
  const old=nativeVolumeFixture(), legacy=parseLaunchLicensedCsvReplay(officialCsvForNativeFixture(old));
  assert.equal(legacy.parserVersion,LICENSED_CSV_PARSER);
  assert.equal(bindLaunchOfficialReplay(legacy,old.request,await loadTwLaunchPatternReadEvidence(old.client,old.request)).external.chips!.symbol,'6488');
});
test('CSV profile version cannot substitute mixed or arbitrary target identity', () => {
  for(const mode of ['v1_with_5274','v2_with_6488','arbitrary','mixed','wrong_twse','object_contract'] as const){
    const {manifest}=profile();
    if(mode==='v1_with_5274')manifest.parserContract=LICENSED_CSV_PARSER;
    if(mode==='v2_with_6488')manifest.targets[1].symbol='6488';
    if(mode==='arbitrary')manifest.targets[1].symbol='9999';
    if(mode==='mixed')manifest.targets.push({market:'TPEX',symbol:'6488'});
    if(mode==='wrong_twse')manifest.targets[0].symbol='5274';
    if(mode==='object_contract')Object.assign(manifest,{parserContract:{toString(){throw Error('hook_must_not_run');}}});
    assert.throws(()=>parseLaunchLicensedCsvReplay(manifest),/official_csv_manifest_invalid/u,mode);
  }
});
