import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPeerMarketSnapshotWrite } from './peer-market-snapshot-write.ts';

test('unlicensed overseas prices cannot enter the actionability snapshot', () => {
  const blocked = buildPeerMarketSnapshotWrite({ peerRelationshipId: 'peer-1', asOf: '2026-09-07', availableAt: '2026-09-07T13:30:00Z', priceReturn20d: 12, priceSourceRef: 'https://price.example/peer', priceLicenseStatus: 'unknown' });
  assert.deepEqual(blocked, { status: 'blocked', reason: 'peer_price_license_or_provenance_missing' });
});

test('a licensed price keeps provenance and point-in-time fields in the prepared write', () => {
  const accepted = buildPeerMarketSnapshotWrite({ peerRelationshipId: 'peer-1', asOf: '2026-09-07', availableAt: '2026-09-07T13:30:00Z', fundamentalSignal: 0.4, priceReturn5d: 3, priceReturn20d: -8, priceSourceRef: 'https://price.example/peer', priceLicenseStatus: 'licensed', catchdownBlock: true });
  assert.equal(accepted.status, 'accepted');
  if (accepted.status === 'accepted') {
    assert.equal(accepted.row.price_return_20d, -8);
    assert.equal(accepted.row.provenance.price_eligible_for_actionability, true);
  }
});
