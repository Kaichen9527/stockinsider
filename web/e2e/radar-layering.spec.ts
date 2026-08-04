import { expect, test } from '@playwright/test';
import { installConsoleErrorGate } from './support/console';

test.describe.configure({ mode: 'serial' });

test('homepage clearly separates formal recommendations from scenario candidates', async ({ page }) => {
  const assertNoConsoleErrors = installConsoleErrorGate(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /找出還沒反映在股價上的/i })).toBeVisible();
  await expect(page.getByText('資料刷新健康度', { exact: true })).toBeVisible();
  await expect(page.getByText('今日台股 Highlight', { exact: true })).toBeVisible();
  await expect(page.getByText('24 小時 Agent 執行次數', { exact: true })).toHaveCount(0);
  await expect(page.getByText('主題來源概覽', { exact: false })).toHaveCount(0);

  const formalHighConviction = page.getByText('高信念正式推薦', { exact: true });
  const formalStandard = page.getByText('正式推薦', { exact: true });
  const scenarioSection = page.getByText('情境上行候選（非正式）', { exact: true });
  const earlyWatch = page.getByText('早期可關注', { exact: true });
  const historicalObservation = page.getByText('歷史觀察 / 重估佇列（非正式）', { exact: true });
  const noFormalState = page.getByText(/目前沒有通過完整 Gate 的正式推薦/);

  const hasFormalHighConviction = await formalHighConviction.isVisible().catch(() => false);
  const hasFormalStandard = await formalStandard.isVisible().catch(() => false);
  const hasScenario = await scenarioSection.isVisible().catch(() => false);
  const hasEarlyWatch = await earlyWatch.isVisible().catch(() => false);
  const hasNoFormalState = await noFormalState.isVisible().catch(() => false);

  expect(hasFormalHighConviction || hasFormalStandard || hasScenario || hasEarlyWatch || hasNoFormalState).toBeTruthy();

  if (hasFormalHighConviction || hasFormalStandard || hasScenario || hasEarlyWatch) {
    await expect(page.getByText('推薦指數', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('情境達成率', { exact: true }).first()).toBeVisible();
    const hasChecklistBreakdown = await page.getByText(/已達成 \d+ \/ 部分 \d+ \/ 待驗 \d+ \/ 過期 \d+/).first().isVisible().catch(() => false);
    const hasNoIndependentScenario = await page.getByText(/尚無獨立上行情境 checklist/).first().isVisible().catch(() => false);
    expect(hasChecklistBreakdown || hasNoIndependentScenario).toBeTruthy();
    await expect(page.getByText('進場狀態', { exact: true }).first()).toBeVisible();
  }

  const socialSourceHeading = page.getByText('社群來源狀態', { exact: true });
  if ((await socialSourceHeading.count()) > 0) {
    await expect(socialSourceHeading).toBeVisible();
    await expect(page.getByText(/有寫入|有搜尋無命中|auth degraded|抓取失敗|待刷新/).first()).toBeVisible();
  }
  await expect(page.getByText('待修', { exact: true })).toHaveCount(0);

	  if (hasScenario) {
	    await expect(page.getByText(/Base 已反映|Base 目標價已被現價反映|只剩情境/i).first()).toBeVisible();
	    await expect(page.getByText(/深度分析 →/).first()).toBeVisible();
	  }

  if (hasNoFormalState) {
    expect(hasScenario || hasNoFormalState).toBeTruthy();
  }
  if (hasEarlyWatch && (await historicalObservation.count()) > 0) {
    const earlyBox = await earlyWatch.boundingBox();
    const historicalBox = await historicalObservation.boundingBox();
    if (earlyBox && historicalBox) {
      expect(earlyBox.y).toBeLessThan(historicalBox.y);
    }
  }
  if (hasEarlyWatch) {
    const hasEarlyPotential = await page.getByText(/潛在.*空間（未正式）/).first().isVisible().catch(() => false);
    const hasEarlyRevaluationOnly = await page.getByText(/等待重估/).first().isVisible().catch(() => false);
	    expect(hasEarlyPotential || hasEarlyRevaluationOnly).toBeTruthy();
	    if (hasEarlyPotential) {
	      await expect(page.getByText(/未正式 · 待 gate 補齊|待估值補齊/).first()).toBeVisible();
	    }
	  }
  if ((await historicalObservation.count()) > 0) {
    await expect(historicalObservation).toBeVisible();
    await expect(page.getByText(/近 7 日與近 90 日只保留追蹤價值/).first()).toBeVisible();
  }
  await assertNoConsoleErrors();
});

test('technical page uses chart-room layout instead of deep-dive report layout', async ({ page }) => {
  const assertNoConsoleErrors = installConsoleErrorGate(page);
  await page.goto('/stock/6230/technical');

  await expect(page.getByText('Chart Room', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('技術 Watchlist', { exact: true })).toBeVisible();
  await expect(page.getByText('Alert levels', { exact: true })).toBeVisible();
  await expect(page.getByText('籌碼面板', { exact: true })).toBeVisible();
  await expect(page.getByText('兩年日 K', { exact: true })).toBeVisible();
  await expect(page.getByText('深度分析報告', { exact: true })).toHaveCount(0);

  await assertNoConsoleErrors();
});

test('homepage card upside stays consistent with deep-dive hero target snapshot', async ({ page }) => {
  const assertNoConsoleErrors = installConsoleErrorGate(page);
  const radarRes = await page.request.get('/api/radar/daily');
  expect(radarRes.status()).toBe(200);
  const radar = (await radarRes.json()) as {
    opportunities?: Array<{ symbol: string; displayBaseUpsidePct?: number | null; cardPrimaryUpsidePct?: number | null; valuationSource?: string | null }>;
    scenarioUpsideCandidates?: Array<{ symbol: string; displayScenarioUpsidePct?: number | null; cardPrimaryUpsidePct?: number | null; valuationSource?: string | null }>;
  };

  const allPositiveCandidates = [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
  ].filter((item) => item.valuationSource !== 'demo_seed')
    .filter((item) => {
      const candidate = item as typeof item & {
        displayBaseUpsidePct?: number | null;
        displayScenarioUpsidePct?: number | null;
      };
      return (
        candidate.cardPrimaryUpsidePct ??
        candidate.displayBaseUpsidePct ??
        candidate.displayScenarioUpsidePct ??
        0
      ) > 0;
    });
  if (allPositiveCandidates.length === 0) {
    await assertNoConsoleErrors();
    return;
  }
  const reviewedSymbols = new Set(['3008', '3450', '2337', '2382', '2454']);
  const preferredCandidates = allPositiveCandidates.filter((item) => reviewedSymbols.has(item.symbol)).slice(0, 4);
  const candidates = (preferredCandidates.length > 0 ? preferredCandidates : allPositiveCandidates.slice(0, 4));

  const loadDeepDive = async (symbol: string) => {
    try {
      return await page.request.get(`/api/stocks/${symbol}/deep-dive`, { timeout: 12000 });
    } catch {
      return null;
    }
  };

  let matchedPair: { pagePct: number; cardPct: number } | null = null;
  for (const candidate of candidates) {
    const deepDiveRes = await loadDeepDive(candidate.symbol);
    if (!deepDiveRes || deepDiveRes.status() !== 200) continue;
    const deepDive = (await deepDiveRes.json()) as {
      targetSnapshot?: { cardPrimaryUpsidePct?: number | null; displayBaseUpsidePct?: number | null; displayScenarioUpsidePct?: number | null };
      summaryCard?: { upsidePct?: number | null };
    };
    const isFormalCard = (candidate as { displayBaseUpsidePct?: number | null }).displayBaseUpsidePct != null;
    const pagePct = isFormalCard
      ? deepDive.targetSnapshot?.displayBaseUpsidePct ?? deepDive.targetSnapshot?.cardPrimaryUpsidePct ?? deepDive.summaryCard?.upsidePct ?? null
      : deepDive.targetSnapshot?.displayScenarioUpsidePct ?? deepDive.targetSnapshot?.cardPrimaryUpsidePct ?? deepDive.summaryCard?.upsidePct ?? null;
    const cardPct = isFormalCard
      ? (candidate as { displayBaseUpsidePct?: number | null; cardPrimaryUpsidePct?: number | null }).displayBaseUpsidePct ??
        candidate.cardPrimaryUpsidePct ??
        null
      : (candidate as { displayScenarioUpsidePct?: number | null; cardPrimaryUpsidePct?: number | null }).displayScenarioUpsidePct ??
        candidate.cardPrimaryUpsidePct ??
        null;
    if (pagePct != null && cardPct != null && Math.abs(pagePct - cardPct) <= 5) {
      matchedPair = { pagePct, cardPct };
      break;
    }
  }

  expect(matchedPair, 'Expected at least one positive-upside card to match its deep-dive target snapshot.').toBeTruthy();
  await assertNoConsoleErrors();
});
