## 1. OpenSpec Consolidation

- [x] 1.1 Create the `tw-story-alpha-radar` change artifacts and spec deltas
- [x] 1.2 Define how overlapping legacy specs map into the new canonical capability set
- [x] 1.3 Document the retirement plan for duplicated legacy specs once the new flow ships
  Note: legacy specs remain `compat-only` until the new governance/data-contract checks pass.

## 2. Data Model

- [x] 2.1 Design canonical storage for story candidates, evidence items, company events, transcripts, revenue signals, valuation cases, and research memos
- [x] 2.2 Add agent audit entities for runs, tasks, findings, reviewer state, and delivery provenance
- [x] 2.3 Define freshness, source health, contradiction, and review queue fields needed for research governance
  Note: `source_review_queue` is reserved for source drift / parse / connector issues; `agent_review_queue` is reserved for contradiction, weak-promotion, and agent-guard failures.

## 3. Research Pipelines

- [ ] 3.1 Implement market regime and theme heat scans for the full TWSE + TPEx universe
  Remaining: runtime exists, but theme discovery is still seed-led in places and not yet full-universe complete.
- [ ] 3.2 Implement public-first story discovery from company/public/news/forum/KOL sources
  Remaining: public-first source discovery path exists, but source coverage breadth still needs expansion beyond the current approved connectors and watchlists.
- [x] 3.3 Implement story verification using official/company/public evidence and contradiction handling
- [x] 3.4 Implement thesis/valuation generation and recommendation lifecycle staging
- [x] 3.5 Implement technical/capital-flow timing gates and actionable setup generation

## 4. Product Outputs

- [x] 4.1 Build daily radar, hot themes, weekly conviction, and stock deep-dive read models
- [x] 4.2 Generate research memos with thesis, evidence matrix, catalyst path, valuation case, and entry/exit rules
- [x] 4.3 Keep LINE and other delivery channels as downstream consumers of the canonical research state

## 5. Agent Orchestration

- [x] 5.1 Define role contracts for the internal StockInsider agents
- [x] 5.2 Add vendored `agency-agents` profile allowlist and map approved profiles to internal roles
- [x] 5.3 Ensure no external agent profile can publish recommendations directly
- [ ] 5.4 Add run logging, retry policy, manual review, and failure escalation for all agent tasks
  Remaining: run/task/finding logging, allowlist guard, and manual review are in place; retry policy is still basic and not yet centrally orchestrated.

## 6. Verification

- [x] 6.1 Add tests ensuring every published recommendation has a traceable story and evidence chain
- [x] 6.2 Add tests ensuring social/forum noise cannot independently promote a stock to final recommendation
- [x] 6.3 Add tests for daily/three-day/weekly report generation and stock deep-dive completeness
- [x] 6.4 Add tests for agent audit logs, review queue behavior, and source drift handling
