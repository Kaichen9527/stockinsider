# StockInsider｜v5交付工具採用

core版本：v5-20261122。讀本資料夾對應client的完整Prompt；每份預設resume且含五情境，無須拼接。共用Skill為`.agents/skills/project-delivery-resume`，Claude Code使用相對`.claude/skills`link，Antigravity從repo root讀同一.agents。Google-managed remote載入能力另外核實。

Use the existing state authority specified by `references/project.md`. Do not create a competing HANDOFF if a designated memory entry already owns current state. A short handoff may point to the existing tracker. Only one integrator writes common state.

此資料夾是靜態交付工具，不是新的產品需求／任務系統。support branch保存不代表active worktree或所有client已安裝；由唯一整合者保護dirty後做精確整合。衝突拒絕不等於可以刪舊規則或force-push。實際GitHub讀回、host採用與產品驗收分開記錄。

卡片和scope revision／attempts／研究時計不隨client或環境重置。Triage需要真討論與decision；Site沒dispatcher時保存待討論，而非假裝已派Agent。每次有限slice保存小型來源與去敏證據，原件／大產物按本案恢復契約保留。

詳見references/project.md及KIT_PROVENANCE.json；這些文字與manifest不代表產品或私人MCP已通過。
