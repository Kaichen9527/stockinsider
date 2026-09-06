import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCandidateMopsFacts } from './candidate-official-financials.ts';

test('candidate official MOPS history accepts only consolidated year-to-date facts with an auditable filing date', () => {
    const html = `
      <xbrli:context id="good"><xbrli:period><xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
      <xbrli:context id="segment"><xbrli:scenario><xbrldi:explicitMember>division</xbrldi:explicitMember></xbrli:scenario><xbrli:period><xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
      <ix:nonNumeric name="tifrs-notes:ReviewAuditDate">115/08/10</ix:nonNumeric>
      <ix:nonFraction name="ifrs-full:Revenue" contextRef="good" unitRef="TWD">1,200</ix:nonFraction>
      <ix:nonFraction name="ifrs-full:GrossProfit" contextRef="good" unitRef="TWD">500</ix:nonFraction>
      <ix:nonFraction name="ifrs-full:ProfitLossFromOperatingActivities" contextRef="good" unitRef="TWD">250</ix:nonFraction>
      <ix:nonFraction name="ifrs-full:ProfitLossAttributableToOwnersOfParent" contextRef="good" unitRef="TWD">180</ix:nonFraction>
      <ix:nonFraction name="tifrs-notes:DilutedEarningsPerShare" contextRef="good" unitRef="EarningsPerShare">1.8</ix:nonFraction>
      <ix:nonFraction name="tifrs-notes:WeightedAverageNumberOfDilutedSharesOutstanding" contextRef="good" unitRef="Shares">100</ix:nonFraction>
      <ix:nonFraction name="ifrs-full:Revenue" contextRef="segment" unitRef="TWD">9999</ix:nonFraction>
      ${' '.repeat(120)}
    `;
    const facts = parseCandidateMopsFacts(html, {
      stockId: '10000000-0000-4000-8000-000000000001', symbol: '2330', exchange: 'TWSE',
      sourceUrl: 'https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID=2330&SYEAR=115&SSEASON=2&REPORT_ID=C',
      collectedAt: '2026-08-11T00:00:00Z',
    });
    assert.deepEqual(facts.map((row) => row.factKey).sort(), [
      'diluted_weighted_average_shares', 'quarterly_diluted_eps', 'quarterly_gross_profit',
      'quarterly_net_income_attributable_to_common', 'quarterly_operating_income', 'quarterly_revenue',
    ]);
    assert.equal(facts.find((row) => row.factKey === 'quarterly_revenue')?.value, 1200);
    assert.equal(facts.every((row) => row.periodStart === '2026-01-01' && row.filingPublishedAt === '2026-08-11T00:00:00.000Z' && row.sourceTimestamp === '2026-08-11T00:00:00.000Z'), true);
    assert.equal(facts.every((row) => row.provider === 'mops'), true);
});
