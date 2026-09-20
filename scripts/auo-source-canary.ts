import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { buildForwardCommonIncomeBridge } from '../web/src/lib/forward-earnings-bridge.ts';
import { buildForwardBvpsPbScenario } from '../web/src/lib/candidate-valuation.ts';
import { parseExchangeFinancialEndpoint, TWSE_FINANCIAL_ENDPOINTS } from '../web/src/lib/candidate-financial-acquisition.ts';
import { validateAuoHistoricalPbRows, validateAuoLedgerFacts, type AuoAdmittedLedgerFact } from './auo-source-canary-policy.ts';

const SYMBOL = '2409';
const COMPANY_PROFILE_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L';

type Ledger = {
  facts: AuoAdmittedLedgerFact[];
  historicalPbRows: Array<{
    date: string; pb: number; close: number; bookValuePerShare: number;
    bookValuePeriodEnd: string; bookValueAvailableAt: string;
    bookValueSourceRef: string; sourceUrl: string;
  }>;
  currentPrice: number;
  priceSession: string;
};

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function officialJson(url: string) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`official_source_http_${response.status}:${url}`);
  const text = await response.text();
  return { payload: JSON.parse(text) as unknown, sha256: sha256(text), bytes: Buffer.byteLength(text) };
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
const admittedFacts = validateAuoLedgerFacts(ledger.facts, researchCutoff);
const historicalPbRows = validateAuoHistoricalPbRows(ledger.historicalPbRows);
const historicalPb = historicalPbRows.map((row) => row.pb);

const [incomeSource, balanceSource, companySource] = await Promise.all([
  officialJson(TWSE_FINANCIAL_ENDPOINTS.generalIncome),
  officialJson(TWSE_FINANCIAL_ENDPOINTS.generalBalance),
  officialJson(COMPANY_PROFILE_URL),
]);
const income = parseExchangeFinancialEndpoint('twse', 'generalIncome', incomeSource.payload);
const balance = parseExchangeFinancialEndpoint('twse', 'generalBalance', balanceSource.payload);
if (income.terminalReason !== 'complete' || balance.terminalReason !== 'complete') {
  throw new Error(`official_statement_parse_failed:${income.terminalReason}:${balance.terminalReason}`);
}
const latestBalance = balance.facts.filter((fact) => fact.symbol === SYMBOL && fact.periodEnd === '2026-06-30');
const commonEquity = latestBalance.find((fact) => fact.factKey === 'common_equity_attributable_to_owners');
const reportedBvps = latestBalance.find((fact) => fact.factKey === 'book_value_per_share');
const companyRows = Array.isArray(companySource.payload) ? companySource.payload as Array<Record<string, unknown>> : [];
const company = companyRows.find((row) => String(row['公司代號'] || '') === SYMBOL);
const issuedShares = Number(String(company?.['已發行普通股數或TDR原股發行股數'] || '').replace(/,/gu, ''));
if (!commonEquity || !reportedBvps || !(issuedShares > 0)) throw new Error('official_auo_equity_denominator_missing');
const commonEquityTwd = commonEquity.value * 1_000;
const derivedBvps = commonEquityTwd / issuedShares;
if (Math.abs(derivedBvps - reportedBvps.value) > 0.02) {
  throw new Error('official_auo_bvps_reconciliation_failed');
}

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
  sourceReceipts: [
    { kind: 'twse_income', url: TWSE_FINANCIAL_ENDPOINTS.generalIncome, ...incomeSource },
    { kind: 'twse_balance', url: TWSE_FINANCIAL_ENDPOINTS.generalBalance, ...balanceSource },
    { kind: 'twse_company_profile', url: COMPANY_PROFILE_URL, ...companySource },
  ].map(({ payload: _payload, ...receipt }) => receipt),
  sourceCoverage: {
    reportedQuarterFacts: admittedFacts.length,
    requiredQuarterFacts: 32,
    historicalPbObservations: historicalPb.length,
    requiredPbObservations: 48,
    latestOfficialPeriod: commonEquity.periodEnd,
  },
  officialAnchor: {
    commonEquityTwd,
    issuedCommonShares: issuedShares,
    reportedBvps: reportedBvps.value,
    reconciledBvps: Math.round(derivedBvps * 10_000) / 10_000,
    equitySourceRef: commonEquity.sourceRef,
    bvpsSourceRef: reportedBvps.sourceRef,
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
