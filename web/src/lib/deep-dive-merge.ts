const FULL_AUTHORITATIVE_DEEP_DIVE_FIELDS = new Set([
  'targetSnapshot', 'valuationPanel', 'valuationSummary', 'tradeDecision', 'technicalEntrySignal',
  'recommendationStance', 'investmentConclusion', 'sourceCoverage', 'evidenceItems', 'evidenceMatrix',
  'sourceProvenance', 'freshSourceHighlights', 'sourceAppendix', 'connectorStatus',
]);

function fillMissingLeaves(full: unknown, light: unknown, path: string[] = []): unknown {
  const root = path[0] ?? null;
  if (root && FULL_AUTHORITATIVE_DEEP_DIVE_FIELDS.has(root) && full !== undefined) return full;
  if (full === undefined) return light;
  if (full === null) return null;
  if (Array.isArray(full)) return full;
  if (typeof full !== 'object' || Array.isArray(light) || light === null || typeof light !== 'object') return full;
  const fullRecord = full as Record<string, unknown>;
  const lightRecord = light as Record<string, unknown>;
  return Object.fromEntries([...new Set([...Object.keys(lightRecord), ...Object.keys(fullRecord)])]
    .map((key) => [key, fillMissingLeaves(fullRecord[key], lightRecord[key], [...path, key])]));
}

export function mergeAuthoritativeDeepDiveLeaves<T>(fullPayload: T, lightPayload: T): T {
  return fillMissingLeaves(fullPayload, lightPayload) as T;
}
