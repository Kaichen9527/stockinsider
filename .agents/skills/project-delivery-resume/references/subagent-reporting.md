# Role-based agents and office reporting

Use this contract when a coordinator delegates work or reports its real team. Keep the existing tracker, current writer, task revisions, budgets and acceptance gates. The office observes work; a role card does not start a model.

## Choose the team

1. Check the actual client's tools and permissions. Use a single capable client with a coordinator and only the needed subagents. Do not require another IDE, a different model, experimental teams or a new orchestration framework.
2. Give each child a finite task, relevant context, allowed files/tools, evidence target and stopping condition. Independent requirements analysis, UI/UX review and QA can run read-only in parallel.
3. Preserve one writer per physical worktree. A child does not inherit the parent's write lease or authority merely by being spawned. Separate write work needs an isolated worktree, scoped ownership and its own applicable coordination checks.
4. When subagents are unavailable, execute roles sequentially and report one real agent. Do not manufacture agent IDs or create workers only to populate the office.

## Keep identities distinct

- Use `agentId` for the actual native agent/conversation ID, with a stable provider namespace only when required to avoid collisions. Never use an IDE name or role label as the worker ID.
- Keep the visual worker identity stable as `projectId + sessionId + agentId`; keep `runId` in its execution history rather than creating another person on a resumed run. Keep `sessionId` and `runId` tied to the actual session and task execution. Reuse the same agent identity when a native agent resumes; start a new run only for a genuine new execution. Do not rotate IDs to bypass budgets or retention limits.
- Preserve the original identity of an already-started legacy run through its closure; do not rename its agent or rewrite old records to fit a new convention. Use actual native identities for genuinely new child runs.
- Keep `roleId` from the service's known roles. One worker may change responsibility over time; two real workers with the same role remain separate.
- Record a parent only from the real spawn/list result or another verifiable native relationship. Unknown parent stays absent; do not attach unrelated same-client workers to a convenient coordinator.
- Treat `provider`, `client` and `model` as metadata. Report observed model information or leave it unknown. A main session doing all work is a real coordinator or standalone agent, not several imagined specialists.

## Report through the current schema

Refresh `tools/list` before sending new fields. Preserve every existing task/revision, sequence, evidence and lease requirement in `office-and-events.md`. Use the exact returned `cards[].taskRevision`; a Git HEAD is not a substitute.

Where the deployed schema supports them, repeat these optional identity fields on each applicable event:

| Field | Meaning |
| --- | --- |
| `agentName` | Short human label, at most 60 characters; use a role-oriented label without embedding secrets. |
| `agentKind` | `coordinator`, `subagent` or `standalone`, reflecting the real execution relationship. |
| `parentAgentId` + `parentRunId` | Supply both for a known parent; omit both when unknown. |
| `parentSessionId` | Supply the actual parent session when known and supported. Without it, an ambiguous parent match remains unresolved. |

After a real child starts its assigned task, send one `task_started` for its real run; send bounded, truthful state/evidence updates and `run_ended` at its actual end. Spawn intent, a connection check, a saved role definition and a registration receipt are not task execution. Do not backfill invented activity or generate fake heartbeats. An ended run does not accept the product task.

A separate read-only child run may report without a write lease where the deployed contract permits. If reporting on a coordinator's leased task/run requires proof, prefer the authorized coordinator forwarding its actually observed child state; do not distribute lease secrets or claim that reporting grants the child write authority. Keep the reported child identity truthful and satisfy the exact deployed validation. On rejection, preserve the local observation and reconcile; do not acquire a competing write lease or falsify identity to obtain an avatar.

Use the existing authenticated transport. A pass-through MCP bridge already forwards supported fields; refresh discovery or reconnect only if the current client caches an old schema. Do not reinstall the kit, duplicate servers or rotate credentials for this metadata change. Report missing automatic hooks honestly; explicit real events are valid, but not a permanent watcher.

## Interpret the view

Show each real worker by role, current task and observed state. Keep model/client/IDs/evidence in details. Mark unassigned roles separately from working agents, and stale observations as unknown. Keep the portfolio home distinct from the selected-project office. Role changes must not multiply a worker; a second run must not silently erase its history.

## Official references

Checked 2026-11-22; verify the installed client before setup:

- [Antigravity subagents](https://antigravity.google/docs/subagents): concurrent workers, native conversation IDs and workspace options.
- [Antigravity hooks](https://antigravity.google/docs/hooks): `conversationId`, `modelName` and `Stop.fullyIdle`; do not assume the documented tool hook contains child IDs or parent relationships.
- [Claude Code hooks](https://code.claude.com/docs/en/hooks): `SubagentStart`/`SubagentStop` and `agent_id`/`agent_type`; filter internal helpers without a product-task binding.
- [Codex and ChatGPT subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents): capability-dependent delegation and independent worker threads.
