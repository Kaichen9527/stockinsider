/** Read-only research triage. Never a trade gate, scheduler or new budget ledger. */
export const DISCOVERY_ADMISSION_POLICY = 'candidate-discovery-admission-v1';
export const DISCOVERY_ADMISSION_LIMITS = Object.freeze({ general: 15, lowVolume: 5, weeklyNewDeepResearch: 5 });
export type DiscoverySource = {
  sourceId: string; platform: string; publisherId: string | null; rootId: string | null;
  identityResolved: boolean; status: 'current' | 'retracted';
  kind: 'official' | 'public'; mentionedSymbols: string[];
};
export type PttArticleEvidence = {
  sourceId: string; body: string; bodyMentionedSymbols: string[];
  replies: Array<{ authorId: string; text: string; mentionedSymbols: string[]; kind: 'reply' | 'reaction' }>;
};
export type DiscoveryEvidence = {
  complete: boolean; sources: DiscoverySource[]; pttArticles: PttArticleEvidence[] | null;
  lowVolumeLead?: { sourceId: string; kind: 'major_official_event' | 'high_impact_new_lead'; reason: string; newInformation: boolean } | null;
};
export type DiscoveryAdmission = {
  status: 'admitted' | 'not_admitted' | 'unsupported'; lane: 'general' | 'low_volume' | null;
  reason: string; effectivePttAuthors: number; gaps: string[];
  investmentQualified: false;
};
const result = (status: DiscoveryAdmission['status'], lane: DiscoveryAdmission['lane'], reason: string,
  effectivePttAuthors = 0, gaps: string[] = []): DiscoveryAdmission => ({ status, lane, reason, effectivePttAuthors, gaps, investmentQualified: false });
const platforms = new Set(['official', 'news', 'broker', 'ptt', 'threads', 'instagram', 'facebook', 'investanchors', 'telegram', 'youtube', 'podcast', 'bulltalk']);
const identity = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 256
  && value === value.trim() && value === value.normalize('NFC');
const hasSymbol = (text: string, symbol: string) => new RegExp(`(?:^|[^0-9A-Za-z])${symbol}(?:$|[^0-9A-Za-z])`, 'u').test(text);

export function admitDiscoveryCandidate(symbol: string, evidence: DiscoveryEvidence | null): DiscoveryAdmission {
  if (!/^\d{4}$/u.test(symbol)) throw new Error('discovery_symbol_invalid');
  if (!evidence || evidence.complete !== true) return result('unsupported', null, 'complete_source_lineage_missing', 0,
    ['canonical_publisher_and_independent_root', 'per_reply_ptt_stock_mentions']);
  if (!Array.isArray(evidence.sources) || evidence.sources.length > 512 || evidence.pttArticles !== null
    && (!Array.isArray(evidence.pttArticles) || evidence.pttArticles.length > 64)) throw new Error('discovery_evidence_bound');
  const ids = new Set<string>();
  for (const source of evidence.sources) {
    if (!identity(source.sourceId) || !platforms.has(source.platform) || ids.has(source.sourceId)
      || !['current', 'retracted'].includes(source.status) || !['official', 'public'].includes(source.kind)
      || !Array.isArray(source.mentionedSymbols) || source.mentionedSymbols.length > 12
      || source.mentionedSymbols.some(value => !/^\d{4}$/u.test(value))) throw new Error('discovery_source_invalid');
    ids.add(source.sourceId);
  }
  // IDs must come from resolved cross-platform creator/root lineage. Platform-
  // prefixed legacy author keys and content hashes are not such evidence.
  const retractedRoots = new Set(evidence.sources.filter(source => source.status === 'retracted' && identity(source.rootId)).map(source => source.rootId));
  const known = evidence.sources.filter(source => !retractedRoots.has(source.rootId) && source.status === 'current' && source.mentionedSymbols.includes(symbol)
    && source.identityResolved === true && identity(source.publisherId) && identity(source.rootId));
  let multiSource = false;
  for (const left of known) for (const right of known) {
    if (left.publisherId !== right.publisherId && left.rootId !== right.rootId)
      multiSource = true;
  }
  let effective = 0, totalReplies = 0;
  for (const article of evidence.pttArticles || []) {
    if (!identity(article.sourceId) || typeof article.body !== 'string' || article.body.length > 50_000
      || !Array.isArray(article.bodyMentionedSymbols) || article.bodyMentionedSymbols.length > 12
      || !Array.isArray(article.replies) || article.replies.length > 2048) throw new Error('discovery_ptt_invalid');
    totalReplies += article.replies.length;
    if (totalReplies > 4096) throw new Error('discovery_ptt_bound');
    const source = evidence.sources.find(row => row.sourceId === article.sourceId);
    if (!source || source.status !== 'current' || source.platform !== 'ptt' || retractedRoots.has(source.rootId) || !source.mentionedSymbols.includes(symbol)
      || !article.bodyMentionedSymbols.includes(symbol) || !hasSymbol(article.body, symbol)) continue;
    const authors = new Set<string>();
    for (const reply of article.replies) {
      if (!identity(reply.authorId) || typeof reply.text !== 'string' || reply.text.length > 1000
        || !Array.isArray(reply.mentionedSymbols) || reply.mentionedSymbols.length > 12
        || !['reply', 'reaction'].includes(reply.kind)) throw new Error('discovery_ptt_reply_invalid');
      if (reply.kind === 'reply' && reply.mentionedSymbols.includes(symbol) && hasSymbol(reply.text, symbol))
        authors.add(reply.authorId.trim().toLowerCase());
    }
    effective = Math.max(effective, authors.size); // One article, never pooled across posts.
  }
  if (multiSource) return result('admitted', 'general', 'two_independent_publishers_roots', effective);
  if (effective >= 20) return result('admitted', 'general', 'ptt_twenty_stock_mention_authors', effective);
  const lead = evidence.lowVolumeLead;
  if (lead && lead.newInformation === true && typeof lead.reason === 'string' && lead.reason.trim().length >= 4
    && lead.reason.length <= 600 && ['major_official_event', 'high_impact_new_lead'].includes(lead.kind)) {
    const source = known.find(row => row.sourceId === lead.sourceId);
    if (source && (lead.kind !== 'major_official_event' || source.kind === 'official'))
      return result('admitted', 'low_volume', 'reasoned_low_volume_lead_not_confirmation', effective);
  }
  const gaps = [ ...(known.length !== evidence.sources.filter(source => source.status === 'current' && source.mentionedSymbols.includes(symbol)).length
    ? ['canonical_publisher_and_independent_root'] : []), ...(evidence.pttArticles === null ? ['per_reply_ptt_stock_mentions'] : []) ];
  return result(gaps.length ? 'unsupported' : 'not_admitted', null, 'independent_source_or_ptt_threshold_not_met', effective, gaps);
}

/** Project existing ranked inputs, preserving complete accounting. No new score,
 * queue persistence or weekly admission authority is created here. */
export function projectDiscoveryAdmission(rows: readonly { symbol: string; evidence: DiscoveryEvidence | null }[]) {
  if (rows.length > 5000 || new Set(rows.map(row => row.symbol)).size !== rows.length) throw new Error('discovery_cohort_invalid');
  let general = 0, lowVolume = 0;
  const audit = rows.map(row => {
    const admission = admitDiscoveryCandidate(row.symbol, row.evidence);
    const selected = admission.status === 'admitted' && (admission.lane === 'general'
      ? general < DISCOVERY_ADMISSION_LIMITS.general : lowVolume < DISCOVERY_ADMISSION_LIMITS.lowVolume);
    if (selected) { if (admission.lane === 'general') general++; else lowVolume++; }
    return { symbol: row.symbol, admission, selected, capacityDeferred: admission.status === 'admitted' && !selected };
  });
  return { policy: DISCOVERY_ADMISSION_POLICY, audit, selectedSymbols: audit.filter(row => row.selected).map(row => row.symbol),
    expectedCount: rows.length, accountedCount: audit.length, weeklyNewDeepResearchLimit: 5 as const,
    schedulingIntegrated: false as const };
}

/** Current main cards carry only bounded display links, not full root/reply
 * evidence. Counts and 8 links cannot satisfy the new admission contract. */
export function admissionForLegacyCard(card: { symbol: string }) {
  return admitDiscoveryCandidate(card.symbol, null);
}

export function discoveryCardPresentation(card: {
  technical: { close: number | null; sessionDate: string | null };
  valuation: { status: string; method: string | null; baseTarget: number | null; currentPrice: number | null };
  stale: boolean;
}, latestCompletedSession: string | null = null) {
  const day = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const session = day(card.technical.sessionDate) ? card.technical.sessionDate : null;
  const close = session && typeof card.technical.close === 'number' && Number.isFinite(card.technical.close)
    && card.technical.close > 0 ? card.technical.close : null;
  const latest = day(latestCompletedSession) ? latestCompletedSession : null;
  const priceStatus = !close ? 'missing' : !latest ? 'latest_session_unverified' : session === latest ? 'latest_complete_close'
    : session! < latest ? 'older_close' : 'future_close';
  const method = card.valuation.method || '未提供';
  const reference = /(?:^|_)(?:pb_reference|ttm)(?:_|$)/u.test(method);
  const referenceValue = reference && card.valuation.status === 'complete' && !card.stale
    && typeof card.valuation.baseTarget === 'number' && Number.isFinite(card.valuation.baseTarget) && card.valuation.baseTarget > 0
    ? card.valuation.baseTarget : null;
  return { close: priceStatus === 'future_close' ? null : close, session, priceStatus,
    valuationLabel: referenceValue !== null ? `歷史估值參考（${method}）` : '估值待重估', referenceValue,
    valuationDateLabel: '估值來源日期待接線', baseUpsidePct: null, forwardTarget: null };
}

/** Presentation pagination only. No candidate qualification or queue admission. */
export const DISCOVERY_CLUE_PAGE_SIZE = 20;
export function pageDiscoveryClues<T>(rows: readonly T[], requestedPage: number) {
  if (rows.length > 5000) throw new Error('discovery_clue_cohort_bound');
  const pageCount = Math.max(1, Math.ceil(rows.length / DISCOVERY_CLUE_PAGE_SIZE));
  const pageIndex = Math.min(pageCount - 1, Math.max(0, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0));
  const offset = pageIndex * DISCOVERY_CLUE_PAGE_SIZE;
  const items = rows.slice(offset, offset + DISCOVERY_CLUE_PAGE_SIZE);
  return { items, pageIndex, pageCount, total: rows.length, start: items.length ? offset + 1 : 0, end: offset + items.length };
}

type DiscoveryCoverageDetail = {
  connector: string; status: string; lastTerminalStatus?: string | null; recordsWrittenThisRun?: number;
  lastAttemptAt?: string | null;
};
/** Only reports saved ledger/policy states. Missing rows do not imply enablement. */
export function discoveryCoverageNotes(details: readonly DiscoveryCoverageDetail[] = []) {
  if (details.length > 64) throw new Error('discovery_coverage_bound');
  return [['instagram', 'Instagram'], ['threads', 'Threads'], ['telegram', 'Telegram'], ['investanchors', '定錨授權摘要']].map(([connector, label]) => {
    const rows = details.filter(row => row.connector === connector);
    const row = rows.length === 1 ? rows[0] : undefined;
    const state = row?.status;
    const terminal = row?.lastTerminalStatus || state;
    const summary = !row ? '本快照未提供可驗證狀態，不能宣稱已啟用'
      : state === 'retired' ? '已退役；歷史線索仍保留，不納入自動取得'
      : state === 'blocked_auth' ? '等待官方授權，目前未啟用取得'
      : state === 'blocked_license' ? '缺少來源使用授權，目前未啟用取得'
      : state === 'manual_only' ? '僅限受控授權摘要，並非自動取得全文'
      : terminal === 'duplicate_only' ? '已讀取，但內容重複，沒有新增獨立消息根源'
      : terminal === 'metadata_only' ? '只取得公開中繼資料，沒有全文或逐字稿'
      : ['failed', 'timed_out', 'auth_failed', 'provider_failed', 'degraded', 'partial'].includes(terminal || '') ? '本輪取得失敗或不完整，不能視為完整覆蓋'
      : terminal === 'successful_empty' ? '本輪沒有新增內容，不代表完整來源覆蓋'
      : terminal === 'success' && Number(row.recordsWrittenThisRun) > 0 ? '本輪有新增記錄；仍需核對個股提及與根源'
      : '本輪狀態待核對，不能宣稱完整覆蓋';
    return { connector, label, summary, observedAt: row?.lastAttemptAt || null };
  });
}
