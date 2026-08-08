import { expect, test } from '@playwright/test';

test('radar buckets: values vary, buckets do not overlap, and formal cards carry names', async ({ page }) => {
  const response = await page.request.get('/api/radar/daily');
  expect(response.status()).toBe(200);

  const radar = (await response.json()) as {
    opportunities?: Array<{
      symbol: string;
      chineseName?: string | null;
      recommendationBucket?: string | null;
      currentPrice?: number | null;
      baseTarget?: number | null;
      expectedUpsidePct?: number | null;
    }>;
    scenarioUpsideCandidates?: Array<{ symbol: string; expectedUpsidePct?: number | null }>;
    fallbackOpportunities90d?: Array<{ symbol: string; firstRecommendedAt?: string | null }>;
    earlyWatchlist?: Array<{ symbol: string }>;
  };

  const formal = radar.opportunities || [];
  const scenario = radar.scenarioUpsideCandidates || [];
  const fallback = radar.fallbackOpportunities90d || [];
  const totalVisible = formal.length + scenario.length + fallback.length + (radar.earlyWatchlist?.length || 0);
  expect(totalVisible).toBeGreaterThan(0);

  for (const item of formal.slice(0, 10)) {
    expect(item.symbol).toMatch(/^\d{4}$/);
    expect(item.chineseName).toBeTruthy();
    expect(item.recommendationBucket === 'high_conviction' || item.recommendationBucket === 'early_formal').toBeTruthy();
    if (item.currentPrice != null && item.baseTarget != null) {
      expect(item.baseTarget).toBeGreaterThan(item.currentPrice);
    }
  }

  if (scenario.length > 1) {
    const rounded = scenario
      .map((item) => item.expectedUpsidePct)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .map((value) => value.toFixed(1));
    expect(new Set(rounded).size).toBeGreaterThan(1);
  }

  const scenarioSymbols = new Set(scenario.map((item) => item.symbol));
  const overlap = fallback.filter((item) => scenarioSymbols.has(item.symbol));
  expect(overlap).toHaveLength(0);

  for (const item of fallback.slice(0, 10)) {
    expect(item.firstRecommendedAt).toBeTruthy();
  }
});
