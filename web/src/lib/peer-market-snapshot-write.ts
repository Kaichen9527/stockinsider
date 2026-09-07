/** Pure, server-side write preparation for peer_market_snapshots.  The route
 * that persists this record must still be protected by requireInternalAuth. */
export type PeerSnapshotObservation = {
  peerRelationshipId: string;
  asOf: string;
  availableAt: string;
  fundamentalSignal?: number | null;
  priceReturn5d?: number | null;
  priceReturn20d?: number | null;
  priceSourceRef?: string | null;
  priceLicenseStatus?: 'licensed' | 'permitted' | 'unknown' | 'blocked' | null;
  catchdownBlock?: boolean;
};

export function buildPeerMarketSnapshotWrite(input: PeerSnapshotObservation) {
  if (!input.peerRelationshipId || !/^\d{4}-\d{2}-\d{2}/u.test(input.asOf) || !Number.isFinite(Date.parse(input.availableAt))) {
    return { status: 'rejected' as const, reason: 'peer_snapshot_identity_or_pit_missing' as const };
  }
  const licensedPrice = input.priceLicenseStatus === 'licensed' || input.priceLicenseStatus === 'permitted';
  const finiteFundamental = input.fundamentalSignal != null && Number.isFinite(input.fundamentalSignal);
  const finitePrice = input.priceReturn20d != null && Number.isFinite(input.priceReturn20d);
  const canUsePrice = licensedPrice && finitePrice && Boolean(input.priceSourceRef);
  if (!finiteFundamental && !canUsePrice) {
    return {
      status: 'blocked' as const,
      reason: finitePrice ? 'peer_price_license_or_provenance_missing' as const : 'peer_observation_missing' as const,
    };
  }
  return {
    status: 'accepted' as const,
    row: {
      peer_relationship_id: input.peerRelationshipId,
      as_of: input.asOf,
      available_at: input.availableAt,
      availability_status: 'available' as const,
      fundamental_signal: finiteFundamental ? input.fundamentalSignal : null,
      price_return_5d: canUsePrice && input.priceReturn5d != null && Number.isFinite(input.priceReturn5d) ? input.priceReturn5d : null,
      price_return_20d: canUsePrice ? input.priceReturn20d : null,
      catchdown_block: canUsePrice && input.catchdownBlock === true,
      provenance: {
        price_source_ref: canUsePrice ? input.priceSourceRef : null,
        price_license_status: input.priceLicenseStatus || 'unknown',
        price_eligible_for_actionability: canUsePrice,
      },
    },
  };
}
