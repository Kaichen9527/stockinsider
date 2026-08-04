# Requirements Gate Review Round 43

Verdict: `CHANGES_REQUIRED`

Severity count: `P0=0 P1=2 P2=0`

Reviewer: fresh Sol xhigh session `019f7bdd-8833-73c3-b37e-3420a4fadaf6`

Immutable reviewed head: `d1701abfded5ffaacf8f7d80290fb3e74f20bc31`

Baseline: `12c131aa50ca53268878e9f025973533ac100c49`

Parent: `d07b9c35236d6e06a991449543ac6fb85640bb9d`

Root tree: `a55aae1c73c8e2b63d86690d3a852c3292a1bbfc`

Change subtree: `e98566bd265b87e48ea8ba0c9f42b4c4389401c9`

## Boundary proof

- The baseline is an ancestor of the reviewed head. `B..H` contains 58 first-parent commits, 58 total commits and zero merges.
- `P..H` contains exactly 14 paths under this Loop change directory: 13 modified files and new `requirements-review-round-42.md`.
- No implementation, App, migration, executable-test, secret, deployment or production path changed.
- The target subtree contains 87 files / 1,221,346 bytes. The active `GOV-004` corpus contains 34 artifacts / 841,883 bytes, all consumed in full.
- Status, tasks, gate summary and decision log honestly left Round 43 pending, Architecture Round 5 locked and implementation unstarted.

## P1 findings

### R43-001 — Durable runner records cannot satisfy their declared identity binding

`model-runner-contract.md` promised that every request, status, journal, reservation and attempt binds the exact runner identity. The request contained `modelRunnerIdentitySha256`, but the exhaustive status, reservation, operation-journal, resource-journal and attempt schemas omitted it; operation/resource key preimages omitted it as well. The attempt's required `protocol` member had no assigned literal. Unknown members are forbidden, so Terra could not satisfy both the promise and closed schemas. Pre-`prepared` records also had no request from which identity could be inferred.

Required repair: prescribe one byte-exact identity member across status, reservation, both journal families and attempt metadata; assign the attempt protocol; define validation/recovery and key-preimage rules; strengthen `MR3-024`, `MR3-026` and `GOV-004` for wrong/missing identity.

### R43-002 — The supposedly canonical cleanup diagnostic has no canonical bytes

The runner error object prescribed only `protocol,exit,code,message`, but no exact `message` value, grammar or finite mapping. Cleanup failure and `MR3-027` required canonical identical replay, yet independent implementations could choose different messages or include different primary-cause details.

Required repair: define the exact canonical cleanup-error object including message literal or a closed cause-to-message table, bounds/redaction and final LF; require byte-identical replay; strengthen `MR3-027` and close every other claimed-canonical runner diagnostic through the same oracle.

## Prior finding disposition

- `R42-001` resource-key reuse is behaviorally closed by immutable contiguous reservation ordinals, exclusive durable creation, no deletion/reuse and deterministic pre-`prepared` recovery; exact durable identity remained blocked by `R43-001`.
- `R42-002` competing exit precedence is behaviorally closed by the universal cleanup-failure override and retained primary/evidence; exact stderr remained blocked by `R43-002`.
- `R41-001`, `R41-002` and `R41-004` are closed. `R41-003` is behaviorally total but its canonical record/output authority remained subject to the two findings above.
- The approved isolation claim, host/codesign pins, custom profile, routing, source view, descriptor closure, sealed result, trusted Git, V1/V2 nonmutation and `ARC3-001` through `ARC3-004` remained coherent. No additional R1-R11/Safety or model-influence blocker was found.

## Reproduced acceptance/catalog evidence

- Acceptance `1.35.0`: declared/JSON/unique/Markdown/Markdown-unique `258/258/258/258/258`; exact ordered five-field parity; `MR3-001` through `MR3-027` each once; no skip/todo.
- Runtime tuple: 36 unique ASCII-sorted members.
- Runner identity: 18 unique ASCII-sorted members, 883 pre-LF bytes, SHA-256 `8051f3c60d96217f48a188af2f8f3ee5140dcc9c4296e953afa491cbd46d96ea`.
- Host fixture: unchanged blob `fe31b157126617fc36e47ff3b1d817382b825ec8`, 2,136 pre-LF / 2,137 file bytes, SHA-256 `70eb964ca9cfc22e237dc9b041ff8c53604db84992f9a6fb06d583de4a963387`.
- Closed catalogs: 19 manifest kinds, 11 adapters, seven authority families, 31 public RPCs and two private helpers.

`REQUIREMENTS_GATE_ROUND_43: CHANGES_REQUIRED`
