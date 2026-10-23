import { createHash } from 'node:crypto';
export type ProviderRequest = { model: string; instructions: string; input: string; store: true; max_output_tokens: number; text: { format: { type: 'json_object' } } };
export type ProviderOutcome = { status: 'completed'; responseId: string; output: unknown; raw: unknown } | { status: 'pending'; responseId: string; raw: unknown } | { status: 'failed'; responseId: string | null; reason: string; raw: unknown };
export interface ResearchProvider { invoke(request: ProviderRequest, invocationId: string, deadline: string): Promise<ProviderOutcome>; lookup(responseId: string, deadline: string): Promise<ProviderOutcome> }
export class ProviderOutcomeUncertain extends Error { constructor(message = 'vnext_provider_outcome_uncertain') { super(message); this.name = 'ProviderOutcomeUncertain'; } }
const responseId = (value: unknown): value is string => typeof value === 'string' && /^resp_[A-Za-z0-9_-]{1,180}$/u.test(value);
async function limitedJson(response: Response) {
  if (!response.body) throw new ProviderOutcomeUncertain('vnext_provider_empty_response');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const result = await reader.read(); if (result.done) break; size += result.value.byteLength; if (size > 262144) { await reader.cancel(); throw new ProviderOutcomeUncertain('vnext_provider_response_too_large'); } chunks.push(result.value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>; } catch { throw new ProviderOutcomeUncertain('vnext_provider_response_invalid_json'); }
}
function boundedDepth(value: unknown,depth=0): boolean { return depth<=12 && (!value || typeof value!=='object' || Object.values(value).every((item)=>boundedDepth(item,depth+1))); }
function outcome(response: Record<string, unknown>): ProviderOutcome {
  if(!boundedDepth(response)) throw new ProviderOutcomeUncertain('vnext_provider_response_too_deep');
  const raw = response; const frozenRaw = { serializedResponse: JSON.stringify(response) };
  if (!responseId(raw.id)) throw new ProviderOutcomeUncertain('vnext_provider_response_identity_missing');
  if (raw.status === 'queued' || raw.status === 'in_progress') return { status: 'pending', responseId: raw.id, raw: frozenRaw };
  if (['failed','cancelled','incomplete'].includes(String(raw.status))) return { status: 'failed', responseId: raw.id, reason: `provider_${String(raw.status)}`, raw: frozenRaw };
  if (raw.status !== 'completed') throw new ProviderOutcomeUncertain('vnext_provider_unknown_status');
  const messages = Array.isArray(raw.output) ? raw.output as Array<Record<string, unknown>> : [];
  const texts = messages.flatMap((message) => message.type === 'message' && Array.isArray(message.content) ? message.content as Array<Record<string, unknown>> : [])
    .filter((content) => content.type === 'output_text' && typeof content.text === 'string').map((content) => String(content.text));
  if (texts.length !== 1) return { status: 'failed', responseId: raw.id, reason: 'provider_output_not_one_json_document', raw: frozenRaw };
  try { return { status: 'completed', responseId: raw.id, output: JSON.parse(texts[0]), raw: frozenRaw }; }
  catch { return { status: 'failed', responseId: raw.id, reason: 'provider_output_invalid_json', raw: frozenRaw }; }
}
/** Fixed existing OpenAI origin. No caller URL, automatic HTTP retry, or assertion
 * that an idempotency header proves provider execution exactly once. */
export function openAiResponsesProvider(apiKey: string): ResearchProvider {
  if (!apiKey || /[\r\n]/u.test(apiKey)) throw new Error('vnext_provider_credential_missing');
  async function request(path: string, method: 'POST'|'GET', deadline: string, body?: ProviderRequest, invocationId?: string) {
    const remaining = Date.parse(deadline)-Date.now(); if (!Number.isFinite(remaining) || remaining<=0) throw new ProviderOutcomeUncertain('vnext_provider_deadline_elapsed');
    let response: Response;
    try { response = await fetch(`https://api.openai.com/v1/responses${path}`, { method, redirect: 'error', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(invocationId ? { 'Idempotency-Key': invocationId } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(Math.max(1,Math.min(100000,remaining))) }); }
    catch { throw new ProviderOutcomeUncertain(); }
    // These are definite request rejections. A 5xx, timeout, lookup miss or
    // malformed transport never authorizes another generation.
    if (method === 'POST' && [400,401,403,404,413,422,429].includes(response.status)) return { status: 'failed' as const, responseId: null, reason: `provider_http_${response.status}`, raw: { httpStatus: response.status } };
    if (!response.ok) throw new ProviderOutcomeUncertain(`vnext_provider_http_uncertain_${response.status}`);
    return outcome(await limitedJson(response));
  }
  return { invoke: (body,id,deadline) => request('', 'POST',deadline,body,id), lookup: (id,deadline) => { if (!responseId(id)) throw new Error('vnext_provider_lookup_identity_invalid'); return request(`/${encodeURIComponent(id)}`,'GET',deadline); } };
}
export const providerCredentialIdentity = (key: string) => createHash('sha256').update(key).digest('hex');
