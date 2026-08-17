'use strict';

const { canonicalJson, invariant, sha256 } = require('./codec');

const SHA256 = /^[0-9a-f]{64}$/u;
const TERMINAL_STATUSES = Object.freeze(['complete', 'provider_failed', 'auth_failed', 'missing_endpoint']);

function freezeJson(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) freezeJson(child);
  return Object.freeze(value);
}

function wholeSecond(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  invariant(Number.isFinite(parsed.getTime()), 'provider acquisition timestamp');
  return parsed.toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

function providerRequestKey({ provider, stage, sourceCutoff, requestMaterial }) {
  invariant(typeof provider === 'string' && /^[a-z0-9_]{2,40}$/u.test(provider), 'provider identity');
  invariant(typeof stage === 'string' && /^[a-z_]{2,40}$/u.test(stage), 'provider stage');
  invariant(typeof sourceCutoff === 'string' && Number.isFinite(Date.parse(sourceCutoff)), 'provider cutoff');
  return sha256(canonicalJson(['provider-acquisition-request-v3.16.21', provider, stage,
    wholeSecond(sourceCutoff), requestMaterial]));
}

function captureProviderResponses(fetchImpl, observations) {
  invariant(typeof fetchImpl === 'function' && Array.isArray(observations), 'provider capture transport');
  return async (input, init = {}) => {
    const response = await fetchImpl(input, init);
    invariant(typeof response?.arrayBuffer === 'function', 'provider response body unavailable');
    // Capture before parsing so json(), text(), arrayBuffer() and streaming callers
    // all commit to the same immutable bytes.  Returning a reconstructed Response
    // prevents a native method from bypassing a Proxy override of arrayBuffer().
    const bytes = Buffer.from(await response.arrayBuffer());
    observations.push(Object.freeze({
      ordinal: observations.length,
      statusCode: Number.isInteger(response.status) ? response.status : response.ok ? 200 : 0,
      byteCount: bytes.length,
      sha256: sha256(bytes),
    }));
    const status=Number.isInteger(response.status)?response.status:200;
    const body=[204,205,304].includes(status)?null:bytes;
    return new Response(body, { status, statusText:response.statusText, headers:response.headers });
  };
}

function aggregateResponseEvidence(observations) {
  invariant(Array.isArray(observations) && observations.length <= 4096, 'provider response evidence bound');
  const rows = observations.map((row, ordinal) => {
    invariant(row?.ordinal === ordinal && Number.isInteger(row.statusCode) && row.statusCode >= 0
      && Number.isInteger(row.byteCount) && row.byteCount >= 0 && SHA256.test(row.sha256),
    'provider response evidence');
    return [ordinal, row.statusCode, row.byteCount, row.sha256];
  });
  return Object.freeze({
    responseCount: rows.length,
    responseBytes: rows.reduce((sum, row) => sum + row[2], 0),
    responseSha256: sha256(canonicalJson(['provider-response-set-v3.16.21', rows])),
  });
}

function normalizedProviderEnvelope({ provider, requestKey, runId, stage, sourceCutoff, fetchedAt,
  responseEvidence, normalizedPayload, terminalStatus = 'complete', actionEligible = true }) {
  invariant(typeof provider === 'string' && /^[a-z0-9_]{2,40}$/u.test(provider)
    && SHA256.test(requestKey) && typeof runId === 'string'
    && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(runId)
    && typeof stage === 'string' && /^[a-z_]{2,40}$/u.test(stage), 'provider envelope identity');
  invariant(typeof sourceCutoff === 'string' && Number.isFinite(Date.parse(sourceCutoff))
    && (typeof fetchedAt === 'string' || fetchedAt instanceof Date) && Number.isFinite(new Date(fetchedAt).getTime()),
  'provider envelope timestamps');
  invariant(responseEvidence && SHA256.test(responseEvidence.responseSha256)
    && Number.isInteger(responseEvidence.responseBytes) && responseEvidence.responseBytes >= 0
    && responseEvidence.responseBytes <= 67_108_864, 'provider response evidence');
  invariant(normalizedPayload && typeof normalizedPayload === 'object' && !Array.isArray(normalizedPayload),
    'provider normalized payload');
  invariant(TERMINAL_STATUSES.includes(terminalStatus), 'provider terminal status');
  const normalizedPayloadCanonical=canonicalJson(normalizedPayload);
  invariant(Buffer.byteLength(normalizedPayloadCanonical,'utf8')<=67_108_864,'provider normalized payload bound');
  const stablePayload=freezeJson(JSON.parse(normalizedPayloadCanonical));
  const normalizedPayloadSha256 = sha256(normalizedPayloadCanonical);
  const effectiveActionEligible=terminalStatus === 'complete' && actionEligible === true;
  const material = ['provider-acquisition-revision-v3.16.21', provider, requestKey, runId, stage,
    wholeSecond(sourceCutoff), wholeSecond(fetchedAt), responseEvidence.responseSha256,
    responseEvidence.responseBytes, normalizedPayloadSha256, terminalStatus, effectiveActionEligible];
  return Object.freeze({
    schema: 'provider-acquisition-revision-v3.16.21', provider, requestKey, runId, stage,
    sourceCutoff: wholeSecond(sourceCutoff), fetchedAt: wholeSecond(fetchedAt),
    responseSha256: responseEvidence.responseSha256, responseBytes: responseEvidence.responseBytes,
    normalizedPayloadSha256, normalizedPayload:stablePayload, terminalStatus,
    evidenceRoot: sha256(canonicalJson(material)),
    actionEligible: effectiveActionEligible,
  });
}

function validateStoredProviderEnvelope(value, expected = {}) {
  if (!value || value.schema !== 'provider-acquisition-revision-v3.16.21'
    || !/^[a-z0-9_]{2,40}$/u.test(value.provider ?? '') || !SHA256.test(value.requestKey ?? '')
    || typeof value.runId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value.runId)
    || typeof value.stage !== 'string' || !/^[a-z_]{2,40}$/u.test(value.stage)
    || !Number.isFinite(Date.parse(value.sourceCutoff ?? '')) || !Number.isFinite(Date.parse(value.fetchedAt ?? ''))
    || !SHA256.test(value.responseSha256 ?? '') || !Number.isInteger(value.responseBytes)
    || value.responseBytes < 0 || value.responseBytes > 67_108_864
    || !SHA256.test(value.normalizedPayloadSha256 ?? '')
    || sha256(canonicalJson(value.normalizedPayload)) !== value.normalizedPayloadSha256
    || !TERMINAL_STATUSES.includes(value.terminalStatus)
    || typeof value.actionEligible !== 'boolean'
    || (value.terminalStatus !== 'complete' && value.actionEligible !== false)
    || typeof value.evidenceRoot !== 'string' || !SHA256.test(value.evidenceRoot)) return null;
  if (expected.provider && value.provider !== expected.provider) return null;
  if (expected.requestKey && value.requestKey !== expected.requestKey) return null;
  if (expected.sourceCutoff && wholeSecond(value.sourceCutoff) !== wholeSecond(expected.sourceCutoff)) return null;
  const rebuilt = normalizedProviderEnvelope({
    provider: value.provider, requestKey: value.requestKey, runId: value.runId, stage: value.stage,
    sourceCutoff: value.sourceCutoff, fetchedAt: value.fetchedAt,
    responseEvidence: { responseSha256:value.responseSha256, responseBytes:value.responseBytes },
    normalizedPayload: value.normalizedPayload, terminalStatus: value.terminalStatus,
    actionEligible: value.actionEligible === true,
  });
  return rebuilt.evidenceRoot === value.evidenceRoot ? rebuilt : null;
}

function providerEnvelopeEligibleAt(value, evaluationTimestamp) {
  const envelope=validateStoredProviderEnvelope(value);
  return Boolean(envelope&&envelope.actionEligible===true
    &&Number.isFinite(Date.parse(evaluationTimestamp??''))
    &&Date.parse(evaluationTimestamp)>=Date.parse(envelope.fetchedAt));
}

async function acquireFrozenProviderEnvelope({ provider, stage, sourceCutoff, requestMaterial, claim,
  readFrozen, freeze, fetchImpl = globalThis.fetch, acquire, now = () => new Date(), actionEligible = true }) {
  invariant(claim && typeof claim.runId === 'string' && typeof claim.jobId === 'string'
    && typeof claim.ownerToken === 'string', 'provider acquisition claim');
  invariant(typeof readFrozen === 'function' && typeof freeze === 'function' && typeof acquire === 'function',
    'provider acquisition persistence');
  const requestKey = providerRequestKey({ provider, stage, sourceCutoff, requestMaterial });
  const prior = validateStoredProviderEnvelope(await readFrozen({ provider, requestKey, sourceCutoff }),
    { provider, requestKey, sourceCutoff });
  if (prior) return Object.freeze({ disposition:'reused', envelope:prior });

  const observations = [];
  const collectionStartedAt = wholeSecond(now());
  let normalizedPayload;
  let terminalStatus = 'complete';
  try {
    normalizedPayload = await acquire({
      fetchImpl:captureProviderResponses(fetchImpl, observations),
      collectionStartedAt,
    });
  } catch (error) {
    terminalStatus = 'provider_failed';
    normalizedPayload = Object.freeze({
      schema:'provider-acquisition-failure-v3.16.21',
      invariantCode: typeof error?.invariantCode === 'string' ? error.invariantCode : 'provider_acquisition_failed',
    });
  }
  const fetchedAt = wholeSecond(now());
  const responseEvidence = aggregateResponseEvidence(observations);
  const candidate = normalizedProviderEnvelope({ provider, requestKey, runId:claim.runId, stage,
    sourceCutoff, fetchedAt, responseEvidence, normalizedPayload, terminalStatus,
    actionEligible: actionEligible === true });
  const persisted = await freeze({ ...candidate, jobId:claim.jobId, ownerToken:claim.ownerToken });
  invariant(persisted?.disposition !== 'conflict', 'provider acquisition conflict');
  invariant(['appended','reused'].includes(persisted?.disposition), 'provider acquisition persistence disposition');
  const selected = validateStoredProviderEnvelope(persisted?.envelope ?? candidate,
    { provider, requestKey, sourceCutoff });
  invariant(selected, 'provider acquisition persistence mismatch');
  return Object.freeze({ disposition:persisted?.disposition ?? 'appended', envelope:selected });
}

module.exports = { TERMINAL_STATUSES, acquireFrozenProviderEnvelope, aggregateResponseEvidence,
  captureProviderResponses, normalizedProviderEnvelope, providerEnvelopeEligibleAt, providerRequestKey,
  validateStoredProviderEnvelope, wholeSecond };
