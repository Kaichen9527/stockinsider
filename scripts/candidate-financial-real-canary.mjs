// Offline post-parser canary. No database client, network or production writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseCandidateFinancialLocalParserResult } from '../web/src/lib/candidate-financial-local-parser.ts';
import { candidateFinancialFactsFromValidatedManifest } from '../web/src/lib/candidate-financial-documents.ts';
import { validateOfficialFinancialFact } from '../web/src/lib/official-financial-validation.ts';

const [artifactRoot, parsedPrefix] = process.argv.slice(2);
if (!artifactRoot || !parsedPrefix) throw new Error('Require local official document root and parser-result prefix.');
const hashes = {
  2330: '351b4e59781a71504b30cec9d977e060ab4f978d31695e027252ecfe793d1e55',
  2892: 'bdf55b86ada47baf28ecf9eb4338cbd7ec123f176e768ef008c0327d866c98d7',
  2002: '0cc7c96a3a85a088d083b7261a4b6518278f843417246f631e3fceeb157fbde7',
  2332: '9ada94664cd2c5597d15c66cf2c439534d8f7d962d27bb830b4e3eb4105ded15',
};
const results = [];
for (const [symbol, hash] of Object.entries(hashes)) {
  const bytes = fs.readFileSync(path.join(artifactRoot, `${symbol}.xhtml`));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  const parsed = parseCandidateFinancialLocalParserResult(fs.readFileSync(`${parsedPrefix}${symbol}.json`, 'utf8'), hash);
  assert.equal(parsed.status, 'partial', 'No genuine source is document-clean.');
  assert.ok(parsed.factAcceptance.extractedInstanceSha256);
  assert.equal(parsed.validation.errorCount, parsed.factAcceptance.errors.length);
  assert.equal(parsed.validation.errorsTruncated, false);
  assert.ok(!parsed.validatedFacts.some((fact) => /:(?:Equity|ProfitLoss)$/u.test(fact.xbrl_concept)),
    'Dimensionally-invalid valuation-critical facts must remain rejected.');
  if (symbol === '2892') {
    assert.equal(parsed.factAcceptance.documentFatal, true);
    assert.equal(parsed.validatedFacts.length, 0);
  } else {
    assert.equal(parsed.factAcceptance.documentFatal, false);
    assert.ok(parsed.validatedFacts.length > 0);
  }
  const stockId = `00000000-0000-4000-8000-00000000${symbol}`;
  const collectedAt = '2026-09-11T08:00:00.000Z';
  const sourceUrl = 'https://mopsov.twse.com.tw/server-java/FileDownLoad';
  const mapped = candidateFinancialFactsFromValidatedManifest({ bytes, documentSha256: hash, parse: parsed,
    candidate: { stockId, symbol, exchange: 'TWSE' }, periodEnd: '2026-06-30', sourceUrl, collectedAt });
  const rows = mapped.map((fact) => ({ stock_id: stockId, fact_key: fact.factKey, period_start: fact.periodStart,
    period_end: fact.periodEnd, duration_kind: fact.durationKind, value: fact.value, unit: fact.unit,
    authority_tier: fact.authorityTier, provider: fact.provider, estimate_kind: fact.estimateKind,
    source_ref: fact.sourceRef, filing_restatement_id: fact.filingRestatementId,
    filing_published_at: collectedAt, source_timestamp: collectedAt, collected_at: collectedAt,
    recorded_at: collectedAt, validation_status: 'pending' }));
  const checks = rows.map((row, index) => validateOfficialFinancialFact(row, rows,
    { source_url: sourceUrl, source_sha256: hash, locator: mapped[index].locator }, collectedAt));
  results.push({ symbol, documentStatus: parsed.status, documentFatal: parsed.factAcceptance.documentFatal,
    errorRecords: parsed.validation.errorCount, structuralEligible: parsed.validatedFacts.length,
    structuralRejected: parsed.factAcceptance.rejections.length, semanticMapped: mapped.length,
    localAccountingChecksPassed: checks.filter((check) => check.status === 'validated').length,
    localAccountingChecksRejected: checks.filter((check) => check.status === 'rejected').length,
    checkReasons: [...new Set(checks.flatMap((check) => check.reasons))],
    databaseAcceptedFacts: 0, valuationComplete: false,
    disclaimer: 'Offline function checks only; no database structural/accounting receipt has been written.',
    errorManifestSha256: parsed.errorManifestSha256 });
}
process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
