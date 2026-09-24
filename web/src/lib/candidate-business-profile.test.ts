import assert from 'node:assert/strict';
import test from 'node:test';
import { getCandidateBusinessProfile, hasCompleteCandidateSegmentBridge } from './candidate-business-profile.ts';

const cutoff = '2026-09-19T23:59:59+08:00';
const event = {
  event_type: 'earnings',
  source_url: 'https://www.auo.com/en-global/News_Archive/detail/news_IR_20260730',
  event_timestamp: '2026-07-30T08:00:00Z',
  created_at: '2026-07-30T09:00:00Z',
  extracted_signals: {
    schema: 'official-segment-financials-v1', periodEnd: '2026-06-30', status: 'reported',
    segments: [
      { name: 'Display', revenue: 33_810, operatingIncome: -1_085, sourceRef: 'https://www.auo.com/en-global/News_Archive/detail/news_IR_20260730#display' },
      { name: 'Mobility Solutions', revenue: 20_100, operatingIncome: 768, sourceRef: 'https://www.auo.com/en-global/News_Archive/detail/news_IR_20260730#mobility' },
      { name: 'Vertical Solutions', revenue: 13_310, operatingIncome: 745, sourceRef: 'https://www.auo.com/en-global/News_Archive/detail/news_IR_20260730#vertical' },
    ],
  },
};

test('AUO profile is unavailable before its effective time in historical replays', () => {
  assert.equal(getCandidateBusinessProfile('2409', '2026-09-18T15:59:59+08:00'), null);
  assert.equal(getCandidateBusinessProfile('2409', 'invalid'), null);
  assert.equal(getCandidateBusinessProfile('2409', '2026-09-19T00:00:00+08:00')?.businessModel, 'cyclical_asset');
});

test('AUO target requires a complete official point-in-time segment bridge', () => {
  assert.equal(hasCompleteCandidateSegmentBridge('2409', [event], { cutoff, periodEnd: '2026-06-30' }), true);
  assert.equal(hasCompleteCandidateSegmentBridge('2409', [{ ...event, extracted_signals: {
    ...event.extracted_signals, segments: event.extracted_signals.segments.slice(0, 2),
  } }], { cutoff, periodEnd: '2026-06-30' }), false);
  assert.equal(hasCompleteCandidateSegmentBridge('2409', [{ ...event, source_url: 'https://example.com/report' }], { cutoff, periodEnd: '2026-06-30' }), false);
  assert.equal(hasCompleteCandidateSegmentBridge('2409', [{ ...event, event_type: 'earnings_call' }], { cutoff, periodEnd: '2026-06-30' }), false);
  assert.equal(hasCompleteCandidateSegmentBridge('2409', [{ ...event, created_at: '2026-09-20T00:00:00Z' }], { cutoff, periodEnd: '2026-06-30' }), false);
});
