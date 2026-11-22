# Lifecycle, discussion and triage

## New project

Start from the user's observable goal and primary journeys. Ask the smallest useful group of questions about scope, actors, platforms, data, external services, design and release. Use grill-me/to-spec/to-tickets only if available and appropriate; their names do not imply invocation. Produce a finite versioned spec with acceptance IDs, non-goals, dependencies and required live-provider/device checks. Confirm meaningful choices before coding. Each card owns one observable vertical slice, its interfaces, files, estimate range, runner budget, independent QA and evidence definition. UIUX is a stage where needed, not a mandatory delay for every backend task.

## Resume an existing product

Limit reconnaissance normally to 10–20 minutes; retain project-specific budgets. Read the current tracker/memory and relevant actual code, not every historical log. Protect dirty/untracked work and identify the actual host and live owner. Report:

1. Source/candidate/task version and what has actually passed.
2. Remaining approved scope, changed demands and unknowns.
3. Next dependency-ready slice, relevant roles and estimate.
4. Intended host/model, resource limits and remote-save status.
5. One concise proposal for the user to confirm.

The user requested this review-and-confirm step for a fresh half-project takeover. Do all useful read-only work first. An explicit approval already given for the same concrete scope satisfies it; avoid another confirmation every message/card. After approval continue the finite DAG until delivered, all frontiers are specifically blocked, or the authorized run budget ends with a recoverable checkpoint. If new task splitting is needed, split only the remainder or affected delta, preserving original IDs/AC and accepted evidence.

## New demand discussion

The Site is a durable inbox and decision surface. Without a running model session or an explicitly configured trigger it cannot ask questions automatically. Discuss in any current capable client; there is no requirement to return to the original stale conversation. Load the task/spec/version first. Ask about ambiguous outcomes rather than silently choosing the product behavior.

Save the user's words or a concise agreed summary, open questions, options/tradeoffs, recommendation, selected option, affected AC/dependencies, revision and conversation/reference provenance. Mark agent-transcribed user decisions as transcribed, not Site-independently verified. Do not invent a user approval. Apply the agreed delta to the authoritative tracker, save GitHub readback, then refresh the Site projection. New ideas outside the current release remain New Demand until selected.

## Blocked-card triage

The coordinator owns this responsibility even if no separate subagent facility exists. Activate a specialist triage role only when needed. A warning can arise from missing heartbeat, excessive active time without new evidence, repeated same-cause failure, unavailable dependency, disk/network/auth, or an explicit product question. Heartbeat alone is not progress, and external wait is not active coding time.

First stop new retries for that item, checkpoint owned work and preserve its original stage. Take one bounded diagnostic pass (initial recommendation 15–30 minutes, existing stricter policy wins). Prepare a decision packet:

- Card/revision and expected user-visible result.
- Last valid evidence, actual failure signature and environment.
- Elapsed active/wait time and cumulative attempts across clients.
- What was tried, what was disproved and what is still unknown.
- Two or three feasible actions, recommendation, cost/time/data impact.
- A clear owner for the missing action and the condition for resuming.

Fix unambiguous, reversible defects already within the approved scope when possible. Ask the user for the remaining consequential choice or missing account/device input. Do not relabel external waits as code bugs, weaken assertions, fabricate credentials, increase attempt budgets or introduce a new paid API just to make the card move.

Return the task to ready after the user's applicable decision, original-tracker update, matching GitHub receipt, live dependency/resource checks and ownership transfer. Approval by itself does not create free disk, credentials, a simulator or a passing test. Preserve attempts. The coordinator, not a drag operation, starts the next real run. Continue independent ready cards while awaiting this decision.

## Version discipline

Changing an active card creates a new revision and impact review. The old runner checkpoints and closes its own run; it must not count old evidence against new AC. Retain valid unaffected evidence with provenance. New discussion that changes a confirmed proposal needs a fresh decision/version; an old GitHub sync receipt cannot approve new content. A report of completion is not card acceptance or release.
