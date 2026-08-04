import { requireExactInternalBearer } from '../internal-auth.ts';

export { requireExactInternalBearer };

export function fixedRunnerPrincipal(): string | null {
  const value = process.env.OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID ?? '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value) ? value : null;
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<{ raw: string; value: unknown } | null> {
  if (request.headers.get('content-type')?.toLowerCase() !== 'application/json') return null;
  const contentLength = request.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength) || Number(contentLength) > maxBytes)
  ) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  try {
    return { raw, value: parseJsonWithoutDuplicateKeys(raw) };
  } catch {
    return null;
  }
}

export function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function parseJsonWithoutDuplicateKeys(input: string): unknown {
  let index = 0;
  const whitespace = () => { while (/[\t\n\r ]/u.test(input[index] ?? '')) index += 1; };
  const string = () => {
    const start = index;
    if (input[index] !== '"') throw new SyntaxError('string');
    index += 1;
    while (index < input.length) {
      if (input[index] === '"') {
        index += 1;
        return JSON.parse(input.slice(start, index)) as string;
      }
      if (input[index] === '\\') {
        index += input[index + 1] === 'u' ? 6 : 2;
        continue;
      }
      if (input.charCodeAt(index) < 0x20) throw new SyntaxError('control');
      index += 1;
    }
    throw new SyntaxError('unterminated');
  };
  const value = (): unknown => {
    whitespace();
    if (input[index] === '"') return string();
    if (input[index] === '{') {
      index += 1;
      whitespace();
      const output: Record<string, unknown> = {};
      const keys = new Set<string>();
      if (input[index] === '}') { index += 1; return output; }
      while (true) {
        whitespace();
        const key = string();
        if (keys.has(key)) throw new SyntaxError('duplicate');
        keys.add(key);
        whitespace();
        if (input[index] !== ':') throw new SyntaxError('colon');
        index += 1;
        output[key] = value();
        whitespace();
        if (input[index] === '}') { index += 1; return output; }
        if (input[index] !== ',') throw new SyntaxError('comma');
        index += 1;
      }
    }
    if (input[index] === '[') {
      index += 1;
      whitespace();
      const output: unknown[] = [];
      if (input[index] === ']') { index += 1; return output; }
      while (true) {
        output.push(value());
        whitespace();
        if (input[index] === ']') { index += 1; return output; }
        if (input[index] !== ',') throw new SyntaxError('comma');
        index += 1;
      }
    }
    for (const [token, parsed] of [['true', true], ['false', false], ['null', null]] as const) {
      if (input.startsWith(token, index)) { index += token.length; return parsed; }
    }
    const match = input.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
    if (!match) throw new SyntaxError('value');
    index += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) throw new SyntaxError('number');
    return number;
  };
  const parsed = value();
  whitespace();
  if (index !== input.length) throw new SyntaxError('trailing');
  return parsed;
}
