import { researchCanonicalHash } from './research-agent-qualification.ts';
import { researchDeepInstant, validateResearchDeepClaimContext, type ResearchDeepClaimContext } from './research-deep-claim-context.ts';
import { validateResearchDeepAuthorInput } from './research-deep-author-input.ts';
import { validateDeepResearchArticle, type DeepResearchArticle, type EvidenceDocument } from './research-deep-article.ts';

type Row = Record<string, unknown>;
const HASH = /^[a-f0-9]{64}$/u;
const SOURCE = /^[a-f0-9]{40}$/u;
function ensure(ok: unknown): asserts ok { if (!ok) throw new Error('deep_draft_binding_invalid'); }
function row(value: unknown): Row { ensure(value && typeof value === 'object' && !Array.isArray(value)); return value as Row; }
function exact(value: unknown, keys: string[]): Row {
  const r=row(value); ensure(Object.keys(r).sort().join(',')===[...keys].sort().join(',')); return r;
}
function safeData(value: unknown, depth=0, count={n:0}) {
  ensure(depth<=12 && ++count.n<=15000);
  if (typeof value==='string') ensure(value.length<=6000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
    && !/\bBearer\s+\S+|-----BEGIN .*PRIVATE KEY-----|\b(?:password|api[_-]?key|access[_-]?token|cookie)\s*[:=]|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/iu.test(value));
  else if (typeof value==='number') ensure(Number.isFinite(value));
  else if (Array.isArray(value)) { ensure(value.length<=512); for(const item of value) safeData(item,depth+1,count); }
  else if (value!==null && typeof value==='object') for(const [key, member] of Object.entries(value)) {
    ensure(!['__proto__','constructor','prototype'].includes(key)); safeData(member,depth+1,count);
  }
  else ensure(value===null || typeof value==='boolean');
}
const articleFields=['schemaVersion','symbol','authoredAt','evidenceCutoffAt','summary','sections','catalysts','scenarios','companyBackground'];
function subset(value: unknown, keys: string[]) { const r=row(value); ensure(Object.keys(r).every(key=>keys.includes(key))); return r; }
function articleShape(value: unknown) {
  const a=subset(value,articleFields); safeData(a);
  if(a.sections!==undefined) { ensure(Array.isArray(a.sections)); for(const s of a.sections) {
    const section=subset(s,['key','title','paragraphs']); if(section.paragraphs!==undefined) {
      ensure(Array.isArray(section.paragraphs)); for(const p of section.paragraphs)
        subset(p,['text','kind','evidenceScope','sourceDocumentIds','officialFactIds']);
    }
  }}
  if(a.catalysts!==undefined) { ensure(Array.isArray(a.catalysts)); for(const c of a.catalysts)
    subset(c,['name','evidenceDocumentIds','stage','earliestFinancialPeriod','affectedBusiness','financialTransmission','strongestCounterEvidence','falsifier']); }
  if(a.scenarios!==undefined) { ensure(Array.isArray(a.scenarios)); for(const s of a.scenarios) {
    const scenario=subset(s,['name','fiscalYear','baselineEps','baselineBridge','incrementalRevenueMillions','commercialization','grossMargin',
      'incrementalOperatingExpenseMillions','nonOperatingMillions','taxRate','ownershipFraction','dilutedSharesMillions','peMultiple',
      'yearsToValue','discountRate','evidenceDocumentIds','officialFactIds','assumptionNotes']);
    if(scenario.baselineBridge!==undefined) {
      const b=subset(scenario.baselineBridge,['segmentBasis','segmentNote','segments','otherOperatingIncomeMillions','corporateOperatingIncomeMillions',
        'nonOperatingMillions','taxRate','nonControllingIncomeMillions','oneOffAfterTaxMillions','dilutedSharesMillions']);
      if(b.segments!==undefined) { ensure(Array.isArray(b.segments)); for(const segment of b.segments)
        subset(segment,['business','revenueMillions','grossMargin','operatingExpenseMillions']); }
    }
    if(scenario.commercialization!==undefined && scenario.commercialization!==null)
      subset(scenario.commercialization,['annualCapacityUnits','utilization','yieldRate','averageSellingPriceMillion','intercompanyRevenueMillions','incrementalDepreciationMillions']);
  }}
  return a;
}

export type DeepAuthorHandoff = {
  schemaVersion: 'research-deep-author-handoff-v1'; preparedReceiptHash: string; inputHash: string;
  job: ResearchDeepClaimContext['job']; modelReservation: ResearchDeepClaimContext['modelReservation'];
  articleHash: string | null; dataCutoff: string; financialCutoff: string | null;
  proposedRequest: {action:'handoffModel';owner:string;jobId:string;attempt:number;articleHash:string} | null;
  requiresLiveStatusCheck: true; requiresIndependentReview: true; submissionEligible: false;
  authoritativePublication: false; strategyApproved: false;
};

/** Preparation freshness is checked at the immutable preparation receipt's own
 * time. This is historical validation, never a current live lease observation. */
export function buildPrivateDeepDraft(input: {prepared:unknown;model:unknown;expectedPreparedHash:string;
  original:{originalRequestHash:string;owner:string;observedAt:string;context?:ResearchDeepClaimContext};controllerSourceCommit:string;now:string}) {
  const p=exact(input.prepared,['schemaVersion','sourceCommit','requestHash','originalRequestHash','packet','preparedAt','modelCalls','modelDispatched','authoritativePublication','receiptHash']);
  const {receiptHash,...preparedMaterial}=p;
  ensure(p.schemaVersion==='research-deep-prepared-input-v1' && SOURCE.test(String(p.sourceCommit))
    && HASH.test(String(p.requestHash)) && HASH.test(input.expectedPreparedHash)
    && receiptHash===input.expectedPreparedHash && receiptHash===researchCanonicalHash(preparedMaterial)
    && p.originalRequestHash===input.original.originalRequestHash && p.modelCalls===0
    && p.modelDispatched===false && p.authoritativePublication===false && SOURCE.test(input.controllerSourceCommit));
  const packet=row(p.packet), job=row(packet.job), modelReservation=row(packet.modelReservation);
  const preparedAt=String(p.preparedAt), now=researchDeepInstant(input.now);
  ensure(researchDeepInstant(input.original.observedAt)<=researchDeepInstant(preparedAt) && researchDeepInstant(preparedAt)<=now);
  const context=validateResearchDeepClaimContext({schemaVersion:'research-deep-claim-context-v1',observedAt:packet.dataCutoff,
    job,modelReservation,modelCompletion:null},{owner:input.original.owner,now:preparedAt});
  validateResearchDeepAuthorInput(packet,context,preparedAt);
  if(input.original.context) {
    const original=validateResearchDeepClaimContext(input.original.context,{owner:input.original.owner,now:input.original.context.observedAt});
    ensure(original.modelCompletion===null && researchCanonicalHash(original.job)===researchCanonicalHash(job)
      && researchCanonicalHash(original.modelReservation)===researchCanonicalHash(modelReservation));
  }
  const m=exact(input.model,['schemaVersion','preparedReceiptHash','inputHash','job','modelReservation','article']);
  ensure(m.schemaVersion==='research-deep-model-draft-v1' && m.preparedReceiptHash===receiptHash && m.inputHash===packet.inputHash
    && researchCanonicalHash(m.job)===researchCanonicalHash(job) && researchCanonicalHash(m.modelReservation)===researchCanonicalHash(modelReservation));
  const a=articleShape(m.article);
  ensure(a.symbol===job.symbol && a.evidenceCutoffAt===packet.dataCutoff
    && researchDeepInstant(a.authoredAt)>=researchDeepInstant(preparedAt) && researchDeepInstant(a.authoredAt)<=now);
  const sources=(packet.sources as Row[]), facts=packet.financial===null ? [] : row(packet.financial).facts as Row[];
  const allowedDocs=new Set(sources.map(s=>s.documentId)), allowedFacts=new Set(facts.map(f=>String(f.factId)));
  const refs=(value:unknown)=>{ if(value && typeof value==='object') for(const [key,v] of Object.entries(value)) {
    if(['sourceDocumentIds','evidenceDocumentIds','officialFactIds'].includes(key)) {
      ensure(Array.isArray(v) && v.length<=30 && new Set(v).size===v.length
        && v.every(id=>typeof id==='string' && (key==='officialFactIds' ? allowedFacts.has(id) : allowedDocs.has(id))));
    } else refs(v);
  }};
  refs(a);
  const gaps:string[]=[];
  if(!packet.financial || !facts.length) gaps.push('financial_input_missing');
  if((packet.gaps as Row[]).length) gaps.push('prepared_source_or_financial_gaps_retained');
  if(researchDeepInstant(a.authoredAt)>=researchDeepInstant(modelReservation.leaseExpiresAt)
    || researchDeepInstant(a.authoredAt)>=researchDeepInstant(job.leaseExpiresAt)) gaps.push('authored_outside_original_lease');
  for(const s of (a.sections as Row[] || [])) for(const paragraph of (s.paragraphs as Row[] || []))
    if(paragraph.kind==='verified' && (paragraph.sourceDocumentIds as string[] || []).some(id=>sources.find(source=>source.documentId===id)?.claimStatus!=='confirmed'))
      gaps.push('verified_claim_has_unconfirmed_source');
  for(const catalyst of (a.catalysts as Row[] || []))
    if(['production','reported_order'].includes(String(catalyst.stage)) && (catalyst.evidenceDocumentIds as string[] || []).some(id=>sources.find(s=>s.documentId===id)?.claimStatus!=='confirmed'))
      gaps.push('commercial_stage_not_confirmed');
  const documents:EvidenceDocument[]=sources.map(s=>({id:String(s.documentId),symbols:s.symbols as string[],publishedAt:String(s.publishedAt),
    observedAt:String(s.availableAt),sourceUrl:String(s.rootId),retracted:false,publicCitation:s.publishable===true,substantiveEvidence:true,
    subjectScope:s.subjectScope as EvidenceDocument['subjectScope']}));
  let validated:ReturnType<typeof validateDeepResearchArticle> | null=null;
  try { validated=validateDeepResearchArticle({article:a as DeepResearchArticle,documents,allowedOfficialFactIds:allowedFacts,
    expectedSymbol:context.job.symbol,now:input.now}); }
  catch(error) { gaps.push(error instanceof Error && /^deep_article_[a-z_]+$/u.test(error.message) ? error.message : 'article_contract_incomplete'); }
  const articleHash=validated?.articleHash ?? null;
  const status=validated && gaps.length===0 ? 'contract_valid_pending_review' as const : 'incomplete' as const;
  const handoff:DeepAuthorHandoff={schemaVersion:'research-deep-author-handoff-v1',preparedReceiptHash:String(receiptHash),inputHash:String(packet.inputHash),
    job:context.job,modelReservation:context.modelReservation,articleHash,dataCutoff:String(packet.dataCutoff),
    financialCutoff:packet.financial===null ? null : String(row(packet.financial).asOf),
    proposedRequest:status==='contract_valid_pending_review' && now<researchDeepInstant(context.job.leaseExpiresAt)
      && now<researchDeepInstant(context.modelReservation.leaseExpiresAt)
      ? {action:'handoffModel',owner:context.job.owner,jobId:context.job.jobId,attempt:context.job.attempt,articleHash:articleHash!} : null,
    requiresLiveStatusCheck:true,requiresIndependentReview:true,submissionEligible:false,authoritativePublication:false,strategyApproved:false};
  return {schemaVersion:'research-deep-private-draft-v1',controllerSourceCommit:input.controllerSourceCommit,
    preparedSourceCommit:p.sourceCommit,preparedReceiptHash:receiptHash,inputHash:packet.inputHash,preparedAt:p.preparedAt,
    acceptedAt:input.now,job:context.job,modelReservation:context.modelReservation,dataCutoff:packet.dataCutoff,
    discovery:packet.discovery,financialIdentity:packet.financial===null ? null : {bundleId:row(packet.financial).bundleId,
      revisionId:row(packet.financial).revisionId,inputHash:row(packet.financial).inputHash,asOf:row(packet.financial).asOf,availableAt:row(packet.financial).availableAt},
    preparationCompleteness:{financialForecastComplete:packet.financialForecastComplete,sourceSelectionComplete:packet.sourceSelectionComplete},
    sourceRightsAndVersions:sources.map(({summary,...proof})=>{void summary;return proof;}),preparedGaps:packet.gaps,
    article:validated ?? a,articleContractStatus:status,validationGaps:[...new Set(gaps)].sort(),handoff,
    modelCalls:0,modelCompleted:false,researchQualified:false,authoritativePublication:false,strategyApproved:false};
}

export function privateDraftEligibility(draft:ReturnType<typeof buildPrivateDeepDraft>,now:string) {
  const clock=researchDeepInstant(now); ensure(clock>=researchDeepInstant(draft.acceptedAt));
  const expired=clock>=researchDeepInstant(draft.job.leaseExpiresAt) || clock>=researchDeepInstant(draft.modelReservation.leaseExpiresAt);
  return {observedAt:now,leaseState:expired ? 'expired' : 'locally_unexpired_live_status_required',
    handoffState:expired ? 'expired' : draft.articleContractStatus==='incomplete' ? 'incomplete' : 'requires_live_status',
    proposedRequest:expired ? null : draft.handoff.proposedRequest,submissionEligible:false,
    authoritativePublication:false,requiresIndependentReview:true};
}
