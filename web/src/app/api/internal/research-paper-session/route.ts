import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { researchCanonicalHash, researchEntryQualification, type ThesisQualification } from '@/lib/research-agent-qualification';
import { loadDeepArticleEvidence } from '@/lib/research-deep-evidence';
import { fillPaperOrder, markPaperPositions, newPaperBook, settlePaperSession, sizePaperOrder,
  type PaperBook, type PaperBookId, type PaperOrder, type PaperSessionBar } from '@/lib/research-paper-books';
import { loadResearchExecutionContext, assertResearchExecutionDatabasePolicy } from '@/lib/research-execution-context';
import { acquireTwEntryForwardCalendar, loadTwEntryPlanAuthority } from '@/lib/tw-entry-plan-authority';
import { calculateTechnicalFeatures } from '@/lib/technical-features-v2';

type Row = Record<string, unknown>;
/** A restart-safe paper-only ledger. Requests contain no prices or book state. */
export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || !['conservative', 'growth'].includes(body.bookId) || !['initialize', 'session'].includes(body.action)
    || body.action === 'session' && !/^\d{4}-\d{2}-\d{2}$/u.test(String(body.session)))
    return NextResponse.json({ ok: false, error: 'paper_session_request_invalid' }, { status: 400 });
  const db = getSupabaseServerClient(); const bookId = body.bookId as PaperBookId;
  const operationKey = body.action === 'initialize' ? 'initialize-v5' : `session:${body.session}`;
  const inputHash = researchCanonicalHash({ action: body.action, bookId, session: body.session || null });
  try {
    await assertResearchExecutionDatabasePolicy(db);
    const replay = await db.from('research_paper_book_revisions_v1').select('revision_hash,input_hash,state,result')
      .eq('book_id', bookId).eq('operation_key', operationKey).maybeSingle();
    if (replay.error) throw new Error(replay.error.message);
    if (replay.data) {
      if (replay.data.input_hash !== inputHash) throw new Error('paper_session_replay_mismatch');
      return NextResponse.json({ ok: true, ...replay.data, idempotentReplay: true });
    }
    const head = await db.from('research_paper_book_revisions_v1').select('revision_hash,state,available_at')
      .eq('book_id', bookId).order('available_at', { ascending: false }).limit(1).maybeSingle();
    if (head.error) throw new Error(head.error.message);
    let book: PaperBook; const outcomes: Row[] = [];
    if (body.action === 'initialize') {
      if (head.data) throw new Error('paper_book_already_initialized');
      book = newPaperBook(bookId, new Date().toISOString());
    } else {
      if (!head.data) throw new Error('paper_book_initialize_required');
      book = head.data.state as PaperBook;
      const forwardCalendar = await acquireTwEntryForwardCalendar();
      const asOf = new Date().toISOString(); const session = String(body.session);
      const cutoffOpen = `${session}T09:00:00+08:00`;
      const inception = Date.parse(book.inceptionAt || '');
      const initialRecordedAt = Date.parse(String(head.data.available_at));
      const activationAt = book.activationAt || (!book.lastProcessedSession && Number.isFinite(inception)
        && Number.isFinite(initialRecordedAt) ? new Date(Math.max(inception, initialRecordedAt)).toISOString() : null);
      if (!Number.isFinite(inception) || !activationAt || !Number.isFinite(Date.parse(activationAt))
        || Date.parse(activationAt) < inception || Date.parse(cutoffOpen) <= Date.parse(activationAt))
        throw new Error('paper_session_before_inception');
      book = { ...book, activationAt };
      if (!book.lastProcessedSession) {
        // Freeze the start by taking the earliest completed official session
        // whose open follows initialization. Callers cannot choose a later,
        // more favorable historical starting session on restart.
        const first = await db.from('tw_trading_sessions_v3').select('session_id')
          .eq('status', 'completed').gt('open_at', activationAt)
          .lte('close_at', asOf).lte('recorded_at', asOf).order('session_id').limit(1).maybeSingle();
        if (first.error || first.data?.session_id !== session) throw new Error('paper_first_session_must_follow_inception');
      }
      const priorSession = await db.from('tw_trading_sessions_v3').select('session_id')
        .eq('status', 'completed').lt('close_at', cutoffOpen).lte('recorded_at', cutoffOpen)
        .order('session_id', { ascending: false }).limit(1).maybeSingle();
      if (priorSession.error || !priorSession.data) throw new Error('paper_prior_official_session_missing');
      const snapshots = await db.from('candidate_technical_decisions_v1')
        .select('id,stock_id,session_date,snapshot,observed_at,created_at')
        .eq('session_date', priorSession.data.session_id).lte('observed_at', cutoffOpen).lte('created_at', cutoffOpen)
        .order('session_date', { ascending: false }).order('observed_at', { ascending: false }).order('id').limit(1001);
      if (snapshots.error || !Array.isArray(snapshots.data) || snapshots.data.length > 1000)
        throw new Error(snapshots.error?.message || 'paper_entry_snapshot_bound_exceeded');
      // Preserve the latest pre-open snapshot even when it revokes an earlier
      // eligible one. The caller cannot choose a profitable subset after close.
      const latest = new Map<string, Row>();
      for (const row of snapshots.data) if (!latest.has(String(row.stock_id))) latest.set(String(row.stock_id), row);
      const entrySnapshots = [...latest.values()].filter((row) => {
        const snapshot = row.snapshot as Row;
        return snapshot.entryResearchEligible === true && Array.isArray(snapshot.plans)
          && snapshot.plans.some((plan) => plan.validFromSession === session && plan.rawSignalState === 'confirmed');
      });
      const symbols = [...new Set([...book.positions.map((position) => position.symbol),
        ...entrySnapshots.map((row) => String((row.snapshot as Row).symbol))])].sort();
      const bars: PaperSessionBar[] = []; const ma20BySymbol: Record<string, number | null> = {};
      const contexts = new Map<string, Awaited<ReturnType<typeof loadResearchExecutionContext>>>();
      const stocks = new Map<string, Row>();
      const corporateActionEntries = new Set<string>();
      const entryBlocks = new Map<string, string>();
      for (const symbol of symbols) {
        const stock = await db.from('stocks').select('id,symbol,sector').eq('symbol', symbol).eq('market', 'TW').maybeSingle();
        if (stock.error || !stock.data) throw new Error(stock.error?.message || 'paper_stock_missing');
        // Resolve the cutoff-visible authority stream, including inactive heads;
        // filtering active rows first could resurrect a withdrawn listing.
        const instrument = await db.rpc('resolve_legacy_instrument_authority_v3_13', {
          p_stock_id: stock.data.id, p_cutoff: cutoffOpen,
        });
        const selected = instrument.data?.[0];
        if (instrument.error || instrument.data?.length !== 1 || selected?.symbol !== symbol
          || selected.instrument_type !== 'common_stock' || !['TWSE', 'TPEX'].includes(selected.exchange))
          throw new Error(instrument.error?.message || 'paper_instrument_missing');
        const exchange = selected.exchange as 'TWSE' | 'TPEX';
        const held = book.positions.some((position) => position.symbol === symbol);
        if (!held && (selected.listing_status !== 'active'
          || selected.valid_to && Date.parse(selected.valid_to) <= Date.parse(cutoffOpen))) {
          entryBlocks.set(symbol, 'listing_not_active_at_entry');
          continue;
        }
        const sector = await db.rpc('resolve_legacy_sector_authority_v3_13', {
          p_stock_id: stock.data.id, p_market: exchange, p_cutoff: cutoffOpen,
        });
        if (sector.error) throw new Error(sector.error.message);
        const assignment = sector.data?.length === 1 ? sector.data[0] : null;
        const canonicalSector = assignment?.status === 'active'
          && (!assignment.valid_to || Date.parse(assignment.valid_to) > Date.parse(cutoffOpen))
          ? assignment.canonical_sector_key : null;
        if (!held && !canonicalSector) { entryBlocks.set(symbol, 'canonical_sector_missing_at_entry'); continue; }
        const authority = await loadTwEntryPlanAuthority(db, { stockId: stock.data.id, symbol, exchange, signalSession: session, cutoff: asOf, forwardCalendar });
        if (authority.missingData.length || authority.priceBasis?.status !== 'verified'
          || authority.bars.at(-1)?.session !== session) throw new Error(`paper_official_session_pending:${symbol}`);
        if (book.lastProcessedSession) {
          const next = authority.calendar?.completedSessions.find((day) => day > book.lastProcessedSession!);
          if (next !== session) throw new Error('paper_sessions_must_be_processed_in_order');
        }
        const current = authority.bars.at(-1)!;
        // Split/dividend ledger conversion needs the engine's explicit share and
        // cash terms. An adjusted chart factor is not sufficient to alter shares.
        {
          const action = authority.anchorAction;
          const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
          const digest = /^[0-9a-f]{64}$/u;
          if (!action || action.schema !== 'tw-entry-anchor-action-v1' || action.status !== 'verified'
            || action.symbol !== symbol || action.exchange !== exchange || action.session !== session || action.cutoff !== asOf
            || typeof authority.sourceDatasetRevision !== 'string' || !authority.sourceDatasetRevision || authority.sourceDatasetRevision.length > 128
            || action.sourceDatasetRevision !== authority.sourceDatasetRevision
            || !uuid.test(action.snapshotId) || !uuid.test(action.sessionAuthorityId) || !digest.test(action.datasetHash)
            || action.event !== null && (!action.event || !['ex_right_dividend', 'capital_reduction', 'par_value_change'].includes(action.event.kind)
              || !digest.test(action.event.sourceRowRef)))
            throw new Error(`paper_anchor_action_context_invalid:${symbol}`);
          if (action.event !== null) {
            if (held) throw new Error(`paper_corporate_action_reconciliation_required:${symbol}`);
            corporateActionEntries.add(symbol);
          }
        }
        bars.push({ symbol, session, open: current.open, high: current.high, low: current.low, close: current.close,
          volumeShares: current.volume, officialFinal: true });
        ma20BySymbol[symbol] = calculateTechnicalFeatures(authority.bars).ma20;
        const entry = entrySnapshots.find((row) => (row.snapshot as Row).symbol === symbol);
        const frozenPlan = entry ? ((entry.snapshot as Row).plans as Row[]).find((plan) => plan.validFromSession === session && plan.rawSignalState === 'confirmed') : null;
        contexts.set(symbol, await loadResearchExecutionContext(db, { stockId: stock.data.id, symbol, exchange,
          sessions: authority.bars.slice(-21, -1).map((bar) => bar.session),
          maximumEntryPrice: frozenPlan ? Number(frozenPlan.entryUpper) : 1, asOf: cutoffOpen }));
        stocks.set(symbol, { ...stock.data, sector: canonicalSector });
      }
      // An empty book still needs an official completed session, not a guessed weekday.
      if (!bars.length) {
        const calendar = await db.from('tw_trading_sessions_v3').select('session_id').eq('session_id', session)
          .eq('status', 'completed').lte('close_at', asOf).lte('recorded_at', asOf).limit(1);
        if (calendar.error || !calendar.data?.length) throw new Error('paper_official_session_pending');
        if (book.lastProcessedSession) {
          const next = await db.from('tw_trading_sessions_v3').select('session_id').eq('status', 'completed')
            .gt('session_id', book.lastProcessedSession).lte('close_at', asOf).lte('recorded_at', asOf)
            .order('session_id').limit(1).maybeSingle();
          if (next.error || next.data?.session_id !== session) throw new Error('paper_sessions_must_be_processed_in_order');
        }
      }
      book = markPaperPositions({ book, session, bars, ma20BySymbol });
      for (const row of entrySnapshots.sort((a, b) => String((a.snapshot as Row).symbol).localeCompare(String((b.snapshot as Row).symbol)))) {
        const snapshot = row.snapshot as Row; const symbol = String(snapshot.symbol);
        if (entryBlocks.has(symbol)) {
          outcomes.push({ symbol, outcome: 'blocked', reason: entryBlocks.get(symbol) }); continue;
        }
        const execution = contexts.get(symbol)!;
        if (corporateActionEntries.has(symbol)) {
          outcomes.push({ symbol, outcome: 'blocked', reason: 'corporate_action_changed_frozen_entry_basis' }); continue;
        }
        const plan = (snapshot.plans as Row[]).find((plan) => plan.validFromSession === session && plan.rawSignalState === 'confirmed')!;
        const stock = stocks.get(symbol)!;
        if (!stock.sector || !execution.approval || execution.approval.receiptHash !== snapshot.strategyVersion) {
          outcomes.push({ symbol, outcome: 'blocked', reason: 'sector_or_exact_approval_missing' }); continue;
        }
        const qualification = await db.from('candidate_thesis_qualifications_v1').select('payload')
          .eq('stock_id', stock.id).lte('qualified_at', cutoffOpen).lte('created_at', cutoffOpen)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (qualification.error) throw new Error(qualification.error.message);
        const thesis = qualification.data?.payload as ThesisQualification | undefined;
        const thesisQualified = Boolean(thesis && researchEntryQualification(thesis, cutoffOpen).allowed
          && thesis.articleHash === snapshot.articleHash && thesis.reviewReceiptHash === snapshot.reviewReceiptHash);
        const dossier = await db.from('candidate_research_dossiers').select('content').eq('id', String(snapshot.articleRevisionId)).maybeSingle();
        if (dossier.error) throw new Error(dossier.error.message);
        const sourceIds = dossier.data?.content?.deepResearch?.sourceDocumentIds;
        const sources = Array.isArray(sourceIds) ? await loadDeepArticleEvidence(db, sourceIds, cutoffOpen) : [];
        const evidenceCurrent = Boolean(dossier.data && researchCanonicalHash(dossier.data.content) === snapshot.articleHash
          && sources.length && sources.every((source) => !source.retracted && !source.superseded
            && source.substantiveEvidence !== false && source.publicCitation));
        const order: PaperOrder = { symbol, sector: String(stock.sector), strategyVersion: String(snapshot.strategyVersion),
          signalSession: String(plan.signalSession), executionSession: session,
          entryLower: Number(plan.entryLower), entryUpper: Number(plan.entryUpper), stopPrice: Number(plan.invalidationPrice),
          technicalSnapshotEligible: snapshot.entryResearchEligible === true && evidenceCurrent, thesisQualified,
          liquidityVerified: execution.liquidity.verified, approval: execution.approval,
          expectedCodeHash: execution.expectedCodeHash!, parameterHash: execution.parameterHash! };
        const sized = sizePaperOrder({ book, order, markPrices: {} });
        const shares = Math.min(sized.shares, execution.liquidity.maximumShares);
        if (!shares) { outcomes.push({ symbol, outcome: 'blocked', blockers: sized.blockers }); continue; }
        const filled = fillPaperOrder({ book, order, shares, bar: bars.find((bar) => bar.symbol === symbol)!, markPrices: {} });
        book = filled.book; outcomes.push({ symbol, outcome: filled.outcome, shares, fillPrice: filled.fillPrice });
      }
      book = settlePaperSession({ book, session, bars });
    }
    const result = { action: body.action, outcomes, actualOrders: false };
    const parentHash = head.data?.revision_hash || null;
    const revisionHash = researchCanonicalHash({ bookId, parentHash, operationKey, inputHash, book, result });
    const saved = await db.from('research_paper_book_revisions_v1').insert({ revision_hash: revisionHash, book_id: bookId,
      parent_hash: parentHash, operation_key: operationKey, input_hash: inputHash, state: book, result });
    if (saved.error) throw new Error(saved.error.message);
    return NextResponse.json({ ok: true, revisionHash, state: book, result, idempotentReplay: false });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'paper_session_failed' }, { status: 409 });
  }
}
