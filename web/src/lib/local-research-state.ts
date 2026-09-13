export const LOCAL_RESEARCH_STORAGE_KEY = 'stockinsider:research-workspace:v1';
export const LOCAL_RESEARCH_STATE_VERSION = 1 as const;
export const LOCAL_RESEARCH_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const LOCAL_RESEARCH_ENTRY_LIMIT = 500;

export type LocalResearchDecision = 'watch' | 'consider' | 'skip';
export type LocalSimulation = {
  symbol: string; revisionId: string; entryPrice: number | null; stopPrice: number | null;
  capital: number | null; maxLoss: number | null; updatedAt: string;
};
export type LocalDecisionRecord = { symbol: string; revisionId: string; decision: LocalResearchDecision; note: string; updatedAt: string };
export type LocalResearchState = {
  version: 1;
  watchlist: string[];
  simulations: Record<string, LocalSimulation>;
  decisions: Record<string, LocalDecisionRecord>;
  lastSeenRevisionBySymbol: Record<string, string>;
};

export function emptyLocalResearchState(): LocalResearchState {
  return { version: LOCAL_RESEARCH_STATE_VERSION, watchlist: [], simulations: {}, decisions: {}, lastSeenRevisionBySymbol: {} };
}

function optionalPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function parseLocalResearchState(value: unknown): LocalResearchState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyLocalResearchState();
  const record = value as Record<string, unknown>;
  if (record.version !== LOCAL_RESEARCH_STATE_VERSION) return emptyLocalResearchState();
  const watchlist = Array.isArray(record.watchlist) ? [...new Set(record.watchlist.filter((item): item is string => typeof item === 'string' && /^\d{4}$/u.test(item)))].slice(0, 500) : [];
  const simulations: LocalResearchState['simulations'] = {};
  for (const [key, item] of Object.entries(record.simulations && typeof record.simulations === 'object' ? record.simulations as Record<string, unknown> : {}).slice(0, LOCAL_RESEARCH_ENTRY_LIMIT)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const input = item as Record<string, unknown>;
    if (typeof input.symbol !== 'string' || !/^\d{4}$/u.test(input.symbol) || typeof input.revisionId !== 'string' || key !== `${input.symbol}:${input.revisionId}`) continue;
    simulations[key] = { symbol: input.symbol, revisionId: input.revisionId, entryPrice: optionalPositiveNumber(input.entryPrice), stopPrice: optionalPositiveNumber(input.stopPrice), capital: optionalPositiveNumber(input.capital), maxLoss: optionalPositiveNumber(input.maxLoss), updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date(0).toISOString() };
  }
  const decisions: LocalResearchState['decisions'] = {};
  for (const [key, item] of Object.entries(record.decisions && typeof record.decisions === 'object' ? record.decisions as Record<string, unknown> : {}).slice(0, LOCAL_RESEARCH_ENTRY_LIMIT)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const input = item as Record<string, unknown>;
    if (typeof input.symbol !== 'string' || !/^\d{4}$/u.test(input.symbol) || typeof input.revisionId !== 'string' || key !== `${input.symbol}:${input.revisionId}` || !['watch', 'consider', 'skip'].includes(String(input.decision))) continue;
    decisions[key] = { symbol: input.symbol, revisionId: input.revisionId, decision: input.decision as LocalResearchDecision, note: typeof input.note === 'string' ? input.note.slice(0, 2000) : '', updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date(0).toISOString() };
  }
  const seen = record.lastSeenRevisionBySymbol && typeof record.lastSeenRevisionBySymbol === 'object' && !Array.isArray(record.lastSeenRevisionBySymbol)
    ? Object.fromEntries(Object.entries(record.lastSeenRevisionBySymbol as Record<string, unknown>).filter(([symbol, revision]) => /^\d{4}$/u.test(symbol) && typeof revision === 'string').slice(0, LOCAL_RESEARCH_ENTRY_LIMIT)) as Record<string, string>
    : {};
  return { version: 1, watchlist, simulations, decisions, lastSeenRevisionBySymbol: seen };
}

export function decodeLocalResearchState(serialized: string) {
  try { return parseLocalResearchState(JSON.parse(serialized)); }
  catch { return emptyLocalResearchState(); }
}

export function calculatePosition(input: { capital: number | null; maxLoss: number | null; entryPrice: number | null; stopPrice: number | null; baseTarget: number | null }) {
  const { capital, maxLoss, entryPrice, stopPrice, baseTarget } = input;
  if (!capital || !maxLoss || !entryPrice || !stopPrice || stopPrice >= entryPrice) return null;
  const riskPerShare = entryPrice - stopPrice;
  const shares = Math.max(0, Math.floor(Math.min(capital / entryPrice, maxLoss / riskPerShare)));
  if (!shares) return null;
  return {
    shares, exposure: shares * entryPrice, riskAmount: shares * riskPerShare,
    tradeRewardRisk: baseTarget && baseTarget > entryPrice ? (baseTarget - entryPrice) / riskPerShare : null,
  };
}
