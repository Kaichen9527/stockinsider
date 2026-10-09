import { createHash, timingSafeEqual } from 'node:crypto';

/** Private controller identity only. Never serialize this into an article or general log. */
export type ResearchControllerRole = 'author' | 'reviewer';
type Credentials = { INTERNAL_API_KEY?: string; RESEARCH_REVIEW_KEY?: string; CRON_SECRET?: string };
type Failure = { ok: false; error: string };
type Identity = { ok: true; role: ResearchControllerRole; principalId: string };
const HASH = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

function configuredCredentials(): Credentials {
  return { INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
    RESEARCH_REVIEW_KEY: process.env.RESEARCH_REVIEW_KEY, CRON_SECRET: process.env.CRON_SECRET };
}

export function resolveResearchControllerIdentity(
  request: Request, role: ResearchControllerRole, credentials: Credentials = configuredCredentials(),
): Identity | Failure {
  const writer = credentials.INTERNAL_API_KEY;
  const reviewer = credentials.RESEARCH_REVIEW_KEY;
  if ((role !== 'author' && role !== 'reviewer') || !writer || !reviewer
    || writer === reviewer || writer === credentials.CRON_SECRET || reviewer === credentials.CRON_SECRET) {
    return { ok: false, error: 'research_controller_authority_unavailable' };
  }
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ') || request.headers.has('x-internal-key')) {
    return { ok: false, error: 'research_controller_unauthorized' };
  }
  const actual = Buffer.from(header.slice(7), 'utf8');
  const expected = Buffer.from(role === 'author' ? writer : reviewer, 'utf8');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, error: 'research_controller_unauthorized' };
  }
  const principalId = createHash('sha256').update(`stockinsider:research-controller:v2:${role}\0`)
    .update(expected).digest('hex');
  return { ok: true, role, principalId };
}

export type ResearchExecutionObservation = {
  version: 'research_execution_observation_v2';
  assignmentId: string;
  jobId: string;
  attempt: number;
  reservationId: string;
  inputRevisionId: string;
  inputHash: string;
  articleHash: string;
  reviewPackHash: string | null;
  outputHash: string;
  verificationLevel: 'trusted_controller_observation';
  providerSurface: 'codex_cross_chat';
  hostId: string | null;
  threadId: string;
  turnId: string | null;
  invocationId: string;
  dispatchObservationHash: string;
  completionObservationHash: string;
  controllerObservedStartAt: string;
  controllerObservedEndAt: string;
  modelIdentity: string | null;
};

/** Loaded by the guarded route from private immutable assignment + live original lease.
 * Never construct these expected values from a caller/model's result body.
 */
export type ResearchExecutionExpectation = {
  assignmentId: string;
  jobId: string;
  attempt: number;
  reservationId: string;
  inputRevisionId: string;
  inputHash: string;
  articleHash: string;
  reviewPackHash: string | null;
  outputHash: string;
  role: ResearchControllerRole;
  principalId: string;
  workOwner: string;
  originalLeaseOwner: string;
  reservationRole: 'company_research' | 'counter_review';
  assignedAt: string;
  reservationStartedAt: string;
  reservationExpiresAt: string;
  originalJobDeadline: string;
  receivedAt: string;
  articleAuthoredAt: string | null;
  author: { principalId: string; threadId: string; invocationId: string } | null;
  usedInvocationIds: readonly string[];
};

const OBSERVATION_KEYS = [
  'version', 'assignmentId', 'jobId', 'attempt', 'reservationId', 'inputRevisionId',
  'inputHash', 'articleHash', 'reviewPackHash', 'outputHash', 'verificationLevel', 'providerSurface',
  'hostId', 'threadId', 'turnId', 'invocationId', 'dispatchObservationHash', 'completionObservationHash',
  'controllerObservedStartAt', 'controllerObservedEndAt', 'modelIdentity',
] as const;
const BINDING_KEYS = ['assignmentId', 'jobId', 'attempt', 'reservationId', 'inputRevisionId',
  'inputHash', 'articleHash', 'reviewPackHash', 'outputHash'] as const;

function text(value: unknown, max = 200): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

// Preserve PostgreSQL microseconds; never round/truncate original deadline clocks.
function instant(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (!match) return null;
  const seconds = Date.parse(`${match[1]}.000Z`);
  if (!Number.isFinite(seconds) || new Date(seconds).toISOString() !== `${match[1]}.000Z`) return null;
  let offsetMinutes = 0;
  if (match[3] !== 'Z') {
    const hours = Number(match[3].slice(1, 3)); const minutes = Number(match[3].slice(4, 6));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
    offsetMinutes = (hours * 60 + minutes) * (match[3][0] === '+' ? 1 : -1);
  }
  return BigInt(seconds) * BigInt(1000) + BigInt((match[2] || '').padEnd(6, '0'))
    - BigInt(offsetMinutes) * BigInt(60_000_000);
}

/** Structural/clock binding of an authenticated controller report, NOT platform execution proof.
 * DB uniqueness, source fences, original lease checks and atomic completion remain mandatory.
 */
export function validateResearchExecutionObservation(
  request: Request, expected: ResearchExecutionExpectation, candidate: unknown,
  credentials: Credentials = configuredCredentials(),
): { ok: true; observation: ResearchExecutionObservation; principalId: string } | Failure {
  const identity = resolveResearchControllerIdentity(request, expected.role, credentials);
  if (!identity.ok) return identity;
  if (!HASH.test(expected.principalId) || identity.principalId !== expected.principalId) {
    return { ok: false, error: 'research_execution_principal_mismatch' };
  }
  if (!text(expected.workOwner) || expected.workOwner !== expected.originalLeaseOwner
    || expected.reservationRole !== (expected.role === 'author' ? 'company_research' : 'counter_review')) {
    return { ok: false, error: 'research_execution_owner_or_role_mismatch' };
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, error: 'research_execution_observation_shape' };
  }
  const row = candidate as Record<string, unknown>;
  if (Object.keys(row).length !== OBSERVATION_KEYS.length
    || !OBSERVATION_KEYS.every(key => Object.hasOwn(row, key))
    || row.version !== 'research_execution_observation_v2'
    || row.verificationLevel !== 'trusted_controller_observation' || row.providerSurface !== 'codex_cross_chat'
    || !['assignmentId', 'jobId', 'reservationId', 'inputRevisionId', 'threadId'].every(key =>
      typeof row[key] === 'string' && UUID.test(row[key] as string))
    || !Number.isInteger(row.attempt) || (row.attempt as number) < 1 || (row.attempt as number) > 3
    || !['inputHash', 'articleHash', 'outputHash', 'dispatchObservationHash', 'completionObservationHash'].every(key =>
      typeof row[key] === 'string' && HASH.test(row[key] as string))
    || !(row.reviewPackHash === null || (typeof row.reviewPackHash === 'string' && HASH.test(row.reviewPackHash)))
    || !text(row.invocationId) || !(row.hostId === null || text(row.hostId))
    || !(row.turnId === null || text(row.turnId)) || !(row.modelIdentity === null || text(row.modelIdentity))) {
    return { ok: false, error: 'research_execution_observation_shape' };
  }
  if (!BINDING_KEYS.every(key => row[key] === expected[key])
    || (expected.role === 'reviewer' ? row.reviewPackHash === null : row.reviewPackHash !== null)) {
    return { ok: false, error: 'research_execution_binding_mismatch' };
  }
  const clocks = [expected.assignedAt, expected.reservationStartedAt, expected.reservationExpiresAt,
    expected.originalJobDeadline, expected.receivedAt, row.controllerObservedStartAt, row.controllerObservedEndAt].map(instant);
  if (clocks.some(value => value === null)) return { ok: false, error: 'research_execution_clock_invalid' };
  const [assigned, reserved, expires, deadline, received, started, ended] = clocks as bigint[];
  if (assigned < reserved || assigned >= expires || assigned >= deadline
    || started < assigned || ended < started || ended > received || received >= expires || received >= deadline) {
    return { ok: false, error: 'research_execution_clock_invalid' };
  }
  if (!Array.isArray(expected.usedInvocationIds) || expected.usedInvocationIds.some(value => !text(value))
    || expected.usedInvocationIds.includes(row.invocationId)) {
    return { ok: false, error: 'research_execution_invocation_reused' };
  }
  if (expected.role === 'reviewer') {
    const author = expected.author;
    const authoredAt = instant(expected.articleAuthoredAt);
    if (!author || !HASH.test(author.principalId) || !UUID.test(author.threadId) || !text(author.invocationId)
      || author.principalId === identity.principalId || author.threadId === row.threadId
      || author.invocationId === row.invocationId || authoredAt === null || started < authoredAt) {
      return { ok: false, error: 'research_execution_not_independent' };
    }
  } else if (expected.author !== null || expected.articleAuthoredAt !== null) {
    return { ok: false, error: 'research_execution_binding_mismatch' };
  }
  return { ok: true, observation: { ...row } as ResearchExecutionObservation, principalId: identity.principalId };
}
