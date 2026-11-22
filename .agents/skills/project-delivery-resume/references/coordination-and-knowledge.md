# Coordination and durable knowledge

## Separate authority

Use the user's configured independent private `shared-policy repository` for shared policies, adapters, templates and project pointers. Resolve its URL from the private delivery registry; do not embed private portfolio URLs in generic/public kits. Its creation does not prove every product's source or WIP is backed up. Verify the current Hub commit and each product's independent remote checkpoint.

Keep the product repo and its established tracker/memory as product authority. Use the existing state authority specified by `references/project.md`. Do not create a competing HANDOFF if a designated memory entry already owns current state. A short handoff may point to the existing tracker. Only one integrator writes common state. Put only selected project material into this kit. Keep shared portfolio policy outside product repos and do not introduce a second editable task list in Obsidian.

Use a small `knowledge/` Obsidian vault in the private Hub: `Inbox/` for new ideas; `Projects/` for repo/Site/state pointers; `Decisions/` for cross-project choices; `Runbooks/` for reusable operations. Product-specific decisions still belong with their product. A note is not an approved requirement: discuss its impact, preserve the user's decision, then revise only affected cards. Summarize decisions, evidence, rejected hypotheses and next steps; do not export whole private chats by default.

Markdown needs filesystem access, not a new LLM API. A cloud worker must clone/read the authorized Hub rather than assume access to a Mac path. Obsidian CLI operates the desktop app; Headless Sync is a separately configured service. Installing a personal skill does not install either tool or grant data access. Prefer one sync strategy per active vault; Git and Obsidian Sync do not establish writer ownership. Keep credentials, lease tokens, raw datasets and caches out of Git/Obsidian/Site.

## Register projects and workspaces

A hosted Site can display saved state without an open Codex IDE. Fresh activity needs an authenticated reporting worker. Discover available tools and read actual schemas; unsupported clients remain unobserved. Do not claim the Site sees every IDE or private conversation.

Register new authorized projects/workspaces explicitly through the actual adapter. Keep a stable project ID and host ID across clients. Use the realpath worktree and absolute common Git directory, repo URL and actual branch. Avoid duplicate registrations for the same physical folder via symlink or alternate spelling. Do not crawl the entire computer to discover unknown projects.

The v6 implementation source defines `register_project`, `register_workspace` and `get_workspace_coordination`. Publication and exposure in the current client must be verified separately. Canonical paths stay in the private coordination service; omit them from public receipts when they disclose personal directories.

## Writer lease and shared resources

One active writer owns one exact worktree. Separate worktrees can support different Codex/Claude/Antigravity writers when scopes/interfaces/resources are independent. Keep one coordinator and one integrator per project. Read-only review can inspect the same pinned candidate without becoming another writer.

Discover these tool schemas before use:

- `acquire_workspace` binds request/workspace/run/task/revision/client/owner, a finite deadline and cumulative attempt budget, optionally host-scoped resources. Acquisition is atomic across the selected keys.
- Resource keys include ports, database paths, index paths and shared Git maintenance. Worktree isolation alone does not isolate them.
- `renew_workspace` needs the current lease ID, epoch and secret token. Hold the token only in protected runtime memory/config; never put it in Git, Obsidian, logs, chat summaries or cards.
- `release_workspace` requires actual stop evidence. Checkpoint source/state, stop owned writers and then release. Do not release just because a parent chat stopped while a child still writes.
- Expiry marks unresolved ownership; it never authorizes automatic takeover. `resolve_workspace_lease` requires the observed epoch, evidence the old writer stopped and a real user decision reference. A service receipt is still agent-reported unless the service independently verified the process.
- `authorize_task_resume` adds a reviewed finite allowance without erasing attempts and requires a user decision/reference. Release prior writers first. Do not renew task budgets by changing revision, client, run or host.

The implemented event schema may require `workspaceLease` proof for a bound run. Existing unregistered runs remain explicitly unprotected. Use server-returned IDs/version/epoch; a 409 requires reconciliation, never blind overwrite. Do not manufacture lease success if the Site/auth is unavailable: remain read-only or use an already authorized isolated alternative with explicit ownership evidence.

These are cooperative controls. A fencing token can reject stale service writes but cannot stop arbitrary OS file writes by an uninstrumented IDE. `git worktree lock` protects worktree metadata from prune/move/remove; it is not this writer lock. Stronger enforcement requires real runner/sandbox/file-permission isolation.

## Quota and crash handoff

Checkpoint at meaningful increments before quota exhaustion. Restore card/revision/AC, candidate SHA, relevant dirty snapshot, evidence, failure fingerprint, cumulative attempts, original run deadline, resources and exact next action. Record requested versus observed model. A switch to a VM does not create a new subscription allowance.

If the old model cannot respond, inspect actual processes and preserve unique files with an authorized tool. If its VM is inaccessible, later dirty state is UNKNOWN; continue only from a verified remote source in a separate workspace after resolving ownership. Never claim lost unsaved changes were recovered. Do not reset/clean/recreate the old workspace for convenience.

New workers verify checkpoint/readback and remaining budget before claiming ownership. Accept existing same-scope approval; ask only for a missing material choice or genuinely new scope. Independently review exact candidate behavior; cross-model agreement and passing compilation are not user acceptance.

## Triage and progress

Keep blocked cards in their original stage plus a separate Triage/Needs You view. Assign a triage owner, finite diagnosis deadline, failure history, next action and explicit unblock condition. Ask the user with concrete options only where a product/budget/account/resource decision remains. Resume the original card after the decision and real conditions are satisfied.

Heartbeat, active compute time, state age, last evidence and last GitHub checkpoint are distinct. Do not reset a no-progress clock with heartbeats or office animations. Full-product percentages require a complete approved versioned denominator and matching accepted evidence; partial recovery inventories remain UNKNOWN. A model completion event alone does not complete a feature.

## References

- https://git-scm.com/docs/git-worktree
- https://learn.chatgpt.com/docs/environments/git-worktrees
- https://code.claude.com/docs/en/common-workflows
- https://antigravity.google/docs/dynamic-workflows/
- https://github.com/obsidianmd/obsidian-skills
- https://help.obsidian.md/cli
- https://help.obsidian.md/headless
- https://help.obsidian.md/sync
- https://help.obsidian.md/Extending+Obsidian/Plugin+security

Checked 2026-11-22. Recheck client/version/auth before using changing integration features. The source-level v6 schema is not a claim that all external clients or project hosts are connected.
