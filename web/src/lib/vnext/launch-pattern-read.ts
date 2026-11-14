import { loadTwLaunchPatternReadEvidence, type TwEntryAuthorityClient, type TwEntryAuthorityRequest } from '../tw-entry-plan-authority.ts';
import { launchPatternFixture } from './launch-patterns.ts';
import { scoreLaunchReadEvidence } from './launch-score.ts';
import { bindLaunchOfficialReplay, type parseLaunchOfficialReplay } from './launch-official-replay.ts';

/** Thin read-only consumer of the existing official selection protocol. No
 * client/provider is constructed here, and no acquisition/writer is invoked.
 * Selected-cache validation feeds offline arithmetic, never external authority. */
export async function readLaunchPatterns(client: TwEntryAuthorityClient, request: TwEntryAuthorityRequest, replay?: ReturnType<typeof parseLaunchOfficialReplay>) {
  const evidence = await loadTwLaunchPatternReadEvidence(client, request);
  const replayBinding = replay ? bindLaunchOfficialReplay(replay, request, evidence) : { external: {}, gaps: [] };
  const calendar = evidence.calendar;
  const shareVolume = evidence.shareVolume;
  const arithmetic = launchPatternFixture({
    cutoff: request.cutoff, market: request.exchange, history: evidence.history,
    calendar: { completeness: calendar?.status === 'validated_selected_window' ? 'complete_fixture' : 'unknown',
      revisionId: calendar?.revisionId ?? '', availableAt: calendar?.availableAt ?? request.cutoff,
      sessions: calendar?.sessions.map(row => ({ session: row.session, closeAt: row.closeAt })) ?? [] },
    volumeBasis: shareVolume === null ? null : { status: 'comparable_fixture', revisionId: shareVolume.revisionId,
      sourceDatasetRevision: shareVolume.sourceDatasetRevision, availableAt: shareVolume.availableAt,
      fromSession: shareVolume.fromSession, throughSession: shareVolume.throughSession },
    // No caller booleans, guessed benchmarks/limits or retrospective breakout
    // event are promoted into this selected-evidence path.
  });
  return { scope: 'selected_read_evidence_with_offline_arithmetic' as const, sourceAuthority: false as const,
    publicationAuthority: false as const, entryAuthority: false as const, rankingAuthority: false as const,
    evidence, arithmetic, launchScore: scoreLaunchReadEvidence(request, { evidence, arithmetic }, replayBinding.external),
    officialReplay: replay ? { parserVersion: replay.parserVersion, gaps: replayBinding.gaps, sourceAuthority: false as const } : null,
    gaps: [...new Set([...evidence.missingData, ...arithmetic.gaps, ...replayBinding.gaps,
      'external_acquisition_and_actual_database_not_verified'])].sort() };
}
