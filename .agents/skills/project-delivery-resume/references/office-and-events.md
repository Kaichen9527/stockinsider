# Office integration

The existing project tracker remains task authority. The Site displays it and accepts change requests/new demands. Until a request has a verified remote issue/revision receipt, label it unsynchronized. Never create a second independently editable copy of an existing task.

Events require schema_version, unique event_id, project/task/revision/scope, actual session/agent/role/run, type, occurred_at, received_at, optional candidate SHA/evidence pointer and a short redacted summary. Validate sizes, IDs, timestamps and known projects/revisions. Deduplicate event IDs; bound recent-event retention and persist useful aggregates/checkpoints. Never ship full transcripts, secrets or private raw data.

Office actors represent observed runs. Role stations without connected agents stay gray/unobserved. Missing hooks or unavailable Work Goal events mean unobserved, not active. Heartbeat only means a process reported; Stop/completed is not acceptance.

Display fresh/delayed/offline/unobserved, blocked, over-estimate and no-progress separately. Missing heartbeats do not revoke valid evidence; stale task-source sync makes current totals unknown while retaining dated last-known data. Use start/pause/resume/finish to compute active time and a monotonic runner clock; never grow active time forever after disconnection.

## Percentages

For complete approved scope, verified percentage = accepted criterion weights with matching evidence / all in-scope weights. Show user acceptance and release gates separately. Preserve scope/revision history; new demand changes the denominator only after approval. Unknown inventory is null. Small recovery-card completion is not full-product progress. Dragging a card does not create proof.

## Connection boundaries

- A Site may have D1 and MCP; its Worker cannot run Xcode/emulator/Codex/Claude/Antigravity CLI.
- Collect actual Codex App Server/SDK or Claude hook events from each execution environment. Verify installed version and permission. A Mac hook does not automatically exist in Cloud.
- Private service access is separate from visitor identity and connector consent. Keep tokens off browser/source; do not make a private Site public to connect a collector.
- Runner background checkpoints use authorized git/gh or a scoped GitHub App. Sites visitor connector writes require the interactive consent/action path; they are not an unattended GitHub sync daemon.
- A published Site's private plugin can expose tools to ChatGPT/Codex. Verify Claude MCP/auth separately or use the authenticated collector; do not claim automatic cross-product connection.

Integrate incrementally: persistent cards → one genuine run event → one verified criterion → stale/no-progress detection → verified remote checkpoint → additional projects only when authorized. Do not suspend product development to build a large autonomous management platform.

## Project office connection

Read the approved office endpoint and authentication configuration from the user's protected settings. Do not place private portfolio URLs, service tokens, unrelated inventories or other projects' connection receipts in this repository.

A published endpoint, installed Plugin or configuration entry does not prove this client is connected. Discover actual tools and make a read-only `get_portfolio` call; use only the selected project returned by it. Verify each client's HTTP MCP/OAuth independently. If tools or authentication are unavailable, preserve the same work through this project's GitHub authority and label synchronization pending. Never make a private office public to bypass authentication.

Deployment, source checks, host-hook installation and authenticated create/edit/drag/reload acceptance are separate receipts. Record only what was actually observed in this environment. Reading this kit does not install a collector, model API, background alert, dispatcher or Agent. Provider/client/model fields and motion effects do not certify work or product acceptance.

### Actual tools and sequence

Use each discovered tool's input schema. The generic event concepts above are not a literal payload for this implementation: the current tools use camelCase fields and the server supplies receipt time.

1. `get_portfolio` gives projects, cards, exact `taskRevision`, `snapshotVersion`, demands and observed activity. Use the returned IDs and versions without guessing. Source cards may include a local-audit suffix or snapshot version; HEAD alone is not a valid substitute.
2. `list_demands`, `create_demand` and `revise_demand` handle persistent local demands/change requests. `revise_demand` requires the observed `expectedRevision`. A dragged card or saved edit is not a GitHub write or acceptance receipt.
3. The sole authorized integrator applies an approved demand to the existing GitHub task authority using its own git/connector access, reads it back, then calls `ack_demand_sync` with the matching demand revision, real issue URL, source SHA and read time. This is an agent-reported receipt; the Site does not independently verify GitHub or run a background GitHub sync.
4. After actually reading the authoritative tracker, the integrator calls `sync_project_snapshot` with the observed `expectedVersion`, exact `sourceSha`, `readAt`, source, cards and complete/partial coverage. An optimistic version conflict requires reconciliation, not overwriting. The current implementation leaves full-product progress unknown; source ratios remain separately labelled.
5. `report_run_event` reports only a real run. Use the actual `eventId`, `projectId`, `runId`, `sessionId`, `agentId`, `roleId`, `taskId`, `taskRevision`, `provider`, `environment`, event type, increasing `sequence` and `occurredAt`. Send one true `task_started`; a `progress` event requires a legitimate GitHub evidence reference. Keep summaries small and redacted. A local result without a remote receipt can remain in the local ledger; do not fabricate an evidence URL.
6. A user can revise an active card. If the old run receives a revision-conflict 409, stop new work, save the unique checkpoint and send `run_ended` using its original identity/revision and increasing sequence. This exception only closes an existing matching historical run; other old-version events are rejected and the ending does not affect the new revision's progress. Resume the new revision only after impact review.

### Discussion and triage tools

The v4 implementation adds five tools. Discover them before use; an installed plugin or published endpoint is not proof that a particular client's tool list has refreshed. If unavailable, preserve the same discussion and decision in the existing GitHub state authority and report the Site sync as pending.

1. `get_discussion_queue({projectId})` returns actual demands, discussion gates and source cards needing triage. Over-estimate/no-evidence is a diagnostic signal, not proof of a hung process. The coordinator assigns a bounded Triage Agent; the Site does not awaken one.
2. `get_demand_discussion({demandId})` supplies the actual demand revision, thread version, full bounded discussion and client-specific discussion prompts. Source cards remain read-only; create a linked change request before changing their scope.
3. `append_demand_discussion` requires `entryId`, `demandId`, `expectedDemandRevision`, `expectedThreadVersion`, `kind` and `text`. Kinds are analysis, question, proposal, user_reply and decision. Proposals provide 2–3 options with `id`, `label`, `tradeoff`, `action` (resume/replan/defer) plus `recommendedOptionId`. A decision must reference the latest valid `proposalId` and `selectedOptionId`; when transcribed by an agent it also requires the actual user confirmation text and `confirmationRef`. Never turn an agent recommendation or silence into a user decision.
4. Save the approved requirement, material findings and decision through the existing GitHub authority, then genuinely read it back. `ack_discussion_sync` requires `entryId`, `demandId`, `expectedDemandRevision`, `expectedThreadVersion`, `decisionId`, `githubUrl`, `sourceSha`, `readAt` and `readbackSummary`. The URL must belong to this project's configured repository and be an issue/comment or a blob pinned to the matching 40-character SHA. The read time cannot predate the decision or current demand update. This is an agent-reported receipt; the Site does not independently access GitHub. `ack_demand_sync` alone cannot acknowledge a discussion decision.
5. `export_project_handoff({projectId})` returns that project's source identity, source-card projection, demands and discussion/decision/receipt history. Save it beside the existing state entry, not as a second task authority. Export is not proof of a remote backup. Keep each public repository free of other projects' private material.

`demand.revision` changes on edits, including column moves; `thread.version` changes on discussion entries/receipts. Read both before each write. A 409 requires reconciliation, not blind replay or force-overwrite. Same entry ID with identical business content is idempotent; reusing it for different content conflicts.

A phase-only drag keeps the user's same-scope decision; it requires a new matching GitHub readback for the current revision, not another human confirmation. Changes to title, detail, source binding, estimate or blocker, or a new analysis/question/reply/proposal, invalidate the old resume gate. Preserve history. Only the latest valid resume decision plus its matching receipt can return the card for the coordinator to claim. Replan/defer does not begin development. No decision starts a process automatically.

Discussion text is limited to 4,000 characters; a thread to 200 entries and 512 KiB; queue to 1,000 demands; project export to 100 demands and 4 MiB. On a limit, export and preserve history first; do not silently drop or rotate live records. `site_user` denotes a decision submitted on the page; `agent_reported` denotes transcription, with provenance shown. Users may discuss in any currently capable conversation after reading shared state; the original long chat is not required.

### Operational limits

The UI refreshes every 30 seconds while open. No 24-hour background alert service or collectors on project hosts were installed by publication. The Site cannot kill an old Goal or enforce host timeouts. Use the bounded runner only for commands it owns; preserve original Goal/runtime controls.

Recent raw events are capped at 100 per project. Durable run summaries preserve start, last evidence and ending beyond heartbeat retention, with at most 32 unfinished and the latest 50 ended runs per project. A limit rejection is a reconciliation signal, not permission to delete a live run or rotate IDs. No fake events were seeded. An office actor remains gray/unobserved until a real event arrives.

## v5 client-aware office contract

The v5 extension adds `antigravity` to provider and optional `client` / `model` metadata. Provider means reporting platform; client distinguishes codex_chat, codex_vm, claude, antigravity, human or other. Underlying model is separately reported, never inferred from provider. Historical events with absent metadata remain legacy/unknown, not rewritten as one client. Discover the actual deployed schema before sending new fields.

Actors are keyed per real agent/run, not only per role, so a reviewer and implementer from different clients remain distinguishable. Walking routes and meeting/QA/blocked stations are deterministic UI representations of reported states; they neither call a model nor prove literal agent-to-agent communication. The explicit local demo is isolated from persistence, events, acceptance and percentages; real mode starts unobserved without events. Pause/reduced-motion controls must remain available.

A dated partial recovery frontier is not a frozen full-product denominator. Keep scoped acceptance measures separate from whole-product completion. Do not refresh source observation dates merely because the UI is republished; record actual publication/version and connection receipts separately.

## v6 registry and coordination

Read `coordination-and-knowledge.md` for explicit project/workspace registration, same-worktree cooperative leases, finite attempts and knowledge authority. A dated partial recovery profile does not define whole-product scope. Discover the currently published tool schema and verify source/version plus client authentication before reporting a v6 connection. No registry or lease feature proves arbitrary IDE writes are physically blocked.