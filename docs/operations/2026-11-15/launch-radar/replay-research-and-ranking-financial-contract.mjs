// Reproduce existing pure worker and launch reader behavior from pinned Git objects.
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
const pins = [["web/src/lib/candidate-price-history.ts","066dc146fb3b5aa3f5bf789fdc7abbd7e192b751"],["web/src/lib/public-source-url.ts","c4f7ea17bc1415638b4ef782d147d580d2a190fa"],["web/src/lib/vnext/artifact-financial-summary.ts","cf60612083e096e8a325df0b0d083654c5a4d0ee"],["web/src/lib/vnext/business-criteria.ts","225b5eff80fe7972a2151f7142e61932487eda0c"],["web/src/lib/vnext/catalyst-cancellation.ts","db4bed5735d4788bad2167b1f85c2327fd4e801f"],["web/src/lib/vnext/citations.ts","2fb776e380e525bbdff780b2fd15ba14a49d9774"],["web/src/lib/vnext/evidence-clock.ts","fa27138f5dd8f6ce823a91e2fd4be84cfe76fac9"],["web/src/lib/vnext/financial-observation.ts","bc09446bcd1caee38039b8184f59d5b5aab5feb1"],["web/src/lib/vnext/launch-public-citation.ts","7898ed998e2486a71cfc2bc8393265104ff1685b"],["web/src/lib/vnext/launch-ranking-read.ts","19405ea2c3232c5bda3ec1f1cd53957e4546199b"],["web/src/lib/vnext/launch-ranking.test-fixture.ts","1865ebb6b3c2ac665e027c283cafcf070d697b2d"],["web/src/lib/vnext/policy.ts","a8441d87c99c1edf6ebfed991b58b346f917b32b"],["web/src/lib/vnext/research.ts","47e8b5d2d20aff851fae02900d29012c4f4e4e33"],["web/src/lib/vnext/semantic-criteria.ts","05c3b755af4f5f8f02eefd9aeb34b247285ccd6f"],["web/src/lib/vnext/worker-output.ts","3543aef056d34dc7359026498e7ffd90cb781b4b"]];
const inputs = readFileSync(0, 'utf8').trim().split('\n');
assert.equal(inputs.length, pins.length);
const source = new Map(pins.map(([path, hash], index) => {
  const bytes = Buffer.from(inputs[index], 'base64');
  assert.equal(createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'), hash);
  return [path, stripTypeScriptTypes(bytes.toString('utf8'))];
}));
const urls = new Map();
function moduleUrl(path) {
  if (urls.has(path)) return urls.get(path);
  assert(source.has(path), 'fixed_module_required');
  const js = source.get(path).replace(/(from\s+)(['"])(\.\.?\/[^'"]+)\2/g, (_match, from, quote, relative) =>
    from + quote + moduleUrl(posix.join(posix.dirname(path), relative)) + quote);
  const linked = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
  urls.set(path, linked);
  return linked;
}
const vnext = 'web/src/lib/vnext/';
const {normalizeWorkerAuthor, normalizeWorkerReview} = await import(moduleUrl(vnext + 'worker-output.ts'));
const {REQUIRED_SECTIONS} = await import(moduleUrl(vnext + 'research.ts'));
const {parseLaunchRankingRead} = await import(moduleUrl(vnext + 'launch-ranking-read.ts'));
const {launchRankingFixture, LAUNCH_TEST_NOW, LAUNCH_TEST_RUN} = await import(moduleUrl(vnext + 'launch-ranking.test-fixture.ts'));
const quote = {id:'observed-quote',key:'current_price',kind:'fact',sourceTier:'official',value:100,
  unit:'TWD',period:'2026-11-13',source:'https://www.twse.com.tw/controlled-fixture',
  contentHash:'a'.repeat(64),eventAt:'2026-11-13T05:30:00Z',availableAt:'2026-11-13T06:00:00Z'};
const evidence = [quote];
const binding = {model:'example-author',modelVersion:'example-author-1'};
const input = 'b'.repeat(64);
const oneClaim = {id:'quote-control',text:'The input is a Price-only fixture.',kind:'fact',evidenceIds:[quote.id]};
const section = {text:'Price only. No valuation input.',evidenceIds:[quote.id],claimIds:[oneClaim.id]};
const base = {
  sections:Object.fromEntries(REQUIRED_SECTIONS.map(key=>[key,{...section}])),claims:[oneClaim],
  quoteDate:quote.period,valuationDate:'2026-11-01',
  annualEps:null,nextFourQuarterEps:null,gaps:['annual_eps_missing','next_four_quarter_eps_missing']
};
const cases = {};
function check(name, fn, expected) {
  let result;
  try { fn(); result = 'ACCEPTED'; } catch (error) { result = error.message; }
  assert.equal(result, expected, name);
  cases[name] = result;
}
check('author_quote_only_with_unbound_valuation_date',()=>normalizeWorkerAuthor(base,binding,input,evidence),'ACCEPTED');
check('author_absence_with_null_valuation_date',()=>normalizeWorkerAuthor({...base,valuationDate:null},binding,input,evidence),
  'vnext_worker_author_invalid:dated_valuation_missing,summary_dates_not_original_asof');
check('author_missing_business_and_valuation_sections',()=>{
  const raw=structuredClone(base);
  delete raw.sections.profitBridge;
  delete raw.sections.valuation;
  normalizeWorkerAuthor(raw,binding,input,evidence);
},'vnext_worker_sections_closed_shape');
const artifact = normalizeWorkerAuthor(base,binding,input,evidence);
const review = {approved:true,findings:[],factsChecked:true,valuationChecked:true,claimsChecked:true,
  claimChecks:[{claimId:oneClaim.id,verdict:'supported',reason:'fixture quote supported',sources:[{id:quote.id,contentHash:quote.contentHash}]}]};
check('approved_review_with_valuation_boolean_only',()=>normalizeWorkerReview(review,'example-independent-reviewer',artifact,evidence),'ACCEPTED');
check('approved_review_declaring_valuation_not_checked',()=>normalizeWorkerReview({...review,valuationChecked:false},'example-independent-reviewer',artifact,evidence),
  'vnext_worker_review_invalid:review_checks_incomplete');
check('approved_review_with_unmatched_original_evidence',()=>{
  const raw=structuredClone(review);raw.claimChecks[0].sources[0].contentHash='c'.repeat(64);
  normalizeWorkerReview(raw,'example-independent-reviewer',artifact,evidence);
},'vnext_worker_review_source_binding');
check('launch_rank_null_financial_and_valuation',()=>parseLaunchRankingRead(launchRankingFixture(1),{},LAUNCH_TEST_NOW),'ACCEPTED');
for (const field of ['financial','valuation']) {
  check('launch_rank_rejects_nonnull_'+field,()=>{
    const packet=launchRankingFixture(1);
    packet.snapshot.members[0][field]={availability:'supported',evidenceRevision:packet.snapshot.members[0].revisionId,value:0};
    parseLaunchRankingRead(packet,{},LAUNCH_TEST_NOW);
  },'launch_ranking_contract_invalid');
}
check('launch_detail_null_chart',()=>parseLaunchRankingRead(launchRankingFixture(1,true),{rankingRunId:LAUNCH_TEST_RUN,symbol:'5274'},LAUNCH_TEST_NOW),'ACCEPTED');
check('launch_detail_rejects_bound_nonnull_chart',()=>{
  const packet=launchRankingFixture(1,true);
  packet.detail.chart={sourceRevision:packet.snapshot.members[0].revisions.price,points:[]};
  parseLaunchRankingRead(packet,{rankingRunId:LAUNCH_TEST_RUN,symbol:'5274'},LAUNCH_TEST_NOW);
},'launch_ranking_contract_invalid');
process.stdout.write(JSON.stringify({node:process.version,nonRoot:process.getuid()!==0,gitBlobsVerified:pins.length,cases,
  fixtureOnly:true,dbOrProviderCalled:false})+'\n');
