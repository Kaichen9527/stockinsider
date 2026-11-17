import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deriveLaunchSuspendedOpening} from './launch-opening-halt.ts';
import {evaluateLaunchOutcome,type LaunchOutcomeInput} from './launch-outcomes.ts';

const policyRevision='b'.repeat(64);
const source='https://www.twse.com.tw/exchangeReport/TWTAWU?response=open_data';
const header='編號,證券代號,證券名稱,暫停交易日期,暫停交易時間,恢復交易日期,恢復交易時間';
const rowCapture=(line:string,clocks={observedAt:'2026-11-15T10:00:00Z',recordedAt:'2026-11-15T10:00:01Z'})=>{
  const body=Buffer.from(header+'\n'+line+'\n','utf8');
  return {market:'TWSE' as const,url:source,sha256:createHash('sha256').update(body).digest('hex'),body,...clocks};
};
const next={session:'2026-11-13',openAt:'2026-11-13T01:00:00Z',closeAt:'2026-11-13T05:30:00Z',
  knownAt:'2026-11-13T07:00:00Z',status:'completed' as const};
const input:LaunchOutcomeInput={scope:'historical_price_replay',asOf:'2026-11-15T10:01:00Z',basisRevision:policyRevision,calendarRevision:policyRevision,
 signal:{rankingRunId:'00000000-0000-4000-8000-000000000010',firstRankingRunId:'00000000-0000-4000-8000-000000000010',
  market:'TWSE',symbol:'5310',session:'2026-11-12',cutoff:'2026-11-12T13:30:00Z',priceRevision:policyRevision,inputHash:policyRevision,
  rawClose:'100',normalizedClose:'100'},
 sessions:[next],bars:[],opening:null};

test('halt spans the first regular open and stays separate from the research pricing gap',()=>{
  const capture=rowCapture('1,5310,範例,1151113,080000,1151116,080000');
  const opening=deriveLaunchSuspendedOpening(input,capture);
  assert.equal(opening?.reason,'suspended');
  assert.equal(opening?.knownAt,capture.recordedAt);
  const result=evaluateLaunchOutcome({...input,opening});
  assert.equal(result.execution.status,'unfillable');
  assert.equal(result.execution.nextSession,next.session);
  assert.equal(result.execution.fill,null);
  assert.equal(result.research.barrier20.state,'price_data_gap');
});

test('no linked halt interval gives no fill and a resumption at the auction is not a halt',()=>{
  for(const row of ['1,5310,範例,1151113,080000,,','1,5310,範例,1151113,080000,1151113,090000',
    '1,5330,範例,1151113,080000,1151116,080000','1,5310,範例,1151113,090001,1151116,080000']){
    assert.equal(deriveLaunchSuspendedOpening(input,rowCapture(row)),null);
  }
});
test('a later capture is excluded from a past cutoff and invalid source bytes are refused',()=>{
  const capture=rowCapture('1,5310,範例,1151113,080000,1151116,080000');
  assert.equal(deriveLaunchSuspendedOpening({...input,asOf:'2026-11-13T13:30:00Z'},capture),null);
  assert.throws(()=>deriveLaunchSuspendedOpening(input,{...capture,sha256:'a'.repeat(64)}),/launch_opening_halt_capture_invalid/);
  assert.throws(()=>deriveLaunchSuspendedOpening(input,{...capture,url:'https://example.com/trades'}),/launch_opening_halt_capture_invalid/);
});

test('a later intraday resumption does not move the assumed purchase and full-day price conflicts are refused',()=>{
  const price={session:next.session,rawOpen:'110',open:'110',high:'112',low:'109',close:'111',
    priceRevision:policyRevision,basisRevision:policyRevision,availableAt:next.knownAt};
  assert.equal(deriveLaunchSuspendedOpening({...input,bars:[price]},rowCapture('1,5310,範例,1151113,080000,1151113,110000'))?.reason,'suspended');
  assert.throws(()=>deriveLaunchSuspendedOpening({...input,bars:[price]},rowCapture('1,5310,範例,1151113,080000,1151116,080000')),
    /launch_opening_halt_full_session_conflicts_with_price/);
});
test('ambiguous paired times are refused rather than promoting a halt candidate',()=>{
  const source='1,5310,範例,1151113,080000,1151116,080000\n2,5310,範例,1151113,083000,1151116,080000';
  assert.throws(()=>deriveLaunchSuspendedOpening(input,rowCapture(source)),/launch_opening_halt_interval_conflict/);
});
