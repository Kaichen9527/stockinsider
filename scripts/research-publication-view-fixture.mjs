import {randomUUID} from 'node:crypto';
import {reviewerResultFixture} from './research-reviewer-result-fixture.mjs';
import {researchPublicationContent} from '../web/src/lib/research-atomic-publication.ts';
import {completeHash} from '../web/src/lib/research-complete-canonical.ts';
/** Synthetic public adapter input, never an actual author or publication receipt. */
export async function publicationViewFixture(transform = async () => {}) {
  const f=await reviewerResultFixture(),payload=f.context.authorContext.result.payload;
  await transform(f,payload);
  const content=researchPublicationContent(payload),article=content.deepResearch.article;
  const wire={schemaVersion:'research-company-publication-v2',researchCompanyId:article.researchCompanyId,symbol:article.symbol,
    publishedAt:new Date().toISOString(),publication:{schemaVersion:'research-publication-receipt-v2',
      receipt:{submissionId:randomUUID(),dossierId:randomUUID(),bundleId:randomUUID(),inputRevisionId:article.inputRevisionId,inputHash:article.inputHash,
        authorResultId:randomUUID(),authorResultHash:'a'.repeat(64),reviewerResultId:randomUUID(),reviewerResultHash:'b'.repeat(64),submissionHash:'c'.repeat(64),contentHash:completeHash(content),receivedAt:new Date().toISOString()},
      content,sourceReferences:payload.validatedArticle.sources,researchState:'published',researchQualified:false,strategyApproved:false,entryEligible:false,idempotentReplay:true}};
  return wire;
}
