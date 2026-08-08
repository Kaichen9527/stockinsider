# Loop Engineering Requirements Gate — Round 25

## Verdict

**CHANGES_REQUIRED**

The requirements baseline is not closed. Three material P1 contradictions or omissions prevent executable, deterministic acceptance.

## Counts

- P0: **0**
- P1: **3**
- P2: **0**

PASS requires P0=0 and P1=0.

## Scope and frozen evidence

- Repository: `/Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider-source-led-v3`
- Branch: `codex/source-led-opportunity-engine-v3`
- Reviewer session: `019f7869-5f6d-7980-b8da-c0f5497c72f8`
- Model/reasoning: `gpt-5.6-sol`, `xhigh`
- Baseline and verified merge base: `12c131aa50ca53268878e9f025973533ac100c49`
- Reviewed HEAD: `e1bca197bf09f93202b4b8e69dbadb0889e3a542`
- Immutable range: `12c131aa50ca53268878e9f025973533ac100c49..e1bca197bf09f93202b4b8e69dbadb0889e3a542`
- Range size: 24 commits, 66 changed files, 5,024 insertions, no deletions.
- Reviewer token usage: 5,728,297 input, 35,518 output, 22,802 reasoning output.
- Final identity check confirmed the requested branch, HEAD, and merge base. Worktree was clean.
- Reviewed every changed path, including requirements, design, tasks, all contracts, acceptance JSON/Markdown, status/gate/baseline/impact records, decision log, and all prior review records without treating their verdicts as authority.
- Governing material reviewed: repository `AGENTS.md`, Loop guide, engineering guide, profile, policy, and constitution. The governing gate threshold is zero blocker/high findings.
- Static inspection only. No files were changed, no artifacts created, and no application code, tests, build, lint, network, migration, deployment, merge, or push was executed.

## Findings

### P1 — The six-route control contract does not define a total begin failure wire, precedence, or durable-state oracle

The POST grammar says a cutoff later than the database timestamp captured by `begin_opportunity_run_v3` is invalid, while the declared precedence places cutoff-schema validation before client acquisition and the begin call. That temporal comparison cannot be performed at the declared point. The runtime contract only says begin rejects the cutoff; it does not assign the rejection an exact returned value or SQLSTATE. The HTTP catalog maps only expected `data_integrity_failure` to 409 and leaves the future-cutoff branch unresolved.

This is observable on cron routes too: after the exchange close but before 16:00 Asia/Taipei, the current view can expose today as completed while returning a 16:00 canonical cutoff that is still later than database time. The subsequent begin must reject it, but its exact response, call count, and durable state are unspecified.

Created-begin bootstrap also has named failures such as `missing_source_run` and multiple matching upstream runs, but the control contract does not close their HTTP mapping and exact rollback/write state.

Affected authorities:

- `control-plane-contract.md:22` — POST grammar.
- `control-plane-contract.md:30` — precedence.
- `control-plane-contract.md:61` — error and call/write mapping.
- `runtime-transaction-contract.md:114` — begin semantics.
- `design.md:203` — upstream selection failures.
- `acceptance-tests.md:255` — `OPS-031`/`OPS-032`.

Concrete repair: distinguish lexical cutoff validation from database-time validation; define a closed begin error catalog for future cutoff and every upstream/bootstrap failure, with exact SQLSTATE or result discriminator, HTTP bytes, headers, call ordinal, and zero/atomic-write state. Define cron behavior before 16:00 explicitly, preferably by preventing the current view from returning a future canonical cutoff. Expand `OPS-031`/`OPS-032` with before/equal/after-16:00 and every named begin failure.

### P1 — Current cron session selection is not point-in-time coherent with the historical authority used by the resulting run

The current view resolves calendar streams at its statement timestamp but assigns each row a fixed 16:00 cutoff. Cron selects the current row and passes only that cutoff to begin. Historical consumers later re-resolve independently at the earlier cutoff.

Counterexample: a session is cancelled as of 16:00 and officially reactivated after 16:00. A later current-view read sees the reactivation and can select that session, but historical resolution at its returned 16:00 cutoff excludes the reactivation and sees it as cancelled. The opposite mismatch occurs for a late cancellation. The current row's `taiwanSessionAuthorityHash` is not passed to or atomically checked by begin.

Therefore correction/cancellation/reactivation authority can affect cron selection without entering the run's historical universe. Session date, authority hash, downstream observation eligibility, mover/audit roots, factor/sector windows, outcomes, evaluations, and final logical identities are not guaranteed to describe the same point-in-time authority.

Affected authorities:

- `trading-calendar-contract.md:20` — cutoff resolver.
- `trading-calendar-contract.md:40` — current view versus historical resolution.
- `trading-calendar-contract.md:42` — downstream authority propagation.
- `control-plane-contract.md:24` — cron selection.
- `acceptance-tests.md:257` — `CAL-001`/`CAL-002`.

Concrete repair: make every current-view row effective under the resolver at that row's own returned cutoff, and require `canonicalCutoff <= statement timestamp`; alternatively adopt a different server-owned cutoff consistently across all contracts. Bind or atomically revalidate the selected authority hash during begin. Add late cancellation/reactivation fixtures before, exactly at, and after canonical cutoff proving byte-identical view/begin session date and authority hash, plus correct later-run propagation without mutation of prior identities.

### P1 — The finite worker call table is not executable at the contracts' valid maximum payloads

The worker permits exactly one read bundle, capped at 5 MiB, for each read-bearing payload. But `source_connector_rows` must contain all normalized document, claim, and mention terminal rows for a connector. The data contract permits 200,000 claims and 1,000,000 mentions per connector. That valid maximum cannot fit in one 5 MiB response.

Likewise, parse jobs permit 2,000 claims and 10,000 mention tuples, while staging stores canonical and JSON representations within a combined 3 MiB envelope. No output-byte sharding rule ensures a valid maximum parse result fits. Outcome reads also name sector-benchmark rows without defining an exact bounded subset or aggregation even though a benchmark manifest may contain 5,000,000 evaluation rows.

Thus maximum workloads either fail solely because they are valid maxima or require untabled extra reads/shards. This contradicts `OPS-017`'s requirement that maximum workloads execute without truncation and prevents `OPS-029` from exhaustively exercising a real finite plan.

Affected authorities:

- `job-graph-contract.md:165` — one-read bundle and read bodies.
- `job-graph-contract.md:186` — payload call ordinals.
- `source-adapter-contract.md:66` — parse batching.
- `data-contract.md:220` — connector maxima.
- `runtime-transaction-contract.md:134` — resource envelopes.
- `manifest-storage-contract.md:28` — benchmark maximum.
- `acceptance-tests.md:221` — `OPS-017`.
- `acceptance-tests.md:249` — `OPS-029`.

Concrete repair: replace connector-summary raw-row reads with a database-computed, bounded accounting/conservation result backed by an exact normalized-row SQL oracle. Add database-owned output-byte sharding or smaller payload kinds for parse output. Define exact bounded subsets, preaggregates, or deterministic shards for outcome/evaluation benchmark reads. Amend the call table and failure ordinals, then exercise every maximum row/byte boundary in `OPS-017` and `OPS-029`.

## Round 24 closure status

1. **Six-route begin/status/cron control contract: NOT CLOSED.** The six routes, authentication split, canonical success objects, and major precedence branches now exist, but future-cutoff and named begin/bootstrap failures lack a total wire and call/write oracle. The cron-selected authority is also not coherently bound to begin.
2. **Official TWSE/TPEX point-in-time correction authority: NOT CLOSED.** Append-only streams, composite resolution, hashes, observation bindings, and downstream fields are specified. The current-view statement-time selection can nevertheless disagree with historical resolution at its returned cutoff, breaking cross-contract authority propagation.
3. **Finite worker database-call plan and executable ordinal coverage: NOT CLOSED.** The 15-payload call table and ordinal-failure language are present, but valid maximum payloads cannot satisfy its single-read and staging envelopes. `OPS-017` and `OPS-029` therefore do not have an executable oracle for all required cases.

## Acceptance inventory

- Change ID: `source-led-opportunity-engine-v3`
- Version: `1.24.0`
- Declared and parsed cases: **201**
- Unique IDs: **201**
- Every JSON case has exactly `id,requirement,layer,setup,expected`, with nonempty string values.
- Markdown rows: **201**
- JSON-to-Markdown semantic mirror: exact.
- JSON SHA-256: `030f99fde661c8343594057156ba2b2a3d84375e6f9d9a410af5497c31d30533`
- Markdown SHA-256: `8a70b02a56c272465775413b5ff6d7ac9536415166ce035b2571241baeefc503`

Case distribution: ACT 13, API 19, AUTH 5, CAL 2, CMP 1, CYC 2, ENT 16, EVAL 11, FIN 5, FNL 12, GOV 3, MIG 3, MKT 15, MOD 5, OPS 32, OUT 5, PEER 8, SCR 13, SEC 1, SRC 13, VAL 17.

The inventory is structurally consistent. Its material defect is semantic executability: `OPS-031`/`OPS-032`, `CAL-001`/`CAL-002`, `OPS-017`, and `OPS-029` claim closure that the normative contracts do not currently make observable.

## Gate consequence

The Round 25 Requirements Gate is blocked. The change must remain at requirements repair: close the three P1 findings, update the normative contracts and mirrored acceptance cases together, and undergo a fresh Requirements Gate over a newly frozen range. Architecture or implementation review cannot cure these requirement-level contradictions.
