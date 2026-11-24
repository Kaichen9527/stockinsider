# Scenario boundary

First read `scenario-routing.md`. This continuation contract applies to approved execution work; it must not turn planning, cleanup-only, rules-only or read-only review into whole-project development. A change scenario continues only its approved delta.

# Verify adoption and continue the approved queue

Use this for a rule upgrade, partial run or client/model handoff. Keep the existing product tracker and living memory as the authority; do not create another editable queue.

## Distribution, discovery and loaded context

1. Resolve the requested release from the supplied bundle or authorized shared source; pin its actual source commit once. A ZIP is a snapshot. Updating shared files does not copy them into existing project checkouts, other hosts or chats.
2. Read the target manifest/provenance and applicable instructions. Compare hashes against the selected project kit. Preserve custom rules and dirty/untracked work. Follow `install.md` and `project-kit.md`; matching version text alone is insufficient.
3. Obtain target writer ownership before adoption. The existing owner may upgrade its own worktree under valid ownership. A joining worker isolates first; a read-only reviewer reads external rules without installing into the writer's tree.
4. Preview, apply compatible changes, verify bytes, then explicitly read both updated skills and relevant continuation/concurrency references in this conversation. Rereading never overrides stricter project instructions.
5. Save a short receipt in the existing state entry: requested release/source, observed local hashes, adopted/merged/deferred, actual host/workspace, loaded-in-this-session timestamp, connection and ownership status. A custom merge records its own hashes. One receipt never proves all projects adopted.

Codex detects local Skill changes, while its AGENTS instruction chain is normally built at session start. Claude Code watches local Skill files, but an already invoked Skill body is a message in the conversation; explicitly reread/invoke it again. Antigravity rereads local rules/skills before turns. These mechanisms do not distribute remote updates, prove a particular session loaded them, or reload MCP configuration. Use supported reload controls only when needed; do not require blanket IDE restarts.

## Finite continuation frontier

Read the approved scope/revision and actual dependencies. Preserve task IDs, acceptance, attempts, failure fingerprints, deadlines, resources and remaining budget. In the existing tracker/memory identify:

- approved scope and completion criterion;
- current card and independent dependency-ready cards;
- blockers, exact owners and unblock conditions;
- original absolute stop time/budget and next durable checkpoint;
- the one coordinator/integrator and actual execution capability.

After each meaningful checkpoint, reconcile results and select the next executable card in the same scope. A finished analysis, child or command is not product acceptance. A child's partial result or max-turn limit returns control to the coordinator: inspect what remains and continue/reassign within the same cumulative budget. Reuse valid evidence for unchanged inputs.

One blocked card stops that card. Continue independent approved work, including useful light work while heavy-job disk gates are closed. Do not repeatedly audit the same facts to appear active. A material question affecting one frontier needs a decision packet while other work continues. Ask only for the unresolved consequential choice.

Before ending, record the remaining executable frontier and a truthful stop reason:

| Reason | Required evidence/action |
| --- | --- |
| `scope_done` | Approved acceptance matched; distinguish implementation, user acceptance and release. |
| `all_frontiers_blocked` | Every remaining frontier has a concrete blocker/owner/unblock condition; unreviewed backlog is not proof. |
| `budget_reached` | Original deadline, attempts, quota or storage boundary; checkpoint and exact next action. |
| `ownership_unresolved` | Actual conflicting or unknown writer/resource; preserve WIP, no automatic takeover. |
| `provider_or_runtime_error` | Observed platform/tool error and partial result; last verified checkpoint, later changes UNKNOWN. |
| `user_pause` | The user's actual stop/change instruction. |
| `assignment_done` | Worker/reviewer returned its assigned candidate; coordinator still advances overall work. |

If executable work and authorized runtime remain and no listed reason applies, continue instead of returning a final answer after one card. A checkpoint is a continuation point, not an automatic end. If the platform prevents another turn, report that limit. Never falsify a stop reason to satisfy an evaluator.

## Optional native Goal

Inspect actual client surface and existing Goal/runner first. Reuse a compatible Goal; do not replace it or stack a scheduler. With an already-authorized finite scope, a supported native Goal and no conflicting Goal, use the real facility when available. Otherwise work within this session and report the limitation. A prompt, Site card, Skill or MCP connection does not prove a Goal was created.

Keep the condition short (Codex and Claude document a 4,000-character limit); reference this contract and existing product state instead of prefixing the full bootstrap with `/goal`. Completion must mean accepted scope delivery **or** a verified allowed stop checkpoint, so impossible physical/provider/user gates do not create an endless loop. Preserve approvals, sandbox, original absolute deadlines, attempts and release gates. Antigravity's Goal has no documented iteration cap; use actual bounded commands and persisted budgets. Claude's built-in Goal counters/timer may reset on resume; the product ledger must not.

Suggested condition, only after actual adoption and scope verification:

```text
依本案已讀取的 project-delivery-resume 續作契約，完成目前已批准範圍內所有依賴就緒且本環境可執行的卡；每個 checkpoint 接下一張。達成條件是：範圍通過原驗收，或已依契約在真實阻塞／原預算／權限／使用者暫停處保存可接手 checkpoint，列出剩餘可行前沿、停止理由與下一動作。保留原 deadline、累計嘗試、單一 writer 與發布 gate；不新增範圍、不把子代理結束當產品完成。
```

Automatic cross-provider launch/quota failover needs real configured adapters, credentials and a durable dispatcher; this contract installs none. The next capable session reads the same checkpoint, verifies old writers/children stopped, restores original budgets, then obtains ownership. A service lease cannot stop an uninstrumented OS writer.

## Official references

Checked 2026-11-23; verify actual installed surface/version:

- https://learn.chatgpt.com/docs/build-skills
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
- https://learn.chatgpt.com/docs/long-running-work
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/goal
- https://code.claude.com/docs/en/sub-agents
- https://antigravity.google/docs/customization-discovery
- https://antigravity.google/docs/commands/goal/
