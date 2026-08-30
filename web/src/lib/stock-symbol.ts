const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TW_SYMBOL_PATTERN = /^\d{4}$/u;
const GLOBAL_SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/u;

export function normalizeRelatedStockSymbols(values: unknown, stockSymbolById: ReadonlyMap<string, string> = new Map()): string[] {
  if (!Array.isArray(values)) return [];
  const output: string[] = [];
  for (const value of values) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    const mapped = stockSymbolById.get(raw);
    const symbol = String(mapped || raw).trim().toUpperCase();
    if (UUID_PATTERN.test(symbol)) continue;
    if (!TW_SYMBOL_PATTERN.test(symbol) && !GLOBAL_SYMBOL_PATTERN.test(symbol)) continue;
    if (!output.includes(symbol)) output.push(symbol);
  }
  return output;
}
