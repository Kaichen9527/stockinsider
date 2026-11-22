# GitHub 支援分支採用說明

日期：2026-11-22。專案：Kaichen9527/stockinsider。核心版本：v4-20261122。

本次保存接手Skill、三client Prompt、安裝來源指紋及使用規則。基底為已查核工作分支 `codex/launch-radar-close-clock` 的 `41f2415f664b01b845870fc27e52de806de3e986`。

支援分支 `codex/delivery-kit-v4-20261122` 供檢視與可恢復交接；不表示正在使用的工作分支、本機、Codex VM、Contabo 或 Claude 已採用，也不表示產品功能通過驗收。

## 接手

1. 先讀現有AGENTS／CLAUDE、原tracker與目前狀態入口，核唯一writer、dirty檔及遠端版本。
2. 比較支援分支的新Skill與三Prompt，沿既有工作分支整合需要的指定檔案，保留原規則與WIP。不要為採用套件重置、clean或強推工作樹。
3. Codex讀 `.agents/skills/project-delivery-resume`；Claude Code透過 `.claude/skills/project-delivery-resume` 的相對link讀同一份。各client分別實測發現與使用。
4. 使用 `docs/delivery-v4/Codex_Chat.md`、`Codex_VM.md` 或 `Claude.md`。已確認的scope引用既有決定；需要本輪續作確認時給一份具體剩餘工作包，不重問全產品。
5. 小型來源與交接push後讀回；大型／敏感原件依原政策另外保存、校驗取回並記manifest。GitHub支援分支不會自動啟動Goal、背景Agent、MCP登入或排程。

本案profile是有日期的定位資料，最新原任務與真實證據仍為權威。原產品／資料／發布限制保持；新cloud-first偏好只在保全與隔離後選用適當環境。

本repository公開，套件只含本案去敏資料。較新AGENTS的typed runtime truth及原issue證據優先於歷史CLAUDE表格中的Active標籤，不能據舊表宣稱provider已運作。
