import assert from 'node:assert/strict';
import test from 'node:test';
import { institutionalRatioFixture, sumInstitutionalShares } from './launch-institutional-volume.ts';

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
