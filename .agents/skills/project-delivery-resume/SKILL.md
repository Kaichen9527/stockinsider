---
name: project-delivery-resume
description: 規劃新專案、接手半成品、處理新需求與卡點並收尾交付；協調 Codex Chat、Codex VM、Claude、Antigravity，以 GitHub 交接、真實進度與有限重試完成工作。Use for intake, resumption, change, triage, closeout and cross-agent handoffs in this project.
---

# 專案續作與交付

Continue the approved finite product scope toward executable delivery. A ticket is the unit of progress, not a reason to stop after one ticket. Reuse existing requirements, code, tools, tracker and valid evidence. Do not turn recovery into another framework rollout or endless audit.

## Choose the lifecycle and actual client

Read `references/lifecycle-and-decisions.md` for new-project intake, existing-project resumption, new demands, blocked-card triage and closeout. Read `references/clients-and-cloud.md` to distinguish Codex Chat, Codex VM, Claude Code/chat and Antigravity App/CLI/IDE/managed remote. Read `references/antigravity.md` for its actual discovery, hooks and remote limits. A prompt or installed skill does not provide missing tools, credentials, a VM, a scheduler or cross-provider conversation access.

- New project: discuss concrete user journeys, constraints and observable acceptance; synthesize a finite specification, confirm the consequential choices, then create dependency-linked vertical cards and execute.
- Half-finished project: inspect the current frontier, show the user what is done, what remains and the proposed next scope/runtime, then obtain the requested one-time resumption confirmation. Reuse an explicit confirmation already given for that same proposal. Do not re-interview the entire approved product or ask again before every card.
- New demand: discuss in the current capable Codex/Claude/Antigravity/dot session, not necessarily the original old conversation. Preserve question, user answer, decision and source reference; revise only affected requirements/cards. A Site entry alone does not invoke a model.
- Blocked task: the coordinator assigns a bounded triage role to diagnose and prepare an actionable decision packet. Ask the user where a product, budget, credential, resource or destructive choice remains; do not guess. Preserve stage, evidence and cumulative attempts, then return to the ready queue only after the applicable decision and actual unblock conditions are satisfied.

Prefer capable Codex VM, then isolated Contabo for portable work; use a suitable Mac for iOS platform gates. Preserve unique WIP, checkpoints, attempts, research clocks and release/data/financial gates across moves. Refresh disk evidence before heavy work. A planned 1 TB disk is not a verified mount; read `references/external-disk.md` and keep internal/external peak plus reserve separate. Apply `project-storage-guard` for bounded inventory, output budgets and protected retention; use this skill's existing runner, not a second implementation.

## Establish the continuation point

1. Identify the project from the actual repo and user instruction. Read the selected dated profile in `references/project.md`. A profile is orientation, not proof of current local state.
2. Read applicable AGENTS/CLAUDE, the existing current-state entry, active spec and next dependency-ready task. Read short current sections and relevant source; do not reload entire historical logs or repeat approved grill/spec/tickets.
3. Verify actual branch, HEAD, dirty/untracked files, remote head and runtime capabilities. Preserve dirty work. Never reset, clean, force-push, migrate data or recreate a VM merely to match a historical profile. An inaccessible Mac is UNKNOWN, not a completed audit.
4. Resolve stale documents against actual versioned tasks/source/evidence and approved decisions. A later timestamp alone does not grant authorization. Preserve explicit platform, release, financial and data constraints. Do not reopen finished work because an older PR description is stale.
5. Normally limit initial resume inventory to 10–20 minutes. Record a specific inaccessible fact and advance independent authorized work. Do not spend another session collecting context without a next action.

Use the existing state authority specified by `references/project.md`. Do not create a competing HANDOFF if a designated memory entry already owns current state. A short handoff may point to the existing tracker. Only one integrator writes common state.

Read `references/coordination-and-knowledge.md` for independent shared policy, Obsidian knowledge and cross-client ownership. Keep this product's state in its own repo and established authority. Do not store portfolio-wide state in a product repo or copy other projects' profiles into this kit.

## Select and advance finite work

Choose an approved, dependency-ready vertical slice yielding an observable user action. Pin task/revision/scope, base SHA, writer, owned files, runtime, acceptance IDs, estimate range, command deadlines and checkpoint. Read `references/execution-contract.md`.

Use planning skills only for an actual gap or new demand. New ideas enter New Demand. Editing an active task creates a revision and impact review; preserve unaffected work and cumulative attempts. Ask only genuinely missing consequential questions.

After a checkpoint choose the next ready task. Continue until the finite scope is delivered, all executable frontiers are blocked, or the authorized session/run budget ends with durable state. A local blocker stops that item, not all independent work. Do not silently extend an expired work window or claim ordinary prose started a Goal/daemon.

## Assign roles and ownership

- Coordinator: task selection, dependencies, leases, shared state and integration.
- UIUX: relevant screens/interactions/loading/error/empty states when needed; reuse approved designs and skip for nonvisual work.
- Frontend/native and backend implementers: disjoint files with a pinned interface. Start with at most two independent writers per project; preserve stricter rules and one heavy job per resource-constrained host.
- Reviewer/QA: independently inspect the exact candidate against existing criteria. A different Codex/Claude/Antigravity session is useful; cross-model agreement alone proves nothing.
- Release integrator: reproducible candidate, required integration gates and an actual preview/APK/iOS test build under current merge/deploy authority.

Activate only needed roles. Do not keep eight expensive agents running or stack multiple schedulers on one worker. Pin worktree base explicitly; do not assume it equals parent HEAD. Do not enable experimental teams to repair a blocked workflow.

Allow one writer per actual worktree. Separate worktrees may run independent scoped work with separate shared resources. Register stable host/path identity and use a cooperative lease where implemented; discover the actual schema first. Expiry or a silent heartbeat does not prove the old writer stopped. Preserve/checkpoint the unique state and confirm that process stopped before an explicit lease resolution. Site fencing cannot prevent an uninstrumented IDE from editing files.

## Bound execution mechanically

Read `references/runner.md` before `scripts/bounded_run.py`. Use it only for newly owned commands, with actual project disk/budget values. It does not stop existing Goal/Claude/Codex sessions or cap all token usage. Use real platform controls when available and report missing controls.

- Classify failures as code, environment, auth/provider, disk, dependency, tool/runtime or unobserved. Escalating models only addresses reasoning problems.
- An unknown-result create/deploy call is not a confirmed failure. Inspect the same operation/task ID before any retry; avoid duplicate workers or charges. After bounded Cloud diagnosis, preserve and relay instead of provisioning repeatedly. A new client, host or hook never renews an expired attempt budget. Observability hooks must not force execution to continue.
- Never rerun an unchanged failure. First diagnose and record a real new input/correction. Two same-cause failures stop that item unless an applicable existing policy specifies a reviewed finite continuation.
- Preserve counts across chats/models/worktrees and nominal revisions. Do not rename a task or reset a ledger to obtain more attempts.
- Reuse valid evidence for unchanged inputs. Run focused checks for focused changes; broader integration belongs to a fixed candidate at a meaningful integration point.
- Do not edit build inputs during candidate capture. Bind evidence to source/dirty-tree, dependencies, environment, fixture and artifact identity.
- Preserve assertions and acceptance. Mock/compile/HTTP200/tool-complete/token growth do not prove a whole user journey. Existing required release gates remain.

## Show progress from evidence

Use the existing tracker as authority; the office is its view and change-request inbox. Read `references/office-and-events.md` when connecting it.

Stages: New Demand → Backlog → Plan → UIUX(optional) → Developing → QA/Integration → Ready for User → Test by User → Done. Blocked/Waiting retain their stage and appear in a distinct Triage/Needs You view, never silently back in Backlog. Assign a triage owner, exact blocker and next action. Technical tasks can finish on their agreed internal gate; actual user/release acceptance remains explicit.

Separate active time, external wait, state age, heartbeat and last evidence-backed progress. Heartbeats do not advance progress or reset no-progress timers. Warn at the upper estimate; investigate beyond 1.5× with no meaningful progress. Command/run hard deadlines are separate and enforced by runner/watchdog.

Calculate full-product percentages only from complete, frozen, versioned scope and accepted matching evidence. Show implementation-verified, user-accepted and released separately. Unknown baseline or stale source sync means UNKNOWN; show dated last-known values separately. A few recovery cards cannot be the full-product denominator. A completed agent event never closes a feature by itself.

## Checkpoint and relay

GitHub is the user's final recovery authority for source, specifications, decisions, short handoff, rejected hypotheses, attempt summaries, environment recipes and artifact manifests. Read `references/github-recovery.md`. A Site database, local chat, saved VM or ZIP is not the sole final state. Save a remote checkpoint before switching client/host and after each meaningful slice; remote readback must match the intended source and state.

At an observable increment, useful diagnosis, handoff or interruption:

1. Save relevant source and short state. Stage owned files only; exclude secrets, keystores, user/research databases, bulky output and unrelated changes.
2. Commit on the authorized work branch; label incomplete work honestly. Push when authorized and verify the remote SHA. Local commit, remote checkpoint, built candidate, verified feature and released App are distinct states.
3. Update the existing live state entry with task/revision/scope, branch/SHA, candidate/evidence, rejected hypotheses, attempts, owned live processes, blocker/unblock condition, runtime and exact next action. Link long history instead of copying it.
4. If remote save fails, mark checkpoint_pending, retain the unique workspace and use bounded retries. Do not wipe it or claim safe cross-VM handoff.
5. Confirm owned write processes have stopped, then release ownership. A quota-exhausted model may not provide a final reply: preserve the last verified remote checkpoint and mark later unseen changes UNKNOWN. The next model restores the same attempts/deadline and verifies state before becoming writer. Only the integrator updates common files and integrates reviewed work.

Read `references/runtime-model-storage.md` for runtime/model/artifact policy. Do not auto-migrate projects or assume Linux proves an iOS build. Record requested and observed model; recommend manual switching when no real switching capability exists.

## Deliver

Report what the user can now do, where to open/install it, candidate/version, exercised behavior, remaining blockers and next ready task. Distinguish local preview, staging, signed distribution and production. Continue internal work while genuine external release gates remain open; never remove those gates to claim completion.

## Install and references

Read `references/install.md` for per-repo/Claude/Antigravity adoption. Personal installation is not installation on any project host or VM. Copy only the selected project profile to a target repo; never leak the private portfolio catalog into public repositories. Read `references/sources.md` for origins and recheck changing tool/model details before actual setup.

For this portable distribution, read `references/project-kit.md`. It uses a versioned common core and contains only the selected project's profile plus four client prompts. Each prompt covers new, resume, change, triage and closeout. ZIPs are transport snapshots; update the versioned GitHub files and readback receipts, not a growing pile of renamed ZIPs. GitHub support-branch publication is distinct from adoption on an active work branch.

Project entry point: [Selected project profile](references/project.md). This distribution contains only this project. Do not infer other projects' state or permissions from it.