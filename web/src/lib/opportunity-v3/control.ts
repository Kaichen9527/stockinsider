import { assertWholeSecondUtc, canonicalResponse } from './canonical.ts';
import { getOpportunityV3ServerClient, OpportunityV3ServiceUnavailable } from './service-client.ts';
import { exactObject, fixedRunnerPrincipal, readBoundedJson, requireExactInternalBearer } from './internal.ts';
import { isPreFunctionCredentialRejectionV3 } from './remote-credential.ts';
import type { OpportunityModeV3 } from './contracts.ts';

const ERROR = 'opportunity_control_request_rejected';
const MODES: OpportunityModeV3[] = ['source_scan', 'enrich_rank', 'label_outcomes', 'shadow_evaluate'];

function error(code: string, status: number) {
  return canonicalResponse({ code, error: ERROR }, status);
}

export function controlMethodNotAllowed(allow: 'GET' | 'POST'): Response {
  return canonicalResponse(
    { code: 'method_not_allowed', error: ERROR },
    405,
    { Allow: allow },
  );
}

function hasBodyFraming(request: Request): boolean {
  const contentLength = request.headers.get('content-length');
  return (
    (contentLength !== null && contentLength !== '0') ||
    request.headers.has('transfer-encoding') ||
    request.body !== null
  );
}

function mapBeginError(
  remoteError: { code?: string; message?: string },
  remoteStatus: number,
): Response {
  if (remoteError.code === 'PT422' && remoteError.message === 'future_source_cutoff') {
    return error('future_source_cutoff', 422);
  }
  if (
    remoteError.code === 'PT409' &&
    ['missing_source_run', 'multiple_source_runs', 'bound_violation'].includes(remoteError.message ?? '')
  ) return error(remoteError.message as string, 409);
  if (
    remoteError.code === 'PT409' &&
    ['data_integrity_failure', 'calendar_authority_mismatch'].includes(remoteError.message ?? '')
  ) return error('control_integrity_failure', 409);
  if (remoteError.code === 'PT403' && remoteError.message === 'principal_role_unavailable') {
    return error('authentication_rejected', 403);
  }
  if (isPreFunctionCredentialRejectionV3(remoteStatus, remoteError)) {
    return error('v3_service_role_unavailable', 503);
  }
  return error('control_internal_error', 500);
}

function validBeginResult(row: Record<string, unknown>): boolean {
  if (
    typeof row.run_id !== 'string' ||
    typeof row.attempt_run_id !== 'string' ||
    typeof row.status !== 'string' ||
    typeof row.disposition !== 'string'
  ) return false;
  const sameIds = row.run_id === row.attempt_run_id;
  if (row.disposition === 'created') return sameIds && row.status === 'preparing';
  if (row.disposition === 'existing_active') {
    return sameIds && ['preparing', 'running'].includes(row.status);
  }
  return row.disposition === 'existing_success' && sameIds && row.status === 'success';
}

export async function beginAdHocRun(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'POST') return controlMethodNotAllowed('POST');
  if (url.search) return error('invalid_request', 422);
  const contentType = request.headers.get('content-type');
  const contentLength = request.headers.get('content-length');
  if (
    contentType?.toLowerCase() !== 'application/json' ||
    (contentLength !== null && (
      !/^(?:0|[1-9][0-9]*)$/u.test(contentLength) ||
      Number(contentLength) > 192
    ))
  ) return error('invalid_request', 422);
  if (!requireExactInternalBearer(request)) return error('authentication_rejected', 403);
  const parsed = await readBoundedJson(request, 192);
  if (!parsed || !exactObject(parsed.value, ['mode', 'sourceCutoff'])) return error('invalid_request', 422);
  const body = parsed.value;
  if (typeof body.mode !== 'string' || !MODES.includes(body.mode as OpportunityModeV3) || typeof body.sourceCutoff !== 'string') {
    return error('invalid_request', 422);
  }
  try {
    assertWholeSecondUtc(body.sourceCutoff);
  } catch {
    return error('invalid_request', 422);
  }
  const principal = fixedRunnerPrincipal();
  if (!principal) return error('authentication_rejected', 403);
  const purpose =
    body.mode === 'label_outcomes' ? 'outcome_label_daily'
      : body.mode === 'shadow_evaluate' ? 'shadow_evaluation_daily'
        : 'ad_hoc_shadow';
  try {
    const client = getOpportunityV3ServerClient();
    const begun = await client.rpc('begin_opportunity_run_v3', {
      mode: body.mode,
      run_purpose: purpose,
      source_cutoff: body.sourceCutoff,
      expected_taiwan_session_authority_hash: null,
      caller_principal: principal,
    });
    const { data, error: rpcError } = begun;
    if (rpcError) return mapBeginError(rpcError, begun.status);
    if (!Array.isArray(data) || data.length !== 1) return error('control_integrity_failure', 409);
    const row = data[0] as Record<string, unknown>;
    if (!validBeginResult(row)) return error('control_integrity_failure', 409);
    const runId = row.run_id as string;
    const attemptRunId = row.attempt_run_id as string;
    return canonicalResponse({
      attemptRunId,
      disposition: row.disposition,
      runId,
      status: row.status,
      statusRef: `/api/internal/opportunity-run/status/${attemptRunId}`,
    }, 202);
  } catch (caught) {
    return error(caught instanceof OpportunityV3ServiceUnavailable ? 'v3_service_role_unavailable' : 'control_internal_error', caught instanceof OpportunityV3ServiceUnavailable ? 503 : 500);
  }
}

export async function readRunStatus(request: Request, runId: string): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET') return controlMethodNotAllowed('GET');
  if (url.search || hasBodyFraming(request) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(runId)) {
    return error('invalid_request', 422);
  }
  if (!requireExactInternalBearer(request)) return error('authentication_rejected', 403);
  try {
    const query = await getOpportunityV3ServerClient()
      .from('opportunity_run_status_read_v3')
      .select('run_id,status,failure_code,canonical_run_id')
      .eq('run_id', runId)
      .limit(2);
    const { data, error: queryError } = query;
    if (queryError && isPreFunctionCredentialRejectionV3(query.status, queryError)) {
      return error('v3_service_role_unavailable', 503);
    }
    if (queryError) return error('control_internal_error', 500);
    if (!data?.length) return error('run_not_found', 404);
    if (data.length !== 1) return error('control_integrity_failure', 409);
    const row = data[0];
    if (
      row.run_id !== runId ||
      !['preparing', 'running', 'success', 'failed', 'converged'].includes(String(row.status)) ||
      (row.status === 'converged') !== (typeof row.canonical_run_id === 'string') ||
      (row.status === 'failed') !== (typeof row.failure_code === 'string') ||
      (row.status !== 'converged' && row.canonical_run_id !== null) ||
      (row.status !== 'failed' && row.failure_code !== null)
    ) return error('control_integrity_failure', 409);
    return canonicalResponse({
      canonicalRunId: row.canonical_run_id,
      failureCode: row.failure_code,
      runId: row.run_id,
      status: row.status,
    });
  } catch (caught) {
    return error(caught instanceof OpportunityV3ServiceUnavailable ? 'v3_service_role_unavailable' : 'control_internal_error', caught instanceof OpportunityV3ServiceUnavailable ? 503 : 500);
  }
}

export async function beginCronRun(
  request: Request,
  mode: OpportunityModeV3,
  purpose: 'production_shadow_daily' | 'outcome_label_daily' | 'shadow_evaluation_daily',
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET') return controlMethodNotAllowed('GET');
  if (url.search || hasBodyFraming(request)) return error('invalid_request', 422);
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) return error('authentication_rejected', 403);
  const principal = fixedRunnerPrincipal();
  if (!principal) return error('authentication_rejected', 403);
  try {
    const client = getOpportunityV3ServerClient();
    const calendar = await client
      .from('opportunity_effective_taiwan_sessions_v3')
      .select('canonical_cutoff,taiwan_session_authority_hash')
      .order('canonical_cutoff', { ascending: false })
      .limit(2);
    if (
      calendar.error &&
      isPreFunctionCredentialRejectionV3(calendar.status, calendar.error)
    ) return error('v3_service_role_unavailable', 503);
    if (calendar.error || !calendar.data?.length) return error('calendar_unavailable', 503);
    if (
      calendar.data[1] &&
      calendar.data[1].canonical_cutoff === calendar.data[0].canonical_cutoff &&
      calendar.data[1].taiwan_session_authority_hash !== calendar.data[0].taiwan_session_authority_hash
    ) return error('calendar_unavailable', 503);
    const row = calendar.data[0];
    const begun = await client.rpc('begin_opportunity_run_v3', {
      mode,
      run_purpose: purpose,
      source_cutoff: row.canonical_cutoff,
      expected_taiwan_session_authority_hash: row.taiwan_session_authority_hash,
      caller_principal: principal,
    });
    if (begun.error) return mapBeginError(begun.error, begun.status);
    if (!Array.isArray(begun.data) || begun.data.length !== 1) return error('control_integrity_failure', 409);
    const result = begun.data[0] as Record<string, unknown>;
    if (!validBeginResult(result)) return error('control_integrity_failure', 409);
    return canonicalResponse({
      attemptRunId: result.attempt_run_id,
      disposition: result.disposition,
      runId: result.run_id,
      status: result.status,
      statusRef: `/api/internal/opportunity-run/status/${result.attempt_run_id}`,
    }, 202);
  } catch (caught) {
    return error(caught instanceof OpportunityV3ServiceUnavailable ? 'v3_service_role_unavailable' : 'control_internal_error', caught instanceof OpportunityV3ServiceUnavailable ? 503 : 500);
  }
}
