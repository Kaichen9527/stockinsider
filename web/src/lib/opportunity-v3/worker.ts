import { canonicalJson, canonicalResponse, sha256Canonical } from './canonical';
import { exactObject, fixedRunnerPrincipal, readBoundedJson, requireExactInternalBearer } from './internal';
import { getOpportunityV3ServerClient, OpportunityV3ServiceUnavailable } from './service-client';
import { isPreFunctionCredentialRejectionV3 } from './remote-credential';
import { executeWorkerPayload } from './worker-executors';

const ERROR = 'opportunity_worker_request_rejected';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const OUTPUT_KIND: Record<string, string> = {
  source_parse_batch: 'source_parse_batch',
  source_connector_summary: 'source_connector_summary',
  market_context_snapshot: 'market_context_snapshot',
  shallow_candidate_batch: 'shallow_candidate_batch',
  sector_cycle_batch: 'sector_cycle_batch',
  deep_candidate_batch: 'deep_candidate_batch',
  portfolio_allocation_batch: 'portfolio_allocation_batch',
  projection_bundle: 'projection_bundle',
  outcome_batch: 'outcome_batch',
  evaluation_bundle: 'evaluation_bundle',
};

const READ_KIND: Record<string, string> = {
  manifest_page: 'manifest_page_rows',
  manifest_root: 'manifest_root_pages',
  source_parse_batch: 'source_parse_rows',
  source_connector_summary: 'source_connector_accounting',
  market_context_snapshot: 'market_context_rows',
  shallow_candidate_batch: 'shallow_candidate_rows',
  sector_cycle_batch: 'sector_cycle_rows',
  deep_candidate_batch: 'deep_candidate_rows',
  portfolio_allocation_batch: 'portfolio_rows',
  projection_bundle: 'projection_rows',
  outcome_batch: 'outcome_computation_rows',
  evaluation_bundle: 'evaluation_computation_summary',
};

function emptyCounts() {
  return {
    manifest_row_count: 0,
    connector_accounting_count: 0,
    source_document_count: 0,
    claim_count: 0,
    mention_count: 0,
    candidate_count: 0,
    deep_success_candidate_count: 0,
    deep_failure_candidate_count: 0,
    market_snapshot_count: 0,
    sector_snapshot_count: 0,
    score_snapshot_count: 0,
    outcome_count: 0,
    public_projection_count: 0,
    detail_projection_count: 0,
    evaluation_result_count: 0,
    warning_count: 0,
  };
}

function error(code: string, status: number) {
  return canonicalResponse({ code, error: ERROR }, status);
}

function empty204() {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function runOpportunityWorker(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'POST') {
    return canonicalResponse(
      { code: 'method_not_allowed', error: ERROR },
      405,
      { Allow: 'POST' },
    );
  }
  if (url.search) return error('invalid_request', 422);
  const parsed = await readBoundedJson(request, 128);
  if (!parsed || !exactObject(parsed.value, ['runId']) || typeof parsed.value.runId !== 'string' || !UUID.test(parsed.value.runId)) {
    return error('invalid_request', 422);
  }
  if (!requireExactInternalBearer(request)) return error('authentication_rejected', 403);
  const principal = fixedRunnerPrincipal();
  if (!principal) return error('authentication_rejected', 403);
  try {
    const client = getOpportunityV3ServerClient();
    const claim = await client.rpc('claim_opportunity_job_v3', { run_id: parsed.value.runId, worker_principal: principal });
    if (claim.error) return credentialOrInternal(claim.error, claim.status);
    if (!Array.isArray(claim.data) || claim.data.length === 0) return empty204();
    if (claim.data.length !== 1) return error('worker_internal_error', 500);
    const job = claim.data[0] as Record<string, unknown>;
    if (
      typeof job.job_id !== 'string' ||
      typeof job.stage !== 'string' ||
      typeof job.input_hash !== 'string' ||
      typeof job.owner_token !== 'string' ||
      typeof job.payload_kind !== 'string'
    ) return error('worker_internal_error', 500);
    const payload = decodeClaimPayload(job, parsed.value.runId);
    if (!payload) return error('worker_internal_error', 500);
    if (job.payload_kind === 'finalize') {
      const finalized = await client.rpc('finalize_opportunity_run_v3', { job_id: job.job_id, owner_token: job.owner_token });
      if (finalized.error) return credentialOrInternal(finalized.error, finalized.status);
      if (!Array.isArray(finalized.data) || finalized.data.length !== 1) return error('worker_internal_error', 500);
      return canonicalResponse({
        jobId: job.job_id,
        runId: parsed.value.runId,
        runStatus: finalized.data[0].status,
        stage: job.stage,
        status: 'job_succeeded',
      });
    }
    if (job.payload_kind === 'manifest_header') {
      const body = payload[5] as unknown[];
      const created = await client.rpc('create_opportunity_manifest_v3', {
        job_id: job.job_id, owner_token: job.owner_token, requested_manifest_id: body[1],
        manifest_kind: body[2], contract_version: body[3], source_cutoff: body[4],
        header_canonical: bytea(body[5]), header_json: body[5],
      });
      if (created.error || !single(created.data)) {
        return credentialOrInternal(created.error ?? {}, created.status);
      }
      return workerSuccess(job, parsed.value.runId);
    }
    if (job.payload_kind === 'seal') {
      const sealed = await client.rpc('seal_opportunity_run_inputs_v3', {
        requested_run_id: parsed.value.runId, owner_token: job.owner_token,
      });
      if (sealed.error || !single(sealed.data)) {
        return credentialOrInternal(sealed.error ?? {}, sealed.status);
      }
      return workerSuccess(job, parsed.value.runId, typeof sealed.data[0].status === 'string' ? sealed.data[0].status : 'running');
    }
    const read = await client
      .from('opportunity_worker_read_units_v3')
      .select('job_id,input_hash,read_kind,read_canonical,read_json,read_hash')
      .eq('job_id', job.job_id)
      .eq('input_hash', job.input_hash)
      .limit(2);
    if (read.error) return credentialOrInternal(read.error, read.status);
    if (!read.data || read.data.length !== 1) return error('worker_internal_error', 500);
    const readBody = decodeReadEnvelope(read.data[0] as Record<string, unknown>, job, parsed.value.runId);
    if (readBody === null) return error('worker_internal_error', 500);
    if (job.payload_kind === 'manifest_page') {
      const body = payload[5] as unknown[];
      if (
        !Array.isArray(readBody) ||
        readBody.length !== 2 ||
        !(readBody[0] === null || Array.isArray(readBody[0])) ||
        !Array.isArray(readBody[1])
      ) {
        return failExpectedManifest(client, job, parsed.value.runId, body[1], 'bound_violation');
      }
      const nativeRows = readBody[1];
      if (nativeRows.length === 0 || nativeRows.length > 2_001) {
        return failExpectedManifest(client, job, parsed.value.runId, body[1], 'bound_violation');
      }
      const firstRowOrdinal = Number(body[7]);
      const pageOrdinal = Number(body[6]);
      if (
        !Number.isSafeInteger(firstRowOrdinal) ||
        firstRowOrdinal < 0 ||
        !Number.isSafeInteger(pageOrdinal) ||
        pageOrdinal < 0
      ) {
        return failExpectedManifest(client, job, parsed.value.runId, body[1], 'data_integrity_failure');
      }
      if (pageOrdinal === 0) {
        if (readBody[0] !== null || body[8] !== null || body[9] !== null || body[10] !== null) {
          return failExpectedManifest(client, job, parsed.value.runId, body[1], 'data_integrity_failure');
        }
      } else {
        const previous = readBody[0];
        if (
          !Array.isArray(previous) ||
          previous.length !== 3 ||
          previous[0] !== body[8] ||
          previous[1] !== body[9]
        ) {
          return failExpectedManifest(client, job, parsed.value.runId, body[1], 'data_integrity_failure');
        }
        const previousPayloadHash = sha256Canonical(previous[2]);
        const previousIdentity = sha256Canonical([
          'opportunity-manifest-row-identity-v3.3',
          body[2],
          body[5],
          firstRowOrdinal - 1,
          previousPayloadHash,
        ]);
        if (previousIdentity !== body[10]) {
          return failExpectedManifest(client, job, parsed.value.runId, body[1], 'data_integrity_failure');
        }
      }
      const rows: Array<{
        row_ordinal: number;
        identity_key: string;
        terminal_code: string | null;
        payload_canonical: string;
        payload_json: unknown;
        payload_hash: string;
      }> = [];
      for (const nativeRow of nativeRows.slice(0, 2_000)) {
        const index = rows.length;
        const rowOrdinal = firstRowOrdinal + index;
        const payloadCanonical = canonicalJson(nativeRow);
        const payloadHash = sha256Canonical(nativeRow);
        const identityKey = sha256Canonical([
          'opportunity-manifest-row-identity-v3.3',
          body[2],
          body[5],
          rowOrdinal,
          payloadHash,
        ]);
        const nextRow = {
          row_ordinal: rowOrdinal,
          identity_key: identityKey,
          terminal_code: terminalCode(body[2], body[4], nativeRow),
          payload_canonical: `\\x${Buffer.from(payloadCanonical).toString('hex')}`,
          payload_json: nativeRow,
          payload_hash: payloadHash,
        };
        const candidateRows = [...rows, nextRow];
        const candidatePreimage = [
          'opportunity-manifest-page-v3.3',
          body[2],
          body[3],
          body[4],
          body[5],
          pageOrdinal,
          body[7],
          candidateRows.map((row) => [
            row.row_ordinal,
            row.identity_key,
            row.terminal_code,
            row.payload_json,
          ]),
        ];
        if (Buffer.byteLength(canonicalJson(candidatePreimage)) > 786_432) {
          if (rows.length === 0) {
            return failExpectedManifest(client, job, parsed.value.runId, body[1], 'bound_violation');
          }
          break;
        }
        rows.push(nextRow);
      }
      const pagePreimage = [
        'opportunity-manifest-page-v3.3',
        body[2],
        body[3],
        body[4],
        body[5],
        pageOrdinal,
        body[7],
        rows.map((row) => [
          row.row_ordinal,
          row.identity_key,
          row.terminal_code,
          row.payload_json,
        ]),
      ];
      let pageCanonical: string;
      try {
        pageCanonical = canonicalJson(pagePreimage);
      } catch {
        return failExpectedManifest(client, job, parsed.value.runId, body[1], 'data_integrity_failure');
      }
      const appended = await client.rpc('append_opportunity_manifest_page_v3', {
        job_id: job.job_id, owner_token: job.owner_token, requested_manifest_id: body[1],
        section_key: body[5], page_ordinal: body[6], first_row_ordinal: body[7],
        page_canonical: `\\x${Buffer.from(pageCanonical).toString('hex')}`,
        page_json: pagePreimage, requested_page_hash: sha256Canonical(pagePreimage), rows,
      });
      if (appended.error || !single(appended.data)) {
        return credentialOrInternal(appended.error ?? {}, appended.status);
      }
      return workerSuccess(job, parsed.value.runId);
    }
    if (job.payload_kind === 'manifest_root') {
      const body = payload[5] as unknown[];
      if (
        !Array.isArray(readBody) ||
        readBody.length !== 2 ||
        !Array.isArray(readBody[0]) ||
        !Array.isArray(readBody[1])
      ) {
        return failExpectedManifest(client, job, parsed.value.runId, body[1], 'bound_violation');
      }
      const sectionDescriptors = readBody[1];
      let rootCanonical: string;
      let rootPreimage: unknown[];
      let rowCount: number;
      try {
        rowCount = sectionDescriptors.reduce((sum, descriptor) => {
          if (
            !Array.isArray(descriptor) ||
            descriptor.length !== 3 ||
            typeof descriptor[0] !== 'string' ||
            !Number.isSafeInteger(descriptor[1]) ||
            Number(descriptor[1]) < 0 ||
            !Array.isArray(descriptor[2])
          ) throw new TypeError('invalid manifest root descriptor');
          return sum + Number(descriptor[1]);
        }, 0);
        rootPreimage = [
          'opportunity-manifest-root-v3.3',
          body[2],
          body[3],
          body[4],
          readBody[0],
          sectionDescriptors,
        ];
        rootCanonical = canonicalJson(rootPreimage);
      } catch {
        return failExpectedManifest(client, job, parsed.value.runId, body[1], 'data_integrity_failure');
      }
      const completed = await client.rpc('complete_opportunity_manifest_v3', {
        job_id: job.job_id, owner_token: job.owner_token, requested_manifest_id: body[1],
        requested_row_count: rowCount,
        root_canonical: `\\x${Buffer.from(rootCanonical).toString('hex')}`,
        root_json: rootPreimage, requested_manifest_hash: sha256Canonical(rootPreimage),
      });
      if (completed.error || !single(completed.data)) {
        return credentialOrInternal(completed.error ?? {}, completed.status);
      }
      return workerSuccess(job, parsed.value.runId);
    }
    const outputKind = OUTPUT_KIND[job.payload_kind];
    if (!outputKind) return error('worker_internal_error', 500);
    let outputBody;
    try {
      outputBody = executeWorkerPayload(job.payload_kind, readBody, {
        runId: parsed.value.runId,
      });
    } catch (caught) {
      if (caught instanceof TypeError) {
        return failExpectedJob(client, job, parsed.value.runId, 'bound_violation');
      }
      return failExpectedJob(client, job, parsed.value.runId, 'provider_unavailable');
    }
    const warnings: string[] = [];
    const output = ['opportunity-job-output-v3.3', outputKind, parsed.value.runId, job.job_id, job.input_hash, outputBody, warnings];
    const outputCanonical = canonicalJson(output);
    const outputHash = sha256Canonical(output);
    const counts = outputCounts(outputKind, outputBody);
    const staged = await client.rpc('stage_opportunity_job_output_v3', {
      job_id: job.job_id,
      owner_token: job.owner_token,
      output_kind: outputKind,
      output_canonical: `\\x${Buffer.from(outputCanonical).toString('hex')}`,
      output_json: output,
      output_hash: outputHash,
      counts,
    });
    if (staged.error) return credentialOrInternal(staged.error, staged.status);
    const completed = await client.rpc('complete_opportunity_job_v3', {
      job_id: job.job_id,
      owner_token: job.owner_token,
      output_hash: outputHash,
      counts,
    });
    if (completed.error) return credentialOrInternal(completed.error, completed.status);
    if (!Array.isArray(completed.data) || completed.data.length !== 1) return error('worker_internal_error', 500);
    return canonicalResponse({
      jobId: job.job_id,
      runId: parsed.value.runId,
      runStatus: 'running',
      stage: job.stage,
      status: 'job_succeeded',
    });
  } catch (caught) {
    return caught instanceof OpportunityV3ServiceUnavailable ? error('v3_service_role_unavailable', 503) : error('worker_internal_error', 500);
  }
}

function decodeClaimPayload(job: Record<string, unknown>, runId: string): unknown[] | null {
  if (!Array.isArray(job.payload_json)) return null;
  const payload = job.payload_json;
  if (
    payload.length !== 6 ||
    payload[0] !== 'opportunity-job-payload-v3.3' ||
    payload[1] !== job.payload_kind ||
    payload[2] !== runId ||
    payload[3] !== job.stage ||
    typeof payload[4] !== 'string' ||
    !Array.isArray(payload[5])
  ) return null;
  const canonical = canonicalJson(payload);
  if (decodeBytea(job.payload_canonical) !== canonical || job.payload_hash !== sha256Canonical(payload)) return null;
  return payload;
}

function decodeBytea(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.startsWith('\\x') ? Buffer.from(value.slice(2), 'hex').toString('utf8') : value;
}

function bytea(value: unknown): string {
  return `\\x${Buffer.from(canonicalJson(value)).toString('hex')}`;
}

function terminalCode(kind: unknown, sourceCutoff: unknown, nativeRow: unknown): string | null {
  if (!Array.isArray(nativeRow) || typeof kind !== 'string' || typeof sourceCutoff !== 'string') {
    return null;
  }
  const layout: Record<string, { status: number; validTo: number }> = {
    source_identity_allowlist: { status: 7, validTo: 6 },
    publisher_verification_allowlist: { status: 10, validTo: 7 },
    instrument_roster: { status: 5, validTo: 10 },
    alias_authority: { status: 9, validTo: 8 },
    taxonomy_assignment: { status: 10, validTo: 8 },
    peer_reviewer_allowlist: { status: 5, validTo: 4 },
  };
  const owner = layout[kind];
  if (!owner) return null;
  const status = nativeRow[owner.status];
  const validTo = nativeRow[owner.validTo];
  const cutoffMs = Date.parse(sourceCutoff);
  const validToMs = typeof validTo === 'string' ? Date.parse(validTo) : Number.NaN;
  const active = status === 'active'
    && (validTo === null
      || (Number.isFinite(cutoffMs) && Number.isFinite(validToMs) && cutoffMs < validToMs));
  return active ? 'effective_active' : 'revoked_or_expired';
}

function single(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.length === 1;
}

function decodeReadEnvelope(
  row: Record<string, unknown>,
  job: Record<string, unknown>,
  runId: string,
): unknown | null {
  if (
    !exactObject(row, ['job_id', 'input_hash', 'read_kind', 'read_canonical', 'read_json', 'read_hash']) ||
    typeof job.payload_kind !== 'string' ||
    row.job_id !== job.job_id ||
    row.input_hash !== job.input_hash ||
    row.read_kind !== READ_KIND[job.payload_kind] ||
    !Array.isArray(row.read_json) ||
    row.read_json.length !== 6 ||
    row.read_json[0] !== 'opportunity-worker-read-v3.4' ||
    row.read_json[1] !== row.read_kind ||
    row.read_json[2] !== runId ||
    row.read_json[3] !== job.job_id ||
    row.read_json[4] !== job.input_hash
  ) return null;
  const canonical = canonicalJson(row.read_json);
  if (decodeBytea(row.read_canonical) !== canonical || row.read_hash !== sha256Canonical(row.read_json)) return null;
  return row.read_json[5];
}

function workerSuccess(job: Record<string, unknown>, runId: string, runStatus = 'running'): Response {
  return canonicalResponse({
    jobId: job.job_id,
    runId,
    runStatus,
    stage: job.stage,
    status: 'job_succeeded',
  });
}

function outputCounts(outputKind: string, body: unknown) {
  const counts = emptyCounts();
  const rows = Array.isArray(body) ? body : [];
  if (outputKind === 'source_parse_batch') {
    counts.source_document_count = Array.isArray(rows[0]) ? rows[0].length : 0;
    counts.claim_count = Array.isArray(rows[1]) ? rows[1].length : 0;
    counts.mention_count = Array.isArray(rows[2]) ? rows[2].length : 0;
  } else if (outputKind === 'source_connector_summary') counts.connector_accounting_count = 1;
  else if (outputKind === 'market_context_snapshot') counts.market_snapshot_count = 1;
  else if (outputKind === 'sector_cycle_batch') counts.sector_snapshot_count = rows.length;
  else if (outputKind === 'shallow_candidate_batch') counts.candidate_count = rows.length;
  else if (outputKind === 'deep_candidate_batch') {
    counts.candidate_count = rows.length;
    counts.deep_success_candidate_count = rows.filter((row) => Array.isArray(row) && row.at(-1) === null).length;
    counts.deep_failure_candidate_count = counts.candidate_count - counts.deep_success_candidate_count;
  } else if (outputKind === 'portfolio_allocation_batch') counts.candidate_count = rows.length;
  else if (outputKind === 'projection_bundle') {
    counts.candidate_count = Array.isArray(rows[0]) ? rows[0].length : 0;
    counts.public_projection_count = 1;
    counts.detail_projection_count = Array.isArray(rows[2]) ? rows[2].length : 0;
    counts.score_snapshot_count = counts.detail_projection_count * 3;
  } else if (outputKind === 'outcome_batch') counts.outcome_count = rows.length;
  else if (outputKind === 'evaluation_bundle') counts.evaluation_result_count = 1;
  return counts;
}

function credentialOrInternal(
  remoteError: { code?: string; message?: string },
  remoteStatus: number,
): Response {
  return isPreFunctionCredentialRejectionV3(remoteStatus, remoteError)
    ? error('v3_service_role_unavailable', 503)
    : error('worker_internal_error', 500);
}

async function failExpectedJob(
  client: ReturnType<typeof getOpportunityV3ServerClient>,
  job: Record<string, unknown>,
  runId: string,
  failureCode: 'bound_violation' | 'provider_unavailable' | 'data_integrity_failure',
): Promise<Response> {
  const failed = await client.rpc('fail_opportunity_job_v3', {
    job_id: job.job_id,
    owner_token: job.owner_token,
    failure_code: failureCode,
  });
  if (failed.error) return credentialOrInternal(failed.error, failed.status);
  if (!single(failed.data) || !['retryable', 'failed'].includes(String(failed.data[0].status))) {
    return error('worker_internal_error', 500);
  }
  const retryable = failed.data[0].status === 'retryable';
  return canonicalResponse({
    failureCode,
    jobId: job.job_id,
    runId,
    stage: job.stage,
    status: retryable ? 'job_retryable' : 'run_failed',
  }, retryable ? 202 : 409);
}

async function failExpectedManifest(
  client: ReturnType<typeof getOpportunityV3ServerClient>,
  job: Record<string, unknown>,
  runId: string,
  manifestId: unknown,
  failureCode: 'bound_violation' | 'provider_unavailable' | 'data_integrity_failure',
): Promise<Response> {
  if (typeof manifestId !== 'string') return error('worker_internal_error', 500);
  const failed = await client.rpc('fail_opportunity_manifest_v3', {
    job_id: job.job_id,
    owner_token: job.owner_token,
    requested_manifest_id: manifestId,
    requested_failure_code: failureCode,
  });
  if (failed.error) return credentialOrInternal(failed.error, failed.status);
  if (!single(failed.data) || failed.data[0].status !== 'failed') return error('worker_internal_error', 500);
  return canonicalResponse({
    failureCode,
    jobId: job.job_id,
    runId,
    stage: job.stage,
    status: 'run_failed',
  }, 409);
}
