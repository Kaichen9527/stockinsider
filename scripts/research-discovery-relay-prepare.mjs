import { randomUUID } from 'node:crypto';
import { readFile, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeSourceController } from './research-source-controller.mjs';
import { validateSourceControllerInput } from '../web/src/lib/research-source-attempt-controller.ts';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';

/** Consume the attributed, reviewed relay; never invent publication clocks or
 * upgrade the observed classification list to the production authority registry. */
export function prepareDiscoveryRelay(relay, social, classification, now = new Date().toISOString(), timed = null) {
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
  const scopes = relay.sourceRows.map(row => {
    if (row.readStatus !== 'read_success' || row.publishedAt !== null || row.access !== 'public'
      || !/^[0-9a-f]{64}$/u.test(row.responseSha256) || !Number.isInteger(row.responseBytes)
      || row.symbols.some(symbol => !symbols.has(symbol))
      || row.subjectScope === 'industry_context' && row.symbols.length !== 0)
      throw new Error('discovery_relay_source_invalid');
    return {id:row.id,platform:row.sourcePlatform,url:row.sourceUrl,
      scope:'one attributed public body/introduction; publication instant unavailable',
      method:'public_summary_relay',contentScope:row.id === 'investanchors-public' ? 'metadata_index' : 'article_body',
      rights:{basis:'public_summary_relay',checkedAt:now,checkedBy:'authorized-VM-relay-boundary-review'},
      publicRelay:{observer:'authorized-mac-public-https-relay',observedAt:row.observedAt,
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
  return {controllerInput, observationUniverse:classification.members.map(row=>({symbol:row.symbol,exchange:row.exchange,
    scopeStatus:relay.proposedCompanyScope.includes(row.symbol) ? 'needs_evidence' : 'not_assessed',
    reason:relay.proposedCompanyScope.includes(row.symbol) ? 'publication_instant_and_trusted_authority_missing' : 'outside_this_bounded_company_assessment',
    pricePhase:'unknown'})),trustedCandidateUniverse:false,top20:null,
    top20Gap:'trusted_authority_not_activated; observed classification is not the server official roster',
    excludedNonCommon:null,originalSocialObservation:social,originalAcquisitionAttempts:[...relay.attempts,...(timed?.attempts || [])],
    rawSourceHashesVerifiedByVm:false,platformFullyEnabled:false,productionImported:false};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if(![6,7].includes(process.argv.length)) throw new Error('discovery_relay_arguments_invalid');
    const argv=process.argv.slice(2);const output=argv.pop();const [relayFile,socialFile,classificationFile,timedFile]=argv;
    if(![relayFile,socialFile,classificationFile,output].every(path.isAbsolute)) throw new Error('discovery_relay_absolute_paths_required');
    const values=[];
    for(const name of [relayFile,socialFile,classificationFile,...(timedFile ? [timedFile] : [])]) {
      const bytes=await readFile(name);
      if(bytes.length>2_000_000) throw new Error('discovery_relay_file_bound');
      values.push(JSON.parse(bytes.toString('utf8')));
    }
    const prepared=prepareDiscoveryRelay(values[0],values[1],values[2],new Date().toISOString(),values[3] || null);
    const run=await executeSourceController(prepared.controllerInput);
    const result={prepared,run,recordedAt:new Date().toISOString(),relayHashes:values.map(researchCanonicalHash)};
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
