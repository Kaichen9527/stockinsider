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
  valuation_target_missing:'正式估值未完成，因此不顯示目標價',
  reclaim_first:'必須先收復支撐再考慮進場',
  coverage_lt_70:'研究覆蓋率低於 70%',
  relative_evidence_incomplete:'相對估值、基本面或價格證據尚未完整',
  market_evidence_incomplete:'大盤證據不完整，暫不形成進場候選',
  market_or_timing_gate_not_met:'大盤或個股時機尚未同時通過',
  underreaction_score_below_floor:'未反映分數低於研究門檻',
});

const missingAxisLabels: Readonly<Record<string,string>> = Object.freeze({
  source:'來源證據',
  fundamental:'基本面',
  valuation:'估值',
  technical:'技術面',
  liquidity:'流動性',
  market:'市場條件',
});

const valuationStatusLabels: Readonly<Record<string,string>> = Object.freeze({
  normal:'資料完整',
  complete:'資料完整',
  relative_only:'僅有相對估值',
  valuation_review:'估值資料待補',
  missing:'估值資料待補',
  stale:'估值資料已過期',
  conflict:'估值資料有衝突',
  unavailable:'估值資料待補',
});

const valuationMethodLabels: Readonly<Record<string,string>> = Object.freeze({
  pe:'本益比（PE）',
  normalized_pe:'正常化本益比',
  ev_ebitda:'企業價值／EBITDA',
  pb_roe:'股價淨值比／ROE',
  residual_income:'剩餘利益模型',
  nav:'淨資產價值（NAV）',
  ev_sales:'企業價值／營收',
});

const technicalStateLabels: Readonly<Record<string,string>> = Object.freeze({
  below_support:'已跌破支撐',
  reclaim_required:'等待收復支撐',
  at_support:'接近支撐',
  breakout_pending:'等待突破確認',
  breakout_confirmed:'突破已確認',
  extended:'短期乖離偏高',
  invalidated:'技術條件已失效',
  unavailable:'技術資料待補',
});

const readinessLabels: Readonly<Record<string,string>> = Object.freeze({
  actionable:'現在可行動',
  near_action:'接近買點',
  wait_condition:'等待條件',
  data_needed:'資料待補',
  ready:'等待決策權限',
  wait_reclaim:'等待收復支撐',
  wait_breakout:'等待突破確認',
  wait_value:'等待合理價格',
  wait_market:'等待市場條件',
  wait_refresh:'等待資料更新',
  avoid_chase:'不追價',
  avoid:'暫時避開',
  unavailable:'資料待補',
});

const gateLabels: Readonly<Record<string,string>> = Object.freeze({
  source:'來源證據',
  fundamental:'基本面',
  valuation:'估值',
  technical:'技術面',
  liquidity:'流動性',
  market:'市場條件',
});

const gateStatusLabels: Readonly<Record<string,string>> = Object.freeze({
  pass:'已具備',
  missing:'待補',
  blocked:'未通過',
  unavailable:'待補',
  conflict:'資料衝突',
});

export function displayResearchDiagnostic(value: unknown): string {
  if(typeof value!=='string'||value.length===0)return '研究條件待補；請查看資料來源與下一步。';
  if(value.startsWith('missing:')) {
    const axes=value.slice(8).split(',').map((axis)=>missingAxisLabels[axis]).filter(Boolean);
    return axes.length>0 ? `尚缺資料：${axes.join('、')}` : '研究資料仍待補齊';
  }
  const base=value.includes(':')?value.slice(0,value.indexOf(':')):value;
  if(diagnosticLabels[base])return diagnosticLabels[base];
  return '研究條件待補；請查看資料來源與下一步。';
}

function label(value: unknown, labels: Readonly<Record<string,string>>, fallback: string): string {
  return typeof value==='string'&&labels[value] ? labels[value] : fallback;
}

export function displayValuationStatus(value: unknown): string {
  return label(value,valuationStatusLabels,'估值資料待補');
}

export function displayValuationMethod(value: unknown): string {
  return label(value,valuationMethodLabels,'待選擇');
}

export function displayTechnicalState(value: unknown): string {
  return label(value,technicalStateLabels,'技術資料待補');
}

export function displayResearchReadiness(value: unknown): string {
  return label(value,readinessLabels,'資料待補');
}

export function displayResearchGate(value: unknown): string {
  return label(value,gateLabels,'研究條件');
}

export function displayResearchGateStatus(value: unknown): string {
  return label(value,gateStatusLabels,'待補');
}
