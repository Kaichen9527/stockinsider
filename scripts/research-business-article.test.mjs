import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { loadResearchFinancialSupplement } from '../web/src/lib/research-financial-supplement.ts';
import { completeHash } from '../web/src/lib/research-complete-canonical.ts';
import { DEEP_ARTICLE_SECTION_ORDER } from '../web/src/lib/research-deep-article.ts';
import { validateBusinessResearchArticle } from '../web/src/lib/research-business-article.ts';

// Actual fixed AUO/EMC financial files/calculators, but explicitly synthetic
// claim/revision/source rows. This is pure contract acceptance, not PG sealing,
// live source/role/author/reviewer/publication or financial authenticity proof.
const mapping = JSON.parse(readFileSync('web/src/lib/research-complete-mapping.json', 'utf8'));
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const oldHash = value => createHash('sha256').update(canonical(value)).digest('hex');
const fixtures = new Map();
async function fixture(symbol = '2409') {
  if (fixtures.has(symbol)) return structuredClone(fixtures.get(symbol));
  const r = { owner: 'synthetic-article-fixture', jobId: randomUUID(), attempt: 1, reservationId: randomUUID(),
    bundleId: null, sourceDocumentIds: [], scope: 'research_observed_v1', snapshotHash: 'a'.repeat(64) };
  const preparationId = randomUUID();
  const preparationPayload = { symbol, scope: r.scope, snapshotHash: r.snapshotHash, modelDispatched: false };
  const preparationHash = oldHash(preparationPayload);
  const saved = { preparation_id: preparationId, input_hash: preparationHash, payload: preparationPayload, request: r,
    replay: true, dispatchReady: false, job_id: r.jobId, attempt: 1, reservation_id: r.reservationId, admitted_at: new Date().toISOString() };
  const db = { rpc(name) {
    assert.equal(name, 'assert_research_input_preparation_v2');
    return { abortSignal: async () => ({ data: structuredClone(saved), error: null }) };
  } };
  const supplement = await loadResearchFinancialSupplement(db, { request: r, preparationId, preparationInputHash: preparationHash }, process.cwd());
  const projection = structuredClone(supplement.projection); delete projection.sourceManifestHash;
  const calculation = structuredClone(supplement.calculation);
  for (const key of ['inputHash', 'resultHash', 'executionCodeHash']) delete calculation[key];
  const admittedAt = new Date().toISOString(), deadline = new Date(Date.now() + 1800_000).toISOString();
  const request = { owner: r.owner, jobId: r.jobId, attempt: 1, reservationId: r.reservationId, scope: r.scope,
    snapshotHash: r.snapshotHash, preparationId, preparationHash,
    expectedArtifactManifestHash: mapping.companies[symbol].inventoryHash, expectedCalculatorExecutionHash: mapping.sourceClosureHash };
  const source = { id: randomUUID(), rowHash: 'b'.repeat(64), url: 'https://example.com/public-summary',
    observedAt: '2026-10-08T14:00:00Z', admittedAt: '2026-10-08T14:01:00Z',
    publication: { precision: 'date', raw: '2026-10-08', timezone: null, instant: null },
    scope: 'company_mentions', symbols: [symbol], rights: 'public_summary_only', retracted: false, superseded: false };
  const payload = { schemaVersion: 'research-article-input-v2', assemblyStatus: 'complete', evidenceStatus: 'incomplete', producerAttribution: 'internal_controller_asserted',
    preparation: { id: preparationId, inputHash: preparationHash }, researchIdentity: { symbol, scope: r.scope, snapshotHash: r.snapshotHash, researchCompanyId: randomUUID() },
    originalJob: { jobId: r.jobId, attempt: 1, owner: r.owner, leaseExpiresAt: deadline },
    originalReservation: { reservationId: r.reservationId, startedAt: new Date(Date.now() - 60_000).toISOString(), leaseExpiresAt: deadline },
    sources: { sealId: randomUUID(), manifest: [{ id: source.id, rowHash: source.rowHash }], coverage: 'incomplete' },
    financial: { artifactInventory: mapping.companies[symbol].inventory, material: { projection, calculation } },
    hashes: { preparationInputHash: preparationHash, artifactInventoryHash: mapping.companies[symbol].inventoryHash,
      sourceClosureHash: mapping.sourceClosureHash, modelHistoricalCanonicalHash: mapping.companies[symbol].historicalHash,
      sourceManifestHash: completeHash(projection.sourceManifest), projectionHash: completeHash(projection),
      scenarioInputHash: completeHash(projection.projected.scenarios), resultHash: completeHash(calculation) },
    clocks: { originalModelCutoff: projection.clocks.originalModelCutoff, artifactReadKnownAt: projection.clocks.currentLocalReadKnownAt, researchCutoff: admittedAt },
    gaps: [{ namespace: 'source', reason: 'source_coverage_incomplete' },
      { namespace: 'financial', reason: 'financial_source_live_rights_unverified' },
      { namespace: 'execution', reason: 'trusted_role_execution_unavailable' },
      ...projection.gaps.map(reason => ({ namespace: 'financial', reason }))],
    capabilities: Object.fromEntries(['financialVerified', 'dispatchReady', 'modelDispatched', 'publishableResearch', 'researchQualified', 'strategyApproved', 'entryEligible', 'historicalPITEligible'].map(k => [k, false])) };
  const revision = { status: 'sealed', dispatchReady: false, revision_id: randomUUID(), canonical_request: request, request_hash: completeHash(request),
    canonical_payload: payload, input_hash: completeHash(payload), research_company_id: payload.researchIdentity.researchCompanyId,
    job_id: r.jobId, attempt: 1, reservation_id: r.reservationId, preparation_id: preparationId, research_scope: r.scope, snapshot_hash: r.snapshotHash };
  const reference = { kind: 'calculation', pointer: '/scenarios/1/nextFourUnreported/dilutedEpsConditional' };
  const p = id => ({ id, text: '此為合約測試用研究段落，財務數字仍是條件式推估，需要原始資料與獨立審查。', kind: 'inference', references: [reference] });
  const article = { schemaVersion: 'candidate-deep-research-v2', businessModel: 'business_scenarios_v2', symbol,
    researchCompanyId: revision.research_company_id, inputRevisionId: revision.revision_id, inputHash: revision.input_hash,
    authoredAt: admittedAt, evidenceCutoffAt: admittedAt, summary: p('summary'),
    sections: DEEP_ARTICLE_SECTION_ORDER.map(key => ({ key, title: '研究段落', paragraphs: [p(key)] })),
    catalysts: [{ name: '產品組合變化', stage: 'discussion', paragraphIds: ['earnings_transmission'], affectedBusiness: '既有業務', earliestFinancialPeriod: '2027',
      financialTransmission: '透過需求、價格及產品組合推估營收與營業利益，不能視為已取得訂單。',
      strongestCounterEvidence: '競爭者替代方案與客戶驗證延遲可能降低市占率，目前仍需要確認。', falsifier: '若客戶未完成驗證或產品價格持續下降，應下修對應營收與利潤假設。' }],
    valuation: ['bear', 'base', 'bull'].map(scenarioId => ({ scenarioId, period: 'next_four_unreported', fiscalYear: null,
      peMultiple: 20, yearsToValue: 1, discountRate: 0.1, rationale: '此倍數僅作條件敏感度，尚未校準成長與資本報酬，並非公平價格或目標價。' })),
    tables: [{ id: 'eps', title: '未來四季條件 EPS', rows: [{ label: '基本情境', reference }] }], companyBackground: null };
  const f = { context: { request, revision, sources: [source], now: new Date().toISOString() }, article };
  fixtures.set(symbol, f); return structuredClone(f);
}
function validate(f) { return validateBusinessResearchArticle(f.context, f.article); }
for (const symbol of ['2409', '2383']) test(symbol + ' actual fixed calculator; tables/valuation share result, no publication authority', async () => {
  const f = await fixture(symbol), before = JSON.stringify(f), result = validate(f);
  assert.equal(JSON.stringify(f), before);
  assert.equal(result.tables[0].rows[0].value, result.calculation.scenarios[1].nextFourUnreported.dilutedEpsConditional);
  assert.equal(result.tables[0].rows[0].unit, 'TWD_per_share');
  assert.equal(result.tables[0].rows[0].scenarioId, 'base');
  assert.deepEqual(result.tables[0].rows[0].periods, ['2026Q3', '2026Q4', '2027Q1', '2027Q2']);
  for (const [index, v] of result.valuations.entries()) {
    const eps = result.calculation.scenarios[index].nextFourUnreported.dilutedEpsConditional;
    assert.deepEqual(v.periods, ['2026Q3', '2026Q4', '2027Q1', '2027Q2']);
    assert.equal(v.futurePriceSensitivity, eps > 0 ? eps * 20 : null);
    assert.equal(v.presentValueSensitivity, eps > 0 ? eps * 20 / 1.1 : null);
    assert.equal(v.peApplicable, eps > 0); assert.equal(v.targetPrice, null);
  }
  for (const key of ['financialVerified', 'publishableResearch', 'researchQualified', 'strategyApproved', 'entryEligible']) assert.equal(result[key], false);
  assert.equal(result.sources[0].publication.instant, null);
});
const mutations = {
  'wrong input hash': f => { f.article.inputHash = 'c'.repeat(64); },
  'wrong company': f => { f.article.researchCompanyId = randomUUID(); },
  'v1 downgrade': f => { f.article.schemaVersion = 'candidate-deep-research-v1'; },
  'arbitrary calculator command': f => { f.article.command = 'node arbitrary.mjs'; },
  'caller table result': f => { f.article.tables[0].rows[0].value = 99; },
  'nonexistent order/capacity': f => { f.article.summary.references = [{ kind: 'calculation', pointer: '/scenarios/1/quarters/0/newCommercialRevenue/value' }]; },
  'page number as reported earnings': f => { f.article.summary.references = [{ kind: 'reported_observation', pointer: '/reportedFacts/0/locator/pdfPage' }]; },
  'assumption promoted to reported': f => { f.article.summary.references = [{ kind: 'reported_observation', pointer: '/scenarios/1/quarters/0/revenue' }]; },
  'unsupported normalization': f => { f.article.summary.references = [{ kind: 'calculation', pointer: '/scenarios/1/normalizedEps' }]; },
  'partial year called full year': f => { f.article.valuation[1].period = 'full_forecast_year'; f.article.valuation[1].fiscalYear = '2026'; },
  'duplicate paragraph IDs': f => { f.article.sections[0].paragraphs[0].id = 'summary'; },
  'wrong chapter order': f => { f.article.sections.reverse(); },
  'future author': f => { f.article.authoredAt = '2099-01-01T00:00:00Z'; },
  'backdated author': f => { f.article.authoredAt = '2026-10-08T00:00:00Z'; },
  'original deadline expired': f => { f.context.revision.canonical_payload.originalJob.leaseExpiresAt = '2026-10-08T00:00:00Z'; },
  'nonfinite multiple': f => { f.article.valuation[1].peMultiple = Infinity; },
  'raw credential in prose': f => { f.article.summary.text += ' Bearer synthetic-private-key'; },
  'unselected source': f => { f.article.summary.references = [{ kind: 'source', documentId: randomUUID(), rowHash: 'b'.repeat(64), locator: 'paragraph1' }]; },
  'withdrawn source': f => { f.context.sources[0].retracted = true; },
  'superseded source': f => { f.context.sources[0].superseded = true; },
  'rights revoked': f => { f.context.sources[0].rights = 'unavailable'; },
  'wrong source revision': f => { f.context.sources[0].rowHash = 'c'.repeat(64); },
  'wrong source company': f => { f.context.sources[0].symbols = ['9999']; },
  'future source admission': f => { f.context.sources[0].admittedAt = '2099-01-01T00:00:00Z'; },
  'date-only invented midnight': f => { f.context.sources[0].publication.instant = '2026-10-08T00:00:00Z'; },
  'future source date': f => { f.context.sources[0].publication.raw = '2099-01-01'; },
  'invalid civil date': f => { f.context.sources[0].publication.raw = '2026-02-30'; },
  'missing source receipt': f => { f.context.sources = []; },
  'invented gap reason': f => { f.article.summary.kind = 'gap'; f.article.summary.references = [{ kind: 'gap', namespace: 'financial', reason: 'invented_no_orders' }]; },
};
for (const [name, mutate] of Object.entries(mutations)) test('reject ' + name, async () => {
  const f = await fixture(); mutate(f); assert.throws(() => validate(f));
});
test('sealed financial result tampering rejects even after all caller hashes are recomputed', async () => {
  const f = await fixture(), p = f.context.revision.canonical_payload;
  p.financial.material.calculation.scenarios[1].nextFourUnreported.dilutedEpsConditional += 1;
  p.hashes.resultHash = completeHash(p.financial.material.calculation);
  f.context.revision.input_hash = completeHash(p); f.article.inputHash = f.context.revision.input_hash;
  assert.throws(() => validate(f));
});
test('industry-only source cannot establish company rumor or production, and rumor cannot become order', async () => {
  for (const rumor of [false, true]) {
    const f = await fixture(), source = f.context.sources[0], p = f.article.sections[2].paragraphs[0];
    source.scope = 'industry_context'; source.symbols = [];
    p.kind = rumor ? 'rumor' : 'reported'; p.references = [{ kind: 'source', documentId: source.id, rowHash: source.rowHash, locator: 'public paragraph1' }];
    f.article.catalysts[0].stage = 'production'; f.article.catalysts[0].paragraphIds = [p.id]; assert.throws(() => validate(f));
  }
  const f = await fixture(), source = f.context.sources[0], p = f.article.sections[2].paragraphs[0];
  p.kind = 'rumor'; p.references = [{ kind: 'source', documentId: source.id, rowHash: source.rowHash, locator: 'public paragraph1' }];
  f.article.catalysts[0].stage = 'reported_order'; f.article.catalysts[0].paragraphIds = [p.id]; assert.throws(() => validate(f));
});
test('annual2027 is separate from next four; changed prose/model/valuation needs a new hash', async () => {
  const f = await fixture(), original = validate(f);
  f.article.valuation[1].period = 'full_forecast_year'; f.article.valuation[1].fiscalYear = '2027';
  const annual = validate(f); assert.deepEqual(annual.valuations[1].periods, ['2027Q1', '2027Q2', '2027Q3', '2027Q4']);
  assert.notEqual(original.articleHash, annual.articleHash);
  f.article.summary.text += ' 下一次需要確認海外替代方案對利潤的影響。';
  assert.notEqual(annual.articleHash, validate(f).articleHash);
});
test('printed facts, explicit assumptions and sealed gaps keep their classifications', async () => {
  const f = await fixture();
  f.article.summary.kind = 'reported'; f.article.summary.references = [{ kind: 'reported_observation', pointer: '/reportedFacts/0/value' }];
  f.article.sections[0].paragraphs[0].kind = 'gap';
  f.article.sections[0].paragraphs[0].references = [{ kind: 'gap', namespace: 'financial', reason: 'capacity_yield_asp_orders_not_quantifiable' }];
  const ref = { kind: 'assumption', pointer: '/scenarios/1/quarters/0/segments/0/grossMargin' };
  f.article.sections[1].paragraphs[0].kind = 'scenario'; f.article.sections[1].paragraphs[0].references = [ref];
  f.article.tables[0].rows.push({ label: '假設毛利率', reference: ref });
  const result = validate(f); assert.equal(result.tables[0].rows[1].valueStatus, 'assumption');
  assert.equal(result.tables[0].rows[1].unit, 'fraction');
  assert.deepEqual(result.tables[0].rows[1].periods, ['2026Q3']);
  assert.equal(result.validationStatus, 'contract_valid_only');
});
test('actual AUO loss scenario gives null P/E price, never a negative target', async () => {
  const r = validate(await fixture()); const losses = r.valuations.filter(v => v.epsConditional <= 0);
  assert.ok(losses.length > 0, 'fixed actual AUO assumptions include a loss scenario');
  for (const v of losses) { assert.equal(v.peApplicable, false); assert.equal(v.futurePriceSensitivity, null); assert.equal(v.presentValueSensitivity, null); }
});
test('validated snapshots retain no mutable aliases to author or trusted context', async () => {
  const f = await fixture(), result = validate(f), before = JSON.stringify(result);
  f.article.summary.text += ' changed'; f.context.sources[0].url = 'https://example.com/changed';
  f.context.revision.canonical_payload.financial.material.calculation.scenarios[1].nextFourUnreported.revenue = 0;
  assert.equal(JSON.stringify(result), before);
});
test('author original deadlines are exclusive, retaining microsecond boundary precision', async () => {
  for (const field of ['originalJob', 'originalReservation']) {
    const f = await fixture(), deadline = f.context.revision.canonical_payload[field].leaseExpiresAt;
    // Independently exercise each fence in a wholly synthetic context. No DB
    // lease is changed; recompute the synthetic row hash after moving the OTHER
    // deadline later so it cannot hide the fence under test.
    f.context.revision.canonical_payload[field === 'originalJob' ? 'originalReservation' : 'originalJob'].leaseExpiresAt = new Date(Date.parse(deadline) + 60_000).toISOString();
    f.context.revision.input_hash = completeHash(f.context.revision.canonical_payload);
    f.article.inputHash = f.context.revision.input_hash;
    const micros = BigInt(Date.parse(deadline)) * 1000n;
    const instant = us => new Date(Number(us / 1000n)).toISOString().replace(/(\.\d{3})Z$/u, '$1' + String(us % 1000n).padStart(3, '0') + 'Z');
    f.article.authoredAt = instant(micros - 1n); f.context.now = f.article.authoredAt; assert.doesNotThrow(() => validate(f));
    for (const delta of [0n, 1n]) {
      f.article.authoredAt = instant(micros + delta); f.context.now = f.article.authoredAt; assert.throws(() => validate(f));
    }
  }
});
test('actual sealed source/execution/financial gaps are referenceable with exact namespaces', async () => {
  const f = await fixture(); f.article.summary.kind = 'gap';
  for (const gap of f.context.revision.canonical_payload.gaps) {
    f.article.summary.references = [{ kind: 'gap', ...gap }]; assert.doesNotThrow(() => validate(f));
  }
  f.article.summary.references = [{ kind: 'gap', namespace: 'financial', reason: 'source_coverage_incomplete' }];
  assert.throws(() => validate(f));
});
test('actual calculated ordinary/potential/diluted share denominators are available in all periods', async () => {
  for (const period of ['quarters/0', 'nextFourUnreported', 'fullForecastYears/0']) {
    for (const key of ['ordinaryWeightedSharesMillionAssumed', 'potentialWeightedSharesMillionAssumed', 'dilutedSharesMillionAssumed']) {
      const f = await fixture();
      f.article.tables[0].rows = [{ label: '計算股數分母', reference: { kind: 'calculation', pointer: `/scenarios/1/${period}/${key}` } }];
      const r = validate(f), row = r.tables[0].rows[0]; assert.equal(row.unit, 'million_shares');
      assert.deepEqual(row.periods, period === 'quarters/0' ? ['2026Q3'] : period === 'nextFourUnreported'
        ? ['2026Q3', '2026Q4', '2027Q1', '2027Q2'] : ['2027Q1', '2027Q2', '2027Q3', '2027Q4']);
    }
  }
});
