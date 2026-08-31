type FetchTextResponse = Pick<Response, 'ok' | 'status' | 'text'>;
type FetchTextImplementation = (input: string, init: RequestInit) => Promise<FetchTextResponse>;

export type SourceFetchFailureCode =
  | 'timeout'
  | 'connect_timeout'
  | 'network'
  | `http_${number}`;

export class SourceFetchError extends Error {
  readonly code: SourceFetchFailureCode;

  constructor(code: SourceFetchFailureCode) {
    super(`source_fetch_${code}`);
    this.name = 'SourceFetchError';
    this.code = code;
  }
}

export function sourceFetchFailureCode(error: unknown): SourceFetchFailureCode {
  if (error instanceof SourceFetchError) return error.code;
  const candidate = error as { name?: unknown; cause?: { code?: unknown } } | null;
  const name = typeof candidate?.name === 'string' ? candidate.name : '';
  const causeCode = typeof candidate?.cause?.code === 'string' ? candidate.cause.code : '';
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
  if (causeCode === 'UND_ERR_CONNECT_TIMEOUT') return 'connect_timeout';
  return 'network';
}

function retryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function fetchTextWithRetry({
  url,
  headers,
  timeoutMs,
  attempts = 3,
  retryDelayMs = 250,
  fetchImplementation = fetch,
  sleep = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
}: {
  url: string;
  headers: HeadersInit;
  timeoutMs: number;
  attempts?: number;
  retryDelayMs?: number;
  fetchImplementation?: FetchTextImplementation;
  sleep?: (delayMs: number) => Promise<void>;
}): Promise<{ text: string; attempts: number }> {
  const maxAttempts = Math.max(1, Math.floor(attempts));
  let lastFailure: SourceFetchFailureCode = 'network';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImplementation(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return { text: await response.text(), attempts: attempt };

      lastFailure = `http_${response.status}`;
      if (!retryableStatus(response.status)) throw new SourceFetchError(lastFailure);
    } catch (error) {
      const failure = sourceFetchFailureCode(error);
      if (error instanceof SourceFetchError || attempt === maxAttempts) throw error instanceof SourceFetchError
        ? error
        : new SourceFetchError(failure);
      lastFailure = failure;
    }

    if (attempt < maxAttempts) await sleep(retryDelayMs * attempt);
  }

  throw new SourceFetchError(lastFailure);
}
