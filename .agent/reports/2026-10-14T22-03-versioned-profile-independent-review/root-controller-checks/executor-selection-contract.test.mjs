import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { bindingCanonical, bindingSha, fixedBindingInputs, parseBindingCore } from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-versioned-input-binding.ts';
import { createVersionedCompleteInputController } from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-versioned-complete-input.ts';
import { completeHash } from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-v3-material-canonical.ts';
import { financialIoStatus } from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-financial-io-owner.ts';
const hash = b => createHash('sha256').update(b).digest('hex');
const hs = hash(fs.readFileSync('/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-versioned-complete-input.ts'));
const hc = hash(fs.readFileSync(process.execPath));
for (const symbol of ['2409','2383']) for (const wireVersion of ['research-article-input-v2','research-article-input-v3']) {
 const old = wireVersion.endsWith('v2'), q = fixedBindingInputs(symbol,wireVersion);
 const core = { artifactRootId:old?'original75d-fixed8or6':'historical15d4-fixed9or7', compiledFingerprintIdentity:hc, financialProfile:old?'oct08_compatible_financial_candidate_v1':'oct14_historical_cash_v1', inventoryHash:completeHash(q.inventory), schemaTemplateIdentity:bindingSha(bindingCanonical(q.schemaTemplate)), sourceExecutionHash:hs, symbol, validationContract:'research-versioned-input-candidate-v3', wireVersion };
 const text = bindingCanonical(core), binding = parseBindingCore(text);
 const request = { owner:'root-synthetic-contract',jobId:'a1000000-0000-4000-8000-000000000001',attempt:1,reservationId:'a1000000-0000-4000-8000-000000000002',scope:'research_observed_v1',snapshotHash:hash('synthetic-snapshot'),preparationId:'a1000000-0000-4000-8000-000000000003',preparationHash:hash('synthetic-preparation'),expectedArtifactManifestHash:core.inventoryHash,expectedCalculatorExecutionHash:binding.bindingCapsuleIdentity };
 const { preparationId,preparationHash,expectedArtifactManifestHash,expectedCalculatorExecutionHash,...lineage } = request;
 const response = {status:'absent',dispatchReady:false,preparation:{request:{...lineage,sourceDocumentIds:[],bundleId:null},preparation_id:preparationId,input_hash:preparationHash,dispatchReady:false,payload:{symbol}},contextHash:hash('synthetic-context'),binding};
 const compose = () => createVersionedCompleteInputController({bindingTexts:[text],executorFingerprint:hash('different-executor'),roots:{'original75d-fixed8or6':'/nonexistent-contract-root','historical15d4-fixed9or7':'/nonexistent-contract-root'}});
 test(`${symbol} ${wireVersion}: fresh calculation rejects different executor before assertion or FS owner`, async () => {
  const controller = compose(), calls = [], before = financialIoStatus();
  await assert.rejects(controller.runCompleteInput({rpc:async name=>{calls.push(name);return {data:response,error:null};}},request,true), {message:'research_complete_input_invalid'});
  assert.deepEqual(calls,['read_research_article_input_candidate_v3']);assert.deepEqual(financialIoStatus(),before);
 });
 test(`${symbol} ${wireVersion}: read-only absent response does not require executing its old calculator`, async () => {
  const controller = compose(), calls = [];
  assert.equal(await controller.runCompleteInput({rpc:async name=>{calls.push(name);return {data:response,error:null};}},request,false),response);
  assert.deepEqual(calls,['read_research_article_input_candidate_v3']);
 });
}
// Minimal synthetic RPC response for the local dispatch gate, not a legal PG preparation.
// SourceHs is partial controller identity; Hc is this Node binary, not approved whole Next closure.
