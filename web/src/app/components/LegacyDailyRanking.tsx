import Link from 'next/link';
import type { RadarDailyPayload } from '@/lib/types';
import { publishedRadarCandidateHref } from '@/lib/candidate-revision-query';
import {
  launchRankingMemberCurrent,
  readLaunchRankingSnapshot,
} from '@/lib/vnext/launch-ranking-read';
import LaunchCurrentStatus from './vnext/LaunchCurrentStatus';
import { launchAvailabilityText } from './vnext/LaunchTop10';

export default async function LegacyDailyRanking({ publishedRadar }: { publishedRadar?: RadarDailyPayload }) {
  const read = await readLaunchRankingSnapshot().catch(() => null);
  const snapshot = read?.snapshot;
  const pastCandidates = publishedRadar?.stages?.found.slice(0, 3) ?? [];

  return (
    <section aria-label="每日榜單" data-ranking-run-id={snapshot?.rankingRunId}>
      <h2 className="text-xl font-semibold">強勢發動 Top 10</h2>
      {snapshot && (
        <p className="mt-2 text-sm">
          台股交易日 <time dateTime={snapshot.session}>{snapshot.session}</time>
          {' · 資料截止 '}<time dateTime={snapshot.cutoff}>{snapshot.cutoff}</time>
        </p>
      )}
      {(!read || read.availability !== 'ready') && (
        <p role="status" className="mt-3">
          {read ? launchAvailabilityText(read.availability) : launchAvailabilityText('unavailable')}
        </p>
      )}
      {snapshot?.members.length === 0 && (
        <p className="mt-3">本版沒有符合完整證據與審查條件的股票。</p>
      )}
      {read && snapshot && snapshot.members.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3">排名</th>
                <th scope="col" className="py-2 pr-3">股票</th>
                <th scope="col" className="py-2 pr-3">分數</th>
                <th scope="col" className="py-2">目前狀態</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.members.map(member => {
                const query = new URLSearchParams({
                  launchRunId: snapshot.rankingRunId,
                  launchResearchRevision: member.revisionId,
                  launchScoreRevision: member.scoreRevision,
                });
                const expiresAt = read.current.find(row => row.symbol === member.symbol)?.expiresAt ?? null;
                const remainingMs = expiresAt ? Math.max(0, Math.min(120_000, Date.parse(expiresAt) - Date.parse(read.readAt))) : 0;
                return (
                  <tr key={member.symbol} className="border-b border-line align-top">
                    <td className="py-3 pr-3 tabular-nums">{member.rank}</td>
                    <th scope="row" className="py-3 pr-3">
                      <Link href={'/stock/' + member.symbol + '?' + query} className="text-accent underline">
                        {member.symbol}
                      </Link>
                    </th>
                    <td className="py-3 pr-3 tabular-nums">{member.totalScore.toFixed(1)}</td>
                    <td className="py-3">
                      <LaunchCurrentStatus
                        key={member.launchQualificationRevision + ':' + expiresAt}
                        initialCurrent={launchRankingMemberCurrent(member, read.current, read.readAt)}
                        readAt={read.readAt}
                        expiresAt={expiresAt}
                        remainingMs={remainingMs}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!snapshot && publishedRadar && pastCandidates.length > 0 && (
        <div className="mt-5 rounded-xl border border-line p-4">
          <h3 className="font-semibold">舊版已發布的來源候選</h3>
          <p className="mt-1 text-sm">
            交易資料日期 <time dateTime={publishedRadar.asOf}>{publishedRadar.asOf}</time>
            {' · '}{publishedRadar.stageCounts?.found ?? publishedRadar.stages?.found.length} 檔來源命中
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {pastCandidates.map(card => (
              <li key={card.symbol}>
                <Link href={publishedRadarCandidateHref(card, publishedRadar.snapshotPublishedAt)} className="text-accent underline">
                  {card.chineseName} {card.symbol}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-sm">
        <Link href="/candidates" className="text-accent underline">候選研究紀錄</Link>
      </p>
    </section>
  );
}
