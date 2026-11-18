import { createHash } from 'node:crypto';
import { isHistoryDate } from '../candidate-price-history.ts';
import { evidenceInstant } from './evidence-clock.ts';
import { readLaunchOfficialReportBody } from './launch-official-report-body.ts';
import { TWSE_LIMIT_MAX_BYTES, twseLimitReplayUrls, validateTwseLimitPair,
  type TwseLimitCapture, type TwseOpeningLimitReceipt } from './launch-twse-daily-limit.ts';

type Row = Record<string, unknown>;
type Writer = { rpc: (name: string, args: Row) => PromiseLike<{ data: unknown; error: unknown }> };
const command = 'vnext_launch_twse_opening_limit_command_v1';
const id = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const object = (value: unknown): value is Row => value !== null && typeof value === 'object' && !Array.isArray(value);
const authorityId = (value: unknown): value is string => typeof value === 'string' && id.test(value);
const hash = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');
const scope = (principal: string, owner: string) => ({ p_principal: principal, p_lease_owner: owner });

async function fetchLimit(url: string, mime: string, fetchPage: typeof fetch) {
  const response = await fetchPage(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000),
    headers: { accept: mime } });
  if (!response.ok || response.url !== url || response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== mime) {
    await response.body?.cancel().catch(() => {});
    throw Error('launch_twse_limit_authority_unavailable');
  }
  const body = await readLaunchOfficialReportBody(response, TWSE_LIMIT_MAX_BYTES);
  return { url, body, sha256: hash(body) };
}

export async function captureLaunchTwseOpeningLimits(writer: Writer, principal: string, owner: string,
  fetchPage: typeof fetch = fetch) {
  const lease = scope(principal, owner);
  try {
    const { data, error } = await writer.rpc(command, { ...lease, p_action: 'admit' });
    if (error) return 'deferred' as const;
    if (data === null) return 'session_unready' as const;
    if (!object(data) || typeof data.session !== 'string' || !isHistoryDate(data.session)
        || !authorityId(data.sessionAuthorityId) || typeof data.alreadyCaptured !== 'boolean') return 'deferred' as const;
    if (data.alreadyCaptured) return 'replay' as const;

    const session = data.session, urls = twseLimitReplayUrls(session);
    const [csv, dated] = await Promise.all([fetchLimit(urls.csv, 'text/csv', fetchPage),
      fetchLimit(urls.json, 'application/json', fetchPage)]);
    const observedAt = new Date().toISOString();
    const clock = { observedAt, recordedAt: observedAt };
    validateTwseLimitPair(session, { ...csv, ...clock }, { ...dated, ...clock });
    const saved = await writer.rpc(command, { ...lease, p_action: 'append', p_session: session, p_observed_at: observedAt,
      p_session_authority_id: data.sessionAuthorityId, p_csv_sha256: csv.sha256, p_dated_sha256: dated.sha256,
      p_csv_body: '\\x' + csv.body.toString('hex'), p_dated_body: '\\x' + dated.body.toString('hex') });
    if (saved.error || !object(saved.data) || saved.data.session !== session || saved.data.sessionAuthorityId !== data.sessionAuthorityId
      || saved.data.csvSha256 !== csv.sha256 || saved.data.datedSha256 !== dated.sha256
      || evidenceInstant(saved.data.recordedAt) === null || typeof saved.data.replay !== 'boolean') return 'deferred' as const;
    return saved.data.replay ? 'replay' as const : 'written' as const;
  } catch { return 'deferred' as const; }
}

function decoded(value: unknown, sha256: unknown) {
  const base64Bound = 4 * Math.ceil(TWSE_LIMIT_MAX_BYTES / 3);
  if (typeof value !== 'string' || value.length > base64Bound || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) return null;
  const body = Buffer.from(value, 'base64');
  if (body.length < 2 || body.length > TWSE_LIMIT_MAX_BYTES || body.toString('base64') !== value || hash(body) !== sha256) return null;
  return body;
}

export async function readLaunchTwseOpeningLimits(writer: Writer, principal: string, owner: string, session: string,
  asOf: string): Promise<TwseOpeningLimitReceipt | null> {
  try {
    const { data, error } = await writer.rpc(command, { ...scope(principal, owner), p_action: 'read', p_session: session, p_as_of: asOf });
    if (error || !object(data) || data.session !== session || !authorityId(data.sessionAuthorityId)
        || typeof data.observedAt !== 'string' || typeof data.recordedAt !== 'string') return null;
    const observed = evidenceInstant(data.observedAt), recorded = evidenceInstant(data.recordedAt), cutoff = evidenceInstant(asOf);
    if (observed === null || recorded === null || cutoff === null || observed > recorded || recorded > cutoff) return null;
    const csvBody = decoded(data.csvBase64, data.csvSha256), datedBody = decoded(data.datedBase64, data.datedSha256);
    if (!csvBody || !datedBody || typeof data.csvSha256 !== 'string' || typeof data.datedSha256 !== 'string') return null;
    const urls = twseLimitReplayUrls(session), clock = { observedAt: data.observedAt, recordedAt: data.recordedAt };
    const csv: TwseLimitCapture = { url: urls.csv, body: csvBody, sha256: data.csvSha256, ...clock };
    const dated: TwseLimitCapture = { url: urls.json, body: datedBody, sha256: data.datedSha256, ...clock };
    return { session, sessionAuthorityId: data.sessionAuthorityId, csv, dated };
  } catch { return null; }
}
