export async function runIsolatedSourceBatch<T>(
  connectors: readonly string[],
  execute: (connector: string) => Promise<T>,
  recover: (connector: string, error: unknown) => T,
): Promise<T[]> {
  const results: T[] = [];
  for (const connector of connectors) {
    try {
      results.push(await execute(connector));
    } catch (error) {
      results.push(recover(connector, error));
    }
  }
  return results;
}
