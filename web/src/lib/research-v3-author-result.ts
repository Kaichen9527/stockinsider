/** Private, unactivated finite author union composition. Requires the guarded
 * author-durable-union migration on the existing signatures. Original v2 SQL
 * rejects the v3 packet arm before any receive; there is no RPC fallback. */
import {requireExactInternalBearer} from './internal-auth.ts';
import {resolveResearchControllerIdentity,validateResearchExecutionObservation} from './research-execution-binding.ts';
import {bindingCanonical} from './research-versioned-input-binding.ts';
import {parseCompleteRequest,type CompleteRequest} from './research-versioned-input-request.ts';
import {completeHash,completeCanonical,parseCompleteJson} from './research-v3-material-canonical.ts';
import {FinancialIoDeadline} from './research-financial-io-owner.ts';
import {financialInstant} from './research-financial-clock.ts';
import {recalculateResearchBusinessScenarios} from './research-business-calculator.ts';
import {sanitizePublicSourceUrl} from './public-source-url.ts';
import {createV3BusinessArticleValidator,type ArticleSourceV2} from './research-v3-business-article.ts';
import {createV3CashCitationConsumer} from './research-v3-article-citations.ts';
import type {VersionedInputRpc} from './research-versioned-complete-input.ts';
type Row = Record<string, unknown>;
type AuthorPacketRequest = { input: CompleteRequest; inputRevisionId: string; inputHash: string };
function ensure(value: unknown): asserts value { if (!value) throw new Error('research_author_packet_invalid'); }
function object(value: unknown): Row { ensure(value && typeof value === 'object' && !Array.isArray(value)); return value as Row; }
function exact(value: unknown, keys: string[]): Row {
  const row = object(value); ensure(Object.keys(row).sort().join(',') === keys.slice().sort().join(',')); return row;
}
function bounded(value: unknown, max: number): asserts value is string {
  ensure(typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value, 'utf8') <= max
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
    && !/\bBearer\s+\S+|-----BEGIN .*PRIVATE KEY-----|\b(?:password|api[_-]?key|access[_-]?token|cookie)\s*[:=]/iu.test(value));
}
const sourceKeys = ['descriptor', 'title', 'summary', 'catalyst', 'risk', 'platform', 'sourceClaimStatus',
  'collectedAt', 'unverifiedPublicationClaim', 'untrustedEvidence'];

function assertResearchAuthorPacketWindow(packet: Row, deadline: FinancialIoDeadline) {
  deadline.check(); const window = object(packet.writingWindow), current = financialInstant(new Date().toISOString());
  ensure(current >= financialInstant(window.assignedAt) && current < financialInstant(window.originalJobDeadline)
    && current < financialInstant(window.originalReservationDeadline));
}

/** Private controller projection, never an author-supplied context. Live SQL
 * fences must be checked again at result receipt/publication. No dispatch here. */
function projectResearchAuthorPacket(request: AuthorPacketRequest, revision: Row, assignment: Row,
  response: unknown, deadline: FinancialIoDeadline, now = () => new Date().toISOString()) {
  deadline.check(); // revision was obtained by the private consumer READ in this invocation
  ensure(revision.status === 'sealed' && revision.revision_id === request.inputRevisionId && revision.input_hash === request.inputHash);
  const raw = exact(response, ['assignment', 'inputRevisionId', 'inputHash', 'sourceSealReceivedAt', 'sources']);
  ensure(raw.inputRevisionId === request.inputRevisionId && raw.inputHash === request.inputHash
    && completeHash(raw.assignment) === completeHash(assignment));
  const payload = object(revision.canonical_payload), identity = object(payload.researchIdentity), clocks = object(payload.clocks);
  ensure(typeof assignment.assignment_id === 'string'
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(assignment.assignment_id));
  const originalJob = object(payload.originalJob), originalReservation = object(payload.originalReservation);
  ensure(assignment.job_id === request.input.jobId && assignment.reservation_id === request.input.reservationId
    && assignment.attempt === request.input.attempt && assignment.input_revision_id === request.inputRevisionId
    && assignment.input_hash === request.inputHash && assignment.research_company_id === identity.researchCompanyId
    && assignment.snapshot_hash === request.input.snapshotHash && assignment.work_owner === request.input.owner
    && assignment.reservation_started_at === originalReservation.startedAt
    && assignment.reservation_expires_at === originalReservation.leaseExpiresAt
    && assignment.original_job_deadline === originalJob.leaseExpiresAt);
  const cutoff = financialInstant(clocks.researchCutoff), assigned = financialInstant(assignment.assigned_at);
  const expiry = [financialInstant(assignment.original_job_deadline), financialInstant(assignment.reservation_expires_at)]
    .reduce((a, b) => a < b ? a : b);
  const checkWindow = () => {
    deadline.check(); const current = financialInstant(now());
    ensure(financialInstant(assignment.reservation_started_at) <= assigned && cutoff <= assigned
      && assigned <= current && current < expiry);
  };
  checkWindow();
  const manifest = object(payload.sources).manifest;
  ensure(Array.isArray(manifest) && manifest.length <= 30 && Array.isArray(raw.sources) && raw.sources.length === manifest.length);
  ensure(Buffer.byteLength(JSON.stringify(raw), 'utf8') <= 1_048_576
    && Buffer.byteLength(JSON.stringify(raw.sources), 'utf8') <= 307_200);
  if (manifest.length) { bounded(raw.sourceSealReceivedAt, 100); ensure(financialInstant(raw.sourceSealReceivedAt) <= cutoff); }
  else ensure(raw.sourceSealReceivedAt === null);
  const selected = new Map(manifest.map(item => { const row = object(item); return [row.id, row.rowHash]; }));
  ensure(selected.size === manifest.length);
  const seen = new Set<string>();
  const sources = raw.sources.map(value => {
    const source = exact(value, sourceKeys), d = exact(source.descriptor, ['id', 'rowHash', 'url', 'observedAt', 'admittedAt',
      'publication', 'scope', 'symbols', 'rights', 'retracted', 'superseded']);
    bounded(d.id, 36); bounded(d.rowHash, 64);
    ensure(selected.has(d.id) && selected.get(d.id) === d.rowHash && !seen.has(d.id)); seen.add(d.id);
    bounded(d.url, 800); ensure(d.url.startsWith('https://') && sanitizePublicSourceUrl(d.url) === d.url);
    ensure(d.rights === 'public_summary_only' && d.retracted === false && d.superseded === false
      && (d.scope === 'company_mentions' || d.scope === 'industry_context')
      && Array.isArray(d.symbols) && d.symbols.length <= 50 && d.symbols.every(s => typeof s === 'string' && /^\d{4}$/u.test(s))
      && (d.scope === 'company_mentions' ? d.symbols.includes(identity.symbol) : d.symbols.length === 0));
    const publication = exact(d.publication, ['precision', 'raw', 'timezone', 'instant']);
    ensure(publication.precision === 'unknown' && publication.raw === null && publication.timezone === null && publication.instant === null);
    for (const timestamp of [d.observedAt, d.admittedAt, source.collectedAt]) bounded(timestamp, 100);
    ensure(financialInstant(d.observedAt) <= financialInstant(source.collectedAt)
      && financialInstant(source.collectedAt) <= financialInstant(d.admittedAt)
      && financialInstant(d.admittedAt) === financialInstant(raw.sourceSealReceivedAt));
    if (source.unverifiedPublicationClaim !== null) {
      bounded(source.unverifiedPublicationClaim, 100);
      ensure(financialInstant(source.unverifiedPublicationClaim) <= financialInstant(d.observedAt));
    }
    for (const [key, max] of [['title', 512], ['summary', 4096], ['catalyst', 2048], ['risk', 2048], ['platform', 80]] as const) bounded(source[key], max);
    ensure(['rumor', 'reported', 'confirmed'].includes(String(source.sourceClaimStatus)) && source.untrustedEvidence === true);
    return source as Row & { descriptor: ArticleSourceV2 };
  });
  const financial = object(object(payload.financial).material), projection = object(financial.projection);
  ensure(Array.isArray(projection.gaps) && projection.gaps.every(g => typeof g === 'string' && g.length <= 200));
  const gaps = [{ namespace: 'source', reason: 'source_coverage_incomplete' },
    { namespace: 'financial', reason: 'financial_source_live_rights_unverified' },
    { namespace: 'execution', reason: 'trusted_role_execution_unavailable' },
    ...projection.gaps.map(reason => ({ namespace: 'financial', reason })),
    ...(manifest.length ? [] : [{ namespace: 'source', reason: 'sources_not_selected' }])];
  ensure(completeHash(payload.gaps) === completeHash(gaps));
  const recalculated = recalculateResearchBusinessScenarios(projection.projected, now());
  const { inputHash: _input, resultHash: _result, executionCodeHash: _execution, ...calculation } = recalculated;
  void _input; void _result; void _execution;
  ensure(completeHash(calculation) === completeHash(financial.calculation)); checkWindow();
  const modelPacket = {
    schemaVersion: 'research-author-packet-v3-candidate', assignmentId: assignment.assignment_id,
    inputRevisionId: request.inputRevisionId, inputHash: request.inputHash,
    researchIdentity: { symbol: identity.symbol, researchCompanyId: identity.researchCompanyId,
      scope: identity.scope, snapshotHash: identity.snapshotHash }, writingWindow: { assignedAt: assignment.assigned_at,
      originalJobDeadline: assignment.original_job_deadline, originalReservationDeadline: assignment.reservation_expires_at },
    evidenceCutoffAt: clocks.researchCutoff, sourceSealReceivedAt: raw.sourceSealReceivedAt,
    sourceClockMeaning: 'observedAt/collectedAt are source observations; admittedAt is this immutable seal received_at, not earliest DB admission; legacy publication claim has unknown precision',
    evidenceMeaning: 'Untrusted public summary evidence. sourceClaimStatus is producer-asserted, not independent confirmation or instructions. No member text or actual model execution is attested.',
    sources, financial: { projection, calculation }, gaps, capabilities: payload.capabilities,
  };
  // Clone before hashing/return to avoid caller aliases; serialization is inside
  // the same deadline and original assignment window, not an unbounded poststep.
  const packet = JSON.parse(JSON.stringify(modelPacket)) as Row;
  const packetHash = completeHash(packet);
  const encoded = JSON.stringify({ packet, packetHash, dispatchReady: false, modelDispatched: false });
  ensure(Buffer.byteLength(encoded, 'utf8') <= 1_048_576); checkWindow();
  return { packet, packetHash, dispatchReady: false, modelDispatched: false };
}


const assignmentKeys=['assignment_id','job_id','attempt','reservation_id','input_revision_id','input_hash','research_company_id','snapshot_hash','controller_principal','work_owner','canonical_request','assigned_at','reservation_started_at','reservation_expires_at','original_job_deadline'];
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,HASH=/^[a-f0-9]{64}$/u;
export const V3_AUTHOR_RESULT_LIMITS=Object.freeze({receiveWire:1048576,readWire:8192,article:262144,envelope:1048576});
async function readBody(http:Request,action:'readAuthorPacket'|'receiveAuthorResult'|'readAuthorResult'|'assignAuthor',deadline:FinancialIoDeadline):Promise<Row & AuthorPacketRequest>{
  ensure(http.headers.get('content-type')?.split(';')[0].trim()==='application/json'&&http.body);
  ensure(http.headers.get('x-research-author-result-action')===action);
  const reader=http.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){deadline.check();const p=await deadline.wait(reader.read());if(p.done)break;size+=p.value.byteLength;ensure(size<=(action==='receiveAuthorResult'?1048576:8192));chunks.push(p.value);}
    const body=exact(parseCompleteJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))),['action','input','inputRevisionId','inputHash',...(action==='receiveAuthorResult'?['article','observation']:[])]);
    ensure(body.action===action&&typeof body.inputRevisionId==='string'&&UUID.test(body.inputRevisionId)&&typeof body.inputHash==='string'&&HASH.test(body.inputHash));
    const input=parseCompleteRequest(body.input);ensure(Buffer.byteLength(JSON.stringify(input))<=8192);deadline.check();
    return {...body,input,inputRevisionId:body.inputRevisionId,inputHash:body.inputHash};
  }finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
}
function authenticate(http:Request){ensure(requireExactInternalBearer(http));const identity=resolveResearchControllerIdentity(http,'author');ensure(identity.ok);return identity.principalId;}
/** Server-only factory; never instantiate from request/model config. The original
 * source/job/role/lease/reservation SQL fences must be provided by future guarded
 * existing-signature union RPCs. No supplied boolean or legacy fallback represents those fences. */
export function createV3AuthorArticleComposition(config:{bindingTexts:readonly string[];executorFingerprint:string}){
 const consumer=createV3CashCitationConsumer(config),validator=createV3BusinessArticleValidator(config);
 async function packet(db:VersionedInputRpc,input:AuthorPacketRequest,principal:string,deadline:FinancialIoDeadline){
  const acquired=await consumer.readForArticle(db,JSON.stringify(input.input),input.inputRevisionId,input.inputHash,deadline),revision=acquired.revision;
  const rpc=async(name:string)=>{deadline.check();const work=Promise.resolve().then(()=>{deadline.check();return db.rpc(name,{p_request:input.input,p_revision_id:input.inputRevisionId,p_input_hash:input.inputHash,p_principal:principal});});work.catch(()=>{});const response=await deadline.wait(work);ensure(!response.error&&response.data!==null);deadline.check();return response.data;};
  const saved=exact(await rpc('read_research_author_assignment_v2'),assignmentKeys),payload=object(revision.canonical_payload),job=object(payload.originalJob),reservation=object(payload.originalReservation);
  ensure(typeof saved.assignment_id==='string'&&UUID.test(saved.assignment_id)&&saved.job_id===input.input.jobId&&saved.attempt===input.input.attempt&&saved.reservation_id===input.input.reservationId&&saved.input_revision_id===input.inputRevisionId&&saved.input_hash===input.inputHash&&saved.research_company_id===revision.research_company_id&&saved.snapshot_hash===input.input.snapshotHash&&saved.controller_principal===principal&&saved.work_owner===input.input.owner&&completeHash(saved.canonical_request)===completeHash(input.input)&&saved.reservation_started_at===reservation.startedAt&&saved.reservation_expires_at===reservation.leaseExpiresAt&&saved.original_job_deadline===job.leaseExpiresAt);
  const {controller_principal:_principal,canonical_request:_request,...assignment}=saved;void _principal;void _request;
  const raw=exact(await rpc('read_research_author_packet_v2'),['assignment','inputRevisionId','inputHash','sourceSealReceivedAt','sources','wireVersion','bindingCapsuleIdentity']);
  ensure(raw.wireVersion==='research-article-input-v3'&&raw.bindingCapsuleIdentity===acquired.citations.context.bindingCapsuleIdentity);
  const {wireVersion:_wire,bindingCapsuleIdentity:_binding,...originalShape}=raw;void _wire;void _binding;
  const projected=projectResearchAuthorPacket(input,revision,assignment,originalShape,deadline);
  const modelPacket:Row={...projected.packet,citationContext:acquired.citations.context,citationNamespaces:['/cash/reported/','/cash/derived/','/cash/ratio/','/capital/','/scenario/calculation/'],citationMeaning:'Finite pointers only; exact values/unit/period/classification required at receive. Cached context is not a live lease.',wireDispatchEnabled:false,sourceClosureApproved:false};
  ensure(Buffer.byteLength(JSON.stringify(modelPacket))<=1048576);deadline.check();return {packet:modelPacket,packetHash:completeHash(modelPacket),revision,assignment:saved};
 }
 async function prepare(http:Request,db:VersionedInputRpc,body:Row & AuthorPacketRequest,principal:string,deadline:FinancialIoDeadline,loadedPacket?:Awaited<ReturnType<typeof packet>>){
   const loaded=loadedPacket??await packet(db,body,principal,deadline),p=loaded.packet,window=object(p.writingWindow);
   ensure(Buffer.byteLength(JSON.stringify(body.article))<=262144);
   const checked=await validator.validate(db,JSON.stringify(body.input),body.inputRevisionId,body.inputHash,JSON.stringify(body.article),(p.sources as Row[]).map(s=>s.descriptor as ArticleSourceV2),deadline);
   // Private transport includes the finite registration schema, not stored material.
   // Compare every validated response field without feeding schema metadata to the depth12 data codec.
   ensure(bindingCanonical(checked.revision)===bindingCanonical(loaded.revision));
   const validated=checked.validatedArticle,revision=checked.revision;
   const expected={assignmentId:String(p.assignmentId),jobId:body.input.jobId,attempt:body.input.attempt,reservationId:body.input.reservationId,inputRevisionId:body.inputRevisionId,inputHash:body.inputHash,articleHash:validated.articleHash,reviewPackHash:null,outputHash:completeHash(body.article),role:'author' as const,principalId:principal,workOwner:body.input.owner,originalLeaseOwner:body.input.owner,reservationRole:'company_research' as const,assignedAt:String(window.assignedAt),reservationStartedAt:String(object(object(revision.canonical_payload).originalReservation).startedAt),reservationExpiresAt:String(window.originalReservationDeadline),originalJobDeadline:String(window.originalJobDeadline),receivedAt:new Date().toISOString(),articleAuthoredAt:null,author:null,usedInvocationIds:[]};
   const observed=validateResearchExecutionObservation(http,expected,body.observation);ensure(observed.ok);
   const authored=financialInstant(object(body.article).authoredAt);ensure(financialInstant(observed.observation.controllerObservedStartAt)<=authored&&authored<=financialInstant(observed.observation.controllerObservedEndAt)&&financialInstant(p.evidenceCutoffAt)<=financialInstant(observed.observation.controllerObservedStartAt));
   const envelope={schemaVersion:'research-author-result-v3-candidate',assignmentId:p.assignmentId,inputRevisionId:body.inputRevisionId,inputHash:body.inputHash,bindingCapsuleIdentity:validated.bindingCapsuleIdentity,wireVersion:'research-article-input-v3',financialProfile:validated.financialProfile,validatorVersion:validated.validatorVersion,rawArticle:body.article,validatedArticle:validated,observation:observed.observation};
   ensure(Buffer.byteLength(completeCanonical(envelope))<=1048576);const envelopeHash=completeHash(envelope);assertResearchAuthorPacketWindow(p,deadline);
   return {envelope,envelopeHash,packetHash:loaded.packetHash,packet:p};
 }
 async function call(db:VersionedInputRpc,name:string,body:AuthorPacketRequest,principal:string,deadline:FinancialIoDeadline,envelope?:unknown){
  deadline.check();const work=Promise.resolve().then(()=>{deadline.check();return db.rpc(name,{p_request:body.input,p_revision_id:body.inputRevisionId,p_input_hash:body.inputHash,p_principal:principal,...(envelope?{p_result:envelope}:{})});});
  work.catch(()=>{});const result=await deadline.wait(work);if(result.error)throw result.error;deadline.check();return result.data;
 }
 async function receipt(http:Request,db:VersionedInputRpc,body:Row & AuthorPacketRequest,principal:string,deadline:FinancialIoDeadline,data:unknown,loaded:Awaited<ReturnType<typeof packet>>,expected?:unknown){
  if(data===null){ensure(expected===undefined);assertResearchAuthorPacketWindow(loaded.packet,deadline);return null;}
  // Bound before clone/hash; the trusted DB transport is not model-provided JSON.
  ensure(Buffer.byteLength(JSON.stringify(data))<=1048576);
  const saved=exact(data,['result_id','assignment_id','result_hash','logical_bytes','received_at','payload']);
  ensure(typeof saved.result_id==='string'&&UUID.test(saved.result_id)&&saved.assignment_id===loaded.packet.assignmentId
   &&typeof saved.result_hash==='string'&&HASH.test(saved.result_hash)&&Number.isInteger(saved.logical_bytes)
   &&saved.logical_bytes===Buffer.byteLength(completeCanonical(saved.payload))&&Number(saved.logical_bytes)>0&&Number(saved.logical_bytes)<=1048576
   &&saved.result_hash===completeHash(saved.payload));
  const envelope=exact(saved.payload,['schemaVersion','assignmentId','inputRevisionId','inputHash','bindingCapsuleIdentity','wireVersion','financialProfile','validatorVersion','rawArticle','validatedArticle','observation']);
  ensure(envelope.schemaVersion==='research-author-result-v3-candidate'&&envelope.assignmentId===loaded.packet.assignmentId
   &&envelope.inputRevisionId===body.inputRevisionId&&envelope.inputHash===body.inputHash);
  const received=financialInstant(saved.received_at),window=object(loaded.packet.writingWindow),o=object(envelope.observation);
  ensure(received>=financialInstant(window.assignedAt)&&received>=financialInstant(o.controllerObservedEndAt)
   &&received<financialInstant(window.originalJobDeadline)&&received<financialInstant(window.originalReservationDeadline)
   &&received<=financialInstant(new Date().toISOString()));
  if(expected!==undefined)ensure(completeCanonical(envelope)===completeCanonical(expected));
  // READ recovery revalidates the full article, arithmetic, live context and
  // observation from the immutable receipt. No model, FS, new seal or receive.
  const rebuilt=await prepare(http,db,{...body,article:envelope.rawArticle,observation:envelope.observation},principal,deadline,loaded);
  ensure(completeCanonical(envelope)===completeCanonical(rebuilt.envelope));
  assertResearchAuthorPacketWindow(loaded.packet,deadline);const snapshot=JSON.parse(JSON.stringify(saved));deadline.check();return snapshot;
 }
 return Object.freeze({
  async readAuthorPacket(http:Request,db:VersionedInputRpc,deadline=new FinancialIoDeadline()){
   const principal=authenticate(http);deadline.check();const body=await readBody(http,'readAuthorPacket',deadline);const result=await packet(db,body,principal,deadline);assertResearchAuthorPacketWindow(result.packet,deadline);return {packet:result.packet,packetHash:result.packetHash,dispatchReady:false,modelDispatched:false};
  },
  async prepareAuthorResult(http:Request,db:VersionedInputRpc,deadline=new FinancialIoDeadline()){
   const principal=authenticate(http);deadline.check();const body=await readBody(http,'receiveAuthorResult',deadline);
   const prepared=await prepare(http,db,body,principal,deadline);
   return {envelope:prepared.envelope,envelopeHash:prepared.envelopeHash,packetHash:prepared.packetHash,persistence:{status:'unavailable' as const,requiredRpc:'receive_research_author_result_v2',reason:'diagnostic preparation only; call receiveAuthorResult for a durable receipt'},dispatchReady:false,modelDispatched:false,publishableResearch:false,controllerReportOnly:true};
  },
  async assignAuthor(http:Request,db:VersionedInputRpc,deadline=new FinancialIoDeadline()){
   const principal=authenticate(http);deadline.check();const body=await readBody(http,'assignAuthor',deadline);
   await consumer.readForArticle(db,JSON.stringify(body.input),body.inputRevisionId,body.inputHash,deadline);
   const saved=await call(db,'assign_research_author_v2',body,principal,deadline);
   const loaded=await packet(db,body,principal,deadline);
   const checked=exact(saved,assignmentKeys);ensure(checked.controller_principal===principal&&checked.assignment_id===loaded.packet.assignmentId&&completeCanonical(saved)===completeCanonical(loaded.assignment));
   const again=await call(db,'read_research_author_assignment_v2',body,principal,deadline);ensure(completeCanonical(saved)===completeCanonical(again));
   assertResearchAuthorPacketWindow(loaded.packet,deadline);return {assignment:JSON.parse(JSON.stringify(saved)),dispatchReady:false,modelDispatched:false};
  },
  async receiveAuthorResult(http:Request,db:VersionedInputRpc,deadline=new FinancialIoDeadline()){
   const principal=authenticate(http);deadline.check();const body=await readBody(http,'receiveAuthorResult',deadline);
   const loaded=await packet(db,body,principal,deadline),prepared=await prepare(http,db,body,principal,deadline,loaded);
   // A transport loss is propagated unchanged: outcome is uncertain. Caller
   // reconciles with readAuthorResult; never auto-receive, claim or renew.
   const saved=await call(db,'receive_research_author_result_v2',body,principal,deadline,prepared.envelope);
   const result=await receipt(http,db,body,principal,deadline,saved,loaded,prepared.envelope);
   return {result,dispatchReady:false,modelDispatched:false,publishableResearch:false,controllerReportOnly:true};
  },
  async readAuthorResult(http:Request,db:VersionedInputRpc,deadline=new FinancialIoDeadline()){
   const principal=authenticate(http);deadline.check();const body=await readBody(http,'readAuthorResult',deadline);
   const loaded=await packet(db,body,principal,deadline),saved=await call(db,'read_research_author_result_v2',body,principal,deadline);
   const result=await receipt(http,db,body,principal,deadline,saved,loaded);
   return {result,dispatchReady:false,modelDispatched:false,publishableResearch:false,controllerReportOnly:true};
  }
 });
}
