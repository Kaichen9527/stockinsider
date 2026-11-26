# GPU batches and cross-model orchestration

This reference sets the operating policy and a bounded future integration direction. It does not install MetaGPT, LangGraph, provider SDKs, Colab adapters, or a background scheduler.

## Current policy and existing scope

For this named project's already approved GPU or coordination task, inherit existing scope, account access, and finite budget; proceed with authorized reversible preparation and ask only for missing consent or a consequential decision not already settled.

Read the selected project's active task and original memory. Preserve its existing scope, assets, sample-review requirements and release/data gates.
GPU availability does not authorize a new art direction, full-game replan, model training campaign, or replacement task tracker.
Use the storage skill's `references/cloud-assets.md` for asset manifests, separate capacity budgets, uploads, and protected originals.

## Verified service facts, not verified account state

Checked 2026-11-22: [Google's Taiwan AI Pro page](https://one.google.com/intl/zh-TW_tw/about/google-ai-plans/) lists 200 Colab compute units per month and 5 TB shared storage.
The user's reported subscription does not establish current compute-unit balance, free storage, GPU availability, or activated benefits.
Use the same Google Account and inspect Colab Settings > Subscription plus its actual resource/balance display. Do not purchase another Colab plan merely because the existing AI Pro entitlement has not been checked.
The [benefit restrictions](https://support.google.com/googleone/answer/16105039?hl=en) specify web access, age 18+, family-plan managers, no trial benefit, and eligible regions including Taiwan.
Keep Colab compute units separate from Gemini/Flow/Flow Music credits and API billing. Never convert an advertised allowance into a guaranteed number of images, clips, or GPU hours.
The [Colab FAQ](https://research.google.com/colaboratory/faq.html) describes dynamic hardware/runtime limits and disposable VMs; paid access does not guarantee a GPU type, VRAM amount, persistent runtime, or uninterrupted background execution.
Do not infer Pro+ background capabilities from an AI Pro subscription. Recheck the actual plan and session capability before depending on them.
Free managed runtimes without positive compute balance restrict SSH/remote desktops and primarily bypassing notebooks through WebUIs. Paid access with positive balance relaxes those restrictions, while general managed-runtime prohibitions still apply.
Default to a finite notebook job. Do not implement keepalive, account rotation, or reconnection loops to evade quotas, or treat Colab as an always-on IDE/file-hosting service.

## Execute one finite, measurable batch

Pin the original task/revision/acceptance, code/notebook SHA, input asset manifest, model/dependency versions, seed/parameters, output count, and remaining time/cost/storage budget.
Inspect the actual allocated GPU and VRAM, RAM, scratch free space, dependencies, and compute-unit balance. Keep UNKNOWN distinct from PASS; do not repeatedly reconnect to hunt for a preferred GPU.
Run one representative small sample within the existing budget. Measure elapsed time, GPU/VRAM peak, scratch peak, output bytes, and observable compute-unit consumption before sizing the remaining batch.
Prefer the existing approved pipeline and assets. Start only the roles and accelerator needed for this slice; CPU work does not require leaving a GPU allocated.
Stage selected inputs in owned local scratch and emit outputs in a distinct run directory. Protect immutable originals and isolate each writer's mutable outputs.
Bound image count, frames/clip duration, audio duration, logs, intermediate size, wall time, and retries. Apply stricter original limits; switching host/model cannot reset attempts or extend deadlines.
Finish a useful slice, save it, then select the next dependency-ready slice inside the same approved scope. Stop at the existing resource limit or a concrete blocker, not merely because setup finished.

## Save material checkpoints and resume honestly

At each meaningful boundary, save useful output/checkpoint files to the declared asset store and verify their identities before updating the original task record.
Record completed item IDs, input/model/config identity, durable file IDs/hashes, rejected results, cumulative attempts and spend, remaining budget, and the exact next item.
Persist small code/config/state changes through the original authorized GitHub branch and verify the remote SHA. Keep large binary checkpoints outside ordinary Git history.
A saved notebook is not saved VM memory, installed dependencies, RNG/training state, or generated files. Claim resumability only for state the actual pipeline exports and restores.
If a pipeline cannot resume within an item, make each item fit the bounded run; restart only that incomplete item with the existing attempt ledger.
On quota exhaustion or interruption, keep unverified results `checkpoint_pending`; retain the unique workspace where reachable and mark unseen changes UNKNOWN.
Review candidates against their original acceptance criteria before adoption. The integrator alone promotes accepted asset versions and updates shared memory; GPU completion is not product acceptance.
Stop owned GPU jobs and release the runtime when done. Emit Site events only through an actually connected reporter, with observed work and artifacts.

## Apply MetaGPT-style roles as an SOP now

Use MetaGPT's role/SOP idea as a collaboration pattern, not as a claim that its framework is installed or controls Codex, Claude, or Antigravity.
The coordinator selects an approved ready task and writes a compact contract: inputs, owned outputs, acceptance, budget, checkpoint, and next owner.
The implementer or GPU worker produces the bounded candidate; the reviewer checks the exact candidate independently; one integrator owns shared tracker/memory and accepted-source updates.
The same model may perform multiple sequential roles when appropriate. Extra agents must have useful independent work; agreement between models is not verification.
Keep existing task IDs, decisions, and state authority. Do not run another product/specification cycle for a half-finished project whose scope is already approved.
Source: [MetaGPT official role/SOP description](https://github.com/FoundationAgents/MetaGPT/blob/main/README.md).

## Revalidate real ownership across every handoff

Before any write or side-effecting resumed operation, revalidate actual host, resolved path, source/candidate identity, live writer and child processes, current lease, and shared-resource claims.
Same-host parent/child directory overlap is a conflict as well as equal paths. Independent worktrees still require separate mutable outputs and non-conflicting shared resources.
A persisted coordinator state or expired lease does not stop an old process. Confirm the old writer stopped, preserve WIP, and obtain current ownership before continuing.
Where the deployed schema supports a genuine normal handoff, retain the same task/revision/deadline and use its checkpoint-backed continuation mechanism; failures keep their cumulative retry cost.
Use distinct stable host identities for actual Mac, VM, and Colab runtimes. Reconnection must reconcile prior runs and durable outputs instead of rotating identities to escape a conflict or budget.
Site leases govern cooperating reporters, not arbitrary filesystem writes. If an adapter is absent, use the existing authorized single-writer handoff and report the missing enforcement accurately.

## Future: a thin LangGraph coordinator with explicit adapters

The intended next layer is a small state machine around the current SOP, not a second tracker or a new product framework.
Keep only task/revision, dependency state, candidate/artifact pointers, operation IDs, cumulative attempts/spend/deadline, and actual ownership observations in its state.
Use a durable checkpointer with bounded retention; an in-memory saver is insufficient for process restart. Revalidate external state and leases after restore before any side effect.
Make side effects idempotent and inspect the same operation ID after unknown results. Graph replay must not duplicate GPU jobs, uploads, commits, purchases, or deployments.
Retain existing human/product/release gates and prior authorization. A human pause is for a real missing decision, not a new confirmation on every transition.
Integrate each provider only through its actually available authorized SDK, CLI, or API adapter; map capabilities and errors explicitly and preserve host-specific credentials outside saved graph state.
No installed adapter, cross-provider session access, quota auto-switch, webhook, daemon, or live Site telemetry is implied by this design. Prove one bounded start-to-checkpoint-to-handoff run before claiming integration.
Source: [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence). Framework behavior was checked on 2026-11-22; inspect the pinned implementation before setup.
