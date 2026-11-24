# Execution contract

Extend the project's existing schema only where missing. Minimum fields: project_id, task_id, revision, scope_version, source_of_truth, state, blocker(reason/owner/unblock condition), dependencies, base_sha, writer, allowed_paths, runtime_profile, estimate_active_minutes(low/high), command_timeout_seconds, run_budget_minutes, acceptance(stable IDs/weights/evidence), requested/observed model and next_checkpoint.

Time values are task-specific estimates, not promises. A 30–90 minute ordinary card can use a 120-minute review window; a large approved build or research case uses its existing budget. Never shorten a required test to make it pass or replace a project's cumulative policy.

Ready requires approved acceptance, satisfied dependencies, ownership and a usable environment. Pin frontend/backend contracts before parallel edits. Mocks support development; final integration must exercise the actual required route.

QA/Integration uses a fixed source/candidate and matching environment. Technical tickets can close on their declared engineering gate; release/user-facing tasks retain actual user acceptance. Ready for User needs a usable URL/build, steps, expected result and known limits. User rejection reopens only affected criteria with a reason.

## Short handoff

Use the existing living memory entry; keep about one screen to two pages. Include:

```text
Observed at / runtime:
Task / revision / scope:
Branch / local SHA / remote SHA verified at:
Unique dirty files still local:
Candidate / artifact hash / source identity:
New usable behavior and evidence:
Rejected hypotheses / attempts / no-repeat failure signature:
Blocker / owner / unblock condition:
Owned processes / writer and heavy-job lease:
Actual model / next model recommendation:
Exact next action / next ready card:
```

Preserve old history by reference; do not create a new live handoff every session. Do not store credentials or raw private data.

## Dispatch prompt

```text
接手 {task}@{revision}；來源 {source}，base_sha={sha}。
角色={role}；只修改 {owned_paths}，其他人負責 {other_paths}；介面={contract}。
沿用驗收 {criteria}。估時 {low}–{high} 分鐘；命令上限 {timeout}，本輪預算 {budget}。
沿用 {ledger} 的嘗試，不重置。輸出實際變更或新證據、測試範圍、checkpoint 與下一步。
缺依賴即回報具體阻塞，不越界修改，不另啟排程器。
```

## Independent review prompt

```text
獨立審查候選 {commit/artifact hash} 是否符合 {criteria}。
先讀相關 diff 與現有證據，只補結論所缺的必要驗證。
區分規格符合性、實作品質、整合使用者旅程；每個問題給重現或具體位置與影響。
不要因換模型就重跑未變矩陣或擴大範圍。未測部分保持未知。
```
