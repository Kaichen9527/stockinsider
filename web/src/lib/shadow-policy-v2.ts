export type ShadowReplayCard = { symbol: string; stage: string; replayHash: string | null };

export function buildShadowReplayInputs(
  manifestSymbols: string[],
  cards: ShadowReplayCard[],
): ShadowReplayCard[] {
  const allowed = new Set(manifestSymbols);
  const latest = new Map<string, ShadowReplayCard>();
  for (const card of cards) if (allowed.has(card.symbol)) latest.set(card.symbol, card);
  return [...latest.values()].sort((left, right) => left.symbol.localeCompare(right.symbol));
}

export function shadowReplayConflicts(input: {
  existingManifestId: string | null;
  existingReplayHash: string | null;
  existingStatus: string | null;
  manifestId: string;
  replayHash: string;
}): boolean {
  if (!input.existingManifestId && !input.existingReplayHash && !input.existingStatus) return false;
  return input.existingManifestId !== input.manifestId
    || input.existingReplayHash !== input.replayHash
    || input.existingStatus === 'conflict';
}
