# Clients, environments and one owner

Checked 2026-11-22. Use observed capabilities, not product-name assumptions. For native client authentication and existing-writer repair, read `client-connection.md`; a Claude session does not need the Codex CLI to register or report to a supported MCP server.

| Entry | Appropriate work | Required checks |
| --- | --- | --- |
| Codex Chat | Discuss, scope, triage, review, read/write authorized connectors and delegate when available | Verify actual shell/Mac/GitHub/Site/Cloud tools; a chat label alone proves none |
| Codex VM | Portable implementation, bounded builds/tests, candidates and checkpoint | Verify environment identity, head/dirty, repo access, dependencies, disk/RAM, network and prior owner |
| Claude Code on suitable host | Read project files, implement, test, invoke repo skill and optional MCP/hooks | Verify CLI version/auth and actual filesystem; current token and tools are host-specific |
| Claude chat without a coding environment | Requirements, decisions, review and drafting | Do not claim local git, test, background worker or deployment execution without real tools |
| Antigravity App / CLI / IDE on local or SSH host | Use the same repo Skill for coordination, implementation and review | Verify actual host, model, tools, subagent tool names, MCP and hooks; see `antigravity.md` |
| Antigravity Google-managed remote | Work on attached, authorized repository resources | Local MCP/plugins/skills are not inherited; verify remote rules and telemetry separately |
| dot | Optional portfolio discussion/triage coordinator and supported delegated Cloud tasks | Attach exact project sources; delegated work still consumes its product usage; do not assume all old conversations are imported |

Switch through GitHub source/state and artifact references. One task/revision has one execution owner; a second client reviews or handles disjoint files. Record source HEAD, dirty snapshot, candidate, decision, failed hypotheses, attempts, clocks, resource budget and next action. Release ownership only after a remote checkpoint or an explicit unresolved-preservation handoff. No provider guarantees cross-provider conversation teleport.

## Cloud-first placement

The user now prefers Codex VM, then Contabo for portable work. Treat that preference as authorized; do not repeatedly ask for it. First protect the existing source/WIP and unique candidates, record versioned state/attempts/budget, stop or release the previous owner and restore into an isolated development workspace. Do not overwrite production, delete the only VM, assume all data is in Git or reset research clocks.

Use a real Mac for Xcode/iOS signing/simulator/device-specific work. Linux can do portable/Web/backend/API checks only. Android Gradle/JVM can use Linux; a hardware-accelerated emulator needs actual capability. Contabo's standard VPS documentation says nested virtualization is unsupported; do not assume a usable KVM emulator there. Missing platform capability blocks that test, not all portable tasks.

Colab is an optional short, checkpointed notebook/GPU experiment host, not the durable general development owner. Managed runtimes can disconnect and have limits. Paid plans do not promise permanent capacity. Consult current official rules for remote shell/Web UI use rather than applying an overbroad blanket rule. Never keep a runtime alive artificially.

## Codex VM failure procedure

1. Read actual task/runtime status and own process state; distinguish startup/auth/network/resource failure from a started failing test.
2. Use one bounded probe for the relevant dependency; record timeout and exit status. Do not endlessly re-provision or reinstall the same environment.
3. Checkpoint to GitHub as soon as useful state exists. Save bootstrap instructions and lockfiles; keep secrets in the host's secret mechanism.
4. If the original VM can still be read, preserve unique WIP/candidates before moving. If inaccessible, state exactly what the last remote checkpoint lacks; do not call recovery complete.
5. Restore the verified branch/commit into a capable isolated host. Rehydrate only necessary artifacts and reconcile cumulative attempts/owner before execution. Run a focused sanity check before heavy work.

Use `scripts/delivery_preflight.py` for a bounded read-only Git/disk/tool summary. It does not authorize migration, create a VM, estimate build peaks or prove simulator/provider access. Use `scripts/bounded_run.py` only for new commands the runner owns, with the exact project reserve and a persistent ledger.

## Actual Cloud evidence and bounded fallback

Current official defaults (2026-11-22) list Pro/Business/Enterprise tasks at 4 vCPU, 16 GiB RAM and 32 GiB disk; saved state is recoverable by default for up to seven days after the last turn start or task resume. Measure the actual environment and keep source checkpoints; a month-old VM is not a durable artifact store. Repository Skills are available in Cloud, while personal local Skills are not synced.

Primary Cloud issue reports include #58187 (2026-10-29: no usable execution environment), #60832 (2026-11-11: task creation timeout without returned task ID), and #61064 (2026-11-12: resume 503 followed by original workspace absent at the observed location). They establish reported incidents, not the root cause or prevalence in these projects. Distinguish service outage, task startup, auth/network, capacity/quota, toolchain, actual test failure and long legitimate execution. Check the official status and actual failing operation before attributing fault.

A create/resume/deploy result can be unknown. Inspect the same operation and task ID first, never blindly submit another worker. One bounded diagnosis and one evidence-based recovery attempt are a starting ceiling unless the project has a stricter rule. If still incapable, preserve the latest accessible work and use the already authorized isolated fallback; do not keep provisioning. If unique work is inaccessible, record the recovery gap and avoid deleting the original.

Sources: https://learn.chatgpt.com/docs/environments/cloud-environments ; https://github.com/openai/codex/issues/58187 ; https://github.com/openai/codex/issues/60832 ; https://github.com/openai/codex/issues/61064 .
