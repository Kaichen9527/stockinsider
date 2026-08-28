const diagnosticLabels: Readonly<Record<string,string>> = Object.freeze({
  action_authority_disabled:'目前為唯讀研究，買進動作已停用',
  authoritative_decision_pending:'正式決策仍待完成',
  authoritative_decision_envelope_missing:'正式決策資料尚未建立',
  decision_revision_unavailable:'這個研究版本暫時無法顯示',
  decision_revision_parameter_invalid_or_ambiguous:'研究版本參數無效或重複',
  revision_envelope_brief_or_provenance_invalid:'研究版本資料尚未完整同步',
  projection_stale:'研究快照已過期，等待下一次評估',
  projection_stale_readonly:'研究快照已過期，目前僅顯示上次結果',
  projection_missing:'研究投影尚未建立',
  projection_conflict:'研究資料校驗衝突，暫停顯示動作',
  checksum_conflict:'研究資料校驗衝突，暫停顯示動作',
  runtime_doctor_failed:'資料生產健康檢查尚未通過',
  consumer_producer_incompatible:'網站與資料生產版本尚未同步',
  manifest_incompatible:'資料生產版本識別尚未同步',
  migration_incompatible:'資料結構版本尚未同步',
  frozen_acquisition_authority_unavailable:'來源封存驗證尚未完成',
  legacy_schema_without_v314_decision_authority:'舊研究快照缺少現行決策權威',
  support_must_be_reclaimed:'股價需先收復支撐，才重新評估進場',
  reclaim_required:'股價需先收復支撐，才重新評估進場',
  breakout_not_confirmed:'等待量價突破確認',
  entry_price_above_required_value_gate:'現價高於所需安全邊際，等待合理價格',
  market_regime_gate:'市場條件尚未通過',
  market_authority_missing:'市場狀態資料尚未齊全',
  marketLiquidity:'市場流動性資料尚未齊全',
  price_extended_wait_for_reset:'短期乖離偏高，等待回到合理區間',
  data_required_for_formal_decision:'正式決策所需資料仍待補齊',
  research_axes_incomplete:'研究所需核心資料尚未齊全',
  valuation_authority_incomplete:'官方估值資料尚未齊全',
  missing_valuation_method:'估值方法與必要輸入仍待補齊',
  diluted_shares:'稀釋後加權股數待補',
  cash_debt:'現金與負債資料待補',
  fundamental_quality_authority_missing:'基本面品質資料尚未齊全',
  research_authority_incomplete:'研究權威鏈尚未完成',
  valuation_unavailable:'估值資料尚未齊全',
});

export function displayResearchDiagnostic(value: unknown): string {
  if(typeof value!=='string'||value.length===0)return '研究條件待補；請查看資料來源與下一步。';
  if(value.startsWith('missing:'))return `尚缺資料：${value.slice(8).replaceAll('_','、')}`;
  const base=value.includes(':')?value.slice(0,value.indexOf(':')):value;
  if(diagnosticLabels[base])return diagnosticLabels[base];
  return '研究條件待補；請查看資料來源與下一步。';
}
