# Parallel IDE execution contract

Use this when multiple clients work on one product. IDE/provider/model describes capability, not task ownership. Prefer useful parallel read-only roles before adding writers.

## Select an execution mode before setup

| Mode | Ownership and completion |
| --- | --- |
| `continue` | One current coordinator advances the approved queue, using needed native subagents; preserve the current writer. |
| `coordinator` | The one named coordinator assigns work, maintains common tracker/memory, reconciles dependencies and integrates reviewed candidates. |
| `worker` | Join a real finite dispatch in an isolated worktree/branch; modify owned paths and return candidate/evidence. Do not claim the whole queue or write shared state. |
| `reviewer` | Review a pinned candidate/criteria; no product-tree writes, including installer/adoption. Build/test outputs need a separate owned sandbox/resources. |
| `update_only` | Upgrade/read back rules in an owned tree; do not start product work. Defer another active writer's adoption. |

Worker/reviewer restrictions apply **before bootstrap**. Opening the coordinator's folder never authorizes setup writes there. Read external/current rules, resolve the genuine assignment and correct workspace, then do only permitted setup. Without an assignment, report `awaiting_dispatch` to the coordinator; do not invent one or ask the user to fill IDs. Preserve a concrete coordinator-access blockage if needed.

## Keep a compact dispatch in the existing authority

Use the existing task, issue comment or established metadata, not a second board:

```text
dispatch_id / project / task_id / revision / scope
coordinator / assigned worker / actual client
base SHA / isolated branch / host + realpath
owned paths / excluded shared files / pinned interface
resources (ports, DB, emulator, GPU, host heavy-job slot)
acceptance IDs / evidence / candidate return location
original absolute deadline / remaining budget / cumulative attempts
state: assigned -> working -> candidate -> reviewed -> integrated (or blocked)
```

The coordinator resolves paths/identifiers/branches from actual evidence. Do not give users placeholder shell commands. A saved dispatch does not prove a worker started; report actual native agent events separately.

## Isolate before writing

1. Check existing coordinator, writers, children and coordination service. Reuse the current owner's identity/valid proof; a new IDE is not a new coordinator.
2. A second writer needs a separate physical Git worktree and unique branch from a verified base. A different branch in the same folder is insufficient. Check disk/product constraints before creating worktrees, copying sources, downloading dependencies or hydrating assets.
3. Worktree creation changes shared Git metadata; the coordinator serializes it under ownership and returns actual path/base. Do not force a branch checked out elsewhere. Native worktree defaults may differ from parent HEAD; verify the actual SHA.
4. Register real host/realpath/commonGitDir and obtain applicable ownership before any product write. One product card has one writer; same-card UIUX/QA/analysis may run read-only. An active or expired-unreleased writer of an older revision still blocks takeover. If real parallel writing needs sub-tasks, define approved genuine tasks in the original tracker with disjoint ownership; do not rename tasks to evade locks or reset attempts. Read the deployed schema before claiming its enforcement.
5. Never reuse the parent's lease token in a different child run. Ports, DB/schema, emulator, shared caches, asset indexes, release secrets and integration branches need separate resource ownership. A common host heavy-job key must be shared across IDEs **and projects** on a constrained machine; project-prefixed keys do not protect a host-wide resource.
6. Existing service `resourceKeys` are host-scoped. Cross-host integration/shared-service ownership remains with the sole recorded coordinator; a host key is not a distributed global resource lock. Serialize shared-service writes unless a real applicable coordination mechanism is verified.

## Return and integrate

Workers commit only owned paths on authorized branches, save/verify remote candidates where authorized, then return SHA, scope, evidence, unresolved work and process state. They do not merge main, alter shared tracker fields or rewrite acceptance. Coordinator reviews exact diffs and integrates under existing authority, after the relevant writer has returned and stopped. A read-only coordinator does not hold the worker's product-card lease; shared-state/integration writes still need actual workspace ownership and must wait for conflicting task writers to release.

An assignment may end while the coordinator continues the queue. Preserve unique work, verify old writer/children stopped, then release/resolve per actual schema. An absent/expired lease alone is not process evidence. Keep attempts/deadline across clients and hosts.

Worktrees plus cooperative checks reduce collisions; they do not stop an uninstrumented IDE editing files. `git worktree lock` protects metadata from prune/move/remove, not editing. Strong enforcement needs actual process/sandbox/filesystem isolation; do not claim this contract installs it.

## Official references

Checked 2026-11-23:

- https://git-scm.com/docs/git-worktree
- https://learn.chatgpt.com/docs/environments/git-worktrees
- https://code.claude.com/docs/en/sub-agents
- https://antigravity.google/docs/subagents
