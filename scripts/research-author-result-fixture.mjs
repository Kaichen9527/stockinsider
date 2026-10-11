import {randomUUID} from 'node:crypto';
import {DEEP_ARTICLE_SECTION_ORDER} from '../web/src/lib/research-deep-article.ts';
import {validateBusinessResearchArticle} from '../web/src/lib/research-business-article.ts';
import {completeHash} from '../web/src/lib/research-complete-canonical.ts';
// Synthetic controller execution and prose. Real fixed calculation is reexecuted;
// this fixture is never evidence that an actual author/model ran.
export function authorResultFixture(request,revision,packet,invocationId='synthetic-'+randomUUID()){
 const authoredAt=new Date().toISOString(),sources=packet.sources.map(s=>s.descriptor);
 const reference={kind:'calculation',pointer:'/scenarios/1/nextFourUnreported/dilutedEpsConditional'};
 const p=id=>({id,text:'這是隔離的合約驗收段落，並非實際投資文章，財務推估仍需要驗證且不得當作已取得訂單。',kind:'inference',references:[reference]});
 const article={schemaVersion:'candidate-deep-research-v2',businessModel:'business_scenarios_v2',symbol:packet.researchIdentity.symbol,
  researchCompanyId:revision.research_company_id,inputRevisionId:revision.revision_id,inputHash:revision.input_hash,
  authoredAt,evidenceCutoffAt:packet.evidenceCutoffAt,summary:p('summary'),
  sections:DEEP_ARTICLE_SECTION_ORDER.map(key=>({key,title:'隔離驗收段落',paragraphs:[p(key)]})),
  catalysts:[{name:'合成條件',stage:'discussion',paragraphIds:['earnings_transmission'],affectedBusiness:'既有業務',earliestFinancialPeriod:'2027',financialTransmission:'透過需求與產品組合推演收入和利潤，不代表已有客戶訂單。',strongestCounterEvidence:'競爭者的替代方案與價格壓力可能抵銷需求增加，尚未得到驗證。',falsifier:'若客戶未完成驗證或訂單延後，必須重新檢視收入與利潤假設。'}],
  valuation:['bear','base','bull'].map(scenarioId=>({scenarioId,period:'next_four_unreported',fiscalYear:null,peMultiple:20,yearsToValue:1,discountRate:0.1,rationale:'未校準倍數僅為敏感度，不是合理價或目標價，仍需檢視成長與資本報酬。'})),
  tables:[{id:'eps',title:'條件式EPS',rows:[{label:'基本情境',reference}]}],companyBackground:null};
 const validated=validateBusinessResearchArticle({request:request.input,revision,sources,now:new Date().toISOString()},article);
 const observation={version:'research_execution_observation_v2',assignmentId:packet.assignmentId,jobId:request.input.jobId,
  attempt:request.input.attempt,reservationId:request.input.reservationId,inputRevisionId:revision.revision_id,inputHash:revision.input_hash,
  articleHash:validated.articleHash,reviewPackHash:null,outputHash:completeHash(article),verificationLevel:'trusted_controller_observation',
  providerSurface:'codex_cross_chat',hostId:'synthetic-fixture',threadId:randomUUID(),turnId:randomUUID(),invocationId,
  dispatchObservationHash:'d'.repeat(64),completionObservationHash:'e'.repeat(64),controllerObservedStartAt:authoredAt,
  controllerObservedEndAt:new Date().toISOString(),modelIdentity:null};
 return {request:{...request,action:'receiveAuthorResult',article,observation},envelope:{schemaVersion:'research-author-result-v2',assignmentId:packet.assignmentId,inputRevisionId:revision.revision_id,inputHash:revision.input_hash,rawArticle:article,validatedArticle:validated,observation}};
}
