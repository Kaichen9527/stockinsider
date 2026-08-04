import { canonicalResponse } from './canonical';
import { exactObject, readBoundedJson } from './internal';
import { requireInternalPrincipalV3, type PrincipalRoleV3 } from './principal';
import { isPreFunctionCredentialRejectionV3 } from './remote-credential';
import { getOpportunityV3ServerClient, OpportunityV3ServiceUnavailable } from './service-client';
import { validateHumanAuthorityValuesV3 } from './request-values';

type HumanAuthoritySpec = {
  path: string;
  role: PrincipalRoleV3;
  keys: string[];
  rpc: string;
  inputArgument: string;
  outputKeys: string[];
};

export async function humanAuthorityHandler(request: Request, spec: HumanAuthoritySpec): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== spec.path || url.search || request.headers.get('content-type')?.toLowerCase() !== 'application/json') {
    return response('invalid_request', 422);
  }
  const parsed = await readBoundedJson(request, 32_768);
  if (!parsed) return response('invalid_request', 422);
  const principal = requireInternalPrincipalV3(request, parsed.raw, spec.path, spec.role);
  if (!principal.ok) return response('authentication_rejected', 403);
  if (
    !exactObject(parsed.value, spec.keys) ||
    !validateHumanAuthorityValuesV3(spec.rpc, parsed.value as Record<string, unknown>)
  ) return response('invalid_request', 422);
  try {
    const client = getOpportunityV3ServerClient();
    const nonce = await client.rpc('consume_internal_nonce_v3', {
      principal_id: principal.principalId,
      required_role: spec.role,
      nonce: principal.nonce,
      request_timestamp: principal.timestamp,
    });
    if (nonce.error) return databaseError(nonce.error, nonce.status);
    const append = await client.rpc(spec.rpc, {
      [spec.inputArgument]: camelToSnakeObject(parsed.value as Record<string, unknown>),
      caller_principal: principal.principalId,
    });
    if (append.error) return databaseError(append.error, append.status);
    if (!Array.isArray(append.data) || append.data.length !== 1) return response('human_authority_internal_error', 500);
    const raw = append.data[0] as Record<string, unknown>;
    const body = Object.fromEntries(spec.outputKeys.map((key) => [key, raw[camelToSnake(key)]]));
    return canonicalResponse(body);
  } catch (caught) {
    return caught instanceof OpportunityV3ServiceUnavailable
      ? response('v3_service_role_unavailable', 503)
      : response('human_authority_internal_error', 500);
  }
}

function response(code: string, status: number) {
  return canonicalResponse({ code, error: 'v3_internal_request_rejected' }, status);
}

function databaseError(error: { code?: string; message?: string }, remoteStatus: number) {
  if (
    error.code === 'PT403' &&
    ['authentication_rejected', 'principal_role_unavailable'].includes(error.message ?? '')
  ) return response('authentication_rejected', 403);
  if (isPreFunctionCredentialRejectionV3(remoteStatus, error)) {
    return response('v3_service_role_unavailable', 503);
  }
  const expected =
    error.code === 'PT422' && error.message === 'invalid_authority_request' ? 422
      : error.code === 'PT404' && error.message === 'authority_reference_unavailable' ? 404
        : error.code === 'PT409' &&
          ['authority_conflict', 'bound_violation'].includes(error.message ?? '') ? 409
          : 500;
  const status = expected;
  const code = status === 500
    ? 'human_authority_internal_error'
    : error.message as string;
  return response(code, status);
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}

function camelToSnakeObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [camelToSnake(key), item]));
}
