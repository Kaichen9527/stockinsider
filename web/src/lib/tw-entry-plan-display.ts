import type { TwEntryPlan } from './tw-entry-plan-contract';

export const tradeStrategyLabel: Record<TwEntryPlan['strategyId'], string> = {
  breakout: '收盤突破', pullback: '上升趨勢回檔',
};
export const tradeSignalLabel: Record<TwEntryPlan['rawSignalState'], string> = {
  waiting: '等待確認', confirmed: '技術條件已確認', invalidated: '技術條件失效', data_insufficient: '資料不足',
};
export const tradePlanStateLabel: Record<TwEntryPlan['planState'], string> = {
  waiting_confirmation: '等待技術確認', conditional: '條件式研究計畫', blocked: '正式門檻阻擋',
  avoid_chase: '超出區間，不追價', invalidated: '計畫失效', expired: '已到期，僅供歷史研究', data_insufficient: '計畫資料不足',
};
export const tradeEligibilityLabel: Record<TwEntryPlan['eligibility']['state'], string> = {
  eligible: '當時正式門檻通過', blocked: '當時正式門檻未通過', unavailable: '正式資格尚無法評估',
};

const reasons: Record<string, string> = {
  market_risk_off_blocks_new_actionable: '大盤風險暫停新增行動',
  market_breakdown_forces_downgrade: '大盤轉弱', negative_overseas_peer_catchdown: '海外同業補跌風險',
  market_regime_missing: '大盤證據待補', technical_hard_gate_failed: '正式技術門檻未通過',
  requires_two_consecutive_closes: '尚待兩個相鄰交易日收盤確認',
  stale_or_fallback_data: '資料過期或仍為備援資料', price_history_stale: '官方行情尚未更新完整',
  price_history_provider_conflict: '行情來源互有衝突', price_history_provenance_unverified: '行情來源尚未驗證',
  price_history_uses_finmind_fallback: '行情仍使用備援來源',
  research_score_below_70: '研究證據尚未達正式門檻', actionability_below_65: '行動分數尚未達正式門檻',
  data_confidence_below_75: '資料信心尚未達正式門檻', bear_base_bull_missing: '估值情境尚未完整',
  base_upside_below_12: '估值空間尚未達正式門檻', reward_risk_below_1_5: '估值報酬風險比尚未達正式門檻',
  corporate_action_basis_unverified: '除權息與價格尺度尚未驗證',
  invalid_knowledge_clock: '資料截止與可用時間互有衝突',
  input_identity_missing: '研究版本或行情來源識別尚未完整',
  formal_eligibility_missing: '正式進場資格尚無可驗證結果',
  formal_eligibility_conflict: '正式進場資格與阻擋原因互有衝突',
  plan_published_after_next_open: '計畫於次日開盤後才可取得，不適用該次開盤',
};

export function tradePlanReasonLabel(reason: string): string {
  if (reasons[reason]) return reasons[reason];
  if (/adjustment|price_basis/.test(reason)) return '除權息與價格尺度尚未驗證';
  if (/calendar|session|holiday/.test(reason)) return '交易日或資料可用時間尚未確認';
  if (/liquidity/.test(reason)) return '流動性與可交易資格尚未驗證';
  if (/history|bar|ohlcv/.test(reason)) return '完整且可驗證的日線行情不足';
  if (/stale|late|expiry|expired/.test(reason)) return '資料時效或計畫有效期未符合';
  if (/chase|extended/.test(reason)) return '價格超出研究區間，不追價';
  if (/geometry|risk|price/.test(reason)) return '進場與風險價格尚未形成有效區間';
  if (/volume/.test(reason)) return '成交量條件尚未成立';
  if (/trend/.test(reason)) return '上升趨勢條件尚未成立';
  if (/breakout/.test(reason)) return '收盤突破條件尚未成立';
  if (/pullback|rebound/.test(reason)) return '回檔止穩條件尚未成立';
  return '研究條件尚待補齊或確認';
}

/** Display expiry never rewrites the immutable signal or formal classification. */
export function tradePlanDisplayState(plan: TwEntryPlan, asOf: string): TwEntryPlan['planState'] {
  const now = Date.parse(asOf);
  const expiry = plan.expiresAt ? Date.parse(plan.expiresAt) : Number.NaN;
  return Number.isFinite(now) && Number.isFinite(expiry) && now >= expiry ? 'expired' : plan.planState;
}
