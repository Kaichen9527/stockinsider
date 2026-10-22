export async function boundedRequestBody(request: Request): Promise<Record<string, unknown>> {
  if (request.method === 'GET') return {};
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (!reader) return {};
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1_048_576) { await reader.cancel(); throw new Error('vnext_request_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) return {};
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error('vnext_invalid_json'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('vnext_request_object_required');
  const row = body as Record<string, unknown>; const receive = ['author', 'review', 'content'].includes(String(row.action));
  if (!receive && size > 8192) throw new Error('vnext_control_request_too_large');
  function depth(value: unknown, level: number): void {
    if (level > 12) throw new Error('vnext_request_depth_exceeded');
    if (value && typeof value === 'object') for (const entry of Object.values(value)) depth(entry, level + 1);
  }
  depth(row, 0);
  if (row.artifact && new TextEncoder().encode(JSON.stringify(row.artifact)).byteLength > 262144) throw new Error('vnext_article_too_large');
  return row;
}
