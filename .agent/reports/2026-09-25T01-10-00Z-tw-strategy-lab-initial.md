# 台股策略研究：第一輪工程交付

Baseline: `169aad1b6cfa747f78ae3464b614f43c0749d806`；研究分支 `codex/tw-strategy-lab-v1`。

這是研究工具與驗證邊界的交付，不是績效驗收、正式發布或部署成功證明。

## 已完成

- 七套假說註冊，五套價格訊號可執行；營收及券商修正維持 PIT 資料不足。
- 240 根窗口、公司行動按訊號日基準調整；S1/S2 與現行 TypeScript 計算公式直接比較。
- 前一日限價與股數、現金預留、下一交易日成交、跳空、費稅、滑價、收盤退出及股息應收帳。
- 原始資料 URL／SHA256／實際取得時間、歷史時點未核實與公司行動缺口明確標示。
- 券商報告事件的原始／媒體來源、首次取得、修正、撤回、去重、授權與 60 日新鮮度。
- 每個輸入候選的七策略結果檢查、文章預覽及不可發布 dry-run queue。
- 有界本地接續：資料完整並以最新 parser 重驗後，執行固定研究；不自行 commit／push／部署。

## 實際驗證

`python -m unittest discover -s research/tw-strategy-lab -p 'test_*.py'`：**104 tests PASS**，涵蓋正常化、signals、engine、runner、report events、article builder。

`npm --prefix web run build`：**PASS**，TypeScript 完成、91 個靜態頁生成。

首次用跨 worktree 的 node_modules symlink 建置被 Turbopack 拒絕；改用本地依賴複本後建置成功，沒有改應用設定繞過檢查。

獨立範圍審查發現並修復：開盤股數前視、失敗試驗中斷／漏記、registry 與執行契約不一致、股息休市日漏入帳、文章 producer/consumer schema 不一致，以及資料年度範圍與回應截斷驗證。審查分工與限制見 `openspec/changes/tw-strategy-lab-v1/review.md`；不冒充 protected gate 的 exact review。

## 尚未完成的實證

官方資料取得在 01:07 UTC 停於 155/684 基礎來源＋5 詳表，01:12 確認執行環境 network policy 阻擋 TWSE；本地 continuation 已停止。另準備 GitHub 隔離研究 workflow 接續相同有界工作，須以實際 run 成功為證。第一份真實績效運算尚未完成；合成 fixture 測試不是投資績效。2024 年以後保留資料未下載／未運算。

第一輪固定八檔倖存 panel；完整無缺口且公司行動可建模的股票才进入模擬，其餘留下排除原因。這不能代表全台股或 App 歷史篩選績效。

尚未取得正式資料庫的完整候選快照，正式文章更新數為 **0**。公開 daily 只取得過期快照第一頁 **40/196** 個 found-stage 標的；四次分頁與 Hot／weekly 讀取逾時。已產出40份 blocked 文章預覽與 dry-run queue，不能冒充完整候選更新。完整 candidate export、逐股 authority 補齊與 publication 對帳仍待 guarded 操作。

## 部署界線

Main 的 PR279、281、282 已合併，但新研究分支尚須正常 PR 審查；不沿用 predecessor 的 exact-review 證據。

本輪未登入正式機、未刪除資料、未購買擴容、未變更保護規則、未合併或部署。最後仍須在正式機鎖內量測容量並通過既有 15 GiB 保留檢查，再執行受保護的部署與資料更新流程。
