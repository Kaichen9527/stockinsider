# StockInsider｜v5 GitHub 採用說明

更新：2026-11-22（Asia/Taipei）。本支援分支保存四種 client 的五情境 Prompt、單案 Skill 與有限重試／容量工具；它不是已合併的產品功能，也不會啟動任何模型或背景工作。

- 原工作分支：`codex/launch-radar-close-clock`，本次讀取的工作 head：`41f2415f664b01b845870fc27e52de806de3e986`。
- 支援分支：`codex/delivery-kit-v4-20261122`。
- 先讀原 authoritative memory／tracker，再讀 `.agents/skills/project-delivery-resume/SKILL.md` 與 `references/project.md`。
- 四入口為本目錄的 `Codex_Chat.md`、`Codex_VM.md`、`Claude.md`、`Antigravity.md`；每份均涵蓋 new／resume／change／triage／closeout。
- 原有 v4 managed block 已做精確區段替換；原區段前後 bytes 保留。
- Claude 相對連結 `.claude/skills/project-delivery-resume` 指向同一 `.agents` Skill；Antigravity 使用 `.agents/skills`。讀取 GitHub 檔案不代表本機或遠端 host 已安裝。
- 若正確工作分支仍是 v4，不要強制執行 ZIP installer。先在乾淨隔離分支核對此 PR 的 support-only 差異，保留既有規則及 WIP，再按明確檔案路徑採用。新安裝可先跑套件 dry-run；遇到衝突保留檔案並提出最小差異。
- 每次接力延續同一 task、revision、owner lease、attempts、時間與容量預算。無新證據不可重跑全套測試；達到兩次同因失敗即 Triage。
- Site 的 schema 支援與真正 OAuth／工具／事件連線是不同驗收；沒接線時用 GitHub 紀錄並標記待同步。原產品交付完成必須有 candidate SHA 與實際可用證據。

本分支只包含工作流程支援。產品開發、使用者測試、merge 或 release 狀態不因它而自動完成。
