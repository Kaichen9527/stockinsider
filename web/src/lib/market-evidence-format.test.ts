import assert from 'node:assert/strict';
import test from 'node:test';
import { formatOfficialMarketEvidenceComponent } from './market-evidence-format.ts';

test('formats official market evidence without JavaScript object placeholders', () => {
  const taiex = formatOfficialMarketEvidenceComponent('taiex', {
    close: 24_500.5,
    ma20: 24_000,
    ma60: 23_800,
    ma60Slope: 0.002,
    drawdownPct: -2.4,
  });
  const breadth = formatOfficialMarketEvidenceComponent('breadth', {
    aboveMa20Pct: 44.116,
    observed: 1963,
    eligible: 1979,
    rosterCoveragePct: 99.19,
  });
  const flow = formatOfficialMarketEvidenceComponent('foreignFlow', {
    oneDayTwd: 57_357_467_664,
    fiveDayTwd: -77_764_922_131,
  });

  assert.match(taiex || '', /加權指數 24500\.50，站上 MA20 24000\.00/u);
  assert.match(breadth || '', /覆蓋 1,963\/1,979 檔，名單覆蓋 99\.2%/u);
  assert.match(flow || '', /外資單日 \+573\.6 億元，近 5 日 -777\.6 億元/u);
  assert.doesNotMatch([taiex, breadth, flow].join(' '), /\[object Object\]/u);
});
