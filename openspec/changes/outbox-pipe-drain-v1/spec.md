# Outbox PostgreSQL harness pipe completion

## Problem and scope

GitHub PR315 product-runtime run37782830390/job113329983656 reported the second racing psql process failed, but its captured stderr was empty. The harness currently resolves on child `exit`; Node can emit remaining inherited-pipe data before `close`. This is a harness hypothesis consistent with the log, not proof of a production SQL defect.

Change only test-support process collection and its real-PG caller. All existing database race ordering, accepted/rejected receipts, row counts, status and error-message assertions remain unchanged. No migration, production runtime, authority or CI expectation change.

## Required behavior

- Return collected exit code/signal/stdout/stderr only after `close`, including data received after `exit`.
- A spawn or stream error rejects; install error handling before stream validation, including absent-stream failed spawns. A null exit code is never converted to zero.
- Bound each stream to64KiB and total wait to30seconds. On violation, reject, terminate only the original live child handle with a positive safe PID using SIGKILL and destroy its pipes, and never report success. After leader exit do not signal an old PID; keep the bounded drain deadline.
- Timer completion and process events cannot settle twice. Normal completion clears the timer. Use a monotonic elapsed deadline and recheck it on close so a delayed timer cannot admit a late successful result.
- Caller attaches rejection handling immediately before the PgSleep barrier and cancels outstanding collections on any barrier or later failure.
- Preserve complete error diagnostics within the cap and keep SQL assertions meaningful. Exceeding cap/deadline is an explicit harness failure.

## Acceptance

1. Reproduce old collection returning empty stderr when a controlled child exits before its inherited stderr pipe closes; repaired collection returns the subsequent diagnostic and original nonzero exit.
2. Real child stdout/stderr and nonzero/normal exit preserved; spawn error, null signal exit, stream overflow and deadline fail explicitly.
3. Deterministic clock/event probes reject late close and never kill a leader that already exited; immediate completion leaves no running timeout.
4. Existing real PostgreSQL outbox race suite passes without changed expectations or skips in the VM. Node tests that do not need PG run even when PG tools are unavailable.
5. Independent review of exact successor; preserve first failing CI log and red/green results. No repeat of unchanged CI as a substitute for repair.

## Execution

Root owns the helper, existing test file, this spec, and a scoped receipt/handoff (at most five files). VM executes actual PostgreSQL regression in its single-heavy-job queue. Local work is lightweight process testing. This does not repair the separate protected evidence graph or authorize deployment.
