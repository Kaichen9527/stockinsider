export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; delaysMs?: number[] }
): Promise<T> {
  const retries = opts?.retries ?? 3;
  const delays = opts?.delaysMs ?? [60_000, 5 * 60_000, 15 * 60_000];
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      const delay = delays[Math.min(attempt - 1, delays.length - 1)] ?? delays[delays.length - 1] ?? 0;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
