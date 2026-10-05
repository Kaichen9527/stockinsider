import type { SupabaseClient } from '@supabase/supabase-js';

export type ResearchDeepClaimContext = {
  schemaVersion: 'research-deep-claim-context-v1';
  observedAt: string;
  job: { jobId: string; symbol: string; priorityRunId: string; attempt: number; owner: string; leaseExpiresAt: string };
  modelReservation: { reservationId: string; role: 'company_research'; owner: string; workKey: string;
    startedAt: string; leaseExpiresAt: string };
  modelCompletion: null | { outcome: 'completed' | 'failed'; resultHash: string; completedAt: string };
};
type Expected = { owner: string; jobId?: string; attempt?: number; now?: string };
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OWNER = /^[a-zA-Z0-9:_-]{3,120}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const THIRTY_MINUTES = BigInt(1_800_000_000);
const JOB_FIELDS = 'job_id,symbol,priority_run_id,attempts,status,lease_owner,lease_expires_at';
const ATTEMPT_FIELDS = 'job_id,attempt,owner,claimed_at,lease_expires_at';
const RESERVATION_FIELDS = 'reservation_id,role,owner,work_key,started_at,lease_expires_at';
const COMPLETION_FIELDS = 'reservation_id,owner,outcome,result_hash,finished_at';

function ensure(value: unknown): asserts value {
  if (!value) throw new Error('research_deep_claim_context_invalid');
}
function record(value: unknown): Row {
  ensure(value && typeof value === 'object' && !Array.isArray(value));
  return value as Row;
}
function exact(value: unknown, keys: string[]): Row {
  const result = record(value);
  ensure(Object.keys(result).sort().join(',') === [...keys].sort().join(','));
  return result;
}
function string(value: unknown): string { ensure(typeof value === 'string'); return value; }

/** Preserve PostgreSQL microseconds; Date.parse alone would accept a changed
 * sub-millisecond deadline, or silently normalize an invalid calendar date. */
function instant(value: unknown): bigint {
  const text = string(value);
  const parts = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(text);
  ensure(parts);
  const local = Date.parse(`${parts[1]}Z`);
  ensure(Number.isFinite(local) && new Date(local).toISOString().slice(0, 19) === parts[1]);
  const hours = Number(parts[5] || 0), minutes = Number(parts[6] || 0);
  ensure(hours <= 23 && minutes <= 59);
  const offset = (parts[4] === '-' ? -1 : 1) * (hours * 60 + minutes);
  return BigInt(local) * BigInt(1000) + BigInt((parts[2] || '').padEnd(6, '0')) - BigInt(offset) * BigInt(60_000_000);
}
function taipeiDay(value: bigint): string {
  return new Date(Number(value / BigInt(1000)) + 8 * 3600_000).toISOString().slice(0, 10);
}
function expectedIdentity(expected: Expected) {
  ensure(typeof expected.owner === 'string' && OWNER.test(expected.owner));
  ensure((expected.jobId === undefined) === (expected.attempt === undefined));
  if (expected.jobId !== undefined) {
    ensure(typeof expected.jobId === 'string' && UUID.test(expected.jobId)
      && Number.isInteger(expected.attempt) && expected.attempt! >= 1 && expected.attempt! <= 3);
  }
  if (expected.now !== undefined) instant(expected.now);
}

/** Observational context, not a new lease or publication receipt. A consumer
 * must retain both original deadlines and must not rerun a completed model. */
export function validateResearchDeepClaimContext(value: unknown, expected: Expected): ResearchDeepClaimContext {
  expectedIdentity(expected);
  const context = exact(value, ['schemaVersion', 'observedAt', 'job', 'modelReservation', 'modelCompletion']);
  ensure(context.schemaVersion === 'research-deep-claim-context-v1');
  const job = exact(context.job, ['jobId', 'symbol', 'priorityRunId', 'attempt', 'owner', 'leaseExpiresAt']);
  const model = exact(context.modelReservation, ['reservationId', 'role', 'owner', 'workKey', 'startedAt', 'leaseExpiresAt']);
  ensure(UUID.test(string(job.jobId)) && UUID.test(string(job.priorityRunId)) && /^\d{4}$/u.test(string(job.symbol))
    && Number.isInteger(job.attempt) && Number(job.attempt) >= 1 && Number(job.attempt) <= 3
    && job.owner === expected.owner && model.owner === expected.owner
    && UUID.test(string(model.reservationId)) && model.role === 'company_research'
    && model.workKey === `deep:${job.jobId}:${job.attempt}`);
  if (expected.jobId !== undefined) ensure(job.jobId === expected.jobId && job.attempt === expected.attempt);
  const observed = instant(context.observedAt), now = instant(expected.now ?? new Date().toISOString());
  const started = instant(model.startedAt), modelDeadline = instant(model.leaseExpiresAt), jobDeadline = instant(job.leaseExpiresAt);
  ensure(started <= observed && observed <= now && jobDeadline > now
    && modelDeadline - started === THIRTY_MINUTES && taipeiDay(started) === taipeiDay(modelDeadline)
    && jobDeadline >= modelDeadline && jobDeadline <= observed + THIRTY_MINUTES
    && taipeiDay(started) === taipeiDay(jobDeadline));
  if (context.modelCompletion === null) {
    ensure(modelDeadline > now);
  } else {
    const completion = exact(context.modelCompletion, ['outcome', 'resultHash', 'completedAt']);
    const completed = instant(completion.completedAt);
    ensure(['completed', 'failed'].includes(string(completion.outcome)) && HASH.test(string(completion.resultHash))
      && completed >= started && completed < modelDeadline && completed <= observed);
  }
  return context as ResearchDeepClaimContext;
}

function rows(result: { data: unknown; error: unknown }): Row[] {
  ensure(!result.error && Array.isArray(result.data) && result.data.length <= 2);
  return result.data.map(record);
}
function one(result: { data: unknown; error: unknown }): Row {
  const values = rows(result); ensure(values.length === 1); return values[0];
}

/** Only finite, owner-scoped SELECTs. Never claims, renews, completes, or writes. */
export async function loadResearchDeepClaimContext(db: Pick<SupabaseClient, 'from'>,
  expected: Expected): Promise<ResearchDeepClaimContext | null> {
  expectedIdentity(expected);
  const queryTime = expected.now ?? new Date().toISOString();
  let query = db.from('research_deep_jobs_v1').select(JOB_FIELDS)
    .eq('lease_owner', expected.owner).eq('status', 'running').gt('lease_expires_at', queryTime);
  if (expected.jobId !== undefined) query = query.eq('job_id', expected.jobId).eq('attempts', expected.attempt);
  const jobs = rows(await query.limit(2));
  if (!jobs.length) return null;
  ensure(jobs.length === 1);
  const job = jobs[0];
  ensure(UUID.test(string(job.job_id)) && job.lease_owner === expected.owner && job.status === 'running'
    && Number.isInteger(job.attempts) && Number(job.attempts) >= 1 && Number(job.attempts) <= 3);
  if (expected.jobId !== undefined) ensure(job.job_id === expected.jobId && job.attempts === expected.attempt);
  const workKey = `deep:${job.job_id}:${job.attempts}`;
  const attempt = one(await db.from('research_deep_job_attempts_v1').select(ATTEMPT_FIELDS)
    .eq('job_id', job.job_id).eq('attempt', job.attempts).eq('owner', expected.owner).limit(2));
  const model = one(await db.from('research_model_reservations_v1').select(RESERVATION_FIELDS)
    .eq('owner', expected.owner).eq('role', 'company_research').eq('work_key', workKey).limit(2));
  ensure(UUID.test(string(model.reservation_id)));
  const completions = rows(await db.from('research_model_completions_v1').select(COMPLETION_FIELDS)
    .eq('reservation_id', model.reservation_id).limit(2));
  ensure(completions.length <= 1);
  const completion = completions[0] ?? null;
  if (completion) ensure(completion.reservation_id === model.reservation_id && completion.owner === expected.owner);
  // A completion or lease turnover while these reads run must not turn an old
  // attempt into the new owner's context. This remains an observation, not a
  // transaction or authority to bypass the existing guarded mutation fences.
  const current = one(await db.from('research_deep_jobs_v1').select(JOB_FIELDS)
    .eq('job_id', job.job_id).eq('attempts', job.attempts).eq('lease_owner', expected.owner)
    .eq('status', 'running').limit(2));
  ensure(JOB_FIELDS.split(',').every(key => current[key] === job[key]));
  const observedAt = expected.now ?? new Date().toISOString();
  const claimed = instant(attempt.claimed_at), jobDeadline = instant(job.lease_expires_at);
  ensure(attempt.job_id === job.job_id && attempt.attempt === job.attempts && attempt.owner === expected.owner
    && instant(attempt.lease_expires_at) === jobDeadline && claimed >= instant(model.started_at)
    && claimed <= instant(observedAt) && jobDeadline > claimed && jobDeadline <= claimed + THIRTY_MINUTES);
  return validateResearchDeepClaimContext({ schemaVersion: 'research-deep-claim-context-v1', observedAt,
    job: { jobId: job.job_id, symbol: job.symbol, priorityRunId: job.priority_run_id, attempt: job.attempts,
      owner: job.lease_owner, leaseExpiresAt: job.lease_expires_at },
    modelReservation: { reservationId: model.reservation_id, role: model.role, owner: model.owner,
      workKey: model.work_key, startedAt: model.started_at, leaseExpiresAt: model.lease_expires_at },
    modelCompletion: completion ? { outcome: completion.outcome, resultHash: completion.result_hash,
      completedAt: completion.finished_at } : null,
  }, { ...expected, now: observedAt });
}
