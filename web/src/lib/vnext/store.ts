import { getSupabaseServerClient } from '../supabase-server';
import { explicitScope, inputHash, researchMaterialHash, vnextEnabled } from './policy.ts';
import { eligibleClue, type Clue } from './screening.ts';
import { validateArtifact, validateReview, type Artifact, type Review, type Evidence } from './research.ts';
import type { VnextIdentity } from './auth.ts';
import { runAdmittedResearch } from './runtime.ts';
import { initialFactors, deepFactors, type ScreeningInputs, type DeepInputs } from './factors.ts';
type Row = Record<string, unknown>;
export type TrustedThesisAdmission = { materialHash:string; materialEvidence:Row; deepInputs:DeepInputs; revisionId:string|null; inputHash:string; materialChanged:boolean };
export function normalizedInput(symbol: string, value: Row, audit?:TrustedThesisAdmission) {
  const clues = Array.isArray(value.clues) ? value.clues as Clue[] : [];
  const cutoff = typeof value.cutoff === 'string' ? value.cutoff : '';
  if (!Number.isFinite(Date.parse(cutoff)) || Date.parse(cutoff) > Date.now()) throw new Error('vnext_input_cutoff_invalid');
  const allowed = clues.filter((clue) => clue.symbol === symbol && eligibleClue(clue, cutoff));
  const evidence = Array.isArray(value.evidence) ? value.evidence as Evidence[] : [];
  if (evidence.some((e) => e.sourceTier === 'official' || e.kind === 'fact')) throw new Error('vnext_official_facts_require_server_preparation');
  if (evidence.some((e) => !e.id || !e.source || !Number.isFinite(Date.parse(e.availableAt)) || Date.parse(e.availableAt) > Date.parse(cutoff))) throw new Error('vnext_evidence_point_in_time_invalid');
  if (!value.screening || typeof value.screening !== 'object') throw new Error('vnext_cached_screening_inputs_required');
  const screening = { ...value.screening as ScreeningInputs, clues: allowed, cutoff };
  const initial = initialFactors(screening);
  const deepInput=audit?.deepInputs || value.deep;
  const deep = deepInput && typeof deepInput === 'object' ? deepFactors({ ...deepInput as DeepInputs, cutoff }) : null;
  const frozen = { cutoff, clues: allowed, evidence, screening, deep: deepInput || null, auditMaterial:audit?{materialHash:audit.materialHash,materialEvidence:audit.materialEvidence,revisionId:audit.revisionId,auditedInputHash:audit.inputHash}:null, marketSnapshotHash: value.marketSnapshotHash || null, tradingValid: value.tradingValid === true, contraindication: value.contraindication === true, overheated: value.overheated === true, reasons: Array.isArray(value.reasons) ? value.reasons : [], gaps: Array.isArray(value.gaps) ? value.gaps : [], initialScore: initial, deepScore: deep, factors: initial.factors };
  const mandatoryFinancialKeys = ['annual_eps', 'operating_cashflow', 'revenue', 'shares'];
  const financialReady = mandatoryFinancialKeys.every((key) => evidence.some((e) => e.kind === 'fact' && e.key === key && typeof e.value === 'number' && Number.isFinite(e.value) && e.sourceTier === 'official'));
  return { ...frozen, derivationVersion:initial.derivationVersion,hash: researchMaterialHash(frozen), eligible: allowed.length > 0 && value.tradingValid === true && value.contraindication !== true,
    roots: [...new Set(allowed.map((clue) => clue.root))], eventAt: allowed.map((clue) => clue.eventAt).sort().at(-1) || null,
    catalystUntil: allowed.map((clue) => clue.catalystUntil).filter(Boolean).sort().at(-1) || null,
    financialReady, priceEvidence: screening.corporateActionAdjusted && initial.factors.priceVolume.value !== null,
    eventEvidence: allowed.length > 0, rootEvidence: allowed.length > 0 };
}
export async function command(identity: VnextIdentity, command: string, request: Row) {
  if (!vnextEnabled() || !identity.principal) throw new Error('vnext_authority_not_configured');
  const result = await getSupabaseServerClient().rpc('vnext_command_v1', { p_principal: identity.principal, p_command: command, p_request: request });
  if (result.error) throw new Error(`vnext_authority_rejected:${result.error.message}`);
  if (!result.data || typeof result.data !== 'object') throw new Error('vnext_authority_receipt_missing');
  return result.data as Row;
}
export async function enqueue(identity: VnextIdentity, body: Row, entrypoint: string, audits?:Record<string,TrustedThesisAdmission>) {
  const symbols = explicitScope(body.symbols ?? (body.symbol ? [body.symbol] : undefined));
  if (!symbols.length) return { jobs: [], reason: 'empty_scope', expensiveCalls: 0 };
  if (typeof body.requestKey !== 'string' || !/^[\w:.-]{1,180}$/u.test(body.requestKey)) throw new Error('vnext_request_key_required');
  const inputs: Record<string, unknown> = {}; const raw = body.inputs as Record<string, Row> | undefined;
  for (const symbol of symbols) {
    const value = raw?.[symbol]; if (!value) throw new Error('vnext_frozen_input_required');
    inputs[symbol] = normalizedInput(symbol, value, audits?.[symbol]);
  }
  return (await import('./cached-admission.ts')).cachedAdmissionCommand(identity,'enqueue',{symbols,inputs,requestKey:body.requestKey,entrypoint});
}
export async function submitAuthor(identity: VnextIdentity, body: Row) {
  // Original evidence is returned by an authenticated author claim; it is read
  // again from the durable authority for validation, never trusted from submission.
  const context = await command(identity, 'author-context', { jobId: body.jobId, executionId: body.executionId });
  if (context.committed === true) return command(identity, 'author', body);
  const evidence = ((context.evidence as Row)?.evidence || []) as Evidence[];
  let validation: ReturnType<typeof validateArtifact>;
  try { validation = validateArtifact(body.artifact, evidence, String(context.inputHash)); }
  catch (error) { validation = { valid: false, reasons: [`malformed_artifact:${error instanceof Error ? error.message : 'invalid_shape'}`] }; }
  if (!validation.valid) {
    const reason = `vnext_artifact_rejected:${validation.reasons.join(',')}`;
    // Once a model result is submitted, invalid output is a consumed attempt.
    // A separately admitted retry is required; validation cannot invite resampling.
    try { await command(identity, 'fail', { jobId: body.jobId, executionId: body.executionId, reason, permanent: false }); }
    catch { throw new Error(`${reason};failure_receipt_uncertain`); }
    throw new Error(reason);
  }
  return command(identity, 'author', body);
}
export async function submitReview(identity: VnextIdentity, body: Row) {
  const original = await command(identity, 'review-context', { jobId: body.jobId, executionId: body.executionId });
  if (original.committed === true) return command(identity, 'review', body);
  let validation: string[];
  try { validation = validateReview(body.review as Review, original.authorArtifact as Artifact, ((original.evidence as Row)?.evidence || []) as Evidence[]); }
  catch (error) { validation = [`malformed_review:${error instanceof Error ? error.message : 'invalid_shape'}`]; }
  if (validation.length) {
    const reason = `vnext_review_rejected:${validation.join(',')}`;
    try { await command(identity, 'review-fail', { jobId: body.jobId, executionId: body.executionId, reason }); }
    catch { throw new Error(`${reason};failure_receipt_uncertain`); }
    throw new Error(reason);
  }
  return command(identity, 'review', body);
}
export async function executeResearch(identity: VnextIdentity, body: Row) {
  if (identity.role !== 'author') throw new Error('vnext_author_required');
  const { requireActiveVpsWriter } = await import('../taiwan-data-runtime');
  const { acquireProductionWriteLease, releaseProductionWriteLease } = await import('../production-write-lease');
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) throw new Error(writer.error);
  const lease = await acquireProductionWriteLease(300);
  if (!lease) throw new Error('production_write_cycle_already_running');
  let receipt: Row | undefined;
  try {
    const calendar=await(await import('./calendar-sync.ts')).synchronizeExecutionCalendar();
    receipt = await command(identity, 'claim', { jobId: body.jobId });
    if (receipt.execute !== true) return receipt;
    const activeReceipt = receipt;
    const context = { symbol: String(receipt.symbol), jobId: String(receipt.jobId), executionId: String(receipt.executionId),
      verify: async () => { await command(identity, 'work-context', { jobId: activeReceipt.jobId, executionId: activeReceipt.executionId }); } };
    const result = await runAdmittedResearch(context, async () => {
      const stocks = await writer.supabase.from('stocks').select('id,symbol,name,sector').eq('symbol', context.symbol).eq('market', 'TW').single();
      if (stocks.error || !stocks.data) throw new Error('vnext_stock_authority_missing');
      const instrument = await writer.supabase.from('stock_instruments_v3').select('exchange,valid_from').eq('stock_id', stocks.data.id)
        .eq('listing_status', 'active').eq('instrument_type', 'common_stock').lte('valid_from', new Date().toISOString())
        .or(`valid_to.is.null,valid_to.gt.${new Date().toISOString()}`).order('recorded_at', { ascending: false }).limit(1).maybeSingle();
      if (instrument.error || !instrument.data || !['TWSE', 'TPEX'].includes(String(instrument.data.exchange).toUpperCase())) throw new Error('vnext_trading_authority_missing');
      const { refreshCandidateOfficialFinancials } = await import('../candidate-official-financials');
      const { processCandidateFinancialDocumentReceipts } = await import('../candidate-financial-document-worker');
      const { validatePendingOfficialFinancials } = await import('../official-financial-validation-worker');
      const acquisition = await refreshCandidateOfficialFinancials([{ stockId: String(stocks.data.id), symbol: context.symbol,
        exchange: String(instrument.data.exchange).toUpperCase() as 'TWSE' | 'TPEX', listedOn: String(instrument.data.valid_from),
        statementKind: /證券|期貨/iu.test(`${stocks.data.name} ${stocks.data.sector}`) ? 'broker' : 'general' }], new Date().toISOString(), { maxJobs: 10 });
      const parsing = await processCandidateFinancialDocumentReceipts(5, { stockId: String(stocks.data.id), symbol: context.symbol });
      const validation = await validatePendingOfficialFinancials([String(stocks.data.id)]);
      if (acquisition.failures.length || parsing.reconciliationErrors.length || parsing.results.some((r) => r.error || r.status !== 'accepted') || validation.status !== 'success') throw new Error('vnext_financial_preparation_incomplete');
      const {loadTwEntryHistoricalPriceAuthority}=await import('../tw-entry-plan-authority.ts');
      const historical=await loadTwEntryHistoricalPriceAuthority(writer.supabase,{stockId:String(stocks.data.id),symbol:context.symbol,exchange:String(instrument.data.exchange).toUpperCase() as 'TWSE'|'TPEX',signalSession:String(calendar.latestCompleted||''),cutoff:new Date().toISOString()});
      const currentPrice=historical.priceBasis?.status==='verified'?historical.bars.at(-1):undefined;
      const frozenAt = new Date().toISOString();
      const official = await writer.supabase.rpc('read_financial_facts_for_stocks_as_of', { p_cutoff: frozenAt, p_stock_ids: [stocks.data.id] }).limit(10000);
      if (official.error) throw new Error('vnext_preparation_verified_facts_unavailable');
      const facts = (official.data || []) as Row[];
      const verified = facts.filter((f) => f.validation_status === 'validated' && f.schema_valid === true && f.unit_valid === true
        && f.point_in_time_valid === true && f.consistency_valid === true && ['official_primary', 'official_filing'].includes(String(f.authority_tier)));
      const evidence = verified.map((fact): Evidence => ({ id: String(fact.fact_id), key: String(fact.fact_key), value: fact.value,
        unit: String(fact.unit), period: String(fact.period_end), source: String(fact.source_ref), sourceTier: 'official', kind: 'fact',
        eventAt: String(fact.source_timestamp), availableAt: String(fact.recorded_at), contentHash: inputHash(fact) }));
      const {currentPriceEvidence}=await import('./cached-price-factors.ts');evidence.push(...currentPriceEvidence(historical));
      const original = activeReceipt.evidence as Row;
      const frozen = { ...original, cutoff: frozenAt, admissionHash: original.hash,priceAuthority:historical,
        gaps:[...(Array.isArray(original.gaps)?original.gaps:[]),...(!currentPrice?['current_price_authority_unavailable',...historical.missingData]:[])],
        evidence: [...(Array.isArray(original.evidence) ? original.evidence as Evidence[] : []).filter((e) => !evidence.some((f) => f.id === e.id)), ...evidence] };
      const preparedHash = inputHash(frozen);
      await command(identity, 'prepare', { jobId: context.jobId, executionId: context.executionId, inputHash: preparedHash, evidence: frozen });
      return { acquisition, parsing, validation, inputHash: preparedHash, evidence: frozen };
    });
    // Acquired corrections belong to the next substantive frozen revision.
    // Current authors see exactly the original cutoff-bound evidence, never resampled input.
    return { ...receipt, inputHash: result.inputHash, evidence: result.evidence, preparation: result, published: false };
  } catch (error) {
    if (receipt?.execute === true) await command(identity, 'fail', { jobId: receipt.jobId, executionId: receipt.executionId,
      reason: error instanceof Error ? error.message : 'research_failed', permanent: false });
    throw error;
  } finally {
    await releaseProductionWriteLease(lease);
  }
}
export async function swap(identity: VnextIdentity, body: Row) {
  if (typeof body.challengerSymbol !== 'string' || !/^\d{4}$/u.test(body.challengerSymbol)) throw new Error('vnext_challenger_required');
  return command(identity, 'swap', { challengerSymbol: body.challengerSymbol, policy: body.policy, requestKey: body.requestKey });
}
export async function publishMarket(identity: VnextIdentity, body: Row) {
  if (identity.role !== 'operator') throw new Error('vnext_operator_required');
  if (Object.keys(body).some((key) => !['action', 'requestKey'].includes(key))) throw new Error('vnext_market_is_server_derived');
  await(await import('./calendar-sync.ts')).synchronizeCachedCalendar(identity);
  const { cachedMarketSnapshot } = await import('./market-producer.ts');
  const raw = await cachedMarketSnapshot();
  const { evaluatedAt: _readClock, ...frozen } = raw;
  void _readClock;
  const market = { ...frozen, snapshotHash: inputHash(frozen) };
  return command(identity, 'market', { market });
}
export async function publishResearch(identity: VnextIdentity, body: Row) {
  if (Object.keys(body).some((key) => !['action', 'jobId', 'inputHash', 'executionId'].includes(key))) throw new Error('vnext_publication_fields_invalid');
  const { qualifyPublication } = await import('./qualification.ts');
  await qualifyPublication(identity, body.jobId);
  return command(identity, 'publish', body);
}
export async function cacheContent(identity: VnextIdentity, body: Row) {
  const {currentReceiptBody,cachedAdmissionCommand}=await import('./cached-admission.ts');
  const receiptIds=currentReceiptBody(body);if(!receiptIds.length)return {receipts:[],reason:'empty_scope',expensiveCalls:0};
  return cachedAdmissionCommand(identity,'content-receipts',{receiptIds});
}
export async function readPublished(symbol?: string) {
  const result = await getSupabaseServerClient().rpc('vnext_read_v1', { p_symbol: symbol || null });
  if (result.error) throw new Error('vnext_published_contract_unavailable');
  return result.data as Row | null;
}
