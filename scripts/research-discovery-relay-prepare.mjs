import {reconcileObservedResearchCohort} from '../web/src/lib/research-observed-classifier.mjs';
export {reconcileObservedResearchCohort} from '../web/src/lib/research-observed-classifier.mjs';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { readResearchBoundedFile } from './research-bounded-file.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeSourceController } from './research-source-controller.mjs';
import { validateSourceControllerInput, assertSourcePacketBoundary, sourceControllerInstant } from '../web/src/lib/research-source-attempt-controller.ts';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';
import { sanitizePublicSourceUrl } from '../web/src/lib/public-source-url.ts';

const ROW_KEYS=['id','sourceUrl','publisher','sourcePlatform','subjectScope','symbols','industryTerms','summary','risk','claimStatus',
  'access','publishedAt','publicationPrecision','sourcePublishedDate','attemptedAt','observedAt','responseSha256','responseBytes',
  'readStatus','historicalPITEligible','readSurfaceUrl'];
const ATTEMPT_KEYS=['name','label','url','attemptedAt','observedAt','acquisitionHost','authenticated','httpStatus','finalUrl',
  'contentType','status','bytes','sha256','rowCount','errorClass','errorType','rawFile'];
const SOCIAL_TIMED_KEYS=['attemptedAt','observedAt','readSurface','parentCanonicalUrl','parentAuthor','parentPublishedAtDom',
  'parentVisibleDate','parentSummary','subjectScope','symbols','industryTerms','ownReplyStatus','ownReplyCanonicalUrl'];
const SHA=/^[0-9a-f]{64}$/u;
function only(value, allowed) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!allowed.includes(k)))
    throw new Error('discovery_relay_unknown_field');
}
const project=(value, allowed)=>Object.fromEntries(allowed.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
function clockChain(values) {
  let clocks;try{clocks=values.map(sourceControllerInstant);}catch{throw new Error('discovery_relay_clock_invalid');}
  if(clocks.some((at,i)=>i>0&&at<clocks[i-1]))throw new Error('discovery_relay_clock_invalid');
}
function publicUrl(value) {
  try {const u=new URL(value);if(u.protocol==='https:' && !u.username && !u.password && !u.hash
    && u.toString()===value && sanitizePublicSourceUrl(value)===value)return; }catch { /* reject below */ }
  throw new Error('discovery_relay_url_invalid');
}
function sourceRows(packet, now) {
  only(packet,['schemaVersion','recordedAt','sourceRows','attempts','notes','proposedCompanyScope','securityClassificationFile']);
  if(!Array.isArray(packet.sourceRows) || !Array.isArray(packet.attempts) || packet.attempts.length>30
    || !Array.isArray(packet.notes) || !packet.notes.every(v=>typeof v==='string')
    || !Array.isArray(packet.proposedCompanyScope) || !packet.proposedCompanyScope.every(v=>typeof v==='string'&&/^\d{4}$/u.test(v)))throw new Error('discovery_relay_schema_invalid');
  clockChain([packet.recordedAt,now]);
  for(const attempt of packet.attempts) {
    only(attempt,ATTEMPT_KEYS);publicUrl(attempt.url);
    clockChain([attempt.attemptedAt,attempt.observedAt,packet.recordedAt,now]);
    if(!['read_success','read_failed'].includes(attempt.status) || attempt.authenticated!==undefined&&attempt.authenticated!==false)
      throw new Error('discovery_relay_attempt_invalid');
    if(attempt.sha256!==undefined&&!SHA.test(attempt.sha256)
      || attempt.bytes!==undefined&&(!Number.isInteger(attempt.bytes)||attempt.bytes<1||attempt.bytes>4_000_000)
      || attempt.httpStatus!==undefined&&(!Number.isInteger(attempt.httpStatus)||attempt.httpStatus<100||attempt.httpStatus>599)
      || ['name','label','acquisitionHost','contentType','errorClass','errorType','rawFile'].some(key=>attempt[key]!==undefined&&typeof attempt[key]!=='string'))
      throw new Error('discovery_relay_attempt_invalid');
    if(attempt.finalUrl!==undefined)publicUrl(attempt.finalUrl);
    if(attempt.status==='read_success' && (attempt.httpStatus!==200 || !SHA.test(attempt.sha256)
      || !Number.isInteger(attempt.bytes) || attempt.bytes<1 || attempt.bytes>4_000_000))throw new Error('discovery_relay_attempt_invalid');
  }
  for(const row of packet.sourceRows) {
    only(row,ROW_KEYS);publicUrl(row.sourceUrl);
    if(row.readSurfaceUrl!==undefined)publicUrl(row.readSurfaceUrl);
    clockChain([row.attemptedAt,row.observedAt,packet.recordedAt,now]);
    if(row.publishedAt!==null)clockChain([row.publishedAt,row.attemptedAt]);
    if(!SHA.test(row.responseSha256) || !Number.isInteger(row.responseBytes) || row.responseBytes<1 || row.responseBytes>4_000_000
      || row.historicalPITEligible!==false || !Array.isArray(row.symbols)
      || !row.symbols.every(v=>typeof v==='string'&&/^\d{4}$/u.test(v))
      || !Array.isArray(row.industryTerms) || !row.industryTerms.every(v=>typeof v==='string')
      || !['company_mentions','industry_context'].includes(row.subjectScope)
      || !['id','publisher','summary','risk','claimStatus','publicationPrecision','sourcePlatform'].every(key=>typeof row[key]==='string')
      || row.sourcePublishedDate!==null&&typeof row.sourcePublishedDate!=='string')throw new Error('discovery_relay_acquisition_invalid');
    const matches=packet.attempts.filter(a=>a.status==='read_success'&&a.httpStatus===200
      && a.url===(row.readSurfaceUrl||row.sourceUrl) && a.sha256===row.responseSha256 && a.bytes===row.responseBytes
      && sourceControllerInstant(a.attemptedAt)===sourceControllerInstant(row.attemptedAt)
      && sourceControllerInstant(a.observedAt)===sourceControllerInstant(row.observedAt));
    if(matches.length!==1)throw new Error('discovery_relay_acquisition_binding_invalid');
  }
}
function fullBoundary(relay,social,classification,timed,now) {
  // Inspect all upstream objects before projecting any subset. No input relay
  // bypasses the same recursive secret/prototype/size boundary as the controller.
  for(const packet of [relay,social,classification,...(timed?[timed]:[])])assertSourcePacketBoundary(packet);
  sourceRows(relay,now);if(timed)sourceRows(timed,now);
  only(social,['schemaVersion','recordedAt','platform','method','credentialsExported','privateContentRead','scope','timedRead',
    'earlierObservedSurfaceNotes','availabilityConclusion','publicationUsable','historicalPITEligible','allRepliesRead',
    'platformFullyEnabled','independentCompanyOrderConfirmations','notes']);
  if(social.schemaVersion!=='stockinsider-social-surface-observation-v1' || social.credentialsExported!==false
    || social.privateContentRead!==false || social.historicalPITEligible!==false || social.allRepliesRead!==false
    || social.platformFullyEnabled!==false || social.independentCompanyOrderConfirmations!==0
    || !Array.isArray(social.earlierObservedSurfaceNotes) || !Array.isArray(social.notes)
    || !social.notes.every(v=>typeof v==='string'))throw new Error('discovery_relay_social_boundary_invalid');
  only(social.timedRead,SOCIAL_TIMED_KEYS);
  clockChain([social.timedRead.parentPublishedAtDom,social.timedRead.attemptedAt,social.timedRead.observedAt,social.recordedAt,now]);
  for(const key of ['readSurface','parentCanonicalUrl','ownReplyCanonicalUrl'])publicUrl(social.timedRead[key]);
  for(const row of social.earlierObservedSurfaceNotes) {
    only(row,['url','status','exactReadClockNotCaptured','replyScope','replyPublishedAtDom','replySummary','summary','publishedAt']);publicUrl(row.url);
    if(typeof row.status!=='string' || row.exactReadClockNotCaptured!==true
      || ['replyScope','replySummary','summary'].some(key=>row[key]!==undefined&&typeof row[key]!=='string'))throw new Error('discovery_relay_social_boundary_invalid');
    if(row.replyPublishedAtDom)clockChain([row.replyPublishedAtDom,now]);if(row.publishedAt)clockChain([row.publishedAt,now]);
  }
  only(classification,['schemaVersion','recordedAt','sources','scope','historicalPITEligible','currentTradingEligibilityVerified','trustedAuthorityActivated','members']);
  if(classification.schemaVersion!=='stockinsider-observed-security-classification-relay-v1'
    || classification.currentTradingEligibilityVerified!==false || !Array.isArray(classification.sources))throw new Error('discovery_relay_classification_invalid');
  clockChain([classification.recordedAt,now]);
  for(const row of classification.sources){only(row,['url','observedAt','responseBytes','responseSha256','selectedCount']);publicUrl(row.url);clockChain([row.observedAt,classification.recordedAt,now]);
    if(!SHA.test(row.responseSha256)||!Number.isInteger(row.responseBytes)||row.responseBytes<1||row.responseBytes>4_000_000
      ||!Number.isInteger(row.selectedCount)||row.selectedCount<0)throw new Error('discovery_relay_classification_invalid');}
  for(const row of classification.members){only(row,['symbol','name','exchange','cfi','isin','listingDate','sector']);
    if(!Object.values(row).every(v=>typeof v==='string'))throw new Error('discovery_relay_classification_invalid');}
}

/** Broader current observation only; never a formal roster or trading grant.
 * Large raw-byte references are admitted solely for the fixed official CFI surface.
 * Selected JSON retains the ordinary controller's2MB/recursive credential boundary. */

/** Consume the attributed, reviewed relay; never invent publication clocks or
 * upgrade the observed classification list to the production authority registry. */
export function prepareDiscoveryRelay(relay, social, classification, now = new Date().toISOString(), timed = null, securityScope = null) {
  fullBoundary(relay,social,classification,timed,now);
  if (relay?.schemaVersion !== 'stockinsider-attributed-discovery-evidence-relay-v1'
    || !Array.isArray(relay.sourceRows) || relay.sourceRows.length < 1 || relay.sourceRows.length > 19
    || classification?.trustedAuthorityActivated !== false || classification.historicalPITEligible !== false
    || !Array.isArray(classification.members) || classification.members.length > 5000)
    throw new Error('discovery_relay_schema_invalid');
  const symbols = new Set();
  for (const row of classification.members) {
    if (!/^\d{4}$/u.test(row.symbol) || symbols.has(row.symbol) || row.cfi !== 'ESVUFR'
      || !['TWSE','TPEX'].includes(row.exchange)) throw new Error('discovery_relay_classification_invalid');
    symbols.add(row.symbol);
  }
  const cohort = reconcileObservedResearchCohort(classification,securityScope,now);
  const cohortSymbols=new Set(cohort.members.map(r=>r.symbol));
  const scopes = relay.sourceRows.map(row => {
    if (row.readStatus !== 'read_success' || row.publishedAt !== null || row.access !== 'public'
      || !/^[0-9a-f]{64}$/u.test(row.responseSha256) || !Number.isInteger(row.responseBytes)
      || row.symbols.some(symbol => !cohortSymbols.has(symbol))
      || row.subjectScope === 'industry_context' && row.symbols.length !== 0)
      throw new Error('discovery_relay_source_invalid');
    return {id:row.id,platform:row.sourcePlatform,url:row.sourceUrl,
      scope:'one attributed public body/introduction; publication instant unavailable',
      method:'public_summary_relay',contentScope:row.id === 'investanchors-public' ? 'metadata_index' : 'article_body',
      rights:{basis:'public_summary_relay',checkedAt:now,checkedBy:'authorized-VM-relay-boundary-review'},
      publicRelay:{observer:'authorized-mac-public-https-relay',observedAt:row.observedAt,
        acquisition:{responseSha256:row.responseSha256,responseBytes:row.responseBytes,readSurfaceUrl:row.sourceUrl},
        publication:{precision:row.sourcePublishedDate ? 'date' : 'unknown',value:row.sourcePublishedDate || null},
        pendingSummary:row.summary},
      localRead:{attemptedAt:row.attemptedAt,completedAt:row.observedAt,outcome:'read_success'},
    };
  });
  // The timed surface exposes a parent body, but its own reply/direct surfaces
  // are unavailable. Preserve the conflict, not a withdrawal or usable summary.
  const socialTimed = social?.timedRead;
  if (social?.publicationUsable !== false || social.availabilityConclusion !== 'partial_and_surface_conflicting; not proof of publisher withdrawal and not no-news'
    || !socialTimed || socialTimed.subjectScope !== 'industry_context' || socialTimed.symbols?.length !== 0)
    throw new Error('discovery_relay_social_boundary_invalid');
  scopes.push({id:'threads-partial-surface',platform:'threads',url:socialTimed.parentCanonicalUrl,
    scope:'parent body visible on reply surface; direct post/reply availability conflicts',
    method:'local_authorized_summary',contentScope:'article_body',
    // No summary enters the inbox: retaining the actual read clocks is sufficient
    // to record this terminal conflict. Rights review uses the actual current clock.
    rights:{basis:'authorized_local_summary',checkedAt:now,checkedBy:'user-authorized-public-only-browser-read'},
    localRead:{attemptedAt:socialTimed.attemptedAt,completedAt:socialTimed.observedAt,
      readSurfaceUrl:socialTimed.readSurface,outcome:'read_failed',errorCode:'source_surface_conflict'},
  });
  if (timed) {
    if(timed.schemaVersion !== relay.schemaVersion || !Array.isArray(timed.sourceRows) || timed.sourceRows.length>10)
      throw new Error('discovery_relay_timed_schema_invalid');
    for(const row of timed.sourceRows) {
      if(row.publicationPrecision!=='datetime_with_explicit_offset' || row.readStatus!=='read_success'
        || row.access!=='public' || row.subjectScope!=='industry_context' || row.symbols.length!==0)
        throw new Error('discovery_relay_timed_boundary_invalid');
      scopes.push({id:row.id,platform:row.sourcePlatform,url:row.sourceUrl,
        scope:'one attributed public Telegram message; same publisher, no company mention',
        method:'public_summary_relay',contentScope:'article_body',
        rights:{basis:'public_summary_relay',checkedAt:now,checkedBy:'authorized-VM-relay-boundary-review'},
        publicRelay:{observer:'authorized-mac-public-https-relay',observedAt:row.observedAt,
          acquisition:{responseSha256:row.responseSha256,responseBytes:row.responseBytes,readSurfaceUrl:row.readSurfaceUrl},
          publication:{precision:'instant',value:row.publishedAt}},
        localRead:{attemptedAt:row.attemptedAt,completedAt:row.observedAt,readSurfaceUrl:row.readSurfaceUrl,outcome:'read_success'},
        summary:{sourcePlatform:row.sourcePlatform,sourceUrl:row.sourceUrl,author:row.publisher,publishedAt:row.publishedAt,
          observedAt:row.observedAt,symbols:[],subjectScope:'industry_context',industryTerms:row.industryTerms,
          shortSummary:row.summary,catalyst:'供產業研究查核；不代表公司被提及或訂單確認。',risk:row.risk,
          claimStatus:row.claimStatus,visibility:'public',contentForm:'research_summary',acquisitionMethod:'public_document'},
      });
    }
  }
  const controllerInput={runId:randomUUID(),scopes,priorItems:[]};
  validateSourceControllerInput(controllerInput,now);
  return {controllerInput, observationUniverse:cohort.members.map(row=>({symbol:row.symbol,exchange:row.exchange,
    cfi:row.cfi,sourceSection:row.sourceSection||null,observedAt:row.observedAt||classification.sources.find(r=>r.url.includes(row.exchange==='TWSE'?'market=1':'strMode=4'))?.observedAt||null,
    scopeStatus:relay.proposedCompanyScope.includes(row.symbol) ? 'needs_evidence' : 'not_assessed',
    reason:relay.proposedCompanyScope.includes(row.symbol) ? 'publication_instant_and_trusted_authority_missing' : 'outside_this_bounded_company_assessment',
    pricePhase:'unknown'})),trustedCandidateUniverse:false,top20:null,
    top20Gap:'trusted_authority_not_activated; observed classification is not the server official roster',
    excludedNonCommon:cohort.excluded,classificationEvidence:cohort.evidence,originalSocialObservation:{
      schemaVersion:social.schemaVersion,recordedAt:social.recordedAt,availabilityConclusion:social.availabilityConclusion,
      publicationUsable:false,allRepliesRead:false,timedRead:project(social.timedRead,SOCIAL_TIMED_KEYS),
      earlierObservedSurfaceNotes:social.earlierObservedSurfaceNotes.map(row=>project(row,['url','status','exactReadClockNotCaptured','replyScope','replyPublishedAtDom','replySummary','summary','publishedAt'])),
    },originalAcquisitionAttempts:[...relay.attempts,...(timed?.attempts || [])].map(row=>project(row,ATTEMPT_KEYS.filter(key=>key!=='rawFile'))),
    rawSourceHashesVerifiedByVm:false,platformFullyEnabled:false,productionImported:false};
}

async function readRelayPacket(filename) {
  const bytes = await readResearchBoundedFile(filename, { maximum: 2_000_000,
    absoluteError: 'discovery_relay_absolute_paths_required', boundError: 'discovery_relay_file_bound',
    changedError: 'discovery_relay_input_changed' });
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const argv=process.argv.slice(2);let scopeFile=null;
    if(argv[0]==='--security-scope'){argv.shift();scopeFile=argv.shift();if(!scopeFile||!path.isAbsolute(scopeFile))throw new Error('discovery_relay_absolute_paths_required');}
    if(![4,5].includes(argv.length))throw new Error('discovery_relay_arguments_invalid');
    const output=argv.pop();const [relayFile,socialFile,classificationFile,timedFile]=argv;
    if(![relayFile,socialFile,classificationFile,output].every(path.isAbsolute)) throw new Error('discovery_relay_absolute_paths_required');
    const values=[];
    for(const name of [relayFile,socialFile,classificationFile,...(timedFile ? [timedFile] : [])]) {
      values.push(await readRelayPacket(name));
    }
    let scope=null;if(scopeFile)scope=await readRelayPacket(scopeFile);
    const prepared=prepareDiscoveryRelay(values[0],values[1],values[2],new Date().toISOString(),values[3] || null,scope);
    const run=await executeSourceController(prepared.controllerInput);
    const result={prepared,run,recordedAt:new Date().toISOString(),relayHashes:[...values,...(scope?[scope]:[])].map(researchCanonicalHash)};
    const handle=await open(output,'wx',0o600);
    try {await handle.writeFile(JSON.stringify(result,null,2)+'\n');await handle.sync();}finally{await handle.close();}
    console.log(JSON.stringify({scopeCount:run.receipts.length,inboxItems:run.inboxRequest.items.length,
      outcomes:run.receipts.map(row=>({id:row.scopeId,outcome:row.outcome})),observedSecurityCount:prepared.observationUniverse.length,
      trustedCandidateUniverse:false,top20:null,runHash:run.runHash}));
  } catch(error) {
    const message=error instanceof Error ? error.message : '';
    console.error(JSON.stringify({ok:false,error:/^(?:discovery_relay|source_controller)_[a-z_]+$/u.test(message) ? message : 'discovery_relay_failed'}));
    process.exitCode=1;
  }
}
