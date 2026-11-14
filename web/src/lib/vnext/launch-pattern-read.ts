import { loadTwLaunchPatternReadEvidence, prepareTwLaunchNativeVolumeBinding, type TwEntryAuthorityClient, type TwEntryAuthorityRequest } from '../tw-entry-plan-authority.ts';
import { launchPatternFixture } from './launch-patterns.ts';
import { scoreLaunchReadEvidence } from './launch-score.ts';
import { bindLaunchOfficialReplay, type LaunchOfficialReplayRead } from './launch-official-replay.ts';
import { bindTpexNativeShareReplay, isNativeShareReplay, resolveNativeVolumeOverlay, nativeVolumeContext, type NativeVolumeOverlay } from './launch-native-volume.ts';

/** Thin read-only consumer of the existing official selection protocol. No
 * client/provider is constructed here, and no acquisition/writer is invoked.
 * Selected-cache validation feeds offline arithmetic, never external authority. */
export async function readLaunchPatterns(client: TwEntryAuthorityClient, request: TwEntryAuthorityRequest, replay?: LaunchOfficialReplayRead, nativeReplay?: unknown) {
  const evidence = await loadTwLaunchPatternReadEvidence(client, request);
  let nativeVolumeOverlay: NativeVolumeOverlay | null = null; const nativeGaps: string[] = [];
  if (nativeReplay !== undefined) {
    if (!isNativeShareReplay(nativeReplay)) nativeGaps.push('native_share_replay_foreign_or_cloned');
    else {
      const prepared = await prepareTwLaunchNativeVolumeBinding(client, request, evidence); nativeGaps.push(...prepared.gaps);
      if (prepared.ready) { const bound = bindTpexNativeShareReplay(nativeReplay, request, evidence); nativeVolumeOverlay = bound.overlay; nativeGaps.push(...bound.gaps); }
    }
  }
  const native = resolveNativeVolumeOverlay(nativeVolumeOverlay, nativeVolumeContext(evidence, request));
  const replayBinding = replay ? bindLaunchOfficialReplay(replay, request, evidence, nativeVolumeOverlay) : { external: {}, gaps: [], attributions: [] };
  const calendar = evidence.calendar;
  const arithmetic = launchPatternFixture({
    cutoff: request.cutoff, market: request.exchange, symbol: request.symbol, stockId: request.stockId, history: evidence.history,
    calendar: { completeness: calendar?.status === 'validated_selected_window' ? 'complete_fixture' : 'unknown',
      revisionId: calendar?.revisionId ?? '', availableAt: calendar?.availableAt ?? request.cutoff,
      sessions: calendar?.sessions.map(row => ({ session: row.session, closeAt: row.closeAt })) ?? [] },
    volumeBasis: null, nativeVolumeOverlay, nativeVolumeSelection: evidence, actionsRevision: evidence.corporateActions?.revisionId ?? null,
    // No caller booleans, guessed benchmarks/limits or retrospective breakout
    // event are promoted into this selected-evidence path.
  });
  return { scope: 'selected_read_evidence_with_offline_arithmetic' as const, sourceAuthority: false as const,
    publicationAuthority: false as const, entryAuthority: false as const, rankingAuthority: false as const,
    evidence, arithmetic, nativeVolumeOverlay, launchScore: scoreLaunchReadEvidence(request, { evidence, arithmetic, nativeVolumeOverlay }, replayBinding.external),
    officialReplay: replay ? { parserVersion: replay.parserVersion, attributions: replayBinding.attributions, gaps: replayBinding.gaps, sourceAuthority: false as const } : null,
    gaps: [...new Set([...evidence.missingData.filter(gap => !native || gap !== 'launch_tpex_exact_native_share_volume_51_not_proven'), ...arithmetic.gaps, ...replayBinding.gaps, ...nativeGaps,
      'external_acquisition_and_actual_database_not_verified'])].sort() };
}
