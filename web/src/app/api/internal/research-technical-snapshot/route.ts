import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { acquireTwEntryForwardCalendar, loadTwEntryPlanAuthority } from '@/lib/tw-entry-plan-authority';
import { buildTwEntryPlans } from '@/lib/tw-entry-plan';
import { calculateTechnicalFeatures, TECHNICAL_FEATURE_RULESET_VERSION } from '@/lib/technical-features-v2';
import { createTechnicalDecisionSnapshot, researchCanonicalHash, type ThesisQualification } from '@/lib/research-agent-qualification';
import { TW_ENTRY_PLAN_RULESET } from '@/lib/tw-entry-plan-contract';
import { loadDeepArticleEvidence } from '@/lib/research-deep-evidence';
import { aggregateOfficialWeeklyBars, WEEKLY_AGGREGATION_VERSION } from '@/lib/research-weekly-bars';

type Row = Record<string, unknown>;
const SYMBOL = /^\d{4}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

/** One official-session research snapshot. It cannot itself authorize a trade. */
export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Row;
  const symbol = String(body.symbol || '');
  const observedAt = String(body.observedAt || new Date().toISOString());
  if (!SYMBOL.test(symbol) || !INSTANT.test(observedAt) || !Number.isFinite(Date.parse(observedAt))
    || Date.parse(observedAt) > Date.now()) {
    return NextResponse.json({ ok: false, error: 'research_technical_request_invalid' }, { status: 400 });
  }
  const db = getSupabaseServerClient();
  try {
    const stockRead = await db.from('stocks').select('id,symbol').eq('symbol', symbol).eq('market', 'TW').maybeSingle();
    if (stockRead.error || !stockRead.data) throw new Error(stockRead.error?.message || 'research_technical_stock_missing');
    const stockId = String(stockRead.data.id);
    const instrumentRead = await db.from('stock_instruments_v3')
      .select('stock_id,symbol,exchange,provider,source_timestamp,recorded_at')
      .eq('stock_id', stockId).eq('symbol', symbol).eq('instrument_type', 'common_stock')
      .eq('listing_status', 'active').lte('source_timestamp', observedAt).lte('recorded_at', observedAt)
      .lte('valid_from', observedAt).or(`valid_to.is.null,valid_to.gt.${observedAt}`)
      .order('recorded_at', { ascending: false }).limit(2);
    if (instrumentRead.error || !instrumentRead.data?.length) throw new Error(instrumentRead.error?.message || 'research_technical_common_stock_missing');
    const instrument = instrumentRead.data[0];
    const exchange = String(instrument.exchange);
    if (!['TWSE', 'TPEX'].includes(exchange) || instrumentRead.data.some((row) => row.exchange !== exchange)) {
      throw new Error('research_technical_exchange_conflict');
    }
    const sessionRead = await db.from('tw_trading_sessions_v3')
      .select('session_id,status,market,provider,close_at,source_timestamp,collected_at,recorded_at,source_ref')
      .eq('market', exchange).eq('status', 'completed').lte('close_at', observedAt)
      .lte('source_timestamp', observedAt).lte('collected_at', observedAt).lte('recorded_at', observedAt)
      .order('session_id', { ascending: false }).order('recorded_at', { ascending: false }).limit(2);
    if (sessionRead.error || !sessionRead.data?.length) throw new Error(sessionRead.error?.message || 'research_technical_complete_session_missing');
    const session = sessionRead.data[0];
    if (sessionRead.data[1]?.session_id === session.session_id
      && (sessionRead.data[1].close_at !== session.close_at || sessionRead.data[1].status !== session.status)) {
      throw new Error('research_technical_calendar_conflict');
    }
    const sessionDate = String(session.session_id);
    const qualificationRead = await db.from('candidate_thesis_qualifications_v1')
      .select('id,stock_id,payload,status,article_hash,review_receipt_hash')
      .eq('stock_id', stockId).order('created_at', { ascending: false }).order('id', { ascending: false })
      .limit(1).maybeSingle();
    if (qualificationRead.error || !qualificationRead.data) {
      throw new Error(qualificationRead.error?.message || 'research_technical_thesis_missing');
    }
    const thesis = qualificationRead.data.payload as ThesisQualification;
    if (!thesis || thesis.symbol !== symbol || thesis.status !== qualificationRead.data.status
      || thesis.articleHash !== qualificationRead.data.article_hash
      || thesis.reviewReceiptHash !== qualificationRead.data.review_receipt_hash) {
      throw new Error('research_technical_thesis_binding_invalid');
    }
    const dossierRead = await db.from('candidate_research_dossiers')
      .select('id,content').eq('id', thesis.articleRevisionId).maybeSingle();
    if (dossierRead.error || !dossierRead.data
      || researchCanonicalHash(dossierRead.data.content) !== thesis.articleHash) {
      throw new Error(dossierRead.error?.message || 'research_technical_article_revision_missing');
    }
    const content = dossierRead.data.content as Row;
    const article = content.deepResearch as Row | null;
    const sourceIds = article?.sourceDocumentIds;
    if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
      throw new Error('research_technical_article_sources_missing');
    }
    const articleSources = await loadDeepArticleEvidence(db, sourceIds.map(String));
    const evidenceCurrent = articleSources.length === sourceIds.length
      && articleSources.every((source) => !source.retracted && source.publicCitation);
    // An acquisition failure produces a visible pending-data row. It never
    // downgrades a missing official bar into a usable third-party signal.
    const forwardCalendar = await acquireTwEntryForwardCalendar();
    const authority = await loadTwEntryPlanAuthority(db, {
      stockId, symbol, exchange: exchange as 'TWSE' | 'TPEX', signalSession: sessionDate,
      cutoff: observedAt, forwardCalendar,
    });
    const plannedAt = new Date().toISOString();
    const plans = buildTwEntryPlans({
      ...authority, symbol, candidateRevisionId: thesis.articleRevisionId,
      dataAsOf: observedAt, availableAt: plannedAt, computedAt: plannedAt,
      formalEligibility: { state: thesis.status === 'qualified' ? 'eligible' : 'blocked',
        reasonCodes: thesis.status === 'qualified' ? [] : [`thesis_${thesis.status}`],
        policyVersion: thesis.policyVersion },
      // Production has no audited execution-liquidity predicate. Keep
      // eligibility blocked while still calculating the raw research signal.
      liquidityVerified: false, missingData: authority.missingData,
    });
    const finalDatasetConfirmed = authority.missingData.length === 0 && plans.missingData.length === 0
      && authority.calendar?.signalSession === sessionDate && authority.priceBasis?.status === 'verified'
      && authority.bars.at(-1)?.session === sessionDate;
    const rawSignalConfirmed = plans.plans.some((plan) => plan.rawSignalState === 'confirmed');
    const marketDatasetHash = researchCanonicalHash({
      sourceDatasetRevision: authority.sourceDatasetRevision,
      priceBasis: authority.priceBasis, lastBar: authority.bars.at(-1) || null,
      missingData: authority.missingData,
    });
    const calendarHash = researchCanonicalHash({ session, forwardCalendar: authority.calendar || null });
    const decision = createTechnicalDecisionSnapshot({
      thesis, observedAt: plannedAt, marketSession: sessionDate, marketDatasetHash, calendarHash,
      finalDatasetConfirmed, featureVersion: TECHNICAL_FEATURE_RULESET_VERSION,
      strategyVersion: TW_ENTRY_PLAN_RULESET, rawSignalConfirmed,
      evidenceCurrent,
      liquidityVerified: false, approvedStrategyVersion: null, existingPaperPosition: false,
    });
    const features = finalDatasetConfirmed
      ? calculateTechnicalFeatures(authority.bars.map((bar) => ({
        session: bar.session, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume,
      }))) : null;
    const weeklyBars = finalDatasetConfirmed && authority.calendar
      ? aggregateOfficialWeeklyBars({
        bars: authority.bars.map((bar) => ({
          session: bar.session, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume,
        })),
        officialCompletedSessions: authority.calendar.completedSessions,
        asOfSession: sessionDate,
        nextOfficialSession: authority.calendar.nextSession,
      }) : [];
    const completeWeeklyBars = weeklyBars.filter((bar) => bar.status === 'complete');
    const weeklyFeatures = completeWeeklyBars.length
      ? calculateTechnicalFeatures(completeWeeklyBars) : null;
    const stored = await db.from('candidate_technical_decisions_v1').insert({
      stock_id: stockId, thesis_qualification_id: qualificationRead.data.id,
      session_date: sessionDate, market_dataset_hash: marketDatasetHash, calendar_hash: calendarHash,
      feature_version: TECHNICAL_FEATURE_RULESET_VERSION, strategy_version: TW_ENTRY_PLAN_RULESET,
      snapshot: { ...decision, features, weeklyAggregationVersion: WEEKLY_AGGREGATION_VERSION,
        weeklyFeatures, lastWeeklyBar: completeWeeklyBars.at(-1) || null,
        plans: plans.plans.map((plan) => ({
        planId: plan.planId, strategyId: plan.strategyId, rawSignalState: plan.rawSignalState,
        planState: plan.planState, reasonCodes: plan.reasonCodes, entryLower: plan.entryLower,
        entryUpper: plan.entryUpper, invalidationPrice: plan.invalidationPrice,
      })), missingData: plans.missingData }, observed_at: plannedAt,
    }).select('id').single();
    if (stored.error && stored.error.code !== '23505') throw new Error(stored.error.message);
    const replay = stored.error ? await db.from('candidate_technical_decisions_v1')
      .select('id').eq('stock_id', stockId).eq('thesis_qualification_id', qualificationRead.data.id)
      .eq('session_date', sessionDate).eq('market_dataset_hash', marketDatasetHash)
      .eq('strategy_version', TW_ENTRY_PLAN_RULESET).maybeSingle() : null;
    if (replay?.error || (replay && !replay.data)) throw new Error('research_technical_replay_failed');
    return NextResponse.json({ ok: true, snapshotId: stored.data?.id || replay?.data?.id,
      decision, missingData: plans.missingData, idempotentReplay: Boolean(replay) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'research_technical_snapshot_failed' }, { status: 409 });
  }
}
