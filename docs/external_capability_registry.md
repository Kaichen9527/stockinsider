# StockInsider 外部能力整併清單

## 原則
- 先做研究與 allowlist，不直接把外部套件、marketplace skill 或 agent 接進推薦主鏈路。
- 外部能力只可用於資料補充、文本分類、回測驗證或工程 workflow。
- 推薦與目標價仍由 StockInsider 的故事驗證、估值與技術面規則主導。
- Production runtime 的 external profile 來源以 vendored allowlist 為準：
  - `.agent/vendor/agency-agents/allowlist.json`
  - 只允許 `profile_key -> mapped_role` 的內部角色映射
  - 任何 external profile 都只能提供 finding input，不可直接發佈 recommendation

## GitHub 套件
### `garrytan/gstack`
- 用途：工程流程與 QA 自動化技能（`/review`、`/qa`、`/browse`）。
- 建議位置：開發流程（本機與 CI），不進 production runtime。
- 結論：可導入為工程技能包，但不得直接參與推薦決策。

### `node-twstock`
- 用途：補台股行情、代碼與基礎資料來源。
- 建議位置：資料收集 fallback / 驗證層。
- 風險：需先確認維護狀況、授權與資料來源穩定度。

### `backtrader`
- 用途：研究與回測不同進出場規則。
- 建議位置：離線研究與策略驗證。
- 不直接進 production 推薦 API。

### `vectorbt`
- 用途：快速向量化回測與情境分析。
- 建議位置：估值與 timing 規則的研究驗證。
- 不直接進 production 推薦 API。

## Claude 官方 Skills
### `anthropics/skills`
- 用途：借用 browser、文件整理、結構化分析與 workflow pattern。
- 結論：適合作為 skill 設計與研究流程參考，不是 stock 專用能力包。
- 導入方式：挑選 pattern，重寫成 StockInsider 自己的 allowlisted skills。

## Hugging Face
### `ProsusAI/finbert`
- 用途：金融文本情緒分類，適合新聞、法說節錄、社群貼文、Podcast 句子分類。
- 建議位置：故事驗證與風險/看多語句抽取。
- 不直接產生目標價，也不直接決定推薦層級。

## OpenClaw / ClawHub
- 用途：僅限研究與觀察可用的 agent / skills 市集。
- 結論：目前不直接接入 production。
- 原因：
  - marketplace skill 來源雜，可信度與維護狀況不一；
  - 缺金融研究與資料治理專用 guardrail；
  - 任何第三方 skill 都需要 allowlist、隔離測試與人工 review。

## 目前採用策略
- `node-twstock`：列入台股資料補充候選
- `backtrader` / `vectorbt`：列入研究與回測候選
- `anthropics/skills`：列入 workflow pattern 參考
- `ProsusAI/finbert`：列入金融文本分類候選
- OpenClaw / ClawHub：不納入 production，只做外部研究
