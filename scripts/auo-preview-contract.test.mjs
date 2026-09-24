import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../web/src/app/preview/auo-2409/page.tsx', import.meta.url), 'utf8');
const report = readFileSync(new URL('../web/src/app/preview/auo-2409/AuoDeepDiveReport.tsx', import.meta.url), 'utf8');
const research = readFileSync(new URL('../web/src/lib/auo-deep-dive-v1.ts', import.meta.url), 'utf8');
const packager = readFileSync(new URL('./package-auo-preview.mjs', import.meta.url), 'utf8');
const service = readFileSync(new URL('../deployment/vps/stockinsider-auo-preview.service', import.meta.url), 'utf8');

test('preview recalculates staleness at request time and hides stale price levels', () => {
  assert.match(page, /dynamic = 'force-dynamic'/u);
  assert.ok(report.includes('calculateTechnicalSnapshot(priceHistory as PriceBar[], new Date())'));
  assert.match(report, /所有新進場價位暫停使用/u);
  assert.match(report, /evaluateFrozenBreakoutSetup/u);
  assert.match(report, /目標已到達/u);
});

test('focused article keeps claims sourced and background/financial detail collapsed', () => {
  assert.match(research, /export const auoArticleSections/u);
  assert.match(research, /paragraphs: \[/u);
  assert.ok(report.includes('paragraph.text}<SourceLinks ids={paragraph.sources}/>'));
  assert.match(report, /<details className="research-toggle"><summary>了解友達/u);
  assert.match(report, /<details className="research-toggle"><summary>財務與假設明細/u);
  assert.match(report, /<CommercializationBridge\/>/u);
  assert.match(report, /<RevenueThresholdTable\/>/u);
  assert.match(report, /<CatalystEvidence\/>/u);
  assert.match(report, /calculateRelativePerformance/u);
});

test('preview asset namespace is embedded during build and verified before service start', () => {
  assert.match(packager, /NEXT_PUBLIC_ASSET_PREFIX: prefix/u);
  assert.match(packager, /verify-auo-preview-artifact[.]mjs/u);
  assert.match(service, /ExecStartPre=\/usr\/bin\/node verify-auo-preview-artifact[.]mjs/u);
});
