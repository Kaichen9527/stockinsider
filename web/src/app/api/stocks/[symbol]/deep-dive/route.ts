import { NextResponse } from 'next/server';
import { getStockDeepDiveLookup, getStockTechnicalLookup } from '@/lib/domain';
import type { StockDeepDivePayload, StockDeepDivePendingPayload } from '@/lib/types';

const LIGHT_CHART_BARS = 260;

function trimChart<T>(chart: T[] | undefined, max = LIGHT_CHART_BARS) {
  return Array.isArray(chart) ? chart.slice(-max) : [];
}

function trimTextList<T>(items: T[] | undefined, max = 4) {
  return Array.isArray(items) ? items.slice(0, max) : [];
}

function trimText(value: string | null | undefined, max = 180): string | null {
  if (typeof value !== 'string') return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function compactConnectorStatusList(items: StockDeepDivePayload['connectorStatus'] | undefined) {
  return trimTextList(items, 12).map((item) => ({
    connector: item.connector,
    credentialStatus: item.credentialStatus,
    lastCheckedAt: item.lastCheckedAt,
    lastRunStatus: item.lastRunStatus,
    lastRunAt: item.lastRunAt,
    lastSuccessAt: item.lastSuccessAt,
    lastRecordsWritten: item.lastRecordsWritten,
    lastErrorSummary: trimText(item.lastErrorSummary, 120),
    recordsWritten24h: item.recordsWritten24h,
    failureReason: trimText(item.failureReason, 120),
    refreshTier: item.refreshTier,
    workerFreshnessStatus: item.workerFreshnessStatus,
    accountFeedStatus: item.accountFeedStatus,
    searchedTargets: trimTextList(item.searchedTargets, 4),
    matchedSymbols: trimTextList(item.matchedSymbols, 6),
  }));
}

function compactReportSnapshot(payload: StockDeepDivePayload): StockDeepDivePayload['reportSnapshot'] {
  if (!payload.reportSnapshot) return payload.reportSnapshot;
  return {
    ...payload.reportSnapshot,
    summaryBullets: trimTextList(payload.reportSnapshot.summaryBullets, 3),
    sections: trimTextList(payload.reportSnapshot.sections, 4).map((section) => ({
      ...section,
      paragraphs: trimTextList(section.paragraphs, 2),
      bullets: trimTextList(section.bullets, 3),
      sourceRefs: trimTextList(section.sourceRefs, 4),
    })),
  };
}

function compactCaseDetail<T extends NonNullable<NonNullable<StockDeepDivePayload['valuationPanel']>['baseCaseDetail']> | null | undefined>(
  detail: T,
): T {
  if (!detail) return detail;
  return {
    ...detail,
    driver: trimText(detail.driver, 160),
    insufficientBridgeReason: trimText(detail.insufficientBridgeReason, 160),
    estimatedFields: trimTextList(detail.estimatedFields, 6),
    sharedBasisRefs: trimTextList(detail.sharedBasisRefs, 4),
    deltaAssumptions: trimTextList(detail.deltaAssumptions, 3)
      .map((item) => trimText(item, 140))
      .filter((item): item is string => Boolean(item)),
    promotionEvidenceRefs: trimTextList(detail.promotionEvidenceRefs, 4),
    achievementChecklist: trimTextList(detail.achievementChecklist, 5).map((item) => ({
      ...item,
      summary: trimText(item.summary, 140),
      scoreReason: trimText(item.scoreReason, 120),
      sourceRefs: trimTextList(item.sourceRefs, 3),
    })),
    marketSizingBridge: trimText(detail.marketSizingBridge, 140),
    revenueBridge: trimText(detail.revenueBridge, 140),
    marginBridge: trimText(detail.marginBridge, 140),
    earningsBridge: trimText(detail.earningsBridge, 140),
    multipleBridge: trimText(detail.multipleBridge, 140),
    priceBridge: trimText(detail.priceBridge, 140),
    benchmarkRange: trimText(detail.benchmarkRange, 120),
    assumptions: trimTextList(detail.assumptions, 5)
      .map((item) => trimText(item, 120))
      .filter((item): item is string => Boolean(item)),
    evidenceRefs: trimTextList(detail.evidenceRefs, 5),
    evidenceBasis: trimTextList(detail.evidenceBasis, 5)
      .map((item) => trimText(item, 120))
      .filter((item): item is string => Boolean(item)),
    sourceRefs: trimTextList(detail.sourceRefs, 5),
    customerExposure: trimText(detail.customerExposure, 120),
    transcriptEvidence: trimText(detail.transcriptEvidence, 120),
    monthlyRevenueEvidence: trimText(detail.monthlyRevenueEvidence, 120),
    productMixEvidence: trimText(detail.productMixEvidence, 120),
    marketShareEvidence: trimText(detail.marketShareEvidence, 120),
  } as T;
}

function compactValuationPanel(payload: StockDeepDivePayload): StockDeepDivePayload['valuationPanel'] {
  if (!payload.valuationPanel) return payload.valuationPanel;
  const panel = payload.valuationPanel;
  return {
    ...panel,
    sourceCitationMap: trimTextList(panel.sourceCitationMap, 10),
    assumptionLedger: trimTextList(panel.assumptionLedger, 8).map((item) => ({
      ...item,
      sourceRefs: trimTextList(item.sourceRefs, 4),
    })),
    valuationReviewFlags: trimTextList(panel.valuationReviewFlags, 4),
    mlForecastBand: panel.mlForecastBand
      ? {
          ...panel.mlForecastBand,
          horizons: trimTextList(panel.mlForecastBand.horizons, 3),
          featureSet: trimTextList(panel.mlForecastBand.featureSet, 8),
          featureAttribution: trimTextList(panel.mlForecastBand.featureAttribution, 3),
          sourceRefs: trimTextList(panel.mlForecastBand.sourceRefs, 4),
        }
      : panel.mlForecastBand,
    sharedVerifiedBasis: panel.sharedVerifiedBasis
      ? {
          ...panel.sharedVerifiedBasis,
          summary: trimText(panel.sharedVerifiedBasis.summary, 160),
          customerExposure: trimText(panel.sharedVerifiedBasis.customerExposure, 140),
          transcriptEvidence: trimText(panel.sharedVerifiedBasis.transcriptEvidence, 140),
          monthlyRevenueEvidence: trimText(panel.sharedVerifiedBasis.monthlyRevenueEvidence, 140),
          productMixEvidence: trimText(panel.sharedVerifiedBasis.productMixEvidence, 140),
          marketShareEvidence: trimText(panel.sharedVerifiedBasis.marketShareEvidence, 140),
          currentFinancialBaseline: trimText(panel.sharedVerifiedBasis.currentFinancialBaseline, 140),
          evidenceBasis: trimTextList(panel.sharedVerifiedBasis.evidenceBasis, 5)
            .map((item) => trimText(item, 120))
            .filter((item): item is string => Boolean(item)),
          sharedBasisRefs: trimTextList(panel.sharedVerifiedBasis.sharedBasisRefs, 5),
          sourceRefs: trimTextList(panel.sharedVerifiedBasis.sourceRefs, 5),
        }
      : panel.sharedVerifiedBasis,
    baseCaseDetail: compactCaseDetail(panel.baseCaseDetail),
    scenarioCaseDetail: compactCaseDetail(panel.scenarioCaseDetail),
  };
}

function payloadHeaders(mode: 'full' | 'light' | 'status') {
  const cacheControl =
    mode === 'full'
      ? 'public, s-maxage=60, stale-while-revalidate=300'
      : 'public, s-maxage=30, stale-while-revalidate=120';
  return {
    'Cache-Control': cacheControl,
    'x-stockinsider-payload-mode': mode,
  };
}

function compactPendingStatus(data: StockDeepDivePendingPayload) {
  return {
    status: data.status,
    symbol: data.symbol,
    reason: data.reason,
    retryAfterSec: data.retryAfterSec,
    triggeredJobs: data.triggeredJobs || [],
    chipEntryAssessment: data.chipEntryAssessment || null,
  };
}

function compactStatusPayload(payload: StockDeepDivePayload) {
  return {
    symbol: payload.symbol,
    name: payload.name,
    market: payload.market,
    targetSnapshot: payload.targetSnapshot
      ? {
          currentPrice: payload.targetSnapshot.currentPrice ?? null,
          priceAsOf: payload.targetSnapshot.priceAsOf ?? null,
          baseTarget: payload.targetSnapshot.baseTarget ?? null,
          scenarioTarget: payload.targetSnapshot.upsideTarget ?? null,
          reportUpdatedAt: payload.targetSnapshot.reportUpdatedAt ?? null,
          latestSourceAt: payload.targetSnapshot.latestSourceAt ?? null,
          bridgeCompleteness: payload.targetSnapshot.bridgeCompleteness ?? null,
          revaluationStatus: payload.targetSnapshot.revaluationStatus ?? null,
          staleReason: payload.targetSnapshot.staleReason ?? null,
        }
      : null,
    summaryCard: payload.summaryCard
      ? {
          currentPrice: payload.summaryCard.currentPrice ?? null,
          baseTarget: payload.summaryCard.baseTarget ?? null,
          upsidePct: payload.summaryCard.upsidePct ?? null,
          lastUpdatedAt: payload.summaryCard.lastUpdatedAt ?? null,
          latestSourceAt: payload.summaryCard.latestSourceAt ?? null,
          freshness: payload.summaryCard.freshness ?? null,
        }
      : null,
    dataHealth: payload.dataHealth
      ? {
          marketDataAsOf: payload.dataHealth.marketDataAsOf ?? null,
          researchSourceAsOf: payload.dataHealth.researchSourceAsOf ?? null,
          reportBuiltAt: payload.dataHealth.reportBuiltAt ?? null,
          freshnessStatus: payload.dataHealth.freshnessStatus ?? null,
          priceRefreshStatus: payload.dataHealth.priceRefreshStatus ?? null,
        }
      : null,
    autoRefreshTriggered: Boolean(payload.autoRefreshTriggered),
  };
}

function compactLightPayload(payload: StockDeepDivePayload): StockDeepDivePayload {
  return {
    ...payload,
    reportSnapshot: compactReportSnapshot(payload),
    valuationPanel: compactValuationPanel(payload),
    chart: trimChart(payload.chart),
    timeframeCharts: undefined,
    latestFacts: (payload.latestFacts || []).slice(0, 6),
    latestEvidence: (payload.latestEvidence || []).slice(0, 6),
    freshSourceHighlights: (payload.freshSourceHighlights || []).slice(0, 10),
    sourceCoverage: (payload.sourceCoverage || []).slice(0, 12),
    communitySignals: (payload.communitySignals || []).slice(0, 8),
    brokerViews: (payload.brokerViews || []).slice(0, 5),
    kolCoverage: (payload.kolCoverage || []).slice(0, 8),
    podcastMentions: (payload.podcastMentions || []).slice(0, 4),
    evidenceItems: (payload.evidenceItems || []).slice(0, 8),
    evidenceMatrix: [],
    scenarioNarratives: [],
    scenarioBridges: [],
    sourceAppendix: [],
    sourceGroups: undefined,
    appendix: payload.appendix
      ? {
          technicalSummary: payload.appendix.technicalSummary || payload.technicalSummary || null,
          sourceAppendix: [],
          evidenceMatrix: [],
          connectorStatus: compactConnectorStatusList(payload.appendix.connectorStatus),
          coverageStatus: (payload.appendix.coverageStatus || []).slice(0, 12),
          emptyState: payload.appendix.emptyState,
        }
      : undefined,
    connectorStatus: compactConnectorStatusList(payload.connectorStatus),
  };
}

export async function GET(_req: Request, context: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await context.params;
    const url = new URL(_req.url);
    const view = url.searchParams.get('view') || url.searchParams.get('mode') || 'full';
    const mode = view === 'status' ? 'status' : view === 'light' ? 'light' : 'full';
    const lookup = mode === 'full'
      ? await getStockDeepDiveLookup(symbol.toUpperCase())
      : await getStockTechnicalLookup(symbol.toUpperCase());
    if (lookup.status === 'not_found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: payloadHeaders(mode) });
    }
    if (lookup.status === 'pending') {
      return NextResponse.json(
        mode === 'full' ? lookup.data : compactPendingStatus(lookup.data),
        { status: 202, headers: payloadHeaders(mode) },
      );
    }
    if (mode === 'status') {
      return NextResponse.json(compactStatusPayload(lookup.data), { headers: payloadHeaders(mode) });
    }
    if (mode === 'light') {
      return NextResponse.json(compactLightPayload(lookup.data), { headers: payloadHeaders(mode) });
    }
    return NextResponse.json(lookup.data, { headers: payloadHeaders(mode) });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
