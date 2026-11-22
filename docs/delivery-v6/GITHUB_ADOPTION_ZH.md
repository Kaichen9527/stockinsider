# StockInsider｜v6 GitHub 採用說明

更新：2026-11-22（Asia/Taipei）。本支援分支保存四種 client Prompt、兩個 Skill、容量預算與跨模型交接規則；沒有啟動模型或背景工作。

- 原工作分支：`codex/launch-radar-close-clock`；本次讀取 head：`41f2415f664b01b845870fc27e52de806de3e986`。
- 支援分支：`codex/delivery-kit-v4-20261122`；這不是原產品分支已合併或目前 Mac／VM 已安裝的證據。
- 原 authoritative memory／tracker 繼續使用；先讀原規範，再讀 `.agents/skills/project-delivery-resume/SKILL.md`、其 `references/project.md` 與 `.agents/skills/project-storage-guard/SKILL.md`。
- 四入口：`Codex_Chat.md`、`Codex_VM.md`、`Claude.md`、`Antigravity.md`；共用 new／resume／change／triage／closeout 流程仍需套用本案既有決定。
- 根入口只精確替換一個既有 v5 managed block，或在原文完整保留後補充；原文保留收據在 PUBLICATION_INPUT_EVIDENCE.json。
- Claude 的兩條 `.claude/skills/` 相對連結指向同一 `.agents/skills/`；Antigravity 依實際版本的 Skill 與 MCP 支援檢查，不以貼上 Prompt 代表連線成功。
- 舊套件衝突時 installer 會停止且不部分寫入。先在乾淨隔離分支檢視 support-only 差異，以明確檔案路徑採用並保護現有 WIP；不要整包覆蓋、強制 reset 或直接 merge 產品。
- 同一實體 checkout 僅一個寫入者；先註冊工作區並取得協作租約，另有 worktree、port、database 或 simulator 等資源仍要分配。中央租約是配合式協定，不能隔空殺掉不配合的 IDE 程序。
- 租約預設 120 秒，需實際 runner 持續續租；目前未安裝常駐 runner。長指令沒有可用心跳時不可宣稱即時防衝突。失聯保持占用，先確認原程序停止再人工交接；不因過期自動搶回。
- 每次換 client 延續同一 task/revision、attempt 與絕對 deadline，不重置預算。原失敗指紋無新證據不重跑；到預算即 Triage，由 triage owner 整理原因、選項與使用者決定。
- GitHub push 後要讀回 branch SHA 與 evidence／handoff。讀回未成功就寫未同步，不把 API response 或本機 commit 當作已備份。

產品完成仍要固定 candidate SHA、適用測試、必要人工驗收與實際部署／安裝證據。工作流程套件與網站更新不會替代這些驗收。
