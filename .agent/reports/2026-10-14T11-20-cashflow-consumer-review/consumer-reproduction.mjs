import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadReadOnlyWorkingDraft } from '/tmp/stockinsider-discovery-snapshot-root-review-oct14/web/src/lib/research-working-draft-loader.ts';
import { parseWorkingDraft } from '/tmp/stockinsider-discovery-snapshot-root-review-oct14/web/src/lib/research-working-draft.ts';
import { researchCanonicalHash } from '/tmp/stockinsider-discovery-snapshot-root-review-oct14/web/src/lib/research-agent-qualification.ts';
const root='/tmp/stockinsider-discovery-snapshot-root-review-oct14';
const results=[];
for(const [symbol,folder] of [['2409','2026-10-08-auo-four-segment-model'],['2383','2026-10-08-emc-company-model']]){
 const base=root+'/docs/research/'+folder, m=JSON.parse(await readFile(base+'/model-results.json','utf8')), meta=JSON.parse(await readFile(base+'/draft-metadata.json','utf8')), article=await readFile(base+'/article.md','utf8');
 const {canonicalHash,inputManifest,...loaderBody}=m;
 const draft=parseWorkingDraft(symbol,article,meta);
 let consumerError=null;try{await loadReadOnlyWorkingDraft(root,symbol);}catch(error){consumerError=error.message;}
 results.push({symbol,consumerError,modelCanonicalHash:canonicalHash,existingLoaderComputedHash:researchCanonicalHash(loaderBody),successorModelAsOf:m.asOf,consumerCutoff:draft.evidenceCutoffAt,consumerAuthoredAt:draft.authoredAt,newExtractionAvailableAt:m.historicalCashFlow.extractionAvailableAt});
}
console.log(JSON.stringify({source:'955782d3c61b2bc8149eea69c3466186f422e5b2',actualConsumerResults:results},null,2));
assert.ok(results.every(r=>r.consumerError===null),'both successor articles must load through the existing read-only draft consumer');
