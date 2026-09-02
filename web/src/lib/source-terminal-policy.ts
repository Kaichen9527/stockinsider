const HEALTHY_SOURCE_TERMINALS = new Set([
  'success',
  'valid',
  'successful_empty',
  'duplicate_only',
]);

export function isHealthySourceTerminal(status: unknown) {
  return HEALTHY_SOURCE_TERMINALS.has(String(status || ''));
}
