import type { SupabaseClient } from '@supabase/supabase-js';
import { researchCanonicalHash } from './research-agent-qualification.ts';
import { PAPER_RISK_POLICY_HASH, type PaperBook } from './research-paper-books.ts';
import type { StrategyApprovalReceipt } from './research-strategy-governance.ts';
import { RESEARCH_STRATEGY_RELEASE } from './research-strategy-release.generated.ts';

type Row = Record<string, unknown>;
export const LIQUIDITY_POLICY = 'official-turnover-lower-bound-v1';
/** Shares × traded low is a conservative lower bound, never an invented turnover. */
export function researchLiquidityCapacity(rows: Array<{ session: string; rawLow: number; volumeShares: number }>,
  sessions: string[], maximumEntryPrice: number) {
  if (sessions.length !== 20 || new Set(sessions).size !== 20 || rows.length !== 20
    || new Set(rows.map((row) => row.session)).size !== 20
    || rows.some((row) => !sessions.includes(row.session) || !Number.isFinite(row.rawLow) || row.rawLow <= 0
      || !Number.isFinite(row.volumeShares) || row.volumeShares < 0)
    || !Number.isFinite(maximumEntryPrice) || maximumEntryPrice <= 0)
    return { verified: false, maximumShares: 0, reason: 'official_twenty_session_liquidity_missing' };
  const notionals = rows.map((row) => row.rawLow * row.volumeShares).sort((a, b) => a - b);
  // Same 1% participation envelope as PR #284. The paper order must also fit
  // risk/cash/exposure limits; verification does not promise an actual fill.
  const conservativeCapacity = (notionals[9] + notionals[10]) / 2 * 0.01;
  const maximumShares = Math.floor(conservativeCapacity / maximumEntryPrice / 1000) * 1000;
  return { verified: maximumShares >= 1000, maximumShares,
    reason: maximumShares >= 1000 ? null : 'liquidity_below_one_board_lot' };
}

export async function loadResearchExecutionContext(db: Pick<SupabaseClient, 'from'>, input: {
  stockId: string; symbol: string; exchange: string; sessions: string[]; maximumEntryPrice: number; asOf: string;
}) {
  const books = await Promise.all(['conservative', 'growth'].map(async (bookId) => {
    const result = await db.from('research_paper_book_revisions_v1').select('revision_hash,state,available_at')
      .eq('book_id', bookId).lte('available_at', input.asOf).order('available_at', { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new Error(`paper_book_head_read_failed:${result.error.message}`);
    return result.data;
  }));
  const existingPaperPosition = books.some((row) => (row?.state as PaperBook | undefined)?.positions
    .some((position) => position.symbol === input.symbol));
  // Build verification binds these to the actual transitive source graph and
  // fixed parameters. Environment strings cannot impersonate another variant.
  const codeHash = RESEARCH_STRATEGY_RELEASE.codeHash;
  const parameterHash = RESEARCH_STRATEGY_RELEASE.parameterHash;
  const approvalRead = await db.from('research_strategy_records_v1').select('record_hash,payload,available_at')
    .eq('kind', 'approval').eq('payload->>codeHash', codeHash).lte('available_at', input.asOf)
    .order('available_at', { ascending: false }).limit(101);
  if (approvalRead.error || approvalRead.data && approvalRead.data.length > 100)
    throw new Error(approvalRead.error?.message || 'strategy_approval_bound_exceeded');
  const approval = (approvalRead.data || []).map((row) => row.payload as StrategyApprovalReceipt).find((receipt) => {
    const { receiptHash, ...material } = receipt;
    return receipt.schemaVersion === 'strategy-user-approval-v1' && Array.isArray(receipt.parameterHashes)
      && /^[a-f0-9]{64}$/u.test(codeHash || '') && /^[a-f0-9]{64}$/u.test(parameterHash || '')
      && receiptHash === researchCanonicalHash(material) && receipt.codeHash === codeHash
      && receipt.parameterHashes.includes(parameterHash!) && receipt.riskPolicyHash === PAPER_RISK_POLICY_HASH
      && Date.parse(receipt.approvedAt) <= Date.parse(receipt.effectiveFrom)
      && Date.parse(receipt.effectiveFrom) <= Date.parse(input.asOf)
      && Date.parse(receipt.effectiveFrom) <= Date.parse(`${input.sessions.at(-1)}T13:30:00+08:00`);
  }) || null;
  const observations = await db.from('opportunity_price_observations_v3')
    .select('observation_id,session_id,raw_low,volume,provider,source_timestamp,collected_at,recorded_at')
    .eq('stock_id', input.stockId).eq('exchange', input.exchange).eq('provider', input.exchange.toLowerCase())
    .in('session_id', input.sessions).lte('source_timestamp', input.asOf).lte('collected_at', input.asOf)
    .lte('recorded_at', input.asOf).order('recorded_at', { ascending: false })
    .order('source_timestamp', { ascending: false }).order('collected_at', { ascending: false }).order('observation_id').limit(129);
  if (observations.error || !Array.isArray(observations.data) || observations.data.length > 128)
    throw new Error(observations.error?.message || 'research_liquidity_observation_bound_exceeded');
  const latest = new Map<string, Row>();
  for (const row of observations.data as Row[]) {
    const prior = latest.get(String(row.session_id));
    if (prior && row.recorded_at === prior.recorded_at
      && (row.raw_low !== prior.raw_low || row.volume !== prior.volume)) throw new Error('research_liquidity_official_conflict');
    if (!prior) latest.set(String(row.session_id), row);
  }
  const liquidity = researchLiquidityCapacity([...latest.values()].map((row) => ({
    session: String(row.session_id), rawLow: row.raw_low == null ? NaN : Number(row.raw_low),
    volumeShares: row.volume == null ? NaN : Number(row.volume),
  })), input.sessions, input.maximumEntryPrice);
  return { existingPaperPosition, approval, expectedCodeHash: codeHash || null, parameterHash: parameterHash || null,
    liquidity, liquidityPolicy: LIQUIDITY_POLICY,
    contextHash: researchCanonicalHash({ bookHeads: books.map((row) => row?.revision_hash || null),
      approvalHash: approval?.receiptHash || null, liquidity, observations: [...latest.values()] }) };
}
