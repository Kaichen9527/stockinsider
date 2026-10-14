// Exact15d4 response validation extraction; only imports/function name adapted. No FS.
import {schema2409,schema2383} from './research-complete-schema-bundles.ts';
import mapping from './research-complete-mapping.json' with {type:'json'};
import {completeEnsure as ensure,completeHash,validateCompleteSchema} from './research-v3-material-canonical.ts';
import {parseCompleteRequest,type CompleteRequest} from './research-versioned-input-request.ts';
type Row=Record<string,unknown>;
const capabilityKeys=['financialVerified','dispatchReady','modelDispatched','publishableResearch','researchQualified','strategyApproved','entryEligible','historicalPITEligible'];
function object(value:unknown):Row {ensure(value&&typeof value==='object'&&!Array.isArray(value));return value as Row;}
function equal(a:unknown,b:unknown){ensure(completeHash(a)===completeHash(b));}
/** Current application support is checked on every read, including an old DB replay.
 * This does not open artifacts, renew a lease, or change the persisted clocks. */
export function validateHistoricalCompleteResponse(request:CompleteRequest,response:Row):void {
 parseCompleteRequest(request);ensure(response.dispatchReady===false&&(response.status==='absent'||response.status==='sealed'));
 let symbol:unknown;
 if(response.status==='absent'){
  const parent=object(response.preparation),old=object(parent.request),p=object(parent.payload);
  const {sourceDocumentIds,bundleId,...lineage}=old;void sourceDocumentIds;ensure(bundleId===null);
  const {preparationId,preparationHash,expectedArtifactManifestHash,expectedCalculatorExecutionHash,...wanted}=request;void expectedArtifactManifestHash;void expectedCalculatorExecutionHash;
  equal(lineage,wanted);ensure(parent.preparation_id===preparationId&&parent.input_hash===preparationHash&&parent.dispatchReady===false&&p.scope===request.scope&&p.snapshotHash===request.snapshotHash&&p.modelDispatched===false);symbol=p.symbol;
 }else{
  const p=object(response.canonical_payload),identity=object(p.researchIdentity),prep=object(p.preparation),job=object(p.originalJob),reservation=object(p.originalReservation),hashes=object(p.hashes),financial=object(p.financial),clocks=object(p.clocks),capabilities=object(p.capabilities);
  symbol=identity.symbol;ensure(response.job_id===request.jobId&&response.attempt===request.attempt&&response.reservation_id===request.reservationId&&response.preparation_id===request.preparationId&&response.research_scope===request.scope&&response.snapshot_hash===request.snapshotHash);
  equal(response.canonical_request,request);ensure(response.request_hash===completeHash(request)&&response.input_hash===completeHash(p));
  ensure(p.schemaVersion==='research-article-input-v2'&&p.assemblyStatus==='complete'&&p.evidenceStatus==='incomplete'&&p.producerAttribution==='internal_controller_asserted'&&prep.id===request.preparationId&&prep.inputHash===request.preparationHash&&hashes.preparationInputHash===request.preparationHash
   &&identity.scope===request.scope&&identity.snapshotHash===request.snapshotHash&&identity.researchCompanyId===response.research_company_id&&job.jobId===request.jobId&&job.attempt===request.attempt&&job.owner===request.owner&&reservation.reservationId===request.reservationId);
  ensure(Object.keys(capabilities).sort().join(',')===capabilityKeys.slice().sort().join(',')&&Object.values(capabilities).every(x=>x===false));
  ensure(symbol==='2409'||symbol==='2383');const supported=mapping.companies[symbol],f=object(financial.material),projection=object(f.projection),calculation=object(f.calculation);
  equal(financial.artifactInventory,supported.inventory);ensure(hashes.artifactInventoryHash===supported.inventoryHash&&hashes.sourceClosureHash===mapping.sourceClosureHash&&hashes.modelHistoricalCanonicalHash===supported.historicalHash
   &&hashes.sourceManifestHash===completeHash(projection.sourceManifest)&&hashes.projectionHash===completeHash(projection)&&hashes.scenarioInputHash===completeHash(object(projection.projected).scenarios)&&hashes.resultHash===completeHash(calculation));
  const material={schemaVersion:'research-complete-financial-material-v2',symbol,artifactReadKnownAt:clocks.artifactReadKnownAt,sourceClosureHash:hashes.sourceClosureHash,artifactInventoryHash:hashes.artifactInventoryHash,financialMaterial:f};
  validateCompleteSchema(material,(symbol==='2409'?schema2409:schema2383)as Row,String(clocks.artifactReadKnownAt));
 }
 ensure(symbol==='2409'||symbol==='2383');ensure(request.expectedArtifactManifestHash===mapping.companies[symbol].inventoryHash&&request.expectedCalculatorExecutionHash===mapping.sourceClosureHash);
}
