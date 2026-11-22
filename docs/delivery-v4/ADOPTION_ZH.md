# StockInsider 交付工具採用說明

核心版本：v4-20261122。

本資料夾是靜態流程與接手工具。現況仍以既有 tracker／memory／GitHub 來源及實際環境為準；不要把此 profile 當成已再次驗證的現況。

先讀本案 `Codex_Chat.md`、`Codex_VM.md` 或 `Claude.md`。三個 Prompt 共用同一份 scope／卡片 revision／來源與驗收，但按工具能力分工。讀 `.agents/skills/project-delivery-resume/SKILL.md` 及 `references/project.md`；Claude Code 透過 `.claude/skills/project-delivery-resume` 的相對 link 讀共用檔。

套件支援 branch 只是已保存的採用材料；不表示 active branch、Mac、VM、Claude 或背景 hooks 已安裝。由唯一整合者在保護 dirty 工作後做 scoped integration，審查衝突與既有規則，保存並讀回來源。不要覆蓋舊規則、force-push 或全 repo 清理。

接手先讓使用者一次確認具體剩餘 scope，已確認的相同方案直接續作。新需求／解卡保存使用者原意與決策；沒有 Site 工具也可沿 GitHub 入口執行，不能冒稱 Agent 已自動開工。主控領卡前核資源、依賴與唯一 owner；技術 PASS、功能驗收、使用者接受與正式部署分別記錄。

GitHub 保存來源、短交接、決策、發現與 attempts；大型／敏感內容留核准位置，Git 中只留可公開或受保護 repo 適用的小型 manifest／收據。資料庫、秘密、raw log 或其他專案資訊不能為了「全部備份」而無差別提交。

詳見本案 profile 與 `KIT_PROVENANCE.json`。共用核心的功能來自內容快照，最終遠端收據由主控保存；不把本檔文字當成已完成遠端驗證。
