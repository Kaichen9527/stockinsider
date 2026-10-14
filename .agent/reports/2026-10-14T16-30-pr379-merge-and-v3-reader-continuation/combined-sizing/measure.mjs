import fs from 'node:fs';import assert from 'node:assert/strict';import{gunzipSync}from'node:zlib';import{createHash}from'node:crypto';
import{completeCanonical,completeHash,validateCompleteSchema}from'./research-complete-canonical.ts';
import{historicalCashPins as pins}from'/tmp/stockinsider-discovery-snapshot-root-review-oct14/web/src/lib/research-historical-cash-pins.ts';
import{projectPinnedHistoricalCash}from'/tmp/stockinsider-discovery-snapshot-root-review-oct14/web/src/lib/research-historical-cash-projection.ts';
const root=new URL('.',import.meta.url),read=name=>JSON.parse(fs.readFileSync(new URL(name,root),'utf8'));
const mapping=read('research-complete-mapping.json'),clock='2026-10-14T00:00:00.000000Z';
const fixture=JSON.parse(gunzipSync(fs.readFileSync('/tmp/stockinsider-discovery-snapshot-root-review-oct14/scripts/fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz'),{maxOutputLength:2000000}));
const raw=new Map(fixture.files.map(f=>[f.pin.path,Buffer.from(f.rawBase64,'base64')]));
function sorted(v){if(Array.isArray(v))return`[${v.map(sorted).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${sorted(v[k])}`).join(',')}}`;return JSON.stringify(v);}
function fromSchema(schema,symbol,path=''){
 if(Object.hasOwn(schema,'const'))return structuredClone(schema.const);
 if(schema.type==='object')return Object.fromEntries(Object.entries(schema.properties).map(([k,s])=>[k,fromSchema(s,symbol,path+'/'+k)]));
 if(schema.type==='array')return schema.prefixItems.map((s,i)=>fromSchema(s,symbol,path+'/'+i));
 if(schema.format==='date-time')return clock;
 if(path==='/sourceClosureHash')return mapping.sourceClosureHash;
 if(path==='/artifactInventoryHash')return mapping.companies[symbol].inventoryHash;
 throw Error('unhandled static schema leaf:'+path);
}
function deepest(v,path='',depth=0){let best={depth,path};if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){const next=deepest(x,path+'/'+k,depth+1);if(next.depth>best.depth)best=next;}return best;}
const uuid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',zero='0'.repeat(64);
const results=[];
for(const symbol of ['2409','2383']){
 const schema=read(`research-complete-${symbol}.schema.json`),old=fromSchema(schema,symbol);validateCompleteSchema(old,schema,clock);completeCanonical(old);
 const selected=pins.companies[symbol],carrier=Buffer.from(sorted({schemaVersion:'historical-cash-private-byte-material-v1',financialProfile:pins.profile,symbol,files:selected.files.map(p=>({path:p.path,rawBase64:raw.get(p.path).toString('base64')}))}));
 assert.equal(carrier.length,selected.carrier.bytes);assert.equal(createHash('sha256').update(carrier).digest('hex'),selected.carrier.sha256);
 const cash=projectPinnedHistoricalCash(pins.profile,symbol,carrier,{check(){}});
 const projection={...old.financialMaterial.projection,historicalCash:cash};
 // Explicit sizing proposal only: zero closure is NOT an approved mapping.
 const material={...old,schemaVersion:'research-complete-financial-material-v3',sourceClosureHash:zero,artifactInventoryHash:completeHash(selected.files.map(p=>({file:p.path,bytes:p.bytes,sha256:p.sha256}))),financialMaterial:{projection,calculation:old.financialMaterial.calculation}};
 const request={owner:'synthetic-sizing-only',jobId:uuid,attempt:1,reservationId:uuid,scope:'research_observed_v1',snapshotHash:zero,preparationId:uuid,preparationHash:zero,expectedArtifactManifestHash:material.artifactInventoryHash,expectedCalculatorExecutionHash:zero};
 // Matches the original SQL structural envelopes, with explicitly synthetic
 // lineage/source IDs and one minimal source. No DB/role/lease or seal exists.
 const envelope={schemaVersion:'research-article-input-v3',assemblyStatus:'complete',evidenceStatus:'incomplete',producerAttribution:'internal_controller_asserted',preparation:{id:uuid,inputHash:zero},researchIdentity:{researchCompanyId:uuid,symbol,scope:request.scope,snapshotHash:zero,mappingDigest:zero,stockId:uuid},priority:{runId:uuid,inputHash:zero,discoveryCutoff:clock},originalJob:{jobId:uuid,attempt:1,owner:request.owner,leaseExpiresAt:clock},originalReservation:{reservationId:uuid,startedAt:clock,leaseExpiresAt:clock},sources:{sealId:uuid,manifest:[{id:uuid,rowHash:zero}],coverage:'incomplete'},financial:{artifactInventory:selected.files.map(p=>({file:p.path,bytes:p.bytes,sha256:p.sha256})),material:material.financialMaterial},hashes:{preparationInputHash:zero,artifactInventoryHash:material.artifactInventoryHash,modelHistoricalCanonicalHash:selected.modelCanonicalHash,sourceManifestHash:completeHash(projection.sourceManifest),projectionHash:completeHash(projection),scenarioInputHash:completeHash(projection.projected.scenarios),resultHash:completeHash(material.financialMaterial.calculation),sourceClosureHash:zero},clocks:{originalModelCutoff:projection.clocks.originalModelCutoff,originalPreparationAdmittedAt:clock,artifactReadKnownAt:clock,financialAdmittedAt:clock,researchCutoff:clock},gaps:[{namespace:'source',reason:'source_coverage_incomplete'},{namespace:'financial',reason:'financial_source_live_rights_unverified'},{namespace:'execution',reason:'trusted_role_execution_unavailable'},...projection.gaps.map(reason=>({namespace:'financial',reason}))],capabilities:Object.fromEntries(['financialVerified','dispatchReady','modelDispatched','publishableResearch','researchQualified','strategyApproved','entryEligible','historicalPITEligible'].map(k=>[k,false]))};
 let encoded=null,canonicalError=null;try{encoded=completeCanonical(envelope);}catch(e){canonicalError=e.message;}
 const bytes=v=>Buffer.byteLength(JSON.stringify(v));
 results.push({symbol,measurementKind:'exact legacy static-schema instantiation plus actual new pinned cash output; additive-shape sizing PROPOSAL only',syntheticClock:clock,legacySchemaValid:true,legacyProjectionJsonBytes:bytes(old.financialMaterial.projection),legacyMaterialJsonBytes:bytes(old),cashProjectionJsonBytes:bytes(cash),combinedProjectionJsonBytes:bytes(projection),combinedMaterialJsonBytes:bytes(material),combinedEnvelopeJsonBytes:bytes(envelope),projectionCap160000:bytes(projection)<=160000,materialCap262144:bytes(material)<=262144,envelopeMaxDepth:deepest(envelope),originalCanonicalDepth12Accepted:encoded!==null,canonicalError,taggedRequestBytes:Buffer.byteLength(completeCanonical(request)),taggedEnvelopeBytes:encoded===null?null:Buffer.byteLength(encoded),minimumOneSourceRevisionCharge:encoded===null?null:Buffer.byteLength(encoded)+Buffer.byteLength(completeCanonical(request)),priorPreparationChargesIncluded:false,maximumSourceManifestIncluded:false,newScenarioProjectorOrSchemaImplemented:false,fullHTTPPGQuotaAcceptance:false,admissionOrPublication:false});
 carrier.fill(0);
}
console.log(JSON.stringify({cashSource:'06ae6924a7d6a90d60d3161a154fdb5104aab3f1',legacySchemaSource:'15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb',results,currentRssBytes:process.memoryUsage().rss},null,2));
