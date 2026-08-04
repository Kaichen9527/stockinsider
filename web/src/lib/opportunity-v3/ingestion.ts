import { canonicalResponse } from './canonical.ts';
import { exactObject, fixedRunnerPrincipal, readBoundedJson, requireExactInternalBearer } from './internal.ts';
import { isPreFunctionCredentialRejectionV3 } from './remote-credential.ts';
import { getOpportunityV3ServerClient, OpportunityV3ServiceUnavailable } from './service-client.ts';
import { normalizeCanonicalUrl } from './source.ts';
import { validateIngestionValuesV3 } from './request-values.ts';

export type IngestionSpec = {
  path: string;
  keys: string[];
  rpc: string;
  inputArgument: string;
  outputKeys: string[];
  maxBytes?: number;
};

export async function ingestionHandler(request: Request, spec: IngestionSpec): Promise<Response> {
  const url = new URL(request.url);
  if (
    request.method !== 'POST' ||
    url.pathname !== spec.path ||
    url.search ||
    ['x-stockinsider-key-id','x-stockinsider-timestamp','x-stockinsider-nonce','x-stockinsider-signature'].some((name) => request.headers.has(name))
  ) return response('invalid_request', 422);
  const parsed = await readBoundedJson(request, spec.maxBytes ?? 131_072);
  if (!parsed) return response('invalid_request', 422);
  if (!requireExactInternalBearer(request)) return response('authentication_rejected', 403);
  const principal = fixedRunnerPrincipal();
  if (!principal) return response('authentication_rejected', 403);
  if (
    !exactObject(parsed.value, spec.keys) ||
    !validateIngestionValuesV3(spec.rpc, parsed.value as Record<string, unknown>)
  ) return response('invalid_request', 422);
  try {
    const input = normalizeIngestionInput(spec, parsed.value as Record<string, unknown>);
    const result = await getOpportunityV3ServerClient().rpc(spec.rpc, {
      [spec.inputArgument]: snakeObject(input),
      caller_principal: principal,
    });
    if (result.error) {
      if (isPreFunctionCredentialRejectionV3(result.status, result.error)) {
        return response('v3_service_role_unavailable', 503);
      }
      if (
        result.error.code === 'PT403' &&
        result.error.message === 'principal_role_unavailable'
      ) return response('authentication_rejected', 403);
      if (
        result.error.code === 'PT422' &&
        result.error.message === 'invalid_authority_request'
      ) return response('invalid_authority_request', 422);
      if (
        result.error.code === 'PT404' &&
        result.error.message === 'authority_reference_unavailable'
      ) return response('authority_reference_unavailable', 404);
      if (
        result.error.code === 'PT409' &&
        ['authority_conflict', 'bound_violation'].includes(result.error.message)
      ) return response(result.error.message, 409);
      return response('ingestion_internal_error', 500);
    }
    if (!Array.isArray(result.data) || result.data.length !== 1) return response('ingestion_internal_error', 500);
    const row = result.data[0] as Record<string, unknown>;
    return canonicalResponse(Object.fromEntries(spec.outputKeys.map((key) => [key, row[snake(key)]])));
  } catch (caught) {
    return caught instanceof OpportunityV3ServiceUnavailable
      ? response('v3_service_role_unavailable', 503)
      : response('ingestion_internal_error', 500);
  }
}

function response(code: string, status: number) {
  return canonicalResponse({ code, error: 'v3_ingestion_request_rejected' }, status);
}
function snake(value: string) {
  return value.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}
function snakeObject(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [snake(key), item]));
}

function normalizeIngestionInput(
  spec: IngestionSpec,
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (spec.rpc !== 'append_source_document_revision_v3') return value;
  const candidate = value.canonicalUrlCandidate;
  if (candidate === null) return value;
  if (typeof candidate !== 'string') return value;
  const normalized = normalizeCanonicalUrl(candidate);
  return normalized === null
    ? value
    : { ...value, canonicalUrlCandidate: normalized };
}
