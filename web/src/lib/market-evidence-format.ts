function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function signedTwd(value: number) {
  const amount = Math.abs(value);
  const unit = amount >= 100_000_000
    ? `${(amount / 100_000_000).toFixed(1)} 億元`
    : `${Math.round(amount).toLocaleString('zh-TW')} 元`;
  return `${value >= 0 ? '+' : '-'}${unit}`;
}

/** Convert persisted market evidence into investor-facing text.
 *
 * Public radar payloads must never stringify evidence objects directly: doing
 * so leaks the JavaScript placeholder `[object Object]` into reasons and UI.
 */
export function formatOfficialMarketEvidenceComponent(
  kind: 'taiex' | 'tpex' | 'breadth' | 'foreignFlow',
  value: unknown,
): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return textValue(value);
  const row = value as Record<string, unknown>;
  if (kind === 'taiex' || kind === 'tpex') {
    const close = numberValue(row.close);
    const ma20 = numberValue(row.ma20);
    const ma60 = numberValue(row.ma60);
    const slope = numberValue(row.ma60Slope);
    const drawdown = numberValue(row.drawdownPct);
    if (close == null) return null;
    const label = kind === 'taiex' ? '加權指數' : '櫃買指數';
    const position = ma20 == null ? null : `${close >= ma20 ? '站上' : '跌破'} MA20 ${ma20.toFixed(2)}`;
    const longTrend = ma60 == null ? null : `MA60 ${ma60.toFixed(2)}${slope == null ? '' : `（斜率 ${slope >= 0 ? '+' : ''}${(slope * 100).toFixed(2)}%）`}`;
    const drawdownText = drawdown == null ? null : `距高點 ${drawdown.toFixed(1)}%`;
    return [`${label} ${close.toFixed(2)}`, position, longTrend, drawdownText].filter(Boolean).join('，');
  }
  if (kind === 'breadth') {
    const aboveMa20 = numberValue(row.aboveMa20Pct);
    const observed = numberValue(row.observed);
    const eligible = numberValue(row.eligible);
    const coverage = numberValue(row.rosterCoveragePct);
    if (aboveMa20 == null && coverage == null) return null;
    return [
      aboveMa20 == null ? null : `全市場站上 MA20 ${aboveMa20.toFixed(1)}%`,
      observed != null && eligible != null ? `覆蓋 ${Math.round(observed).toLocaleString('zh-TW')}/${Math.round(eligible).toLocaleString('zh-TW')} 檔` : null,
      coverage == null ? null : `名單覆蓋 ${coverage.toFixed(1)}%`,
    ].filter(Boolean).join('，');
  }
  const oneDay = numberValue(row.oneDayTwd);
  const fiveDay = numberValue(row.fiveDayTwd);
  if (oneDay == null && fiveDay == null) return null;
  return [
    oneDay == null ? null : `外資單日 ${signedTwd(oneDay)}`,
    fiveDay == null ? null : `近 5 日 ${signedTwd(fiveDay)}`,
  ].filter(Boolean).join('，');
}
