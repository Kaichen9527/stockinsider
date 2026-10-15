/** Candidate server-composition consumer. READ only; not an article, rights or
 * publication validator. No HTTP/body may construct the trusted binding/RPC dependencies. */
import { createVersionedCompleteInputController, type VersionedInputRpc } from './research-versioned-complete-input.ts';
import { parseBindingCore, bindingCanonical } from './research-versioned-input-binding.ts';
import { parseCompleteRequest } from './research-versioned-input-request.ts';
import { completeHash, parseCompleteJson } from './research-v3-material-canonical.ts';
import { validateNormalizedScenarioCashMaterial } from './research-v3-finite-material.ts';
import { calculateHistoricalCash } from './research-historical-cash-core.ts';
import { recalculateResearchBusinessScenarios } from './research-business-calculator.ts';
import { historicalCashPins as pins } from './research-historical-cash-pins.ts';
import { FinancialIoDeadline } from './research-financial-io-owner.ts';

type Row = Record<string, unknown>;
type Symbol = '2409' | '2383';
type Locator = { file: string; fileSha256: string; jsonPointer: string };
type SourcePair = { packetLocator: Locator; modelLocator: Locator;
  evidence: { kind: 'retained_cash_cell'; label: string; pdfPage: number; sourceLineSha256: string; rawPdfSha256: string }
    | { kind: 'retained_June_capital_tuple'; packetEvidencePointer: '/auoJune30Capital/evidence'; modelEvidencePointer: '/historicalCashFlow/historicalCapital/evidence' } };
export type CashCitationNode = Readonly<{
  pointer: string; kind: 'reported_observation' | 'calculation'; value: number | null;
  unit: 'TWD_thousands' | 'dimensionless' | 'thousand_shares' | 'TWD' | 'TWD_per_share' | 'TWD_million' | 'million_shares';
  period: string; periodKind: 'half_year_cumulative' | 'opening_cash_balance' | 'closing_cash_balance' | 'instant' | 'quarter';
  classification: 'reported_cash_reconciliation' | 'reported_income' | 'reported_cash_balance' | 'reported_capital' | 'derived_historical_cash' | 'derived_ratio' | 'derived_capital' | 'conditional_scenario';
  scenarioId: 'bear' | 'base' | 'bull' | null; basis: string;
  sourcePairs: readonly SourcePair[];
  scenarioLocators: readonly Locator[];
  unavailableReason: string | null;
}>;
const WIRE = 'research-article-input-v3';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const PERIODS = ['2026-01-01/2026-06-30', '2025-01-01/2025-06-30'] as const;
const CAPITAL = ['ownersEquityTwdThousands', 'nonControllingEquityTwdThousands', 'groupEquityTwdThousands', 'paidCapitalTwdThousands', 'parTwd', 'issuedSharesThousands', 'treasuryCarryingAmountTwdThousands'] as const;
const NONCASH = ['depreciation','amortization','fvGain','interestExpenseAdjustment','interestIncomeAdjustment','dividendIncomeAdjustment','shareCompensation','equityMethodAdjustment','ppeDisposalGainAdjustment','rouDisposalLoss','heldForSaleGainAdjustment','investmentGainAdjustment','impairment','unrealizedFx','otherAdjustment'];
const WC = ['receivables','relatedReceivables','inventory','contractCosts','otherOperatingAssets','contractLiabilities','payables','relatedPayables','provisions','otherOperatingLiabilities'];
const SCENARIO_FIELDS = ['revenue','grossProfit','operatingExpenses','operatingProfit','nonOperating','pretaxProfit','taxExpense','netProfit','nonControllingNetProfit','ownersNetProfit','ordinaryWeightedSharesMillionAssumed','potentialWeightedSharesMillionAssumed','potentialIncludedMillion','antiDilutiveExcludedMillion','dilutedSharesMillionAssumed','basicEpsConditional','dilutedEpsConditional'] as const;
function ensure(ok: unknown): asserts ok { if (!ok) throw Error('research_v3_cash_citation_invalid'); }
function row(v: unknown): Row { ensure(v && typeof v === 'object' && !Array.isArray(v)); return v as Row; }
function array(v: unknown): unknown[] { ensure(Array.isArray(v)); return v; }
function equal(a: unknown, b: unknown) { ensure(bindingCanonical(a) === bindingCanonical(b)); }
function freeze<T>(v: T): T { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
function textJson(v: unknown, cap: number) {
  ensure(typeof v === 'string' && v.length <= cap); ensure(Buffer.byteLength(v, 'utf8') <= cap);
  return row(parseCompleteJson(v));
}
function normalizeCalculation(v: Row) { const c = { ...v }; for (const k of ['inputHash','resultHash','executionCodeHash']) delete c[k]; return c; }

/** No caller-supplied sealed row/validated flag/roots/clock. The retained READ
 * binding is resolved and verified by the existing controller on every acquisition.
 * The returned immutable reference set is scoped to that exact read, not a lease
 * or permission to use it after subsequent source revocation. */
export function createV3CashCitationConsumer(config: { bindingTexts: readonly string[]; executorFingerprint: string }) {
  const texts = [...config.bindingTexts];
  const bindings = texts.map(parseBindingCore);
  ensure(bindings.length > 0 && bindings.length <= 2 && bindings.every(b => b.core.wireVersion === WIRE));
  const controller = createVersionedCompleteInputController({ bindingTexts: texts, executorFingerprint: config.executorFingerprint,
    roots: { 'original75d-fixed8or6': '/__citation_read_only_no_fs__', 'historical15d4-fixed9or7': '/__citation_read_only_no_fs__' } });
  return Object.freeze({
    async read(db: VersionedInputRpc, requestText: unknown, inputRevisionId: string, inputHash: string) {
      ensure(typeof inputRevisionId === 'string' && UUID.test(inputRevisionId) && typeof inputHash === 'string' && HASH.test(inputHash));
      const request = parseCompleteRequest(textJson(requestText, 8192));
      const selected = bindings.filter(b => b.bindingCapsuleIdentity === request.expectedCalculatorExecutionHash && b.core.inventoryHash === request.expectedArtifactManifestHash);
      ensure(selected.length === 1); const binding = selected[0], symbol: Symbol = binding.core.symbol;
      const deadline = new FinancialIoDeadline();
      // Real controller READ path; no claim/preparation/assert/seal or financial I/O.
      const response = await controller.runCompleteInput(db, request, false, deadline);
      ensure(response.status === 'sealed' && response.revision_id === inputRevisionId && response.input_hash === inputHash);
      const payload = row(response.canonical_payload), financial = row(payload.financial), clocks = row(payload.clocks);
      ensure(payload.schemaVersion === WIRE);
      const material = row(financial.material), projection = row(material.projection);
      const readAt = String(clocks.artifactReadKnownAt);
      validateNormalizedScenarioCashMaterial(pins.profile, symbol, JSON.stringify({ ...row(financial.candidate), financialMaterial: material }), readAt, deadline);
      // Original calculator; stored calculation hashes alone never establish arithmetic.
      const scenarios = recalculateResearchBusinessScenarios(projection.projected, readAt);
      equal(material.calculation, normalizeCalculation(scenarios)); deadline.check();
      const cash = row(projection.historicalCash), retained = row(cash.calculation), refs = array(cash.references).map(row);
      ensure(refs.length === pins.companies[symbol].metrics.length);
      const facts: Record<string, unknown> = {};
      refs.forEach((ref, i) => { ensure(ref.metric === pins.companies[symbol].metrics[i]); facts[String(ref.metric)] = ref.values; });
      const cap = retained.historicalCapital === null ? null : row(retained.historicalCapital);
      const capital = cap ? { instant: cap.instant, ...Object.fromEntries(CAPITAL.map(k => [k, cap[k]])), treasurySharesThousands: cap.treasurySharesThousands } : null;
      const recomputed = calculateHistoricalCash({ schemaVersion: 'historical-cash-operands-v1', symbol, unit: 'TWD_thousands', consolidated: true, grain: 'half_year_cumulative', periods: [...PERIODS], facts, capital });
      equal(retained, recomputed); deadline.check();
      const byMetric = new Map(refs.map(ref => [String(ref.metric), ref]));
      const pairs = (keys: readonly string[], i: number): SourcePair[] => [...new Set(keys)].map(key => {
        const ref = byMetric.get(key); ensure(ref);
        const packet = row(ref.packetLocator), model = row(ref.modelLocator);
        return { packetLocator: { file: String(packet.file), fileSha256: String(packet.fileSha256), jsonPointer: `${packet.jsonPointer}/${i}` },
          modelLocator: { file: String(model.file), fileSha256: String(model.fileSha256), jsonPointer: `${model.jsonPointer}/${i}` },
          evidence: { kind: 'retained_cash_cell', label: String(ref.label), pdfPage: Number(ref.pdfPage), sourceLineSha256: String(ref.sourceLineSha256), rawPdfSha256: String(ref.rawPdfSha256) } };
      });
      const nodes: CashCitationNode[] = [];
      const add = (n: CashCitationNode) => { ensure(n.value === null || Number.isFinite(n.value)); ensure(!nodes.some(x => x.pointer === n.pointer)); nodes.push(n); };
      const baseNode = { scenarioId: null, scenarioLocators: [], unavailableReason: null } as const;
      for (let i = 0; i < 2; i++) {
        const period = PERIODS[i], r = recomputed.rows[i];
        for (const [j, ref] of refs.entries()) {
          const key = String(ref.metric), balance = key === 'openingCash' || key === 'closingCash';
          add({ ...baseNode, pointer: `/cash/reported/${key}/${i}`, kind: 'reported_observation', value: (ref.values as number[])[i], unit: 'TWD_thousands', period,
            periodKind: balance ? (key === 'openingCash' ? 'opening_cash_balance' : 'closing_cash_balance') : 'half_year_cumulative',
            classification: balance ? 'reported_cash_balance' : ['revenue','pretax','netProfit','ownersNetProfit','nonControllingNetProfit'].includes(key) ? 'reported_income' : 'reported_cash_reconciliation',
            basis: `signed_consolidated_H1_cell; not_Q2; source_metric:${pins.companies[symbol].metrics[j]}`, sourcePairs: pairs([key], i) });
        }
        const noncash = symbol === '2409' ? NONCASH : ['nonCashAdjustments'];
        const wc = symbol === '2409' ? WC : ['workingCapital','operatingAssetChange','operatingLiabilityChange'];
        const cfo = ['operatingCash','generatedCash','pretax',...noncash,...wc,'interestReceived','interestPaid','taxPaid',...(symbol === '2409' ? ['dividendReceived'] : [])];
        const dependencies: Record<keyof typeof r.calculated, string[]> = {
          nonCashAdjustments: noncash, workingCapitalCashEffect: wc, generatedCash: ['generatedCash','pretax',...noncash,...wc], cfo,
          groupNetProfit: ['netProfit','ownersNetProfit','nonControllingNetProfit'], cfoLessPpeCashOutlay: [...cfo,'ppeCash'],
          cfoLessPpeAndIntangibleCashOutlay: [...cfo,'ppeCash','intangibleCash'], afterLeasePrincipalSensitivity: [...cfo,'ppeCash','intangibleCash','leasePrincipal'],
          rouCashAcquisitionSeparate: symbol === '2409' ? [] : ['rouCash'], netBorrowingCash: symbol === '2409' ? ['shortBorrowings','shortRepayments','longBorrowings','longRepayments'] : ['shortBorrowingsNet','longBorrowings','longRepayments'],
          cashChange: ['operatingCash','investingCash','financingCash','fxCash','cashChange'], closingCash: ['openingCash','cashChange','closingCash'] };
        for (const key of Object.keys(dependencies) as (keyof typeof r.calculated)[]) {
          // Missing AUO ROU acquisition is a disclosed gap, not a citeable amount.
          if (r.calculated[key] === null) continue;
          add({ ...baseNode, pointer: `/cash/derived/${key}/${i}`, kind: 'calculation', value: r.calculated[key], unit: 'TWD_thousands', period, periodKind: key === 'closingCash' ? 'closing_cash_balance' : 'half_year_cumulative', classification: 'derived_historical_cash',
            basis: recomputed.proxyDefinition + '; ROU_acquisition_and_lease_principal_separate; disposal_gain_already_in_CFO_not_subtracted_again', sourcePairs: pairs(dependencies[key], i),
            unavailableReason: r.calculated[key] === null ? 'AUO_ROU_cash_acquisition_not_separately_retained' : null });
        }
        add({ ...baseNode, pointer: `/cash/ratio/cfoToGroupNetProfit/${i}`, kind: 'calculation', value: r.ratio.value, unit: 'dimensionless', period, periodKind: 'half_year_cumulative', classification: 'derived_ratio',
          basis: 'CFO / consolidated_group_net_profit; not_owners_EPS; zero_denominator_unavailable', sourcePairs: pairs([...cfo,'netProfit','ownersNetProfit','nonControllingNetProfit'], i), unavailableReason: r.ratio.unavailableReason });
      }
      const model = pins.companies[symbol].files[0], packet = pins.companies[symbol].files.at(-1)!;
      const capitalPair = (key: string): SourcePair => ({ packetLocator: { file: packet.path, fileSha256: packet.sha256, jsonPointer: `/auoJune30Capital/${key}` },
        modelLocator: { file: model.path, fileSha256: model.sha256, jsonPointer: `/historicalCashFlow/historicalCapital/${key}` },
        evidence: { kind: 'retained_June_capital_tuple', packetEvidencePointer: '/auoJune30Capital/evidence', modelEvidencePointer: '/historicalCashFlow/historicalCapital/evidence' } });
      if (recomputed.historicalCapital) {
        const c = recomputed.historicalCapital;
        for (const key of CAPITAL) add({ ...baseNode, pointer: `/capital/${key === 'issuedSharesThousands' ? 'derived' : 'reported'}/${key}`, kind: key === 'issuedSharesThousands' ? 'calculation' : 'reported_observation', value: c[key], unit: key === 'parTwd' ? 'TWD' : key === 'issuedSharesThousands' ? 'thousand_shares' : 'TWD_thousands', period: c.instant, periodKind: 'instant', classification: key === 'issuedSharesThousands' ? 'derived_capital' : 'reported_capital', basis: c.denominatorBasis + (key === 'issuedSharesThousands' ? '; paid_capital_divided_by_par_not_direct_share_register' : ''), sourcePairs: key === 'issuedSharesThousands' ? [capitalPair('paidCapitalTwdThousands'), capitalPair('parTwd')] : [capitalPair(key)] });
        add({ ...baseNode, pointer: '/capital/derived/ownersEquityPerIssuedCommonShare', kind: 'calculation', value: c.ownersEquityPerIssuedCommonShare, unit: 'TWD_per_share', period: c.instant, periodKind: 'instant', classification: 'derived_capital', basis: c.denominatorBasis + '; not_current_PB_or_target', sourcePairs: [capitalPair('ownersEquityTwdThousands'), capitalPair('issuedSharesThousands')] });
      }
      scenarios.scenarios.forEach((scenario, s) => scenario.quarters.forEach((q, j) => {
        for (const key of SCENARIO_FIELDS) add({ pointer: `/scenario/calculation/${scenario.id}/${q.period}/${key}`, kind: 'calculation', value: q[key], unit: key.endsWith('EpsConditional') ? 'TWD_per_share' : key.includes('Million') ? 'million_shares' : 'TWD_million', period: q.period, periodKind: 'quarter', classification: 'conditional_scenario', scenarioId: scenario.id as 'bear'|'base'|'bull',
          basis: q.shareBasis + '; manual_research_assumptions_not_reported_forecast; no_historical_cash_forecast', sourcePairs: [],
          scenarioLocators: [{ file: model.path, fileSha256: model.sha256, jsonPointer: `/scenarios/${s}/assumptions` }, { file: model.path, fileSha256: model.sha256, jsonPointer: `/scenarios/${s}/quarters/${j}/${key}` }], unavailableReason: null });
      }));
      deadline.check();
      const context = freeze({ schemaVersion: 'research-v3-cash-citation-context-candidate-v1', symbol, financialProfile: pins.profile, wireVersion: WIRE,
        requestHash: completeHash(request), bindingCapsuleIdentity: binding.bindingCapsuleIdentity, inputRevisionId, inputHash,
        sourceExecutionHash: binding.core.sourceExecutionHash, compiledFingerprintIdentity: binding.core.compiledFingerprintIdentity,
        artifactReadKnownAt: readAt, originalModelCutoff: row(projection.clocks).originalModelCutoff, extractionAvailableAt: cash.extractionAvailableAt,
        capitalAvailable: symbol === '2409', capitalUnavailableReason: symbol === '2383' ? 'no_retained_EMC_capital_tuple' : null,
        unavailableAmounts: symbol === '2409' ? ['/cash/derived/rouCashAcquisitionSeparate/0','/cash/derived/rouCashAcquisitionSeparate/1'] : [],
        noFutureCash: true, forecastCash: null, valuationApproved: false, technicalAdmission: false,
        sourceClosureApproved: false, formalRightsVerified: false, authorReviewerVerified: false, publishableResearch: false, dispatchReady: false,
        qualification: { ...row(material.provenance) }, originalCapabilities: { ...row(payload.capabilities) } });
      const frozen = freeze(nodes), index = new Map(frozen.map(n => [n.pointer, n]));
      deadline.check();
      return Object.freeze({ context, nodes: frozen,
        validateCitation(citationText: unknown): CashCitationNode {
          // Bounded primitive JSON; never walk arbitrary caller objects/getters/Map.
          const citation = textJson(citationText, 4096);
          const keys = ['symbol','financialProfile','wireVersion','requestHash','bindingCapsuleIdentity','inputRevisionId','inputHash','pointer','kind','value','unit','period','periodKind','classification','scenarioId'];
          ensure(Object.keys(citation).sort().join(',') === keys.sort().join(','));
          for (const key of ['symbol','financialProfile','wireVersion','requestHash','bindingCapsuleIdentity','inputRevisionId','inputHash'] as const) ensure(citation[key] === context[key]);
          ensure(typeof citation.pointer === 'string'); const node = index.get(citation.pointer); ensure(node);
          for (const key of ['kind','value','unit','period','periodKind','classification','scenarioId'] as const) ensure(citation[key] === node[key]);
          return node;
        } });
    }
  });
}
