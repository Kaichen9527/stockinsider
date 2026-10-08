# 友達市場研究輸入：2026-10-08（未發布）

本批以 Financial evidence docs head `95b5a5cc97b1bfad0b0e406d8271f7207c63b288` 為基底。未修改 App、端點、策略參數、前一分支程式或財務 dataset。PR305 的 unsigned exact 財務資料核對已另存並推送；其範圍不涵蓋這份市場資料。

## 實際來源與取得邊界

VM 在 2026-10-08T07:23:06.986068Z 對 TWSE STOCK_DAY 正常 TLS/no redirect 做一次 15 秒、2 MB 上限 canary；代理 CONNECT 403、curl56、HTTP0、0 body bytes，隨即停止直抓。`vm-canary.json` 保存失敗；沒有改 IP、TLS、代理或重試其他下載途徑。

`root-market-relay.json` 保存來源聊天 Mac 公開 HTTPS 取得後提供的必要欄位。14 個月（2025-09–2026-10）共 28 份官方 STOCK_DAY/FMTQIK 回應，reported raw total 67,188 bytes。Mac raw source ledger reported SHA256 `be067e7bb29e316f72761010c3db7b2534d6da9a5d051d9a76cebf99c95c7442`，原始 HTTP bytes 留 Mac；VM 未重驗這些 raw hashes，也未取得 raw files。VM 保存的 JSON 是 relay 轉錄／重組，具自身 file/canonical hash，不是原始 HTTP byte receipt，也沒有把壓縮副本的 supplied byte SHA 當成本機已驗 hash。

保留股票全部 10 個選取字串欄位（含 ROC 日期、逗號、二位小數、漲跌符號、空註記）；TAIEX 僅官方日期及 FMTQIK 原 field4 指數欄，不是完整 index 回應。每筆正規資料保留 source URL、Mac observedAt、selected-row canonical hash；publicationAt=null。`asOf=2026-10-08T07:22:58.051473+00:00` 是取得完成時點，不倒填原交易日的 availableAt。

股票成交量單位為股、成交金額為 TWD、價格為 TWD/股，TAIEX 為價格指數點數。268 根股票及 268 筆指數日期完全同序；第一筆 2025-09-01，最新觀察日期 2026-10-08。所有 source observation 均晚於該日期常態 13:30 台北收盤；此 clock check **不等於官方日曆／最新完成交易日核對**。不補休市缺日，也不把每個 weekday 當交易日。

## 可重算原始序列診斷

| 項目 | 原始未調整值 |
|---|---:|
| 最新收盤／成交股數 | 36.60 / 275,388,154 |
| MA5 / MA20 | 38.30 / 34.0275 |
| MA60 / MA120 / MA240 | 28.520833 / 26.072917 / 20.025208 |
| MA60 五個 session 斜率 | 0.147833 TWD/session |
| 最新量 / 完整20日量中位數 | 0.541985 |
| Wilder ATR14 / RSI14 | 2.141564 / 60.074089 |
| MACD12/26 / EMA9 signal / histogram | 2.774076 / 2.620745 / 0.153331 |
| OBV（首筆零基準） | 6,707,455,657 股 |
| 相對 TAIEX 5 / 20 / 60 sessions | -6.298868% / +18.113156% / +20.523091% |

直接呼叫既有 `technical-features-v3.1.0`、`indicatorts@2.2.2`、repo Wilder adapter 及 `discoveryRelativeReturns(requireComplete61=true)`；未換公式。相對報酬是 `(股票末/初)/(指數末/初)-1`，不是兩個百分點直接相減。RSI library seed 含首筆 zero change（前14 changes rolling mean），MACD EMA first-value seed，OBV 自取得首筆零基準；不可與其他初始化版本默認等價。

独立算式核對 SMA5/20/60/120/240、MA60斜率、20日中位量比、Wilder ATR14、RSI14、OBV、MACD 三欄及5/20/60同日相對報酬。49 組驗證含全部來源端點/月份/時鐘/shape/數字、ROC實際日期、OHLC/成交均價範圍、266筆普通漲跌與 close 差、October重複提供欄位一致、缺窗/錯位/future cutoff拒收、parser錯誤拒收及權限不升格；49/49、0fail、0skip。新程序 `--check` 再次重算並比對整份 dataset bytes，0差異。這是資料驗證組數，不是 App test suite case count。

## 對研究假設的具體改變

268 根資料足夠重算 MA240，已超越先前僅6根 October 無法建立長窗的限制。當前原始收盤高於 MA20/60/240，但低於 MA5；5日相對 TAIEX 回報為負，20/60日仍為正，10/2 close40.45 到10/8 close36.60 回落約9.52%，最新量約20日中位數54.20%。因此這個輸入不能支持『尚未上漲』或『最新一天放量突破』假設；也不能單由長窗均線之上推論可進場。現有 RSI>=75、close>MA20+2ATR 原始數值條件皆 false，**不代表合格 phase 或安全進場**。

7/30 官方原漲跌欄 `X0.00` 與原始 close23.65→22.20 不一致於普通連續 close change。原標記、兩個原價與差額均保留；公司行動參照未取得，不猜除權息金額，不自行調整／消除跳空。MA240、ATR、RSI、OBV與60日報酬可能受此未調整事件影響；結果只列 raw exploratory 欄。

## 保留缺口

公司行動/調整價基準、官方日曆完整性及最新完成 session、官方籌碼、原始 publication/available clocks、獨立論點研究資格和已批准策略仍缺。因此正式 `relative5d/20d/60d=null`、`pricePhase=unknown`、breakout/pullback=null、automaticEntryEligible=false；不產生訂單或成交。P/B仍null：財務資料 common-owner equity 可用，但期末流通普通股淨庫藏股缺，不拿 EPS平均股數替代分母。無目標價、CPO/Intel訂單確認或公開投資資格。

## 重現與交付

在已裝 Node22 / indicatorts2.2.2 的隔離 worktree：

```sh
node --experimental-strip-types docs/research/2026-10-08-auo-market/recompute-market.mjs --check
python3 docs/research/2026-10-08-auo-market/verify-hashes.py
```

去掉 `--check` 僅以 create-only 建立新的 dataset；既有輸出存在即拒覆寫。`hashes.json` 包含 input、計算器、dataset、README 的本地 byte hash、dataset canonical hash，以及28份 selectedRows canonical hashes。`verify-hashes.py` 確認 bytes/SHA256；`--check` 用既有repo canonical helper 重驗全部所列 canonical hashes。財務 dataset/hash 不變。

這輪僅資料/分析計算，沒有 App 修改，依授權未重跑 App build。Node22 strip-types / module-type 警告保留；未為消警告改 package/config。實際資源／精確 commit 與測量方法在 `.agent/reports/` sanitized 收據；私有完整 log 留 VM evidence 目錄。不是正式研究完整完成、VM collector 已啟用、VPS↔Cloud 業務往返或 protected attestation。
