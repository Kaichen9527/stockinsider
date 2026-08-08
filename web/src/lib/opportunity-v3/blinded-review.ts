import { canonicalResponse } from './canonical.ts';
import { exactObject, readBoundedJson } from './internal.ts';
import { requireInternalPrincipalV3 } from './principal.ts';
import { isPreFunctionCredentialRejectionV3 } from './remote-credential.ts';
import { getOpportunityV3ServerClient, OpportunityV3ServiceUnavailable } from './service-client.ts';
import { validateBlindedReviewValuesV3 } from './request-values.ts';

export async function blindedReviewHandler(
  request: Request,
  spec: { path: string; kind: 'assignment' | 'label'; adjudicator: boolean },
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== spec.path || url.search) return response('invalid_request', 422);
  const parsed = await readBoundedJson(request, 4096);
  if (!parsed) return response('invalid_request', 422);
  const principal = requireInternalPrincipalV3(
    request, parsed.raw, spec.path, spec.adjudicator ? 'link_adjudicator' : 'link_reviewer');
  if (!principal.ok) return response('authentication_rejected', 403);
  const keys = spec.kind === 'assignment'
    ? ['sampleManifestId','sampleId']
    : ['sampleManifestId','sampleId','labelRole','canonicalSymbol','noLink'];
  if (
    !exactObject(parsed.value, keys) ||
    !validateBlindedReviewValuesV3(
      spec.kind,
      spec.adjudicator,
      parsed.value as Record<string, unknown>,
    )
  ) return response('invalid_request', 422);
  const body = parsed.value as Record<string, unknown>;
  try {
    const result = await getOpportunityV3ServerClient().rpc(
      spec.kind === 'assignment' ? 'get_link_audit_assignment_v3' : 'submit_link_audit_label_v3',
      {
        requested_sample_manifest_id: body.sampleManifestId,
        requested_sample_id: body.sampleId,
        requested_role: spec.adjudicator ? 'link_adjudicator' : 'link_reviewer',
        ...(spec.kind === 'label' ? {
          requested_label_role: body.labelRole,
          canonical_symbol_or_null: body.canonicalSymbol,
          no_link: body.noLink,
        } : {}),
        caller_principal: principal.principalId,
        nonce: principal.nonce,
        request_timestamp: principal.timestamp,
      },
    );
    if (result.error) {
      const mapped = mapBlindedReviewRemoteError(
        result.status,
        result.error.code,
        result.error.message,
      );
      return response(mapped.code, mapped.status);
    }
    if (!Array.isArray(result.data) || result.data.length !== 1) return response('link_audit_internal_error', 500);
    const success = serializeBlindedReviewSuccess(
      spec.kind,
      spec.adjudicator,
      result.data[0],
    );
    return success === null
      ? response('link_audit_internal_error', 500)
      : canonicalResponse(success);
  } catch (caught) {
    return caught instanceof OpportunityV3ServiceUnavailable
      ? response('v3_service_role_unavailable', 503)
      : response('link_audit_internal_error', 500);
  }
}

function response(code: string, status: number) {
  return canonicalResponse({ code, error: 'link_audit_request_rejected' }, status);
}

const ASSIGNMENT_KEYS = [
  'disposition','sample_manifest_id','sample_id','review_source_key','evidence_ref',
  'review_context','review_mention_start_offset','review_mention_end_offset',
  'normalized_token','link_mode','engine_outcome','engine_reason',
  'engine_canonical_symbol','review_evidence_hash','assigned_label_role',
  'own_canonical_symbol','own_no_link','reviewer_one_canonical_symbol',
  'reviewer_one_no_link','reviewer_two_canonical_symbol','reviewer_two_no_link',
];
const LABEL_KEYS = ['sample_manifest_id','sample_id','label_role','label_hash','submitted_at'];
const REVIEWER_DISPOSITIONS = new Set([
  'reviewer_open_slot','reviewer_existing_label','reviewer_slots_full',
]);
const ADJUDICATOR_DISPOSITIONS = new Set([
  'adjudication_pending','adjudication_not_required','adjudicator_open',
  'adjudicator_existing_label','adjudication_completed',
]);

export function serializeBlindedReviewSuccess(
  kind: 'assignment' | 'label',
  adjudicator: boolean,
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (kind === 'label') {
    if (
      !exactObject(row, LABEL_KEYS) ||
      typeof row.sample_manifest_id !== 'string' ||
      typeof row.sample_id !== 'string' ||
      !['reviewer_1','reviewer_2','adjudicator'].includes(String(row.label_role)) ||
      typeof row.label_hash !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(row.label_hash) ||
      typeof row.submitted_at !== 'string'
    ) return null;
    return {
      sampleManifestId: row.sample_manifest_id,
      sampleId: row.sample_id,
      labelRole: row.label_role,
      labelHash: row.label_hash,
      submittedAt: row.submitted_at,
    };
  }
  if (
    !exactObject(row, ASSIGNMENT_KEYS) ||
    typeof row.disposition !== 'string' ||
    !(adjudicator ? ADJUDICATOR_DISPOSITIONS : REVIEWER_DISPOSITIONS)
      .has(row.disposition) ||
    typeof row.sample_manifest_id !== 'string' ||
    typeof row.sample_id !== 'string' ||
    typeof row.review_source_key !== 'string' ||
    typeof row.evidence_ref !== 'string' ||
    typeof row.review_context !== 'string' ||
    !Number.isSafeInteger(row.review_mention_start_offset) ||
    !Number.isSafeInteger(row.review_mention_end_offset) ||
    typeof row.normalized_token !== 'string' ||
    typeof row.link_mode !== 'string' ||
    typeof row.engine_outcome !== 'string' ||
    typeof row.engine_reason !== 'string' ||
    !(row.engine_canonical_symbol === null ||
      (typeof row.engine_canonical_symbol === 'string' &&
        /^[0-9]{4}$/u.test(row.engine_canonical_symbol))) ||
    typeof row.review_evidence_hash !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(row.review_evidence_hash) ||
    !validAssignmentLabels(row)
  ) return null;
  return {
    disposition: row.disposition,
    sampleManifestId: row.sample_manifest_id,
    sampleId: row.sample_id,
    reviewEvidence: {
      sourceKey: row.review_source_key,
      evidenceRef: row.evidence_ref,
      reviewContext: row.review_context,
      mentionStartOffset: row.review_mention_start_offset,
      mentionEndOffset: row.review_mention_end_offset,
      normalizedToken: row.normalized_token,
      linkMode: row.link_mode,
      engineOutcome: row.engine_outcome,
      engineReason: row.engine_reason,
      engineCanonicalSymbol: row.engine_canonical_symbol,
      reviewEvidenceHash: row.review_evidence_hash,
    },
    assignedLabelRole: row.assigned_label_role,
    ownCanonicalSymbol: row.own_canonical_symbol,
    ownNoLink: row.own_no_link,
    reviewerOneCanonicalSymbol: row.reviewer_one_canonical_symbol,
    reviewerOneNoLink: row.reviewer_one_no_link,
    reviewerTwoCanonicalSymbol: row.reviewer_two_canonical_symbol,
    reviewerTwoNoLink: row.reviewer_two_no_link,
  };
}

function validAssignmentLabels(row: Record<string, unknown>): boolean {
  const ownNull = row.own_canonical_symbol === null && row.own_no_link === null;
  const oneNull = row.reviewer_one_canonical_symbol === null &&
    row.reviewer_one_no_link === null;
  const twoNull = row.reviewer_two_canonical_symbol === null &&
    row.reviewer_two_no_link === null;
  const ownValid = validLabelValue(row.own_canonical_symbol, row.own_no_link);
  const oneValid = validLabelValue(
    row.reviewer_one_canonical_symbol,
    row.reviewer_one_no_link,
  );
  const twoValid = validLabelValue(
    row.reviewer_two_canonical_symbol,
    row.reviewer_two_no_link,
  );
  switch (row.disposition) {
    case 'reviewer_existing_label':
      return ['reviewer_1','reviewer_2'].includes(String(row.assigned_label_role)) &&
        ownValid && oneNull && twoNull;
    case 'reviewer_open_slot':
      return ['reviewer_1','reviewer_2'].includes(String(row.assigned_label_role)) &&
        ownNull && oneNull && twoNull;
    case 'reviewer_slots_full':
    case 'adjudication_pending':
    case 'adjudication_not_required':
    case 'adjudication_completed':
      return row.assigned_label_role === null && ownNull && oneNull && twoNull;
    case 'adjudicator_open':
      return row.assigned_label_role === 'adjudicator' &&
        ownNull && oneValid && twoValid;
    case 'adjudicator_existing_label':
      return row.assigned_label_role === 'adjudicator' &&
        ownValid && oneValid && twoValid;
    default:
      return false;
  }
}

function validLabelValue(symbol: unknown, noLink: unknown): boolean {
  return typeof noLink === 'boolean' && (
    noLink ? symbol === null : typeof symbol === 'string' && /^[0-9]{4}$/u.test(symbol)
  );
}

function mapBlindedReviewError(
  sqlstate: string,
  message: string,
): { code: string; status: number } {
  if (
    sqlstate === 'PT403' &&
    ['authentication_rejected','principal_role_unavailable'].includes(message)
  ) return { code: 'authentication_rejected', status: 403 };
  if (
    sqlstate === 'PT422' &&
    ['invalid_requested_role','invalid_label_role','invalid_label_value'].includes(message)
  ) return { code: message, status: 422 };
  if (sqlstate === 'PT404' && message === 'assignment_unavailable') {
    return { code: message, status: 404 };
  }
  if (
    sqlstate === 'PT409' &&
    [
      'principal_already_other_branch','principal_not_distinct',
      'label_slot_not_assigned','label_slot_unavailable','reviewer_pair_incomplete',
      'adjudication_not_required','adjudication_completed','label_conflict',
      'label_symbol_unavailable',
    ].includes(message)
  ) return { code: message, status: 409 };
  return { code: 'link_audit_internal_error', status: 500 };
}

export function mapBlindedReviewRemoteError(
  status: number,
  sqlstate: string,
  message: string,
): { code: string; status: number } {
  const databaseError = mapBlindedReviewError(sqlstate, message);
  if (databaseError.status !== 500) return databaseError;
  return isPreFunctionCredentialRejectionV3(status, { code: sqlstate, message })
    ? { code: 'v3_service_role_unavailable', status: 503 }
    : databaseError;
}
