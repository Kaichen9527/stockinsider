import { readFile, writeFile } from 'node:fs/promises';
import { buildForwardCommonIncomeBridge } from '../web/src/lib/forward-earnings-bridge.ts';
import { buildForwardBvpsPbScenario } from '../web/src/lib/candidate-valuation.ts';
import { validateAuoHistoricalPbRows, validateAuoLedgerFacts, validateAuoOfficialAnchor,
  type AuoAdmittedLedgerFact, type AuoOfficialAnchor } from './auo-source-canary-policy.ts';

const SYMBOL = '2409';
type Ledger = {
  facts: AuoAdmittedLedgerFact[];
  historicalPbRows: Array<{
    date: string; pb: number; close: number; bookValuePerShare: number;
    bookValuePeriodEnd: string; bookValueAvailableAt: string;
    bookValueSourceRef: string; sourceUrl: string;
  }>;
  currentPrice: number;
  priceSession: string;
  officialAnchor: AuoOfficialAnchor;
};

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
const ledgerPath = argument('--ledger');
const outputPath = argument('--out');
if (!ledgerPath || !outputPath) {
  throw new Error('usage: npx tsx scripts/auo-source-canary.ts --ledger <read-only-ledger.json> --out <report.json>');
}
const ledger = JSON.parse(await readFile(ledgerPath, 'utf8')) as Ledger;
if (!(ledger.currentPrice > 0) || !/^\d{4}-\d{2}-\d{2}$/u.test(ledger.priceSession)) {
  throw new Error('auo_canary_ledger_incomplete');
}
const researchCutoff = '2026-09-19T23:59:59+08:00';
if (ledger.priceSession > new Date(researchCutoff).toISOString().slice(0, 10)) throw new Error('auo_canary_price_after_cutoff');
const admittedFacts = validateAuoLedgerFacts(ledger.facts, researchCutoff);
const historicalPbRows = validateAuoHistoricalPbRows(ledger.historicalPbRows, researchCutoff);
const historicalPb = historicalPbRows.map((row) => row.pb);
const anchor = validateAuoOfficialAnchor(ledger.officialAnchor, researchCutoff);
const { commonEquityTwd, issuedCommonShares: issuedShares, reportedBvps } = anchor;
const derivedBvps = commonEquityTwd / issuedShares;

const bridge = buildForwardCommonIncomeBridge(admittedFacts, {
  symbol: SYMBOL,
  evaluationAt: researchCutoff,
});
if (bridge.status !== 'complete') throw new Error(`auo_forward_common_income_bridge_incomplete:${bridge.missing.join(',')}`);
const valuation = buildForwardBvpsPbScenario({
  price: ledger.currentPrice,
  startingCommonEquity: commonEquityTwd,
  endingCommonShares: issuedShares,
  projectedCommonIncome: {
    bear: bridge.scenarios.bear.netIncome,
    base: bridge.scenarios.base.netIncome,
    bull: bridge.scenarios.bull.netIncome,
  },
  projectedDividends: { bear: 0, base: 0, bull: 0 },
  projectedCapitalAndOci: { bear: 0, base: 0, bull: 0 },
  historicalPbRatios: historicalPb,
  targetPeriodEnd: bridge.targetPeriodEnd,
});
if (!valuation) throw new Error('auo_forward_bvps_pb_valuation_incomplete');

const report = {
  schema: 'auo-source-canary-v1',
  generatedAt: new Date().toISOString(),
  symbol: SYMBOL,
  status: 'complete',
  sourceReceipts: [{ kind: 'twse_official_anchor', periodEnd: anchor.periodEnd,
    equityUrl: anchor.equitySourceUrl, sharesUrl: anchor.sharesSourceUrl, ...anchor.receipt }],
  sourceCoverage: {
    reportedQuarterFacts: admittedFacts.length,
    requiredQuarterFacts: 32,
    historicalPbObservations: historicalPb.length,
    requiredPbObservations: 48,
    latestOfficialPeriod: anchor.periodEnd,
  },
  officialAnchor: {
    commonEquityTwd,
    issuedCommonShares: issuedShares,
    reportedBvps,
    reconciledBvps: Math.round(derivedBvps * 10_000) / 10_000,
    equitySourceRef: anchor.equitySourceUrl,
    bvpsSourceRef: anchor.equitySourceUrl,
  },
  bridge,
  financialFactReceipts: admittedFacts.map((fact) => ({ factId: fact.factId, ...fact.receipt })),
  valuation,
  historicalPbEvidence: historicalPbRows,
  market: {
    currentPrice: ledger.currentPrice,
    priceSession: ledger.priceSession,
    currentPb: Math.round(ledger.currentPrice / derivedBvps * 100) / 100,
    latestPbSource: historicalPbRows.at(-1)?.sourceUrl || null,
  },
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  status: report.status,
  sourceCoverage: report.sourceCoverage,
  officialAnchor: report.officialAnchor,
  market: report.market,
  valuation: {
    bearTarget: valuation.bearTarget,
    baseTarget: valuation.baseTarget,
    bullTarget: valuation.bullTarget,
    probabilityWeightedTarget: valuation.probabilityWeightedTarget,
    baseUpsidePct: valuation.baseUpsidePct,
    rewardRiskRatio: valuation.rewardRiskRatio,
    forwardBvps: valuation.forwardBvps,
    pbMultiples: valuation.pbMultiples,
  },
}, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
