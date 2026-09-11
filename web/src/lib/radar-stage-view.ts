import type { CandidateStageCard } from './types';

export type CandidateSignalFilter = 'all' | 'positive' | 'negative' | 'valuation_ready' | 'data_gap';
export type CandidateSort = 'stage_rank' | 'latest' | 'upside' | 'research' | 'source_diversity';

export type CandidateStageFilters = {
  query: string;
  sector: string;
  source: string;
  signal: CandidateSignalFilter;
  watchedOnly: boolean;
  sort: CandidateSort;
};

export const DEFAULT_CANDIDATE_STAGE_FILTERS: CandidateStageFilters = {
  query: '', sector: 'all', source: 'all', signal: 'all', watchedOnly: false, sort: 'stage_rank',
};

function finite(value: number | null | undefined, fallback = Number.NEGATIVE_INFINITY) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function candidateStageFilterOptions(cards: readonly CandidateStageCard[]) {
  return {
    sectors: [...new Set(cards.map((card) => card.sector).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'zh-TW')),
    sources: [...new Set(cards.flatMap((card) => card.sources.map((source) => source.platform)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  };
}

export function filterAndSortCandidateStages(
  cards: readonly CandidateStageCard[],
  filters: CandidateStageFilters,
  watchedSymbols: ReadonlySet<string> = new Set(),
) {
  const query = filters.query.trim().toLocaleLowerCase('zh-TW');
  return cards.filter((card) => {
    if (query && !`${card.symbol} ${card.chineseName} ${card.sector || ''}`.toLocaleLowerCase('zh-TW').includes(query)) return false;
    if (filters.sector !== 'all' && card.sector !== filters.sector) return false;
    if (filters.source !== 'all' && !card.sources.some((source) => source.platform === filters.source)) return false;
    if (filters.watchedOnly && !watchedSymbols.has(card.symbol)) return false;
    if (filters.signal === 'positive' && card.positivePublisherCount === 0) return false;
    if (filters.signal === 'negative' && card.negativePublisherCount === 0) return false;
    if (filters.signal === 'valuation_ready' && card.valuation.status !== 'complete') return false;
    if (filters.signal === 'data_gap' && card.valuation.status === 'complete' && !card.stale && card.unmetConditions.length === 0) return false;
    return true;
  }).sort((left, right) => {
    if (filters.sort === 'latest') return Date.parse(right.latestMentionAt) - Date.parse(left.latestMentionAt);
    if (filters.sort === 'upside') return finite(right.valuation.baseUpsidePct) - finite(left.valuation.baseUpsidePct);
    if (filters.sort === 'research') return right.scores.research - left.scores.research || right.scores.dataConfidence - left.scores.dataConfidence;
    if (filters.sort === 'source_diversity') return right.platformCount - left.platformCount || right.publisherCount - left.publisherCount;
    return right.scores.actionability - left.scores.actionability || right.scores.research - left.scores.research || right.scores.discovery - left.scores.discovery;
  });
}
