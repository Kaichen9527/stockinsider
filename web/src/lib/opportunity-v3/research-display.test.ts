import assert from 'node:assert/strict';
import test from 'node:test';
import {
  displayResearchDiagnostic,
  displayResearchGate,
  displayResearchGateStatus,
  displayResearchReadiness,
  displayTechnicalState,
  displayValuationMethod,
  displayValuationStatus,
} from './research-display.ts';

test('research-only UI translates internal decision codes into reader-facing Chinese', () => {
  assert.equal(displayValuationStatus('valuation_review'),'估值資料待補');
  assert.equal(displayValuationMethod('ev_ebitda'),'企業價值／EBITDA');
  assert.equal(displayTechnicalState('breakout_pending'),'等待突破確認');
  assert.equal(displayResearchReadiness('data_needed'),'資料待補');
  assert.equal(displayResearchGate('valuation'),'估值');
  assert.equal(displayResearchGateStatus('missing'),'待補');
  assert.equal(displayResearchDiagnostic('missing:fundamental,valuation'),'尚缺資料：基本面、估值');
});

test('unknown internal codes fail closed to generic reader-facing labels', () => {
  assert.equal(displayValuationStatus('future_internal_status'),'估值資料待補');
  assert.equal(displayValuationMethod('future_internal_method'),'待選擇');
  assert.equal(displayTechnicalState('future_internal_status'),'技術資料待補');
  assert.equal(displayResearchReadiness('future_internal_status'),'資料待補');
  assert.equal(displayResearchGate('future_internal_gate'),'研究條件');
  assert.equal(displayResearchGateStatus('future_internal_status'),'待補');
  assert.equal(displayResearchDiagnostic('missing:future_internal_axis'),'研究資料仍待補齊');
});
