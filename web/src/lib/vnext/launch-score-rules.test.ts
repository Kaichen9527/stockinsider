import assert from 'node:assert/strict';
import test from 'node:test';
import { launchPatternFixture } from './launch-patterns.ts';
import { evaluateLaunchRules, launchRuleScorePage, LAUNCH_RULE_VERSION, type LaunchExternalEvidence } from './launch-score-rules.ts';
import type { TwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';

/** Entirely invented source-shaped numeric datasets, not acquired official data. */
function dataset(zero = false) {
  const sessions = Array.from({ length: 240 }, (_, i) => new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10));
  const last = sessions.at(-1)!, cutoff = `${last}T21:30:00+08:00`;
  const request = { symbol: '2330', exchange: 'TWSE' as const, signalSession: last, cutoff };
  const history: TwLaunchPatternReadEvidence['history'] = {
    notEntryAuthority: true, nextSessionAuthority: false, completedSessions: sessions,
    sourceDatasetRevision: 'fixture-price-v2', availableAt: `${last}T14:02:00+08:00`, missingData: [],
    priceBasis: { kind: 'adjusted_to_signal_session', anchorSession: last, adjustmentVersion: 'fixture-actions-v2', status: 'verified', adjustmentEvidenceHash: 'a'.repeat(64) },
    bars: sessions.map((session, i) => {
      const close = zero ? 200 - i * .5 : 80 + i * .08;
      return { session, open: close, high: zero && i >= 214 ? 300 : close + (i >= 214 ? .5 : 5),
        low: zero && i >= 214 ? 50 : close - (i >= 214 ? .5 : 5), close, rawClose: close,
        volume: !zero && i >= 235 ? 20 : 100, sourceRef: `fixture-price-${i}`, observationId: `fixture-observation-${i}`,
        sourceTimestamp: `${session}T14:00:00+08:00`, recordedAt: `${session}T14:01:00+08:00`,
        availableAt: `${session}T14:02:00+08:00`, sourceUrl: 'https://www.twse.com.tw/' };
    }),
  };
  if (!zero) Object.assign(history.bars[239], { open: 101, high: 101, low: 101, close: 101, rawClose: 101, volume: 140 });
  const calendar = { status: 'validated_selected_window' as const, revisionId: 'fixture-calendar-v2', availableAt: `${last}T14:00:00+08:00`,
    sessions: sessions.map((session, i) => ({ session, closeAt: `${session}T13:30:00+08:00`, authorityId: `fixture-calendar-${i}`,
      sourceRef: `fixture-annual-${i}`, sourceTimestamp: `${session}T13:30:00+08:00`, collectedAt: `${session}T13:40:00+08:00`, recordedAt: `${session}T13:50:00+08:00` })) };
  const evidence: TwLaunchPatternReadEvidence = { scope: 'selected_cache_protocol_evidence', sourceAuthority: false, publicationAuthority: false,
    entryAuthority: false, history, calendar, missingData: [], corporateActions: { revisionId: 'fixture-action-v2', version: 'tw-corporate-action-v3.1',
      availableAt: `${last}T14:01:00+08:00`, snapshots: sessions.slice(1).map((session, i) => ({ session, snapshotId: `fixture-snapshot-${i}`,
        sessionAuthorityId: `fixture-calendar-${i + 1}`, datasetHash: 'b'.repeat(64), collectedAt: `${session}T13:40:00+08:00`, recordedAt: `${session}T13:50:00+08:00` })) },
    shareVolume: { revisionId: 'fixture-volume-v2', status: 'no_candidate_events_in_selected_51', sourceDatasetRevision: history.sourceDatasetRevision,
      availableAt: `${last}T14:02:00+08:00`, fromSession: sessions[189], throughSession: last,
      snapshotIds: sessions.slice(-51).map((_, i) => `fixture-volume-snapshot-${i}`) } };
  const arithmetic = launchPatternFixture({ cutoff, market: 'TWSE', history,
    calendar: { completeness: 'complete_fixture', revisionId: calendar.revisionId, availableAt: calendar.availableAt, sessions: calendar.sessions },
    volumeBasis: { status: 'comparable_fixture', revisionId: 'fixture-volume-v2', sourceDatasetRevision: history.sourceDatasetRevision,
      availableAt: history.availableAt, fromSession: sessions[189], throughSession: last } });
  const source = { market: 'TWSE' as const, provider: 'twse' as const, sourceUrl: 'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX',
    sourceRef: 'fixture-official-protocol', cutoff, availableAt: `${last}T14:02:00+08:00` };
  const external: LaunchExternalEvidence = {
    index: { ...source, revisionId: 'fixture-index-v2', rows: sessions.map((session, i) => ({ session, close: zero ? 1000 - i * .1 : 1000 + i * .1,
      sourceTimestamp: `${session}T14:00:00+08:00`, availableAt: `${session}T14:01:00+08:00` })) },
    chips: { ...source, revisionId: 'fixture-chips-v2', symbol: request.symbol, unit: 'shares', volumeUnit: 'shares',
      priceRevision: history.sourceDatasetRevision, calendarRevision: calendar.revisionId, shareVolumeRevision: evidence.shareVolume!.revisionId,
      rows: sessions.slice(-20).map(session => ({ session, foreignNetShares: zero ? -1 : 1, trustNetShares: zero ? -2 : 2,
        sourceTimestamp: `${session}T14:00:00+08:00`, availableAt: `${session}T14:01:00+08:00` })) },
  };
  return { request, selected: { evidence, arithmetic }, external };
}

test('v2 fixed16-rule dataset produces100 points and70 technical without granting publication or ranking', () => {
  const data = dataset(), before = structuredClone(data);
  const result = evaluateLaunchRules(data.request, data.selected, data.external);
  assert.equal(result.derivationVersion, LAUNCH_RULE_VERSION);
  assert.equal(result.rules.length, 16);
  assert.equal(result.availableWeight, 100);
  assert.equal(result.totalScore, 100);
  assert.equal(result.technicalScore, 70);
  assert.equal(result.rankable, false); assert.equal(result.publicationAuthority, false); assert.equal(result.probability, false);
  assert.equal(result.observations!.chips!.foreign5.netShares, 5);
  assert.equal(result.observations!.chips!.foreign5.volumeShares, 220);
  const stock = 101 / data.selected.evidence.history.bars[176].close - 1;
  const market = data.external.index!.rows[239].close / data.external.index!.rows[176].close - 1;
  assert.equal(result.relativeStrength63, stock - market);
  assert.equal(result.rules.filter(rule => rule.group === 'trendRelativeStrength').reduce((sum, rule) => sum + rule.weight, 0), 25);
  assert.ok(!result.rules.some(rule => rule.id === 'trend_close_above_ma200'));
  assert.ok(!result.gaps.includes('relative_strength_normalization_unspecified'));
  assert.deepEqual(data, before);
  for (const count of [0, 1, 10, 11]) {
    const scores = Array.from({ length: count }, (_, i) => evaluateLaunchRules({ ...data.request, symbol: String(2000 + i) }, data.selected,
      { ...data.external, chips: { ...data.external.chips!, symbol: String(2000 + i) } }));
    const page = launchRuleScorePage(scores.reverse());
    assert.equal(page.items.length, Math.min(count, 10));
    if (page.nextCursor) assert.equal(launchRuleScorePage(scores, { cursor: page.nextCursor }).items.length, 1);
  }
  for (const mode of ['technical_nan', 'technical_wrong', 'technical_confirmed', 'group', 'weight', 'id', 'rs_finite', 'rs_nan', 'rs_operand'] as const) {
    const tampered = structuredClone(result);
    if (mode === 'technical_nan') tampered.technicalScore = NaN;
    if (mode === 'technical_wrong') tampered.technicalScore = 69;
    if (mode === 'technical_confirmed') tampered.confirmedTechnicalPoints = 69;
    if (mode === 'group') tampered.rules[0].group = 'market';
    if (mode === 'weight') {
      // Deliberately violate the canonical literal types to model hostile input.
      const first = tampered.rules[0] as unknown as { weight: number; points: number };
      const second = tampered.rules[1] as unknown as { weight: number; points: number };
      first.weight = 6; first.points = 6;
      second.weight = 4; second.points = 4; //preserve100 total
    }
    if (mode === 'id') tampered.rules[0].id = 'invented-rule';
    if (mode === 'rs_finite') tampered.relativeStrength63 = .999;
    if (mode === 'rs_nan') tampered.relativeStrength63 = NaN;
    if (mode === 'rs_operand') tampered.rules.find(rule => rule.id === 'trend_excess_return63_positive')!.operands.excessReturn = .999;
    assert.throws(() => launchRuleScorePage([tampered]), /page_invalid/u, mode);
  }
});

test('known false remains zero and missing original hold proof cannot be widened beyond selected51', () => {
  const data = dataset(true), result = evaluateLaunchRules(data.request, data.selected, data.external);
  assert.equal(result.availableWeight, 80);
  assert.equal(result.confirmedPoints, 0);
  assert.equal(result.totalScore, null);
  assert.equal(result.components.consolidation.score, 0);
  assert.equal(result.components.chips.score, 0);
  assert.equal(result.observations!.closingHold, null);
  for (const after of [1, 5, 6]) {
    const missing = dataset(true), original = missing.selected.evidence.history.bars[239 - after];
    missing.external.frozenOriginal = { session: original.session, level: 300, revisionId: 'fixture-frozen-original',
      availableAt: original.availableAt, priceScale: 'unchanged_fixture', comparedSourceDatasetRevision: missing.selected.evidence.history.sourceDatasetRevision };
    const score = evaluateLaunchRules(missing.request, missing.selected, missing.external);
    assert.equal(score.observations!.closingHold, null);
    assert.equal(score.rules.find(rule => rule.id === 'breakout_or_fixed_closing_hold')!.points, null);
    assert.ok(score.gaps.includes('fixed_closing_hold_original_window_share_evidence_not_connected'));
  }
});

test('partial weights, missing units/source/cutoff/finality/horizon and unknown ties stay explicit', () => {
  const data = dataset(), partial = evaluateLaunchRules(data.request, data.selected);
  assert.equal(partial.availableWeight, 60);
  assert.equal(partial.confirmedPoints, 60);
  assert.equal(partial.totalScore, null);
  for (const mode of ['chips_missing_net', 'chips_fractional', 'chips_impossible', 'wrong_units', 'wrong_revision', 'preclose', 'index_short', 'wrong_market', 'share_action', 'cutoff'] as const) {
    const changed = dataset();
    if (mode === 'chips_missing_net') changed.external.chips!.rows.at(-1)!.foreignNetShares = null;
    if (mode === 'chips_fractional') changed.external.chips!.rows.at(-1)!.foreignNetShares = .5;
    if (mode === 'chips_impossible') changed.external.chips!.rows.at(-1)!.foreignNetShares = 141;
    if (mode === 'wrong_units') Object.assign(changed.external.chips!, { unit: 'lots' });
    if (mode === 'wrong_revision') changed.external.chips!.priceRevision = 'different-price';
    if (mode === 'preclose') changed.external.index!.rows.at(-1)!.sourceTimestamp = `${changed.request.signalSession}T13:29:59+08:00`;
    if (mode === 'index_short') changed.external.index!.rows = changed.external.index!.rows.slice(-50);
    if (mode === 'wrong_market') changed.external.index!.market = 'TPEX';
    if (mode === 'share_action') changed.selected.evidence.shareVolume = null;
    if (mode === 'cutoff') changed.external.chips!.availableAt = changed.request.cutoff.replace('+08:00', '.000001+08:00');
    const score = evaluateLaunchRules(changed.request, changed.selected, changed.external);
    assert.equal(score.totalScore, null, mode);
    assert.ok(score.availableWeight < 100, mode);
    if (mode === 'chips_fractional' || mode === 'chips_impossible') {
      assert.equal(score.components.chips.availableWeight, 10, mode);
      assert.equal(score.observations!.chips!.foreign5.netShares, null, mode);
      assert.equal(score.observations!.chips!.trust5.netShares, 10, mode);
    }
  }
  const mismatch = dataset(); mismatch.selected.arithmetic.sourceDatasetRevision = 'wrong-source';
  assert.equal(evaluateLaunchRules(mismatch.request, mismatch.selected, mismatch.external).availableWeight, 0);
  for (const flag of ['depth', 'ratio', 'breakout', 'close'] as const) {
    const forged = dataset(true);
    if (flag === 'depth') forged.selected.arithmetic.consolidation.rangeDepth = 0;
    if (flag === 'ratio') forged.selected.arithmetic.contraction.atrContractionRatio = 0;
    if (flag === 'breakout') forged.selected.arithmetic.breakout.matches = true;
    if (flag === 'close') forged.selected.arithmetic.close = 10000;
    const score = evaluateLaunchRules(forged.request, forged.selected, forged.external);
    assert.equal(score.availableWeight, 0, flag);
    assert.ok(score.gaps.includes('selected_read_score_revision_or_cutoff_mismatch'), flag);
  }
  const a = evaluateLaunchRules(data.request, data.selected), b = evaluateLaunchRules({ ...data.request, symbol: '2331' }, data.selected);
  const page = launchRuleScorePage([b, a]);
  assert.deepEqual(page.unresolvedTieSymbols, ['2330', '2331']);
  assert.equal(page.orderingStatus, 'incomplete_scores_presentation_only');
});
