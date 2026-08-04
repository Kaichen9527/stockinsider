import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { canonicalJson } from './canonical.ts';
import { exactObject, requireExactInternalBearer } from './internal.ts';

export type PrincipalRoleV3 =
  | 'opportunity_runner'
  | 'source_reviewer'
  | 'identity_reviewer'
  | 'publisher_reviewer'
  | 'peer_reviewer_admin'
  | 'peer_reviewer'
  | 'valuation_reviewer'
  | 'model_reviewer'
  | 'link_reviewer'
  | 'link_adjudicator';

type PrincipalConfig = {
  principalId: string;
  roles: PrincipalRoleV3[];
  hmacKey: string;
  validFrom: string;
  validTo: string | null;
  status: 'active' | 'inactive';
};

const PRINCIPAL_ROLES_V3 = new Set<PrincipalRoleV3>([
  'opportunity_runner',
  'source_reviewer',
  'identity_reviewer',
  'publisher_reviewer',
  'peer_reviewer_admin',
  'peer_reviewer',
  'valuation_reviewer',
  'model_reviewer',
  'link_reviewer',
  'link_adjudicator',
]);

const PRINCIPAL_KEYS_V3 = ['principalId', 'roles', 'hmacKey', 'validFrom', 'validTo', 'status'];
const WHOLE_SECOND_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function wholeSecondTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !WHOLE_SECOND_RFC3339.test(value)) return null;
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString().replace('.000Z', 'Z') === value ? milliseconds : null;
}

function validPrincipalConfig(value: unknown): value is PrincipalConfig {
  if (!exactObject(value, PRINCIPAL_KEYS_V3)) return false;
  const principalId = value.principalId;
  const roles = value.roles;
  const hmacKey = value.hmacKey;
  const validFrom = wholeSecondTimestamp(value.validFrom);
  const validTo = value.validTo === null ? null : wholeSecondTimestamp(value.validTo);
  return (
    typeof principalId === 'string' && CANONICAL_UUID.test(principalId) &&
    Array.isArray(roles) && roles.length > 0 && roles.length <= PRINCIPAL_ROLES_V3.size &&
    roles.every((role): role is PrincipalRoleV3 => typeof role === 'string' && PRINCIPAL_ROLES_V3.has(role as PrincipalRoleV3)) &&
    new Set(roles).size === roles.length &&
    typeof hmacKey === 'string' && hmacKey.length > 0 && hmacKey.length <= 4096 &&
    validFrom !== null &&
    (value.validTo === null || (validTo !== null && validTo > validFrom)) &&
    (value.status === 'active' || value.status === 'inactive')
  );
}

export function requireInternalPrincipalV3(
  request: Request,
  rawBody: string,
  canonicalPath: string,
  requiredRole: PrincipalRoleV3,
): { ok: true; principalId: string; nonce: string; timestamp: string } | { ok: false } {
  if (!requireExactInternalBearer(request)) return { ok: false };
  if (!/^\/(?:api\/internal\/[a-z0-9-]+)(?:\/[a-z0-9-]+)*$/u.test(canonicalPath)) return { ok: false };
  const keyId = request.headers.get('x-stockinsider-key-id') ?? '';
  const timestamp = request.headers.get('x-stockinsider-timestamp') ?? '';
  const nonce = request.headers.get('x-stockinsider-nonce') ?? '';
  const signature = request.headers.get('x-stockinsider-signature') ?? '';
  if (!/^[A-Za-z0-9_.-]{1,128}$/u.test(keyId) || !/^[0-9a-f]{16,64}$/u.test(nonce) || !/^[0-9a-f]{64}$/u.test(signature)) return { ok: false };
  const requestTime = wholeSecondTimestamp(timestamp);
  if (requestTime === null) return { ok: false };
  const skew = Math.abs(Date.now() - requestTime);
  if (!Number.isFinite(skew) || skew > 300_000) return { ok: false };
  let registry: unknown;
  try {
    registry = JSON.parse(process.env.OPPORTUNITY_V3_INTERNAL_PRINCIPALS_JSON ?? '{}') as unknown;
  } catch {
    return { ok: false };
  }
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) return { ok: false };
  const config = (registry as Record<string, unknown>)[keyId];
  if (!validPrincipalConfig(config)) return { ok: false };
  const now = requestTime;
  const validFrom = wholeSecondTimestamp(config.validFrom);
  const validTo = config.validTo === null ? null : wholeSecondTimestamp(config.validTo);
  if (
    config.status !== 'active' ||
    !config.roles.includes(requiredRole) ||
    validFrom === null || validFrom > now ||
    (config.validTo !== null && (validTo === null || now >= validTo))
  ) return { ok: false };
  const preimage = canonicalJson([
    'internal-principal-v3.8',
    keyId,
    config.principalId,
    request.method,
    canonicalPath,
    timestamp,
    nonce,
    createHash('sha256').update(rawBody, 'utf8').digest('hex'),
  ]);
  const expected = createHmac('sha256', config.hmacKey).update(preimage, 'utf8').digest('hex');
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return { ok: false };
  return { ok: true, principalId: config.principalId, nonce, timestamp };
}
