export type SignalFreshness = 'fresh' | 'stale' | 'missing';

export type StrategyState = 'active' | 'hit_target' | 'hit_stop_loss' | 'invalidated' | 'closed';

export interface DailyMarketFocus {
  market: 'TW' | 'US';
  asOf: string;
  sectorFlows: Record<string, number>;
  indexState: Record<string, unknown>;
  freshness: SignalFreshness;
}

export interface RecommendationCard {
  recommendationId: string;
  symbol: string;
  name: string;
  market: 'TW' | 'US';
  score: number;
  confidence: number;
  action: 'buy' | 'watch' | 'reduce';
  rationale: string;
  targetPrice?: number | null;
  stopLoss?: number | null;
  strategyState?: StrategyState;
}

export interface StrategyActionView {
  id: string;
  recommendationId: string;
  entryRule: string;
  positionSizeRule: string;
  targetPrice: number | null;
  stopLoss: number | null;
  reviewHorizon: string | null;
  state: StrategyState;
}

export interface StockInsightPayload {
  symbol: string;
  name: string;
  market: 'TW' | 'US';
  price: number;
  volume: number | null;
  asOf: string;
  freshness: SignalFreshness;
  chart: Array<{ time: string; open: number; high: number; low: number; close: number }>;
  indicators: {
    maShort: number | null;
    maMid: number | null;
    maLong: number | null;
    rsi: number | null;
    macd: number | null;
    macdSignal: number | null;
  };
  chipMetrics: Record<string, unknown>;
  strategy?: StrategyActionView;
  recommendation?: RecommendationCard;
  riskDisclosure: string;
}

export interface LinePreference {
  lineUserId: string;
  watchlist: string[];
  eventPreferences: {
    hit_target?: boolean;
    hit_stop_loss?: boolean;
    state_changed?: boolean;
    daily_digest?: boolean;
  };
  digestEnabled: boolean;
  throttleMinutes: number;
}
